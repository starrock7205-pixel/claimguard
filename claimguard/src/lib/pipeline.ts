import { bifrostComplete, type BifrostCallResult, type BifrostMessage } from "./adapters/bifrost";
import { PAYLOAD_END, PAYLOAD_START, parseVerdictJson, type VerdictJson, type VerdictPayload } from "./adapters/mock-engine";
import { buildSearchQuery, rankAndSort, retrieveEvidence, type TavilySearchResult } from "./adapters/tavily";
import { extractClaims, verificationOrder, type ExtractedClaimDraft } from "./engine/extract";
import { evaluateClaim } from "./engine/evaluate";
import { CORPUS, EVIDENCE_SNAPSHOT_DATE } from "./seed";
import type {
  Claim,
  ClaimVerdict,
  FallbackEvent,
  Evidence,
  RunSource,
  RunStatus,
  Settings,
  StepState,
  TimelineMessage,
  TimelineStep,
  VerificationRun,
  Verdict,
} from "./types";
import { clamp, pctile, relativeDays, round, sleep, uid } from "./utils";
import { BASELINE_MODEL, VERDICTS, emptyVerdictCounts, modelCostUsd } from "./verdicts";

export const PIPELINE_STEPS: Array<{ id: number; title: string }> = [
  { id: 1, title: "Parsing LLM output" },
  { id: 2, title: "Extracting claims" },
  { id: 3, title: "Classifying claims" },
  { id: 4, title: "Calculating risk & verification priority" },
  { id: 5, title: "Routing through Bifrost" },
  { id: 6, title: "Retrieving Tavily live evidence" },
  { id: 7, title: "Ranking evidence by recency & relevance" },
  { id: 8, title: "Detecting staleness & contradictions" },
  { id: 9, title: "Generating source-linked corrected answer" },
  { id: 10, title: "Waiting for human approval" },
];

export function emptyTimeline(): TimelineStep[] {
  return PIPELINE_STEPS.map((s) => ({
    id: s.id,
    title: s.title,
    state: "pending",
    startedAt: null,
    endedAt: null,
    messages: [],
  }));
}

export type PipelineEvent =
  | { kind: "step"; stepId: number; state?: StepState; message?: Omit<TimelineMessage, "id" | "at"> }
  | { kind: "claims"; claims: Claim[] }
  | { kind: "verdict"; verdict: ClaimVerdict }
  | { kind: "fallback"; event: FallbackEvent }
  | { kind: "totals"; totals: VerificationRun["totals"] }
  | { kind: "status"; status: RunStatus; simulated?: boolean; error?: string | null };

export interface PipelineInput {
  text: string;
  source: RunSource;
  label: string;
  runId: string;
  settings: Settings;
  /** Optional speed multiplier so judges can slow the demo down. */
  speed?: number;
}

export interface PipelineHandles {
  emit: (event: PipelineEvent) => void;
  /** Set `aborted = true` to stop the run between claims. */
  signal?: { aborted: boolean };
}

const SYSTEM_PROMPT = `You are ClaimGuard's verification judge. You receive one atomic claim from an AI answer plus the evidence retrieved for it.

Decide exactly one verdict from this closed set: SUPPORTED, PARTIALLY_SUPPORTED, STALE, CONTRADICTED, UNVERIFIABLE.

Hard rules:
- Never invent a URL, date, statistic or certification.
- If the evidence does not settle the claim, return UNVERIFIABLE.
- STALE means the claim was once true but newer dated evidence supersedes it.
- CONTRADICTED means current evidence directly disagrees.
- suggestedReplacement must only reuse values present in the evidence, and must be null when no correction is needed.

Reply with a single JSON object and nothing else:
{"verdict":"...","confidenceScore":0,"reasoningSummary":"...","claimValue":null,"evidenceValue":null,"driftPercent":null,"suggestedReplacement":null,"rulesFired":["..."]}`;

function riskTierFor(draft: ExtractedClaimDraft, settings: Settings) {
  if (draft.riskLevel === "HIGH") {
    if (!settings.escalateHighRisk) return "FAST" as const;
    const escalate = draft.timeSensitive || draft.claimTypes.includes("Financial") || draft.claimTypes.includes("Legal");
    return escalate ? ("REASONING" as const) : ("STANDARD" as const);
  }
  return "FAST" as const;
}

