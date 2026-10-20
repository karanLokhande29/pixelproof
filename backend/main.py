"""
PixelProof API. Thin FastAPI adapter: validated requests -> trusted registry ->
unmodified upstream `analysis.*` entry point (in a bounded worker process) ->
serializer -> per-case local storage.

Run from the repository root:
    python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
"""
import importlib.util
import logging
import re
from contextlib import asynccontextmanager

from fastapi import FastAPI, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles

from analysis import hash_verification as hv

from . import registry, reports
from .cases import MAX_UPLOAD_BYTES, CaseStore, UploadError, clean_name
from .jobs import LANES, JobManager
from .ledger import LedgerStore, ledger_key
from .schemas import (AnalysisRequest, CasePatch, ExampleCaseRequest, LedgerAdd,
                      ProvenanceExample, RegionCreate, ResultNote)
from .serializer import json_safe
from .storage import REPO_ROOT, STORAGE_ROOT, StorageError, valid_id

API_VERSION = "1.0.0"
log = logging.getLogger("pixelproof.api")
FRONTEND_DIST = REPO_ROOT / "frontend" / "dist"
MAX_BODY = MAX_UPLOAD_BYTES + 1024 * 1024  # file + multipart overhead

state = {}


@asynccontextmanager
async def lifespan(app):
    state["store"] = CaseStore()
    state["jobs"] = JobManager(state["store"])
    state["ledger"] = LedgerStore()
    yield
    state["jobs"].shutdown()


app = FastAPI(title="PixelProof API", version=API_VERSION, lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
                   allow_methods=["*"], allow_headers=["*"])


@app.middleware("http")
async def guard(request: Request, call_next):
    cl = request.headers.get("content-length")
    if cl and cl.isdigit() and int(cl) > MAX_BODY:
        return JSONResponse({"detail": f"request larger than {MAX_UPLOAD_BYTES // (1024 * 1024)} MB"},
                            status_code=413)
    resp = await call_next(request)
    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["Referrer-Policy"] = "no-referrer"
    return resp


def store() -> CaseStore:
    return state["store"]


def jobs() -> JobManager:
    return state["jobs"]


def need_case(case_id):
    case = store().get(case_id) if valid_id("c", case_id) else None
    if case is None:
        raise HTTPException(404, "case not found")
    return case


def case_view(case):
    """Case as returned to the browser: no server paths."""
    out = {k: v for k, v in case.items() if k != "references"}
    out["original"] = {k: v for k, v in case["original"].items() if k != "stored_as"}
    out["original_url"] = f"/api/cases/{case['id']}/original"
    out["references"] = [{k: v for k, v in r.items() if k != "stored_as"} for r in case["references"]]
    out["regions"] = case.get("regions", [])  # cases created before regions existed
    return out


async def read_upload(file: UploadFile):
    data = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, f"file is larger than {MAX_UPLOAD_BYTES // (1024 * 1024)} MB")
    return data


# ── meta ───────────────────────────────────────────────────────────
@app.get("/api/health")
def health():
    # find_spec only checks that the module file is present (no import, so
    # health stays cheap); the modules are imported in the worker processes.
    techniques = [{"id": t["id"], "entry_point": t["entry_point"],
                   "module_found": importlib.util.find_spec(f"analysis.{registry.TECHNIQUES[t['id']]['module']}") is not None}
                  for t in registry.public_list()]
    return {
        "service": "pixelproof-api", "version": API_VERSION, "status": "ok",
        "techniques": techniques,
        "all_technique_modules_found": all(t["module_found"] for t in techniques),
        "c2pa_reader_installed": importlib.util.find_spec("c2pa") is not None,
        "examples_available": len(store().examples),
        "executor_lanes": LANES,
        "ledger_signing": "HMAC-SHA256" if ledger_key() else "SHA-256 digest (unkeyed)",
        "storage_root": str(STORAGE_ROOT.relative_to(REPO_ROOT)) if STORAGE_ROOT.is_relative_to(REPO_ROOT) else "custom",
        "frontend_built": FRONTEND_DIST.exists(),
    }


