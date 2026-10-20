# VERITAS X — Complete 12-Hour Implementation Plan

> **Canonical build specification.** Version 1.0 · 20 October 2026  
> **Project:** Veritas X — An Explainable Multi-Technique Visual Evidence Investigation Platform  
> **Build context:** 1 developer, 1 workstation, Claude Code, hard 12-hour execution window.  
> **Authoritative companion:** `VERITAS_X_CLAUDE_PROMPTS.md`. Read both before making changes.  
> **Source repository:** https://github.com/CodeRafay/Forensic-Image-Analysis-Toolkit  
> **Source ZIP:** https://github.com/CodeRafay/Forensic-Image-Analysis-Toolkit/archive/refs/heads/main.zip  
> **Working assumption:** Original repository extracted or cloned into the directory from which Claude Code is launched. Never assume its tests pass until executed locally.

---

## 0. Executive decisions — do not deviate casually

1. **CV first:** This is a Computer Vision mini-project, **not** a CV + ATSA fusion project. No time-series functionality, model training, Kaggle, or GPU is required.
2. **Engine preservation:** Retain the original repository's `analysis/` source algorithms, `Descriptions/`, `assets/`, `scripts/`, `tests/`, existing `app.py`, and its `LICENSE`. Build an independent React + FastAPI UI around the *verified public analysis entry points*. The Streamlit app remains a demo-safe fallback.
3. **Single-process development cadence:** One Claude Code session builds sequentially, runs tests, records evidence, and continues to the next acceptance gate. Avoid branch merging, separate agents, or refactoring the whole repo.
4. **New value:** Interactive case workflow, evidence comparison, registered overlays, provenance tools, structured reporting, graceful processing and responsive UI are your project contribution. Core algorithms are reused and credited.
5. **No invented authenticity verdict:** Outputs are *indicators*, not proof; never output a universal fake/real, manipulation probability, or legal admissibility score.
6. **Every displayed result real:** Do not hard-code fake detections, completed job statuses, metrics, or reports. Optional mock data are permitted only during frontend scaffolding; remove/disable from production routes and demo.
7. **Failure protection:** At hour 8, if the new frontend is not functional, pivot to an enhanced Streamlit front end on the proven original code rather than leaving an unfinished React app. Preserve the last passing build.
8. **Deadline:** At ~hour 10, freeze features; reserve 2 hours for validation, run instructions, and demo preparation. Do not spend the last hour training a model that is not needed.

### Definition and academic fit

The provided `Mini Project_definitions.docx` states: (i) choose any mini-project title, (ii) project must have a real-life application, (iii) preference for daily-life/MPSTME usefulness, and (iv) lab-session final demonstration is scheduled for 19–24 October. It permits teams of 2–3, but this implementation is being executed by one developer. The project's application is image/media integrity triage for journalism, insurance review, education and digital-evidence screening. The project is a *new investigative workflow*, not a claim to have invented its constituent published forensic algorithms.

The user's `mini_project_BTech_AI_CVFAI.xlsx` has 20 filled titles (and some blank group rows). We checked the titles, including industrial/fabric defect detection, CCTV assessment, facial attendance, document/finance analysis, biometric authentication, visual search, negative-obstacle detection, satellite construction monitoring, candlestick analysis and pose/exercise tracking. None is titled or centered on multi-method image-forensic evidence investigation. See Appendix B for complete list.

## 1. Scope and measurable success

### Must-have outcomes (P0 — demonstrate each)

- Original Streamlit application launches; relevant existing tests run (document failures honestly).
- Upload JPEG or PNG *without re-encoding the original*; choose a bundled sample; create a case with unique ID, description, notes and SHA-256.
- Functional forensic methods: ELA, metadata/C2PA, histogram, copy-move, JPEG quantization, resampling, frequency spectrum/blocking; expose more via registry if straightforward.
- Original/result viewer with zoom, pan, fit/reset; ELA quality slider 50–95 truly changes backend input; support registered maps as aligned overlay only when valid.
- Select and compare 2–3 executed methods on same evidence; show actual method-specific metrics, findings, output images, `status`, and limitations.
- Provenance screen: metadata, SHA-256, perceptual similarity / hash ledger, with exact vs visually similar distinctions.
- Report screen: case metadata, results, timestamps, methods, notes, limitations; download JSON and printable HTML containing actual artifacts.
- Quick Scan limited to lightweight methods; unsupported JPEG-only tests show `not_applicable`, not a clean verdict.
- New UI has 5 functional screens with reliable navigation, loading/error/empty states, no dead buttons and real backend data.
- Startup commands, complete `README` and a 5–7 minute recorded or repeatable demonstration procedure.

