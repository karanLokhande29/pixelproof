# Veritas X — An Explainable Multi-Technique Visual Evidence Investigation Platform

B.Tech AI — Computer Vision mini-project. A local web application for **image-integrity triage**: open a case for a
photo, run independent published image-forensics methods on the exact uploaded bytes, inspect each method's
output against the original, compare methods side by side, check provenance, and export a report.

> **Every result is an indicator, not proof.** Each method detects one kind of trace under stated conditions.
> A forged image can pass every test; an unedited one can trigger findings. Veritas X has **no** authenticity
> score, manipulation probability, consensus verdict or legal-admissibility assessment — by design.

---

## 1. Problem and real-world use

Photos are routinely submitted as evidence of something: an insurance claim, a news tip, a marketplace listing,
an academic figure. Checking them today means running scattered tools and copying numbers by hand, and the
usual "AI says 87 % fake" answer is not defensible. Veritas X gives an investigator one workflow that keeps the
original file untouched and hashed, runs several **independent** classical CV techniques, shows **what each one
measured and what it cannot see**, and produces a reproducible report.

Typical users: journalism verification desks, insurance claim reviewers, teachers demonstrating image
forensics, and anyone doing first-pass digital-evidence screening.

## 2. What is reused and what is new

| Part | Origin |
|---|---|
| All 14 forensic algorithms in `analysis/`, method guides in `Descriptions/`, example images in `assets/`, upstream tests in `tests/test_*.py` (except `test_api.py`), the Streamlit app `app.py` | **Upstream, unmodified**: *Veritas — Forensic Image Analysis Toolkit* by Rafay Adeel, BSD 3-Clause — <https://github.com/CodeRafay/Forensic-Image-Analysis-Toolkit>. The algorithms implement published methods (Krawetz; Farid; Bianchi & Piva; Amerini et al.; Cozzolino, Poggi & Verdoliva; Lukáš, Fridrich & Goljan; Kirchner; Gallagher; Stamm & Liu; Ker & Böhme; Dumitrescu; Corvi et al.; Durall et al.; Li, Yuan & Yu). |
| `backend/` FastAPI adapter (case store, registry, worker pool, serializer, ledger wrapper, reports) | **New** (this project) |
| `frontend/` React + TypeScript + Tailwind UI (5 screens, custom evidence viewer) | **New** |
| `tests/test_api.py`, `frontend/e2e/*.mjs` | **New** |
| `launch/`, `*.bat`, this README, `BUILD_STATUS.md`, `BUG_BACKLOG.md`, `FINAL_BUILD_REPORT.md` | **New** |

The only upstream file touched is `.gitignore` (added ignore entries for generated folders). No algorithm was
changed or re-implemented; the upstream suite (142 tests) passes unchanged.

## 3. Architecture

```
Browser (React, :5173 dev or served by the API on :8000)
   │  /api/*  (JSON, multipart uploads, PNG artifacts)
   ▼
FastAPI  backend/main.py
   ├─ cases.py     validate upload (signature, extension, full decode, ≤25 MB, ≤40 MP) → store bytes read-only, SHA-256
   ├─ registry.py  14 named techniques → verified upstream entry points; strict parameter validation
   ├─ jobs.py      2 "quick" + 1 "heavy" worker processes; queued/running/succeeded/failed; per-case result cache
   ├─ worker.py    runs analysis.<module>.<function>(original_path, **params) in the worker process
   ├─ serializer.py NumPy → JSON-safe; images → PNG artifacts with random IDs; large details → separate file
   ├─ ledger.py    upstream hash-chain ledger, persisted locally
   └─ reports.py   JSON + self-contained printable HTML (escaped, CSP-restricted)
   ▼
build_artifacts/cases/<case_id>/{original.jpg|png, case.json, results/, artifacts/, refs/, compare/}
```

Key guarantees:

- **Original bytes are evidence.** They are written once, marked read-only, served back byte-identical with an
  `X-Evidence-SHA256` header, and every analysis reads that file directly. Nothing is re-encoded before analysis.
