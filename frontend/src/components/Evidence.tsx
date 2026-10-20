import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AlertOctagon, AlertTriangle, ChevronDown, ChevronRight, Info } from "lucide-react";
import { api } from "../lib/api";
import { fmtValue } from "../lib/format";
import type { AnalysisStatus, Finding, Table } from "../lib/types";
import { Empty, ErrorBox, Spinner, StatusBadge } from "./ui";

const LEVEL = {
  warning: { icon: AlertOctagon, cls: "border-l-danger bg-danger/5", text: "text-danger", label: "Inconsistency" },
  notice: { icon: AlertTriangle, cls: "border-l-caution bg-caution/5", text: "text-caution", label: "Weak indicator" },
  info: { icon: Info, cls: "border-l-line2 bg-raised/40", text: "text-dim", label: "Info" },
} as const;

export function FindingsList({ findings, compact = false }: { findings: Finding[]; compact?: boolean }) {
  if (!findings.length) return <p className="px-1 py-2 text-xs text-dim">This method reported no findings.</p>;
  return (
    <ul className="space-y-1.5">
      {findings.map((f, i) => {
        const L = LEVEL[f.level];
        return (
          <li key={i} className={`flex gap-2 rounded-r border-l-[3px] px-2.5 py-1.5 ${L.cls}`}>
            <L.icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${L.text}`} aria-hidden />
            <div className={compact ? "text-xs" : "text-[13px]"}>
              <span className={`mr-1.5 text-[10px] font-semibold uppercase tracking-wider ${L.text}`}>{L.label}</span>
              <span className="text-ink/90">{f.text}</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function MetricsGrid({ metrics, limit }: { metrics: Record<string, unknown>; limit?: number }) {
  const entries = Object.entries(metrics);
  const [all, setAll] = useState(false);
  if (!entries.length) return <p className="px-1 py-2 text-xs text-dim">No metrics for this result.</p>;
  const shown = limit && !all ? entries.slice(0, limit) : entries;
  return (
    <div>
      <dl className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-2">
        {shown.map(([k, v]) => (
          <div key={k} className="rounded-md border border-line bg-raised/50 px-2.5 py-2">
            <dt className="text-[11px] leading-tight text-dim">{k}</dt>
            <dd className="mt-1 break-words font-mono text-sm text-ink">{fmtValue(v)}</dd>
          </div>
        ))}
      </dl>
      {limit && entries.length > limit && (
        <button className="mt-2 text-xs text-accent hover:underline" onClick={() => setAll(!all)}>
          {all ? "Show fewer" : `Show all ${entries.length} metrics`}
        </button>
      )}
    </div>
  );
}

export function TableView({ table }: { table: Table }) {
  if (Array.isArray(table)) {
    if (!table.length) return <p className="text-xs text-dim">(empty)</p>;
    const cols = Array.from(new Set(table.flatMap((r) => Object.keys(r))));
    return (
      <div className="max-h-80 overflow-auto rounded border border-line">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 bg-raised">
            <tr>{cols.map((c) => <th key={c} className="border-b border-line px-2 py-1.5 text-left font-medium text-dim">{c}</th>)}</tr>
          </thead>
          <tbody>
            {table.map((row, i) => (
              <tr key={i} className="odd:bg-raised/30">
                {cols.map((c) => <td key={c} className="border-b border-line/60 px-2 py-1 align-top font-mono text-ink/90">{fmtValue(row[c])}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  const entries = Object.entries(table);
  return (
    <div className="max-h-80 overflow-auto rounded border border-line">
      <table className="w-full border-collapse text-xs">
        <tbody>
          {entries.map(([k, v]) => (
            <tr key={k} className="odd:bg-raised/30">
              <th className="w-1/3 border-b border-line/60 px-2 py-1 text-left align-top font-medium text-dim">{k}</th>
              <td className="break-all border-b border-line/60 px-2 py-1 font-mono text-ink/90">{fmtValue(v)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TablesView({ tables }: { tables: Record<string, Table> }) {
  const entries = Object.entries(tables);
  if (!entries.length) return <p className="px-1 py-2 text-xs text-dim">This method returned no tables.</p>;
  return (
    <div className="space-y-2">
      {entries.map(([title, t]) => <Collapsible key={title} title={title} defaultOpen={entries.length <= 2}><TableView table={t} /></Collapsible>)}
    </div>
  );
}

export function Collapsible({ title, children, defaultOpen = false }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-md border border-line">
      <button className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-xs font-medium text-ink hover:bg-raised/60"
              aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        {title}
      </button>
      {open && <div className="border-t border-line p-2">{children}</div>}
    </div>
  );
}

export function LimitationsList({ limitations }: { limitations: string[] }) {
  if (!limitations.length) return <p className="px-1 py-2 text-xs text-dim">No limitations listed by this method.</p>;
  return (
    <ul className="space-y-1.5">
      {limitations.map((l, i) => (
        <li key={i} className="flex gap-2 text-[13px] text-ink/85">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-caution" aria-hidden />
          {l}
        </li>
      ))}
    </ul>
  );
}

export function StatusSummary({ status, summary }: { status: AnalysisStatus; summary: string }) {
  const tone = status === "error" ? "border-danger/50 bg-danger/5"
    : status === "ok" ? "border-line bg-raised/40" : "border-caution/40 bg-caution/5";
  const prefix = status === "insufficient_data" ? "Insufficient data — not a clean result. "
    : status === "not_applicable" ? "Not applicable to this input — not a clean result. "
    : status === "error" ? "The analysis failed. " : "";
  return (
    <div className={`flex items-start gap-2 rounded-lg border px-3 py-2 ${tone}`}>
      <StatusBadge status={status} className="mt-0.5" />
      <p className="text-[13px] text-ink">
        {prefix && <span className="font-medium text-caution">{prefix}</span>}
        {summary}
      </p>
    </div>
  );
}

export function MethodGuide({ descriptionId }: { descriptionId: string }) {
  const q = useQuery({ queryKey: ["description", descriptionId], queryFn: () => api.description(descriptionId), staleTime: Infinity });
  if (q.isLoading) return <Spinner label="Loading method guide…" />;
  if (q.error) return <ErrorBox error={q.error} onRetry={() => q.refetch()} />;
  if (!q.data) return <Empty title="No guide" />;
  return (
    <div className="prose-vx">
      <p className="mb-3 text-[11px] text-faint">From the upstream project's <span className="font-mono">Descriptions/{descriptionId}.md</span> (BSD-3-Clause).</p>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // No remote images: a guide must not make the browser contact third parties.
          img: ({ alt }) => <span className="text-dim">[image: {alt}]</span>,
          a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,
        }}
      >
        {q.data.markdown}
      </ReactMarkdown>
    </div>
  );
}
