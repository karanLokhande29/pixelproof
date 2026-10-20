# Veritas X — Final Build Report

| | |
|---|---|
| Started | 2026-10-20 19:51:34 +05:30 |
| Feature freeze | 2026-10-20 21:03 +05:30 (1 h 12 m in; all P0 gates green, one P1 item added) |
| Finished | 2026-10-20 21:34 +05:30 — **1 h 42 m elapsed** of the 12 h budget (deadline was 2026-10-21 07:51) |
| Build route | React + TypeScript + Vite + Tailwind UI over a thin FastAPI adapter. **No Streamlit pivot was needed**; the original Streamlit app is unchanged and still runs. |
| Platform verified | Windows 11, Python 3.12.10, Node 22.20.0 / npm 10.9.3, Microsoft Edge (for browser tests) |

Everything below was executed on this machine; numbers are copied from the logs named. Nothing is marked
"pass" without a run.

## 1. Acceptance gates

| Gate | Result | Evidence |
|---|---|---|
| M0 baseline | **PASS** | upstream `unittest discover`: 142/142 OK (300 s); Streamlit `/_stcore/health` = ok |
| M1 API | **PASS** | curl: multipart upload → ELA q65 job → result JSON → PNG artifact (200 image/png); served original SHA-256 = local file |
| M2 React Lab | **PASS** | `e2e/m2_lab.mjs` (Edge): browser upload, ELA q65 + q95 distinct real results, Copy-Move 3 verified clones while navigating away |
| M3 Compare/Provenance | **PASS** | `e2e/m3_compare_provenance.mjs`: 3 method columns of one case, isolation, byte-identical vs visually-similar, C2PA, ledger |
| M4 Reports/Quick Scan | **PASS** | `e2e/m4_reports.mjs`: 2 bundled samples (JPEG, PNG) end to end; JSON + printable HTML verified |
| M5 tests/security/perf | **PASS** | API tests, responsive + keyboard e2e, runtime table, cold restart |
| M6 release | **PASS** | clean install from the sanitized ZIP in a fresh directory → health OK → m2 + m4 e2e pass; final regression 163/163 OK; cold restart of API (:8000), Vite (:5173) and Streamlit (:8501), then the full 5-script demo journey **twice** (run 1 on :8000, run 2 on :5173): 10/10 pass, 0 console errors, 0 5xx |

### Plan test matrix (T01–T20)

| ID | Test | Result | Evidence |
|---|---|---|---|
| T01 | Original unittest discover | PASS | 142/142 upstream tests OK; unchanged by this project |
| T02 | Health & technique list | PASS | `test_health_and_registry`: 14 techniques, all module files present, every description loads |
| T03 | JPEG upload SHA | PASS | `test_upload_preserves_bytes`; UI shows API SHA = locally computed SHA (m2) |
| T04 | PNG quantization | PASS | `not_applicable`, displayed "Not applicable — not a clean result" (m4, API test) |
| T05 | Tiny/flat image | PASS | 1×1 PNG → ELA not `ok` (`test_tiny_image_insufficient`); upstream contract test covers all 14 |
| T06 | ELA q65 vs q95 | PASS | distinct `details.quality`, cache keys and metrics; cached re-submit, forced re-run |
| T07 | Clone example → Copy-Move | PASS | 3 verified clones, 13.47 % duplicated area, warning finding, images rendered |
| T08 | Noise/resampling/FFT etc. | PASS | `test_every_technique_on_examples`: all 14 `ok` on their targeted examples; registered maps have original dims |
| T09 | Switch case during job | PASS | `test_switch_case_during_heavy_job`; Lab remounts per case |
| T10 | Compare 3 analyses | PASS | m3; no score/verdict wording asserted |
| T11 | Metadata missing & present | PASS | `test_metadata_missing_and_present`; UI "No Content Credentials present" / C2PA card |
| T12 | Identical vs recompressed | PASS | byte-identical vs "visually similar" (pHash 0, SHA & pixel SHA differ) in API test and UI |
| T13 | Export JSON | PASS | m4: SHA, analyses, limitations, artifact SHA-256s, note verbatim |
| T14 | Printable HTML | PASS | m4: escaped note, limitations, attribution, every embedded image decodes |
| T15 | Navigation during heavy job | PASS | m2: Dashboard ↔ Lab during Copy-Move; result shown when done |
| T16 | Malformed/oversized/traversal | PASS | `test_rejects_bad_uploads_and_ids`: garbage, wrong ext, truncated, empty, 48 MP bomb, 26 MB, traversal probes |
| T17 | Reload after restart | PASS | cold restart: 17 cases + results + artifacts served; old job IDs → 404 → UI reports "API restarted" |
| T18 | Responsive & keyboard | PASS | `e2e/m5_responsive_a11y.mjs`: 0 px overflow on 5 screens at 390 & 820 px; Tab to nav; viewer +/−/0 |
| T19 | Clean checkout start | PASS | `launch/package.ps1` ZIP → fresh folder → `launch/setup.ps1` (7 min) → server → m2 + m4 pass. Caveat B010 (Windows path length) |
| T20 | Attribution | PASS | LICENSE unchanged; About dialog, README, report footer credit Rafay Adeel / BSD-3-Clause |

