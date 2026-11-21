/**
 * ClaimGuard pipeline verification.
 *
 * This exercises the REAL code paths — extractClaims, runPipeline, the Bifrost
 * adapter, the Tavily corpus adapter, the verdict engine, buildCorrectedText
 * and the diff — in Node, with no browser. Run with: npm run verify
 *
 * It is the check behind the claim "the demo produces these four verdicts".
 */
import { extractClaims } from "../src/lib/engine/extract";
import { runPipeline, emptyTimeline, type PipelineEvent } from "../src/lib/pipeline";
import { buildCorrectedText } from "../src/lib/corrected-text";
import { diffStats, diffWords } from "../src/lib/diff";
import { searchCorpus } from "../src/lib/adapters/tavily";
import { evaluateClaim } from "../src/lib/engine/evaluate";
import { DEMO_CLAIMS, DEMO_LLM_OUTPUT, CORPUS } from "../src/lib/seed";
import type { Claim, ClaimVerdict, Settings, VerificationRun } from "../src/lib/types";
import { VERDICTS } from "../src/lib/verdicts";
import { runToMarkdown, runToJson } from "../src/lib/exporters";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const settings: Settings = {
  tavily: { apiKey: "", maxResults: 5, includeRawContent: false },
  bifrost: {
    apiKey: "",
    baseUrl: "http://localhost:8080/v1",
    fastModel: "gpt-4o-mini",
    standardModel: "gpt-4o-mini",
    reasoningModel: "gpt-4o",
    fallbackModel: "claude-3-5-sonnet",
    monthlyBudgetCapUsd: 25,
    simulateFallback: true,
    requestTimeoutMs: 20000,
    cacheEnabled: true,
  },
  escalateHighRisk: true,
  requireHumanApproval: true,
  advancedDepthRiskThreshold: 60,
};