### Strong stretch outcomes (P1 — only after P0 gates)

- Browser-side before/after comparison wipe with aligned source + heatmap where technically valid.
- Async job progress/polling for all long-running methods; avoid blocking navigation.
- Gallery of documented edits from `assets/examples/examples.json` and guided challenge walkthroughs.
- Running selected methods in a small background batch (never entire heavyweight list by default).
- Cache by file hash + technique + validated parameter object + implementation version.
- Optional simple ROI annotation for visual inspection (not resaving the original).

### Defer by default (P2)

- Neural network training, image authenticity classifier, accuracy claims on production images, custom U-Net, PRNU local fingerprint training without sufficient references, sophisticated automated consensus scoring.
- Auth/login, hosted DB, multi-user collaboration, full cloud deployment, vector database, LLM chatbot, mobile-native app, realtime camera feed.
- Actual PDF generating service (printable HTML is sufficient), huge batch processing, pixel-accurate multi-method spatial intersections unless registered outputs support it.

### Acceptance definition for “complete”

“Complete” means all **P0** flows pass end-to-end and restart correctly, **not** that every idea in the original research roadmap was implemented. Mark P1/P2 honestly as postponed when appropriate. Demo screenshots alone do not prove functionality.

## 2. Existing repository — verified architecture

Source repository uses Python 3.10, Streamlit and reusable per-technique modules. Key documents inspected: `README.md`, `app.py`, `docs/API.md`, `docs/DEPLOYMENT.md`, `NEXT_STEPS.md`, `analysis/util.py` and `tests/test_contract.py`.

### Existing result contract — preserve exactly

Every analysis entry point returns a dictionary with:

```python
{
    "status": "ok" | "insufficient_data" | "not_applicable" | "error",
    "summary": str,
    "findings": [{"level": "info" | "notice" | "warning", "text": str}],
    "metrics": {"human readable label": int | float | str},
    "images": {"caption": np.ndarray},
    "tables": {"title": list[dict] | dict},
    "limitations": [str],
    "details": {...}  # can contain large numerical arrays
}
```

Do not change this contract in the original modules. Make a separate API serialization layer that converts arrays to image artifacts; validates JSON-safe scalars; prunes or separately saves huge nested arrays from `details` while keeping original results in server memory or a bounded cache. An `error` status is not success; `not_applicable` is not “image clean.”

### Existing main entry points (read `docs/API.md` to reconfirm signatures before coding)

| Registry ID | Original call | Input constraints | Cost tier / UI |
|---|---|---|---|
| `ela` | `analysis.ela.analyze_ela(path, quality=90)` | JPEG/PNG; `quality` 50–95 | Quick; adjustable slider |
| `metadata` | `analysis.metadata_analysis.analyze_metadata(path)` | Any supported image | Quick; provenance |
| `histogram` | `analysis.histogram_analysis.analyze_histogram(path)` | Supported image | Quick; chart |
| `quantization` | `analysis.quant_table.analyze_quantization_table(path)` | JPEG only | Quick for JPEG |
| `copy_move` | `analysis.cmfd.detect_copy_move(path, max_px=2048)` | >=64 px; expensive | Advanced; region matches |
| `noise` | `analysis.noise_map.analyze_noise(path)` | >=256 px, sufficient texture | Advanced; heatmap |
| `double_jpeg` | `analysis.double_jpeg.analyze_double_jpeg(path)` | JPEG only | Advanced |
| `jpeg_ghost` | `analysis.jpeg_ghost.analyze_jpeg_ghost(path)` | Usually JPEG | Advanced |
| `prnu` | `analysis.prnu.analyze_prnu(path, reference_paths=...)` | Proper same-camera references | Advanced/manual |
| `spectrum` | `analysis.frequency_analysis.analyze_spectrum(path)` | Image | Quick/advanced |
| `jpeg_grid` | `analysis.frequency_analysis.analyze_blocking(path)` | Image | Advanced |
| `resampling` | `analysis.resampling_detector.detect_resampling(path)` | >=64 px | Advanced |
| `synthetic_traces` | `analysis.deepfake_detector.analyze_synthetic_traces(path)` | Experimental only | Advanced/warning |
| `steganography` | `analysis.steganography_detection.analyze_lsb(path)` | Best interpreted on lossless images | Advanced |
| `hashes` | `analysis.hash_verification.compute_hashes(path)` | Image | Provenance |