@app.get("/api/techniques")
def techniques():
    return {"techniques": registry.public_list(), "quick_scan": registry.QUICK_SCAN}


@app.get("/api/descriptions/{description_id}")
def description(description_id: str):
    text = registry.description_text(description_id)
    if text is None:
        raise HTTPException(404, "no such description")
    return {"id": description_id, "markdown": text}


@app.get("/api/examples")
def examples():
    return {"examples": [{"id": e["id"], "title": e["title"], "tab": e["tab"],
                          "edit": e["edit"], "techniques": e["techniques"], "file": e["file"],
                          "references": len(e["references"]),
                          "image_url": f"/api/examples/{e['id']}/image"}
                         for e in store().examples.values()]}


@app.get("/api/examples/{example_id}/image")
def example_image(example_id: str):
    e = store().examples.get(example_id)
    if e is None:
        raise HTTPException(404, "unknown example")
    return FileResponse(e["path"], headers={"Cache-Control": "public, max-age=3600"})


# ── cases ──────────────────────────────────────────────────────────
@app.get("/api/cases")
def list_cases():
    return {"cases": [{"id": c["id"], "title": c["title"], "created_utc": c["created_utc"],
                       "format": c["original"]["format"], "display_name": c["original"]["display_name"],
                       "sha256": c["original"]["sha256"], "results": len(c["results"]),
                       "example_id": c["source"].get("example_id"),
                       "original_url": f"/api/cases/{c['id']}/original"}
                      for c in store().list()]}


@app.post("/api/cases", status_code=201)
async def create_case(file: UploadFile = File(...), title: str = Form(default=""),
                      description: str = Form(default="")):
    data = await read_upload(file)
    name = clean_name(file.filename)
    try:
        case = store().create(data, name, {"kind": "upload"}, title=title.strip() or name,
                              description=description)
    except UploadError as e:
        raise HTTPException(422, str(e))
    return case_view(case)


@app.post("/api/cases/from-example", status_code=201)
def create_case_from_example(body: ExampleCaseRequest):
    try:
        case = store().create_from_example(body.example_id, body.title)
    except UploadError as e:
        raise HTTPException(422, str(e))
    return case_view(case)


@app.get("/api/cases/{case_id}")
def get_case(case_id: str):
    return case_view(need_case(case_id))


@app.patch("/api/cases/{case_id}")
def patch_case(case_id: str, body: CasePatch):
    need_case(case_id)
    return case_view(store().update(case_id, **body.model_dump()))


@app.delete("/api/cases/{case_id}")
def delete_case(case_id: str):
    need_case(case_id)
    if any(j["status"] in ("queued", "running") for j in jobs().list(case_id)):
        raise HTTPException(409, "analyses for this case are still running")
    store().delete(case_id)
    return {"deleted": case_id}


@app.get("/api/cases/{case_id}/original")
def original(case_id: str, download: bool = False):
    case = need_case(case_id)
    o = case["original"]
    disp = "attachment" if download else "inline"
    safe = re.sub(r"[^A-Za-z0-9._-]", "_", o["display_name"])[:100] or "original"
    return FileResponse(store().original_path(case), media_type=o["mime"],
                        headers={"Content-Disposition": f'{disp}; filename="{safe}"',
                                 "Cache-Control": "private, max-age=3600",
                                 "X-Evidence-SHA256": o["sha256"]})


@app.post("/api/cases/{case_id}/references", status_code=201)
async def add_reference(case_id: str, file: UploadFile = File(...)):
    need_case(case_id)
    data = await read_upload(file)
    try:
        ref, _ = store().add_reference(case_id, data, clean_name(file.filename))
    except UploadError as e:
        raise HTTPException(422, str(e))
    return {k: v for k, v in ref.items() if k != "stored_as"}


@app.delete("/api/cases/{case_id}/references/{ref_id}")
def remove_reference(case_id: str, ref_id: str):
    need_case(case_id)
    if not store().remove_reference(case_id, ref_id):
        raise HTTPException(404, "reference not found")
    return {"deleted": ref_id}


