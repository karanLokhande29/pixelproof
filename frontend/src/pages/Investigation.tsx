import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Columns2, Download, Eye, History, Image as ImageIcon, Layers, Loader2, Play, RotateCw, SquareDashed, Trash2, Upload } from "lucide-react";
import { api } from "../lib/api";
import { elapsedSince, fmtParams, fmtTime, sameParams } from "../lib/format";
import type { AnalysisResult, Case, Job, ResultImage, Technique } from "../lib/types";
import { useApp, useResults, useTechniques } from "../state/AppState";
import { CaseHeader, RequireCase } from "../components/CaseHeader";
import { ImageCanvas, type Rect, type View } from "../components/ImageCanvas";
import { FindingsList, LimitationsList, MethodGuide, MetricsGrid, StatusSummary, TablesView } from "../components/Evidence";
import { ResultNote } from "../components/ResultNote";
import { Button, Card, Empty, ErrorBox, Notice, Spinner, StatusBadge, Tabs, Tag } from "../components/ui";
import { UploadZone } from "../components/UploadZone";

export default function Investigation() {
  // Keyed by case: switching case remounts the Lab, so no state can leak across cases.
  return <RequireCase>{(c) => <Lab key={c.id} c={c} />}</RequireCase>;
}

type Mode = "original" | "result" | "split" | "overlay";

function defaults(t: Technique | undefined): Record<string, number> {
  return Object.fromEntries((t?.parameters ?? []).map((p) => [p.key, p.default]));
}

