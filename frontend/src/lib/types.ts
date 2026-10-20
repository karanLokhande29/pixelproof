// One contract with backend/main.py. Analysis fields are the upstream
// result contract (analysis/util.py::make_result) after serialization.

export type AnalysisStatus = "ok" | "insufficient_data" | "not_applicable" | "error";
export type JobStatus = "queued" | "running" | "succeeded" | "failed";
export type FindingLevel = "info" | "notice" | "warning";

export interface Finding {
  level: FindingLevel;
  text: string;
}

export interface ResultImage {
  label: string;
  artifact_id: string;
  url: string;
  width: number;
  height: number;
  registered: boolean; // same pixel grid as the original: overlay allowed
  kind: "map" | "figure";
}

export type Table = Record<string, unknown>[] | Record<string, unknown>;

export interface AnalysisResult {
  id: string;
  case_id: string;
  technique_id: string;
  technique_name: string;
  family: string;
  parameters: Record<string, number>;
  fixed_parameters: Record<string, number>;
  entry_point: string;
  implementation_version: string;
  cache_key: string;
  job_id: string;
  created_utc: string;
  analyst_note: string;
  status: AnalysisStatus;
  summary: string;
  findings: Finding[];
  metrics: Record<string, string | number | null>;
  images: ResultImage[];
  tables: Record<string, Table>;
  limitations: string[];
  details: Record<string, unknown>;
  serialization_notes: string[];
  elapsed_ms: number;
  references_used?: { display_name: string; sha256: string }[];
}

export interface Job {
  id: string;
  case_id: string;
  technique_id: string;
  parameters: Record<string, number>;
  cache_key: string;
  status: JobStatus;
  result_id: string | null;
  cached: boolean;
  error: string | null;
  submitted_utc: string;
  started_utc: string | null;
  finished_utc: string | null;
  lane: "quick" | "heavy" | null;
}

export interface TechniqueParam {
  key: string;
  type: "int";
  min: number;
  max: number;
  default: number;
  label: string;
}

export interface Technique {
  id: string;
  name: string;
  family: string;
  cost: "quick" | "heavy";
  summary: string;
  description_id: string;
  parameters: TechniqueParam[];
  fixed_parameters: Record<string, number>;
  jpeg_only: boolean;
  experimental: boolean;
  uses_references: boolean;
  in_quick_scan: boolean;
  entry_point: string;
  version: string;
}

export interface Hashes {
  sha256: string;
  sha512: string;
  md5: string;
  pixel_sha256: string;
  size: number;
  format: string;
  dimensions: [number, number];
  phash: string;
  dhash: string;
  ahash: string;
}

export interface KnownEdit {
  title: string;
  edit: string;
  tab: string | null;
  techniques: string[];
}

export interface Reference {
  id: string;
  display_name: string;
  format: string;
  width: number;
  height: number;
  sha256: string;
  from_example: boolean;
}

export interface Case {
  id: string;
  title: string;
  description: string;
  notes: string;
  created_utc: string;
  updated_utc: string;
  source: { kind: "upload" | "example"; example_id: string | null; display_name: string };
  original: {
    display_name: string;
    format: "JPEG" | "PNG";
    mime: string;
    width: number;
    height: number;
    mode: string;
    size: number;
    sha256: string;
  };
  original_url: string;
  hashes: Hashes;
  known_edit: KnownEdit | null;
  references: Reference[];
  regions: Region[];
  results: string[];
}

/** Analyst-marked rectangle in the original's stored pixel coordinates. */
export interface Region {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  created_utc: string;
}

export interface CaseSummary {
  id: string;
  title: string;
  created_utc: string;
  format: string;
  display_name: string;
  sha256: string;
  results: number;
  example_id: string | null;
  original_url: string;
}

export interface Example {
  id: string;
  title: string;
  tab: string | null;
  edit: string;
  techniques: string[];
  file: string;
  references: number;
  image_url: string;
}

export interface Health {
  service: string;
  version: string;
  status: string;
  all_technique_modules_found: boolean;
  c2pa_reader_installed: boolean;
  examples_available: number;
  executor_lanes: Record<string, number>;
  ledger_signing: string;
  frontend_built: boolean;
}

export interface PlainResult {
  status: AnalysisStatus;
  summary: string;
  findings: Finding[];
  metrics: Record<string, string | number | null>;
  tables: Record<string, Table>;
  limitations: string[];
  details?: Record<string, unknown>;
}

export interface CompareOutcome {
  against: {
    label: string;
    format: string;
    dimensions: [number, number];
    size: number;
    sha256: string;
    pixel_sha256: string;
    phash: string;
    dhash: string;
    ahash: string;
  };
  same_bytes: boolean;
  same_pixels: boolean;
  classification: "byte-identical" | "pixel-identical" | "visually similar" | "no match";
  distances: { phash: number; dhash: number; ahash: number };
  threshold_bits: number;
  result: PlainResult;
}

export interface LedgerRecord {
  id: number;
  created_utc: string;
  label: string;
  note: string;
  hashes: Hashes;
  prev_hash: string;
  record_hash: string;
}

export interface LedgerState {
  records: LedgerRecord[];
  stats: { records: number; first_utc: string | null; last_utc: string | null; total_bytes: number; chain_valid: boolean };
  chain: { valid: boolean; broken_at: number | null; n: number };
  signing: string;
}

export interface ImportReport {
  signature_valid: boolean | null;
  digest_ok: boolean;
  signature_alg: string | null;
  chain_valid: boolean;
  accepted: boolean;
  merged: number;
  duplicates_skipped: number;
  message: string;
}
