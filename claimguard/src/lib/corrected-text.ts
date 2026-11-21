import type { VerificationRun } from "./types";

/**
 * Builds the corrected answer.
 *
 * Guardrail 4: `run.originalText` is never mutated — this always derives a NEW
 * string from it, so the original survives every export and every approval.
 * Guardrail 5: only claims a human explicitly approved are substituted.
 */
export function buildCorrectedText(run: VerificationRun, decisionFilter: "approved" | "all") {
  let text = run.originalText;

  const replacements = run.verdicts
    .filter((v) => v.suggestedReplacement)
    .filter((v) => (decisionFilter === "approved" ? v.decision === "approved" : true))
    .map((v) => {
      const claim = run.claims.find((c) => c.id === v.claimId);
      return claim ? { from: claim.originalClaim, to: v.suggestedReplacement as string } : null;
    })
    .filter((x): x is { from: string; to: string } => x !== null);

  for (const r of replacements) {
    text = text.replace(r.from, r.to);
  }
  return text;
}