**Non-negotiable caveats:** `synthetic_traces` is **not** a universal AI-generated-image detector; PRNU without matching reference photos cannot identify a camera; perceptual hashes are similarity indicators, not cryptographic integrity; ELA flags differences that can arise for benign reasons. Always display original `limitations`.

### Existing samples and tests

- `assets/examples/` includes deliberately altered examples such as copy-move, ELA patches, JPEG ghost, metadata inconsistencies, noise, resampling and steganography. `assets/examples/examples.json` describes expected edits.
- Existing Streamlit `app.py` includes file upload, single-technique panels and temporary session directory.
- Original `tests/test_contract.py` checks all public result contracts against image formats, tiny/flat images and prohibits strong authenticity claims.
- The repository documents 142 tests. The *actual* passing count must be determined locally. Runtime benchmarks in the repository are not guarantees on this laptop.

## 3. Project architecture and boundaries

### Target directory tree (keep existing repo at root)

```text
<existing-source-root>/
├── analysis/                    # ORIGINAL, DO NOT REWRITE
├── assets/                      # originals + example cases
├── Descriptions/               # method explanations
├── docs/                       # existing upstream docs
├── tests/                      # original tests; add new tests here
├── app.py                      # original working Streamlit fallback
├── LICENSE                     # preserve
├── backend/
│   ├── main.py
│   ├── registry.py             # approved method list, typed params, costs
│   ├── schemas.py              # API request/response models
│   ├── serializer.py           # NumPy -> PNG assets, JSON-safe metrics
│   ├── cases.py                # local case store, SHA, immutable original
│   ├── jobs.py                 # bounded processing + job status
│   ├── reports.py              # JSON and printable HTML
│   ├── storage.py              # safe directories/paths/cleanup
│   └── requirements-api.txt
├── frontend/
│   ├── package.json
│   ├── src/
│   │   ├── pages/{Dashboard,Investigation,Comparison,Provenance,Reports}.tsx
│   │   ├── components/{AppShell,UploadZone,ImageCanvas,EvidencePanel,
│   │   │              ResultStatus,TechniqueCard,FindingsPanel,CaseHeader}.tsx
│   │   ├── lib/api.ts
│   │   ├── lib/types.ts
│   │   └── styles/
│   └── vite.config.ts
├── build_artifacts/             # gitignored cases, results, logs
├── VERITAS_X_IMPLEMENTATION_PLAN.md
├── VERITAS_X_CLAUDE_PROMPTS.md
├── BUILD_STATUS.md             # created by Claude
├── BUG_BACKLOG.md              # created by Claude
└── FINAL_BUILD_REPORT.md       # created by Claude at end
```

### Execution topology

`React/Vite (localhost:5173)` → `/api` proxied to `FastAPI/Uvicorn (localhost:8000)` → trusted registry → original `analysis.*` method → result serializer → bounded local artifact storage → React view. Never execute arbitrary function names or accept arbitrary local file paths from API callers.

**Default frontend choice:** React + Vite + TypeScript + Tailwind; install minimal components (shadcn/ui optional if install works quickly). Use `react-zoom-pan-pinch` for viewer; Recharts optionally; avoid adding huge libraries just for animations. Desktop-first with responsive tablet layout; mobile can collapse sidebar.

**Fallback:** Retain original Streamlit and, at hour 8 if needed, build a cohesive modified Streamlit layout using existing `render()`; prioritize functioning algorithms and exports over incomplete React routes. Document fallback in `BUILD_STATUS.md`.

## 4. Detailed UI specification and acceptance contracts

### Global shell

- Visual design: dark editorial/technical theme. E.g. slate background, white text, restrained cyan/teal accents and amber warning signals; accessible contrasts, modern typography, consistent spacing, no decorative clutter.
- Persistent left nav: **Dashboard**, **Forensic Lab**, **Compare**, **Provenance**, **Reports**. Header shows case title, file format and current job count. Breadcrumbs show selected case/method.
- Case context persists while navigating. Display loading, empty, success, `not_applicable`, insufficient, and failure states distinctly. No animation may hide computation delays.
- Keyboard accessible controls, visible focus states; limit to purposeful motion. Display source files' original image dimensions and hash.

### Page A — Dashboard (P0)

**Functional:** choose built-in example from manifest, upload JPG/JPEG/PNG, create case, set case name/notes, show metadata, SHA-256 and case ID, open Lab, choose Quick Scan. Gallery displays `known edit` labels only for included synthetic training examples, never for unknown uploads.

**Accept when:** new case loads exact original bytes, hash matches local SHA, original is unchanged after analysis, gallery image loads, Quick Scan launches appropriate methods and returns distinct statuses.

### Page B — Forensic Lab (P0, hero screen)

