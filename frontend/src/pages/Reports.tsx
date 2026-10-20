import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Braces, ExternalLink, FileDown, FileText, Microscope, Printer } from "lucide-react";
import { reportUrl } from "../lib/api";
import { fmtParams, fmtTime } from "../lib/format";
import type { AnalysisResult, Case } from "../lib/types";
import { useResults } from "../state/AppState";
import { CaseHeader, RequireCase } from "../components/CaseHeader";
import { CaseNotes } from "../components/CaseNotes";
import { Button, Card, CardHeader, Empty, ErrorBox, Notice, Spinner, StatusBadge, Tag } from "../components/ui";

export default function Reports() {
  return <RequireCase>{(c) => <ReportPage key={c.id} c={c} />}</RequireCase>;
}

// Same factual grouping as backend/reports.py::outcome — per method, never combined.
function outcome(r: AnalysisResult): string {
  if (r.status === "error") return "failed";
  if (r.status === "insufficient_data" || r.status === "not_applicable") return "inconclusive";
  const levels = new Set(r.findings.map((f) => f.level));
  if (levels.has("warning")) return "inconsistency reported";
  if (levels.has("notice")) return "weak indicator reported";
  return "no inconsistency at this test's sensitivity";
}

function ReportPage({ c }: { c: Case }) {
  const navigate = useNavigate();
  const results = useResults(c.id);
  const own = useMemo(() => (results.data ?? []).filter((r) => r.case_id === c.id), [results.data, c.id]);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const included = own.filter((r) => !excluded.has(r.id));
  const ids = excluded.size === 0 ? null : included.map((r) => r.id);
  const none = included.length === 0;
  const groups = included.reduce<Record<string, number>>((acc, r) => ({ ...acc, [outcome(r)]: (acc[outcome(r)] ?? 0) + 1 }), {});

  const toggle = (id: string) => setExcluded((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <CaseHeader c={c} />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-4">
          <Card>
            <CardHeader title="Results to include" subtitle="Only analyses actually executed on this case are listed. Uncheck to leave a result out of the export."
                        right={<Tag tone="accent">{included.length} of {own.length}</Tag>} />
            <div className="p-3">
              {results.isLoading && <Spinner />}
              {results.error && <ErrorBox error={results.error} onRetry={() => results.refetch()} />}
              {results.data && own.length === 0 && (
                <Empty icon={<FileText className="h-8 w-8" />} title="No analyses yet">
                  The report would contain only the case and evidence identity. Run methods in the Lab or use Quick Scan first.
                </Empty>
              )}
              {own.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="text-left text-dim">
                      <tr><th className="w-8 py-1.5"></th><th>Method</th><th>Parameters</th><th>Status</th><th>Outcome (this method only)</th><th>Run</th><th></th></tr>
                    </thead>
                    <tbody>
                      {[...own].reverse().map((r) => (
                        <tr key={r.id} className={`border-t border-line/60 align-top ${excluded.has(r.id) ? "opacity-45" : ""}`}>
                          <td className="py-1.5"><input type="checkbox" checked={!excluded.has(r.id)} onChange={() => toggle(r.id)} aria-label={`Include ${r.technique_name}`} /></td>
                          <td className="py-1.5 text-ink">{r.technique_name}<div className="text-[11px] text-dim">{r.summary}</div></td>
                          <td className="font-mono">{fmtParams(r.parameters)}</td>
                          <td><StatusBadge status={r.status} /></td>
                          <td className="text-ink/90">{outcome(r)}</td>
                          <td className="whitespace-nowrap text-dim">{fmtTime(r.created_utc)}</td>
                          <td><button className="text-accent hover:underline" onClick={() => navigate(`/lab?t=${r.technique_id}&r=${r.id}`)}>open</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </Card>
          {included.length > 0 && (
            <Card>
              <CardHeader title="Per-method outcomes (counts, not a score)" subtitle="Grouped by each method's own status and finding levels. Nothing here is combined into a verdict." />
              <div className="flex flex-wrap gap-2 p-4">
                {Object.entries(groups).map(([k, n]) => <Tag key={k} tone={k.startsWith("inconsistency") ? "caution" : k === "failed" ? "caution" : "default"}>{n} × {k}</Tag>)}
              </div>
            </Card>
          )}
          {c.known_edit && (
            <Card>
              <CardHeader title="Example challenge" subtitle="This case is a bundled example with a documented edit." />
              <div className="space-y-3 p-4 text-sm">
                <p className="text-ink/90">{c.known_edit.edit}</p>
                {c.known_edit.techniques.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 text-xs text-dim">
                    The upstream project targets this edit with:
                    {c.known_edit.techniques.map((t) => (
                      <Button key={t} onClick={() => navigate(`/lab?t=${t}`)} className="!py-1 text-xs"><Microscope className="h-3.5 w-3.5" /> {t}</Button>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Export" subtitle="Generated by the API from stored results at the moment you click." />
            <div className="space-y-2 p-4">
              <a href={none ? undefined : reportUrl(c.id, "json", ids, true)} aria-disabled={none}
                 className={`flex items-center gap-2 rounded-md border border-line2 bg-raised px-3 py-2 text-sm hover:border-accent/60 ${none ? "pointer-events-none opacity-45" : ""}`}>
                <Braces className="h-4 w-4 text-accent" /> Download JSON report
              </a>
              <a href={none ? undefined : reportUrl(c.id, "html", ids, false)} target="_blank" rel="noopener" aria-disabled={none}
                 className={`flex items-center gap-2 rounded-md bg-accent px-3 py-2 text-sm font-semibold text-page hover:bg-[#6fd8cf] ${none ? "pointer-events-none opacity-45" : ""}`}>
                <Printer className="h-4 w-4" /> Open printable HTML <ExternalLink className="ml-auto h-3.5 w-3.5" />
              </a>
              <a href={none ? undefined : reportUrl(c.id, "html", ids, true)} aria-disabled={none}
                 className={`flex items-center gap-2 rounded-md border border-line2 bg-raised px-3 py-2 text-sm hover:border-accent/60 ${none ? "pointer-events-none opacity-45" : ""}`}>
                <FileDown className="h-4 w-4 text-accent" /> Download HTML (self-contained)
              </a>
              {none && own.length > 0 && <p className="text-xs text-caution">Select at least one result to export.</p>}
              <Notice>
                Reports contain the case details, notes, evidence hashes, each included method's parameters, summary, findings, metrics,
                output images (embedded in HTML; URL + SHA-256 in JSON) and its own limitations, plus source attribution. Use the browser's
                Print → Save as PDF on the HTML report.
              </Notice>
            </div>
          </Card>
          <Card>
            <CardHeader title="Case details & notes" subtitle="Saved to the case; every report includes them." />
            <div className="p-4"><CaseNotes c={c} showMeta /></div>
          </Card>
        </div>
      </div>
    </div>
  );
}
