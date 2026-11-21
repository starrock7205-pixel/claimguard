import * as React from "react";
import { cn } from "@/lib/utils";

export function Separator({ className, orientation = "horizontal" }: { className?: string; orientation?: "horizontal" | "vertical" }) {
  return (
    <div
      role="separator"
      aria-orientation={orientation}
      className={cn(orientation === "horizontal" ? "h-px w-full bg-[#E7ECF3]" : "h-full w-px bg-[#E7ECF3]", className)}
    />
  );
}

export function Progress({
  value,
  className,
  indicatorClassName,
}: {
  value: number;
  className?: string;
  indicatorClassName?: string;
}) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn("h-2 w-full overflow-hidden rounded-full bg-slate-200", className)}
    >
      <div
        className={cn("h-full rounded-full bg-accent-500 transition-[width] duration-500 ease-out", indicatorClassName)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton-line", className)} />;
}

export function Stat({
  label,
  value,
  sub,
  tone = "default",
  icon,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: "default" | "good" | "warn" | "bad";
  icon?: React.ReactNode;
}) {
  const toneClass =
    tone === "good" ? "text-verdict-supported" : tone === "warn" ? "text-verdict-partial" : tone === "bad" ? "text-verdict-contradicted" : "text-navy-800";
  return (
    <div className="rounded-lg border border-[#E7ECF3] bg-white px-4 py-3">
      <div className="flex items-center gap-1.5">
        {icon}
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-navy-800/55">{label}</span>
      </div>
      <div className={cn("mt-1 text-2xl font-semibold tabular-nums", toneClass)}>{value}</div>
      {sub ? <div className="mt-0.5 text-xs text-navy-800/55">{sub}</div> : null}
    </div>
  );
}

export function Callout({
  tone = "info",
  title,
  children,
  icon,
  className,
}: {
  tone?: "info" | "warn" | "bad" | "good";
  title?: string;
  children: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}) {
  const tones = {
    info: "border-accent-200 bg-accent-50 text-accent-800",
    warn: "border-amber-300 bg-amber-50 text-amber-900",
    bad: "border-verdict-contradicted-line bg-verdict-contradicted-soft text-verdict-contradicted",
    good: "border-verdict-supported-line bg-verdict-supported-soft text-verdict-supported",
  } as const;
  return (
    <div className={cn("flex gap-3 rounded-lg border px-4 py-3 text-sm", tones[tone], className)}>
      {icon ? <span className="mt-0.5 shrink-0">{icon}</span> : null}
      <div className="min-w-0">
        {title ? <div className="font-semibold">{title}</div> : null}
        <div className="mt-0.5 leading-relaxed">{children}</div>
      </div>
    </div>
  );
}