## 2. Feature inventory

**Working (tested):**

- Dashboard: API status chips, drag-and-drop upload with server-side validation, 10 bundled example challenges
  with "known edit" text (bundled examples only), active case card with SHA-256, Quick Scan (metadata, ELA q90,
  histogram, quantization), case list with open/delete.
- Forensic Lab: custom pan/zoom viewer (wheel, drag, keyboard, fit, 1:1, pixel readout in stored pixel order);
  Original / Result / Side-by-side (synced on same grid) / Overlay (blend or wipe, **registered maps only**);
  14 methods grouped by family; ELA slider 50–95 reaching `analyze_ela`; Run / Re-run (forced); truthful job
  states with elapsed time; stale-setting notice; run history; PRNU reference manager; findings / metrics /
  tables / limitations / method guide / raw values + details.json / per-result note; regions of interest.
- Compare: 2–3 same-case results, per-column zoomable image, metrics, findings, limitations, notes; no aggregate.
- Provenance: SHA-256/512, MD5 (legacy), pixel SHA-256, pHash/dHash/aHash; same bytes / same pixels /
  similar-looking; compare upload or bundled image; metadata + offline C2PA card; ledger add/check/export/import/clear
  (unkeyed digest or HMAC with `VERITAS_LEDGER_KEY`).
- Reports: case title/description/notes, include/exclude results, per-method outcome counts (not a score),
  JSON download, printable HTML (open or download), example-challenge guide; regions drawn on the report thumbnail.
- Original Streamlit app (`start_streamlit_fallback.bat`) unchanged and running.

**Partially working / limits:**

- Jobs are in API memory: after an API restart, running jobs are lost (reported as failed in the UI); cases and
  results persist on disk.
- No cancel button (cancellation is not implemented, so none is shown).
- Copy-Move takes ~15–28 s on a 1024×576 image on this laptop (B005); PRNU ~12 s on 8 MP.

**Deferred (plan P2 / S3, intentionally not built):** model training, authenticity classifier, consensus scoring,
auth/multi-user, cloud deployment, PDF service (browser print is used), batch processing beyond Quick Scan,
multi-method spatial intersection.

## 3. Tests — actual counts

| Suite | Command | Result |
|---|---|---|
| Upstream + new, official runner | `python -m unittest discover -s tests -t .` | **Ran 163 tests in 425 s — OK** (142 upstream + 21 new; `build_artifacts/logs/final_regression_unittest.log`) |
| New API tests | `python -m pytest tests/test_api.py -o addopts=""` | 21 passed (≈99 s) |
| Frontend typecheck + build | `npm run build` | PASS (0 TS errors; 478 KB JS / 145 KB gzip) |
| Browser e2e (Edge) | `node e2e/{m2_lab,m3_compare_provenance,m4_reports,m5_responsive_a11y,p1_regions}.mjs` | 5/5 PASS on the production build (:8000); m2 + m4 also on the clean install (:8010) |

Fixed during the build (all logged in `BUG_BACKLOG.md`): B004 Lab lost its method after navigation (S1),
B006 phone-width overflow on Dashboard (S1), B008 over-narrow traversal assertion (test), B009 health label
honesty (S1). Open: B005 (CMFD runtime, S2), B010 (Windows path length, documented).

## 4. Measured runtimes (this laptop, via the API, forced re-runs)

From `build_artifacts/logs/runtimes.md` (`launch/measure_runtimes.py`):

| Technique | Example | Image | Analysis ms | End-to-end ms |
|---|---|---|---|---|
| metadata | metadata_inconsistent | JPEG 1024×576 | 11 | 108 |
| ela | ela_recompressed_patch | JPEG 1024×576 | 232 | 521 |
| histogram | histogram_contrast | PNG 1024×576 | 231 | 339 |
| quantization | ghost_q60_patch | JPEG 1024×576 | 2 | 111 |
| jpeg_ghost | ghost_q60_patch | JPEG 1024×576 | 3413 | 3668 |
| double_jpeg | ghost_q60_patch | JPEG 1024×576 | 2789 | 2949 |
| copy_move | copy_move_clone | JPEG 1024×576 | 18477 | 18720 |
| noise | noise_smoothed_region | JPEG 3264×2448 | 3917 | 4402 |
| prnu (3 refs) | iphone5c_01 | JPEG 3264×2448 | 11914 | 12440 |
| spectrum | sample | JPEG 1024×576 | 1097 | 1262 |
| jpeg_grid | sample | JPEG 1024×576 | 290 | 452 |
| resampling | resampled_upscale | PNG 1536×864 | 1555 | 1787 |
| synthetic_traces | sample | JPEG 1024×576 | 1092 | 1371 |
| steganography | stego_lsb | PNG 1024×576 | 652 | 1360 |

