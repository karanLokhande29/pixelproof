import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { GitCompareArrows, Microscope } from "lucide-react";
import { fmtParams, fmtTime } from "../lib/format";
import type { AnalysisResult, Case } from "../lib/types";
import { useResults } from "../state/AppState";
import { CaseHeader, RequireCase } from "../components/CaseHeader";
import { ImageCanvas, type View } from "../components/ImageCanvas";
import { Collapsible, FindingsList, LimitationsList, MetricsGrid, StatusSummary } from "../components/Evidence";
import { ResultNote } from "../components/ResultNote";
import { CaseNotes } from "../components/CaseNotes";
import { Button, Card, CardHeader, Empty, ErrorBox, Notice, Spinner, StatusBadge, Tag } from "../components/ui";

const MAX = 3;

export default function Comparison() {
  return <RequireCase>{(c) => <Compare key={c.id} c={c} />}</RequireCase>;
}

function Compare({ c }: { c: Case }) {
  const results = useResults(c.id);
  // Defensive: only results owned by this case can ever be listed or shown.
  const own = useMemo(() => (results.data ?? []).filter((r) => r.case_id === c.id), [results.data, c.id]);
  const [selected, setSelected] = useState<string[] | null>(null);
  const [sync, setSync] = useState(true);
  const [shared, setShared] = useState<View | null>(null);

  // Default selection: the newest result of up to three different methods.
  useEffect(() => {
    if (selected !== null || !results.data) return;
    const seen = new Set<string>();
    const pick: string[] = [];
    for (const r of [...own].reverse()) {
      if (!seen.has(r.technique_id) && pick.length < MAX) {
        seen.add(r.technique_id);
        pick.push(r.id);
      }
    }
    setSelected(pick);
  }, [own, results.data, selected]);

  const sel = (selected ?? []).map((id) => own.find((r) => r.id === id)).filter(Boolean) as AnalysisResult[];
  const toggle = (id: string) =>
    setSelected((s) => {
      const cur = s ?? [];
      return cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= MAX ? cur : [...cur, id];
    });

  const techniques = Array.from(new Set(own.map((r) => r.technique_id)));

  return (
    <div className="mx-auto max-w-[1600px] space-y-4">
      <CaseHeader c={c} />
      <Notice tone="caution">
        Each column is one independently executed method measuring a different trace. Columns are shown side by side for your
        judgement only — there is <strong>no aggregate score, consensus or verdict</strong>, and agreement between methods is not proof.
      </Notice>
      {results.isLoading && <Spinner />}
      {results.error && <ErrorBox error={results.error} onRetry={() => results.refetch()} />}
      {results.data && own.length === 0 && (
        <Card><Empty icon={<GitCompareArrows className="h-8 w-8" />} title="No results to compare yet">
          Run at least two methods on this case in the Forensic Lab (or use Quick Scan on the Dashboard).
        </Empty></Card>
      )}
      {own.length > 0 && (
        <Card>
          <CardHeader title={`Choose 2–${MAX} results from this case`} subtitle={`${sel.length} selected · only this case's results are listed`}
                      right={<label className="flex items-center gap-2 text-xs text-dim"><input type="checkbox" checked={sync} onChange={(e) => setSync(e.target.checked)} /> Sync zoom (same pixel grid only)</label>} />
          <div className="flex flex-wrap gap-3 p-3">
            {techniques.map((tid) => (
              <div key={tid} className="min-w-[220px] flex-1 rounded-lg border border-line p-2">
                <div className="mb-1 text-xs font-medium text-ink">{own.find((r) => r.technique_id === tid)?.technique_name}</div>
                {own.filter((r) => r.technique_id === tid).reverse().map((r) => {
                  const on = selected?.includes(r.id) ?? false;
                  const full = !on && (selected?.length ?? 0) >= MAX;
                  return (
                    <label key={r.id} className={`flex items-center gap-2 rounded px-1.5 py-1 text-xs ${full ? "opacity-40" : "cursor-pointer hover:bg-raised"}`}>
                      <input type="checkbox" checked={on} disabled={full} onChange={() => toggle(r.id)} />
                      <StatusBadge status={r.status} />
                      <span className="font-mono text-ink/90">{fmtParams(r.parameters)}</span>
                      <span className="ml-auto text-faint">{fmtTime(r.created_utc).split(",").slice(-1)[0]}</span>
                    </label>
                  );
                })}
              </div>
            ))}
          </div>
          {sel.length === 1 && <p className="px-4 pb-3 text-xs text-caution">Select at least one more result to compare.</p>}
        </Card>
      )}

      {sel.length > 0 && (
        <div className={`grid gap-4 ${sel.length === 1 ? "lg:grid-cols-1" : sel.length === 2 ? "lg:grid-cols-2" : "lg:grid-cols-3"}`}>
          {sel.map((r) => <Column key={r.id} r={r} c={c} sync={sync} shared={shared} setShared={setShared} />)}
        </div>
      )}

      <Card>
        <CardHeader title="Case notes" subtitle="Record your reading of the comparison. Saved to the case and included in reports." />
        <div className="p-4"><CaseNotes c={c} /></div>
      </Card>
    </div>
  );
}

