"""
Case reports built only from stored, executed results. JSON references
artifacts by URL and SHA-256; the printable HTML embeds them as data URIs so
it is self-contained. Every user-supplied string is HTML-escaped.
"""
import base64
import hashlib
import io
from html import escape

from PIL import Image

from .cases import now_utc

REPORT_FORMAT = "pixelproof-report/1"
DISCLAIMER = ("Every result is an indicator, not proof. Each technique detects one kind of "
              "trace under stated conditions; a result without findings means only that this "
              "test found no inconsistency at its sensitivity. This report contains no overall "
              "authenticity verdict, probability or legal-admissibility assessment.")
ATTRIBUTION = ("Forensic algorithms: Veritas / Forensic-Image-Analysis-Toolkit by Rafay Adeel "
               "(BSD 3-Clause, https://github.com/CodeRafay/Forensic-Image-Analysis-Toolkit). "
               "PixelProof case workflow, API adapter, UI and reports are an integration layer "
               "around those unmodified modules.")
MAX_HTML_TABLE_ROWS = 60


def outcome(result):
    """Per-method factual grouping by status and finding levels (not a verdict)."""
    s = result["status"]
    if s == "error":
        return "failed"
    if s in ("insufficient_data", "not_applicable"):
        return "inconclusive"
    levels = {f["level"] for f in result["findings"]}
    if "warning" in levels:
        return "inconsistency reported"
    if "notice" in levels:
        return "weak indicator reported"
    return "no inconsistency at this test's sensitivity"


def _artifact_sha(store, aid):
    p = store.artifact_path(aid)
    return hashlib.sha256(p.read_bytes()).hexdigest() if p else None


def build(store, case, selected_ids=None):
    results = store.results_for(case)
    if selected_ids:
        wanted = set(selected_ids)
        results = [r for r in results if r["id"] in wanted]
    analyses = []
    for r in results:
        analyses.append({
            "result_id": r["id"], "technique_id": r["technique_id"],
            "technique": r["technique_name"], "family": r["family"],
            "entry_point": r["entry_point"], "implementation_version": r["implementation_version"],
            "parameters": r["parameters"], "fixed_parameters": r.get("fixed_parameters", {}),
            "created_utc": r["created_utc"], "elapsed_ms": r.get("elapsed_ms"),
            "status": r["status"], "outcome": outcome(r), "summary": r["summary"],
            "findings": r["findings"], "metrics": r["metrics"], "tables": r["tables"],
            "limitations": r["limitations"], "analyst_note": r.get("analyst_note", ""),
            "references_used": r.get("references_used"),
            "serialization_notes": r.get("serialization_notes", []),
            "images": [{**{k: img[k] for k in ("label", "artifact_id", "url", "width",
                                               "height", "registered")},
                        "sha256": _artifact_sha(store, img["artifact_id"])}
                       for img in r["images"]],
        })
    counts = {}
    for a in analyses:
        counts[a["status"]] = counts.get(a["status"], 0) + 1
    return {
        "report_format": REPORT_FORMAT,
        "generated_utc": now_utc(),
        "disclaimer": DISCLAIMER,
        "attribution": ATTRIBUTION,
        "case": {**{k: case[k] for k in ("id", "title", "description", "notes",
                                         "created_utc", "updated_utc", "source", "known_edit")},
                 "regions_of_interest": case.get("regions", [])},
        "evidence": {"original": case["original"], "hashes": case["hashes"],
                     "references": case["references"]},
        "status_counts": counts,
        "analyses": analyses,
        "selection": "selected results" if selected_ids else "all completed results of this case",
    }


# ── HTML ───────────────────────────────────────────────────────────
def _thumb_data_uri(path, max_side=900):
    with Image.open(path) as im:
        im = im.convert("RGB")
        im.thumbnail((max_side, max_side))
        buf = io.BytesIO()
        im.save(buf, "JPEG", quality=85)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()


def _png_data_uri(path):
    return "data:image/png;base64," + base64.b64encode(path.read_bytes()).decode()


def _fmt(v):
    if isinstance(v, float):
        return f"{v:.4g}"
    return "—" if v is None else str(v)


def _table_html(table):
    if isinstance(table, list) and table and isinstance(table[0], dict):
        cols = list(dict.fromkeys(k for row in table for k in row))
        rows = table[:MAX_HTML_TABLE_ROWS]
        head = "".join(f"<th>{escape(str(c))}</th>" for c in cols)
        body = "".join("<tr>" + "".join(f"<td>{escape(_fmt(row.get(c)))}</td>" for c in cols)
                       + "</tr>" for row in rows)
        more = (f"<p class='muted'>{len(table) - len(rows)} more rows in the JSON report.</p>"
                if len(table) > len(rows) else "")
        return f"<table><thead><tr>{head}</tr></thead><tbody>{body}</tbody></table>{more}"
    if isinstance(table, dict):
        items = list(table.items())[:MAX_HTML_TABLE_ROWS]
        body = "".join(f"<tr><th>{escape(str(k))}</th><td>{escape(_fmt(v) if not isinstance(v, (dict, list)) else str(v))}</td></tr>"
                       for k, v in items)
        return f"<table class='kv'>{body}</table>"
    if isinstance(table, list) and not table:
        return "<p class='muted'>(empty)</p>"
    return f"<pre>{escape(str(table))}</pre>"


