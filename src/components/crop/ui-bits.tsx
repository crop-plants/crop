"use client";

// Shared UI atoms: provenance badges, status dots, KPI cards, sparkline,
// section card, tooltips, logo, vine wreath loading screen.

import { ReactNode, useState } from "react";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Provenance } from "@/lib/crop/types";

export function ProvenanceBadge({ kind, className }: { kind: Provenance | "measured (interpolated)" | string; className?: string }) {
  const k = kind.toLowerCase();
  const style =
    k === "measured"
      ? "bg-ok/15 text-ok border-ok/40"
      : k.startsWith("measured")
        ? "bg-ok/15 text-ok border-ok/40"
        : k === "estimated"
          ? "bg-watch/15 text-watch border-watch/40"
          : k === "simulated"
            ? "bg-info/15 text-info border-info/40"
            : "bg-border/40 text-muted-foreground border-border";
  const label = k.toUpperCase();
  return (
    <span className={cn("inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] font-semibold tracking-wider", style, className)} title={`Provenance: ${kind}`}>
      {label}
    </span>
  );
}

export function StatusDot({ level, className }: { level: "ok" | "watch" | "alert" | "offline" | "info"; className?: string }) {
  const color = level === "ok" ? "bg-ok" : level === "watch" ? "bg-watch" : level === "alert" ? "bg-alert" : level === "info" ? "bg-info" : "bg-muted-foreground";
  const label = level === "ok" ? "OK" : level === "watch" ? "Watch" : level === "alert" ? "Alert" : level === "info" ? "Info" : "Offline";
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span className={cn("inline-block h-2 w-2 rounded-full", color)} />
      <span className="text-xs">{label}</span>
    </span>
  );
}

export function TooltipMetric({ tip, children }: { tip: string; children: ReactNode }) {
  return (
    <span className="group relative inline-flex items-center gap-1" tabIndex={0}>
      {children}
      <Info className="h-3 w-3 text-muted-foreground" aria-hidden />
      <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 hidden w-56 -translate-x-1/2 rounded-lg border border-border bg-raised p-2 text-[11px] leading-snug text-foreground shadow-lg group-focus:block group-hover:block">
        {tip}
      </span>
    </span>
  );
}

export function Sparkline({ data, color = "#8EC9E8", height = 28 }: { data: number[]; color?: string; height?: number }) {
  if (!data.length) return <div style={{ height }} className="shimmer rounded" />;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * 100},${100 - ((v - min) / span) * 100}`).join(" ");
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ height }} className="w-full" aria-hidden>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={2.4} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function KpiCard({
  label,
  value,
  unit,
  provenance,
  tip,
  spark,
  sparkColor,
  extra,
}: {
  label: string;
  value: string | null;
  unit?: string;
  provenance: string;
  tip: string;
  spark?: number[];
  sparkColor?: string;
  extra?: ReactNode;
}) {
  return (
    <div className="card-raised flex flex-col gap-1.5 p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
        <ProvenanceBadge kind={provenance} />
      </div>
      <TooltipMetric tip={tip}>
        <span className="num text-2xl font-semibold leading-none">{value ?? "—"}</span>
        {value != null && unit ? <span className="text-sm text-muted-foreground"> {unit}</span> : null}
      </TooltipMetric>
      {spark ? <Sparkline data={spark} color={sparkColor} /> : null}
      {extra}
    </div>
  );
}

export function SectionCard({ title, subtitle, right, children, className }: { title: string; subtitle?: string; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("card min-w-0 p-5", className)}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-serif text-lg font-semibold leading-tight">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p> : null}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("shimmer rounded-lg", className)} />;
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center justify-center gap-2 p-10 text-center">
      <p className="font-serif text-base font-semibold">{title}</p>
      <p className="max-w-md text-xs text-muted-foreground">{body}</p>
      {action}
    </div>
  );
}

export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div className="card flex flex-col items-center gap-3 border-alert/40 p-8 text-center">
      <p className="font-serif text-base font-semibold text-alert">Something went wrong</p>
      <p className="max-w-md text-xs text-muted-foreground">{message}</p>
      {retry ? (
        <button onClick={retry} className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-raised">
          Retry
        </button>
      ) : null}
    </div>
  );
}

/** Black circle wordmark with an engraved serif face + vine sprig (spec 2). */
export function CropMark({ size = 30 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2 select-none">
      <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden>
        <circle cx="20" cy="20" r="19" fill="#0d130f" stroke="rgba(188,204,152,0.35)" />
        <text x="20" y="25" textAnchor="middle" fontFamily="Georgia, serif" fontSize="10.5" fill="#E9FDBD" letterSpacing="1">
          CROP
        </text>
      </svg>
      <svg width={size * 0.9} height={size} viewBox="0 0 24 28" aria-hidden className="opacity-90">
        <path d="M4 26 C 8 20, 6 14, 12 12 C 18 10, 16 4, 22 2" fill="none" stroke="#BCCC98" strokeWidth="1.4" strokeLinecap="round" />
        <path d="M12 12 C 10 9, 12 6, 15 5 M9 17 C 5.5 16.5, 4 13.5, 4.5 11" fill="none" stroke="#6C9A52" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    </span>
  );
}

export function VineWreath({ size = 120 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden>
      <circle cx="50" cy="50" r="38" fill="none" stroke="#6C9A52" strokeWidth="1.6" className="wreath-path" strokeDasharray="420" strokeLinecap="round" />
      <circle cx="50" cy="50" r="30" fill="none" stroke="#BCCC98" strokeWidth="1" opacity="0.5" />
      {[0, 60, 120, 180, 240, 300].map((a) => (
        <path
          key={a}
          d="M50 12 q 6 4 2 10 q -6 -2 -2 -10"
          fill="#6C9A52"
          transform={`rotate(${a} 50 50)`}
          opacity={0.85}
        />
      ))}
      <text x="50" y="55" textAnchor="middle" fontFamily="Georgia, serif" fontSize="13" fill="#E9FDBD" letterSpacing="2">
        CROP
      </text>
    </svg>
  );
}

export function CopyButton({ text, small }: { text: string; small?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className={cn("rounded-md border border-border px-2 py-1 text-xs hover:bg-raised", small && "px-1.5 text-[10px]")}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          setCopied(false);
        }
      }}
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

export const fmt = (v: number | null | undefined, digits = 1): string =>
  v == null || !Number.isFinite(v) ? "—" : v.toFixed(digits);

export const fmtTs = (iso: string | null | undefined): string => {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
};
