import { diffStats, diffToMarkdown, diffWords } from "./diff";
import { buildCorrectedText } from "./corrected-text";
import type { VerificationRun } from "./types";
import { formatDateTime, hostname, isSafeHttpUrl, round } from "./utils";
import { VERDICT_META } from "./verdicts";

/**
 * Export builders for the audit trail. Every export carries the full mandatory
 * verdict schema plus the [SIMULATED] disclosure when it applies.
 */

export function runToJson(run: VerificationRun) {
  return JSON.stringify(
    {
      schema: "claimguard.verification-run/v1",
      generatedAt: new Date().toISOString(),
      simulated: run.simulated,
      run: {
        id: run.id,
        label: run.label,
        source: run.source,
        createdAt: run.createdAt,
        completedAt: run.completedAt,
        status: run.status,
        approvedBy: run.approvedBy,
        originalText: run.originalText,
        correctedText: run.correctedText,
        totals: run.totals,
        timeline: run.timeline.map((s) => ({
          id: s.id,
          title: s.title,
          state: s.state,
          messages: s.messages.map((m) => ({ text: m.text, tone: m.tone, at: new Date(m.at).toISOString() })),
        })),
        claims: run.claims.map((claim) => {
          const verdict = run.verdicts.find((v) => v.claimId === claim.id);
          return {
            originalClaim: claim.originalClaim,
            claimType: claim.claimType,
            claimTypes: claim.claimTypes,
            timeSensitive: claim.timeSensitive,
            riskScore: claim.riskScore,
            riskLevel: claim.riskLevel,
            verificationPriority: claim.verificationPriority,
            searchDepth: claim.searchDepth,
            verdict: verdict?.verdict ?? "UNVERIFIABLE",
            confidenceScore: verdict?.confidenceScore ?? 0,
            reasoningSummary: verdict?.reasoningSummary ?? "",
            humanDecision: verdict?.decision ?? "pending",
            suggestedReplacement: verdict?.suggestedReplacement ?? null,
            routing: verdict?.routing ?? null,
            evidence: (verdict?.evidence ?? []).map((e) => ({
              evidenceSourceTitle: e.title,
              sourceUrl: e.url,
              publicationDate: e.publishedAt ?? "Unknown",
              evidenceSnippet: e.snippet,
              authorityScore: e.authorityScore,
              recencyScore: e.recencyScore,
              rankScore: e.rankScore,
              simulated: e.simulated,
            })),
          };
        }),
      },
      disclosure: run.simulated
        ? "One or more adapter responses in this run were SIMULATED (no API key configured). Seeded evidence is a real, dated corpus snapshot; it is not live web data."
        : "All adapter responses in this run were live.",
    },
    null,
    2,
  );
}

function evidenceBlock(run: VerificationRun, claimId: string) {
  const verdict = run.verdicts.find((v) => v.claimId === claimId);
  if (!verdict || verdict.evidence.length === 0) {
    return "> No evidence retrieved. No citation invented (verdict: UNVERIFIABLE).\n";
  }
  return verdict.evidence
    .map((e, i) => {
      const url = isSafeHttpUrl(e.url) ? e.url : "(invalid URL withheld)";
      return [
        `**[${i + 1}] ${e.title}**`,
        `- sourceUrl: ${url}`,
        `- publicationDate: ${e.publishedAt ?? "Unknown"}`,
        `- rankScore: ${e.rankScore} (authority ${e.authorityScore} · recency ${e.recencyScore})${e.simulated ? " · [SIMULATED]" : ""}`,
        `- evidenceSnippet: "${e.snippet}"`,
      ].join("\n");
    })
    .join("\n\n");
}