Layout: large 16:10 investigation image panel + right methods/metrics sidebar + bottom findings/limitations tabs. Supports zoom, pan, fit, reset, optional compare side-by-side; method selector from registry with **real** per-method settings; ELA recompression-quality slider; run/cancel UI state; recent result list. Outputs include images, metrics, tables, limitations, and method explanations from `Descriptions/`.

**Overlay rule:** Only map arrays with the same pixel coordinate space, known transformation, and matching geometry can be blended with the original. For purely visual already-composited output images, display side-by-side rather than blending blindly. Histograms, DCT plots, FFT spectra and unmatched-size maps are **not** overlays. A slider is hidden/disabled unless the selected method supports it. If uncertain, display original + result side by side.

**Accept when:** ELA quality 65 and 95 produce different parameter metadata/recomputed results; changing a method never displays the previous method's evidence; file switch invalidates stale results; tests with bundled copy-move example show actual matching output.

### Page C — Compare (P0)

Choose 2–3 completed method results from same case; grid each result with method, status, summary, key metrics and one selected image; expandable all results, findings and limitations. Allow investigator notes, return to Lab with selected method. No numerical “consensus fake score.” Optional corroboration should be worded as overlapping visual indicators only where coordinate alignment is verified.

**Accept when:** comparing ELA, Copy-Move, Metadata of same case returns independent real method-specific outputs and cannot mix results from another case.

### Page D — Provenance (P0)

Metadata C2PA overview, full EXIF tables where available, source file hashes, perceptual hashes, ledger add/check/import/export; distinguish **same bytes**, **same decoded pixels**, and **similar-looking**. Optional compare second uploaded image for hash distance. For files without C2PA data show `No credential present`, not fake.

**Accept when:** exact duplicate matches SHA; deliberately recompressed copy does not match byte SHA but may match perceptual similarity; ledger import/export roundtrip validates according to whether HMAC secret is configured.

### Page E — Reports & Example Challenges (P0)

Editable case summary, analyst notes, methods/results timeline, summary of supported vs inconclusive results, findings with source technique, original caveats, image evidence thumbnails (from actual runs), download **JSON** and printable **HTML** with embedded/linked artifacts. Optionally expose example-gallery guides so user can select one documented manipulation and learn which method targets it.

**Accept when:** report export includes exactly real completed analyses and notes; no template metrics; no broken artifact links; printable from browser; user sees limitation section; selected case never leaks another case's original.

### Navigation / API loading behavior

- Most UI actions use cached existing response. Only `Run` or explicit `Re-run` invokes forensic backend computation. Param edits mark prior result *stale*, not updated until run; optional debounced rerun for ELA only after proven reliable.
- Job polling every ~1–2 s while active; stop polling at terminal state. A job should report `queued`, `running`, `succeeded`, or `failed` accurately. Cancel button must be omitted unless cancellation genuinely works.
- All API/network failures display retry; no spinner stays forever. Prohibit working buttons that only trigger toast messages.

## 5. Backend API contracts and data structures

### Suggested endpoints (routes can differ only if frontend/types/tests updated together)

| Method | Route | Request/response essentials |
|---|---|---|
| `GET` | `/api/health` | API version, tool availability, samples present; no fake success |
| `GET` | `/api/techniques` | ID/name/category/description/parameters/cost/support |
| `GET` | `/api/examples` | manifest item IDs, titles, sample URLs and documented manipulation |
| `POST` | `/api/cases` | multipart upload or trusted example ID; creates case; returns ID, size, hash |
| `GET` | `/api/cases/{case_id}` | case metadata and analysis IDs |
| `GET` | `/api/cases/{case_id}/original` | original bytes served safely |
| `PATCH` | `/api/cases/{case_id}` | title/notes; validated lengths |
| `POST` | `/api/cases/{case_id}/analyses` | `{technique_id, parameters}` → job ID or cached result ID |
| `GET` | `/api/jobs/{job_id}` | queued/running/succeeded/failed and result reference |
| `GET` | `/api/results/{result_id}` | common result contract converted to JSON + URLs |
| `GET` | `/api/artifacts/{artifact_id}` | authorized PNG/JPEG analytical output |
| `GET` | `/api/cases/{case_id}/report.json` | evidence report JSON |
| `GET` | `/api/cases/{case_id}/report.html` | printable HTML |
| `DELETE` | `/api/cases/{case_id}` | cleanup of case-owned artifacts |

### Example API result