function routingMessage(draft: ExtractedClaimDraft, settings: Settings) {
  const tier = riskTierFor(draft, settings);
  if (tier === "REASONING") {
    const why = draft.timeSensitive
      ? "Claim is time-sensitive"
      : draft.claimTypes.includes("Legal")
        ? "Claim carries legal weight"
        : "Claim is financial";
    return `${why} (risk ${draft.riskScore}). Routing to stronger reasoning model ${settings.bifrost.reasoningModel}.`;
  }
  if (tier === "STANDARD") {
    return `High risk but stable (risk ${draft.riskScore}). Routing to standard model ${settings.bifrost.standardModel}.`;
  }
  return `${draft.claimType} claim, low cost path (risk ${draft.riskScore}). Routing to fast model ${settings.bifrost.fastModel}.`;
}

function shouldForceFallback(draft: ExtractedClaimDraft, isFirstHighRisk: boolean, settings: Settings) {
  if (!settings.bifrost.simulateFallback) return false;
  const forcedSeed = draft.seeded && draft.seedIndex === 1; // ONDC seller-fee claim in the demo
  return forcedSeed || (!draft.seeded && isFirstHighRisk);
}

/** Deterministic simulated latency so the timeline animates like a real agent. */
function stepDelay(base: number, speed: number) {
  return Math.max(40, Math.round((base + Math.random() * base * 0.5) / speed));
}

