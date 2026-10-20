import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { FolderOpen } from "lucide-react";
import { useApp } from "../state/AppState";
import type { Case } from "../lib/types";
import { Card, CopyButton, Empty, ErrorBox, Mono, Spinner, Tag } from "./ui";

/** Renders children only when a case is active; otherwise a clear empty state. */
export function RequireCase({ children }: { children: (c: Case) => ReactNode }) {
  const { activeCase, caseLoading, caseError, caseId } = useApp();
  if (caseId && caseLoading) return <Spinner label="Loading case…" />;
  if (caseError && caseId) return <ErrorBox error={caseError} />;
  if (!activeCase)
    return (
      <Card>
        <Empty icon={<FolderOpen className="h-8 w-8" />} title="No case is open">
          Create a case from an upload or a bundled example on the{" "}
          <Link to="/" className="text-accent underline">Dashboard</Link> first.
        </Empty>
      </Card>
    );
  return <>{children(activeCase)}</>;
}

export function CaseHeader({ c, right }: { c: Case; right?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-4">
      <img src={c.original_url} alt="" className="evidence h-14 w-20 rounded-md border border-line object-cover" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="truncate text-lg font-semibold text-ink">{c.title}</h1>
          {c.known_edit && <Tag tone="caution">bundled example · known edit</Tag>}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-dim">
          <span>Case <Mono>{c.id}</Mono></span>
          <span>SHA-256 <Mono className="text-ink/80">{c.original.sha256.slice(0, 16)}…</Mono></span>
          <CopyButton text={c.original.sha256} label="Copy SHA-256" />
        </div>
      </div>
      {right}
    </div>
  );
}
