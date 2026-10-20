import { useEffect, useRef, useState, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Activity, FileText, Fingerprint, GitCompareArrows, Info, LayoutDashboard, Menu, Microscope, X } from "lucide-react";
import { useApp } from "../state/AppState";
import { useTechniques } from "../state/AppState";
import { fmtBytes } from "../lib/format";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/lab", label: "Forensic Lab", icon: Microscope },
  { to: "/compare", label: "Compare", icon: GitCompareArrows },
  { to: "/provenance", label: "Provenance", icon: Fingerprint },
  { to: "/reports", label: "Reports", icon: FileText },
];

export function AppShell({ children }: { children: ReactNode }) {
  const [navOpen, setNavOpen] = useState(false);
  const [about, setAbout] = useState(false);
  const loc = useLocation();
  useEffect(() => setNavOpen(false), [loc.pathname]);

  return (
    <div className="flex min-h-screen">
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-line bg-[#0D131D] transition-transform lg:static lg:translate-x-0 ${navOpen ? "translate-x-0" : "-translate-x-full"}`}
        aria-label="Main navigation"
      >
        <div className="flex items-center gap-2.5 px-5 py-5">
          <img src="/favicon.svg" alt="" className="h-8 w-8" />
          <div>
            <div className="text-[15px] font-semibold tracking-wide text-ink">PixelProof</div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-faint">Evidence investigation</div>
          </div>
          <button className="ml-auto rounded p-1 text-dim lg:hidden" onClick={() => setNavOpen(false)} aria-label="Close navigation">
            <X className="h-4 w-4" />
          </button>
        </div>
        <nav className="flex-1 space-y-0.5 px-3">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  isActive ? "bg-accent/10 text-accent" : "text-dim hover:bg-raised hover:text-ink"
                }`
              }
            >
              <Icon className="h-4 w-4" aria-hidden />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="space-y-3 border-t border-line p-4">
          <p className="text-[11px] leading-relaxed text-faint">
            Every result is an <span className="text-caution">indicator, not proof</span>. No method here outputs an authenticity verdict.
          </p>
          <button onClick={() => setAbout(true)} className="flex items-center gap-2 text-xs text-dim hover:text-ink">
            <Info className="h-3.5 w-3.5" /> About &amp; credits
          </button>
        </div>
      </aside>
      {navOpen && <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setNavOpen(false)} />}

      <div className="flex min-w-0 flex-1 flex-col">
        <Header onMenu={() => setNavOpen(true)} />
        <main className="flex-1 px-4 py-5 sm:px-6">{children}</main>
      </div>
      {about && <AboutDialog onClose={() => setAbout(false)} />}
    </div>
  );
}

function Header({ onMenu }: { onMenu: () => void }) {
  const { activeCase, caseLoading, activeJobs } = useApp();
  const loc = useLocation();
  const techniques = useTechniques();
  const page = NAV.find((n) => (n.to === "/" ? loc.pathname === "/" : loc.pathname.startsWith(n.to)))?.label ?? "";
  const t = new URLSearchParams(loc.search).get("t");
  const method = t && techniques.data?.techniques.find((x) => x.id === t)?.name;

  return (
    <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-line bg-page/90 px-4 py-2.5 backdrop-blur sm:px-6">
      <button className="rounded p-1.5 text-dim hover:bg-raised lg:hidden" onClick={onMenu} aria-label="Open navigation">
        <Menu className="h-5 w-5" />
      </button>
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-xs text-dim">
        <span className="truncate">{activeCase ? activeCase.title : caseLoading ? "Loading case…" : "No case selected"}</span>
        <span className="text-faint">/</span>
        <span className="text-ink">{page}</span>
        {method && page === "Forensic Lab" && (<><span className="text-faint">/</span><span className="truncate text-accent">{method}</span></>)}
      </nav>
      <div className="ml-auto flex items-center gap-3">
        {activeCase && (
          <span className="hidden items-center gap-2 rounded-md border border-line px-2 py-1 font-mono text-[11px] text-dim md:flex">
            <span className="text-ink">{activeCase.original.format}</span>
            {activeCase.original.width}×{activeCase.original.height} · {fmtBytes(activeCase.original.size)}
          </span>
        )}
        <span
          className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] ${activeJobs.length ? "border-accent/50 text-accent" : "border-line text-dim"}`}
          title="Analyses queued or running on the API"
          aria-live="polite"
        >
          <Activity className={`h-3.5 w-3.5 ${activeJobs.length ? "animate-pulse" : ""}`} />
          {activeJobs.length} job{activeJobs.length === 1 ? "" : "s"} active
        </span>
      </div>
    </header>
  );
}

function AboutDialog({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="about-title"
           className="max-h-[85vh] w-full max-w-xl overflow-auto rounded-xl border border-line2 bg-surface p-6 outline-none"
           onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <h2 id="about-title" className="text-lg font-semibold">About PixelProof</h2>
          <button onClick={onClose} className="rounded p-1 text-dim hover:bg-raised" aria-label="Close"><X className="h-4 w-4" /></button>
        </div>
        <div className="mt-4 space-y-3 text-sm leading-relaxed text-ink/90">
          <p>
            PixelProof is an explainable, multi-technique visual-evidence investigation workspace: cases, a forensic lab with
            registered overlays, side-by-side method comparison, provenance hashing and printable reports.
          </p>
          <p>
            <strong>Forensic algorithms are not new work.</strong> All 14 techniques are the unmodified modules of
            <em> Veritas — Forensic Image Analysis Toolkit</em> by Rafay Adeel (BSD 3-Clause,{" "}
            <a className="text-accent underline" href="https://github.com/CodeRafay/Forensic-Image-Analysis-Toolkit" target="_blank" rel="noopener noreferrer">github.com/CodeRafay/Forensic-Image-Analysis-Toolkit</a>),
            which cite the published methods (Krawetz, Farid, Bianchi &amp; Piva, Amerini et al., Cozzolino et al., Lukáš/Fridrich/Goljan,
            Kirchner, Stamm &amp; Liu, Ker &amp; Böhme and others). The original Streamlit app remains available as a fallback.
          </p>
          <p>
            <strong>New in PixelProof:</strong> the FastAPI adapter (case store with immutable originals, method registry, bounded job
            workers, serializer), this React interface, comparison and provenance workflows, and JSON/HTML reports.
          </p>
          <p className="text-caution">
            Results are indicators, not proof. A forged image can pass every test; an unedited one can trigger findings. There is no
            authenticity score, probability or legal-admissibility verdict anywhere in this application.
          </p>
          <p className="text-xs text-dim">Copyright (c) 2025, Rafay Adeel — BSD 3-Clause License (see LICENSE in the repository).</p>
        </div>
      </div>
    </div>
  );
}
