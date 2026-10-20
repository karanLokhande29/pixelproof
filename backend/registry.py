"""
Trusted technique registry. Each ID maps to one verified upstream entry point
(see docs/API.md). Requests can only name a registry ID and parameters that
are declared here; nothing is imported from a user-supplied name.
"""
import hashlib
import re

from .storage import DESCRIPTIONS_DIR, REPO_ROOT


class ParamError(ValueError):
    pass


# Captions of outputs that are pure spatial maps in the original's stored
# pixel grid. An output is reported as `registered` (overlay-eligible) only
# if its caption matches AND its height x width equals the original's exactly.
# Composites (map already blended onto the photo), spectra, histograms, plots
# and window-resolution maps are never registered: the UI shows them side by
# side instead.
_MAPS = {
    "ela": [r"^ELA error"],
    "jpeg_ghost": [r"^Normalised difference", r"^Quality of minimum difference"],
    "double_jpeg": [r"^Probability of single compression"],
    "copy_move": [r"^Dense offset-field consistency"],
    "jpeg_grid": [r"^BAG map"],
    "resampling": [r"^Window peak ratio"],
    "prnu": [r"^Noise residual"],
}

TECHNIQUES = {
    "ela": dict(
        name="Error Level Analysis", module="ela", function="analyze_ela",
        family="JPEG compression", cost="quick", description="ELA",
        summary="Re-saves once as JPEG and maps where the error is unusual for the local texture.",
        params={"quality": dict(type="int", min=50, max=95, default=90,
                                label="Recompression quality")},
    ),
    "metadata": dict(
        name="Metadata & C2PA", module="metadata_analysis", function="analyze_metadata",
        family="Metadata & provenance", cost="quick", description="Metadata",
        summary="EXIF, XMP, PNG text and offline C2PA Content Credentials, checked for internal inconsistencies.",
    ),
    "histogram": dict(
        name="Histogram (contrast enhancement)", module="histogram_analysis",
        function="analyze_histogram", family="Pixel statistics", cost="quick",
        description="Histogram",
        summary="Stamm & Liu contrast-enhancement fingerprint: histogram peaks and gaps.",
    ),
    "quantization": dict(
        name="JPEG quantization tables", module="quant_table",
        function="analyze_quantization_table", family="JPEG compression", cost="quick",
        description="Quantization", jpeg_only=True,
        summary="Reads DQT tables, estimates IJG quality and encoder family. JPEG only.",
    ),
    "copy_move": dict(
        name="Copy-move detection", module="cmfd", function="detect_copy_move",
        family="Geometric matching", cost="heavy", description="CMFD",
        fixed={"max_px": 2048},
        summary="SIFT/RootSIFT matching + RANSAC affine and dense Zernike PatchMatch; verified clones only.",
    ),
    "noise": dict(
        name="Noise residual (Splicebuster)", module="noise_map", function="analyze_noise",
        family="Noise & sensor", cost="heavy", description="Noise_Ghost",
        summary="Co-occurrence statistics of the noise residual; finds a minority region with different noise.",
    ),
    "double_jpeg": dict(
        name="Double JPEG localisation", module="double_jpeg", function="analyze_double_jpeg",
        family="JPEG compression", cost="heavy", description="Quantization", jpeg_only=True,
        summary="Bianchi & Piva per-block double-compression likelihood map. JPEG only.",
    ),
    "jpeg_ghost": dict(
        name="JPEG ghosts", module="jpeg_ghost", function="analyze_jpeg_ghost",
        family="JPEG compression", cost="heavy", description="Noise_Ghost",
        summary="Farid's JPEG ghosts: recompress at several qualities and look for a region with an earlier quality.",
    ),
    "prnu": dict(
        name="PRNU sensor fingerprint", module="prnu", function="analyze_prnu",
        family="Noise & sensor", cost="heavy", description="PRNU", uses_references=True,
        summary="Sensor-noise fingerprint match. Needs same-camera reference photos of identical size.",
    ),
    "spectrum": dict(
        name="Power spectrum", module="frequency_analysis", function="analyze_spectrum",
        family="Frequency domain", cost="quick", description="Frequency",
        summary="Radially averaged power spectrum slope and high-frequency share.",
    ),
    "jpeg_grid": dict(
        name="JPEG block grid", module="frequency_analysis", function="analyze_blocking",
        family="Frequency domain", cost="quick", description="Frequency",
        summary="Block artifact grid origin, strength, periodicities and misaligned local grids.",
    ),
    "resampling": dict(
        name="Resampling detection", module="resampling_detector", function="detect_resampling",
        family="Frequency domain", cost="quick", description="Resampling",
        summary="Kirchner p-map spectrum and derivative projections for periodic interpolation traces.",
    ),
    "synthetic_traces": dict(
        name="Synthetic-image traces", module="deepfake_detector",
        function="analyze_synthetic_traces", family="Experimental", cost="quick",
        description="Deepfake", experimental=True,
        summary="Measures periodic spectral peaks some generators leave. NOT an AI-image classifier.",
    ),
    "steganography": dict(
        name="LSB steganalysis", module="steganography_detection", function="analyze_lsb",
        family="Steganalysis", cost="quick", description="Steganography",
        summary="Weighted-Stego / Sample-Pairs payload estimates; best on lossless images.",
    ),
}

