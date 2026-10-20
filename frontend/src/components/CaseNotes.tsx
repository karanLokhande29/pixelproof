import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Save } from "lucide-react";
import { api } from "../lib/api";
import type { Case } from "../lib/types";
import { Button, ErrorBox } from "./ui";

/** Case title / description / analyst notes, saved to the API (PATCH) and used in reports. */
export function CaseNotes({ c, showMeta = false }: { c: Case; showMeta?: boolean }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState(c.title);
  const [description, setDescription] = useState(c.description);
  const [notes, setNotes] = useState(c.notes);
  useEffect(() => { setTitle(c.title); setDescription(c.description); setNotes(c.notes); }, [c.id, c.title, c.description, c.notes]);
  const dirty = notes !== c.notes || (showMeta && (title !== c.title || description !== c.description));
  const m = useMutation({
    mutationFn: () => api.patchCase(c.id, showMeta ? { title: title.trim() || c.title, description, notes } : { notes }),
    onSuccess: (updated) => {
      qc.setQueryData(["case", c.id], updated);
      qc.invalidateQueries({ queryKey: ["cases"] });
    },
  });
  const field = "mt-1 w-full rounded-md border border-line2 bg-page px-2.5 py-1.5 text-sm text-ink placeholder:text-faint";
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
      {showMeta && (
        <>
          <label className="block text-xs text-dim">Case title
            <input className={field} value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="block text-xs text-dim">Description
            <textarea className={field} rows={2} value={description} maxLength={2000} onChange={(e) => setDescription(e.target.value)} />
          </label>
        </>
      )}
      <label className="block text-xs text-dim">Analyst notes (case-wide)
        <textarea className={field} rows={showMeta ? 6 : 4} value={notes} maxLength={20000} onChange={(e) => setNotes(e.target.value)}
                  placeholder="What you looked at, what the independent methods showed, what remains open…" />
      </label>
      <div className="flex items-center gap-2">
        <Button type="submit" disabled={!dirty} busy={m.isPending}><Save className="h-4 w-4" /> Save</Button>
        <span className="text-[11px] text-dim">{dirty ? "Unsaved changes" : m.isSuccess ? "Saved to the case" : `Last updated ${new Date(c.updated_utc).toLocaleString()}`}</span>
      </div>
      {m.error && <ErrorBox error={m.error} />}
    </form>
  );
}
