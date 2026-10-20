// M4 gate: full journey on two bundled examples (JPEG + PNG):
// gallery -> case -> Quick Scan -> notes -> JSON download (verified) -> printable HTML (verified).
import { chromium } from "playwright";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const BASE = process.argv[2] ?? "http://127.0.0.1:5173";
const ROOT = resolve(import.meta.dirname, "..", "..");
const OUT = resolve(ROOT, "build_artifacts", "screenshots");
mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const problems = [];
const check = (cond, msg) => { if (!cond) { problems.push("ASSERT: " + msg); log("FAIL", msg); } else log("ok", msg); };

// Edge sometimes closes a transient target around popups/downloads; that is a
// harness event, not an app failure. Anything else still fails the run.
process.on("unhandledRejection", (e) => {
  if (e?.name === "TargetClosedError") return log("note: ignored TargetClosedError from a transient browser target");
  problems.push("unhandled: " + e);
});
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? "msedge" });
const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 }, acceptDownloads: true });
const page = await ctx.newPage();
page.on("console", (m) => m.type() === "error" && problems.push(`console: ${m.text()}`));
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
page.on("response", (r) => r.status() >= 500 && problems.push(`HTTP ${r.status()} ${r.url()}`));

async function journey(title, file, isPng) {
  log(`=== ${title}`);
  await page.goto(BASE + "/");
  const card = page.locator("div").filter({ has: page.getByText(title, { exact: true }) }).last();
  await card.getByRole("button", { name: "Open as case" }).click();
  await page.waitForURL(/\/lab/);
  await page.getByRole("link", { name: "Dashboard" }).click();
  await page.getByRole("button", { name: "Quick Scan" }).click();
  // Wait until all four quick-scan tiles show a terminal analysis status
  await page.waitForFunction(() => {
    const tiles = [...document.querySelectorAll("main button")].filter((b) => /Metadata & C2PA|Error Level Analysis|Histogram|JPEG quantization/.test(b.textContent ?? ""));
    return tiles.length >= 4 && tiles.slice(0, 4).every((t) => /OK|Not applicable|Insufficient data|Error/.test(t.textContent ?? "") && !/Running|Queued/.test(t.textContent ?? ""));
  }, null, { timeout: 60000 });
  const tilesText = await page.locator("main").innerText();
  if (isPng) check(/JPEG quantization tables\s*Not applicable/.test(tilesText), "PNG: quantization shows Not applicable (not a clean result)");
  log("quick scan finished");

  await page.getByRole("link", { name: "Reports" }).click();
  await page.getByText("Results to include").waitFor();
  const rows = await page.locator("tbody tr").count();
  check(rows === 4, `report lists exactly the 4 executed analyses (got ${rows})`);
  const note = `Reviewed <b>${title}</b> & "quotes"`;
  await page.getByLabel("Analyst notes (case-wide)").fill(note);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByText("Saved to the case").waitFor();

  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByText("Download JSON report").click()]);
  const jsonPath = resolve(OUT, `m4_${isPng ? "png" : "jpeg"}_report.json`);
  await dl.saveAs(jsonPath);
  const rep = JSON.parse(readFileSync(jsonPath, "utf8"));
  const sha = createHash("sha256").update(readFileSync(file)).digest("hex");
  check(rep.evidence.original.sha256 === sha, "JSON: evidence SHA-256 equals the bundled file's SHA-256");
  check(rep.analyses.length === 4, "JSON: 4 analyses");
  check(rep.case.notes === note, "JSON: analyst note preserved verbatim");
  check(rep.analyses.every((a) => Array.isArray(a.limitations) && a.limitations.length > 0), "JSON: every analysis carries its limitations");
  check(rep.analyses.every((a) => a.images.every((i) => /^[0-9a-f]{64}$/.test(i.sha256))), "JSON: every artifact has a SHA-256");
  const q = rep.analyses.find((a) => a.technique_id === "quantization");
  check(q.status === (isPng ? "not_applicable" : "ok"), `JSON: quantization status ${q.status}`);

  const [popup] = await Promise.all([page.waitForEvent("popup"), page.getByText("Open printable HTML").click()]);
  await popup.waitForLoadState("load");
  const html = await popup.content();
  check(html.includes("&lt;b&gt;") && !html.includes(`<b>${title}</b>`), "HTML: note is escaped, not rendered as markup");
  check(html.includes("Limitations — what this test cannot see"), "HTML: limitations section present");
  check(/Rafay Adeel/.test(html) && /BSD 3-Clause/.test(html), "HTML: source attribution present");
  const imgs = await popup.evaluate(() => [...document.images].map((i) => ({ ok: i.complete && i.naturalWidth > 0, src: i.src.slice(0, 22) })));
  check(imgs.length > 1 && imgs.every((i) => i.ok), `HTML: all ${imgs.length} embedded images decode (no broken links)`);
  try {
    await popup.screenshot({ path: resolve(OUT, `m4_${isPng ? "png" : "jpeg"}_report_html.png`), fullPage: true });
    await popup.close();
  } catch (e) {
    log("note: popup screenshot skipped:", e.message.split("\n")[0]);
  }
}

await journey("Patch with a different compression history", resolve(ROOT, "assets/examples/ela_recompressed_patch.jpg"), false);
await journey("Contrast stretched", resolve(ROOT, "assets/examples/histogram_contrast.png"), true);
await page.screenshot({ path: resolve(OUT, "m4_reports_page.png") });
await browser.close();
log(problems.length ? `PROBLEMS (${problems.length}):\n  ` + problems.join("\n  ") : "M4 gate: all checks passed, no console errors, no 5xx");
process.exit(problems.length ? 1 : 0);
