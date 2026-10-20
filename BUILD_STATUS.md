# VERITAS X — Build Status (durable state record)

- **Start:** 2026-10-20 19:51:34 +05:30 (first command timestamp)
- **Hard deadline (12 h):** 2026-10-21 07:51:34 +05:30
- **Feature freeze (10 h):** 2026-10-21 05:51 +05:30
- **Build choice:** React + Vite + TS + Tailwind frontend, FastAPI adapter backend; original Streamlit `app.py` kept as fallback.

## Environment (inspected)

| Item | Value |
|---|---|
| OS | Windows 11 Home 10.0.26200, PowerShell 5.1 |
| Python | 3.12.10 only (`.python-version` pins 3.10, not installed) → `.venv` on 3.12 |
| Node / npm | v22.20.0 / 10.9.3 |
| git | **not installed** → checkpoints are ZIPs in `checkpoints/` |
| CPU / RAM | 16 logical cores / 23.7 GB |

## Milestones

| ID | Milestone | Status | Evidence |
|---|---|---|---|
| M0 | Baseline / audit | **PASS** ~20:03 | 142/142 upstream unittests OK (300 s); Streamlit health `ok`; ELA/metadata/CMFD real contracts |
| M1 | FastAPI adapter | **PASS** 20:10 | curl upload → ELA q65 job → result → PNG artifact (200, image/png); served original SHA = local SHA; 16/16 `tests/test_api.py` |
| M2 | React shell + Lab | **PASS** 20:24 | `node e2e/m2_lab.mjs` in Edge: browser upload → SHA matches → ELA q65 & q95 (distinct real metrics, stale notice) → Copy-Move 3 verified clones / 13.47 % while navigating away; 0 console errors, 0 5xx. Screenshots `build_artifacts/screenshots/m2_*.png` |
| M3 | Compare + Provenance | **PASS** 20:32 | `node e2e/m3_compare_provenance.mjs`: Copy-Move/ELA/Metadata of one example case in 3 independent columns, no score wording; 2nd case's Compare empty (isolation); exact dup → byte-identical; q80 resave → SHA & pixel SHA differ, pHash 0 → "visually similar"; sample's C2PA manifest shown (Invalid, test cert); ledger add+check byte-identical. 0 console errors / 5xx |
| M4 | Reports + Quick Scan | **PASS** 20:34 | `node e2e/m4_reports.mjs` on 2 bundled samples (JPEG + PNG): gallery → case → Quick Scan (4 lightweight methods; PNG quantization "Not applicable") → note → JSON download verified (SHA = bundled file, 4 analyses, limitations, artifact SHA-256s, note verbatim) → printable HTML verified (note escaped, limitations, attribution, all embedded images decode) |
| M5 | Tests / security / perf | **PASS** 20:58 | `unittest discover`: upstream 142/142 OK + new API tests (one over-narrow assertion B008 fixed → `pytest tests/test_api.py` 20/20); `npm run build` OK; all 4 e2e scripts pass against the production build on :8000 after a cold API restart; responsive 390/820 px + keyboard pass (B006 fixed); runtimes in `build_artifacts/logs/runtimes.md` |
| P1 | ROI annotation (plan §1 P1) | **PASS** 21:01 | regions in original pixel coords, saved to case, drawn on same-grid views, in JSON/HTML report; evidence bytes unchanged (test). `e2e/p1_regions.mjs` drew documented clone target → 700,301 192×128; API 21/21; m2–m5 e2e re-run all pass |
| M6 | Freeze / release | **PASS** 21:34 | feature freeze 21:03; sanitized ZIP (11.6 MB, no venv/node_modules/evidence) → clean install in fresh dir (setup 7 min) → health OK + m2/m4 e2e pass (B010 path-length caveat documented); final `unittest discover` **163/163 OK** (425 s); cold restart of all 3 servers; 5-script demo journey twice (:8000 and :5173) 10/10 pass |

## Checkpoints

- `checkpoints/baseline_upstream_20261020_1952.zip` — untouched upstream tree + specs.
- `checkpoints/m1_backend_20261020.zip` — backend/ + tests/ after M1 gate.

## Log (actual clock, +05:30)

