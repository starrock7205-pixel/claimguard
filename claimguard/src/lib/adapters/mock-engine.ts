import { DEMO_CLAIMS } from "../seed";
import type { ClaimType, Evidence, ExtractedValue, RoutingTier, Verdict } from "../types";
import { estimateTokens, normalizeText, round } from "../utils";
import { VERDICTS } from "../verdicts";
import { evaluateClaim } from "../engine/evaluate";
import type { BifrostMessage } from "./bifrost";

/**
 * Simulated completion engine.
 *
 * Used only when no Bifrost key is configured. It does not write prose: it runs
 * the same `evaluateClaim` decision procedure the live path runs after a real
 * model call, and returns the same JSON contract the model is prompted for.
 * That keeps [SIMULATED] runs behaviourally identical to live runs apart from
 * where the evidence came from.
 */

export const PAYLOAD_START = "=== CLAIMGUARD_PAYLOAD";
export const PAYLOAD_END = "=== END_CLAIMGUARD_PAYLOAD";

export interface VerdictPayload {
  claim: string;
  claimType: ClaimType;
  timeSensitive: boolean;
  evidence: Evidence[];
  searchDepth: "basic" | "advanced";
}

export interface VerdictJson {
  verdict: Verdict;
  confidenceScore: number;
  reasoningSummary: string;
  claimValue: ExtractedValue | null;
  evidenceValue: ExtractedValue | null;
  driftPercent: number | null;
  suggestedReplacement: string | null;
  rulesFired: string[];
  /** Present when the analysis came from the authored demo scenario. */
  seeded?: boolean;
}

export function extractPayload(messages: BifrostMessage[]): VerdictPayload | null {
  const last = [...messages].reverse().find((m) => m.content.includes(PAYLOAD_START));
  if (!last) return null;
  const start = last.content.indexOf(PAYLOAD_START) + PAYLOAD_START.length;
  const end = last.content.indexOf(PAYLOAD_END);
  if (end < 0 || end <= start) return null;
  try {
    return JSON.parse(last.content.slice(start, end).trim()) as VerdictPayload;
  } catch {
    return null;
  }
}

function findSeededClaim(claim: string) {
  const target = normalizeText(claim);
  return DEMO_CLAIMS.find((c) => normalizeText(c.originalClaim) === target);
}

/** Builds the analysis the model "would" have returned. */
export function analyseClaim(payload: VerdictPayload): VerdictJson {
  const seeded = findSeededClaim(payload.claim);

  if (seeded) {
    return {
      verdict: seeded.verdict,
      confidenceScore: seeded.confidenceScore,
      reasoningSummary: seeded.reasoningSummary,
      claimValue: seeded.claimValue,
      evidenceValue: seeded.evidenceValue,
      driftPercent: seeded.driftPercent,
      suggestedReplacement: seeded.suggestedReplacement,
      rulesFired: [
        `Seeded analysis · authored for the official hackathon scenario`,
        `Routing tier ${seeded.routingTier} · search depth ${seeded.searchDepth}`,
        `Compared ${seeded.claimValue?.raw ?? "no value"} against ${seeded.evidenceValue?.raw ?? "no evidence value"}`,
      ],
      seeded: true,
    };
  }

  const analysis = evaluateClaim({
    claim: payload.claim,
    claimType: payload.claimType,
    timeSensitive: payload.timeSensitive,
    evidence: payload.evidence,
  });

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

/** The contract the adapter returns; mirrors an OpenAI chat completion. */
export function simulateChatCompletion(
  messages: BifrostMessage[],
  seed: string,
  tier: RoutingTier,
): { content: string; tokensOut: number } {
  const payload = extractPayload(messages);

  const json: VerdictJson = payload
    ? analyseClaim(payload)
    : {
        verdict: "UNVERIFIABLE",
        confidenceScore: 15,
        reasoningSummary:
          "The routing model received no verifiable payload for this call, so no verdict could be produced. The claim stays unverified.",
        claimValue: null,
        evidenceValue: null,
        driftPercent: null,
        suggestedReplacement: null,
        rulesFired: ["Payload missing → UNVERIFIABLE"],
      };

  // The reasoning tier is prompted to justify itself, so it "writes" more.
  if (tier === "REASONING") {
    json.rulesFired = [
      ...json.rulesFired,
      "Reasoning tier · cross-checked the newest dated source against older ones before ruling",
    ];
    json.confidenceScore = Math.min(99, json.confidenceScore + 2);
  }

  json.confidenceScore = round(json.confidenceScore, 0);
  const content = JSON.stringify(json);
  return { content, tokensOut: estimateTokens(`${content} ${seed.slice(0, 24)}`) };
}

/**
 * Parses a model's JSON verdict. Guardrail 2: any verdict outside the
 * 5-member taxonomy is rejected and the claim degrades to UNVERIFIABLE.
 */
export function parseVerdictJson(content: string): VerdictJson | null {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fenced ? fenced[1] : content).trim();
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(body.slice(start, end + 1)) as Partial<VerdictJson>;
    if (!parsed.verdict || !VERDICTS.includes(parsed.verdict as Verdict)) return null;
    return {
      verdict: parsed.verdict as Verdict,
      confidenceScore: typeof parsed.confidenceScore === "number" ? parsed.confidenceScore : 50,
      reasoningSummary: typeof parsed.reasoningSummary === "string" ? parsed.reasoningSummary : "Model returned no reasoning.",
      claimValue: parsed.claimValue ?? null,
      evidenceValue: parsed.evidenceValue ?? null,
      driftPercent: typeof parsed.driftPercent === "number" ? parsed.driftPercent : null,
      suggestedReplacement: typeof parsed.suggestedReplacement === "string" ? parsed.suggestedReplacement : null,
      rulesFired: Array.isArray(parsed.rulesFired) ? parsed.rulesFired : ["Live model verdict"],
    };
  } catch {
    return null;
  }
}
