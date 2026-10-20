"""
Runs inside a worker process: call one registered upstream entry point on the
case's original file, then serialize its output. Only JSON-safe data travels
back to the API process.
"""
import importlib
import time
import traceback
import warnings
from pathlib import Path

from PIL import Image

from . import registry, serializer

MAX_PIXELS = 40_000_000


def _init():
    Image.MAX_IMAGE_PIXELS = MAX_PIXELS
    warnings.simplefilter("error", Image.DecompressionBombWarning)


def run_technique(technique_id, original_path, params, reference_paths, artifacts_dir):
    _init()
    t = registry.get(technique_id)
    kwargs = {**t["fixed"], **params}
    if t.get("uses_references"):
        kwargs["reference_paths"] = list(reference_paths) or None
    artifacts_dir = Path(artifacts_dir)
    fn = getattr(importlib.import_module(f"analysis.{t['module']}"), t["function"])
    started = time.time()
    try:
        raw = fn(str(original_path), **kwargs)
    except Exception as exc:  # entry points should never raise; be safe anyway
        traceback.print_exc()
        from analysis.util import error_result
        raw = error_result(exc)
    elapsed_ms = int((time.time() - started) * 1000)
    with Image.open(original_path) as im:
        original_hw = (im.height, im.width)
    fields, details = serializer.serialize(raw, technique_id, artifacts_dir, original_hw)
    fields["elapsed_ms"] = elapsed_ms
    return fields, details
