import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, CheckCircle2, Download, FileSearch, Link2, Play, ShieldQuestion, Trash2, Upload, XCircle } from "lucide-react";
import { api } from "../lib/api";
import { fmtBytes, fmtTime } from "../lib/format";
import type { AnalysisResult, Case, CompareOutcome, Hashes, PlainResult } from "../lib/types";
import { useApp, useResults } from "../state/AppState";
import { CaseHeader, RequireCase } from "../components/CaseHeader";
import { Collapsible, FindingsList, LimitationsList, MetricsGrid, StatusSummary, TablesView } from "../components/Evidence";
import { UploadZone } from "../components/UploadZone";
import { Button, Card, CardHeader, CopyButton, Empty, ErrorBox, Mono, Notice, Spinner, StatusBadge, Tag } from "../components/ui";

export default function Provenance() {
  return <RequireCase>{(c) => <ProvenancePage key={c.id} c={c} />}</RequireCase>;
}

function ProvenancePage({ c }: { c: Case }) {
  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <CaseHeader c={c} />
      <div className="grid gap-4 xl:grid-cols-2">
        <Identity h={c.hashes} />
        <CompareImage c={c} />
      </div>
      <MetadataSection c={c} />
      <Ledger c={c} />
    </div>
  );
}

const KINDS = [
  { k: "Same bytes", h: "SHA-256 / SHA-512 of the file", d: "Cryptographic. Equal digests mean the files are byte-for-byte identical. One changed bit changes the digest." },
  { k: "Same decoded pixels", h: "Pixel SHA-256", d: "Digest of decoded pixels + mode + size. Survives metadata/container changes; does not survive any re-encode." },
  { k: "Similar-looking", h: "pHash / dHash / aHash", d: "Perceptual. Small Hamming distance = visually similar only. Not integrity: local edits and recompression can both stay within the threshold." },
];

