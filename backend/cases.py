"""
Local case store. A case owns exactly one original evidence file, stored as
the uploaded bytes (never decoded-and-resaved, never EXIF-transposed) and
marked read-only. Results and artifacts live inside the owning case's
directory and are indexed by random IDs.
"""
import hashlib
import io
import json
import re
import shutil
import threading
import warnings
from datetime import datetime, timezone

from PIL import Image

from analysis import hash_verification

from .storage import (CASES_DIR, EXAMPLES_DIR, SAMPLE_IMAGE, StorageError, case_dir,
                      ensure_dirs, inside_root, make_writable, new_id, read_json,
                      valid_id, write_bytes_readonly, write_json)

MAX_UPLOAD_BYTES = 25 * 1024 * 1024
MAX_PIXELS = 40_000_000
ALLOWED_EXT = {".jpg": "JPEG", ".jpeg": "JPEG", ".png": "PNG"}
FORMAT_EXT = {"JPEG": ".jpg", "PNG": ".png"}
FORMAT_MIME = {"JPEG": "image/jpeg", "PNG": "image/png"}
MAX_REFERENCES = 12
MAX_REGIONS = 50
LIMITS = {"title": 200, "description": 2000, "notes": 20000, "result_note": 4000, "region_label": 200}

# Map each gallery tab to the registry techniques that target that edit.
TAB_TECHNIQUES = {
    "ELA": ["ela"], "JPEG": ["jpeg_ghost", "double_jpeg", "quantization"],
    "Noise": ["noise"], "PRNU": ["prnu"], "Copy-Move": ["copy_move"],
    "Resampling": ["resampling"], "Histogram": ["histogram"],
    "Steganography": ["steganography"], "Metadata": ["metadata"],
}


class UploadError(ValueError):
    pass


def now_utc():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def clean_name(name, default="upload"):
    """Display label only: basename, printable, bounded. Never used as a path."""
    name = str(name or "").replace("\\", "/").rsplit("/", 1)[-1]
    name = re.sub(r"[\x00-\x1f\x7f]", "", name).strip()[:120]
    return name or default


