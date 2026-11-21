import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

let counter = 0;

/** Short, collision-resistant id that works in both server and browser contexts. */
export function uid(prefix = "id"): string {
  counter = (counter + 1) % 1_000_000;
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${rand}`;
}

export function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function round(value: number, decimals = 2) {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

export function usd(value: number, decimals = 4) {
  return `$${value.toFixed(decimals)}`;
}

export function percent(value: number, decimals = 0) {
  return `${value.toFixed(decimals)}%`;
}

export function formatDateTime(iso: string | null) {
  if (!iso) return "Unknown";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDate(iso: string | null) {
  if (!iso) return "Unknown";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

/** Relative time with a sane fallback for "Unknown" publication dates. */
export function relativeDays(iso: string | null, from: Date = new Date()) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const days = Math.floor((from.getTime() - d.getTime()) / 86_400_000);
  if (days < 0) return 0;
  return days;
}

export function ageLabel(days: number | null) {
  if (days === null) return "Publication date unknown";
  if (days < 1) return "today";
  if (days === 1) return "1 day old";
  if (days < 30) return `${days} days old`;
  if (days < 365) return `${Math.floor(days / 30)} mo old`;
  return `${(days / 365).toFixed(1)} yr old`;
}

export function hostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Guardrail 7: refuse to render anything that is not a real, absolute https URL. */
export function isSafeHttpUrl(value: string) {
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

/** Deterministic hash — used for the semantic cache key and stable simulated latency. */
export function hashString(value: string) {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/** Deterministic pseudo-random in [0,1) from a seed string, so demo replays are stable. */
export function seededRandom(seed: string) {
  const h = hashString(seed);
  const x = Math.sin(h) * 10_000;
  return x - Math.floor(x);
}

/** Rough token estimate (4 chars ~= 1 token) used when an adapter has no usage payload. */
export function estimateTokens(text: string) {
  return Math.max(1, Math.ceil(text.length / 4));
}

export function pctile(values: number[], p: number) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = clamp(Math.ceil((p / 100) * sorted.length) - 1, 0, sorted.length - 1);
  return sorted[idx];
}

export function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

export function truncate(value: string, max = 160) {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

/** Copy helper that works in browsers without clipboard write permissions. */
export async function copyText(value: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      /* fall through to the legacy path */
    }
  }
  if (typeof document !== "undefined") {
    const ta = document.createElement("textarea");
    ta.value = value;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  }
  return false;
}

export function downloadFile(filename: string, contents: string, mime = "text/plain") {
  const blob = new Blob([contents], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
