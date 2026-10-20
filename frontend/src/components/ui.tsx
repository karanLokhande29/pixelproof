import { useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { AlertTriangle, Check, Copy, Info, Loader2, RotateCw } from "lucide-react";
import { STATUS_LABEL } from "../lib/format";

type Variant = "primary" | "secondary" | "ghost" | "danger";

export function Button({
  variant = "secondary", className = "", children, busy, ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; busy?: boolean }) {
  const styles: Record<Variant, string> = {
    primary: "bg-accent text-page hover:bg-[#6fd8cf] font-semibold",
    secondary: "bg-raised text-ink border border-line2 hover:border-accent/60",
    ghost: "text-dim hover:text-ink hover:bg-raised",
    danger: "bg-transparent text-danger border border-danger/50 hover:bg-danger/10",
  };
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${styles[variant]} ${className}`}
      disabled={busy || rest.disabled}
      {...rest}
    >
      {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-xl border border-line bg-surface ${className}`}>{children}</section>;
}

export function CardHeader({ title, subtitle, right }: { title: ReactNode; subtitle?: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold tracking-wide text-ink">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-dim">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

const STATUS_STYLE: Record<string, string> = {
  ok: "border-accent/50 text-accent bg-accent/10",
  succeeded: "border-accent/50 text-accent bg-accent/10",
  insufficient_data: "border-caution/50 text-caution bg-caution/10",
  not_applicable: "border-info/50 text-info bg-info/10",
  error: "border-danger/60 text-danger bg-danger/10",
  failed: "border-danger/60 text-danger bg-danger/10",
  queued: "border-line2 text-dim bg-raised",
  running: "border-accent/40 text-accent bg-accent/5",
};

export function StatusBadge({ status, className = "" }: { status: string; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLE[status] ?? "border-line2 text-dim"} ${className}`}>
      {status === "running" && <Loader2 className="h-3 w-3 animate-spin" aria-hidden />}
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

export function Tag({ children, tone = "default" }: { children: ReactNode; tone?: "default" | "caution" | "accent" | "info" }) {
  const t = {
    default: "border-line2 text-dim",
    caution: "border-caution/50 text-caution",
    accent: "border-accent/50 text-accent",
    info: "border-info/50 text-info",
  }[tone];
  return <span className={`inline-flex items-center rounded border px-1.5 py-px text-[10px] uppercase tracking-wider ${t}`}>{children}</span>;
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-dim" role="status">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      {label ?? "Loading…"}
    </div>
  );
}

export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    <div className="flex items-start gap-3 rounded-lg border border-danger/50 bg-danger/10 p-3 text-sm text-ink" role="alert">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden />
      <div className="flex-1 break-words">{msg}</div>
      {onRetry && (
        <Button variant="ghost" onClick={onRetry} className="!px-2 !py-1">
          <RotateCw className="h-3.5 w-3.5" /> Retry
        </Button>
      )}
    </div>
  );
}

export function Notice({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "caution" }) {
  const s = tone === "caution" ? "border-caution/40 bg-caution/5" : "border-info/30 bg-info/5";
  const Icon = tone === "caution" ? AlertTriangle : Info;
  return (
    <div className={`flex items-start gap-2.5 rounded-lg border p-3 text-[13px] leading-relaxed text-ink/90 ${s}`}>
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${tone === "caution" ? "text-caution" : "text-info"}`} aria-hidden />
      <div>{children}</div>
    </div>
  );
}

export function Empty({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      {icon && <div className="text-faint">{icon}</div>}
      <p className="text-sm font-medium text-ink">{title}</p>
      {children && <div className="max-w-md text-xs text-dim">{children}</div>}
    </div>
  );
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-dim hover:bg-raised hover:text-ink"
      onClick={() => {
        navigator.clipboard?.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1200);
        });
      }}
      aria-label={`${label} to clipboard`}
    >
      {done ? <Check className="h-3 w-3 text-accent" /> : <Copy className="h-3 w-3" />}
      {done ? "Copied" : label}
    </button>
  );
}

export function Tabs<T extends string>({
  tabs, value, onChange,
}: { tabs: { id: T; label: ReactNode; count?: number }[]; value: T; onChange: (t: T) => void }) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-line px-2" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
            value === t.id ? "border-accent text-ink" : "border-transparent text-dim hover:text-ink"
          }`}
        >
          {t.label}
          {t.count !== undefined && <span className="ml-1.5 rounded bg-raised px-1 text-[10px] text-dim">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Mono({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`break-all font-mono text-[12px] ${className}`}>{children}</span>;
}