- 19:51 Read both specs in full; upstream README/API/DEPLOYMENT/NEXT_STEPS/app.py/util.py/examples.json/LICENSE.
- 19:52 Baseline checkpoint ZIP (12.0 MB).
- ~19:55 `python -m venv .venv`; `pip install -r requirements.txt pytest` — all exact pins installed from cp312 wheels; pins unchanged.
- ~19:57 `python -m pytest` stops at config: `pytest.ini` addopts need `pytest-cov` (not in requirements.txt) → B003. Used documented `python -m unittest discover -s tests -t .` instead.
- ~19:58–20:03 Upstream unittest: **Ran 142 tests in 300.461s — OK** (`build_artifacts/logs/upstream_unittest.log`).
- ~19:58 `streamlit run app.py --server.port 8501` → `/_stcore/health` = `ok`, `/` = 200.
- ~19:57 Smoke: ELA ok 0.42 s; metadata (metadata_inconsistent.jpg) ok 1.56 s; CMFD (copy_move_clone.jpg) ok 6.84 s.
- ~20:00 Probe of all 14 entry points on sampleImg.jpeg (1024x576): all `ok`; CMFD 16.3 s while tests competed for CPU, others ≤1.3 s. Output shapes → overlay registry (`backend/registry.py::_MAPS`).
- Decision: original is displayed with CSS `image-orientation: none` so viewer pixels match the stored pixel order the analyses use (upstream `load_array` does not apply EXIF orientation).
- 20:00–20:09 Backend written: storage, registry, serializer, worker, cases, jobs (2 quick + 1 heavy worker processes), ledger, reports, schemas, main. `pip install fastapi httpx` → fastapi 0.153.0, httpx 0.28.1 (pinned in `backend/requirements-api.txt`).
- 20:08 M1 gate via curl.exe (see milestone table). 20:09 `pytest tests/test_api.py -o addopts=""` → 16 passed in 25 s.
- 20:11–20:20 Frontend: hand-scaffolded Vite 5.4.11 + React 18.3.1 + TS 5.6.3 + Tailwind 3.4.17 + TanStack Query 5.62.7 (exact pins). Custom pan/zoom viewer (synced side-by-side, registered-only overlay with blend/wipe, pixel-coordinate readout). `tsc --noEmit` clean.
- 20:20 Browser automation: `playwright@1.49.1` library driving system Microsoft Edge (`channel: msedge`), no browser download.
- 20:21 First M2 run: ELA flow passed, CMFD step failed (B004). Fixed, re-run 20:24 → PASS.
- 20:26 CMFD timing investigation (B005, S2).
- 20:27–20:32 Compare + Provenance pages; M3 e2e. Two test-script fixes (ambiguous selector; wrong assumption — the upstream sample *does* carry a C2PA test manifest, validation Invalid). App unchanged.
- 20:36 Backend tests extended (all 14 techniques on targeted examples, PRNU refs, case switch during heavy job): 19/19.
- 20:37 `npm run build` OK. Launch scripts (`launch/*.ps1`, root `*.bat`), `.gitignore` entries, packaging script.
- 20:38 Cold restart via `start_veritas.bat` → single server on :8000 serves UI + API; 17 cases/results/artifacts persisted; old job IDs → 404 (UI reports "API restarted").
- 20:39 All e2e gates re-run on :8000 production build: m2, m3, m4 pass; m5 responsive found B006 (fixed, pass).
- 20:44–20:52 Full regression `unittest discover` (161 tests, 406 s): upstream 142 OK; 1 new-test failure B008 (assertion), fixed; API tests 20/20 (incl. new HMAC ledger test).
- 20:57 `launch/measure_runtimes.py` against live API → runtime table.
- 20:59–21:01 P1 regions of interest (backend + viewer + report) with API and e2e tests.
- 21:03 Feature freeze. `launch/package.ps1` → `dist_submission/veritas-x_20261020_2103.zip`.
- 21:04–21:20 Clean-install test: first attempt in the very deep scratchpad path failed at Pillow DLL load (B010, Windows MAX_PATH); re-done in `dist_submission\ci` → setup OK, health OK, m2 + m4 pass; test dirs removed.
- 21:21–21:28 Final `unittest discover`: 163 tests OK.
- 21:29–21:34 Cold restart (API, Vite, Streamlit all healthy); demo journey ×2: 10/10 e2e pass. Demo script corrected (sample vs clone example = "no match", pHash 12).
- 21:34 Final package `dist_submission/veritas-x_20261020_2134.zip` (11.6 MB) and checkpoint `checkpoints/m6_release_20261020.zip`.
- **Completed at 21:34 +05:30 — 1 h 42 m elapsed of the 12 h budget.** All P0 gates PASS; one P1 (ROI) added; no fallback needed.
- 20:32–20:34 Reports page; M4 e2e. Harness-only `TargetClosedError` from Edge popups ignored explicitly (all app assertions passed before it).
