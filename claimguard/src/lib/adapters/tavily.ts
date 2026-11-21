import { CORPUS } from "../seed";
import type { Evidence, SearchDepth, TavilySettings } from "../types";
import { clamp, hashString, hostname, isSafeHttpUrl, normalizeText, round, seededRandom } from "../utils";

/**
 * Tavily adapter.
 *
 * Resolution order (first available wins):
 *   1. Server-side key  → POST /api/search (key never reaches the browser)
 *   2. Browser key      → POST https://api.tavily.com/search directly
 *   3. No key           → search the seeded corpus and badge it [SIMULATED]
 *
 * Guardrail 6: path 3 is never presented as live. Guardrail 7: path 3 can only
 * return documents that exist in CORPUS, so no URL is ever invented.
 */

export interface TavilyHit {
  title: string;
  url: string;
  content: string;
  publishedAt: string | null;
  score: number;
}

export interface TavilySearchResult {
  query: string;
  depth: SearchDepth;
  mode: "live" | "simulated";
  source: "server-key" | "browser-key" | "seeded-corpus";
  hits: TavilyHit[];
  latencyMs: number;
  /** Set when a live call was attempted and failed, and we degraded to the corpus. */
  degradedFrom?: string;
  answer?: string;
}

export const TAVILY_ENDPOINT = "https://api.tavily.com/search";

/** Authority prior per domain suffix, applied to live results too. */
const AUTHORITY_DOMAINS: Array<{ match: string; score: number }> = [
  { match: ".gov.in", score: 95 },
  { match: ".nic.in", score: 96 },
  { match: ".gov", score: 93 },
  { match: ".edu", score: 85 },
  { match: ".ac.in", score: 82 },
  { match: "rbi.org.in", score: 96 },
  { match: "pib.gov.in", score: 95 },
  { match: "wikipedia.org", score: 78 },
  { match: "reuters.com", score: 90 },
  { match: "bloomberg.com", score: 89 },
  { match: "thehindu.com", score: 86 },
  { match: "economictimes.indiatimes.com", score: 84 },
  { match: "livemint.com", score: 82 },
  { match: "business-standard.com", score: 80 },
  { match: "wise.com", score: 72 },
];

export function authorityForDomain(domain: string) {
  const d = domain.toLowerCase();
  for (const entry of AUTHORITY_DOMAINS) {
    if (d === entry.match.replace(/^\./, "") || d.endsWith(entry.match)) return entry.score;
  }
  return 50;
}

/** Newer sources outrank older ones; undated sources are penalised, never flattered. */
export function recencyScoreFor(publishedAt: string | null, now = Date.now()) {
  if (!publishedAt) return 35;
  const t = new Date(publishedAt).getTime();
  if (Number.isNaN(t)) return 35;
  const days = (now - t) / 86_400_000;
  if (days < 0) return 70;
  return clamp(Math.round(100 * Math.exp(-days / 300)), 5, 100);
}

export function rankEvidence(relevance: number, authority: number, recency: number) {
  return round(0.45 * relevance + 0.3 * authority + 0.25 * recency, 1);
}

function toEvidence(hit: TavilyHit, simulated: boolean, index: number): Evidence {
  const domain = hostname(hit.url);
  const authority = authorityForDomain(domain);
  const recency = recencyScoreFor(hit.publishedAt);
  const relevance = clamp(hit.score * 100, 0, 100);
  return {
    id: `ev_${hashString(hit.url + hit.title).toString(36)}_${index}`,
    title: hit.title || domain,
    url: hit.url,
    publishedAt: hit.publishedAt,
    snippet: hit.content,
    domain,
    authorityScore: authority,
    recencyScore: recency,
    rankScore: rankEvidence(relevance, authority, recency),
    simulated,
  };
}

export function rankAndSort(evidence: Evidence[]) {
  return [...evidence]
    .filter((e) => isSafeHttpUrl(e.url))
    .sort((a, b) => b.rankScore - a.rankScore || b.recencyScore - a.recencyScore);
}

// ---------------------------------------------------------------------------
// Path 1: server-side key
// ---------------------------------------------------------------------------

interface ServerSearchResponse {
  available: boolean;
  results?: Array<{
    title: string;
    url: string;
    content: string;
    published_date?: string | null;
    score?: number;
  }>;
  answer?: string;
  error?: string;
}

