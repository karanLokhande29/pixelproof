"""
PixelProof API tests (new work, not upstream). Real HTTP calls through
FastAPI's TestClient against the real analysis modules; storage goes to a
temporary directory.
"""
import hashlib
import io
import json
import os
import shutil
import tempfile
import unittest
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
TMP = Path(tempfile.mkdtemp(prefix="pixelproof_api_test_"))
os.environ["PIXELPROOF_STORAGE"] = str(TMP)
os.environ.pop("PIXELPROOF_LEDGER_KEY", None)

from fastapi.testclient import TestClient  # noqa: E402

from backend import serializer  # noqa: E402
from backend.main import app  # noqa: E402

EX = ROOT / "assets" / "examples"
SAMPLE = ROOT / "assets" / "sample images" / "sampleImg.jpeg"


def png_bytes(arr):
    buf = io.BytesIO()
    Image.fromarray(arr).save(buf, "PNG")
    return buf.getvalue()


class APITest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.ctx = TestClient(app)
        cls.c = cls.ctx.__enter__()

    @classmethod
    def tearDownClass(cls):
        cls.ctx.__exit__(None, None, None)
        shutil.rmtree(TMP, ignore_errors=True)

    # helpers
    def upload(self, data, name="evidence.jpg", title=""):
        return self.c.post("/api/cases", files={"file": (name, data)}, data={"title": title})

    def upload_ok(self, path):
        r = self.upload(Path(path).read_bytes(), Path(path).name)
        self.assertEqual(r.status_code, 201, r.text)
        return r.json()

    def run_tech(self, case_id, tid, params=None, force=False):
        r = self.c.post(f"/api/cases/{case_id}/analyses",
                        json={"technique_id": tid, "parameters": params or {}, "force": force})
        self.assertEqual(r.status_code, 202, r.text)
        job = r.json()
        job = self.wait(job["id"])
        self.assertEqual(job["status"], "succeeded", job)
        return job, self.c.get(f"/api/results/{job['result_id']}").json()

    def wait(self, job_id, timeout=180):
        import time
        end = time.time() + timeout
        while time.time() < end:
            j = self.c.get(f"/api/jobs/{job_id}").json()
            if j["status"] not in ("queued", "running"):
                return j
            time.sleep(0.2)
        self.fail("job timed out")

    # T02
    def test_health_and_registry(self):
        h = self.c.get("/api/health").json()
        self.assertEqual(h["status"], "ok")
        self.assertTrue(h["all_technique_modules_found"])
        t = self.c.get("/api/techniques").json()
        ids = {x["id"] for x in t["techniques"]}
        self.assertEqual(len(ids), 14)
        self.assertEqual(t["quick_scan"], ["metadata", "ela", "histogram", "quantization"])
        for x in t["techniques"]:
            d = self.c.get(f"/api/descriptions/{x['description_id']}")
            self.assertEqual(d.status_code, 200, x["description_id"])
        self.assertEqual(self.c.get("/api/descriptions/..%2FLICENSE").status_code, 404)
        ex = self.c.get("/api/examples").json()["examples"]
        self.assertGreaterEqual(len(ex), 9)
        self.assertEqual(self.c.get(ex[0]["image_url"]).status_code, 200)

    # T03 + original immutability
    def test_upload_preserves_bytes(self):
        data = SAMPLE.read_bytes()
        case = self.upload_ok(SAMPLE)
        self.assertEqual(case["original"]["sha256"], hashlib.sha256(data).hexdigest())
        self.assertEqual(case["hashes"]["sha256"], case["original"]["sha256"])
        self.run_tech(case["id"], "ela", {"quality": 80})
        served = self.c.get(case["original_url"])
        self.assertEqual(served.content, data)
        self.assertEqual(served.headers["x-evidence-sha256"], case["original"]["sha256"])
        on_disk = next((TMP / "cases" / case["id"]).glob("original.*"))
        self.assertEqual(on_disk.read_bytes(), data)
        self.assertFalse(os.access(on_disk, os.W_OK), "original must be read-only")
        self.assertNotIn("stored_as", case["original"])

    # T04 + quick scan
    def test_png_quick_scan_quantization_not_applicable(self):
        case = self.upload_ok(EX / "histogram_contrast.png")
        r = self.c.post(f"/api/cases/{case['id']}/quick-scan")
        self.assertEqual(r.status_code, 202)
        jobs = r.json()["jobs"]
        self.assertEqual([j["technique_id"] for j in jobs], ["metadata", "ela", "histogram", "quantization"])
        statuses = {}
        for j in jobs:
            j = self.wait(j["id"])
            self.assertEqual(j["status"], "succeeded")
            statuses[j["technique_id"]] = self.c.get(f"/api/results/{j['result_id']}").json()["status"]
        self.assertEqual(statuses["quantization"], "not_applicable")
        self.assertEqual(statuses["ela"], "ok")

    # T05
    def test_tiny_image_insufficient(self):
        r = self.upload(png_bytes(np.full((1, 1, 3), 99, np.uint8)), "tiny.png")
        self.assertEqual(r.status_code, 201, r.text)
        _, res = self.run_tech(r.json()["id"], "ela")
        self.assertIn(res["status"], ("insufficient_data", "not_applicable", "error"))
        self.assertNotEqual(res["status"], "ok")

    # T06
    def test_ela_quality_reaches_backend_and_caches(self):
        case = self.upload_ok(EX / "ela_recompressed_patch.jpg")
        j65, r65 = self.run_tech(case["id"], "ela", {"quality": 65})
        j95, r95 = self.run_tech(case["id"], "ela", {"quality": 95})
        self.assertEqual(r65["details"]["quality"], 65)
        self.assertEqual(r95["details"]["quality"], 95)
        self.assertNotEqual(j65["cache_key"], j95["cache_key"])
        self.assertIn("q65", r65["summary"])
        self.assertIn("q95", r95["summary"])
        self.assertNotEqual(r65["metrics"], r95["metrics"])
        again = self.c.post(f"/api/cases/{case['id']}/analyses",
                            json={"technique_id": "ela", "parameters": {"quality": 65}}).json()
        self.assertTrue(again["cached"])
        self.assertEqual(again["result_id"], r65["id"])
        jf, rf = self.run_tech(case["id"], "ela", {"quality": 65}, force=True)
        self.assertFalse(jf["cached"])
        self.assertNotEqual(rf["id"], r65["id"])
        img = self.c.get(r65["images"][0]["url"])
        self.assertEqual(img.status_code, 200)
        self.assertEqual(img.headers["content-type"], "image/png")
        self.assertTrue(r65["images"][0]["registered"])
        self.assertFalse(r65["images"][1]["registered"])  # red composite: side by side only

    def test_parameter_validation(self):
        case = self.upload_ok(SAMPLE)
        url = f"/api/cases/{case['id']}/analyses"
        for body in ({"technique_id": "ela", "parameters": {"quality": 49}},
                     {"technique_id": "ela", "parameters": {"quality": 96}},
                     {"technique_id": "ela", "parameters": {"quality": "90"}},
                     {"technique_id": "ela", "parameters": {"quality": True}},
                     {"technique_id": "ela", "parameters": {"evil": 1}},
                     {"technique_id": "metadata", "parameters": {"quality": 90}},
                     {"technique_id": "os.system", "parameters": {}},
                     {"technique_id": "ela", "parameters": {}, "extra": 1}):
            self.assertEqual(self.c.post(url, json=body).status_code, 422, body)

    # T07
    def test_copy_move_example(self):
        case = self.c.post("/api/cases/from-example", json={"example_id": "copy_move_clone"}).json()
        self.assertEqual(case["known_edit"]["techniques"], ["copy_move"])
        _, res = self.run_tech(case["id"], "copy_move")
        self.assertEqual(res["status"], "ok")
        self.assertGreaterEqual(res["metrics"]["Verified clones"], 1)
        self.assertTrue(any(f["level"] == "warning" for f in res["findings"]))
        self.assertEqual(res["fixed_parameters"], {"max_px": 2048})
        self.assertTrue(res["limitations"])

    # T10 / T09-style isolation
    def test_case_isolation(self):
        a = self.upload_ok(SAMPLE)
        b = self.upload_ok(EX / "copy_move_clone.jpg")
        _, ra = self.run_tech(a["id"], "histogram")
        self.assertEqual(ra["case_id"], a["id"])
        self.assertEqual(self.c.get(f"/api/cases/{b['id']}/results").json()["results"], [])
        rep = self.c.get(f"/api/cases/{b['id']}/report.json", params={"results": ra["id"]}).json()
        self.assertEqual(rep["analyses"], [])
        self.assertEqual(rep["evidence"]["hashes"]["sha256"], b["original"]["sha256"])

    # T11
    def test_metadata_missing_and_present(self):
        present = self.c.post("/api/cases/from-example", json={"example_id": "metadata_inconsistent"}).json()
        _, rp = self.run_tech(present["id"], "metadata")
        self.assertEqual(rp["status"], "ok")
        self.assertIn("Camera", rp["tables"])
        bare = self.upload(png_bytes(np.random.default_rng(1).integers(0, 255, (300, 300, 3), np.uint8)), "bare.png")
        _, rb = self.run_tech(bare.json()["id"], "metadata")
        self.assertEqual(rb["status"], "ok")
        self.assertEqual(rb["metrics"]["EXIF tags (count)"], 0)

    # T12
    def test_provenance_exact_vs_similar(self):
        case = self.upload_ok(SAMPLE)
        same = self.c.post(f"/api/cases/{case['id']}/provenance/compare-upload",
                           files={"file": ("copy.jpeg", SAMPLE.read_bytes())}).json()
        self.assertTrue(same["same_bytes"])
        self.assertEqual(same["classification"], "byte-identical")
        buf = io.BytesIO()
        Image.open(SAMPLE).save(buf, "JPEG", quality=80)
        resaved = self.c.post(f"/api/cases/{case['id']}/provenance/compare-upload",
                              files={"file": ("resaved.jpg", buf.getvalue())}).json()
        self.assertFalse(resaved["same_bytes"])
        self.assertFalse(resaved["same_pixels"])
        self.assertEqual(resaved["classification"], "visually similar")
        self.assertLessEqual(resaved["distances"]["phash"], resaved["threshold_bits"])

    def test_ledger_roundtrip_unkeyed(self):
        self.c.delete("/api/ledger")
        case = self.upload_ok(SAMPLE)
        self.assertEqual(self.c.post("/api/ledger/records", json={"case_id": case["id"]}).status_code, 201)
        chk = self.c.post(f"/api/ledger/check/{case['id']}").json()
        self.assertEqual(chk["metrics"]["Byte-identical matches"], 1)
        exported = self.c.get("/api/ledger/export").content
        self.assertEqual(json.loads(exported)["signature"]["alg"], "SHA-256")
        self.c.delete("/api/ledger")
        rep = self.c.post("/api/ledger/import", files={"file": ("l.json", exported)}).json()
        self.assertTrue(rep["accepted"])
        self.assertEqual(rep["merged"], 1)
        tampered = json.loads(exported)
        tampered["records"][0]["note"] = "edited"
        self.c.delete("/api/ledger")
        rep2 = self.c.post("/api/ledger/import",
                           files={"file": ("l.json", json.dumps(tampered).encode())}).json()
        self.assertFalse(rep2["accepted"])
        self.assertEqual(self.c.get("/api/ledger").json()["stats"]["records"], 0)
        bad = self.c.post("/api/ledger/import", files={"file": ("x.json", b'{"a":1}')})
        self.assertEqual(bad.status_code, 422)

    def test_ledger_roundtrip_hmac(self):
        case = self.upload_ok(SAMPLE)
        try:
            os.environ["PIXELPROOF_LEDGER_KEY"] = "test-key-1"
            self.c.delete("/api/ledger")
            self.c.post("/api/ledger/records", json={"case_id": case["id"]})
            exported = self.c.get("/api/ledger/export").content
            self.assertEqual(json.loads(exported)["signature"]["alg"], "HMAC-SHA256")
            self.c.delete("/api/ledger")
            ok = self.c.post("/api/ledger/import", files={"file": ("l.json", exported)}).json()
            self.assertTrue(ok["accepted"])
            self.assertTrue(ok["signature_valid"])
            self.c.delete("/api/ledger")
            os.environ["PIXELPROOF_LEDGER_KEY"] = "a-different-key"
            bad = self.c.post("/api/ledger/import", files={"file": ("l.json", exported)}).json()
            self.assertFalse(bad["accepted"])
            self.assertFalse(bad["signature_valid"])
            del os.environ["PIXELPROOF_LEDGER_KEY"]
            nokey = self.c.post("/api/ledger/import", files={"file": ("l.json", exported)}).json()
            self.assertFalse(nokey["accepted"])
            self.assertIsNone(nokey["signature_valid"])
        finally:
            os.environ.pop("PIXELPROOF_LEDGER_KEY", None)
            self.c.delete("/api/ledger")

    # T13 / T14
    def test_reports(self):
        case = self.upload_ok(SAMPLE)
        self.c.patch(f"/api/cases/{case['id']}",
                     json={"notes": "<script>alert(1)</script> & note", "title": "Report <b>case</b>"})
        _, r = self.run_tech(case["id"], "ela", {"quality": 70})
        rep = self.c.get(f"/api/cases/{case['id']}/report.json").json()
        self.assertEqual(rep["report_format"], "pixelproof-report/1")
        self.assertEqual(len(rep["analyses"]), 1)
        a = rep["analyses"][0]
        self.assertEqual(a["result_id"], r["id"])
        self.assertEqual(a["parameters"], {"quality": 70})
        self.assertEqual(a["limitations"], r["limitations"])
        self.assertTrue(all(img["sha256"] for img in a["images"]))
        self.assertNotIn("score", json.dumps(rep).lower().replace("decision_score", ""))
        html = self.c.get(f"/api/cases/{case['id']}/report.html").text
        self.assertNotIn("<script>alert(1)</script>", html)
        self.assertIn("&lt;script&gt;alert(1)&lt;/script&gt; &amp; note", html)
        self.assertIn("Report &lt;b&gt;case&lt;/b&gt;", html)
        self.assertEqual(html.count("data:image/png;base64,"), len(r["images"]))
        self.assertIn("Limitations", html)
        self.assertIn("BSD 3-Clause", html)
        dl = self.c.get(f"/api/cases/{case['id']}/report.html", params={"download": 1})
        self.assertTrue(dl.headers["content-disposition"].startswith("attachment"))

    # T16
    def test_rejects_bad_uploads_and_ids(self):
        self.assertEqual(self.upload(b"not an image at all", "x.jpg").status_code, 422)
        self.assertEqual(self.upload(SAMPLE.read_bytes(), "x.png").status_code, 422)  # ext mismatch
        self.assertEqual(self.upload(SAMPLE.read_bytes(), "x.gif").status_code, 422)
        self.assertEqual(self.upload(SAMPLE.read_bytes()[:2000], "trunc.jpg").status_code, 422)
        self.assertEqual(self.upload(b"", "e.png").status_code, 422)
        bomb = png_bytes(np.zeros((8000, 6000), np.uint8))  # 48 MP, tiny file
        r = self.upload(bomb, "bomb.png")
        self.assertEqual(r.status_code, 422)
        self.assertIn("MP", r.json()["detail"])
        big = b"\xff\xd8\xff" + b"0" * (26 * 1024 * 1024)
        self.assertEqual(self.upload(big, "big.jpg").status_code, 413)
        for url in ("/api/cases/../../etc/passwd", "/api/cases/c_zzzz/original",
                    "/api/cases/..%2F..%2Fbackend/original", "/api/artifacts/../../LICENSE",
                    "/api/artifacts/a_000000000000000000000000", "/api/results/r_0000000000000000",
                    "/api/jobs/j_0000000000000000", "/api/examples/..%2F..%2FLICENSE/image",
                    "/..%2F..%2Fbackend%2Fmain.py", "/..%2FLICENSE", "/assets/..%2F..%2F..%2FLICENSE"):
            r = self.c.get(url)
            if r.status_code == 200:
                # Clients normalise '..' away; with the built UI present the
                # request then lands on the SPA shell — never on a real file.
                self.assertIn('<div id="root">', r.text, url)
            else:
                self.assertIn(r.status_code, (404, 422), url)
            self.assertNotIn("Redistribution and use", r.text, url)
            self.assertNotIn("import ", r.text, url)
        self.assertEqual(self.c.post("/api/cases/from-example", json={"example_id": "../app"}).status_code, 422)

    # T08: every registered technique through the API on a relevant bundled example
    def test_every_technique_on_examples(self):
        targets = {
            "ela": "ela_recompressed_patch", "jpeg_ghost": "ghost_q60_patch",
            "double_jpeg": "ghost_q60_patch", "quantization": "ghost_q60_patch",
            "noise": "noise_smoothed_region", "copy_move": "copy_move_clone",
            "resampling": "resampled_upscale", "histogram": "histogram_contrast",
            "steganography": "stego_lsb", "metadata": "metadata_inconsistent",
            "spectrum": "sample", "jpeg_grid": "sample", "synthetic_traces": "sample",
        }
        cases = {}
        for tid, ex in targets.items():
            if ex not in cases:
                cases[ex] = self.c.post("/api/cases/from-example", json={"example_id": ex}).json()
            _, res = self.run_tech(cases[ex]["id"], tid)
            self.assertEqual(res["status"], "ok", (tid, res["summary"]))
            self.assertEqual(res["case_id"], cases[ex]["id"])
            self.assertTrue(res["limitations"], tid)
            for img in res["images"]:
                self.assertEqual(self.c.get(img["url"]).status_code, 200, (tid, img["label"]))
                if img["registered"]:
                    self.assertEqual((img["height"], img["width"]),
                                     (cases[ex]["original"]["height"], cases[ex]["original"]["width"]))
        # documented edits are actually reported by the targeted method
        def findings(ex, tid):
            rs = self.c.get(f"/api/cases/{cases[ex]['id']}/results").json()["results"]
            r = next(r for r in rs if r["technique_id"] == tid)
            return {f["level"] for f in r["findings"]}
        self.assertIn("warning", findings("copy_move_clone", "copy_move"))
        self.assertTrue({"warning", "notice"} & findings("stego_lsb", "steganography"))
        self.assertTrue({"warning", "notice"} & findings("resampled_upscale", "resampling"))

    def test_prnu_uses_example_references(self):
        case = self.c.post("/api/cases/from-example", json={"example_id": "iphone5c_01"}).json()
        self.assertEqual(len(case["references"]), 3)
        self.assertTrue(all(r["from_example"] for r in case["references"]))
        _, res = self.run_tech(case["id"], "prnu")
        self.assertEqual(res["status"], "ok", res["summary"])
        self.assertEqual(len(res["references_used"]), 3)
        self.assertIn("PCE", res["metrics"])

    # T09: switching case while a heavy job runs cannot leak results
    def test_switch_case_during_heavy_job(self):
        a = self.c.post("/api/cases/from-example", json={"example_id": "copy_move_clone"}).json()
        job = self.c.post(f"/api/cases/{a['id']}/analyses",
                          json={"technique_id": "copy_move", "parameters": {}, "force": True}).json()
        self.assertIn(job["status"], ("queued", "running"))
        b = self.upload_ok(SAMPLE)
        _, rb = self.run_tech(b["id"], "ela")  # quick lane is not blocked by the heavy job
        self.assertEqual(rb["case_id"], b["id"])
        done = self.wait(job["id"])
        self.assertEqual(done["status"], "succeeded")
        ra = self.c.get(f"/api/results/{done['result_id']}").json()
        self.assertEqual(ra["case_id"], a["id"])
        b_ids = {r["id"] for r in self.c.get(f"/api/cases/{b['id']}/results").json()["results"]}
        self.assertNotIn(ra["id"], b_ids)
        self.assertEqual({r["technique_id"] for r in self.c.get(f"/api/cases/{b['id']}/results").json()["results"]}, {"ela"})

    def test_regions_of_interest(self):
        case = self.c.post("/api/cases/from-example", json={"example_id": "copy_move_clone"}).json()
        url = f"/api/cases/{case['id']}/regions"
        before = (TMP / "cases" / case["id"])
        orig = next(before.glob("original.*")).read_bytes()
        g = self.c.post(url, json={"x": 700, "y": 300, "w": 192, "h": 128, "label": "<i>clone</i> target"})
        self.assertEqual(g.status_code, 201, g.text)
        for bad in ({"x": 900, "y": 0, "w": 200, "h": 10}, {"x": -1, "y": 0, "w": 5, "h": 5},
                    {"x": 0, "y": 0, "w": 0, "h": 5}, {"x": 0, "y": 0, "w": 5, "h": 5, "z": 1}):
            self.assertEqual(self.c.post(url, json=bad).status_code, 422, bad)
        self.assertEqual(len(self.c.get(f"/api/cases/{case['id']}").json()["regions"]), 1)
        other = self.upload_ok(SAMPLE)
        self.assertEqual(other["regions"], [])
        rep = self.c.get(f"/api/cases/{case['id']}/report.json").json()
        self.assertEqual(rep["case"]["regions_of_interest"][0]["x"], 700)
        html = self.c.get(f"/api/cases/{case['id']}/report.html").text
        self.assertIn("&lt;i&gt;clone&lt;/i&gt; target", html)
        self.assertIn("<rect x='700' y='300' width='192' height='128'", html)
        self.assertEqual(next(before.glob("original.*")).read_bytes(), orig)  # annotation never touches evidence
        gid = g.json()["id"]
        self.assertEqual(self.c.delete(f"{url}/{gid}").status_code, 200)
        self.assertEqual(self.c.delete(f"{url}/{gid}").status_code, 404)
        # client normalises '..' -> lands on a route without DELETE (405) or none (404)
        self.assertIn(self.c.delete(f"{url}/..%2F..").status_code, (404, 405))
        self.assertEqual(self.c.delete(f"{url}/g_zzzz").status_code, 404)

    def test_delete_case(self):
        case = self.upload_ok(SAMPLE)
        self.assertEqual(self.c.delete(f"/api/cases/{case['id']}").status_code, 200)
        self.assertFalse((TMP / "cases" / case["id"]).exists())
        self.assertEqual(self.c.get(f"/api/cases/{case['id']}").status_code, 404)


class SerializerTest(unittest.TestCase):
    def test_json_safe(self):
        notes = []
        out = serializer.json_safe({"a": np.float32(1.5), "b": np.int64(3), "c": np.bool_(True),
                                    "d": float("nan"), "e": (1, 2), "f": np.arange(3)}, notes)
        self.assertEqual(out, {"a": 1.5, "b": 3, "c": True, "d": None, "e": [1, 2], "f": [0, 1, 2]})
        self.assertEqual(len(notes), 1)
        json.dumps(out)

    def test_prune_large(self):
        p = serializer.prune({"heat": [[0] * 10] * 100, "small": [1, 2]})
        self.assertEqual(p["heat"]["shape"], [100, 10])
        self.assertEqual(p["small"], [1, 2])


if __name__ == "__main__":
    unittest.main()