async function main() {
  // ------------------------------------------------------------ 1. extraction
  console.log("\n[1] Claim extraction & classification");
  const drafts = extractClaims(DEMO_LLM_OUTPUT, settings.advancedDepthRiskThreshold);
  check("extracts exactly 4 atomic claims", drafts.length === 4, `got ${drafts.length}`);

  const expectedTypes = DEMO_CLAIMS.map((c) => c.claimType);
  const gotTypes = drafts.map((d) => d.claimType);
  check(
    "claim types match the scenario (Statistical, Financial, Historical, Financial)",
    JSON.stringify(gotTypes) === JSON.stringify(expectedTypes),
    `got ${JSON.stringify(gotTypes)}`,
  );

  check(
    "time-sensitive flags match (false, true, false, true)",
    JSON.stringify(drafts.map((d) => d.timeSensitive)) === "[false,true,false,true]",
    JSON.stringify(drafts.map((d) => d.timeSensitive)),
  );
  check(
    "risk scores match the curated scenario",
    JSON.stringify(drafts.map((d) => d.riskScore)) === JSON.stringify(DEMO_CLAIMS.map((c) => c.riskScore)),
    JSON.stringify(drafts.map((d) => d.riskScore)),
  );
  check(
    "high-risk claims escalate to advanced Tavily depth",
    drafts.filter((d) => d.riskScore >= 70).every((d) => d.searchDepth === "advanced"),
  );

  // --------------------------------------------------------- 2. full pipeline
  console.log("\n[2] Full pipeline run (simulated adapters)");
  const runId = "test_run";
  const events: PipelineEvent[] = [];
  const claims: Claim[] = [];
  const verdicts: ClaimVerdict[] = [];
  let fallbackCount = 0;
  let simulated = false;
  let status: VerificationRun["status"] = "idle";
  let totals: VerificationRun["totals"] | null = null;
  let timeline = emptyTimeline();

  const started = Date.now();
  await runPipeline(
    { text: DEMO_LLM_OUTPUT, source: "demo", label: "test", runId, settings },
    {
      emit: (event) => {
        events.push(event);
        if (event.kind === "claims") claims.push(...event.claims);
        if (event.kind === "verdict") verdicts.push(event.verdict);
        if (event.kind === "fallback") fallbackCount += 1;
        if (event.kind === "status") {
          status = event.status;
          if (event.simulated) simulated = true;
        }
        if (event.kind === "totals") totals = event.totals;
        if (event.kind === "step") {
          timeline = timeline.map((s) => {
            if (s.id !== event.stepId) return s;
            const next = { ...s };
            if (event.state) next.state = event.state;
            if (event.message) next.messages = [...next.messages, { id: `${s.id}-${next.messages.length}`, ...event.message, at: Date.now() }];
            return next;
          });
        }
      },
    },
  );
  const elapsed = Date.now() - started;

  check("4 claims emitted", claims.length === 4, `got ${claims.length}`);
  check("4 verdicts emitted", verdicts.length === 4, `got ${verdicts.length}`);
  // `status` is assigned inside the emit closure, so TS narrows it from the
  // initializer; read it through an explicitly typed const to compare fairly.
  const finalStatus: VerificationRun["status"] = status;
  check("run reached the approval gate", finalStatus === "awaiting_approval", `status=${finalStatus}`);
  check("all 10 timeline steps reached done", timeline.every((s) => s.state === "done"), timeline.map((s) => `${s.id}:${s.state}`).join(" "));
  check("timeline logged events", timeline.reduce((a, s) => a + s.messages.length, 0) > 15);
  check("run is flagged as simulated", simulated);
  check("totals were emitted", totals !== null && totals.claims === 4);
  console.log(`  · pipeline finished in ${elapsed}ms`);

  // ---------------------------------------------------------- 3. the verdicts
  console.log("\n[3] Verdict correctness (the heart of the demo)");
  // NOTE: the dashboard orders claims by verification priority (risk descending),
  // so claims are matched to their expectation by TEXT, never by array position.
  const byText = new Map(
    claims.map((c) => [c.originalClaim, { claim: c, verdict: verdicts.find((v) => v.claimId === c.id)! }]),
  );
  const forSeed = (i: number) => byText.get(DEMO_CLAIMS[i].originalClaim)!;

  const inPriorityOrder = [...byText.values()].sort(
    (a, b) => a.claim.verificationPriority - b.claim.verificationPriority,
  );
  check("priorities are 1..4 and unique", inPriorityOrder.map((x) => x.claim.verificationPriority).join(",") === "1,2,3,4");

  DEMO_CLAIMS.forEach((expected, i) => {
    const found = forSeed(i);
    check(
      `"${expected.originalClaim.slice(0, 44)}…" → ${expected.verdict}`,
      found.verdict.verdict === expected.verdict,
      `got ${found.verdict.verdict}`,
    );
  });

  const rupee = forSeed(3);
  check("rupee claim is STALE or CONTRADICTED", rupee.verdict.verdict === "CONTRADICTED" || rupee.verdict.verdict === "STALE");
  check("rupee claim reports numeric drift > 15%", (rupee.verdict.driftPercent ?? 0) > 15, `drift=${rupee.verdict.driftPercent}`);
  check("rupee claim proposes a dated replacement", Boolean(rupee.verdict.suggestedReplacement));
  check(
    "rupee replacement does not restate the stale ₹75 figure",
    !(rupee.verdict.suggestedReplacement ?? "").includes("₹75"),
  );

  const ondc = forSeed(1);
  check("ONDC claim is PARTIALLY SUPPORTED", ondc.verdict.verdict === "PARTIALLY_SUPPORTED", `got ${ondc.verdict.verdict}`);
  check("ONDC claim proposes a scoped replacement", Boolean(ondc.verdict.suggestedReplacement));

  check("handloom claim needs no correction", forSeed(0).verdict.suggestedReplacement === null);
  check("Gadwal GI claim needs no correction", forSeed(2).verdict.suggestedReplacement === null);
  const byOrder = inPriorityOrder;

  // ------------------------------------------------ 4. mandatory verdict schema
  console.log("\n[4] Mandatory verdict schema on every card");
  for (const { verdict } of byOrder) {
    const hasSchema =
      typeof verdict.reasoningSummary === "string" &&
      verdict.reasoningSummary.length > 40 &&
      typeof verdict.confidenceScore === "number" &&
      verdict.confidenceScore >= 0 &&
      verdict.confidenceScore <= 100 &&
      VERDICTS.includes(verdict.verdict);
    check(`schema complete for ${verdict.verdict} claim`, hasSchema);

    if (verdict.evidence.length > 0) {
      const e = verdict.primaryEvidence!;
      check(
        `primary evidence has title/url/snippet (${verdict.verdict})`,
        Boolean(e.title) && e.url.startsWith("https://") && e.snippet.length > 30,
        e.url,
      );
      check(`publicationDate present or explicitly Unknown (${verdict.verdict})`, e.publishedAt === null || /^\d{4}-\d{2}-\d{2}$/.test(e.publishedAt));
    }
  }

  // -------------------------------------------------------- 5. routing & cost
  console.log("\n[5] Bifrost routing, fallback and accounting");
  const tierOf = (i: number) => forSeed(i).verdict.routing.tier;
  check(
    "handloom (LOW risk) routes to the fast tier",
    tierOf(0) === "FAST" && forSeed(0).verdict.routing.usedModel === "gpt-4o-mini",
    `${tierOf(0)}/${forSeed(0).verdict.routing.usedModel}`,
  );
  check(
    "Gadwal GI (LOW risk) routes to the fast tier",
    tierOf(2) === "FAST" && forSeed(2).verdict.routing.usedModel === "gpt-4o-mini",
    `${tierOf(2)}/${forSeed(2).verdict.routing.usedModel}`,
  );
  check(
    "ONDC fee (HIGH, time-sensitive) escalates to the reasoning tier",
    tierOf(1) === "REASONING",
    tierOf(1),
  );
  check(
    "rupee rate (HIGH, financial) escalates to the reasoning tier",
    tierOf(3) === "REASONING",
    tierOf(3),
  );
  check("exactly one fallback event fired", fallbackCount === 1, `got ${fallbackCount}`);
  check(
    "the fallback fired on the ONDC claim, not elsewhere",
    forSeed(1).verdict.routing.fallbackUsed &&
      !forSeed(0).verdict.routing.fallbackUsed &&
      !forSeed(2).verdict.routing.fallbackUsed &&
      !forSeed(3).verdict.routing.fallbackUsed,
  );
  check(
    "the fallback re-routed gpt-4o → claude-3-5-sonnet",
    byOrder.some((b) => b.verdict.routing.fallbackUsed && b.verdict.routing.fallbackFrom === "gpt-4o" && b.verdict.routing.fallbackTo === "claude-3-5-sonnet"),
  );
  check("routed cost is below the unrouted baseline", (totals!.actualCostUsd < totals!.baselineCostUsd));
  check("tokens were routed off the frontier model", totals!.tokensSavedVsBaseline > 0);
  check("every verdict records a routing mode", byOrder.every((b) => b.verdict.routing.mode === "simulated"));

  // ------------------------------------------------------- 6. corrected answer
  console.log("\n[6] Human-in-the-loop gate & corrected answer");
  const run: VerificationRun = {
    id: runId,
    createdAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    source: "demo",
    label: "test",
    originalText: DEMO_LLM_OUTPUT,
    correctedText: null,
    status,
    claims,
    verdicts,
    timeline,
    totals: totals!,
    simulated,
    error: null,
    approvedBy: null,
  };

  check("correctedText is null before approval (nothing auto-applied)", run.correctedText === null);

  const withApprovals: VerificationRun = {
    ...run,
    verdicts: run.verdicts.map((v) => (v.suggestedReplacement ? { ...v, decision: "approved" as const } : v)),
  };
  const corrected = buildCorrectedText(withApprovals, "approved");
  check("approved corrections are written into the corrected answer", corrected !== DEMO_LLM_OUTPUT);
  check("the ₹75 figure is gone from the corrected answer", !corrected.includes("₹75"));
  check("the corrected answer keeps the supported handloom figure", corrected.includes("35 lakh"));
  check("the original text is untouched", run.originalText === DEMO_LLM_OUTPUT);

  const stats = diffStats(diffWords(DEMO_LLM_OUTPUT, corrected));
  check("diff reports inserts and deletes", stats.inserted > 0 && stats.deleted > 0, JSON.stringify(stats));

  // --------------------------------------------------------- 7. zero fabrication
  console.log("\n[7] Zero-fabrication guardrail");
  const unknown = searchCorpus("The Eiffel Tower was completed in 1889 by Gustave Eiffel.", "advanced", 5);
  check("unrelated claim retrieves no corpus documents", unknown.hits.length === 0, `${unknown.hits.length} hits`);
  const analysed = evaluateClaim({
    claim: "The Eiffel Tower was completed in 1889 by Gustave Eiffel.",
    claimType: "Historical",
    timeSensitive: false,
    evidence: [],
  });
  check("no evidence → UNVERIFIABLE, never a guess", analysed.verdict === "UNVERIFIABLE");
  check("no evidence → no suggested replacement invented", analysed.suggestedReplacement === null);

  const seededUrls = new Set(CORPUS.map((d) => d.url));
  const allUrls = verdicts.flatMap((v) => v.evidence.map((e) => e.url));
  check(
    "every cited URL exists in the real seeded corpus",
    allUrls.length > 0 && allUrls.every((u) => seededUrls.has(u)),
    allUrls.filter((u) => !seededUrls.has(u)).join(", "),
  );

  // --------------------------------------------------------------- 8. exports
  console.log("\n[8] Exports");
  const md = runToMarkdown({ ...run, correctedText: corrected, approvedBy: "human" });
  check("Markdown report contains the original text", md.includes(DEMO_LLM_OUTPUT));
  check("Markdown report contains every verdict label", ["Supported", "Partially Supported", "Contradicted"].every((l) => md.includes(l)));
  check("Markdown report carries the [SIMULATED] disclosure", md.includes("[SIMULATED]"));
  check("Markdown report lists source URLs", md.includes("https://handlooms.nic.in") && md.includes("wise.com"));
  check('Markdown report records "publicationDate: Unknown" for undated sources', md.includes("publicationDate: Unknown"));

  const json = JSON.parse(runToJson({ ...run, correctedText: corrected, approvedBy: "human" })) as {
    run: { claims: Array<{ originalClaim: string; verdict: string; evidence: Array<{ sourceUrl: string; publicationDate: string }> }> };
    disclosure: string;
  };
  check("JSON export has 4 claims", json.run.claims.length === 4);
  check("JSON export has the mandatory schema fields", json.run.claims.every((c) => c.originalClaim && c.verdict));
  check("JSON export carries the disclosure", json.disclosure.includes("SIMULATED"));
  check(
    "JSON export uses 'Unknown' for missing publication dates",
    json.run.claims.some((c) => c.evidence.some((e) => e.publicationDate === "Unknown")),
  );

  // ------------------------------------------------------------------ summary
  console.log(`\n${"=".repeat(56)}`);
  console.log(`  ${passed} passed · ${failed} failed`);
  if (failed > 0) {
    console.log("\nFailures:");
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exitCode = 1;
  } else {
    console.log("  All pipeline invariants hold.");
  }
  console.log(`${"=".repeat(56)}\n`);
}

void main();
