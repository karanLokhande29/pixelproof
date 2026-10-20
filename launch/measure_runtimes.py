"""
Measure real per-technique runtimes through the running API (forced re-runs,
so nothing comes from cache). Usage, with the API on :8000:
    .venv\\Scripts\\python.exe launch\\measure_runtimes.py [base_url]
Prints a Markdown table: worker-measured analysis time and end-to-end
request→result time (includes queueing, serialization and PNG writing).
"""
import sys
import time

import httpx

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8000"
TARGETS = [  # (technique, example id) — each method on the bundled image it targets
    ("metadata", "metadata_inconsistent"), ("ela", "ela_recompressed_patch"),
    ("histogram", "histogram_contrast"), ("quantization", "ghost_q60_patch"),
    ("jpeg_ghost", "ghost_q60_patch"), ("double_jpeg", "ghost_q60_patch"),
    ("copy_move", "copy_move_clone"), ("noise", "noise_smoothed_region"),
    ("prnu", "iphone5c_01"), ("spectrum", "sample"), ("jpeg_grid", "sample"),
    ("resampling", "resampled_upscale"), ("synthetic_traces", "sample"),
    ("steganography", "stego_lsb"),
]

c = httpx.Client(base_url=BASE, timeout=60)
cases = {}
print("| Technique | Example | Image | Status | Analysis (worker) ms | End-to-end ms |")
print("|---|---|---|---|---|---|")
for tid, ex in TARGETS:
    if ex not in cases:
        cases[ex] = c.post("/api/cases/from-example", json={"example_id": ex}).json()
    case = cases[ex]
    t0 = time.time()
    job = c.post(f"/api/cases/{case['id']}/analyses",
                 json={"technique_id": tid, "parameters": {}, "force": True}).json()
    while job["status"] in ("queued", "running"):
        time.sleep(0.1)
        job = c.get(f"/api/jobs/{job['id']}").json()
    e2e = int((time.time() - t0) * 1000)
    r = c.get(f"/api/results/{job['result_id']}").json() if job["result_id"] else {}
    o = case["original"]
    print(f"| {tid} | {ex} | {o['format']} {o['width']}x{o['height']} | {r.get('status', job['status'])} "
          f"| {r.get('elapsed_ms', '—')} | {e2e} |")
