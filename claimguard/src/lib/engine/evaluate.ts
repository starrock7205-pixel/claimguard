import type { ClaimType, Evidence, ExtractedValue, Verdict } from "../types";
import { ageLabel, clamp, normalizeText, relativeDays, round } from "../utils";

/**
 * The verdict engine.
 *
 * Pure functions only: given a claim and the evidence retrieved for it, this
 * module decides the verdict, the confidence and the suggested replacement.
 * The same code runs in live mode (after a real Bifrost call) and in simulated
 * mode (via the mock engine), so demo behaviour and production behaviour are
 * produced by one implementation.
 *
 * Guardrail 7 lives here: `evaluateClaim` returns UNVERIFIABLE whenever the
 * evidence set is empty or carries no usable signal. It never invents a figure.
 */

export interface VerdictAnalysis {
  verdict: Verdict;
  confidenceScore: number;
  reasoningSummary: string;
  claimValue: ExtractedValue | null;
  evidenceValue: ExtractedValue | null;
  driftPercent: number | null;
  suggestedReplacement: string | null;
  rulesFired: string[];
}

// ---------------------------------------------------------------------------
// Quantity extraction
// ---------------------------------------------------------------------------

export interface Quantity {
  raw: string;
  value: number;
  unit: "%" | "INR" | "USD" | "count" | "year" | "date" | "plain";
  iso?: string;
  index: number;
}

const MULTIPLIERS: Array<[RegExp, number, Quantity["unit"]]> = [
  [/(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d+)?)\s*(lakh|lac|crore|cr)?/gi, 1, "INR"],
  [/(?:\$|usd)\s*([\d,]+(?:\.\d+)?)\s*(lakh|lac|crore|cr|million|billion)?/gi, 1, "USD"],
  [/([\d,]+(?:\.\d+)?)\s*(lakh|lac)\b/gi, 100_000, "count"],
  [/([\d,]+(?:\.\d+)?)\s*(crore|cr)\b/gi, 10_000_000, "count"],
  [/([\d,]+(?:\.\d+)?)\s*(million)\b/gi, 1_000_000, "count"],
  [/([\d,]+(?:\.\d+)?)\s*(billion)\b/gi, 1_000_000_000, "count"],
  [/([\d,]+(?:\.\d+)?)\s*%/g, 1, "%"],
];

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9,
  september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

function toNumber(raw: string) {
  return Number(raw.replace(/,/g, ""));
}

function isoFor(day: number | null, month: number | null, year: number) {
  const m = month ?? 1;
  const d = day ?? 1;
  return `${year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Pulls every quantitative assertion out of a sentence. */
export function parseQuantities(text: string): Quantity[] {
  const out: Quantity[] = [];
  const seen = new Set<string>();

  // Dates: "4 August 2010", "04.08.2010", "2010-08-04"
  const datePatterns = [
    /(\d{1,2})\s+(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?,?\s+(\d{4})/gi,
    /(\d{1,2})\.(\d{1,2})\.(\d{4})/g,
    /(\d{4})-(\d{2})-(\d{2})/g,
  ];

  for (let i = 0; i < datePatterns.length; i += 1) {
    const re = datePatterns[i];
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(text)) !== null) {
      let year: number;
      let month: number | null;
      let day: number | null;
      if (i === 0) {
        day = Number(m[1]);
        month = MONTHS[m[2].toLowerCase().slice(0, 4)] ?? MONTHS[m[2].toLowerCase()];
        year = Number(m[3]);
      } else if (i === 1) {
        day = Number(m[1]);
        month = Number(m[2]);
        year = Number(m[3]);
      } else {
        year = Number(m[1]);
        month = Number(m[2]);
        day = Number(m[3]);
      }
      if (!year || year < 1500 || year > 2100) continue;
      const iso = isoFor(day, month, year);
      if (seen.has(iso)) continue;
      seen.add(iso);
      out.push({ raw: m[0].trim(), value: year, unit: "date", iso, index: m.index });
    }
  }

  // Currency, scaled counts and percentages
  for (const [re, mult, unit] of MULTIPLIERS) {
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(text)) !== null) {
      // Reject empty digit runs: "USD," would otherwise parse to 0 and could be
      // selected as the closest evidence value, silently corrupting a verdict.
      if (!/\d/.test(m[1])) continue;
      const base = toNumber(m[1]);
      if (!Number.isFinite(base)) continue;
      const suffix = (m[2] ?? "").toLowerCase();
      const suffixMult =
        suffix === "lakh" || suffix === "lac" ? 100_000
        : suffix === "crore" || suffix === "cr" ? 10_000_000
        : suffix === "million" ? 1_000_000
        : suffix === "billion" ? 1_000_000_000
        : mult;
      const value = base * suffixMult;
      const key = `${unit}:${value}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ raw: m[0].trim(), value, unit, index: m.index });
    }
  }

  // Bare years, e.g. "GI recognition in 2010"
  const yearRe = /\b(1[5-9]\d{2}|20\d{2}|2100)\b/g;
  let ym: RegExpExecArray | null;
  while ((ym = yearRe.exec(text)) !== null) {
    const year = Number(ym[1]);
    const iso = isoFor(null, null, year);
    if (seen.has(iso)) continue;
    seen.add(iso);
    out.push({ raw: ym[0], value: year, unit: "year", iso, index: ym.index });
  }

  return out.sort((a, b) => a.index - b.index);
}