```json
{
  "id": "r_123",
  "case_id": "c_123",
  "technique_id": "ela",
  "parameters": {"quality": 90},
  "status": "ok",
  "summary": "Observed JPEG recompression differences ...",
  "findings": [{"level": "notice", "text": "..."}],
  "metrics": {"Area above 2x expected error (%)": 12.3},
  "images": [{"label": "ELA error", "url": "/api/artifacts/a_123", "kind": "analysis", "registered": false}],
  "tables": {},
  "limitations": ["..."],
  "details": {"quality": 90},
  "elapsed_ms": 317
}
```

**Example values above are contract illustrations only; never display them as actual measurements.** A map whose registration is unknown defaults `registered=false`.

### Serializer constraints

1. Convert `np.integer`, `np.floating`, tuples and `np.bool_` to JSON-compatible types; reject/encode non-finite floats as null + note if needed.
2. Save `result["images"]` arrays to PNG artifacts by generated random IDs; preserve their labels; no raw base64 megabytes in the main JSON route.
3. Avoid including multi-megabyte `details` numeric maps in the response; store them as separate assets or return summary metadata. Don't silently change underlying result.
4. Status preservation exact; never translate `insufficient_data` to `ok`.
5. Keep original, accepted image immutable; `GET .../original` streams exact bytes. Do not EXIF-transpose and overwrite it.

### Case and caching constraints

- Validate magic bytes/file decoding and extension; JPEG/PNG only initially. Enforce <=25 MB upload and <=40 million decoded pixels (or stricter for heavy methods). Reject decompression bombs. `Image.MAX_IMAGE_PIXELS` and `warnings` safeguards.
- Generate random UUID/token IDs; store in a per-case directory; never trust original filename as path; prohibit `../` traversal, accidental multi-case media access and symlink access outside storage root.
- Capture original SHA-256 as hash; cache by `(SHA256, method_id, normalized_params, implementation/version identifier)`. Avoid caching by filename.
- Cap simultaneous expensive jobs (1–2) and total in-memory results. For CPU-bound heavy methods use a bounded background executor; if using threads, confirm responsive behavior and cap image size. ProcessPool is acceptable if pickle/process setup works locally. Return truthful statuses.
- Expire/clear old temp artifacts eventually, but keep demo session files available. Do not commit uploads or model/dataset outputs.
- Report method failures as `error`, do not crash backend. Capture traceback privately in logs, sanitized message in browser.

## 6. Work packages — detailed feature delivery

### WP0: Initial audit / baseline (hour 0–1)

**Inputs:** original source. Verify `python3.10` available; if not choose compatible available interpreter after checking package wheels, not a blind upgrade. Run `python -m unittest discover -s tests -t .` and `streamlit run app.py` (health/browser test). Test bundled ELA, metadata and Copy-Move. Capture results in `BUILD_STATUS.md` with actual commands/time. Make a protected source copy or git checkpoint.

**Pass gate:** original app launches, 3 representative methods yield structured outputs, no destructive changes to source. **Failure:** fix only blockers for up to ~45 minutes; if pins incompatible, isolate original venv or minimally adapt with regression tests. Do not rewrite algorithms.

### WP1: API adapter (hour 1–2.5)

Implement registry + FastAPI case upload and sample listing, analysis jobs, serialization, artifact service and health. Test with `TestClient` HTTP calls, then `curl` upload. Test ELA (`quality=65`) and metadata; JPEG-only test on PNG. Parameter validation strict. Convert small result images to true URLs. Use direct result/async jobs consistently.

**Pass gate:** curl → upload sample → run ELA → poll/get result → fetch PNG works; no fake fixtures in API.

### WP2: App shell + investigation loop (hour 2.5–5)

Scaffold Vite, TS and Tailwind. Implement nav, dashboard/upload/gallery, case selection, Lab, original image viewer, technique selector, run button, returned findings and images, proper status. Wire to API with TS definitions (one contract), query caching. Add ELA slider that changes *backend* parameters. Focus hero screen before polishing secondary pages.

**Pass gate:** real upload → real ELA and Copy-Move results visible via React, navigation unaffected during analysis.

### WP3: Comparison + provenance (hour 5–7)

Compare executed methods in same case. Add metadata/C2PA renderers, hash display and ledger wrappers based on `analysis.hash_verification`. No claims about external signature legal status. Ensure example gallery is useful. Handle empty results and missing EXIF. Start building report link.

**Pass gate:** compare three methods, exact/similar hash comparison and no case cross-contamination.

### WP4: Reports + guided demos + quick scan (hour 7–8.5)

Add case notes and download real JSON/printable HTML report. Quick Scan registry: `metadata`, `ela`, `histogram`, plus JPEG `quantization`; skip quantization for PNG or show not applicable clearly. Sample guided known edits from manifest. Optional background batch with progress.

