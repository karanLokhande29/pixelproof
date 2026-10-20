import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, FlaskConical, FolderOpen, Microscope, PlayCircle, Trash2, XCircle, Zap } from "lucide-react";
import { api } from "../lib/api";
import { fmtBytes, fmtTime } from "../lib/format";
import type { AnalysisResult, Case, Example, Technique } from "../lib/types";
import { useApp, useResults, useTechniques } from "../state/AppState";
import { UploadZone } from "../components/UploadZone";
import { Button, Card, CardHeader, CopyButton, Empty, ErrorBox, Mono, Notice, Spinner, StatusBadge, Tag } from "../components/ui";

export default function Dashboard() {
  const { activeCase } = useApp();
  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <Hero />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="min-w-0 space-y-5">
          {activeCase ? <ActiveCase c={activeCase} /> : <NoActiveCase />}
          <Gallery />
        </div>
        <div className="space-y-5">
          <NewCase />
          <RecentCases />
        </div>
      </div>
    </div>
  );
}

function Hero() {
  const health = useQuery({ queryKey: ["health"], queryFn: api.health, refetchInterval: 30_000 });
  const h = health.data;
  return (
    <div className="relative overflow-hidden rounded-xl border border-line bg-gradient-to-br from-[#0F1A28] via-surface to-[#0D1620] px-6 py-6">
      <div className="max-w-3xl">
        <p className="text-[11px] uppercase tracking-[0.2em] text-accent">Explainable multi-technique visual evidence investigation</p>
        <h1 className="mt-2 text-2xl font-semibold text-ink sm:text-[28px]">Open a case, run independent forensic methods, compare their traces.</h1>
        <p className="mt-2 text-sm text-dim">
          14 published image-forensics techniques run on the exact uploaded bytes. Each reports what it measured and what it
          cannot see. Nothing here combines them into a verdict.
        </p>
      </div>
      <div className="mt-4 flex flex-wrap gap-2 text-[11px]" aria-live="polite">
        {health.isLoading && <Spinner label="Checking API…" />}
        {health.error && <ErrorBox error={health.error} onRetry={() => health.refetch()} />}
        {h && (
          <>
            <Chip ok={h.status === "ok"} label={`API ${h.version}`} />
            <Chip ok={h.all_technique_modules_found} label={h.all_technique_modules_found ? "All 14 technique modules present" : "Some technique modules missing"} />
            <Chip ok={h.c2pa_reader_installed} label={h.c2pa_reader_installed ? "Offline C2PA reader installed" : "C2PA reader offline / not installed"} />
            <Chip ok label={`${h.examples_available} bundled examples`} />
            <Chip ok label={`Workers: ${h.executor_lanes.quick} quick + ${h.executor_lanes.heavy} heavy`} />
          </>
        )}
      </div>
    </div>
  );
}