function Identity({ h }: { h: Hashes }) {
  const rows: [string, string, string?][] = [
    ["SHA-256 (file bytes)", h.sha256, "cryptographic"],
    ["SHA-512 (file bytes)", h.sha512, "cryptographic"],
    ["MD5 (legacy, collision-broken)", h.md5, "legacy"],
    ["Pixel SHA-256 (decoded pixels)", h.pixel_sha256, "pixel"],
    ["pHash", h.phash, "perceptual"],
    ["dHash", h.dhash, "perceptual"],
    ["aHash", h.ahash, "perceptual"],
  ];
  return (
    <Card>
      <CardHeader title="Evidence identity" subtitle={`${h.format} · ${h.dimensions[0]}×${h.dimensions[1]} px · ${fmtBytes(h.size)} — computed by the API from the stored original`} />
      <div className="space-y-3 p-4">
        <table className="w-full text-xs">
          <tbody>
            {rows.map(([k, v, kind]) => (
              <tr key={k} className="border-b border-line/60 align-top">
                <th className="w-44 py-1.5 pr-2 text-left font-medium text-dim">{k}<div><Tag tone={kind === "cryptographic" ? "accent" : kind === "perceptual" ? "caution" : "default"}>{kind}</Tag></div></th>
                <td className="py-1.5"><Mono className="text-ink/90">{v}</Mono> <CopyButton text={v} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="grid gap-2 sm:grid-cols-3">
          {KINDS.map((x) => (
            <div key={x.k} className="rounded-md border border-line bg-raised/40 p-2.5">
              <div className="text-xs font-semibold text-ink">{x.k}</div>
              <div className="font-mono text-[10px] text-accent">{x.h}</div>
              <p className="mt-1 text-[11px] leading-snug text-dim">{x.d}</p>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

function CompareImage({ c }: { c: Case }) {
  const ex = useQuery({ queryKey: ["examples"], queryFn: api.examples, staleTime: Infinity });
  const [file, setFile] = useState<File | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [exampleId, setExampleId] = useState("");
  const up = useMutation({ mutationFn: (f: File) => api.compareUpload(c.id, f) });
  const exm = useMutation({ mutationFn: (id: string) => api.compareExample(c.id, id) });
  const out = (up.data && (!exm.data || (up.submittedAt > exm.submittedAt)) ? up.data : exm.data) as CompareOutcome | undefined;
  return (
    <Card>
      <CardHeader title="Compare with another image" subtitle="Classifies the second file against this case's original: same bytes, same pixels, similar-looking, or no match." />
      <div className="space-y-3 p-4">
        <UploadZone compact file={file} onFile={(f, p) => { setFile(f); setProblem(p); }} label="Drop a second JPEG/PNG to compare" />
        {problem && <ErrorBox error={problem} />}
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" disabled={!file} busy={up.isPending} onClick={() => file && up.mutate(file)}><Upload className="h-4 w-4" /> Compare upload</Button>
          <select value={exampleId} onChange={(e) => setExampleId(e.target.value)} aria-label="Bundled image to compare"
                  className="min-w-0 flex-1 rounded-md border border-line2 bg-page px-2 py-1.5 text-xs text-ink">
            <option value="">…or pick a bundled image</option>
            {ex.data?.examples.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
          </select>
          <Button disabled={!exampleId} busy={exm.isPending} onClick={() => exm.mutate(exampleId)}>Compare</Button>
        </div>
        {(up.error || exm.error) && <ErrorBox error={up.error ?? exm.error} />}
        {out && <CompareResult c={c} o={out} />}
      </div>
    </Card>
  );
}

function CompareResult({ c, o }: { c: Case; o: CompareOutcome }) {
  const tone = o.classification === "byte-identical" ? "text-accent" : o.classification === "no match" ? "text-dim" : "text-caution";
  const Row = ({ ok, label, detail }: { ok: boolean; label: string; detail: string }) => (
    <li className="flex items-start gap-2 text-xs">
      {ok ? <CheckCircle2 className="h-4 w-4 shrink-0 text-accent" /> : <XCircle className="h-4 w-4 shrink-0 text-faint" />}
      <span className="text-ink">{label}</span><span className="text-dim">{detail}</span>
    </li>
  );
  const similar = o.distances.phash <= o.threshold_bits;
  return (
    <div className="space-y-3 rounded-lg border border-line p-3">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="text-xs text-dim">Against <span className="text-ink">{o.against.label}</span>:</span>
        <span className={`text-base font-semibold ${tone}`}>{o.classification}</span>
      </div>
      <ul className="space-y-1.5">
        <Row ok={o.same_bytes} label="Same bytes" detail={o.same_bytes ? "SHA-256 identical" : "SHA-256 differs"} />
        <Row ok={o.same_pixels} label="Same decoded pixels" detail={o.same_pixels ? "pixel SHA-256 identical" : "pixel SHA-256 differs"} />
        <Row ok={similar} label="Similar-looking" detail={`pHash ${o.distances.phash} · dHash ${o.distances.dhash} · aHash ${o.distances.ahash} bits of 64 (threshold ${o.threshold_bits})`} />
      </ul>
      {similar && !o.same_pixels && (
        <Notice tone="caution">Visually similar is <strong>not</strong> integrity: perceptual hashes cannot tell a local edit from recompression or resizing.</Notice>
      )}
      <table className="w-full text-[11px]">
        <thead><tr className="text-left text-dim"><th className="py-1">Hash</th><th>This case</th><th>Other image</th></tr></thead>
        <tbody className="font-mono">
          {(["sha256", "pixel_sha256", "phash", "dhash", "ahash"] as const).map((k) => (
            <tr key={k} className="border-t border-line/60 align-top">
              <td className="py-1 pr-2 font-sans text-dim">{k}</td>
              <td className="break-all pr-2 text-ink/85">{c.hashes[k].slice(0, 24)}{c.hashes[k].length > 24 ? "…" : ""}</td>
              <td className={`break-all ${c.hashes[k] === o.against[k] ? "text-accent" : "text-ink/85"}`}>{o.against[k].slice(0, 24)}{o.against[k].length > 24 ? "…" : ""}</td>
            </tr>
          ))}
          <tr className="border-t border-line/60"><td className="py-1 font-sans text-dim">size / dims</td>
            <td>{fmtBytes(c.hashes.size)} · {c.hashes.dimensions.join("×")}</td><td>{fmtBytes(o.against.size)} · {o.against.dimensions.join("×")}</td></tr>
        </tbody>
      </table>
      <Collapsible title={`Limitations (${o.result.limitations.length})`}><LimitationsList limitations={o.result.limitations} /></Collapsible>
    </div>
  );
}

interface C2pa {
  present: boolean; validation_state: string | null; valid: boolean; claim_generator: string | null; title: string | null;
  signer: string | null; issuer: string | null; signing_time: string | null; ai_generated: boolean; ai_indicators: unknown[];
  actions: unknown[]; failures: { code: string; explanation: string }[]; errors: string[]; manifests: number; ingredients: number;
}

function MetadataSection({ c }: { c: Case }) {
  const results = useResults(c.id);
  const { submit, activeJobs } = useApp();
  const [err, setErr] = useState<unknown>(null);
  const meta: AnalysisResult | undefined = [...(results.data ?? [])].reverse().find((r) => r.case_id === c.id && r.technique_id === "metadata");
  const running = activeJobs.some((j) => j.case_id === c.id && j.technique_id === "metadata");
  const c2pa = meta?.details?.c2pa as C2pa | undefined;
  return (
    <Card>
      <CardHeader title="Metadata & Content Credentials" subtitle="EXIF, XMP, PNG text and offline C2PA (no remote manifests or OCSP are fetched)."
                  right={<Button onClick={async () => { setErr(null); try { await submit(c.id, "metadata", {}); } catch (e) { setErr(e); } }} busy={running}>
                    <Play className="h-4 w-4" /> {meta ? "Run again (uses cache)" : "Run metadata analysis"}</Button>} />
      <div className="space-y-4 p-4">
        {err !== null && <ErrorBox error={err} />}
        {results.isLoading && <Spinner />}
        {!meta && !results.isLoading && (
          <Empty icon={<FileSearch className="h-7 w-7" />} title="Metadata has not been analysed for this case">
            Run it here or in the Lab. Nothing is read until you do.
          </Empty>
        )}
        {meta && (
          <>
            <StatusSummary status={meta.status} summary={meta.summary} />
            <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
              <C2paCard c2pa={c2pa} />
              <div className="space-y-3">
                <MetricsGrid metrics={meta.metrics} />
                <FindingsList findings={meta.findings} />
              </div>
            </div>
            {meta.images.map((im) => (
              <figure key={im.artifact_id} className="space-y-1">
                <img src={im.url} alt={im.label} className="max-h-48 rounded border border-line" />
                <figcaption className="text-[11px] text-dim">{im.label}</figcaption>
              </figure>
            ))}
            {Object.keys(meta.tables).length > 0 ? <TablesView tables={meta.tables} />
              : <p className="text-xs text-dim">No EXIF / XMP / PNG-text tables: this file carries no such metadata. Missing metadata is common (messaging apps, screenshots, editors) and is not itself evidence of editing.</p>}
            <Collapsible title={`Limitations (${meta.limitations.length})`}><LimitationsList limitations={meta.limitations} /></Collapsible>
          </>
        )}
      </div>
    </Card>
  );
}

function C2paCard({ c2pa }: { c2pa?: C2pa }) {
  if (!c2pa) return <div className="rounded-lg border border-line p-3 text-xs text-dim">C2PA details unavailable in this result.</div>;
  if (c2pa.errors?.length && !c2pa.present)
    return (
      <div className="rounded-lg border border-caution/40 p-3 text-xs">
        <div className="flex items-center gap-2 font-semibold text-caution"><ShieldQuestion className="h-4 w-4" /> C2PA reader unavailable / offline</div>
        <p className="mt-1 text-dim">{c2pa.errors.join("; ")}</p>
      </div>
    );
  if (!c2pa.present)
    return (
      <div className="rounded-lg border border-line p-3 text-xs">
        <div className="flex items-center gap-2 font-semibold text-ink"><ShieldQuestion className="h-4 w-4 text-dim" /> No Content Credentials present</div>
        <p className="mt-1 text-dim">This file carries no C2PA manifest. Most cameras and apps don't write one; absence says nothing about editing.</p>
      </div>
    );
  return (
    <div className="space-y-1.5 rounded-lg border border-accent/40 p-3 text-xs">
      <div className="flex items-center gap-2 font-semibold text-accent"><BadgeCheck className="h-4 w-4" /> Content Credentials present</div>
      <dl className="grid grid-cols-[110px_1fr] gap-x-2 gap-y-1">
        <dt className="text-dim">Validation</dt><dd className="text-ink">{c2pa.validation_state ?? "unknown"}</dd>
        <dt className="text-dim">Generator</dt><dd className="text-ink">{c2pa.claim_generator ?? "—"}</dd>
        <dt className="text-dim">Signer</dt><dd className="text-ink">{c2pa.signer ?? "—"}</dd>
        <dt className="text-dim">Issuer</dt><dd className="text-ink">{c2pa.issuer ?? "—"}</dd>
        <dt className="text-dim">Signed</dt><dd className="text-ink">{c2pa.signing_time ?? "—"}</dd>
        <dt className="text-dim">Manifests</dt><dd className="text-ink">{c2pa.manifests} · ingredients {c2pa.ingredients}</dd>
        <dt className="text-dim">AI indicators</dt><dd className="text-ink">{c2pa.ai_generated ? "declared in manifest" : "none declared"}</dd>
      </dl>
      {c2pa.failures?.length > 0 && <p className="text-caution">Validation failures: {c2pa.failures.map((f) => f.code).join(", ")}</p>}
      <p className="text-[11px] text-faint">A credential states who signed what; it is not a legal determination.</p>
    </div>
  );
}

function Ledger({ c }: { c: Case }) {
  const qc = useQueryClient();
  const led = useQuery({ queryKey: ["ledger"], queryFn: api.ledger });
  const [note, setNote] = useState("");
  const [check, setCheck] = useState<PlainResult | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["ledger"] });
  const add = useMutation({ mutationFn: () => api.ledgerAdd(c.id, note), onSuccess: () => { setNote(""); refresh(); } });
  const chk = useMutation({ mutationFn: () => api.ledgerCheck(c.id), onSuccess: setCheck });
  const imp = useMutation({ mutationFn: (f: File) => api.ledgerImport(f), onSuccess: refresh });
  const clr = useMutation({ mutationFn: api.ledgerClear, onSuccess: () => { setCheck(null); refresh(); } });
  const s = led.data;
  return (
    <Card>
      <CardHeader title="Hash ledger (this machine)"
                  subtitle="Upstream hash-chain ledger, stored in build_artifacts/ledger.json. It records that a file with these hashes was seen; it is not a trusted timestamp or legal chain of custody." />
      <div className="space-y-4 p-4">
        {led.isLoading && <Spinner />}
        {led.error && <ErrorBox error={led.error} onRetry={() => led.refetch()} />}
        {s && (
          <div className="flex flex-wrap gap-2 text-xs">
            <Tag tone="accent">{s.stats.records} records</Tag>
            <Tag tone={s.chain.valid ? "accent" : "caution"}>hash chain {s.chain.valid ? "consistent" : `broken at #${s.chain.broken_at}`}</Tag>
            <Tag>{s.signing}</Tag>
            {s.stats.last_utc && <Tag>last added {fmtTime(s.stats.last_utc)}</Tag>}
          </div>
        )}
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder="Note for the ledger record (optional)"
                 className="rounded-md border border-line2 bg-page px-2.5 py-1.5 text-sm text-ink placeholder:text-faint" aria-label="Ledger note" />
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" busy={add.isPending} onClick={() => add.mutate()}><Link2 className="h-4 w-4" /> Add this case's original</Button>
            <Button busy={chk.isPending} onClick={() => chk.mutate()}>Check against ledger</Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a href="/api/ledger/export" className={`inline-flex items-center gap-2 rounded-md border border-line2 bg-raised px-3 py-1.5 text-sm hover:border-accent/60 ${s?.stats.records ? "" : "pointer-events-none opacity-45"}`}
             aria-disabled={!s?.stats.records}>
            <Download className="h-4 w-4" /> Export ledger JSON
          </a>
          <Button onClick={() => fileInput.current?.click()} busy={imp.isPending}><Upload className="h-4 w-4" /> Import &amp; merge…</Button>
          <input ref={fileInput} type="file" accept=".json,application/json" className="hidden"
                 onChange={(e) => { const f = e.target.files?.[0]; if (f) imp.mutate(f); e.target.value = ""; }} />
          <Button variant="danger" disabled={!s?.stats.records} busy={clr.isPending}
                  onClick={() => window.confirm("Clear every record from the local ledger? Export it first if you need it.") && clr.mutate()}>
            <Trash2 className="h-4 w-4" /> Clear
          </Button>
        </div>
        {s && !s.signing.startsWith("HMAC") && (
          <p className="text-[11px] text-dim">Exports carry an unkeyed SHA-256 digest: it detects accidental change only — anyone can edit and re-hash the file. Set <span className="font-mono">PIXELPROOF_LEDGER_KEY</span> before starting the API for HMAC-SHA256 signing.</p>
        )}
        {(add.error || chk.error || imp.error || clr.error) && <ErrorBox error={add.error ?? chk.error ?? imp.error ?? clr.error} />}
        {imp.data && (
          <Notice tone={imp.data.accepted ? "info" : "caution"}>
            <strong>{imp.data.accepted ? "Import accepted" : "Import rejected"}:</strong> {imp.data.message} Merged {imp.data.merged}, duplicates skipped {imp.data.duplicates_skipped},
            chain {imp.data.chain_valid ? "valid" : "broken"}, digest {imp.data.digest_ok ? "ok" : "mismatch"}.
          </Notice>
        )}
        {check && (
          <div className="space-y-2 rounded-lg border border-line p-3">
            <div className="flex items-center gap-2"><StatusBadge status={check.status} /><span className="text-xs text-ink">{check.summary}</span></div>
            <MetricsGrid metrics={check.metrics} />
            <FindingsList findings={check.findings} compact />
            <Collapsible title="Top matches & query hashes"><TablesView tables={check.tables} /></Collapsible>
          </div>
        )}
        {s && s.records.length > 0 ? (
          <div className="max-h-64 overflow-auto rounded border border-line">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-raised text-left text-dim">
                <tr><th className="px-2 py-1.5">#</th><th>Label</th><th>Added (UTC)</th><th>SHA-256</th><th>Note</th></tr>
              </thead>
              <tbody>
                {s.records.map((r) => (
                  <tr key={r.id} className={`border-t border-line/60 ${r.hashes.sha256 === c.hashes.sha256 ? "bg-accent/5" : ""}`}>
                    <td className="px-2 py-1 font-mono">{r.id}</td>
                    <td className="max-w-[180px] truncate">{r.label}</td>
                    <td className="whitespace-nowrap">{r.created_utc}</td>
                    <td className="font-mono">{r.hashes.sha256.slice(0, 16)}…{r.hashes.sha256 === c.hashes.sha256 && <span className="ml-1 text-accent">(this case)</span>}</td>
                    <td className="max-w-[220px] truncate text-dim">{r.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : s && <p className="text-xs text-dim">The ledger is empty.</p>}
      </div>
    </Card>
  );
}
