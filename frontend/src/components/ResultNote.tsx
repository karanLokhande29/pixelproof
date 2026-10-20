import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Save } from "lucide-react";
import { api } from "../lib/api";
import type { AnalysisResult } from "../lib/types";
import { Button, ErrorBox } from "./ui";

/** Analyst note attached to one stored result (saved on the API, included in reports). */
export function ResultNote({ r, rows = 3 }: { r: AnalysisResult; rows?: number }) {
  const qc = useQueryClient();
  const [text, setText] = useState(r.analyst_note ?? "");
  useEffect(() => setText(r.analyst_note ?? ""), [r.id, r.analyst_note]);
  const m = useMutation({
    mutationFn: () => api.noteResult(r.id, text),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["results", r.case_id] }),
  });
  const dirty = text !== (r.analyst_note ?? "");
  return (
    <div className="space-y-2">
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={rows} maxLength={4000}
                aria-label={`Analyst note for ${r.technique_name}`}
                placeholder="Your interpretation of this specific result (included in the report)…"
                className="w-full resize-y rounded-md border border-line2 bg-page px-2.5 py-1.5 text-[13px] text-ink placeholder:text-faint" />
      <div className="flex items-center gap-2">
        <Button onClick={() => m.mutate()} disabled={!dirty} busy={m.isPending} className="!py-1 text-xs">
          <Save className="h-3.5 w-3.5" /> Save note
        </Button>
        <span className="text-[11px] text-dim">{dirty ? "Unsaved changes" : m.isSuccess ? "Saved" : ""}</span>
      </div>
      {m.error && <ErrorBox error={m.error} />}
    </div>
  );
}