function toExtractedValue(q: Quantity, label: string): ExtractedValue {
  return {
    kind: q.unit === "%" ? "percent" : q.unit === "date" || q.unit === "year" ? "date" : q.unit === "INR" || q.unit === "USD" ? "currency" : "number",
    label,
    raw: q.raw,
    normalized: q.unit === "date" || q.unit === "year" ? (q.iso ?? String(q.value)) : q.value,
    unit: q.unit,
  };
}

// ---------------------------------------------------------------------------
// Signal helpers
// ---------------------------------------------------------------------------

const APPROXIMATE_MARKERS = /\b(over|more than|approximately|about|around|nearly|roughly|almost|close to|near|some|~)\b/i;
const RANGE_MARKERS = /\b(from|between|range|typically|up to|to|–|-)\b/i;

/** 0-1 lexical overlap between the claim and an evidence snippet. */
export function lexicalOverlap(claim: string, snippet: string) {
  const stop = new Set(["the", "a", "an", "of", "in", "on", "is", "are", "was", "to", "and", "for", "with", "at", "by", "it"]);
  const a = new Set(normalizeText(claim).split(/\W+/).filter((w) => w.length > 2 && !stop.has(w)));
  const b = normalizeText(snippet);
  if (a.size === 0) return 0;
  let hits = 0;
  a.forEach((w) => {
    if (b.includes(w)) hits += 1;
  });
  return hits / a.size;
}

function driftPercent(claimValue: number, evidenceValue: number) {
  if (evidenceValue === 0) return claimValue === 0 ? 0 : 100;
  return round((Math.abs(claimValue - evidenceValue) / Math.abs(evidenceValue)) * 100, 1);
}

/** Tolerance widens for big rounded statistics and tightens for market rates. */
function toleranceFor(claimType: ClaimType, timeSensitive: boolean, unit: Quantity["unit"]) {
  if (unit === "INR" || unit === "USD" || unit === "%") return timeSensitive ? 1.5 : 3;
  if (claimType === "Statistical") return 6;
  if (timeSensitive) return 3;
  return 5;
}

/** Replaces the claim's own number with the evidence's verbatim value. */
function suggestReplacement(
  claim: string,
  claimQuantity: Quantity,
  evidenceQuantity: Quantity,
  timeSensitive: boolean,
  evidence: Evidence,
) {
  const claimNumber = claimQuantity.raw.replace(/[^0-9,.]/g, "");
  if (!claimNumber) return null;
  // Keep the claim's own unit word ("lakh", "%", "₹") so the correction reads naturally.
  const unitWord = claimQuantity.raw.replace(claimNumber, "").trim();
  const evidenceNumber = evidenceQuantity.raw.replace(/[^0-9,.]/g, "");
  if (!evidenceNumber) return null;
  const replacementUnit = unitWord || evidenceQuantity.raw.replace(evidenceNumber, "").trim();
  // Currency symbols belong in front of the number ("₹94.66"), unit words behind
  // it ("35.22 lakh"). Getting this wrong writes a visibly broken correction.
  const PREFIX_UNITS = ["₹", "$", "€", "£", "¥", "rs"];
  const isPrefixUnit = PREFIX_UNITS.some((u) => replacementUnit.toLowerCase().startsWith(u));
  const rendered = replacementUnit
    ? isPrefixUnit
      ? `${replacementUnit}${evidenceNumber}`
      : `${evidenceNumber} ${replacementUnit}`
    : evidenceNumber;
  let next = claim.replace(claimQuantity.raw, rendered);
  if (timeSensitive) {
    const stamp = evidence.publishedAt ? ` as of ${evidence.publishedAt}` : " as of the latest retrieved source";
    next = next.replace(/\.$/, "") + `${stamp}.`;
  }
  if (!/[.!?]$/.test(next)) next += ".";
  return next;
}