## 5. Borrowed vs new

- **Borrowed, unmodified:** `analysis/` (all algorithms), `Descriptions/`, `assets/`, `scripts/`, `docs/`,
  upstream `tests/test_*.py`, `app.py`, `LICENSE` — Rafay Adeel, BSD 3-Clause.
- **New:** `backend/`, `frontend/`, `tests/test_api.py`, `frontend/e2e/`, `launch/`, `*.bat`, `README_VERITAS_X.md`,
  `BUILD_STATUS.md`, `BUG_BACKLOG.md`, this report. Upstream `.gitignore` gained ignore entries only.

## 6. Data and models — honest statement

No model was trained and no dataset was downloaded. All demonstrations use the upstream bundled examples (each a
single documented synthetic edit) and the upstream sample, which is itself a known composite carrying a C2PA test
manifest (validation *Invalid*, untrusted test signer). These are demonstrations, not an evaluation set; no
accuracy is claimed. Real-dataset validation (CoMoFoD, CASIA v2, Dresden) is future work (`NEXT_STEPS.md`).

## 7. Run it

```bat
setup_veritas.bat               :: once (≈7 min: venv, pip, npm ci, UI build)
start_veritas.bat               :: http://127.0.0.1:8000   (API docs: /docs)
start_streamlit_fallback.bat    :: original app, http://localhost:8501
```

Dev mode with hot reload: `powershell -ExecutionPolicy Bypass -File launch\dev.ps1` → http://127.0.0.1:5173.
Sanitized archive: `powershell -ExecutionPolicy Bypass -File launch\package.ps1` → `dist_submission\veritas-x_<stamp>.zip`
(excludes `.venv`, `node_modules`, `frontend/dist`, `build_artifacts`, `checkpoints`, caches, secrets).

## 8. Demo script (6–7 minutes, all live)

Before: `start_veritas.bat`; open http://127.0.0.1:8000; optionally clear old cases.

1. **0:00–0:45 — Problem and contribution.** Dashboard: status chips (14 modules, offline C2PA). Say: the
   algorithms are Rafay Adeel's published-method implementations (About & credits); Veritas X adds the case
   workflow, API, viewer, comparison, provenance and reports. Point at "indicator, not proof".
2. **0:45–1:30 — Copy-move.** Example challenges → *Cloned block of the city* → Open as case. Show SHA-256 on
   the case. In the Lab press **Run** (≈15–20 s; show the honest elapsed timer and that you can click Dashboard
   and come back). Result: 3 verified clones, 13.5 % duplicated; Side by side; open the *Dense offset-field* map →
   Overlay (registered) and wipe. Use **Mark region** to box the pasted block at x≈700, y≈300.
3. **1:30–3:00 — ELA live parameter.** Dashboard → *Patch with a different compression history* → Lab → ELA:
   slider to 65 → Run; slider to 95 → stale notice → Run. Compare metrics (area above 2× expected error changes);
   overlay the ELA map. Open *Limitations*: benign causes, content dependence — why ELA is not proof.
4. **3:00–4:00 — Compare.** Back on the clone case run ELA and Metadata, open Compare: three independent columns,
   synced zoom, no score. Type a case note and save.
5. **4:00–5:00 — Provenance.** Open the upstream sample case (Dashboard → *Upstream bundled sample*): Provenance →
   Run metadata: C2PA manifest present but **Invalid** (untrusted test signer, declares AI-composite) — a real
   credential that does not validate. Compare: pick the bundled *Upstream bundled sample* → **byte-identical**;
   upload `build_artifacts\test_inputs\sample_resaved_q80.jpg` (create it with the command in README §7) →
   **visually similar** (pHash 0) while file and pixel SHA-256 differ; pick *Cloned block of the city* → **no match**
   (pHash 12 > 10: the local clone moved the perceptual hash past the threshold, while a recompression did not —
   a good illustration that perceptual hashes are similarity, not integrity). Add to ledger, check, export.
6. **5:00–5:45 — Report.** Reports: include results, Download JSON, Open printable HTML → show disclaimer, hashes,
   region box on the thumbnail, per-method limitations, attribution. Print → Save as PDF if asked.
7. **5:45–6:45 — Wrap-up.** Uses (newsrooms, insurance, teaching); tests (upstream 142 + API + browser e2e);
   limitations: no verdicts, classical methods can be fooled, CMFD is slow, examples are demonstrations.

Fallback if the React app misbehaves during the demo: `start_streamlit_fallback.bat` (same algorithms).
