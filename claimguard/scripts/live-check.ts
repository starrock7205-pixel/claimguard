import { authorityForDomain, recencyScoreFor, rankEvidence, rankAndSort } from "../src/lib/adapters/tavily";
import { evaluateClaim, parseQuantities } from "../src/lib/engine/evaluate";
import type { Evidence } from "../src/lib/types";

const CLAIM = "The Indian rupee is currently trading at ₹75 per US dollar.";

async function main() {
  const base = process.env.CG_BASE ?? "http://localhost:3000";
  const res = await fetch(`${base}/api/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: "Indian rupee USD exchange rate latest official figure", depth: "advanced", maxResults: 5 }),
  });
  const data = (await res.json()) as { available: boolean; results?: Array<{ title: string; url: string; content: string; published_date?: string | null; score?: number }> };
  console.log("live Tavily available:", data.available, "| results:", data.results?.length ?? 0);

  const evidence: Evidence[] = (data.results ?? []).map((r, i) => {
    const domain = new URL(r.url).hostname.replace(/^www\./, "");
    const authority = authorityForDomain(domain);
    const recency = recencyScoreFor(r.published_date ?? null);
    const relevance = Math.max(0, Math.min(100, (r.score ?? 0.5) * 100));
    return {
      id: `live_${i}`, title: r.title, url: r.url, publishedAt: r.published_date ?? null,
      snippet: r.content, domain, authorityScore: authority, recencyScore: recency,
      rankScore: rankEvidence(relevance, authority, recency), simulated: false,
    };
  });
  const ranked = rankAndSort(evidence);

  console.log("\n--- what the engine extracts from LIVE snippets ---");
  for (const e of ranked.slice(0, 3)) {
    const q = parseQuantities(e.snippet);
    console.log(`  ${e.domain}: published=${e.publishedAt ?? "Unknown"} rank=${e.rankScore}`);
    console.log(`    quantities found: ${q.length ? q.map((x) => `${x.raw} (${x.unit}=${x.value})`).join(" | ") : "NONE"}`);
  }

  const a = evaluateClaim({ claim: CLAIM, claimType: "Financial", timeSensitive: true, evidence: ranked });
  console.log("\n--- verdict on the ₹75 claim using LIVE evidence ---");
  console.log("  verdict      :", a.verdict);
  console.log("  confidence   :", a.confidenceScore);
  console.log("  claimValue   :", a.claimValue?.raw ?? "none");
  console.log("  evidenceValue:", a.evidenceValue?.raw ?? "none");
  console.log("  drift        :", a.driftPercent);
  console.log("  rules        :", a.rulesFired.join(" ; "));
  console.log("  reasoning    :", a.reasoningSummary);
  console.log("  replacement  :", a.suggestedReplacement ?? "none");
}
void main();