QUICK_SCAN = ["metadata", "ela", "histogram", "quantization"]

for _tid, _t in TECHNIQUES.items():
    _t.setdefault("params", {})
    _t.setdefault("fixed", {})
    _t["map_patterns"] = [re.compile(p) for p in _MAPS.get(_tid, [])]


def _module_version(module):
    """Implementation identifier: digest of the module source + shared util.
    Changing an algorithm invalidates cached results automatically."""
    h = hashlib.sha256()
    for name in (module, "util"):
        h.update((REPO_ROOT / "analysis" / f"{name}.py").read_bytes())
    return h.hexdigest()[:12]


VERSIONS = {tid: _module_version(t["module"]) for tid, t in TECHNIQUES.items()}


def get(technique_id):
    t = TECHNIQUES.get(technique_id) if isinstance(technique_id, str) else None
    if t is None:
        raise ParamError(f"unknown technique {technique_id!r}")
    return t


def validate_params(technique_id, params):
    """Return normalised parameters, or raise ParamError. Unknown keys and
    out-of-range values are rejected, never silently clamped."""
    spec = get(technique_id)["params"]
    params = params or {}
    if not isinstance(params, dict):
        raise ParamError("parameters must be an object")
    unknown = set(params) - set(spec)
    if unknown:
        raise ParamError(f"unknown parameter(s) for {technique_id}: {sorted(unknown)}")
    out = {}
    for key, s in spec.items():
        v = params.get(key, s["default"])
        if s["type"] == "int":
            if isinstance(v, bool) or not isinstance(v, int):
                raise ParamError(f"{key} must be an integer")
            if not s["min"] <= v <= s["max"]:
                raise ParamError(f"{key} must be between {s['min']} and {s['max']}")
        out[key] = v
    return out


def is_registered(technique_id, caption, shape, original_hw):
    t = get(technique_id)
    return (tuple(shape[:2]) == tuple(original_hw)
            and any(p.search(caption) for p in t["map_patterns"]))


def public_list():
    out = []
    for tid, t in TECHNIQUES.items():
        out.append({
            "id": tid, "name": t["name"], "family": t["family"], "cost": t["cost"],
            "summary": t["summary"], "description_id": t["description"],
            "parameters": [{"key": k, **v} for k, v in t["params"].items()],
            "fixed_parameters": t["fixed"],
            "jpeg_only": t.get("jpeg_only", False),
            "experimental": t.get("experimental", False),
            "uses_references": t.get("uses_references", False),
            "in_quick_scan": tid in QUICK_SCAN,
            "entry_point": f"analysis.{t['module']}.{t['function']}",
            "version": VERSIONS[tid],
        })
    return out


def description_text(description_id):
    names = {t["description"] for t in TECHNIQUES.values()} | {"Hash_Verification"}
    if description_id not in names:
        return None
    return (DESCRIPTIONS_DIR / f"{description_id}.md").read_text(encoding="utf-8")
