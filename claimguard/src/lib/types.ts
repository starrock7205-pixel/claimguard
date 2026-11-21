/**
 * ClaimGuard domain types.
 *
 * Every type here maps 1:1 to a guardrail in the product spec:
 *  - `Verdict` is a closed 5-member taxonomy (no "unknown", no free-text verdicts).
 *  - `Evidence` requires a real URL or is rejected at construction time.
 *  - `ClaimRouting` records every Bifrost routing decision for the audit trail.
 */

export type Verdict =
  | "SUPPORTED"
  | "PARTIALLY_SUPPORTED"
  | "STALE"
  | "CONTRADICTED"
  | "UNVERIFIABLE";

export type ClaimType =
  | "Factual"
  | "Time-sensitive"
  | "Statistical"
  | "Historical"
  | "Scientific"
  | "Legal"
  | "Financial"
  | "Opinion"
  | "Unverifiable";

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

export type RoutingTier = "FAST" | "STANDARD" | "REASONING";

export type RunStatus =
  | "idle"
  | "running"
  | "awaiting_approval"
  | "approved"
  | "partially_approved"
  | "rejected"
  | "failed";

export type RunSource = "demo" | "paste" | "upload" | "batch";

export type SearchDepth = "basic" | "advanced";

export type StepState = "pending" | "active" | "done" | "skipped" | "failed";

/** One evidence document retrieved for a claim. */
export interface Evidence {
  id: string;
  title: string;
  /** Must be a real https:// URL. Never generated. */
  url: string;
  /** ISO date (YYYY-MM-DD) or null when the source does not expose one. */
  publishedAt: string | null;
  /** Verbatim excerpt from the source. Never paraphrased into a "quote". */
  snippet: string;
  domain: string;
  /** 0-100. Authority prior derived from the source domain, not from the LLM. */
  authorityScore: number;
  /** 0-100. Recency weight relative to the verification date. */
  recencyScore: number;
  /** 0-100. Combined ranking score used for evidence ordering. */
  rankScore: number;
  /** True when this document came from the seeded corpus rather than a live call. */
  simulated: boolean;
}

/** A structured value pulled out of either the claim or the evidence. */
export interface ExtractedValue {
  kind: "number" | "date" | "percent" | "currency" | "enum" | "text";
  label: string;
  raw: string;
  normalized: number | string;
  unit?: string;
}

/** The Bifrost routing + accounting record for a single claim. */
export interface ClaimRouting {
  tier: RoutingTier;
  requestedModel: string;
  usedModel: string;
  /** True when the primary model failed and a fallback model produced the answer. */
  fallbackUsed: boolean;
  fallbackFrom?: string;
  fallbackTo?: string;
  fallbackReason?: string;
  latencyMs: number;
  tokensIn: number;
  tokensOut: number;
  /** What an unrouted all-frontier baseline would have cost, in USD. */
  baselineCostUsd: number;
  actualCostUsd: number;
  cacheHit: boolean;
  mode: "live" | "simulated";
}

export interface Claim {
  id: string;
  runId: string;
  /** The verbatim slice of the original LLM output. Never mutated. */
  originalClaim: string;
  index: number;
  claimType: ClaimType;
  /** All types that matched during classification (claimType is the primary). */
  claimTypes: ClaimType[];
  /** True when the claim asserts something that can move over time. */
  timeSensitive: boolean;
  /** 0-100 */
  riskScore: number;
  riskLevel: RiskLevel;
  /** 1 = verify first */
  verificationPriority: number;
  searchDepth: SearchDepth;
  /** Signals found while classifying; shown in the UI as chips. */
  signals: string[];
}

export interface ClaimVerdict {
  claimId: string;
  verdict: Verdict;
  confidenceScore: number;
  reasoningSummary: string;
  evidence: Evidence[];
  /** The single best supporting/contradicting document, for the card header. */
  primaryEvidence: Evidence | null;
  /** Values compared to reach the verdict. */
  claimValue: ExtractedValue | null;
  evidenceValue: ExtractedValue | null;
  /** How far apart the claim and evidence values are, in % (0 when not numeric). */
  driftPercent: number | null;
  /** Age of the newest evidence in days, or null when undated. */
  evidenceAgeDays: number | null;
  /** Suggested replacement sentence. Null when the claim needs no change. */
  suggestedReplacement: string | null;
  /** Human decision state. */
  decision: "pending" | "approved" | "rejected";
  decidedAt: string | null;
  routing: ClaimRouting;
  verifiedAt: string;
}

export interface TimelineMessage {
  id: string;
  text: string;
  tone: "info" | "success" | "warn" | "error" | "route";
  at: number;
}

export interface TimelineStep {
  id: number;
  title: string;
  state: StepState;
  startedAt: number | null;
  endedAt: number | null;
  messages: TimelineMessage[];
}

export interface RunTotals {
  tokensIn: number;
  tokensOut: number;
  tokensSavedVsBaseline: number;
  baselineCostUsd: number;
  actualCostUsd: number;
  costSavedUsd: number;
  cacheHits: number;
  fallbackEvents: number;
  latencyMs: number;
  p95LatencyMs: number;
  verdictCounts: Record<Verdict, number>;
  claims: number;
}

export interface FallbackEvent {
  id: string;
  runId: string;
  claimId: string;
  claimText: string;
  from: string;
  to: string;
  reason: string;
  at: string;
  mode: "live" | "simulated";
}

export interface VerificationRun {
  id: string;
  createdAt: string;
  completedAt: string | null;
  source: RunSource;
  label: string;
  /** The immutable original. Guardrail 4: never overwritten, even after approval. */
  originalText: string;
  /** Approved rewrite. Null until a human clicks Approve & Apply. */
  correctedText: string | null;
  status: RunStatus;
  claims: Claim[];
  verdicts: ClaimVerdict[];
  timeline: TimelineStep[];
  totals: RunTotals;
  /** True when any adapter response in this run was simulated. */
  simulated: boolean;
  error: string | null;
  approvedBy: "human" | null;
}

export interface BifrostSettings {
  apiKey: string;
  baseUrl: string;
  fastModel: string;
  standardModel: string;
  reasoningModel: string;
  fallbackModel: string;
  monthlyBudgetCapUsd: number;
  /** Force a visible fallback event on the first high-risk claim of each run. */
  simulateFallback: boolean;
  requestTimeoutMs: number;
  cacheEnabled: boolean;
}

export interface TavilySettings {
  apiKey: string;
  maxResults: number;
  includeRawContent: boolean;
}

export interface Settings {
  tavily: TavilySettings;
  bifrost: BifrostSettings;
  /** Route HIGH-risk claims to the reasoning tier (turn off to force all-FAST). */
  escalateHighRisk: boolean;
  /** Require explicit approval before any correction is written (guardrail 5). */
  requireHumanApproval: boolean;
  /** Claims at or above this risk score get `advanced` Tavily depth. */
  advancedDepthRiskThreshold: number;
}

export interface BatchJob {
  id: string;
  label: string;
  text: string;
  runId: string | null;
  status: "queued" | "running" | "done" | "failed";
  error: string | null;
}
