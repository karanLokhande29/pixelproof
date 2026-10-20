export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

// Same display rule as the upstream app (`f"{value:.4g}"` for floats).
export function fmtValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") {
    if (Number.isInteger(v)) return v.toLocaleString("en-US");
    return Number(v.toPrecision(4)).toString();
  }
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "medium" });
}

export function fmtParams(p: Record<string, number> | undefined): string {
  if (!p || Object.keys(p).length === 0) return "defaults";
  return Object.entries(p).map(([k, v]) => `${k}=${v}`).join(", ");
}

export function sameParams(a: Record<string, number> | undefined, b: Record<string, number> | undefined) {
  const ka = Object.keys(a ?? {}), kb = Object.keys(b ?? {});
  return ka.length === kb.length && ka.every((k) => (a ?? {})[k] === (b ?? {})[k]);
}

export const STATUS_LABEL: Record<string, string> = {
  ok: "OK",
  insufficient_data: "Insufficient data",
  not_applicable: "Not applicable",
  error: "Error",
  queued: "Queued",
  running: "Running",
  succeeded: "Done",
  failed: "Failed",
};

export function elapsedSince(iso: string | null, now: number): string {
  if (!iso) return "";
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}