function Chip({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 ${ok ? "border-accent/30 text-ink/90" : "border-danger/50 text-danger"}`}>
      {ok ? <CheckCircle2 className="h-3.5 w-3.5 text-accent" /> : <XCircle className="h-3.5 w-3.5" />}
      {label}
    </span>
  );
}

function NoActiveCase() {
  return (
    <Card>
      <Empty icon={<FolderOpen className="h-8 w-8" />} title="No case open">
        Upload an image on the right, or open one of the bundled examples below. Each case keeps the original file byte-for-byte
        with its SHA-256.
      </Empty>
    </Card>
  );
}

function ActiveCase({ c }: { c: Case }) {
  const navigate = useNavigate();
  const { quickScan, activeJobs } = useApp();
  const techniques = useTechniques();
  const results = useResults(c.id);
  const [err, setErr] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const qs = techniques.data?.quick_scan ?? [];
  const running = activeJobs.filter((j) => j.case_id === c.id);

  const runQuick = async () => {
    setErr(null);
    setBusy(true);
    try {
      await quickScan(c.id);
    } catch (e) {
      setErr(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader title="Active case" subtitle={`Created ${fmtTime(c.created_utc)} · ${c.source.kind === "example" ? "bundled example" : "uploaded file"}`}
                  right={<Tag tone="accent">{c.results.length} result{c.results.length === 1 ? "" : "s"}</Tag>} />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 p-4 md:grid-cols-[260px_minmax(0,1fr)]">
        <img src={c.original_url} alt={`Original evidence ${c.original.display_name}`}
             className="evidence max-h-60 w-full rounded-lg border border-line bg-black object-contain" />
        <div className="min-w-0 space-y-3">
          <div>
            <h2 className="text-lg font-semibold text-ink">{c.title}</h2>
            {c.description && <p className="text-sm text-dim">{c.description}</p>}
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-3">
            <Info k="Case ID" v={<Mono>{c.id}</Mono>} />
            <Info k="File" v={c.original.display_name} />
            <Info k="Format" v={`${c.original.format} · ${c.original.mode}`} />
            <Info k="Dimensions" v={`${c.original.width} × ${c.original.height} px`} />
            <Info k="Size" v={`${fmtBytes(c.original.size)} (${c.original.size.toLocaleString()} B)`} />
            <Info k="References" v={`${c.references.length} PRNU photo(s)`} />
          </dl>
          <div className="rounded-md border border-line bg-raised/40 p-2">
            <div className="flex items-center justify-between text-[11px] text-dim">
              <span>SHA-256 of the stored original (computed by the API on upload)</span>
              <CopyButton text={c.original.sha256} />
            </div>
            <Mono className="text-ink">{c.original.sha256}</Mono>
          </div>
          {c.known_edit && (
            <Notice tone="caution">
              <strong>Known edit (bundled example):</strong> {c.known_edit.edit}
              {c.known_edit.techniques.length > 0 && <> Targeted by: {c.known_edit.techniques.join(", ")}.</>}
            </Notice>
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => navigate(`/lab${c.known_edit?.techniques[0] ? `?t=${c.known_edit.techniques[0]}` : ""}`)}>
              <Microscope className="h-4 w-4" /> Open in Forensic Lab
            </Button>
            <Button onClick={runQuick} busy={busy} disabled={running.length > 0}>
              <Zap className="h-4 w-4" /> Quick Scan
            </Button>
            <Button variant="ghost" onClick={() => navigate("/provenance")}>Provenance</Button>
            <Button variant="ghost" onClick={() => navigate("/reports")}>Report</Button>
          </div>
          {err !== null && <ErrorBox error={err} />}
        </div>
      </div>
      <QuickScanStatus caseId={c.id} techniques={techniques.data?.techniques ?? []} qs={qs} results={results.data ?? []} />
    </Card>
  );
}

function Info({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-faint">{k}</dt>
      <dd className="truncate text-ink">{v}</dd>
    </div>
  );
}

function QuickScanStatus({ caseId, techniques, qs, results }: { caseId: string; techniques: Technique[]; qs: string[]; results: AnalysisResult[] }) {
  const { jobs } = useApp();
  const navigate = useNavigate();
  return (
    <div className="border-t border-line px-4 py-3">
      <p className="mb-2 text-xs text-dim">
        <span className="font-medium text-ink">Quick Scan</span> runs only the lightweight subset: metadata, ELA (q90), histogram and
        JPEG quantization tables (reports <em>not applicable</em> on PNG). Heavy methods are never started automatically.
      </p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {qs.map((tid) => {
          const t = techniques.find((x) => x.id === tid);
          const job = jobs.find((j) => j.case_id === caseId && j.technique_id === tid && (j.status === "queued" || j.status === "running"));
          const latest = [...results].reverse().find((r) => r.technique_id === tid);
          return (
            <button key={tid} onClick={() => navigate(`/lab?t=${tid}${latest ? `&r=${latest.id}` : ""}`)}
                    className="rounded-lg border border-line bg-raised/30 p-2.5 text-left hover:border-accent/50">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-xs font-medium text-ink">{t?.name ?? tid}</span>
                {job ? <StatusBadge status={job.status} /> : latest ? <StatusBadge status={latest.status} /> : <Tag>not run</Tag>}
              </div>
              <p className="mt-1 line-clamp-2 text-[11px] text-dim">{latest && !job ? latest.summary : job ? "Working on the original file…" : "—"}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function NewCase() {
  const { selectCase } = useApp();
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const m = useMutation({
    mutationFn: () => api.createCase(file!, title, description),
    onSuccess: (c) => {
      qc.setQueryData(["case", c.id], c);
      qc.invalidateQueries({ queryKey: ["cases"] });
      selectCase(c.id);
      setFile(null);
      setTitle("");
      setDescription("");
    },
  });
  return (
    <Card>
      <CardHeader title="New case from upload" subtitle="The file is stored exactly as uploaded and hashed server-side." />
      <form className="space-y-3 p-4" onSubmit={(e) => { e.preventDefault(); if (file) m.mutate(); }}>
        <UploadZone file={file} onFile={(f, p) => { setFile(f); setProblem(p); m.reset(); }} />
        {problem && <ErrorBox error={problem} />}
        <label className="block text-xs text-dim">
          Case title
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder={file?.name ?? "e.g. Insurance claim photo #12"}
                 className="mt-1 w-full rounded-md border border-line2 bg-page px-2.5 py-1.5 text-sm text-ink placeholder:text-faint" />
        </label>
        <label className="block text-xs text-dim">
          Description (optional)
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} rows={2}
                    className="mt-1 w-full resize-y rounded-md border border-line2 bg-page px-2.5 py-1.5 text-sm text-ink" />
        </label>
        <Button type="submit" variant="primary" className="w-full" disabled={!file} busy={m.isPending}>
          <FolderOpen className="h-4 w-4" /> Create case
        </Button>
        {m.error && <ErrorBox error={m.error} />}
      </form>
    </Card>
  );
}

function Gallery() {
  const ex = useQuery({ queryKey: ["examples"], queryFn: api.examples, staleTime: Infinity });
  return (
    <Card>
      <CardHeader title="Example challenges"
                  subtitle="Bundled images from the upstream project, each with one documented edit. 'Known edit' labels appear only for these, never for your uploads." />
      <div className="p-4">
        {ex.isLoading && <Spinner />}
        {ex.error && <ErrorBox error={ex.error} onRetry={() => ex.refetch()} />}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ex.data?.examples.map((e) => <ExampleCard key={e.id} e={e} />)}
        </div>
      </div>
    </Card>
  );
}

function ExampleCard({ e }: { e: Example }) {
  const { selectCase } = useApp();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const m = useMutation({
    mutationFn: () => api.createFromExample(e.id),
    onSuccess: (c) => {
      qc.setQueryData(["case", c.id], c);
      qc.invalidateQueries({ queryKey: ["cases"] });
      selectCase(c.id);
      navigate(`/lab${e.techniques[0] ? `?t=${e.techniques[0]}` : ""}`);
    },
  });
  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-line bg-raised/30">
      <img src={e.image_url} alt={e.title} loading="lazy" className="evidence h-28 w-full bg-black object-cover" />
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {e.tab ? <Tag tone="accent">{e.tab}</Tag> : <Tag tone="caution">composite</Tag>}
          {e.references > 0 && <Tag>{e.references} reference photos</Tag>}
        </div>
        <p className="text-sm font-medium leading-snug text-ink">{e.title}</p>
        <button className="self-start text-[11px] text-accent hover:underline" onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? "Hide known edit" : "Show known edit"}
        </button>
        {open && <p className="text-[11px] leading-relaxed text-dim">{e.edit}</p>}
        <Button className="mt-auto" onClick={() => m.mutate()} busy={m.isPending}>
          <FlaskConical className="h-3.5 w-3.5" /> Open as case
        </Button>
        {m.error && <ErrorBox error={m.error} />}
      </div>
    </div>
  );
}

function RecentCases() {
  const { caseId, selectCase } = useApp();
  const qc = useQueryClient();
  const cases = useQuery({ queryKey: ["cases"], queryFn: api.cases });
  const del = useMutation({
    mutationFn: (id: string) => api.deleteCase(id),
    onSuccess: (_, id) => {
      if (id === caseId) selectCase(null);
      qc.removeQueries({ queryKey: ["case", id] });
      qc.removeQueries({ queryKey: ["results", id] });
      qc.invalidateQueries({ queryKey: ["cases"] });
    },
  });
  return (
    <Card>
      <CardHeader title="Cases on this machine" subtitle="Stored under build_artifacts/cases. Survives API restarts." />
      <div className="max-h-[520px] overflow-auto p-2">
        {cases.isLoading && <div className="p-2"><Spinner /></div>}
        {cases.error && <ErrorBox error={cases.error} onRetry={() => cases.refetch()} />}
        {cases.data && cases.data.cases.length === 0 && <Empty title="No cases yet" />}
        <ul className="space-y-1">
          {cases.data?.cases.map((c) => (
            <li key={c.id} className={`flex items-center gap-3 rounded-lg p-2 ${c.id === caseId ? "bg-accent/10 ring-1 ring-accent/40" : "hover:bg-raised/60"}`}>
              <img src={c.original_url} alt="" loading="lazy" className="evidence h-10 w-14 shrink-0 rounded border border-line object-cover" />
              <button className="min-w-0 flex-1 text-left" onClick={() => selectCase(c.id)} aria-label={`Open case ${c.title}`}>
                <div className="truncate text-sm text-ink">{c.title}</div>
                <div className="truncate text-[11px] text-dim">
                  {c.format} · {c.results} result{c.results === 1 ? "" : "s"} · <span className="font-mono">{c.sha256.slice(0, 10)}</span> · {fmtTime(c.created_utc)}
                </div>
              </button>
              {c.id !== caseId && (
                <Button variant="ghost" className="!px-2" onClick={() => selectCase(c.id)} aria-label="Open">
                  <PlayCircle className="h-4 w-4" />
                </Button>
              )}
              <Button variant="ghost" className="!px-2 hover:!text-danger" aria-label={`Delete case ${c.title}`}
                      onClick={() => { if (window.confirm(`Delete case "${c.title}" and all its results? This cannot be undone.`)) del.mutate(c.id); }}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
        {del.error && <ErrorBox error={del.error} />}
      </div>
      <div className="border-t border-line px-4 py-2 text-[11px] text-faint">
        Prefer the original UI? The upstream Streamlit app still runs separately: <span className="font-mono text-dim">streamlit run app.py</span> → http://localhost:8501.
      </div>
    </Card>
  );
}
