import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../lib/api";
import type { Case, Job } from "../lib/types";

const CASE_KEY = "veritasx.activeCase";

function readStored(): string | null {
  try {
    return localStorage.getItem(CASE_KEY);
  } catch {
    return null;
  }
}

function writeStored(id: string | null) {
  try {
    if (id) localStorage.setItem(CASE_KEY, id);
    else localStorage.removeItem(CASE_KEY);
  } catch {
    /* storage unavailable: case selection just won't survive reloads */
  }
}

interface AppState {
  caseId: string | null;
  activeCase: Case | undefined;
  caseLoading: boolean;
  caseError: Error | null;
  selectCase: (id: string | null) => void;
  jobs: Job[]; // tracked jobs: active ones plus recently finished
  activeJobs: Job[];
  submit: (caseId: string, techniqueId: string, params: Record<string, number>, force?: boolean) => Promise<Job>;
  quickScan: (caseId: string) => Promise<Job[]>;
  labTechnique: string; // last method opened in the Lab, restored when returning to it
  setLabTechnique: (id: string) => void;
}

const Ctx = createContext<AppState | null>(null);
const TERMINAL = new Set(["succeeded", "failed"]);
const POLL_MS = 1200;

export function AppStateProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [caseId, setCaseId] = useState<string | null>(readStored);
  const [jobs, setJobs] = useState<Record<string, Job>>({});
  const [labTechnique, setLabTechnique] = useState("ela");
  const jobsRef = useRef(jobs);
  jobsRef.current = jobs;

  const caseQuery = useQuery({
    queryKey: ["case", caseId],
    queryFn: () => api.case(caseId!),
    enabled: !!caseId,
    retry: (n, e) => !(e instanceof ApiError && e.status === 404) && n < 2,
  });

  // A stored case that no longer exists on the server is cleared, not faked.
  useEffect(() => {
    if (caseQuery.error instanceof ApiError && caseQuery.error.status === 404) {
      setCaseId(null);
      writeStored(null);
    }
  }, [caseQuery.error]);

  const selectCase = useCallback((id: string | null) => {
    setCaseId(id);
    writeStored(id);
  }, []);

  const onFinished = useCallback(
    (job: Job) => {
      qc.invalidateQueries({ queryKey: ["results", job.case_id] });
      qc.invalidateQueries({ queryKey: ["case", job.case_id] });
      qc.invalidateQueries({ queryKey: ["cases"] });
    },
    [qc],
  );

  const track = useCallback(
    (job: Job) => {
      setJobs((prev) => ({ ...prev, [job.id]: job }));
      if (TERMINAL.has(job.status)) onFinished(job);
    },
    [onFinished],
  );

  // Pick up jobs that were already running (e.g. after a page reload).
  useEffect(() => {
    api.jobs(true).then((r) => r.jobs.forEach(track)).catch(() => undefined);
  }, [track]);

  const hasActive = Object.values(jobs).some((j) => !TERMINAL.has(j.status));
  useEffect(() => {
    if (!hasActive) return; // polling stops once every tracked job is terminal
    const timer = window.setInterval(async () => {
      const active = Object.values(jobsRef.current).filter((j) => !TERMINAL.has(j.status));
      await Promise.all(
        active.map(async (j) => {
          try {
            const fresh = await api.job(j.id);
            if (fresh.status !== j.status || fresh.result_id !== j.result_id) track(fresh);
          } catch (e) {
            // The API restarted and forgot the job: report it, don't spin forever.
            if (e instanceof ApiError && e.status === 404)
              track({ ...j, status: "failed", error: "Job no longer known to the API (it was restarted). Run again." });
          }
        }),
      );
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [hasActive, track]);

  const submit = useCallback(
    async (cid: string, techniqueId: string, params: Record<string, number>, force = false) => {
      const job = await api.runAnalysis(cid, techniqueId, params, force);
      track(job);
      return job;
    },
    [track],
  );

  const quickScan = useCallback(
    async (cid: string) => {
      const r = await api.quickScan(cid);
      r.jobs.forEach(track);
      return r.jobs;
    },
    [track],
  );

  const value = useMemo<AppState>(() => {
    const list = Object.values(jobs).sort((a, b) => b.submitted_utc.localeCompare(a.submitted_utc));
    return {
      caseId,
      activeCase: caseId && caseQuery.data?.id === caseId ? caseQuery.data : undefined,
      caseLoading: caseQuery.isLoading,
      caseError: caseQuery.error as Error | null,
      selectCase,
      jobs: list,
      activeJobs: list.filter((j) => !TERMINAL.has(j.status)),
      submit,
      quickScan,
      labTechnique,
      setLabTechnique,
    };
  }, [caseId, caseQuery.data, caseQuery.isLoading, caseQuery.error, selectCase, jobs, submit, quickScan, labTechnique]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp outside provider");
  return v;
}

export function useResults(caseId: string | null | undefined) {
  return useQuery({
    queryKey: ["results", caseId],
    queryFn: () => api.results(caseId!).then((r) => r.results),
    enabled: !!caseId,
  });
}

export function useTechniques() {
  return useQuery({ queryKey: ["techniques"], queryFn: api.techniques, staleTime: Infinity });
}
