import { BASELINE_MODEL, MODEL_PRICING, modelCostUsd } from "../verdicts";
import type { BifrostSettings, RoutingTier } from "../types";
import { clamp, estimateTokens, hashString, normalizeText, round, seededRandom } from "../utils";
import { simulateChatCompletion } from "./mock-engine";

/**
 * Bifrost (by Maxim AI) adapter.
 *
 * Bifrost exposes an OpenAI-compatible API at `<baseUrl>/chat/completions`, so
 * this client is a thin typed wrapper over that contract plus everything the
 * spec asks for on top of it: tiered routing, automatic fallback, a semantic
 * cache, a monthly USD budget cap, and per-call observability.
 *
 * Guardrail 6: when no key is available the adapter never fabricates a gateway
 * response. It calls the mock engine and returns `mode: "simulated"` so the UI
 * can badge the result.
 */

export interface BifrostMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface BifrostCallOptions {
  messages: BifrostMessage[];
  tier: RoutingTier;
  settings: BifrostSettings;
  /** Deterministic cache/latency seed, usually the claim text. */
  seedKey?: string;
  /** Demo knob: force the primary model to fail so a fallback event is logged. */
  forcePrimaryFailure?: boolean;
}

export interface BifrostCallResult {
  content: string;
  tier: RoutingTier;
  requestedModel: string;
  usedModel: string;
  mode: "live" | "simulated";
  fallbackUsed: boolean;
  fallbackFrom?: string;
  fallbackTo?: string;
  fallbackReason?: string;
  latencyMs: number;
  tokensIn: number;
  tokensOut: number;
  actualCostUsd: number;
  baselineCostUsd: number;
  cacheHit: boolean;
  error?: string;
}

export const DEFAULT_BASE_URL = "http://localhost:8080/v1";

// ---------------------------------------------------------------------------
// Budget accounting (monthly USD cap)
// ---------------------------------------------------------------------------

function spendKey() {
  const now = new Date();
  return `claimguard:bifrost:spend:${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function getMonthSpendUsd() {
  if (typeof window === "undefined") return 0;
  const raw = window.localStorage.getItem(spendKey());
  const n = raw ? Number(raw) : 0;
  return Number.isFinite(n) ? n : 0;
}

export function recordSpendUsd(amount: number) {
  if (typeof window === "undefined" || amount <= 0) return;
  const next = getMonthSpendUsd() + amount;
  window.localStorage.setItem(spendKey(), String(round(next, 6)));
}

export function budgetStatus(settings: BifrostSettings) {
  const spent = getMonthSpendUsd();
  const cap = settings.monthlyBudgetCapUsd;
  const remaining = Math.max(0, cap - spent);
  return {
    spent,
    cap,
    remaining,
    usedPercent: cap > 0 ? clamp((spent / cap) * 100, 0, 100) : 0,
    exceeded: spent >= cap,
  };
}

// ---------------------------------------------------------------------------
// Semantic cache
// ---------------------------------------------------------------------------

const CACHE_STORAGE_KEY = "claimguard:bifrost:cache";
const CACHE_LIMIT = 80;

interface CacheEntry {
  key: string;
  content: string;
  model: string;
  at: number;
  tokensIn: number;
  tokensOut: number;
}

const memoryCache = new Map<string, CacheEntry>();

function readDiskCache(): CacheEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CACHE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CacheEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeDiskCache(entries: CacheEntry[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(entries.slice(-CACHE_LIMIT)));
  } catch {
    /* quota exceeded — cache is best-effort */
  }
}

/**
 * Semantic key: provider/model-agnostic, whitespace and case normalised, so
 * "ONDC seller fee is 2%" and "ondc seller fee is 2%." collide on purpose.
 */
export function semanticCacheKey(tier: RoutingTier, messages: BifrostMessage[]) {
  const payload = messages.map((m) => `${m.role}:${normalizeText(m.content)}`).join("|");
  return `${tier}:${hashString(payload).toString(36)}`;
}

export function cacheGet(key: string): CacheEntry | null {
  const mem = memoryCache.get(key);
  if (mem) return mem;
  const disk = readDiskCache().find((e) => e.key === key);
  if (disk) memoryCache.set(key, disk);
  return disk ?? null;
}

export function cacheSet(entry: CacheEntry) {
  memoryCache.set(entry.key, entry);
  const disk = readDiskCache().filter((e) => e.key !== entry.key);
  disk.push(entry);
  writeDiskCache(disk);
}

export function cacheSize() {
  const keys = new Set<string>();
  memoryCache.forEach((_entry, key) => keys.add(key));
  readDiskCache().forEach((e) => keys.add(e.key));
  return keys.size;
}

export function clearCache() {
  memoryCache.clear();
  if (typeof window !== "undefined") window.localStorage.removeItem(CACHE_STORAGE_KEY);
}

// ---------------------------------------------------------------------------
// Model selection
// ---------------------------------------------------------------------------

export function modelForTier(tier: RoutingTier, settings: BifrostSettings) {
  if (tier === "FAST") return settings.fastModel;
  if (tier === "REASONING") return settings.reasoningModel;
  return settings.standardModel;
}

function endpointFor(baseUrl: string) {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (/\/chat\/completions$/.test(trimmed)) return trimmed;
  return `${trimmed}/chat/completions`;
}

async function postChatCompletion(
  settings: BifrostSettings,
  model: string,
  messages: BifrostMessage[],
  signal: AbortSignal,
) {
  const res = await fetch(endpointFor(settings.baseUrl), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.1,
      max_tokens: 900,
      stream: false,
    }),
    signal,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Bifrost returned ${res.status}${body ? `: ${body.slice(0, 180)}` : ""}`);
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
    model?: string;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Bifrost returned an empty completion");
  return {
    content,
    model: data.model ?? model,
    tokensIn: data.usage?.prompt_tokens ?? estimateTokens(messages.map((m) => m.content).join(" ")),
    tokensOut: data.usage?.completion_tokens ?? estimateTokens(content),
  };
}