- **No arbitrary execution or paths.** Requests name a registry ID only; IDs are random tokens validated by
  pattern; every path is resolved and checked to stay inside the storage root.
- **Honest statuses.** `insufficient_data` and `not_applicable` are shown as *not clean*; method failures are
  `error`; job crashes are `failed`. The upstream `limitations` of each result are always shown and exported.
- **Overlay only when geometry is valid.** An output can be blended/wiped over the original only if it is a pure
  map (not a composite, spectrum or plot) **and** has exactly the original's pixel dimensions. Everything else is
  side by side. The viewer shows the original in stored pixel order (EXIF orientation not applied), matching what
  the algorithms read.
- **Cases are isolated.** Results, artifacts and reports are owned by one case; the UI remounts per case.

## 4. The five screens

1. **Dashboard** — API/system status, upload (drag & drop), bundled example challenges with their documented
   edit, active case card (ID, file, format, dimensions, size, SHA-256), **Quick Scan** (metadata, ELA q90,
   histogram, JPEG quantization — never heavy methods), cases on this machine.
2. **Forensic Lab** — pan/zoom viewer (wheel, drag, `+`/`-`, `0` fit, `1` actual pixels, arrows, live pixel
   coordinates) with Original / Result / Side-by-side (synced when grids match) / Overlay (blend or wipe;
   registered maps only). Method list grouped by CV family; per-method settings (ELA quality slider 50–95 sent to
   `analyze_ela`), Run / Re-run, honest elapsed-time job status, stale-result warning when settings change, run
   history, PRNU reference-photo manager. **Mark region**: drag a rectangle on the original (or a registered map)
   to record a region of interest in original pixel coordinates — an annotation saved to the case and drawn in the
   report; the evidence file is never modified. Tabs: findings, metrics, tables, limitations, method guide (upstream
   `Descriptions/*.md`), raw values (+ full `details.json`), analyst note.
3. **Compare** — pick 2–3 executed results of the same case; each column shows status, summary, a zoomable
   output image, key metrics, findings, limitations and a per-result note. No aggregate.
4. **Provenance** — SHA-256/512, MD5 (legacy), pixel SHA-256, pHash/dHash/aHash with the *same bytes / same pixels /
   similar-looking* distinction; compare a second upload or bundled image; EXIF/XMP/C2PA (offline reader) incl.
   "No Content Credentials present"; hash ledger add / check / export / import / clear.
5. **Reports** — case title/description/notes, choose results to include, per-method outcome counts (not a score),
   JSON download, printable HTML (open or download; print to PDF from the browser), example-challenge guide.

## 5. Techniques (CV families)

| Family | Techniques (registry IDs) |
|---|---|
| JPEG compression | ELA (`ela`), quantization tables (`quantization`), double-JPEG localisation (`double_jpeg`), JPEG ghosts (`jpeg_ghost`) |
| Geometric matching | Copy-move: SIFT/RootSIFT g2NN + RANSAC affine + dense Zernike PatchMatch (`copy_move`) |
| Noise & sensor | Splicebuster noise residual (`noise`), PRNU sensor fingerprint (`prnu`) |
| Frequency domain | Power spectrum (`spectrum`), JPEG block grid (`jpeg_grid`), resampling detection (`resampling`) |
| Pixel statistics | Contrast-enhancement histogram fingerprint (`histogram`) |
| Steganalysis | LSB payload estimation (`steganography`) |
| Metadata & provenance | EXIF/XMP/C2PA consistency (`metadata`), cryptographic + perceptual hashes, hash ledger |
| Experimental | Synthetic-image spectral traces (`synthetic_traces`) — measurements only, **not** an AI-image classifier |

## 6. Setup and run (Windows, verified)

Verified on Windows 11, Python 3.12.10, Node 22.20.0 / npm 10.9.3. The upstream pins in `requirements.txt` all
install on Python 3.12 (upstream targets 3.10, which also works).

