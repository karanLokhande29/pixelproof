"""
Safe on-disk layout. Every path is built from a server-generated ID that is
validated against a strict pattern, then resolved and checked to lie inside
the storage root, so no request can name an arbitrary file.

    build_artifacts/
      cases/<case_id>/case.json
      cases/<case_id>/original.<jpg|png>      exact uploaded bytes, read-only
      cases/<case_id>/refs/<ref_id>.<ext>     PRNU reference photos
      cases/<case_id>/compare/<cmp_id>.<ext>  provenance comparison uploads
      cases/<case_id>/results/<result_id>.json
      cases/<case_id>/results/<result_id>.details.json
      cases/<case_id>/artifacts/<artifact_id>.png
      ledger.json
"""
import json
import os
import re
import secrets
import stat
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
STORAGE_ROOT = Path(os.environ.get("VERITAS_STORAGE", REPO_ROOT / "build_artifacts")).resolve()
CASES_DIR = STORAGE_ROOT / "cases"
EXAMPLES_DIR = REPO_ROOT / "assets" / "examples"
SAMPLE_IMAGE = REPO_ROOT / "assets" / "sample images" / "sampleImg.jpeg"
DESCRIPTIONS_DIR = REPO_ROOT / "Descriptions"

ID_PATTERNS = {
    "c": re.compile(r"^c_[0-9a-f]{16}$"),   # case
    "r": re.compile(r"^r_[0-9a-f]{16}$"),   # result
    "a": re.compile(r"^a_[0-9a-f]{24}$"),   # artifact
    "j": re.compile(r"^j_[0-9a-f]{16}$"),   # job
    "f": re.compile(r"^f_[0-9a-f]{12}$"),   # reference / comparison file
    "g": re.compile(r"^g_[0-9a-f]{8}$"),    # region of interest
}
_ID_BYTES = {"c": 8, "r": 8, "a": 12, "j": 8, "f": 6, "g": 4}


class StorageError(Exception):
    pass


def new_id(kind):
    return f"{kind}_{secrets.token_hex(_ID_BYTES[kind])}"


def valid_id(kind, value):
    return isinstance(value, str) and bool(ID_PATTERNS[kind].match(value))


def ensure_dirs():
    CASES_DIR.mkdir(parents=True, exist_ok=True)


def inside_root(path, root=STORAGE_ROOT):
    """Resolve and refuse anything outside `root` (covers '..' and symlinks)."""
    p = Path(path).resolve()
    if not p.is_relative_to(root):
        raise StorageError("path escapes storage root")
    return p


def case_dir(case_id):
    if not valid_id("c", case_id):
        raise StorageError("bad case id")
    return inside_root(CASES_DIR / case_id)


def write_json(path, obj):
    path = inside_root(path)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(obj, indent=2, ensure_ascii=False), encoding="utf-8")
    os.replace(tmp, path)


def read_json(path):
    return json.loads(inside_root(path).read_text(encoding="utf-8"))


def write_bytes_readonly(path, data):
    """Write evidence bytes once and mark the file read-only."""
    path = inside_root(path)
    with open(path, "xb") as f:
        f.write(data)
    os.chmod(path, stat.S_IREAD)
    return path


def make_writable(path):
    try:
        os.chmod(path, stat.S_IREAD | stat.S_IWRITE)
    except OSError:
        pass