/**
 * Transport 1: the server-side proxy at /api/llm.
 *
 * Preferred when available, because BIFROST_API_KEY then stays on the server
 * and never enters the browser bundle. Returns `available: false` (not a throw)
 * when the server has no key, so the caller can fall through to transport 2.
 */
interface ProxyResponse {
  available: boolean;
  content?: string;
  model?: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number } | null;
  reason?: string;
}

async function proxyChatCompletion(
  model: string,
  messages: BifrostMessage[],
): Promise<ProxyResponse | null> {
  try {
    const res = await fetch("/api/llm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages, temperature: 0.1, max_tokens: 900 }),
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as ProxyResponse;
  } catch {
    return null;
  }
}

const KEY_NOT_CONFIGURED = "not configured";

/** Simulated latency that is stable per seed but varies by tier, like a real gateway. */
function simulatedLatency(tier: RoutingTier, seed: string) {
  const base = tier === "REASONING" ? 1450 : tier === "STANDARD" ? 780 : 320;
  return Math.round(base + seededRandom(seed) * (tier === "REASONING" ? 900 : 340));
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function bifrostComplete(options: BifrostCallOptions): Promise<BifrostCallResult> {
  const { messages, tier, settings, seedKey = "", forcePrimaryFailure = false } = options;
  const requestedModel = modelForTier(tier, settings);
  const promptText = messages.map((m) => m.content).join(" ");
  const tokensIn = estimateTokens(promptText);

  const cacheKey = semanticCacheKey(tier, messages);
  if (settings.cacheEnabled) {
    const cached = cacheGet(cacheKey);
    if (cached) {
      const actualCostUsd = 0; // cache hit: no tokens billed
      return {
        content: cached.content,
        tier,
        requestedModel,
        usedModel: cached.model,
        mode: "simulated",
        fallbackUsed: false,
        latencyMs: 12,
        tokensIn: cached.tokensIn,
        tokensOut: cached.tokensOut,
        actualCostUsd,
        baselineCostUsd: modelCostUsd(BASELINE_MODEL, cached.tokensIn, cached.tokensOut),
        cacheHit: true,
      };
    }
  }

  const budget = budgetStatus(settings);
  const hasBrowserKey = settings.apiKey.trim().length > 0;

  // Transport resolution, in priority order:
  //   1. server-side proxy (/api/llm)  — key never reaches the browser
  //   2. browser key from /settings    — direct call to the gateway
  //   3. simulated                     — deterministic mock engine
  let transport: "proxy" | "direct" | "simulated" = hasBrowserKey ? "direct" : "simulated";
  let proxyPrimary: Awaited<ReturnType<typeof postChatCompletion>> | null = null;
  let proxyPrimaryError: string | undefined;

  if (!hasBrowserKey) {
    const probe = await proxyChatCompletion(requestedModel, messages);
    if (probe && probe.available && probe.content) {
      transport = "proxy";
      proxyPrimary = {
        content: probe.content,
        model: probe.model ?? requestedModel,
        tokensIn: probe.usage?.prompt_tokens ?? tokensIn,
        tokensOut: probe.usage?.completion_tokens ?? estimateTokens(probe.content),
      };
    } else if (probe && probe.reason && probe.reason.includes(KEY_NOT_CONFIGURED)) {
      transport = "simulated";
    } else if (probe) {
      // The proxy exists but the call failed — keep the proxy transport so the
      // fallback below is retried through it rather than degrading to a mock.
      transport = "proxy";
      proxyPrimaryError = probe.reason ?? "Bifrost proxy returned no completion.";
    } else {
      transport = "simulated";
    }
  }
  const simulatedMode = transport === "simulated";

  // Guardrail: a hard budget cap actually stops spend, it does not just warn.
  if (budget.exceeded) {
    return {
      content: "",
      tier,
      requestedModel,
      usedModel: requestedModel,
      mode: simulatedMode ? "simulated" : "live",
      fallbackUsed: false,
      latencyMs: 4,
      tokensIn,
      tokensOut: 0,
      actualCostUsd: 0,
      baselineCostUsd: 0,
      cacheHit: false,
      error: `Monthly Bifrost budget cap of $${budget.cap.toFixed(2)} reached. Raise the cap in Settings to continue.`,
    };
  }

  const started = performance.now();

  // -------------------------------------------------------------- simulated
  if (simulatedMode) {
    const latency = simulatedLatency(tier, seedKey || promptText.slice(0, 120));
    let usedModel = requestedModel;
    let fallbackUsed = false;
    let fallbackFrom: string | undefined;
    let fallbackTo: string | undefined;
    let fallbackReason: string | undefined;

    if (forcePrimaryFailure && settings.fallbackModel !== requestedModel) {
      fallbackUsed = true;
      fallbackFrom = requestedModel;
      fallbackTo = settings.fallbackModel;
      fallbackReason = "Primary model unavailable in the gateway pool (simulated 503). Bifrost fallback activated.";
      usedModel = settings.fallbackModel;
    }

    await new Promise<void>((r) => setTimeout(r, Math.min(latency, 2600)));
    const { content, tokensOut } = simulateChatCompletion(messages, seedKey || promptText.slice(0, 200), tier);
    const actualCostUsd = modelCostUsd(usedModel, tokensIn, tokensOut);
    const baselineCostUsd = modelCostUsd(BASELINE_MODEL, tokensIn, tokensOut);
    recordSpendUsd(actualCostUsd);
    if (settings.cacheEnabled) cacheSet({ key: cacheKey, content, model: usedModel, at: Date.now(), tokensIn, tokensOut });

    return {
      content,
      tier,
      requestedModel,
      usedModel,
      mode: "simulated",
      fallbackUsed,
      fallbackFrom,
      fallbackTo,
      fallbackReason,
      latencyMs: latency,
      tokensIn,
      tokensOut,
      actualCostUsd,
      baselineCostUsd,
      cacheHit: false,
    };
  }

  // ------------------------------------------------------------------- live
  const attempt = async (model: string, timeoutMs: number) => {
    if (transport === "proxy") {
      const r = await proxyChatCompletion(model, messages);
      if (!r) throw new Error("Bifrost proxy unreachable (/api/llm).");
      if (!r.available || !r.content) throw new Error(r.reason ?? "Bifrost proxy returned no completion.");
      return {
        content: r.content,
        model: r.model ?? model,
        tokensIn: r.usage?.prompt_tokens ?? tokensIn,
        tokensOut: r.usage?.completion_tokens ?? estimateTokens(r.content),
      };
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await postChatCompletion(settings, model, messages, controller.signal);
    } finally {
      clearTimeout(timer);
    }
  };

  let primary: Awaited<ReturnType<typeof attempt>> | null = proxyPrimary;
  let primaryError: string | undefined = proxyPrimaryError;

  // The proxy probe above already produced (or failed) the primary completion.
  if (!primary && !primaryError) {
    try {
      if (forcePrimaryFailure) throw new Error("Forced primary-model failure (Settings → Simulate fallback)");
      primary = await attempt(requestedModel, settings.requestTimeoutMs);
    } catch (err) {
      primaryError = err instanceof Error ? (err.name === "AbortError" ? `Primary model timed out after ${settings.requestTimeoutMs}ms` : err.message) : String(err);
    }
  }

  let usedModel = requestedModel;
  let content = primary?.content ?? "";
  let tokensOut = primary?.tokensOut ?? 0;
  let fallbackUsed = false;
  let fallbackFrom: string | undefined;
  let fallbackTo: string | undefined;
  let fallbackReason: string | undefined;

  if (!primary && settings.fallbackModel && settings.fallbackModel !== requestedModel) {
    try {
      const fb = await attempt(settings.fallbackModel, settings.requestTimeoutMs);
      content = fb.content;
      tokensOut = fb.tokensOut;
      usedModel = fb.model;
      fallbackUsed = true;
      fallbackFrom = requestedModel;
      fallbackTo = settings.fallbackModel;
      fallbackReason = primaryError;
    } catch (err) {
      const fbErr = err instanceof Error ? err.message : String(err);
      return {
        content: "",
        tier,
        requestedModel,
        usedModel: requestedModel,
        mode: "live",
        fallbackUsed: false,
        latencyMs: Math.round(performance.now() - started),
        tokensIn,
        tokensOut: 0,
        actualCostUsd: 0,
        baselineCostUsd: 0,
        cacheHit: false,
        error: `Primary (${primaryError}) and fallback (${fbErr}) both failed.`,
      };
    }
  } else if (!primary) {
    return {
      content: "",
      tier,
      requestedModel,
      usedModel: requestedModel,
      mode: "live",
      fallbackUsed: false,
      latencyMs: Math.round(performance.now() - started),
      tokensIn,
      tokensOut: 0,
      actualCostUsd: 0,
      baselineCostUsd: 0,
      cacheHit: false,
      error: primaryError ?? "Primary model failed and no fallback model is configured.",
    };
  }

  const latencyMs = Math.round(performance.now() - started);
  const actualCostUsd = modelCostUsd(usedModel, tokensIn, tokensOut);
  const baselineCostUsd = modelCostUsd(BASELINE_MODEL, tokensIn, tokensOut);
  recordSpendUsd(actualCostUsd);
  if (settings.cacheEnabled) cacheSet({ key: cacheKey, content, model: usedModel, at: Date.now(), tokensIn, tokensOut });

  return {
    content,
    tier,
    requestedModel,
    usedModel,
    mode: "live",
    fallbackUsed,
    fallbackFrom,
    fallbackTo,
    fallbackReason,
    latencyMs,
    tokensIn,
    tokensOut,
    actualCostUsd,
    baselineCostUsd,
    cacheHit: false,
  };
}

/** Exposed for the Settings screen so users can see the pricing table in use. */
export function pricingTable() {
  return Object.entries(MODEL_PRICING).map(([model, p]) => ({ model, ...p }));
}