async function searchWithServerKey(query: string, depth: SearchDepth, maxResults: number): Promise<TavilySearchResult | null> {
  const started = performance.now();
  try {
    const res = await fetch("/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, depth, maxResults }),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as ServerSearchResponse;
    if (!data.available || !data.results) return null;
    return {
      query,
      depth,
      mode: "live",
      source: "server-key",
      answer: data.answer,
      latencyMs: Math.round(performance.now() - started),
      hits: data.results.map((r) => ({
        title: r.title,
        url: r.url,
        content: r.content,
        publishedAt: r.published_date ?? null,
        score: r.score ?? 0.5,
      })),
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Path 2: browser-supplied key (configured on /settings, stored in localStorage)
// ---------------------------------------------------------------------------

async function searchWithBrowserKey(
  query: string,
  depth: SearchDepth,
  maxResults: number,
  apiKey: string,
): Promise<TavilySearchResult | null> {
  const started = performance.now();
  try {
    const res = await fetch(TAVILY_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query,
        search_depth: depth,
        max_results: maxResults,
        include_answer: true,
        include_raw_content: false,
        api_key: apiKey,
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      answer?: string;
      results?: Array<{ title: string; url: string; content: string; published_date?: string; score?: number }>;
    };
    if (!data.results) return null;
    return {
      query,
      depth,
      mode: "live",
      source: "browser-key",
      answer: data.answer,
      latencyMs: Math.round(performance.now() - started),
      hits: data.results.map((r) => ({
        title: r.title,
        url: r.url,
        content: r.content,
        publishedAt: r.published_date ?? null,
        score: r.score ?? 0.5,
      })),
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Path 3: seeded corpus (simulated)
// ---------------------------------------------------------------------------

const STOPWORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "of", "in", "on", "at", "to", "for", "and", "or", "by",
  "with", "that", "this", "it", "as", "from", "over", "about", "currently", "latest", "received", "per",
]);

function tokenizeQuery(query: string) {
  return normalizeText(query)
    .replace(/[^a-z0-9₹$%\s.-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

/** Corpus search. Returns real documents only — an empty list when nothing matches. */
export function searchCorpus(query: string, depth: SearchDepth, maxResults: number): TavilySearchResult {
  const tokens = tokenizeQuery(query);

  const scored = CORPUS.map((doc) => {
    let relevance = 0;
    for (const token of tokens) {
      const hit = doc.keywords.some((k) => k.includes(token) || token.includes(k));
      if (hit) relevance += 1;
      if (normalizeText(doc.title).includes(token)) relevance += 0.6;
      if (normalizeText(doc.snippet).includes(token)) relevance += 0.4;
    }
    const normalised = tokens.length ? clamp((relevance / tokens.length) * 100, 0, 100) : 0;
    // `advanced` depth widens the recall window, mirroring Tavily's behaviour.
    const threshold = depth === "advanced" ? 12 : 22;
    return { doc, relevance: normalised >= threshold ? normalised : 0 };
  })
    .filter((s) => s.relevance > 0)
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, maxResults);

  // Simulated network latency, deterministic per query so replays look identical.
  const base = depth === "advanced" ? 620 : 340;
  const jitter = Math.round(seededRandom(query) * 380);

  return {
    query,
    depth,
    mode: "simulated",
    source: "seeded-corpus",
    latencyMs: base + jitter,
    hits: scored.map((s) => ({
      title: s.doc.title,
      url: s.doc.url,
      content: s.doc.snippet,
      publishedAt: s.doc.publishedAt,
      score: round(s.relevance / 100, 3),
    })),
  };
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export interface TavilyCallOptions {
  query: string;
  depth?: SearchDepth;
  maxResults?: number;
  settings: TavilySettings;
}

export async function tavilySearch({ query, depth = "basic", maxResults, settings }: TavilyCallOptions): Promise<TavilySearchResult> {
  const limit = maxResults ?? settings.maxResults ?? 5;

  // Live paths are only attempted when a key could exist.
  const serverResult = await searchWithServerKey(query, depth, limit);
  if (serverResult && serverResult.hits.length > 0) return serverResult;

  if (settings.apiKey.trim().length > 0) {
    const browserResult = await searchWithBrowserKey(query, depth, limit, settings.apiKey.trim());
    if (browserResult && browserResult.hits.length > 0) return browserResult;
  }

  const simulated = searchCorpus(query, depth, limit);
  if (serverResult === null && settings.apiKey.trim().length > 0) {
    simulated.degradedFrom = "A live Tavily call was attempted and failed. Falling back to the seeded corpus.";
  }
  return simulated;
}

/** Convenience wrapper that returns ranked Evidence objects ready for the UI. */
export async function retrieveEvidence(options: TavilyCallOptions): Promise<{ result: TavilySearchResult; evidence: Evidence[] }> {
  const result = await tavilySearch(options);
  const evidence = rankAndSort(result.hits.map((h, i) => toEvidence(h, result.mode === "simulated", i)));
  return { result, evidence };
}

/** Builds the natural-language search query used for one claim. */
export function buildSearchQuery(claim: string, claimType: string, timeSensitive: boolean) {
  const trimmed = claim.replace(/\.$/, "");
  if (timeSensitive) return `${trimmed} latest official figure ${new Date().getFullYear()}`;
  if (claimType === "Historical") return `${trimmed} official record date`;
  if (claimType === "Financial") return `${trimmed} official rate`;
  return `${trimmed} official source`;
}