**Pass gate:** full first-to-last user journey complete on at least two bundled samples.

### WP5: Styling, performance, regression, docs (hour 8.5–10)

Implement diff/overlay only if geometry support; improve chart/table presentational polish; test statuses and browser errors. Cap heavy job memory. Add tests for API, upload, samples, serializations, report, case isolation. Execute original suite and new suite. Write startup helper scripts if needed.

**Pass gate:** full demo passes twice on restart, no broken primary actions.

### WP6: Freeze, validation, delivery (hour 10–12)

Do not implement new features. Run acceptance matrix and measure actual runtimes on representative small/medium examples. Make `FINAL_BUILD_REPORT.md` with completed/deferred tasks, tests, runtime, known limitations, commands and honest dataset/model explanation. Prepare 7-minute demonstration. If React incomplete invoke fallback decision and visibly mark completed vs missing features. Package source excluding venv, `node_modules`, sensitive uploads/secrets and generated caches.

**Pass gate:** one-command or two-command local startup, runnable demo, evidence of passing tests and reports.

## 7. 12-hour timetable and go/no-go

| Time elapsed | Milestone | Mandatory proof | Escalation |
|---|---|---|---|
| 0:00–1:00 | Original baseline | Streamlit + unit tests or documented blocker | Fix core blocker, do not redesign |
| 1:00–2:30 | API backbone | `curl` upload → real ELA JSON/image | Simplify job layer but preserve functionality |
| 2:30–5:00 | Hero UI | React upload → analyze → real overlay/result | No new screens until fixed |
| 5:00–7:00 | Compare/provenance | 3 method comparisons, hashes | Defer advanced ledger UI if needed |
| 7:00–8:30 | Reports/quick scan | end-to-end case & export | **Pivot to Streamlit** if React core still unusable |
| 8:30–10:00 | Regression/polish | working 5-screen journey | Cut P1; repair failing P0 |
| 10:00–12:00 | Feature freeze + release | restart + demo twice + final report | no more new dependencies/architectures |

**Time budget override:** If environment setup runs 90 minutes behind schedule, go directly to a redesigned Streamlit UI (original code) and retain multi-method comparison, guided gallery, cases and exports as P0. Do not spend 4 hours on frontend tooling while analysis works.

## 8. Bug triage policy — mandatory

Record every discovered issue in `BUG_BACKLOG.md`:

`ID | time | severity | scope | reproduction | expected | actual | assigned checkpoint | status | fix evidence`.

- **S0 / blocker:** app cannot start; uploaded file corrupted; API contract broken; report leaks data; unsafe file handling; forensic algorithm produces falsified results; complete case isolation fails. **Fix immediately** before proceeding. If unfixed within ~20–30 min, roll back to last stable checkpoint or use approved fallback.
- **S1 / small localized:** typo, missing import, CSS z-index, broken endpoint due to obvious param name, one-off TS types, small runtime exception. **Fix immediately**, rerun targeted tests; avoid refactoring unrelated modules.
- **S2 / nonblocking:** minor misalignment, advanced-mode slow for 12 MP, optional method not yet handled, P1 visual issue. **Log it, continue**, batch-fix during WP5/WP6 if time remains.
- **S3 / enhancement:** optional animation, batch mode, PDF, theme toggle, expensive additional algorithms. **Log as deferred**, do not implement before all P0 gates.

If there is no clear severity, choose the path that preserves a functioning end-to-end demo. Repeat failures after 2 focused attempts mean create reproduction, log cause, rollback/fallback rather than endless loops.

**Never defer:** security/data integrity, wrong analysis image, false result labeling, case mixing, wrong method params, inaccessible core upload, final report broken. **Never silently mark failed tests as passing.**

## 9. Testing: acceptance matrix

