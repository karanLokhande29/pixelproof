import type {
  AnalysisResult, Case, CaseSummary, CompareOutcome, Example, Health, ImportReport, Job,
  LedgerRecord, LedgerState, PlainResult, Region, Technique,
} from "./types";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new ApiError(0, "Cannot reach the PixelProof API. Is the backend running on port 8000?");
  }
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (typeof body.detail === "string") msg = body.detail;
      else if (Array.isArray(body.detail)) msg = body.detail.map((d: { msg: string }) => d.msg).join("; ");
    } catch {
      /* not JSON */
    }
    throw new ApiError(res.status, msg);
  }
  return res.json() as Promise<T>;
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

const form = (fields: Record<string, string | Blob>): RequestInit => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return { method: "POST", body: fd };
};

export const api = {
  health: () => request<Health>("/api/health"),
  techniques: () => request<{ techniques: Technique[]; quick_scan: string[] }>("/api/techniques"),
  description: (id: string) => request<{ id: string; markdown: string }>(`/api/descriptions/${encodeURIComponent(id)}`),
  examples: () => request<{ examples: Example[] }>("/api/examples"),

  cases: () => request<{ cases: CaseSummary[] }>("/api/cases"),
  case: (id: string) => request<Case>(`/api/cases/${id}`),
  createCase: (file: File, title: string, description: string) =>
    request<Case>("/api/cases", form({ file, title, description })),
  createFromExample: (example_id: string) => request<Case>("/api/cases/from-example", json("POST", { example_id })),
  patchCase: (id: string, body: Partial<Pick<Case, "title" | "description" | "notes">>) =>
    request<Case>(`/api/cases/${id}`, json("PATCH", body)),
  deleteCase: (id: string) => request<{ deleted: string }>(`/api/cases/${id}`, { method: "DELETE" }),
  addReference: (id: string, file: File) => request(`/api/cases/${id}/references`, form({ file })),
  removeReference: (id: string, refId: string) =>
    request(`/api/cases/${id}/references/${refId}`, { method: "DELETE" }),

  addRegion: (id: string, r: { x: number; y: number; w: number; h: number; label: string }) =>
    request<Region>(`/api/cases/${id}/regions`, json("POST", r)),
  removeRegion: (id: string, regionId: string) =>
    request(`/api/cases/${id}/regions/${regionId}`, { method: "DELETE" }),

  runAnalysis:(caseId: string, technique_id: string, parameters: Record<string, number>, force = false) =>
    request<Job>(`/api/cases/${caseId}/analyses`, json("POST", { technique_id, parameters, force })),
  quickScan: (caseId: string) => request<{ techniques: string[]; jobs: Job[] }>(`/api/cases/${caseId}/quick-scan`, { method: "POST" }),
  jobs: (active = false) => request<{ jobs: Job[] }>(`/api/jobs${active ? "?active=true" : ""}`),
  job: (id: string) => request<Job>(`/api/jobs/${id}`),
  results: (caseId: string) => request<{ results: AnalysisResult[] }>(`/api/cases/${caseId}/results`),
  result: (id: string) => request<AnalysisResult>(`/api/results/${id}`),
  noteResult: (id: string, analyst_note: string) => request<AnalysisResult>(`/api/results/${id}`, json("PATCH", { analyst_note })),

  compareUpload: (caseId: string, file: File) =>
    request<CompareOutcome>(`/api/cases/${caseId}/provenance/compare-upload`, form({ file })),
  compareExample: (caseId: string, example_id: string) =>
    request<CompareOutcome>(`/api/cases/${caseId}/provenance/compare-example`, json("POST", { example_id })),
  ledger: () => request<LedgerState>("/api/ledger"),
  ledgerAdd: (case_id: string, note: string) => request<LedgerRecord>("/api/ledger/records", json("POST", { case_id, note })),
  ledgerCheck: (caseId: string) => request<PlainResult>(`/api/ledger/check/${caseId}`, { method: "POST" }),
  ledgerImport: (file: File) => request<ImportReport>("/api/ledger/import", form({ file })),
  ledgerClear: () => request<{ cleared: boolean }>("/api/ledger", { method: "DELETE" }),
};

export const reportUrl = (caseId: string, kind: "json" | "html", resultIds: string[] | null, download: boolean) => {
  const q = new URLSearchParams();
  if (resultIds) q.set("results", resultIds.join(","));
  if (download) q.set("download", "1");
  const qs = q.toString();
  return `/api/cases/${caseId}/report.${kind}${qs ? `?${qs}` : ""}`;
};