export async function runPipeline(input: PipelineInput, handles: PipelineHandles): Promise<void> {
  const { text, source, label, runId, settings } = input;
  const speed = input.speed ?? 1;
  const emit = handles.emit;
  const aborted = () => handles.signal?.aborted === true;

  emit({ kind: "status", status: "running", error: null });
  const startedAt = Date.now();

  // ------------------------------------------------------- Step 1: parsing
  emit({ kind: "step", stepId: 1, state: "active" });
  const segments = text.split(/\n+/).map((s) => s.trim()).filter(Boolean);
  emit({
    kind: "step",
    stepId: 1,
    message: { text: `Parsed ${text.trim().split(/\s+/).length} tokens across ${segments.length} block(s).`, tone: "info" },
  });
  await sleep(stepDelay(220, speed));
  emit({ kind: "step", stepId: 1, state: "done" });

  if (aborted()) return;

  // -------------------------------------------- Step 2: extracting claims
  emit({ kind: "step", stepId: 2, state: "active" });
  await sleep(stepDelay(260, speed));
  const drafts = extractClaims(text, settings.advancedDepthRiskThreshold);
  emit({
    kind: "step",
    stepId: 2,
    message: {
      text: drafts.length > 0
        ? `Isolated ${drafts.length} atomic claim(s) from the answer.`
        : "No verifiable claims found in the input.",
      tone: drafts.length > 0 ? "info" : "warn",
    },
  });
  emit({ kind: "step", stepId: 2, state: "done" });

  if (drafts.length === 0) {
    for (const id of [3, 4, 5, 6, 7, 8, 9, 10]) emit({ kind: "step", stepId: id, state: "skipped" });
    emit({ kind: "status", status: "awaiting_approval", simulated: false });
    emit({ kind: "totals", totals: emptyTotals() });
    return;
  }

  if (aborted()) return;

  // ------------------------------------------ Step 3: classifying claims
  emit({ kind: "step", stepId: 3, state: "active" });
  await sleep(stepDelay(280, speed));
  const typeSummary = drafts
    .map((d) => `${d.claimType}`)
    .reduce<Record<string, number>>((acc, t) => {
      acc[t] = (acc[t] ?? 0) + 1;
      return acc;
    }, {});
  emit({
    kind: "step",
    stepId: 3,
    message: {
      text: `Classification: ${Object.entries(typeSummary).map(([k, v]) => `${k} ×${v}`).join(", ")}.`,
      tone: "info",
    },
  });
  emit({ kind: "step", stepId: 3, state: "done" });

  // ------------------------------ Step 4: risk & verification priority
  emit({ kind: "step", stepId: 4, state: "active" });
  await sleep(stepDelay(240, speed));
  const order = verificationOrder(drafts);
  const priorities = new Map<number, number>();
  order.forEach((draftIndex, position) => priorities.set(draftIndex, position + 1));

  const claims: Claim[] = drafts.map((d, i) => ({
    id: `${runId}_c${i}`,
    runId,
    originalClaim: d.text,
    index: i,
    claimType: d.claimType,
    claimTypes: d.claimTypes,
    timeSensitive: d.timeSensitive,
    riskScore: d.riskScore,
    riskLevel: d.riskLevel,
    verificationPriority: priorities.get(i) ?? i + 1,
    searchDepth: d.searchDepth,
    signals: d.signals,
  }));
  emit({ kind: "claims", claims });
  emit({
    kind: "step",
    stepId: 4,
    message: {
      text: `Risk scored 0-100. Highest priority: "${claims.find((c) => c.verificationPriority === 1)?.originalClaim.slice(0, 58)}…" (risk ${Math.max(...claims.map((c) => c.riskScore))}).`,
      tone: "info",
    },
  });
  emit({ kind: "step", stepId: 4, state: "done" });

  // ------------------------------------ Step 5: routing through Bifrost
  emit({ kind: "step", stepId: 5, state: "active" });
  const firstHighRisk = order.find((i) => drafts[i].riskLevel === "HIGH");
  for (const draftIndex of order) {
    const draft = drafts[draftIndex];
    const tier = riskTierFor(draft, settings);
    emit({ kind: "step", stepId: 5, message: { text: routingMessage(draft, settings), tone: "route" } });
    if (shouldForceFallback(draft, draftIndex === firstHighRisk, settings)) {
      emit({
        kind: "step",
        stepId: 5,
        message: {
          text: `Pre-flight probe: ${settings.bifrost.reasoningModel} reports 503 in the gateway pool. Bifrost fallback will activate on this claim.`,
          tone: "warn",
        },
      });
    }
    await sleep(stepDelay(160, speed));
    void tier;
  }
  emit({
    kind: "step",
    stepId: 5,
    message: {
      text: `Routing policy: LOW/MEDIUM → ${settings.bifrost.fastModel}; HIGH + time-sensitive/financial/legal → ${settings.bifrost.reasoningModel}. Fallback: ${settings.bifrost.fallbackModel}.`,
      tone: "info",
    },
  });
  emit({ kind: "step", stepId: 5, state: "done" });

  // -------------------------------- Step 6: retrieving Tavily evidence
  emit({ kind: "step", stepId: 6, state: "active" });
  const evidenceByClaim = new Map<string, Evidence[]>();
  const searchByClaim = new Map<string, TavilySearchResult>();
  let anySimulated = false;

  for (const draftIndex of order) {
    if (aborted()) return;
    const claim = claims[draftIndex];
    const draft = drafts[draftIndex];
    const query = buildSearchQuery(claim.originalClaim, claim.claimType, claim.timeSensitive);
    const { result, evidence } = await retrieveEvidence({
      query,
      depth: claim.searchDepth,
      maxResults: settings.tavily.maxResults,
      settings: settings.tavily,
    });
    evidenceByClaim.set(claim.id, evidence);
    searchByClaim.set(claim.id, result);
    if (result.mode === "simulated") anySimulated = true;

    emit({
      kind: "step",
      stepId: 6,
      message: {
        text: result.mode === "simulated"
          ? `[SIMULATED] No Tavily key — searched the ${CORPUS.length}-document seeded corpus (snapshot ${EVIDENCE_SNAPSHOT_DATE}) for claim #${claim.verificationPriority}. ${evidence.length} source(s) matched.`
          : `Tavily ${claim.searchDepth} search returned ${evidence.length} source(s) for claim #${claim.verificationPriority} in ${result.latencyMs}ms.`,
        tone: result.mode === "simulated" ? "warn" : "success",
      },
    });
    void draft;
  }
  emit({ kind: "step", stepId: 6, state: "done" });

  // --------------------------- Step 7: ranking evidence by recency
  emit({ kind: "step", stepId: 7, state: "active" });
  await sleep(stepDelay(200, speed));
  for (const draftIndex of order) {
    const claim = claims[draftIndex];
    const ranked = rankAndSort(evidenceByClaim.get(claim.id) ?? []);
    evidenceByClaim.set(claim.id, ranked);
    const top = ranked[0];
    emit({
      kind: "step",
      stepId: 7,
      message: {
        text: top
          ? `Claim #${claim.verificationPriority}: ranked ${ranked.length} source(s); top rank score ${top.rankScore} (${top.domain}, authority ${top.authorityScore}, recency ${top.recencyScore}).`
          : `Claim #${claim.verificationPriority}: no sources to rank.`,
        tone: top ? "info" : "warn",
      },
    });
  }
  emit({ kind: "step", stepId: 7, state: "done" });

  // --------------------- Step 8: staleness & contradiction detection
  emit({ kind: "step", stepId: 8, state: "active" });
  const verdicts: ClaimVerdict[] = [];
  const fallbackEvents: FallbackEvent[] = [];
  const latencies: number[] = [];
  let tokensIn = 0;
  let tokensOut = 0;
  let baselineCost = 0;
  let actualCost = 0;
  let cacheHits = 0;
  let offFrontierTokens = 0;

  for (const draftIndex of order) {
    if (aborted()) return;
    const claim = claims[draftIndex];
    const draft = drafts[draftIndex];
    const evidence = evidenceByClaim.get(claim.id) ?? [];
    const tier = riskTierFor(draft, settings);

    const payload: VerdictPayload = {
      claim: claim.originalClaim,
      claimType: claim.claimType,
      timeSensitive: claim.timeSensitive,
      evidence,
      searchDepth: claim.searchDepth,
    };

    const messages: BifrostMessage[] = [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `CLAIM: ${claim.originalClaim}
CLAIM TYPE: ${claim.claimType}${claim.timeSensitive ? " (time-sensitive)" : ""}
SEARCH DEPTH: ${claim.searchDepth}
EVIDENCE:
${evidence.map((e, i) => `[${i + 1}] ${e.title} | ${e.url} | published ${e.publishedAt ?? "Unknown"} | rank ${e.rankScore}\n${e.snippet}`).join("\n\n") || "(no evidence retrieved)"}

${PAYLOAD_START}
${JSON.stringify(payload)}
${PAYLOAD_END}`,
      },
    ];

    const forcePrimaryFailure = shouldForceFallback(draft, draftIndex === firstHighRisk, settings);
    let call: BifrostCallResult;
    try {
      call = await bifrostComplete({
        messages,
        tier,
        settings: settings.bifrost,
        seedKey: claim.originalClaim,
        forcePrimaryFailure,
      });
    } catch (err) {
      call = {
        content: "",
        tier,
        requestedModel: settings.bifrost.fastModel,
        usedModel: settings.bifrost.fastModel,
        mode: "simulated",
        fallbackUsed: false,
        latencyMs: 0,
        tokensIn: 0,
        tokensOut: 0,
        actualCostUsd: 0,
        baselineCostUsd: 0,
        cacheHit: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }

    latencies.push(call.latencyMs);
    tokensIn += call.tokensIn;
    tokensOut += call.tokensOut;
    baselineCost += call.baselineCostUsd;
    actualCost += call.actualCostUsd;
    if (call.cacheHit) cacheHits += 1;
    if (call.usedModel !== BASELINE_MODEL) offFrontierTokens += call.tokensIn + call.tokensOut;

    if (call.fallbackUsed) {
      const event: FallbackEvent = {
        id: uid("fb"),
        runId,
        claimId: claim.id,
        claimText: claim.originalClaim,
        from: call.fallbackFrom ?? call.requestedModel,
        to: call.fallbackTo ?? call.usedModel,
        reason: call.fallbackReason ?? "Primary model error",
        at: new Date().toISOString(),
        mode: call.mode,
      };
      fallbackEvents.push(event);
      emit({ kind: "fallback", event });
      emit({
        kind: "step",
        stepId: 8,
        message: { text: `Primary model unavailable. Bifrost fallback activated: ${event.from} → ${event.to}.`, tone: "warn" },
      });
      emit({
        kind: "step",
        stepId: 5,
        message: { text: `Fallback executed on claim #${claim.verificationPriority}: ${event.from} → ${event.to} (${call.latencyMs}ms total).`, tone: "warn" },
      });
    }

    // Budget cap is a hard stop, not a warning.
    if (call.error) {
      emit({ kind: "step", stepId: 8, message: { text: `Claim #${claim.verificationPriority}: ${call.error}`, tone: "error" } });
      verdicts.push(unverifiableVerdict(claim, evidence, call, `Routing model unavailable: ${call.error}`));
      emit({ kind: "verdict", verdict: verdicts[verdicts.length - 1] });
      continue;
    }

    const analysis: VerdictJson | null = call.mode === "live" ? parseVerdictJson(call.content) : parseVerdictJson(call.content);
    const finalAnalysis =
      analysis ??
      evaluateToJson(claim, draft, evidence);

    if (!analysis) {
      emit({
        kind: "step",
        stepId: 8,
        message: {
          text: `Claim #${claim.verificationPriority}: model response was not valid verdict JSON. Re-evaluated with the deterministic engine.`,
          tone: "warn",
        },
      });
    }

    const verdict: ClaimVerdict = {
      claimId: claim.id,
      verdict: finalAnalysis.verdict,
      confidenceScore: clamp(Math.round(finalAnalysis.confidenceScore), 0, 100),
      reasoningSummary: finalAnalysis.reasoningSummary,
      evidence,
      primaryEvidence: evidence[0] ?? null,
      claimValue: finalAnalysis.claimValue,
      evidenceValue: finalAnalysis.evidenceValue,
      driftPercent: finalAnalysis.driftPercent,
      evidenceAgeDays: newestEvidenceAgeDays(evidence),
      suggestedReplacement: finalAnalysis.suggestedReplacement,
      decision: "pending",
      decidedAt: null,
      routing: {
        tier,
        requestedModel: call.requestedModel,
        usedModel: call.usedModel,
        fallbackUsed: call.fallbackUsed,
        fallbackFrom: call.fallbackFrom,
        fallbackTo: call.fallbackTo,
        fallbackReason: call.fallbackReason,
        latencyMs: call.latencyMs,
        tokensIn: call.tokensIn,
        tokensOut: call.tokensOut,
        baselineCostUsd: round(call.baselineCostUsd, 6),
        actualCostUsd: round(call.actualCostUsd, 6),
        cacheHit: call.cacheHit,
        mode: call.mode,
      },
      verifiedAt: new Date().toISOString(),
    };
    verdicts.push(verdict);
    emit({ kind: "verdict", verdict });

    emit({
      kind: "step",
      stepId: 8,
      message: {
        text: stalenessMessage(claim.verificationPriority, verdict),
        tone: verdictTone(verdict.verdict),
      },
    });
  }
  emit({ kind: "step", stepId: 8, state: "done" });

  // ------------------- Step 9: source-linked corrected answer
  emit({ kind: "step", stepId: 9, state: "active" });
  await sleep(stepDelay(300, speed));
  const corrections = verdicts.filter((v) => v.suggestedReplacement && v.verdict !== "SUPPORTED");
  emit({
    kind: "step",
    stepId: 9,
    message: {
      text: corrections.length > 0
        ? `Drafted ${corrections.length} source-linked correction(s) as a staged diff. The original answer is untouched.`
        : "No corrections required — every claim is supported or already correct.",
      tone: corrections.length > 0 ? "success" : "success",
    },
  });
  emit({ kind: "step", stepId: 9, state: "done" });

  // ------------------- Step 10: human approval gate
  emit({ kind: "step", stepId: 10, state: "active" });
  emit({
    kind: "step",
    stepId: 10,
    message: { text: "Correction ready for human approval. Nothing is applied until you click Approve & Apply.", tone: "info" },
  });
  // The agent's work is finished here; the wait itself is the app's steady
  // state, handled by the approval gate below the timeline.
  emit({ kind: "step", stepId: 10, state: "done" });

  const totals: VerificationRun["totals"] = {
    tokensIn,
    tokensOut,
    tokensSavedVsBaseline: offFrontierTokens,
    baselineCostUsd: round(baselineCost, 6),
    actualCostUsd: round(actualCost, 6),
    costSavedUsd: round(Math.max(0, baselineCost - actualCost), 6),
    cacheHits,
    fallbackEvents: fallbackEvents.length,
    latencyMs: latencies.reduce((a, b) => a + b, 0),
    p95LatencyMs: pctile(latencies, 95),
    verdictCounts: countVerdicts(verdicts),
    claims: claims.length,
  };
  emit({ kind: "totals", totals });
  emit({
    kind: "status",
    status: corrections.length > 0 ? "awaiting_approval" : "awaiting_approval",
    simulated: anySimulated,
  });
  void startedAt;
  void label;
  void source;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function evaluateToJson(claim: Claim, draft: ExtractedClaimDraft, evidence: Evidence[]): VerdictJson {
  const analysis = evaluateClaim({
    claim: claim.originalClaim,
    claimType: claim.claimType,
    timeSensitive: claim.timeSensitive,
    evidence,
  });
  void draft;
  return {
    verdict: analysis.verdict,
    confidenceScore: analysis.confidenceScore,
    reasoningSummary: analysis.reasoningSummary,
    claimValue: analysis.claimValue,
    evidenceValue: analysis.evidenceValue,
    driftPercent: analysis.driftPercent,
    suggestedReplacement: analysis.suggestedReplacement,
    rulesFired: analysis.rulesFired,
  };
}

function unverifiableVerdict(
  claim: Claim,
  evidence: Evidence[],
  call: BifrostCallResult,
  reason: string,
): ClaimVerdict {
  return {
    claimId: claim.id,
    verdict: "UNVERIFIABLE",
    confidenceScore: 10,
    reasoningSummary: `${reason}. No verdict is asserted and no citation is invented.`,
    evidence,
    primaryEvidence: evidence[0] ?? null,
    claimValue: null,
    evidenceValue: null,
    driftPercent: null,
    evidenceAgeDays: newestEvidenceAgeDays(evidence),
    suggestedReplacement: null,
    decision: "pending",
    decidedAt: null,
    routing: {
      tier: call.tier,
      requestedModel: call.requestedModel,
      usedModel: call.usedModel,
      fallbackUsed: call.fallbackUsed,
      latencyMs: call.latencyMs,
      tokensIn: call.tokensIn,
      tokensOut: call.tokensOut,
      baselineCostUsd: 0,
      actualCostUsd: 0,
      cacheHit: false,
      mode: call.mode,
    },
    verifiedAt: new Date().toISOString(),
  };
}

/** Age, in days, of the newest dated piece of evidence. Null when nothing is dated. */
function newestEvidenceAgeDays(evidence: Evidence[]): number | null {
  const ages = evidence.map((e) => relativeDays(e.publishedAt)).filter((a): a is number => a !== null);
  if (ages.length === 0) return null;
  return Math.min(...ages);
}

function stalenessMessage(priority: number, verdict: ClaimVerdict) {
  switch (verdict.verdict) {
    case "CONTRADICTED":
      return `Claim #${priority}: newer source contradicts the original claim (drift ${verdict.driftPercent ?? "n/a"}%).`;
    case "STALE":
      return `Claim #${priority}: evidence is newer than the claim and supersedes it (drift ${verdict.driftPercent ?? "n/a"}%).`;
    case "PARTIALLY_SUPPORTED":
      return `Claim #${priority}: evidence supports the claim only in part.`;
    case "SUPPORTED":
      return `Claim #${priority}: evidence agrees with the claim (confidence ${verdict.confidenceScore}).`;
    default:
      return `Claim #${priority}: no reliable evidence found. Marking claim as Unverifiable.`;
  }
}

function verdictTone(verdict: Verdict): TimelineMessage["tone"] {
  if (verdict === "SUPPORTED") return "success";
  if (verdict === "CONTRADICTED") return "error";
  if (verdict === "UNVERIFIABLE") return "warn";
  return "warn";
}

function countVerdicts(verdicts: ClaimVerdict[]) {
  const counts = emptyVerdictCounts();
  for (const v of verdicts) {
    if (VERDICTS.includes(v.verdict)) counts[v.verdict] += 1;
  }
  return counts;
}

export function emptyTotals(): VerificationRun["totals"] {
  return {
    tokensIn: 0,
    tokensOut: 0,
    tokensSavedVsBaseline: 0,
    baselineCostUsd: 0,
    actualCostUsd: 0,
    costSavedUsd: 0,
    cacheHits: 0,
    fallbackEvents: 0,
    latencyMs: 0,
    p95LatencyMs: 0,
    verdictCounts: emptyVerdictCounts(),
    claims: 0,
  };
}

/** Cost of the unrouted baseline for a given token volume — used by the dashboard. */
export function baselineCostFor(tokensIn: number, tokensOut: number) {
  return modelCostUsd(BASELINE_MODEL, tokensIn, tokensOut);
}
