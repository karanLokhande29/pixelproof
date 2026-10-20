"""
Convert an upstream result dict (which may hold NumPy arrays) into JSON-safe
data without changing what it says:

- status, summary, findings, limitations are copied verbatim;
- metrics/tables: NumPy scalars -> Python, non-finite floats -> null (+ note);
- images: each uint8 array -> a PNG artifact with a random ID (derived output,
  never the original evidence);
- details: large arrays/lists are pruned to shape/length summaries in the API
  response; the complete JSON-safe details are written to a separate file.
"""
import math

import numpy as np
from PIL import Image

from . import registry
from .storage import new_id

MAX_INLINE_LIST = 64
MAX_TABLE_ROWS = 2000


def json_safe(obj, notes=None, where=""):
    if isinstance(obj, dict):
        return {str(k): json_safe(v, notes, f"{where}.{k}") for k, v in obj.items()}
    if isinstance(obj, (list, tuple, set)):
        return [json_safe(v, notes, where) for v in obj]
    if isinstance(obj, np.ndarray):
        return json_safe(obj.tolist(), notes, where)
    if isinstance(obj, (np.bool_, bool)):
        return bool(obj)
    if isinstance(obj, (np.integer, int)):
        return int(obj)
    if isinstance(obj, (np.floating, float)):
        v = float(obj)
        if not math.isfinite(v):
            if notes is not None:
                notes.append(f"non-finite value at {where.lstrip('.')} shown as null")
            return None
        return v
    if obj is None or isinstance(obj, str):
        return obj
    if isinstance(obj, bytes):
        return f"<{len(obj)} bytes>"
    return str(obj)


def prune(obj):
    """Shrink a JSON-safe structure for the API response."""
    if isinstance(obj, dict):
        return {k: prune(v) for k, v in obj.items()}
    if isinstance(obj, list):
        if len(obj) > MAX_INLINE_LIST:
            shape = [len(obj)]
            if obj and isinstance(obj[0], list):
                shape.append(len(obj[0]))
            return {"_omitted": "large array — full values in details.json",
                    "shape": shape}
        return [prune(v) for v in obj]
    return obj


def save_png(arr, path):
    a = np.asarray(arr)
    if a.dtype != np.uint8:
        a = np.clip(np.nan_to_num(a), 0, 255).astype(np.uint8)
    Image.fromarray(a).save(path, format="PNG")
    return a.shape


def serialize(raw, technique_id, artifacts_dir, original_hw):
    """Returns (api_result_fields, full_details)."""
    notes = []
    images = []
    for caption, arr in raw.get("images", {}).items():
        aid = new_id("a")
        shape = save_png(arr, artifacts_dir / f"{aid}.png")
        registered = registry.is_registered(technique_id, caption, shape, original_hw)
        images.append({
            "label": str(caption), "artifact_id": aid, "url": f"/api/artifacts/{aid}",
            "width": int(shape[1]), "height": int(shape[0]),
            "registered": bool(registered),
            "kind": "map" if registered else "figure",
        })

    tables = {}
    for title, table in raw.get("tables", {}).items():
        t = json_safe(table, notes, f"tables.{title}")
        if isinstance(t, list) and len(t) > MAX_TABLE_ROWS:
            notes.append(f"table {title!r} truncated to {MAX_TABLE_ROWS} of {len(t)} rows")
            t = t[:MAX_TABLE_ROWS]
        tables[str(title)] = t

    details = json_safe(raw.get("details", {}), notes, "details")
    fields = {
        "status": raw["status"],
        "summary": raw["summary"],
        "findings": [{"level": f["level"], "text": f["text"]} for f in raw["findings"]],
        "metrics": json_safe(raw.get("metrics", {}), notes, "metrics"),
        "images": images,
        "tables": tables,
        "limitations": list(raw.get("limitations", [])),
        "details": prune(details),
        "serialization_notes": notes,
    }
    return fields, details