CSS = """
:root{--ink:#0f172a;--muted:#475569;--line:#cbd5e1;--accent:#0f766e;--warn:#b45309}
*{box-sizing:border-box}body{font:14px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:var(--ink);background:#fff;margin:0;padding:32px;max-width:1080px;margin:auto}
h1{font-size:24px;margin:0 0 4px}h2{font-size:18px;border-bottom:2px solid var(--ink);padding-bottom:4px;margin-top:32px}
h3{font-size:16px;margin:0}.muted{color:var(--muted)}.disclaimer{border:1px solid var(--warn);background:#fffbeb;padding:10px 14px;border-radius:6px}
table{border-collapse:collapse;width:100%;margin:8px 0;font-size:12.5px}td,th{border:1px solid var(--line);padding:4px 6px;text-align:left;vertical-align:top;word-break:break-word}
th{background:#f1f5f9}table.kv th{width:32%}.mono{font-family:ui-monospace,Consolas,monospace;font-size:12px;word-break:break-all}
.analysis{border:1px solid var(--line);border-radius:8px;padding:14px 16px;margin:16px 0;break-inside:avoid-page}
.badge{display:inline-block;padding:1px 8px;border-radius:999px;font-size:12px;border:1px solid var(--line);margin-left:6px}
.s-ok{background:#ecfdf5;border-color:#6ee7b7}.s-error{background:#fef2f2;border-color:#fca5a5}.s-insufficient_data,.s-not_applicable{background:#fffbeb;border-color:#fcd34d}
.f-warning{border-left:4px solid #dc2626;padding-left:8px}.f-notice{border-left:4px solid #d97706;padding-left:8px}.f-info{border-left:4px solid #94a3b8;padding-left:8px}
figure{margin:8px 0;display:inline-block;max-width:48%;vertical-align:top}figure img{max-width:100%;border:1px solid var(--line)}figcaption{font-size:12px;color:var(--muted)}
.notes{white-space:pre-wrap;border:1px dashed var(--line);padding:8px;border-radius:6px}
@media print{body{padding:0}.noprint{display:none}a{color:inherit}}
"""