| ID | Test | Expected |
|---|---|---|
| T01 | Original `unittest discover` | Pass or documented original failures, no regressions introduced |
| T02 | Health and technique list | Match backend installed methods, no dead links |
| T03 | Upload JPEG; SHA256 check | Bytes and computed digest unchanged |
| T04 | Upload PNG; quantization | `not_applicable` distinctly displayed |
| T05 | Upload tiny/flat image | `insufficient_data`, never “clean” |
| T06 | ELA q=65 vs q=95 | Parameter routing correct; distinct execution/cache keys |
| T07 | Clone example → Copy-Move | Returned actual output rendered with findings |
| T08 | Noise/resampling/FFT on relevant samples | Real result images and limitations, correct status |
| T09 | Switch case during running job | No stale result from previous case |
| T10 | Compare 3 analyses | Same-case only; no synthetic aggregate fake score |
| T11 | Metadata missing and present | Empty state vs tables handled without crashes |
| T12 | Identical vs recompressed images | SHA exactness distinguished from perceptual similarity |
| T13 | Export case JSON | Valid JSON; actual selected analyses and limitations |
| T14 | Printable HTML report | Includes real findings/images with working links/embedded assets |
| T15 | Browser navigation during heavy job | UI usable and progress/error terminates |
| T16 | Upload malformed/oversized image | Graceful validated error; no traversal |
| T17 | Reload after restart | Local state/demo artifact handling clear; no false persistence claims |
| T18 | Responsive main screens | No unusable overflow; controls keyboard operable |
| T19 | Clean checkout start commands | Installs/boots under documented platform |
| T20 | Source attribution | BSD license and upstream algorithms credited; new work identifiable |

Automate where possible with Pytest/Unittest (backend) and Playwright if installed quickly (frontend). A manual run with timestamped checklist is acceptable if browser automation installation is blocked. Record **actual counts**, do not invent 100% coverage.

## 10. Dataset and evaluation method

**Default:** bundled manipulated sample images in `assets/examples/` and original sample `assets/sample images/sampleImg.jpeg`. These are demonstration cases, **not** independent training/test datasets. Since the project uses published classical algorithms, retraining is unnecessary.

**Optional within 12 hours:** Create a small local validation set with known synthetic edits (separate original vs edited copies and record transformations) plus a few independent clean photographs with permission. Document sample provenance, methods, and whether detection indicators align. Do not present accuracy rates over a handful of curated examples as statistically generalizable.

**Potential external evaluation after deadline:** CoMoFoD (copy-move), CASIA v2 (splicing), Dresden camera sensor photos (PRNU), subject to downloads/licensing. Refer to original `NEXT_STEPS.md`. Do not let dataset downloads consume the build window.

### CV technical points for report/viva

- ELA: JPEG re-encoding residuals, dependence on image content and quality.
- Copy-move: SIFT/RootSIFT keypoint matching, geometric verification (RANSAC/affine hypotheses), false matches on repeated textures.
- Noise: local high-order residual statistics / inconsistency, susceptibility to natural textured regions and camera pipelines.
- Frequency: FFT and periodicity/compression grid anomalies.
- JPEG: DCT quantization, double compression and JPEG-ghost limitations.
- Provenance: EXIF/XMP/C2PA versus cryptographic SHA and perceptual pHash.

Demonstrate at least **four different CV families** and one **independently validated UI/workflow contribution**; never claim new model architecture when none was trained.

## 11. Performance, UX and safety

- Case upload max recommended 25 MB and 40 MP decoded; original repo caps 40 MP; heavy tools are downscaled/cropped **in memory only where their documented algorithm permits**. Never re-encode originals before forensic analysis.
- Cache small derived results; evict oldest/large images; avoid rendering every output simultaneously. Thumbnail lists remain lightweight, full image loaded on demand.
- Use a bounded worker. Prevent 3 concurrent 40 MP analyses. Sample heavy method runtimes on laptop; display honest progress as stage/status rather than fabricated percent completion.
- Use lightweight UI animations and skeletons only; maintain keyboard accessibility and high contrast. No dead filters, no hover-only critical controls.
- Sanitize user-supplied case titles/notes in HTML reports and frontend (no untrusted HTML execution); set appropriate `Content-Disposition`; use protected, generated artifact IDs; clean temp files.
- No remote uploads or third-party calls for sensitive image analysis; do not accidentally include uploaded files in public build archives. If C2PA reader is offline, label it offline.

## 12. Completion documents written by Claude Code

Claude Code must create/update:

- `BUILD_STATUS.md` — start time, phase, completed acceptance IDs, next action, actual commands/results, build choice, remaining time.
- `BUG_BACKLOG.md` — ranked issues, deferred work and fixes as per Section 8.
- `FINAL_BUILD_REPORT.md` — feature inventory (working / partially working / deferred), passing test counts, runtime and install instructions, known limitations, borrowed vs newly built components, demo flow, and final archive structure.
- `README_VERITAS_X.md` — student-ready description, problem statement, architecture, setup and run commands, screenshots if available, source attribution, algorithm explanations and evaluation honesty.

### Technical attribution

Keep source `LICENSE` and include license/credits in new UI About panel and docs. Source algorithms are BSD-3-Clause; follow its notice and redistribution conditions. UI/layout and integration are the new project work. Per-method references can link to `Descriptions/*.md` and `docs/API.md` from the original codebase. Do not state original published algorithms are newly invented.