@app.post("/api/cases/{case_id}/regions", status_code=201)
def add_region(case_id: str, body: RegionCreate):
    need_case(case_id)
    try:
        return store().add_region(case_id, body.x, body.y, body.w, body.h, body.label)
    except UploadError as e:
        raise HTTPException(422, str(e))


@app.delete("/api/cases/{case_id}/regions/{region_id}")
def remove_region(case_id: str, region_id: str):
    need_case(case_id)
    if not store().remove_region(case_id, region_id):
        raise HTTPException(404, "region not found")
    return {"deleted": region_id}


# ── analyses / jobs / results ──────────────────────────────────────
@app.post("/api/cases/{case_id}/analyses", status_code=202)
def run_analysis(case_id: str, body: AnalysisRequest):
    case = need_case(case_id)
    try:
        return jobs().submit(case, body.technique_id, body.parameters, force=body.force)
    except registry.ParamError as e:
        raise HTTPException(422, str(e))


@app.post("/api/cases/{case_id}/quick-scan", status_code=202)
def quick_scan(case_id: str):
    case = need_case(case_id)
    return {"techniques": registry.QUICK_SCAN,
            "jobs": [jobs().submit(case, tid, {}) for tid in registry.QUICK_SCAN]}


@app.get("/api/jobs")
def list_jobs(case_id: str | None = None, active: bool = False):
    if case_id is not None and not valid_id("c", case_id):
        raise HTTPException(422, "bad case id")
    return {"jobs": jobs().list(case_id, active_only=active)}


@app.get("/api/jobs/{job_id}")
def get_job(job_id: str):
    j = jobs().get(job_id) if valid_id("j", job_id) else None
    if j is None:
        raise HTTPException(404, "job not found (jobs are kept in memory and reset on API restart)")
    return j


@app.get("/api/cases/{case_id}/results")
def case_results(case_id: str):
    case = need_case(case_id)
    return {"results": store().results_for(case)}


@app.get("/api/results/{result_id}")
def get_result(result_id: str):
    r = store().get_result(result_id)
    if r is None:
        raise HTTPException(404, "result not found")
    return r


@app.patch("/api/results/{result_id}")
def patch_result(result_id: str, body: ResultNote):
    r = store().update_result_note(result_id, body.analyst_note)
    if r is None:
        raise HTTPException(404, "result not found")
    return r


@app.get("/api/results/{result_id}/details.json")
def result_details(result_id: str):
    p = store().details_path(result_id)
    if p is None:
        raise HTTPException(404, "details not found")
    return FileResponse(p, media_type="application/json",
                        headers={"Content-Disposition": f'attachment; filename="{result_id}-details.json"'})


@app.get("/api/artifacts/{artifact_id}")
def artifact(artifact_id: str):
    p = store().artifact_path(artifact_id)
    if p is None:
        raise HTTPException(404, "artifact not found")
    return FileResponse(p, media_type="image/png",
                        headers={"Cache-Control": "private, max-age=31536000, immutable"})


# ── provenance ─────────────────────────────────────────────────────
def _compare(case, other_path, other_label):
    ledger, _ = hv.add_record(hv.new_ledger(), str(store().original_path(case)),
                              label=case["original"]["display_name"], note="case original")
    r = hv.verify_image(ledger, str(other_path))
    match = (r["details"].get("matches") or [{}])[0]
    q = r["details"].get("query", {})
    h = case["hashes"]
    return {
        "against": {"label": other_label, "format": q.get("format"), "dimensions": q.get("dimensions"),
                    "size": q.get("size"), "sha256": q.get("sha256"), "pixel_sha256": q.get("pixel_sha256"),
                    "phash": q.get("phash"), "dhash": q.get("dhash"), "ahash": q.get("ahash")},
        "same_bytes": q.get("sha256") == h["sha256"],
        "same_pixels": q.get("pixel_sha256") == h["pixel_sha256"],
        "classification": match.get("match"),
        "distances": match.get("distances"),
        "threshold_bits": hv.SIMILAR_BITS,
        "result": json_safe({k: r[k] for k in ("status", "summary", "findings", "metrics", "tables", "limitations")}),
    }


