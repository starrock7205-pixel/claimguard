import { AlertTriangle, CheckCircle2, Clock3, HelpCircle, XCircle } from "lucide-react";
import { Badge } from "./ui/badge";
import type { RiskLevel, Verdict } from "@/lib/types";
import { RISK_META, VERDICT_META } from "@/lib/verdicts";
import { cn } from "@/lib/utils";

const ICONS: Record<Verdict, React.ComponentType<React.SVGProps<SVGSVGElement>>> = {
  SUPPORTED: CheckCircle2,
  PARTIALLY_SUPPORTED: AlertTriangle,
  STALE: Clock3,
  CONTRADICTED: XCircle,
  UNVERIFIABLE: HelpCircle,
};

const BADGE_VARIANT: Record<Verdict, "supported" | "partial" | "contradicted" | "unverifiable"> = {
  SUPPORTED: "supported",
  PARTIALLY_SUPPORTED: "partial",
  STALE: "partial",
  CONTRADICTED: "contradicted",
  UNVERIFIABLE: "unverifiable",
};

export function VerdictBadge({ verdict, className }: { verdict: Verdict; className?: string }) {
  const meta = VERDICT_META[verdict];
  const Icon = ICONS[verdict];
  return (
    <Badge variant={BADGE_VARIANT[verdict]} className={cn("gap-1.5", className)}>
      <Icon className="h-3.5 w-3.5" />
      {meta.label}
    </Badge>
  );
}

export function VerdictDot({ verdict, className }: { verdict: Verdict; className?: string }) {
  return (
    <span
      className={cn("inline-block h-2.5 w-2.5 shrink-0 rounded-full", className)}
      style={{ backgroundColor: VERDICT_META[verdict].hex }}
      title={VERDICT_META[verdict].label}
    />
  );
}

export function RiskBadge({ level, score, className }: { level: RiskLevel; score: number; className?: string }) {
  const meta = RISK_META[level];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
        meta.bg,
        meta.text,
        className,
      )}
      title={`Risk score ${score}/100`}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: meta.hex }} />
      {meta.label} · {score}
    </span>
  );
}

/**
 * Guardrail 6: every simulated response is visibly badged. This is never
 * conditional on a user preference.
 */
export function SimulatedBadge({ className, label = "SIMULATED" }: { className?: string; label?: string }) {
  return (
    <Badge variant="simulated" className={cn("font-mono tracking-tight", className)} title="No API key configured — this response came from the mock flow.">
      [{label}]
    </Badge>
  );
}

export function VerdictLegend({ className }: { className?: string }) {
  const order: Verdict[] = ["SUPPORTED", "PARTIALLY_SUPPORTED", "STALE", "CONTRADICTED", "UNVERIFIABLE"];
  return (
    <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-2", className)}>
      {order.map((v) => {
        const Icon = ICONS[v];
        return (
          <span key={v} className="inline-flex items-center gap-1.5 text-xs text-navy-800/70">
            <Icon className="h-3.5 w-3.5" style={{ color: VERDICT_META[v].hex }} />
            <span className="font-medium">{VERDICT_META[v].label}</span>
          </span>
        );
      })}
    </div>
  );
}
