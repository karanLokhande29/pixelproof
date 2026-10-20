"""
Bounded background execution with truthful job states.

Two lanes: `quick` (2 worker processes) and `heavy` (1 worker process), so at
most one expensive analysis runs at a time and the API process never runs CV
code itself. Each lane has as many dispatch threads as worker processes, so a
job is marked `running` only when a worker process is actually free for it.
There is no cancel: a running job finishes or fails.

Cache: a case's existing result is reused when (original SHA-256, technique,
normalised parameters, reference SHA-256s, implementation version) match,
unless the caller forces a re-run. Results are never shared across cases.
"""
import hashlib
import json
import logging
import threading
import time
from collections import OrderedDict
from concurrent.futures import ProcessPoolExecutor, ThreadPoolExecutor
from concurrent.futures.process import BrokenProcessPool

from . import registry, worker
from .cases import now_utc
from .storage import case_dir, new_id

log = logging.getLogger("pixelproof.jobs")
LANES = {"quick": 2, "heavy": 1}
MAX_JOBS_KEPT = 500
ACTIVE = ("queued", "running")


def cache_key(case, technique_id, params):
    refs = sorted(r["sha256"] for r in case["references"]) \
        if registry.get(technique_id).get("uses_references") else []
    blob = json.dumps({"sha256": case["original"]["sha256"], "technique": technique_id,
                       "params": params, "refs": refs,
                       "version": registry.VERSIONS[technique_id]}, sort_keys=True)
    return hashlib.sha256(blob.encode()).hexdigest()[:32]


class JobManager:
    def __init__(self, store):
        self.store = store
        self.lock = threading.RLock()
        self.jobs = OrderedDict()
        self.procs = {lane: ProcessPoolExecutor(max_workers=n) for lane, n in LANES.items()}
        self.dispatch = {lane: ThreadPoolExecutor(max_workers=n, thread_name_prefix=f"pixelproof-{lane}")
                         for lane, n in LANES.items()}

    def shutdown(self):
        for ex in self.dispatch.values():
            ex.shutdown(wait=False, cancel_futures=True)
        for ex in self.procs.values():
            ex.shutdown(wait=False, cancel_futures=True)

    # ── public ─────────────────────────────────────────────────────
    def submit(self, case, technique_id, params, force=False):
        """Returns a job dict. Raises registry.ParamError on bad input."""
        t = registry.get(technique_id)
        params = registry.validate_params(technique_id, params)
        key = cache_key(case, technique_id, params)
        with self.lock:
            if not force:
                for r in reversed(self.store.results_for(case)):
                    if r.get("cache_key") == key:
                        return self._record(case["id"], technique_id, params, key,
                                            status="succeeded", result_id=r["id"], cached=True)
            for j in self.jobs.values():  # same work already in flight
                if j["case_id"] == case["id"] and j["cache_key"] == key and j["status"] in ACTIVE:
                    return dict(j)
            job = self._record(case["id"], technique_id, params, key, status="queued")
            lane = "heavy" if t["cost"] == "heavy" else "quick"
            job["lane"] = lane
            args = (technique_id, str(self.store.original_path(case)), params,
                    self.store.reference_paths(case) if t.get("uses_references") else [],
                    str(case_dir(case["id"]) / "artifacts"))
            self.dispatch[lane].submit(self._run, job["id"], lane, args)
            return dict(job)

    def get(self, job_id):
        with self.lock:
            j = self.jobs.get(job_id)
            return dict(j) if j else None

    def list(self, case_id=None, active_only=False):
        with self.lock:
            out = [dict(j) for j in self.jobs.values()
                   if (case_id is None or j["case_id"] == case_id)
                   and (not active_only or j["status"] in ACTIVE)]
        return out

    # ── internals ──────────────────────────────────────────────────
    def _record(self, case_id, technique_id, params, key, status, result_id=None, cached=False):
        job = {"id": new_id("j"), "case_id": case_id, "technique_id": technique_id,
               "parameters": params, "cache_key": key, "status": status,
               "result_id": result_id, "cached": cached, "error": None,
               "submitted_utc": now_utc(), "started_utc": None, "finished_utc": None,
               "lane": None}
        if status == "succeeded":
            job["finished_utc"] = job["submitted_utc"]
        self.jobs[job["id"]] = job
        while len(self.jobs) > MAX_JOBS_KEPT:
            oldest = next(iter(self.jobs))
            if self.jobs[oldest]["status"] in ACTIVE:
                break
            self.jobs.pop(oldest)
        return job

    def _set(self, job_id, **fields):
        with self.lock:
            self.jobs[job_id].update(fields)

    def _run(self, job_id, lane, args):
        self._set(job_id, status="running", started_utc=now_utc())
        technique_id = args[0]
        job = self.get(job_id)
        try:
            try:
                fields, details = self.procs[lane].submit(worker.run_technique, *args).result()
            except BrokenProcessPool:
                # A worker died (e.g. out of memory). Replace the pool so later
                # jobs still run, and report this job as failed.
                with self.lock:
                    self.procs[lane] = ProcessPoolExecutor(max_workers=LANES[lane])
                raise RuntimeError("the analysis worker process crashed (possibly out of memory)")
            rid = new_id("r")
            t = registry.get(technique_id)
            result = {
                "id": rid, "case_id": job["case_id"], "technique_id": technique_id,
                "technique_name": t["name"], "family": t["family"],
                "parameters": job["parameters"], "fixed_parameters": t["fixed"],
                "entry_point": f"analysis.{t['module']}.{t['function']}",
                "implementation_version": registry.VERSIONS[technique_id],
                "cache_key": job["cache_key"], "job_id": job_id,
                "created_utc": now_utc(), "analyst_note": "",
                **fields,
            }
            if t.get("uses_references"):
                case = self.store.get(job["case_id"])
                result["references_used"] = [
                    {"display_name": r["display_name"], "sha256": r["sha256"]}
                    for r in (case or {}).get("references", [])]
            self.store.write_details(job["case_id"], rid, details)
            self.store.add_result(job["case_id"], result)
            self._set(job_id, status="succeeded", result_id=rid, finished_utc=now_utc())
        except Exception as exc:
            log.exception("job %s failed", job_id)
            self._set(job_id, status="failed", finished_utc=now_utc(),
                      error=f"{type(exc).__name__}: {exc}"[:500])

    def wait(self, job_id, timeout=120.0, poll=0.1):
        """Test helper: block until the job reaches a terminal state."""
        end = time.time() + timeout
        while time.time() < end:
            j = self.get(job_id)
            if j and j["status"] not in ACTIVE:
                return j
            time.sleep(poll)
        return self.get(job_id)