@app.post("/api/cases/{case_id}/provenance/compare-upload")
async def compare_upload(case_id: str, file: UploadFile = File(...)):
    case = need_case(case_id)
    data = await read_upload(file)
    name = clean_name(file.filename)
    try:
        p, _ = store().save_compare_file(case_id, data, name)
    except UploadError as e:
        raise HTTPException(422, str(e))
    return _compare(case, p, name)


@app.post("/api/cases/{case_id}/provenance/compare-example")
def compare_example(case_id: str, body: ProvenanceExample):
    case = need_case(case_id)
    e = store().examples.get(body.example_id)
    if e is None:
        raise HTTPException(404, "unknown example")
    return _compare(case, e["path"], f"bundled example: {e['title']}")


@app.get("/api/ledger")
def ledger_state():
    return state["ledger"].state()


@app.post("/api/ledger/records", status_code=201)
def ledger_add(body: LedgerAdd):
    case = need_case(body.case_id)
    rec = state["ledger"].add(str(store().original_path(case)),
                              label=case["original"]["display_name"],
                              note=body.note or f"PixelProof case {case['id']}")
    return rec


@app.post("/api/ledger/check/{case_id}")
def ledger_check(case_id: str):
    case = need_case(case_id)
    r = state["ledger"].verify(str(store().original_path(case)))
    return json_safe({k: r[k] for k in ("status", "summary", "findings", "metrics", "tables",
                                        "limitations", "details")})


@app.get("/api/ledger/export")
def ledger_export():
    return Response(state["ledger"].export(), media_type="application/json",
                    headers={"Content-Disposition": 'attachment; filename="pixelproof-ledger.json"'})


@app.post("/api/ledger/import")
async def ledger_import(file: UploadFile = File(...)):
    data = await file.read(5 * 1024 * 1024 + 1)
    if len(data) > 5 * 1024 * 1024:
        raise HTTPException(413, "ledger file larger than 5 MB")
    try:
        return state["ledger"].import_(data)
    except (ValueError, KeyError, TypeError) as e:
        raise HTTPException(422, f"not a valid pixelproof ledger: {e}")


@app.delete("/api/ledger")
def ledger_clear():
    state["ledger"].clear()
    return {"cleared": True}


# ── reports ────────────────────────────────────────────────────────
def _selected(results: str | None):
    if not results:
        return None
    ids = [r for r in results.split(",") if r]
    if not all(valid_id("r", r) for r in ids):
        raise HTTPException(422, "bad result id in selection")
    return ids


@app.get("/api/cases/{case_id}/report.json")
def report_json(case_id: str, results: str | None = Query(default=None), download: bool = False):
    case = need_case(case_id)
    rep = reports.build(store(), case, _selected(results))
    headers = {"Content-Disposition": f'attachment; filename="pixelproof-{case_id}.json"'} if download else {}
    return JSONResponse(rep, headers=headers)


@app.get("/api/cases/{case_id}/report.html")
def report_html(case_id: str, results: str | None = Query(default=None), download: bool = False):
    case = need_case(case_id)
    rep = reports.build(store(), case, _selected(results))
    disp = "attachment" if download else "inline"
    return HTMLResponse(reports.render_html(store(), case, rep),
                        headers={"Content-Disposition": f'{disp}; filename="pixelproof-{case_id}.html"',
                                 "Content-Security-Policy": "default-src 'none'; img-src data:; style-src 'unsafe-inline'"})


@app.exception_handler(StorageError)
def storage_error(request, exc):
    return JSONResponse({"detail": "invalid storage reference"}, status_code=404)


# ── built frontend (optional single-server mode) ───────────────────
if FRONTEND_DIST.exists():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        if path.startswith("api/"):
            raise HTTPException(404, "not found")
        f = (FRONTEND_DIST / path).resolve()
        if path and f.is_file() and f.is_relative_to(FRONTEND_DIST.resolve()):
            return FileResponse(f)
        return FileResponse(FRONTEND_DIST / "index.html")