def render_html(store, case, report):
    e = escape
    orig = case["original"]
    h = case["hashes"]
    thumb = _thumb_data_uri(store.original_path(case))
    parts = [f"<!doctype html><html lang='en'><head><meta charset='utf-8'>"
             f"<meta name='viewport' content='width=device-width,initial-scale=1'>"
             f"<title>PixelProof report — {e(case['title'])}</title><style>{CSS}</style></head><body>",
             "<p class='noprint muted'>Use your browser's Print command to save this report as PDF.</p>",
             f"<h1>PixelProof — case report</h1><p class='muted'>Case {e(case['id'])} · generated {e(report['generated_utc'])} · {e(report['selection'])}</p>",
             f"<p class='disclaimer'><strong>Read first.</strong> {e(DISCLAIMER)}</p>",
             "<h2>Case</h2><table class='kv'>",
             f"<tr><th>Title</th><td>{e(case['title'])}</td></tr>",
             f"<tr><th>Description</th><td>{e(case['description'] or '—')}</td></tr>",
             f"<tr><th>Created (UTC)</th><td>{e(case['created_utc'])}</td></tr>",
             f"<tr><th>Source</th><td>{e(case['source']['kind'])}: {e(case['source']['display_name'])}</td></tr>",
             "</table>"]
    if case.get("known_edit"):
        k = case["known_edit"]
        parts.append(f"<p><strong>Known edit (bundled example, documented by the upstream project):</strong> {e(k['edit'])}</p>")
    parts.append(f"<h3>Analyst notes</h3><div class='notes'>{e(case['notes'] or '(none)')}</div>")

    parts += ["<h2>Evidence identity</h2><table class='kv'>",
              f"<tr><th>File</th><td>{e(orig['display_name'])} — {e(orig['format'])}, {orig['width']}×{orig['height']} px, {orig['size']:,} bytes</td></tr>",
              f"<tr><th>SHA-256 (file bytes)</th><td class='mono'>{e(h['sha256'])}</td></tr>",
              f"<tr><th>SHA-512 (file bytes)</th><td class='mono'>{e(h['sha512'])}</td></tr>",
              f"<tr><th>Pixel SHA-256 (decoded pixels)</th><td class='mono'>{e(h['pixel_sha256'])}</td></tr>",
              f"<tr><th>pHash / dHash / aHash (similarity only)</th><td class='mono'>{e(h['phash'])} / {e(h['dhash'])} / {e(h['ahash'])}</td></tr>",
              "</table>"]
    regions = case.get("regions", [])
    W, H = orig["width"], orig["height"]
    rects = "".join(
        f"<rect x='{g['x']}' y='{g['y']}' width='{g['w']}' height='{g['h']}' fill='none' stroke='#f59e0b' stroke-width='{max(W, H) / 300:.1f}'/>"
        f"<text x='{g['x']}' y='{max(g['y'] - 4, 12)}' fill='#f59e0b' font-size='{max(W, H) / 45:.0f}' font-family='sans-serif'>{i + 1}</text>"
        for i, g in enumerate(regions))
    parts.append(f"<figure style='max-width:60%'><svg viewBox='0 0 {W} {H}' style='width:100%;border:1px solid #cbd5e1' role='img' aria-label='original preview'>"
                 f"<image href='{thumb}' x='0' y='0' width='{W}' height='{H}'/>{rects}</svg>"
                 "<figcaption>Display thumbnail, re-encoded for this report only (stored pixel order). Hashes above refer to the original file, "
                 "which is stored unmodified." + (" Numbered boxes are analyst-marked regions." if regions else "") + "</figcaption></figure>")
    if regions:
        parts.append("<h3>Analyst-marked regions of interest (pixel coordinates of the original)</h3>"
                     "<table><thead><tr><th>#</th><th>x</th><th>y</th><th>width</th><th>height</th><th>Label</th></tr></thead><tbody>"
                     + "".join(f"<tr><td>{i + 1}</td><td>{g['x']}</td><td>{g['y']}</td><td>{g['w']}</td><td>{g['h']}</td><td>{e(g['label'] or '—')}</td></tr>"
                               for i, g in enumerate(regions)) + "</tbody></table>")

    parts.append("<h2>Summary by method</h2><p class='muted'>Each row is one independent method. Rows are not combined into a score.</p><table><thead><tr><th>Method</th><th>Parameters</th><th>Status</th><th>Outcome</th><th>Summary</th></tr></thead><tbody>")
    for a in report["analyses"]:
        parts.append(f"<tr><td>{e(a['technique'])}</td><td class='mono'>{e(str(a['parameters'] or '—'))}</td>"
                     f"<td>{e(a['status'])}</td><td>{e(a['outcome'])}</td><td>{e(a['summary'])}</td></tr>")
    if not report["analyses"]:
        parts.append("<tr><td colspan='5' class='muted'>No analyses were run for this case.</td></tr>")
    parts.append("</tbody></table>")

    parts.append("<h2>Analyses</h2>")
    for a in report["analyses"]:
        parts.append(f"<section class='analysis'><h3>{e(a['technique'])}<span class='badge s-{e(a['status'])}'>{e(a['status'])}</span></h3>"
                     f"<p class='muted'>{e(a['family'])} · <span class='mono'>{e(a['entry_point'])}</span> · version {e(a['implementation_version'])} · "
                     f"params {e(str(a['parameters']))} {e(str(a['fixed_parameters'] or ''))} · run {e(a['created_utc'])} · {e(_fmt(a['elapsed_ms']))} ms · result {e(a['result_id'])}</p>"
                     f"<p><strong>{e(a['summary'])}</strong></p>")
        if a["findings"]:
            parts.append("<h4>Findings</h4>" + "".join(
                f"<p class='f-{e(f['level'])}'><strong>{e(f['level'])}:</strong> {e(f['text'])}</p>" for f in a["findings"]))
        if a["metrics"]:
            parts.append("<h4>Metrics</h4>" + _table_html(a["metrics"]))
        for img in a["images"]:
            p = store.artifact_path(img["artifact_id"])
            if p:
                parts.append(f"<figure><img src='{_png_data_uri(p)}' alt='{e(img['label'])}'><figcaption>{e(img['label'])} · {img['width']}×{img['height']} · sha256 {e((img['sha256'] or '')[:16])}…</figcaption></figure>")
        for title, table in a["tables"].items():
            parts.append(f"<h4>{e(title)}</h4>" + _table_html(table))
        if a.get("references_used"):
            parts.append("<h4>Reference photos used</h4>" + _table_html(a["references_used"]))
        parts.append("<h4>Limitations — what this test cannot see</h4><ul>" +
                     "".join(f"<li>{e(l)}</li>" for l in a["limitations"]) + "</ul>")
        if a["analyst_note"]:
            parts.append(f"<h4>Analyst note</h4><div class='notes'>{e(a['analyst_note'])}</div>")
        parts.append("</section>")
    parts.append(f"<h2>Attribution</h2><p>{e(ATTRIBUTION)}</p></body></html>")
    return "".join(parts)