def inspect_image(data, filename=None):
    """Validate an upload. Returns {format, width, height, mode}; raises UploadError."""
    if not data:
        raise UploadError("empty file")
    if len(data) > MAX_UPLOAD_BYTES:
        raise UploadError(f"file is larger than {MAX_UPLOAD_BYTES // (1024 * 1024)} MB")
    if data[:3] == b"\xff\xd8\xff":
        magic = "JPEG"
    elif data[:8] == b"\x89PNG\r\n\x1a\n":
        magic = "PNG"
    else:
        raise UploadError("only JPEG and PNG files are accepted (file signature not recognised)")
    if filename:
        ext = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
        if ext and ext not in ALLOWED_EXT:
            raise UploadError(f"extension {ext!r} not accepted; use .jpg, .jpeg or .png")
        if ext and ALLOWED_EXT[ext] != magic:
            raise UploadError(f"file extension {ext!r} does not match its {magic} content")
    old = Image.MAX_IMAGE_PIXELS
    try:
        Image.MAX_IMAGE_PIXELS = MAX_PIXELS
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(data)) as im:
                fmt, (w, h), mode = im.format, im.size, im.mode
                if fmt != magic:
                    raise UploadError("decoded format does not match file signature")
                if w * h > MAX_PIXELS:
                    raise UploadError(f"{w}x{h} exceeds the {MAX_PIXELS // 1_000_000} MP limit")
                im.load()  # full decode: catches truncated / corrupt files
    except UploadError:
        raise
    except (Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise UploadError(f"image exceeds the {MAX_PIXELS // 1_000_000} MP decompression limit")
    except Exception as exc:
        raise UploadError(f"could not decode image: {type(exc).__name__}")
    finally:
        Image.MAX_IMAGE_PIXELS = old
    if w < 1 or h < 1:
        raise UploadError("image has no pixels")
    return {"format": fmt, "width": w, "height": h, "mode": mode}


def load_examples():
    """Bundled gallery from assets/examples/examples.json plus the upstream
    sample. IDs are derived from file names; files are resolved inside the
    examples directory only."""
    out = {}
    if SAMPLE_IMAGE.exists():
        out["sample"] = {
            "id": "sample", "path": SAMPLE_IMAGE, "file": "sample images/sampleImg.jpeg",
            "title": "Upstream bundled sample", "tab": None, "techniques": [],
            "edit": ("Documented by the upstream project (NEXT_STEPS.md) as a known "
                     "composite: a UFO was added and clouds were cloned. Several "
                     "techniques report findings on it by design."),
            "references": [],
        }
    try:
        manifest = json.loads((EXAMPLES_DIR / "examples.json").read_text(encoding="utf-8"))
    except OSError:
        manifest = []
    for e in manifest:
        p = inside_root(EXAMPLES_DIR / e["file"], EXAMPLES_DIR)
        if not p.exists():
            continue
        eid = re.sub(r"[^a-z0-9_]", "_", p.stem.lower())
        refs = [inside_root(EXAMPLES_DIR / r, EXAMPLES_DIR) for r in e.get("references", [])]
        out[eid] = {
            "id": eid, "path": p, "file": e["file"], "title": e["title"], "tab": e["tab"],
            "techniques": TAB_TECHNIQUES.get(e["tab"], []), "edit": e["edit"],
            "references": [r for r in refs if r.exists()],
        }
    return out


class CaseStore:
    def __init__(self):
        ensure_dirs()
        self.lock = threading.RLock()
        self.examples = load_examples()
        self.result_index = {}    # result_id -> case_id
        self.artifact_index = {}  # artifact_id -> case_id
        self._rebuild_index()

    # ── indexes ────────────────────────────────────────────────────
    def _rebuild_index(self):
        for d in CASES_DIR.iterdir() if CASES_DIR.exists() else []:
            if not (valid_id("c", d.name) and (d / "case.json").exists()):
                continue
            for rid in read_json(d / "case.json").get("results", []):
                p = d / "results" / f"{rid}.json"
                if valid_id("r", rid) and p.exists():
                    self._index_result(d.name, read_json(p))

    def _index_result(self, case_id, result):
        self.result_index[result["id"]] = case_id
        for img in result.get("images", []):
            self.artifact_index[img["artifact_id"]] = case_id

    # ── cases ──────────────────────────────────────────────────────
    def _case_path(self, case_id):
        return case_dir(case_id) / "case.json"

    def get(self, case_id):
        try:
            p = self._case_path(case_id)
        except StorageError:
            return None
        if not p.exists():
            return None
        return read_json(p)

    def list(self):
        out = []
        for d in CASES_DIR.iterdir():
            if valid_id("c", d.name) and (d / "case.json").exists():
                out.append(read_json(d / "case.json"))
        return sorted(out, key=lambda c: c["created_utc"], reverse=True)

    def create(self, data, display_name, source, title=None, description=""):
        info = inspect_image(data, display_name if source["kind"] == "upload" else None)
        case_id = new_id("c")
        d = case_dir(case_id)
        with self.lock:
            for sub in ("", "results", "artifacts", "refs", "compare"):
                (d / sub).mkdir(parents=True, exist_ok=True)
            stored = "original" + FORMAT_EXT[info["format"]]
            orig = write_bytes_readonly(d / stored, data)
            hashes = hash_verification.compute_hashes(str(orig))
            example = self.examples.get(source.get("example_id")) if source["kind"] == "example" else None
            case = {
                "id": case_id,
                "title": (title or display_name)[:LIMITS["title"]],
                "description": (description or "")[:LIMITS["description"]],
                "notes": "",
                "created_utc": now_utc(), "updated_utc": now_utc(),
                "source": {"kind": source["kind"], "example_id": source.get("example_id"),
                           "display_name": display_name},
                "original": {
                    "stored_as": stored, "display_name": display_name,
                    "format": info["format"], "mime": FORMAT_MIME[info["format"]],
                    "width": info["width"], "height": info["height"], "mode": info["mode"],
                    "size": len(data), "sha256": hashes["sha256"],
                },
                "hashes": hashes,
                "known_edit": ({"title": example["title"], "edit": example["edit"],
                                "tab": example["tab"], "techniques": example["techniques"]}
                               if example else None),
                "references": [],
                "regions": [],
                "results": [],
            }
            write_json(d / "case.json", case)
        if example:
            for ref in example["references"]:
                self.add_reference(case_id, ref.read_bytes(), ref.name, trusted_example=True)
            case = self.get(case_id)
        return case

    def create_from_example(self, example_id, title=None):
        ex = self.examples.get(example_id) if isinstance(example_id, str) else None
        if ex is None:
            raise UploadError("unknown example id")
        return self.create(ex["path"].read_bytes(), ex["path"].name,
                           {"kind": "example", "example_id": example_id},
                           title=title or f"Example: {ex['title']}")

    def update(self, case_id, **fields):
        with self.lock:
            case = self.get(case_id)
            if case is None:
                return None
            for k, v in fields.items():
                if v is not None:
                    case[k] = str(v)[:LIMITS[k]]
            case["updated_utc"] = now_utc()
            write_json(self._case_path(case_id), case)
            return case

    def delete(self, case_id):
        with self.lock:
            case = self.get(case_id)
            if case is None:
                return False
            d = case_dir(case_id)
            for rid in case["results"]:
                self.result_index.pop(rid, None)
            for aid in [a for a, c in self.artifact_index.items() if c == case_id]:
                self.artifact_index.pop(aid, None)

            def onerror(func, path, exc_info):  # originals are read-only
                make_writable(path)
                func(path)
            shutil.rmtree(d, onerror=onerror)
            return True

    def original_path(self, case):
        return inside_root(case_dir(case["id"]) / case["original"]["stored_as"])

    # ── PRNU references ────────────────────────────────────────────
    def add_reference(self, case_id, data, display_name, trusted_example=False):
        info = inspect_image(data, None if trusted_example else display_name)
        with self.lock:
            case = self.get(case_id)
            if case is None:
                raise StorageError("case not found")
            if len(case["references"]) >= MAX_REFERENCES:
                raise UploadError(f"at most {MAX_REFERENCES} reference photos per case")
            fid = new_id("f")
            stored = fid + FORMAT_EXT[info["format"]]
            p = write_bytes_readonly(case_dir(case_id) / "refs" / stored, data)
            sha = hashlib.sha256(data).hexdigest()
            case["references"].append({
                "id": fid, "stored_as": stored, "display_name": clean_name(display_name),
                "format": info["format"], "width": info["width"], "height": info["height"],
                "sha256": sha, "from_example": trusted_example,
            })
            case["updated_utc"] = now_utc()
            write_json(self._case_path(case_id), case)
            return case["references"][-1], p

    def remove_reference(self, case_id, ref_id):
        with self.lock:
            case = self.get(case_id)
            if case is None or not valid_id("f", ref_id):
                return False
            keep = [r for r in case["references"] if r["id"] != ref_id]
            if len(keep) == len(case["references"]):
                return False
            gone = next(r for r in case["references"] if r["id"] == ref_id)
            p = inside_root(case_dir(case_id) / "refs" / gone["stored_as"])
            make_writable(p)
            p.unlink(missing_ok=True)
            case["references"] = keep
            write_json(self._case_path(case_id), case)
            return True

    def reference_paths(self, case):
        return [str(inside_root(case_dir(case["id"]) / "refs" / r["stored_as"]))
                for r in case["references"]]

    def save_compare_file(self, case_id, data, display_name, trusted_example=False):
        info = inspect_image(data, None if trusted_example else display_name)
        fid = new_id("f")
        p = write_bytes_readonly(case_dir(case_id) / "compare" / (fid + FORMAT_EXT[info["format"]]), data)
        return p, info

    # ── regions of interest (annotations only; the original is never touched)
    def add_region(self, case_id, x, y, w, h, label):
        with self.lock:
            case = self.get(case_id)
            if case is None:
                return None
            o = case["original"]
            if w < 1 or h < 1 or x < 0 or y < 0 or x + w > o["width"] or y + h > o["height"]:
                raise UploadError(f"region must lie inside the {o['width']}x{o['height']} image")
            regions = case.setdefault("regions", [])
            if len(regions) >= MAX_REGIONS:
                raise UploadError(f"at most {MAX_REGIONS} regions per case")
            region = {"id": new_id("g"), "x": x, "y": y, "w": w, "h": h,
                      "label": str(label)[:LIMITS["region_label"]], "created_utc": now_utc()}
            regions.append(region)
            case["updated_utc"] = now_utc()
            write_json(self._case_path(case_id), case)
            return region

    def remove_region(self, case_id, region_id):
        with self.lock:
            case = self.get(case_id)
            if case is None or not valid_id("g", region_id):
                return False
            before = case.get("regions", [])
            case["regions"] = [g for g in before if g["id"] != region_id]
            if len(case["regions"]) == len(before):
                return False
            write_json(self._case_path(case_id), case)
            return True

    # ── results ────────────────────────────────────────────────────
    def add_result(self, case_id, result):
        with self.lock:
            case = self.get(case_id)
            if case is None:
                raise StorageError("case was deleted while the analysis ran")
            write_json(case_dir(case_id) / "results" / f"{result['id']}.json", result)
            case["results"].append(result["id"])
            case["updated_utc"] = now_utc()
            write_json(self._case_path(case_id), case)
            self._index_result(case_id, result)

    def write_details(self, case_id, result_id, details):
        write_json(case_dir(case_id) / "results" / f"{result_id}.details.json", details)

    def details_path(self, result_id):
        case_id = self.result_index.get(result_id)
        if not (case_id and valid_id("r", result_id)):
            return None
        p = inside_root(case_dir(case_id) / "results" / f"{result_id}.details.json")
        return p if p.exists() else None

    def get_result(self, result_id, case_id=None):
        owner = self.result_index.get(result_id) if valid_id("r", result_id) else None
        if owner is None or (case_id is not None and owner != case_id):
            return None
        p = case_dir(owner) / "results" / f"{result_id}.json"
        return read_json(p) if p.exists() else None

    def update_result_note(self, result_id, note):
        with self.lock:
            r = self.get_result(result_id)
            if r is None:
                return None
            r["analyst_note"] = str(note)[:LIMITS["result_note"]]
            write_json(case_dir(r["case_id"]) / "results" / f"{result_id}.json", r)
            return r

    def results_for(self, case):
        out = []
        for rid in case["results"]:
            r = self.get_result(rid, case["id"])
            if r is not None:
                out.append(r)
        return out

    def artifact_path(self, artifact_id):
        if not valid_id("a", artifact_id):
            return None
        case_id = self.artifact_index.get(artifact_id)
        if case_id is None:
            return None
        p = inside_root(case_dir(case_id) / "artifacts" / f"{artifact_id}.png")
        return p if p.exists() else None
