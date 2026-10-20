import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { Maximize, Minus, Plus, Scan } from "lucide-react";

export interface View {
  scale: number;
  x: number;
  y: number;
}

export interface Layer {
  src: string;
  alt: string;
  opacity?: number; // 0..1
  wipe?: number; // 0..1: show only the left fraction of this layer
}

const MIN_SCALE = 0.05;
const MAX_SCALE = 32;

/**
 * Pan/zoom viewer. All layers share one pixel grid of `width` x `height`
 * (the caller only stacks layers whose dimensions match exactly). Images are
 * shown in stored pixel order (`image-orientation: none`) so coordinates match
 * what the analyses read: EXIF orientation is not applied, as in the upstream
 * `load_array`.
 */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function ImageCanvas({
  width, height, layers, view, onView, caption, className = "", regions = [], drawing = false, onDraw,
}: {
  width: number;
  height: number;
  layers: Layer[];
  view: View | null;
  onView: (v: View) => void;
  caption?: string;
  className?: string;
  regions?: (Rect & { id: string; label: string })[]; // drawn only when they share this pixel grid
  drawing?: boolean; // drag draws a rectangle instead of panning
  onDraw?: (r: Rect) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const drag = useRef<{ px: number; py: number; vx: number; vy: number } | null>(null);
  const [draft, setDraft] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);

  const toImage = (e: PointerEvent) => {
    const r = box.current!.getBoundingClientRect();
    const v = viewRef.current!;
    const cx = (e.clientX - r.left - v.x) / v.scale;
    const cy = (e.clientY - r.top - v.y) / v.scale;
    return { x: Math.min(width, Math.max(0, Math.round(cx))), y: Math.min(height, Math.max(0, Math.round(cy))) };
  };
  const draftRect = (d: NonNullable<typeof draft>): Rect => ({
    x: Math.min(d.x0, d.x1), y: Math.min(d.y0, d.y1), w: Math.abs(d.x1 - d.x0), h: Math.abs(d.y1 - d.y0),
  });
  const viewRef = useRef(view);
  viewRef.current = view;

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fit = useCallback((): View => {
    const s = Math.min(size.w / width, size.h / height) * 0.98 || 1;
    return { scale: s, x: (size.w - width * s) / 2, y: (size.h - height * s) / 2 };
  }, [size, width, height]);

  useEffect(() => {
    if (!view && size.w > 0 && size.h > 0) onView(fit());
  }, [view, size, fit, onView]);

  const zoomAt = useCallback(
    (factor: number, mx: number, my: number) => {
      const v = viewRef.current;
      if (!v) return;
      const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * factor));
      const k = s / v.scale;
      onView({ scale: s, x: mx - (mx - v.x) * k, y: my - (my - v.y) * k });
    },
    [onView],
  );

  // Non-passive wheel listener so the page doesn't scroll while zooming.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  const onPointerDown = (e: PointerEvent) => {
    if (!view || e.button !== 0) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    if (drawing) {
      const p = toImage(e);
      setDraft({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
      return;
    }
    drag.current = { px: e.clientX, py: e.clientY, vx: view.x, vy: view.y };
  };
  const onPointerMove = (e: PointerEvent) => {
    const r = box.current!.getBoundingClientRect();
    const v = viewRef.current;
    if (v) {
      const ix = Math.floor((e.clientX - r.left - v.x) / v.scale);
      const iy = Math.floor((e.clientY - r.top - v.y) / v.scale);
      setCursor(ix >= 0 && iy >= 0 && ix < width && iy < height ? { x: ix, y: iy } : null);
    }
    if (draft && v) {
      const p = toImage(e);
      setDraft({ ...draft, x1: p.x, y1: p.y });
      return;
    }
    if (drag.current && v) {
      onView({ ...v, x: drag.current.vx + e.clientX - drag.current.px, y: drag.current.vy + e.clientY - drag.current.py });
    }
  };
  const endDrag = () => {
    drag.current = null;
    if (draft) {
      const r = draftRect(draft);
      setDraft(null);
      if (r.w >= 2 && r.h >= 2) onDraw?.(r);
    }
  };

  const onKey = (e: KeyboardEvent) => {
    const v = viewRef.current;
    if (!v) return;
    const cx = size.w / 2, cy = size.h / 2;
    const step = 48;
    const map: Record<string, () => void> = {
      "+": () => zoomAt(1.25, cx, cy),
      "=": () => zoomAt(1.25, cx, cy),
      "-": () => zoomAt(0.8, cx, cy),
      "0": () => onView(fit()),
      "1": () => zoomAt(1 / v.scale, cx, cy),
      ArrowLeft: () => onView({ ...v, x: v.x + step }),
      ArrowRight: () => onView({ ...v, x: v.x - step }),
      ArrowUp: () => onView({ ...v, y: v.y + step }),
      ArrowDown: () => onView({ ...v, y: v.y - step }),
    };
    if (map[e.key]) {
      e.preventDefault();
      map[e.key]();
    }
  };

  const pixelated = (view?.scale ?? 1) >= 2;

  return (
    <div className={`relative overflow-hidden rounded-lg border border-line bg-[#070a10] ${className}`}>
      <div
        ref={box}
        className={`checker absolute inset-0 touch-none outline-none focus-visible:ring-2 focus-visible:ring-accent ${drawing ? "cursor-crosshair" : "cursor-grab active:cursor-grabbing"}`}
        tabIndex={0}
        role="img"
        aria-label={`${caption ?? "Image"} viewer. Drag to pan, scroll or +/- to zoom, 0 to fit, 1 for actual pixels, arrows to pan.`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={() => setCursor(null)}
        onKeyDown={onKey}
        onDoubleClick={() => onView(fit())}
      >
        {view && (
          <div
            style={{
              position: "absolute", left: 0, top: 0, width, height,
              transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
              transformOrigin: "0 0",
            }}
          >
            {layers.map((l, i) => (
              <img
                key={l.src + i}
                src={l.src}
                alt={l.alt}
                draggable={false}
                width={width}
                height={height}
                className="absolute left-0 top-0 max-w-none select-none"
                style={{
                  width, height,
                  opacity: l.opacity ?? 1,
                  imageOrientation: "none",
                  imageRendering: pixelated ? "pixelated" : "auto",
                  clipPath: l.wipe !== undefined ? `inset(0 ${(1 - l.wipe) * 100}% 0 0)` : undefined,
                }}
              />
            ))}
            {[...regions.map((g, i) => ({ ...g, n: String(i + 1), draft: false })),
              ...(draft ? [{ ...draftRect(draft), id: "draft", label: "", n: "", draft: true }] : [])].map((g) => (
              <div key={g.id} className="pointer-events-none absolute"
                   style={{ left: g.x, top: g.y, width: g.w, height: g.h,
                            border: `${2 / view.scale}px ${g.draft ? "dashed" : "solid"} #E5AA59`,
                            boxShadow: `0 0 0 ${1 / view.scale}px rgba(0,0,0,.6)` }}>
                {g.n && (
                  <span className="absolute left-0 whitespace-nowrap rounded-sm bg-caution px-1 font-semibold text-page"
                        style={{ top: -16 / view.scale, fontSize: 11 / view.scale, lineHeight: `${14 / view.scale}px` }}>
                    {g.n}{g.label ? ` · ${g.label}` : ""}
                  </span>
                )}
              </div>
            ))}
            {layers.length > 1 && layers[1].wipe !== undefined && (
              <div className="pointer-events-none absolute top-0 h-full w-px bg-caution"
                   style={{ left: (layers[1].wipe ?? 0) * width, width: 2 / view.scale }} />
            )}
          </div>
        )}
      </div>

      <div className="pointer-events-none absolute left-2 top-2 flex flex-col gap-1">
        {caption && <span className="rounded bg-page/85 px-2 py-0.5 text-[11px] text-ink backdrop-blur">{caption}</span>}
      </div>
      <div className="absolute right-2 top-2 flex gap-1 rounded-md bg-page/85 p-1 backdrop-blur">
        <IconBtn label="Zoom in" onClick={() => zoomAt(1.25, size.w / 2, size.h / 2)}><Plus className="h-3.5 w-3.5" /></IconBtn>
        <IconBtn label="Zoom out" onClick={() => zoomAt(0.8, size.w / 2, size.h / 2)}><Minus className="h-3.5 w-3.5" /></IconBtn>
        <IconBtn label="Actual pixels (1:1)" onClick={() => view && zoomAt(1 / view.scale, size.w / 2, size.h / 2)}><Scan className="h-3.5 w-3.5" /></IconBtn>
        <IconBtn label="Fit / reset" onClick={() => onView(fit())}><Maximize className="h-3.5 w-3.5" /></IconBtn>
      </div>
      <div className="pointer-events-none absolute bottom-2 left-2 flex gap-2 rounded bg-page/85 px-2 py-0.5 font-mono text-[11px] text-dim backdrop-blur">
        <span>{view ? `${Math.round(view.scale * 100)}%` : ""}</span>
        <span>{width}×{height}</span>
        <span className="text-ink">{cursor ? `x ${cursor.x}, y ${cursor.y}` : "x —, y —"}</span>
      </div>
    </div>
  );
}

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" title={label} aria-label={label} onClick={onClick}
            className="rounded p-1.5 text-dim hover:bg-raised hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
      {children}
    </button>
  );
}