## 13. Final demo (6–7 minutes)

1. **30–45 s:** State problem and source/your additions; show dashboard and original image bytes/hash.
2. **45 s:** Select included known-copy-move case, open viewer, run clone matching.
3. **90 s:** Open ELA example; q65 vs q95; show actual images/metrics and why ELA is not definitive proof.
4. **60 s:** Compare ELA, Copy-Move, Metadata findings with limitations.
5. **60 s:** Provenance: show metadata, SHA vs perceptual similarity/ledger.
6. **45 s:** Add analyst note and download report JSON/HTML.
7. **30–45 s:** Discuss real-world uses and tests, show failures/limitations transparently.

Keep 2–3 pre-tested examples small enough for fast inference; also demonstrate at least one *new live parameter change* so it is clearly a working app, not a video mockup.

## 14. Final release checklist

- [ ] Original algorithm code preserved, source license retained.
- [ ] Original Streamlit baseline launches.
- [ ] New React/FastAPI app runs or explicitly documented fallback is deployed.
- [ ] 5 main pages exist and core controls are functional.
- [ ] JPEG/PNG upload/preview, SHA and case IDs work.
- [ ] At least 7 actual CV methods usable through UI, 4 CV technique families demonstrated.
- [ ] ELA slider parameters truly affect backend operation.
- [ ] Existing examples produce actual image outputs with correct method labels.
- [ ] Compare workspace restricts to same case; provenance hashes work.
- [ ] JSON/HTML report exports real case data and original limitations.
- [ ] All P0 tests or clearly explained fallback decisions documented.
- [ ] No fake probability/authenticity score, made-up runtime, fabricated labels or data.
- [ ] Heavy analyses don't lock navigation indefinitely.
- [ ] Clean launch instructions validated on one machine.
- [ ] `BUILD_STATUS.md`, `BUG_BACKLOG.md`, `FINAL_BUILD_REPORT.md`, and `README_VERITAS_X.md` complete.

## Appendix A — Authoritative external references

- Source repository: https://github.com/CodeRafay/Forensic-Image-Analysis-Toolkit
- Source ZIP (main): https://github.com/CodeRafay/Forensic-Image-Analysis-Toolkit/archive/refs/heads/main.zip
- Original API specification: https://github.com/CodeRafay/Forensic-Image-Analysis-Toolkit/blob/main/docs/API.md
- Original deployment guide: https://github.com/CodeRafay/Forensic-Image-Analysis-Toolkit/blob/main/docs/DEPLOYMENT.md
- Original known limitations: https://github.com/CodeRafay/Forensic-Image-Analysis-Toolkit/blob/main/NEXT_STEPS.md
- Original repository license: https://github.com/CodeRafay/Forensic-Image-Analysis-Toolkit/blob/main/LICENSE
- College materials: user-provided `Mini Project_definitions.docx` and `mini_project_BTech_AI_CVFAI.xlsx` (not included in upstream repo; conclusions checked separately).

## Appendix B — Already registered titles screened from Excel

1. Smart Document and Finance Analyzer using Layout LLM
2. Computational Neuroscience Framework for Depression Severity Prediction Using Biomarkers
3. Improving AI Based Defect Detection on the MVTec AD2 benchmark
4. Automated Attendance Sytem
5. Camera-Based Exercise Tracking Using Human Pose Estimation and Gamification
6. Surface Defect Detection for Fabrics
7. Cancelable Multimodal Biometric Authentication for Critical Infrastructure
8. Zero-Shot & Few-Shot Industrial Defect Segmentation
9. AI-Driven Cognitive Surveillance with Automated CCTV Vulnerability Assessment Penetration Testing
10. Vision Language Model For Autonomous trading bots
11. Real-Time Facial Recognition-Based Automated Attendance Management System
12. Illegal Construction detection and remote sensing using satellite imagery and change detection
13. Automated Microscopic Blood Cell Counting & Pathology Analysis
14. Real-Time Indian Sign Language Storyteller
15. Count number of cars in a parking lot and identify empty parking place
16. Negative Obstacle Detector
17. Visual Search Engine Using Deep Image Embeddings
18. Real-Time Candlestick Pattern Detection & AI Trade-Signal Recommendation
19. SAR-Turbo4: Saliency Aware Quantization for vector databases
20. Composition Detection of Havenly Bodies

The proposed Veritas X problem is not titled in this list. Novelty means meaningful integration and user workflow contribution, **not** that no related image-forensics research exists.
