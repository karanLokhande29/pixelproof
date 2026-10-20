import { useRef, useState, type DragEvent } from "react";
import { ImageUp } from "lucide-react";
import { fmtBytes } from "../lib/format";

const MAX = 25 * 1024 * 1024;
const OK_TYPES = ["image/jpeg", "image/png"];

/**
 * File picker with drag and drop. Client-side checks only give early
 * feedback; the API validates signature, decoding and pixel count itself.
 */
export function UploadZone({ file, onFile, label = "Drop a JPEG or PNG here, or click to choose", compact = false }: {
  file: File | null;
  onFile: (f: File | null, problem: string | null) => void;
  label?: string;
  compact?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const take = (f: File | undefined) => {
    if (!f) return;
    const ext = f.name.toLowerCase().split(".").pop();
    if (!OK_TYPES.includes(f.type) && !["jpg", "jpeg", "png"].includes(ext ?? "")) return onFile(null, "Only JPEG and PNG files are accepted.");
    if (f.size > MAX) return onFile(null, `File is ${fmtBytes(f.size)}; the limit is 25 MB.`);
    onFile(f, null);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    take(e.dataTransfer.files?.[0]);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => input.current?.click()}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), input.current?.click())}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed text-center transition-colors ${
        compact ? "px-3 py-4" : "px-4 py-8"
      } ${over ? "border-accent bg-accent/5" : "border-line2 hover:border-accent/60 hover:bg-raised/40"}`}
      aria-label={label}
    >
      <ImageUp className={`${compact ? "h-5 w-5" : "h-7 w-7"} text-accent`} aria-hidden />
      {file ? (
        <p className="text-sm text-ink">
          <span className="font-medium">{file.name}</span> <span className="text-dim">· {fmtBytes(file.size)}</span>
        </p>
      ) : (
        <p className="text-sm text-dim">{label}</p>
      )}
      {!compact && <p className="text-[11px] text-faint">JPEG / PNG · ≤ 25 MB · ≤ 40 megapixels · stored byte-for-byte, never re-encoded</p>}
      <input
        ref={input}
        type="file"
        accept=".jpg,.jpeg,.png,image/jpeg,image/png"
        className="hidden"
        onChange={(e) => { take(e.target.files?.[0]); e.target.value = ""; }}
      />
    </div>
  );
}