// ---------------------------------------------------------------------------
// The decision procedure
// ---------------------------------------------------------------------------

export interface EvaluateInput {
  claim: string;
  claimType: ClaimType;
  timeSensitive: boolean;
  evidence: Evidence[];
  now?: Date;
  /** Optional hint from the routing model, surfaced in the reasoning. */
  modelNote?: string;
}

export function evaluateClaim(input: EvaluateInput): VerdictAnalysis {
  const { claim, claimType, timeSensitive, now = new Date() } = input;
  const evidence = [...input.evidence].sort((a, b) => b.rankScore - a.rankScore);
  const rulesFired: string[] = [];

  // --- Rule 0: no evidence, no verdict other than UNVERIFIABLE -------------
  if (evidence.length === 0) {
    rulesFired.push("R0 · No evidence retrieved → UNVERIFIABLE (no citation invented)");
    return {
      verdict: "UNVERIFIABLE",
      confidenceScore: 18,
      reasoningSummary:
        "No reliable evidence was retrieved for this claim. ClaimGuard does not fabricate citations, so the claim is left unverified and flagged for a human to source.",
      claimValue: null,
      evidenceValue: null,
      driftPercent: null,
      suggestedReplacement: null,
      rulesFired,
    };
  }

  const primary = evidence[0];
  const pooledSnippet = evidence.map((e) => e.snippet).join(" \n ");
  const claimQuantities = parseQuantities(claim);
  const evidenceQuantities = parseQuantities(pooledSnippet);
  const overlap = Math.max(...evidence.map((e) => lexicalOverlap(claim, e.snippet)));
  const overlapPercent = round(overlap * 100, 1);

  // --- Rule 1: date/year claims -------------------------------------------
  const claimDate = claimQuantities.find((q) => q.unit === "date" || q.unit === "year");
  if (claimDate && !timeSensitive) {
    const evidenceDates = evidenceQuantities.filter((q) => q.unit === "date" || q.unit === "year");
    if (evidenceDates.length > 0) {
      const exact = evidenceDates.find((q) => q.value === claimDate.value);
      const near = evidenceDates.find((q) => Math.abs(q.value - claimDate.value) <= 1);
      if (exact) {
        rulesFired.push("R1 · Claim date matches a dated source exactly");
        return {
          verdict: "SUPPORTED",
          confidenceScore: clamp(70 + Math.round(overlap * 30), 60, 98),
          reasoningSummary: `The retrieved record states ${exact.raw}, matching the year asserted in the claim. ${
            input.modelNote ?? ""
          }`.trim(),
          claimValue: toExtractedValue(claimDate, "Asserted date"),
          evidenceValue: toExtractedValue(exact, "Source date"),
          driftPercent: 0,
          suggestedReplacement: null,
          rulesFired,
        };
      }
      if (near) {
        rulesFired.push("R1b · Claim date within ±1 year of the source record → SUPPORTED with caveat");
        return {
          verdict: "SUPPORTED",
          confidenceScore: clamp(60 + Math.round(overlap * 25), 55, 90),
          reasoningSummary: `The claim's year is within one year of the source record (${near.raw}); the difference reflects filing vs. certification dates rather than a factual conflict.`,
          claimValue: toExtractedValue(claimDate, "Asserted date"),
          evidenceValue: toExtractedValue(near, "Source date"),
          driftPercent: round(Math.abs(claimDate.value - near.value) * 100 / Math.max(1, near.value), 2),
          suggestedReplacement: null,
          rulesFired,
        };
      }
      rulesFired.push("R1c · Claim date conflicts with the source record → CONTRADICTED");
      const best = evidenceDates[0];
      return {
        verdict: "CONTRADICTED",
        confidenceScore: clamp(62 + Math.round(overlap * 30), 60, 95),
        reasoningSummary: `The retrieved record gives ${best.raw}, which does not match the claimed ${claimDate.raw}.`,
        claimValue: toExtractedValue(claimDate, "Asserted date"),
        evidenceValue: toExtractedValue(best, "Source date"),
        driftPercent: null,
        suggestedReplacement: suggestReplacement(claim, claimDate, best, false, primary),
        rulesFired,
      };
    }
  }

  // --- Rule 2: numeric claims ---------------------------------------------
  const claimQuantity =
    claimQuantities.find((q) => q.unit === "%" || q.unit === "INR" || q.unit === "USD" || q.unit === "count") ??
    claimQuantities[0];

  if (claimQuantity) {
    const comparable = evidenceQuantities.filter(
      (q) =>
        q.unit === claimQuantity.unit ||
        (q.unit === "count" && claimQuantity.unit === "count") ||
        (q.unit === "plain" && claimQuantity.unit !== "date"),
    );

    if (comparable.length > 0) {
      const best = comparable.reduce((acc, q) => (Math.abs(q.value - claimQuantity.value) < Math.abs(acc.value - claimQuantity.value) ? q : acc));
      const drift = driftPercent(claimQuantity.value, best.value);
      const tolerance = toleranceFor(claimType, timeSensitive, claimQuantity.unit);
      const newestAge = Math.min(...evidence.map((e) => relativeDays(e.publishedAt, now) ?? Number.MAX_SAFE_INTEGER));
      const evidenceShowsRange = RANGE_MARKERS.test(pooledSnippet) && new Set(comparable.map((q) => q.value)).size > 2;
      const claimIsApproximate = APPROXIMATE_MARKERS.test(claim);

      // 2a: agrees within tolerance
      if (drift <= tolerance || (claimIsApproximate && best.value >= claimQuantity.value && drift <= tolerance * 3)) {
        rulesFired.push(`R2a · Drift ${drift}% ≤ tolerance ${tolerance}% → SUPPORTED`);
        if (claimIsApproximate) rulesFired.push("R2a+ · Approximation marker (\"over\"/\"about\") satisfied by the source figure");
        return {
          verdict: "SUPPORTED",
          confidenceScore: clamp(Math.round(92 - drift * 2 + overlap * 8), 62, 98),
          reasoningSummary: `The closest retrieved figure is ${best.raw}, ${drift}% from the claimed ${claimQuantity.raw}, inside the ${tolerance}% tolerance for ${claimType.toLowerCase()} claims. Newest source is ${ageLabel(newestAge === Number.MAX_SAFE_INTEGER ? null : newestAge)}.`,
          claimValue: toExtractedValue(claimQuantity, "Asserted value"),
          evidenceValue: toExtractedValue(best, "Source value"),
          driftPercent: drift,
          suggestedReplacement: null,
          rulesFired,
        };
      }

      // 2b: the evidence is a range, so a single-value claim over-generalises
      if (evidenceShowsRange && drift > tolerance) {
        rulesFired.push("R2b · Evidence describes a range, claim asserts one value → PARTIALLY SUPPORTED");
        return {
          verdict: "PARTIALLY_SUPPORTED",
          confidenceScore: clamp(Math.round(58 + overlap * 22), 55, 88),
          reasoningSummary: `Retrieved sources describe a range (${comparable.slice(0, 3).map((q) => q.raw).join(", ")}) rather than the single value ${claimQuantity.raw} asserted here, so the claim is true only in a narrower sense.`,
          claimValue: toExtractedValue(claimQuantity, "Asserted value"),
          evidenceValue: toExtractedValue(best, "Closest source value"),
          driftPercent: drift,
          suggestedReplacement: suggestReplacement(claim, claimQuantity, best, timeSensitive, primary),
          rulesFired,
        };
      }

      // 2c: time-sensitive and materially different → stale or contradicted
      if (timeSensitive) {
        if (drift >= 10) {
          rulesFired.push(`R2c · Time-sensitive claim, drift ${drift}% ≥ 10% → CONTRADICTED`);
          return {
            verdict: "CONTRADICTED",
            confidenceScore: clamp(Math.round(78 + Math.min(drift, 20)), 70, 98),
            reasoningSummary: `Current dated evidence puts this at ${best.raw}, ${drift}% away from the claimed ${claimQuantity.raw}. A live value this far from the claim cannot be reconciled as merely out of date.`,
            claimValue: toExtractedValue(claimQuantity, "Asserted value"),
            evidenceValue: toExtractedValue(best, "Current source value"),
            driftPercent: drift,
            suggestedReplacement: suggestReplacement(claim, claimQuantity, best, true, primary),
            rulesFired,
          };
        }
        rulesFired.push(`R2c-soft · Time-sensitive claim, drift ${drift}% < 10% → STALE`);
        return {
          verdict: "STALE",
          confidenceScore: clamp(Math.round(66 + Math.min(drift, 20)), 60, 92),
          reasoningSummary: `The claim was plausible when written, but newer dated evidence (${best.raw}, ${ageLabel(newestAge === Number.MAX_SAFE_INTEGER ? null : newestAge)}) has superseded it by ${drift}%.`,
          claimValue: toExtractedValue(claimQuantity, "Asserted value"),
          evidenceValue: toExtractedValue(best, "Current source value"),
          driftPercent: drift,
          suggestedReplacement: suggestReplacement(claim, claimQuantity, best, true, primary),
          rulesFired,
        };
      }

      // 2d: stable claim, moderate drift → partially supported
      if (drift <= 20) {
        rulesFired.push(`R2d · Non-time-sensitive, drift ${drift}% ≤ 20% → PARTIALLY SUPPORTED`);
        return {
          verdict: "PARTIALLY_SUPPORTED",
          confidenceScore: clamp(Math.round(62 + overlap * 20), 55, 88),
          reasoningSummary: `Evidence supports the direction of the claim but the figure differs: ${best.raw} vs. the claimed ${claimQuantity.raw} (${drift}% apart).`,
          claimValue: toExtractedValue(claimQuantity, "Asserted value"),
          evidenceValue: toExtractedValue(best, "Source value"),
          driftPercent: drift,
          suggestedReplacement: suggestReplacement(claim, claimQuantity, best, false, primary),
          rulesFired,
        };
      }

      // 2e: large disagreement → contradicted
      rulesFired.push(`R2e · Drift ${drift}% > 20% → CONTRADICTED`);
      return {
        verdict: "CONTRADICTED",
        confidenceScore: clamp(Math.round(68 + Math.min(drift, 25)), 65, 96),
        reasoningSummary: `The closest retrieved figure is ${best.raw}, ${drift}% away from the claimed ${claimQuantity.raw}. The gap is too large for the claim to stand as written.`,
        claimValue: toExtractedValue(claimQuantity, "Asserted value"),
        evidenceValue: toExtractedValue(best, "Source value"),
        driftPercent: drift,
        suggestedReplacement: suggestReplacement(claim, claimQuantity, best, false, primary),
        rulesFired,
      };
    }
  }

  // --- Rule 3: qualitative claims fall back to lexical agreement -----------
  if (overlapPercent >= 55) {
    rulesFired.push(`R3 · No numeric assertion; lexical overlap ${overlapPercent}% ≥ 55% → SUPPORTED`);
    return {
      verdict: "SUPPORTED",
      confidenceScore: clamp(Math.round(overlap * 85), 55, 88),
      reasoningSummary: `The claim carries no testable number, but retrieved sources restate it in substance (${overlapPercent}% term overlap with the top source).`,
      claimValue: null,
      evidenceValue: null,
      driftPercent: null,
      suggestedReplacement: null,
      rulesFired,
    };
  }

  if (overlapPercent >= 30) {
    rulesFired.push(`R3b · Lexical overlap ${overlapPercent}% in 30–55% band → PARTIALLY SUPPORTED`);
    return {
      verdict: "PARTIALLY_SUPPORTED",
      confidenceScore: clamp(Math.round(45 + overlap * 40), 40, 70),
      reasoningSummary: `Retrieved evidence touches the claim's subject (${overlapPercent}% term overlap) but does not confirm it in full.`,
      claimValue: null,
      evidenceValue: null,
      driftPercent: null,
      suggestedReplacement: null,
      rulesFired,
    };
  }

  // --- Rule 4: retrieved documents are not about this claim ----------------
  rulesFired.push(`R4 · Lexical overlap ${overlapPercent}% < 30% → UNVERIFIABLE`);
  return {
    verdict: "UNVERIFIABLE",
    confidenceScore: clamp(Math.round(30 - overlap * 20), 8, 35),
    reasoningSummary: `Retrieved documents were not about this claim (${overlapPercent}% term overlap). Rather than stretch a weak citation, ClaimGuard marks it unverifiable.`,
    claimValue: null,
    evidenceValue: null,
    driftPercent: null,
    suggestedReplacement: null,
    rulesFired,
  };
}