function Column({ r, c, sync, shared, setShared }: {
  r: AnalysisResult; c: Case; sync: boolean; shared: View | null; setShared: (v: View) => void;
}) {
  const navigate = useNavigate();
  const [idx, setIdx] = useState(0);
  const [own, setOwn] = useState<View | null>(null);
  const img = r.images[idx];
  const sameGrid = !!img && img.width === c.original.width && img.height === c.original.height;
  const useShared = sync && sameGrid;
  return (
    <Card className="flex flex-col">
      <div className="space-y-1 border-b border-line px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="truncate text-sm font-semibold">{r.technique_name}</h3>
          <StatusBadge status={r.status} />
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-dim">
          <Tag>{r.family}</Tag>
          <span className="font-mono">{fmtParams({ ...r.fixed_parameters, ...r.parameters })}</span>
          <span>· {r.elapsed_ms} ms · {fmtTime(r.created_utc)}</span>
        </div>
      </div>
      <div className="space-y-3 p-3">
        <StatusSummary status={r.status} summary={r.summary} />
        {img ? (
          <div>
            {r.images.length > 1 && (
              <select value={idx} onChange={(e) => { setIdx(Number(e.target.value)); setOwn(null); }} aria-label="Output image"
                      className="mb-2 w-full rounded border border-line2 bg-page px-2 py-1 text-xs text-ink">
                {r.images.map((im, i) => <option key={im.artifact_id} value={i}>{im.label}</option>)}
              </select>
            )}
            <ImageCanvas key={img.url} className="h-64" width={img.width} height={img.height}
                         layers={[{ src: img.url, alt: img.label }]} view={useShared ? shared : own}
                         onView={useShared ? setShared : setOwn}
                         caption={`${img.registered ? "registered map" : "figure"} · ${img.width}×${img.height}${useShared ? " · synced" : ""}`} />
          </div>
        ) : (
          <p className="rounded border border-line px-2 py-6 text-center text-xs text-dim">No output image for this result.</p>
        )}
        <div>
          <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-dim">Key metrics</h4>
          <MetricsGrid metrics={r.metrics} limit={6} />
        </div>
        <div>
          <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-dim">Findings</h4>
          <FindingsList findings={r.findings} compact />
        </div>
        <Collapsible title={`Limitations (${r.limitations.length})`}><LimitationsList limitations={r.limitations} /></Collapsible>
        <Collapsible title="Analyst note on this result"><ResultNote r={r} /></Collapsible>
        <Button className="w-full" onClick={() => navigate(`/lab?t=${r.technique_id}&r=${r.id}`)}>
          <Microscope className="h-4 w-4" /> Open in Forensic Lab
        </Button>
      </div>
    </Card>
  );
}