export function runToMarkdown(run: VerificationRun) {
  const lines: string[] = [];
  const corrected = run.correctedText ?? buildCorrectedText(run, "approved");
  const stats = run.originalText !== corrected ? diffStats(diffWords(run.originalText, corrected)) : null;

  lines.push(`# ClaimGuard Verification Report`);
  lines.push("");
  lines.push(`- **Run:** ${run.label}`);
  lines.push(`- **Run ID:** \`${run.id}\``);
  lines.push(`- **Source:** ${run.source}`);
  lines.push(`- **Started:** ${formatDateTime(run.createdAt)}`);
  lines.push(`- **Completed:** ${formatDateTime(run.completedAt)}`);
  lines.push(`- **Status:** ${run.status}`);
  lines.push(`- **Approved by:** ${run.approvedBy ?? "no human approval recorded"}`);
  lines.push(`- **Adapter mode:** ${run.simulated ? "`[SIMULATED]` — no API key configured" : "live"}`);
  lines.push("");
  lines.push("## Totals");
  lines.push("");
  lines.push(`| Metric | Value |`);
  lines.push(`| --- | --- |`);
  lines.push(`| Claims | ${run.totals.claims} |`);
  lines.push(`| Tokens in / out | ${run.totals.tokensIn} / ${run.totals.tokensOut} |`);
  lines.push(`| Tokens routed off the frontier baseline | ${run.totals.tokensSavedVsBaseline} |`);
  lines.push(`| Actual cost | $${round(run.totals.actualCostUsd, 6)} |`);
  lines.push(`| Unrouted frontier baseline cost | $${round(run.totals.baselineCostUsd, 6)} |`);
  lines.push(`| Cost saved | $${round(run.totals.costSavedUsd, 6)} |`);
  lines.push(`| Cache hits | ${run.totals.cacheHits} |`);
  lines.push(`| Bifrost fallback events | ${run.totals.fallbackEvents} |`);
  lines.push(`| Total / P95 latency | ${run.totals.latencyMs} ms / ${run.totals.p95LatencyMs} ms |`);
  lines.push("");
  lines.push("## Original LLM output (immutable)");
  lines.push("");
  lines.push("```text");
  lines.push(run.originalText);
  lines.push("```");
  lines.push("");

  lines.push("## Claims");
  lines.push("");
  for (const claim of run.claims) {
    const verdict = run.verdicts.find((v) => v.claimId === claim.id);
    const meta = VERDICT_META[verdict?.verdict ?? "UNVERIFIABLE"];
    lines.push(`### ${claim.verificationPriority}. ${claim.originalClaim}`);
    lines.push("");
    lines.push(`- **Verdict:** ${meta.label} (${verdict?.verdict ?? "UNVERIFIABLE"})`);
    lines.push(`- **Claim type:** ${claim.claimType}${claim.timeSensitive ? " · time-sensitive" : ""}`);
    lines.push(`- **Risk:** ${claim.riskScore}/100 (${claim.riskLevel})`);
    lines.push(`- **Tavily search depth:** ${claim.searchDepth}`);
    lines.push(`- **confidenceScore:** ${verdict?.confidenceScore ?? 0}/100`);
    lines.push(`- **Human decision:** ${verdict?.decision ?? "pending"}`);
    if (verdict?.routing) {
      lines.push(
        `- **Bifrost routing:** ${verdict.routing.tier} tier · requested \`${verdict.routing.requestedModel}\` · used \`${verdict.routing.usedModel}\`${
          verdict.routing.fallbackUsed ? ` · **fallback** ${verdict.routing.fallbackFrom} → ${verdict.routing.fallbackTo}` : ""
        } · ${verdict.routing.latencyMs} ms · ${verdict.routing.tokensIn}+${verdict.routing.tokensOut} tokens · $${round(verdict.routing.actualCostUsd, 6)}${verdict.routing.mode === "simulated" ? " · [SIMULATED]" : ""}`,
      );
    }
    if (verdict?.claimValue) lines.push(`- **Claim value:** ${verdict.claimValue.raw}`);
    if (verdict?.evidenceValue) lines.push(`- **Evidence value:** ${verdict.evidenceValue.raw}`);
    if (verdict?.driftPercent !== null && verdict?.driftPercent !== undefined) lines.push(`- **Drift:** ${verdict.driftPercent}%`);
    lines.push(`- **reasoningSummary:** ${verdict?.reasoningSummary ?? "—"}`);
    if (verdict?.suggestedReplacement) {
      lines.push("");
      lines.push(`**Suggested correction:** ${verdict.suggestedReplacement}`);
    }
    lines.push("");
    lines.push("**Evidence**");
    lines.push("");
    lines.push(evidenceBlock(run, claim.id));
    lines.push("");
  }

  lines.push("## Source-linked corrected answer");
  lines.push("");
  if (!run.correctedText) {
    lines.push("> No corrections applied yet — the human approval gate has not been cleared.");
  } else {
    lines.push("```text");
    lines.push(run.correctedText);
    lines.push("```");
  }
  lines.push("");
  if (stats) {
    lines.push(`Diff: ${stats.inserted} word(s) inserted, ${stats.deleted} removed, ${stats.unchanged} unchanged (${stats.similarity}% similarity).`);
    lines.push("");
    lines.push(diffToMarkdown(diffWords(run.originalText, corrected)));
    lines.push("");
  }

  lines.push("## Agent activity timeline");
  lines.push("");
  for (const step of run.timeline) {
    lines.push(`**${step.id}. ${step.title}** — ${step.state}`);
    for (const m of step.messages) {
      lines.push(`- ${m.text}`);
    }
    lines.push("");
  }

  lines.push("---");
  lines.push("");
  lines.push(
    run.simulated
      ? "> **[SIMULATED]** One or more adapter responses were simulated because no API key was configured. Seeded evidence is a real, dated corpus snapshot captured from the listed URLs — it is not live web data."
      : "> All adapter responses in this run were live.",
  );
  lines.push("");
  lines.push(`Generated by ClaimGuard · ${hostname("https://claimguard.app")} · ${new Date().toISOString()}`);
  return lines.join("\n");
}

export function runsToMarkdown(runs: VerificationRun[]) {
  const header = [
    "# ClaimGuard Batch Verification Report",
    "",
    `- Generated: ${formatDateTime(new Date().toISOString())}`,
    `- Runs included: ${runs.length}`,
    `- Claims verified: ${runs.reduce((a, r) => a + r.totals.claims, 0)}`,
    `- Total cost saved vs. unrouted baseline: $${round(runs.reduce((a, r) => a + r.totals.costSavedUsd, 0), 6)}`,
    "",
  ].join("\n");
  return `${header}\n${runs.map(runToMarkdown).join("\n\n---\n\n")}`;
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "run";
}