```bat
setup_veritas.bat          :: once: .venv, pip install (upstream pins + backend/requirements-api.txt), npm ci, UI build
start_veritas.bat          :: API + built UI  ->  http://127.0.0.1:8000
start_streamlit_fallback.bat :: original upstream Streamlit app -> http://localhost:8501
```

Manual equivalent (any OS):

```bash
python -m venv .venv
.venv\Scripts\activate            # Windows   (source .venv/bin/activate on macOS/Linux)
pip install -r requirements.txt -r backend/requirements-api.txt
cd frontend && npm ci && npm run build && cd ..
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000    # open http://127.0.0.1:8000
```

Development with hot reload: `powershell -ExecutionPolicy Bypass -File launch\dev.ps1`
(API on :8000, Vite on http://127.0.0.1:5173 proxying `/api`).

Optional: set `VERITAS_LEDGER_KEY` before starting the API to HMAC-sign ledger exports.
Optional: `VERITAS_STORAGE` to move case storage (default `build_artifacts/`).

Troubleshooting:

- `ImportError: DLL load failed ... The filename or extension is too long` — the project folder is too deep for
  Windows' 260-character path limit (Pillow's DLL lives deep inside `.venv`). Move the folder to a shorter path
  (e.g. `C:\veritas-x`) and run `setup_veritas.bat` again.
- Port 8000 busy — run `.venv\Scripts\python -m uvicorn backend.main:app --port 8001` and open that port.
- `python -m pytest` complains about `--cov` — the upstream `pytest.ini` expects `pytest-cov`; use
  `python -m unittest discover -s tests -t .` or `pytest -o addopts=""`.
- A job shows *failed: API restarted* — jobs live in API memory; cases and results persist on disk. Run it again.

## 7. Tests

```bash
python -m unittest discover -s tests -t .              # upstream 142 + Veritas X API tests (one command)
python -m pytest tests/test_api.py -o addopts=""       # API tests only (upstream pytest.ini needs pytest-cov)
cd frontend && npm run typecheck && npm run build
# browser end-to-end (servers running; uses the installed Microsoft Edge via Playwright):
node e2e/m2_lab.mjs http://127.0.0.1:8000
node e2e/m3_compare_provenance.mjs http://127.0.0.1:8000
node e2e/m4_reports.mjs http://127.0.0.1:8000
node e2e/m5_responsive_a11y.mjs http://127.0.0.1:8000
node e2e/p1_regions.mjs http://127.0.0.1:8000
```
(Set `PW_CHANNEL=chrome` to drive Google Chrome instead of Edge.)

`e2e/m3_compare_provenance.mjs` needs a re-saved copy of the sample:
`python -c "from PIL import Image; Image.open('assets/sample images/sampleImg.jpeg').save('build_artifacts/test_inputs/sample_resaved_q80.jpg', quality=80)"`.
Actual counts and timings are in `FINAL_BUILD_REPORT.md`.

## 8. Evaluation honesty

- No model was trained; no dataset was downloaded. The algorithms are classical and parameterised as published
  upstream.
- Demonstration images are the upstream bundled examples (`assets/examples/`, documented in `examples.json`) and
  the upstream sample, which is itself a **known composite** with a C2PA test manifest. These are demonstrations,
  not a test set; no accuracy figure in this project generalises from them.
- Upstream measured rates (in `Descriptions/*.md`) come from images generated for that project and are labelled
  optimistic by its author (`NEXT_STEPS.md`). Real-dataset validation (CoMoFoD, CASIA v2, Dresden) is future work.

## 9. License and attribution

The upstream code is © 2025 Rafay Adeel under the BSD 3-Clause License (see `LICENSE`, retained unchanged). Its
notice and disclaimer apply to the redistributed analysis modules. The Veritas X integration layer (backend,
frontend, tests, scripts, docs listed above) is the new contribution of this project; it does not claim to have
invented any of the forensic algorithms.
