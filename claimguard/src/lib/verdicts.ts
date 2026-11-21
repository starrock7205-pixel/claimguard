import type { ClaimType, RiskLevel, RoutingTier, Verdict } from "./types";

/**
 * The strict 5-verdict taxonomy. This object is the single source of truth for
 * labels, colours and ordering used by every screen, chart and export.
 */
export const VERDICTS: Verdict[] = [
  "SUPPORTED",
  "PARTIALLY_SUPPORTED",
  "STALE",
  "CONTRADICTED",
  "UNVERIFIABLE",
];

export interface VerdictMeta {
  verdict: Verdict;
  label: string;
  short: string;
  /** Tailwind text colour for the verdict text. */
  text: string;
  /** Tailwind background tint for badges. */
  bg: string;
  /** Tailwind border colour for cards. */
  border: string;
  /** Solid hex for Recharts (charts cannot consume Tailwind classes). */
  hex: string;
  softHex: string;
  description: string;
  /** Verdicts at or above this severity require human review before publish. */
  requiresReview: boolean;
}

export const VERDICT_META: Record<Verdict, VerdictMeta> = {
  SUPPORTED: {
    verdict: "SUPPORTED",
    label: "Supported",
    short: "SUP",
    text: "text-verdict-supported",
    bg: "bg-verdict-supported-soft",
    border: "border-verdict-supported-line",
    hex: "#15803D",
    softHex: "#DCFCE7",
    description: "Retrieved evidence agrees with the claim within tolerance.",
    requiresReview: false,
  },
  PARTIALLY_SUPPORTED: {
    verdict: "PARTIALLY_SUPPORTED",
    label: "Partially Supported",
    short: "PART",
    text: "text-verdict-partial",
    bg: "bg-verdict-partial-soft",
    border: "border-verdict-partial-line",
    hex: "#B45309",
    softHex: "#FEF3C7",
    description: "Evidence backs part of the claim, or the claim over-generalises a narrower fact.",
    requiresReview: true,
  },
  STALE: {
    verdict: "STALE",
    label: "Stale",
    short: "STALE",
    text: "text-verdict-partial",
    bg: "bg-verdict-partial-soft",
    border: "border-verdict-partial-line",
    hex: "#B45309",
    softHex: "#FEF3C7",
    description: "The claim was once true but newer dated evidence supersedes it.",
    requiresReview: true,
  },
  CONTRADICTED: {
    verdict: "CONTRADICTED",
    label: "Contradicted",
    short: "CONTRA",
    text: "text-verdict-contradicted",
    bg: "bg-verdict-contradicted-soft",
    border: "border-verdict-contradicted-line",
    hex: "#B91C1C",
    softHex: "#FEE2E2",
    description: "Current evidence directly disagrees with the claim beyond tolerance.",
    requiresReview: true,
  },
  UNVERIFIABLE: {
    verdict: "UNVERIFIABLE",
    label: "Unverifiable",
    short: "UNVER",
    text: "text-verdict-unverifiable",
    bg: "bg-verdict-unverifiable-soft",
    border: "border-verdict-unverifiable-line",
    hex: "#475569",
    softHex: "#F1F5F9",
    description: "No reliable evidence was retrieved. No citation is invented.",
    requiresReview: true,
  },
};

export const CLAIM_TYPES: ClaimType[] = [
  "Factual",
  "Time-sensitive",
  "Statistical",
  "Historical",
  "Scientific",
  "Legal",
  "Financial",
  "Opinion",
  "Unverifiable",
];

export const CLAIM_TYPE_ICONS: Record<ClaimType, string> = {
  Factual: "info",
  "Time-sensitive": "clock",
  Statistical: "bar-chart",
  Historical: "landmark",
  Scientific: "flask-conical",
  Legal: "scale",
  Financial: "indian-rupee",
  Opinion: "message-square",
  Unverifiable: "help-circle",
};

export const RISK_META: Record<RiskLevel, { label: string; text: string; bg: string; hex: string }> = {
  LOW: { label: "Low risk", text: "text-verdict-supported", bg: "bg-verdict-supported-soft", hex: "#15803D" },
  MEDIUM: { label: "Medium risk", text: "text-verdict-partial", bg: "bg-verdict-partial-soft", hex: "#B45309" },
  HIGH: { label: "High risk", text: "text-verdict-contradicted", bg: "bg-verdict-contradicted-soft", hex: "#B91C1C" },
};

export const TIER_META: Record<RoutingTier, { label: string; blurb: string; hex: string }> = {
  FAST: { label: "Fast tier", blurb: "Low-cost model for low-risk factual and historical claims", hex: "#00B4D8" },
  STANDARD: { label: "Standard tier", blurb: "Mid-cost model for statistical claims with numeric drift", hex: "#0093B4" },
  REASONING: { label: "Reasoning tier", blurb: "Frontier model for time-sensitive, financial and legal claims", hex: "#0B132B" },
};

/** Bifrost per-million-token pricing used for cost and savings accounting. */
export const MODEL_PRICING: Record<string, { inputPerM: number; outputPerM: number; label: string }> = {
  "gpt-4o-mini": { inputPerM: 0.15, outputPerM: 0.6, label: "gpt-4o-mini" },
  "gpt-4o": { inputPerM: 2.5, outputPerM: 10, label: "gpt-4o" },
  "claude-3-5-sonnet": { inputPerM: 3, outputPerM: 15, label: "claude-3-5-sonnet" },
  "claude-3-5-haiku": { inputPerM: 0.8, outputPerM: 4, label: "claude-3-5-haiku" },
  "llama-3.1-8b-instruct": { inputPerM: 0.06, outputPerM: 0.08, label: "llama-3.1-8b-instruct" },
};

export function modelCostUsd(model: string, tokensIn: number, tokensOut: number) {
  const p = MODEL_PRICING[model] ?? { inputPerM: 2.5, outputPerM: 10 };
  return (tokensIn / 1_000_000) * p.inputPerM + (tokensOut / 1_000_000) * p.outputPerM;
}

/** The unrouted baseline every savings figure is measured against. */
export const BASELINE_MODEL = "gpt-4o";

export function emptyVerdictCounts() {
  return VERDICTS.reduce((acc, v) => {
    acc[v] = 0;
    return acc;
  }, {} as Record<Verdict, number>);
}