function useNow(active: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

function Lab({ c }: { c: Case }) {
  const [sp, setSp] = useSearchParams();
  const techniques = useTechniques();
  const results = useResults(c.id);
  const { jobs, submit, labTechnique, setLabTechnique } = useApp();

  const list = techniques.data?.techniques ?? [];
  const fromUrl = sp.get("t");
  const tid = fromUrl && (list.length === 0 || list.some((t) => t.id === fromUrl)) ? fromUrl : labTechnique;
  const technique = list.find((t) => t.id === tid);
  useEffect(() => { if (technique) setLabTechnique(technique.id); }, [technique, setLabTechnique]);

  // Only this case's results for this technique, newest first.
  const techResults = useMemo(
    () => (results.data ?? []).filter((r) => r.case_id === c.id && r.technique_id === tid).reverse(),
    [results.data, c.id, tid],
  );
  const rid = sp.get("r");
  const shown: AnalysisResult | undefined = techResults.find((r) => r.id === rid) ?? techResults[0];
  // Settings start from the displayed result until the user changes them.
  const [paramsBy, setParamsBy] = useState<Record<string, Record<string, number>>>({});
  const params = paramsBy[tid] ?? (shown && technique?.parameters.length ? shown.parameters : defaults(technique));
  const stale = !!shown && technique !== undefined && technique.parameters.length > 0 && !sameParams(shown.parameters, params);

  const caseJobs = jobs.filter((j) => j.case_id === c.id);
  const activeJob = caseJobs.find((j) => j.technique_id === tid && (j.status === "queued" || j.status === "running") && sameParams(j.parameters, params));
  const [pendingJob, setPendingJob] = useState<string | null>(null);
  const [runError, setRunError] = useState<unknown>(null);
  const tracked: Job | undefined = caseJobs.find((j) => j.id === pendingJob);

  // When the job we started finishes, show exactly its result.
  useEffect(() => {
    if (!tracked) return;
    if (tracked.status === "succeeded" && tracked.result_id && results.data?.some((r) => r.id === tracked.result_id)) {
      setSp((p) => { p.set("t", tracked.technique_id); p.set("r", tracked.result_id!); return p; }, { replace: true });
      setPendingJob(null);
    } else if (tracked.status === "failed") {
      setRunError(new Error(`Job failed: ${tracked.error ?? "unknown error"}`));
      setPendingJob(null);
    }
  }, [tracked, results.data, setSp]);

  const selectTechnique = (id: string) => {
    setRunError(null);
    setSp((p) => { p.set("t", id); p.delete("r"); return p; });
  };
  const selectResult = (r: AnalysisResult) => setSp((p) => { p.set("t", r.technique_id); p.set("r", r.id); return p; });

  const run = async (force: boolean) => {
    setRunError(null);
    try {
      const job = await submit(c.id, tid, params, force);
      if (job.status === "succeeded" && job.result_id) {
        setSp((p) => { p.set("r", job.result_id!); return p; });
      } else {
        setPendingJob(job.id);
      }
    } catch (e) {
      setRunError(e);
    }
  };

  const hasSameParams = techResults.some((r) => sameParams(r.parameters, params));

  return (
    <div className="mx-auto max-w-[1600px]">
      <CaseHeader c={c} />
      {techniques.error && <ErrorBox error={techniques.error} onRetry={() => techniques.refetch()} />}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-4">
          <Viewer c={c} shown={shown} technique={technique} activeJob={activeJob} />
          <ResultPanel shown={shown} technique={technique} />
        </div>
        <aside className="space-y-4" aria-label="Methods and settings">
          <Card>
            <div className="border-b border-line px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">{technique?.name ?? "…"}</h2>
                {technique && (
                  <div className="flex gap-1">
                    <Tag tone={technique.cost === "heavy" ? "caution" : "default"}>{technique.cost}</Tag>
                    {technique.jpeg_only && <Tag tone="info">JPEG only</Tag>}
                    {technique.experimental && <Tag tone="caution">experimental</Tag>}
                  </div>
                )}
              </div>
              <p className="mt-1 text-xs text-dim">{technique?.summary}</p>
              {technique && <p className="mt-1 font-mono text-[10px] text-faint">{technique.entry_point} · v{technique.version}</p>}
            </div>
            <div className="space-y-3 p-4">
              {technique?.jpeg_only && c.original.format !== "JPEG" && (
                <Notice tone="caution">This file is {c.original.format}. The method will report <em>not applicable</em> — that is not a clean result.</Notice>
              )}
              {technique?.experimental && (
                <Notice tone="caution">Experimental measurements only. This is not an AI-image classifier and its silence says nothing.</Notice>
              )}
              {technique?.parameters.map((p) => (
                <div key={p.key}>
                  <label htmlFor={`p-${p.key}`} className="flex items-center justify-between text-xs text-dim">
                    {p.label}
                    <span className="rounded bg-raised px-1.5 py-0.5 font-mono text-sm text-ink">{params[p.key]}</span>
                  </label>
                  <input id={`p-${p.key}`} type="range" min={p.min} max={p.max} step={1} value={params[p.key]}
                         onChange={(e) => setParamsBy((s) => ({ ...s, [tid]: { ...params, [p.key]: Number(e.target.value) } }))}
                         className="mt-2 w-full" />
                  <div className="flex justify-between font-mono text-[10px] text-faint"><span>{p.min}</span><span>{p.max}</span></div>
                </div>
              ))}
              {technique && Object.keys(technique.fixed_parameters).length > 0 && (
                <p className="text-[11px] text-dim">
                  Fixed: <span className="font-mono">{fmtParams(technique.fixed_parameters)}</span> (same as the upstream app; larger images are
                  downscaled in memory only and the analysed size is reported).
                </p>
              )}
              {technique?.uses_references && <References c={c} />}
              <div className="flex gap-2">
                <Button variant="primary" className="flex-1" onClick={() => run(false)} disabled={!technique || !!activeJob}>
                  {activeJob ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  {activeJob ? (activeJob.status === "queued" ? "Queued…" : "Running…") : "Run"}
                </Button>
                {hasSameParams && (
                  <Button onClick={() => run(true)} disabled={!!activeJob} title="Run again even though a result with these settings exists">
                    <RotateCw className="h-4 w-4" /> Re-run
                  </Button>
                )}
              </div>
              <JobLine job={activeJob} />
              {stale && !activeJob && (
                <Notice tone="caution">
                  Displayed result used <span className="font-mono">{fmtParams(shown!.parameters)}</span>; current setting is{" "}
                  <span className="font-mono">{fmtParams(params)}</span>. Press Run to compute it — the view is not updated until then.
                </Notice>
              )}
              {runError !== null && <ErrorBox error={runError} onRetry={() => run(false)} />}
            </div>
          </Card>

          <MethodList list={list} current={tid} results={results.data ?? []} jobs={caseJobs} onSelect={selectTechnique} />
          <RegionsCard c={c} />
          <HistoryList items={techResults} shownId={shown?.id} onSelect={selectResult} loading={results.isLoading} />
        </aside>
      </div>
    </div>
  );
}

function JobLine({ job }: { job: Job | undefined }) {
  const now = useNow(!!job);
  if (!job) return null;
  return (
    <p className="flex items-center gap-2 text-[11px] text-dim" aria-live="polite">
      <StatusBadge status={job.status} />
      {job.status === "queued" ? `waiting for a free ${job.lane} worker · ${elapsedSince(job.submitted_utc, now)}`
        : `running in a ${job.lane} worker process · ${elapsedSince(job.started_utc, now)} elapsed`}
      <span className="text-faint">(no cancel: it will finish or fail)</span>
    </p>
  );
}

function MethodList({ list, current, results, jobs, onSelect }: {
  list: Technique[]; current: string; results: AnalysisResult[]; jobs: Job[]; onSelect: (id: string) => void;
}) {
  const families = Array.from(new Set(list.map((t) => t.family)));
  return (
    <Card>
      <div className="border-b border-line px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-dim">Methods</div>
      <div className="max-h-[420px] overflow-auto p-2">
        {families.map((f) => (
          <div key={f} className="mb-2">
            <div className="px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-faint">{f}</div>
            {list.filter((t) => t.family === f).map((t) => {
              const last = [...results].reverse().find((r) => r.technique_id === t.id);
              const job = jobs.find((j) => j.technique_id === t.id && (j.status === "queued" || j.status === "running"));
              return (
                <button key={t.id} onClick={() => onSelect(t.id)} aria-current={t.id === current}
                        className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] ${
                          t.id === current ? "bg-accent/10 text-accent" : "text-ink/90 hover:bg-raised"}`}>
                  <span className="flex-1 truncate">{t.name}</span>
                  {t.cost === "heavy" && <span className="text-[10px] text-caution" title="heavy method">●</span>}
                  {job ? <StatusBadge status={job.status} /> : last ? <StatusBadge status={last.status} /> : null}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </Card>
  );
}

function HistoryList({ items, shownId, onSelect, loading }: {
  items: AnalysisResult[]; shownId?: string; onSelect: (r: AnalysisResult) => void; loading: boolean;
}) {
  return (
    <Card>
      <div className="flex items-center gap-2 border-b border-line px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-dim">
        <History className="h-3.5 w-3.5" /> Runs of this method
      </div>
      <div className="max-h-56 overflow-auto p-2">
        {loading && <Spinner />}
        {!loading && items.length === 0 && <p className="px-2 py-3 text-xs text-dim">Not run on this case yet.</p>}
        {items.map((r) => (
          <button key={r.id} onClick={() => onSelect(r)}
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs ${r.id === shownId ? "bg-raised ring-1 ring-accent/40" : "hover:bg-raised/60"}`}>
            <StatusBadge status={r.status} />
            <span className="font-mono text-ink/90">{fmtParams(r.parameters)}</span>
            <span className="ml-auto text-faint">{fmtTime(r.created_utc)}</span>
          </button>
        ))}
      </div>
    </Card>
  );
}

function RegionsCard({ c }: { c: Case }) {
  const qc = useQueryClient();
  const del = useMutation({
    mutationFn: (id: string) => api.removeRegion(c.id, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["case", c.id] }),
  });
  const regions = c.regions ?? [];
  return (
    <Card>
      <div className="flex items-center gap-2 border-b border-line px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-dim">
        <SquareDashed className="h-3.5 w-3.5" /> Regions of interest
      </div>
      <div className="p-2">
        {regions.length === 0 && (
          <p className="px-2 py-2 text-xs text-dim">None yet. Use <span className="text-ink">Mark region</span> above the viewer. Regions are annotations saved to the case and report; the evidence file is never modified.</p>
        )}
        <ul className="space-y-1">
          {regions.map((g, i) => (
            <li key={g.id} className="flex items-center gap-2 rounded px-2 py-1 text-xs hover:bg-raised/60">
              <span className="rounded-sm bg-caution px-1 font-semibold text-page">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate text-ink/90">{g.label || "—"}</span>
              <span className="font-mono text-[10px] text-dim">{g.x},{g.y} {g.w}×{g.h}</span>
              <button aria-label={`Delete region ${i + 1}`} className="text-dim hover:text-danger" onClick={() => del.mutate(g.id)}>
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
        {del.error && <ErrorBox error={del.error} />}
      </div>
    </Card>
  );
}

function References({ c }: { c: Case }) {
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["case", c.id] });
  const add = useMutation({ mutationFn: (f: File) => api.addReference(c.id, f), onSuccess: () => { setFile(null); refresh(); } });
  const del = useMutation({ mutationFn: (id: string) => api.removeReference(c.id, id), onSuccess: refresh });
  const mismatched = c.references.filter((r) => r.width !== c.original.width || r.height !== c.original.height).length;
  return (
    <div className="space-y-2 rounded-md border border-line p-2.5">
      <p className="text-xs font-medium text-ink">Reference photos from the claimed camera ({c.references.length})</p>
      <p className="text-[11px] text-dim">Must be same-camera, unrotated, and exactly {c.original.width}×{c.original.height}; others are skipped by the method. Without references PRNU cannot identify a camera.</p>
      <ul className="space-y-1">
        {c.references.map((r) => (
          <li key={r.id} className="flex items-center gap-2 text-[11px]">
            <span className="flex-1 truncate text-ink/90">{r.display_name}</span>
            <span className={`font-mono ${r.width === c.original.width && r.height === c.original.height ? "text-dim" : "text-caution"}`}>{r.width}×{r.height}</span>
            {r.from_example && <Tag>example</Tag>}
            <button aria-label={`Remove ${r.display_name}`} className="text-dim hover:text-danger" onClick={() => del.mutate(r.id)}><Trash2 className="h-3.5 w-3.5" /></button>
          </li>
        ))}
      </ul>
      {mismatched > 0 && <p className="text-[11px] text-caution">{mismatched} reference(s) have different dimensions and will be skipped.</p>}
      <UploadZone compact file={file} onFile={(f, p) => { setFile(f); setProblem(p); }} label="Add a reference photo" />
      {problem && <ErrorBox error={problem} />}
      <Button className="w-full" disabled={!file} busy={add.isPending} onClick={() => file && add.mutate(file)}>
        <Upload className="h-3.5 w-3.5" /> Add reference
      </Button>
      {(add.error || del.error) && <ErrorBox error={add.error ?? del.error} />}
    </div>
  );
}

// ── Viewer ────────────────────────────────────────────────────────
function Viewer({ c, shown, technique, activeJob }: { c: Case; shown?: AnalysisResult; technique?: Technique; activeJob?: Job }) {
  const images = shown?.images ?? [];
  const [imgIdx, setImgIdx] = useState(0);
  const [mode, setMode] = useState<Mode>("split");
  const [overlayStyle, setOverlayStyle] = useState<"blend" | "wipe">("blend");
  const [amount, setAmount] = useState(0.6);
  const [viewA, setViewA] = useState<View | null>(null);
  const [viewB, setViewB] = useState<View | null>(null);
  const now = useNow(!!activeJob);
  const qc = useQueryClient();
  const [drawing, setDrawing] = useState(false);
  const [pending, setPending] = useState<Rect | null>(null);
  const [label, setLabel] = useState("");
  const addRegion = useMutation({
    mutationFn: () => api.addRegion(c.id, { ...pending!, label }),
    onSuccess: () => { setPending(null); setLabel(""); setDrawing(false); qc.invalidateQueries({ queryKey: ["case", c.id] }); },
  });
  const regions = c.regions ?? [];
  const onDraw = (r: Rect) => { setPending(r); addRegion.reset(); };

  useEffect(() => { setImgIdx(0); setViewB(null); }, [shown?.id]);
  const img: ResultImage | undefined = images[imgIdx];
  const sameGrid = !!img && img.width === c.original.width && img.height === c.original.height;
  const canOverlay = !!img?.registered;
  const effMode: Mode = !img ? "original" : mode === "overlay" && !canOverlay ? "split" : mode;
  useEffect(() => { setViewA(null); setViewB(null); }, [effMode]); // panes change size: re-fit
  // Regions live in the original's pixel grid: drawn only on views sharing it.
  const roi = { regions, drawing, onDraw };

  const original = { width: c.original.width, height: c.original.height, src: c.original_url };
  const modes: { id: Mode; label: string; icon: typeof Eye; disabled?: boolean; title?: string }[] = [
    { id: "original", label: "Original", icon: ImageIcon },
    { id: "result", label: "Result", icon: Eye, disabled: !img },
    { id: "split", label: "Side by side", icon: Columns2, disabled: !img },
    { id: "overlay", label: "Overlay", icon: Layers, disabled: !canOverlay,
      title: canOverlay ? "Blend or wipe the map over the original (same pixel grid)" : "Only for maps registered to the original's pixel grid; this output is shown side by side" },
  ];

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
        <div className="flex rounded-md border border-line2 p-0.5" role="group" aria-label="View mode">
          {modes.map((m) => (
            <button key={m.id} disabled={m.disabled} title={m.title} onClick={() => setMode(m.id)} aria-pressed={effMode === m.id}
                    className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-35 ${
                      effMode === m.id ? "bg-accent/15 text-accent" : "text-dim hover:text-ink"}`}>
              <m.icon className="h-3.5 w-3.5" /> {m.label}
            </button>
          ))}
        </div>
        {effMode === "overlay" && (
          <div className="flex items-center gap-2 text-xs text-dim">
            <select value={overlayStyle} onChange={(e) => setOverlayStyle(e.target.value as "blend" | "wipe")} aria-label="Overlay style"
                    className="rounded border border-line2 bg-page px-1.5 py-1 text-xs text-ink">
              <option value="blend">Blend</option>
              <option value="wipe">Wipe</option>
            </select>
            <input type="range" min={0} max={1} step={0.01} value={amount} onChange={(e) => setAmount(Number(e.target.value))}
                   aria-label={overlayStyle === "blend" ? "Map opacity" : "Wipe position"} className="w-36" />
            <span className="w-9 font-mono text-ink">{Math.round(amount * 100)}%</span>
          </div>
        )}
        <button onClick={() => { setDrawing(!drawing); setPending(null); }} aria-pressed={drawing}
                disabled={effMode === "result" && !sameGrid}
                title="Drag on the original (or a registered map) to mark a region of interest. Annotation only: the evidence file is never modified."
                className={`ml-auto flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs disabled:opacity-35 ${drawing ? "border-caution text-caution" : "border-line2 text-dim hover:text-ink"}`}>
          <SquareDashed className="h-3.5 w-3.5" /> {drawing ? "Drawing… (drag)" : "Mark region"}
        </button>
        {img && effMode !== "original" && (
          <a href={img.url} download={`${shown!.technique_id}-${img.artifact_id}.png`} className="flex items-center gap-1 text-xs text-dim hover:text-accent">
            <Download className="h-3.5 w-3.5" /> PNG
          </a>
        )}
      </div>
      {pending && (
        <form className="flex flex-wrap items-center gap-2 border-b border-line bg-caution/5 px-3 py-2 text-xs"
              onSubmit={(e) => { e.preventDefault(); addRegion.mutate(); }}>
          <span className="font-mono text-ink">x {pending.x}, y {pending.y}, {pending.w}×{pending.h} px</span>
          <input autoFocus value={label} onChange={(e) => setLabel(e.target.value)} maxLength={200} placeholder="Label (e.g. suspected clone source)"
                 aria-label="Region label" className="min-w-[200px] flex-1 rounded border border-line2 bg-page px-2 py-1 text-ink placeholder:text-faint" />
          <Button type="submit" variant="primary" className="!py-1 text-xs" busy={addRegion.isPending}>Save region</Button>
          <Button type="button" variant="ghost" className="!py-1 text-xs" onClick={() => setPending(null)}>Discard</Button>
          {addRegion.error && <span className="text-danger">{(addRegion.error as Error).message}</span>}
        </form>
      )}

      <div className="relative">
        {effMode === "original" && (
          <ImageCanvas className="h-[56vh] min-h-[340px]" width={original.width} height={original.height}
                       layers={[{ src: original.src, alt: "original evidence" }]} view={viewA} onView={setViewA}
                       caption={`Original · ${c.original.display_name} (stored pixel order)`} {...roi} />
        )}
        {effMode === "result" && img && (
          <ImageCanvas key={img.url} className="h-[56vh] min-h-[340px]" width={img.width} height={img.height}
                       layers={[{ src: img.url, alt: img.label }]} view={sameGrid ? viewA : viewB} onView={sameGrid ? setViewA : setViewB}
                       caption={img.label} {...(sameGrid ? roi : {})} />
        )}
        {effMode === "split" && img && (
          <div className="grid h-[56vh] min-h-[340px] grid-cols-1 gap-1 bg-line md:grid-cols-2">
            <ImageCanvas width={original.width} height={original.height} layers={[{ src: original.src, alt: "original evidence" }]}
                         view={viewA} onView={setViewA} caption="Original" className="!rounded-none !border-0" {...roi} />
            <ImageCanvas key={img.url} width={img.width} height={img.height} layers={[{ src: img.url, alt: img.label }]}
                         view={sameGrid ? viewA : viewB} onView={sameGrid ? setViewA : setViewB}
                         caption={`${img.label}${sameGrid ? " · synced" : " · own pixel grid"}`} className="!rounded-none !border-0"
                         {...(sameGrid ? roi : {})} />
          </div>
        )}
        {effMode === "overlay" && img && (
          <ImageCanvas className="h-[56vh] min-h-[340px]" width={original.width} height={original.height}
                       layers={[{ src: original.src, alt: "original evidence" },
                                overlayStyle === "blend" ? { src: img.url, alt: img.label, opacity: amount } : { src: img.url, alt: img.label, wipe: amount }]}
                       view={viewA} onView={setViewA} caption={`Overlay: ${img.label} on original (registered map)`} {...roi} />
        )}
        {activeJob && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-center p-3">
            <div className="flex items-center gap-2 rounded-full border border-accent/40 bg-page/90 px-4 py-1.5 text-xs text-ink backdrop-blur" role="status">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
              {technique?.name} {activeJob.status === "queued" ? "queued" : "running on the original file"} ·{" "}
              {elapsedSince(activeJob.started_utc ?? activeJob.submitted_utc, now)}
            </div>
          </div>
        )}
      </div>

      {images.length > 0 ? (
        <div className="flex gap-2 overflow-x-auto border-t border-line p-2" role="listbox" aria-label="Result images">
          {images.map((im, i) => (
            <button key={im.artifact_id} role="option" aria-selected={i === imgIdx} onClick={() => { setImgIdx(i); if (mode === "original") setMode("split"); }}
                    className={`flex w-48 shrink-0 flex-col gap-1 rounded-md border p-1.5 text-left ${i === imgIdx ? "border-accent/70 bg-accent/5" : "border-line hover:border-line2"}`}>
              <img src={im.url} alt="" loading="lazy" className="h-16 w-full rounded bg-black object-contain" />
              <span className="line-clamp-2 text-[11px] leading-tight text-ink/90">{im.label}</span>
              <span className="flex gap-1">
                {im.registered ? <Tag tone="accent">registered map</Tag> : <Tag>side by side</Tag>}
                <span className="font-mono text-[10px] text-faint">{im.width}×{im.height}</span>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="border-t border-line px-3 py-2 text-xs text-dim">
          {shown ? "This result has no output images." : `Run ${technique?.name ?? "a method"} to see its output next to the original.`}
        </div>
      )}
    </Card>
  );
}

// ── Result details ───────────────────────────────────────────────
type RTab = "findings" | "metrics" | "tables" | "limitations" | "guide" | "raw" | "note";

function ResultPanel({ shown, technique }: { shown?: AnalysisResult; technique?: Technique }) {
  const [tab, setTab] = useState<RTab>("findings");
  const tabs: { id: RTab; label: string; count?: number }[] = [
    { id: "findings", label: "Findings", count: shown?.findings.length },
    { id: "metrics", label: "Metrics", count: shown ? Object.keys(shown.metrics).length : undefined },
    { id: "tables", label: "Tables", count: shown ? Object.keys(shown.tables).length : undefined },
    { id: "limitations", label: "Limitations", count: shown?.limitations.length },
    { id: "guide", label: "Method guide" },
    { id: "raw", label: "Raw values" },
    { id: "note", label: "Analyst note" },
  ];
  return (
    <Card>
      {shown ? (
        <div className="space-y-2 border-b border-line p-3">
          <StatusSummary status={shown.status} summary={shown.summary} />
          <p className="font-mono text-[10px] text-faint">
            result {shown.id} · {shown.entry_point}({fmtParams({ ...shown.fixed_parameters, ...shown.parameters })}) · {shown.elapsed_ms} ms · {fmtTime(shown.created_utc)}
          </p>
        </div>
      ) : (
        <div className="border-b border-line p-3 text-xs text-dim">No result for this method yet.</div>
      )}
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      <div className="max-h-[520px] overflow-auto p-3">
        {tab === "guide" ? (technique ? <MethodGuide descriptionId={technique.description_id} /> : null)
          : !shown ? <Empty title="Nothing to show yet">Run the method from the panel on the right.</Empty>
          : tab === "findings" ? <FindingsList findings={shown.findings} />
          : tab === "metrics" ? <MetricsGrid metrics={shown.metrics} />
          : tab === "tables" ? <TablesView tables={shown.tables} />
          : tab === "limitations" ? (
            <div className="space-y-2">
              <p className="text-xs text-dim">Reported by the method itself — what it cannot see:</p>
              <LimitationsList limitations={shown.limitations} />
            </div>
          )
          : tab === "note" ? <ResultNote r={shown} rows={4} />
          : (
            <div className="space-y-2">
              {shown.serialization_notes.length > 0 && <Notice tone="caution">{shown.serialization_notes.join("; ")}</Notice>}
              <a className="inline-flex items-center gap-1 text-xs text-accent hover:underline" href={`/api/results/${shown.id}/details.json`}>
                <Download className="h-3.5 w-3.5" /> Full details.json (all arrays)
              </a>
              <pre className="max-h-96 overflow-auto rounded bg-page p-2 font-mono text-[11px] text-ink/85">{JSON.stringify(shown.details, null, 2)}</pre>
            </div>
          )}
      </div>
    </Card>
  );
}
