"use client";

import * as React from "react";
import { Check, Copy, FileDiff, Lock } from "lucide-react";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { diffStats, diffWords, type DiffToken } from "@/lib/diff";
import { cn, copyText } from "@/lib/utils";

/** Renders one side of the diff, highlighting only that side's changes. */
function DiffPane({ tokens, side }: { tokens: DiffToken[]; side: "before" | "after" }) {
  return (
    <p className="text-[13.5px] leading-relaxed text-navy-800 wrap-anywhere">
      {tokens.map((t, i) => {
        if (t.op === "equal") return <span key={i}>{t.value}</span>;
        if (side === "before" && t.op === "delete") {
          return (
            <mark key={i} className="rounded bg-verdict-contradicted-soft px-0.5 text-verdict-contradicted line-through decoration-verdict-contradicted/50">
              {t.value}
            </mark>
          );
        }
        if (side === "after" && t.op === "insert") {
          return (
            <mark key={i} className="rounded bg-verdict-supported-soft px-0.5 font-medium text-verdict-supported">
              {t.value}
            </mark>
          );
        }
        return null;
      })}
    </p>
  );
}

function InlineDiff({ tokens }: { tokens: DiffToken[] }) {
  return (
    <p className="text-[13.5px] leading-relaxed text-navy-800 wrap-anywhere">
      {tokens.map((t, i) => {
        if (t.op === "delete") {
          return (
            <mark key={i} className="rounded bg-verdict-contradicted-soft px-0.5 text-verdict-contradicted line-through decoration-verdict-contradicted/50">
              {t.value}
            </mark>
          );
        }
        if (t.op === "insert") {
          return (
            <mark key={i} className="rounded bg-verdict-supported-soft px-0.5 font-medium text-verdict-supported">
              {t.value}
            </mark>
          );
        }
        return <span key={i}>{t.value}</span>;
      })}
    </p>
  );
}

export function DiffView({
  originalText,
  correctedText,
  applied,
  approvedCount,
  pendingCount,
}: {
  originalText: string;
  correctedText: string;
  applied: boolean;
  approvedCount: number;
  pendingCount: number;
}) {
  const [mode, setMode] = React.useState<"split" | "inline">("split");
  const [copied, setCopied] = React.useState<"original" | "corrected" | null>(null);
  const tokens = React.useMemo(() => diffWords(originalText, correctedText), [originalText, correctedText]);
  const stats = React.useMemo(() => diffStats(tokens), [tokens]);
  const unchanged = originalText.trim() === correctedText.trim();

  const handleCopy = async (which: "original" | "corrected") => {
    const ok = await copyText(which === "original" ? originalText : correctedText);
    if (ok) {
      setCopied(which);
      setTimeout(() => setCopied(null), 1600);
    }
  };

  return (
    <div className="shell-panel overflow-hidden">
      <header className="flex flex-wrap items-center gap-3 border-b border-[#EDF1F6] px-5 py-4">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-accent-500 text-navy-900">
          <FileDiff className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-navy-800">Source-linked corrected answer</h3>
          <p className="text-xs text-navy-800/60">
            Staged diff · nothing is written until a human approves
          </p>
        </div>

        <div className="flex items-center gap-1 rounded-md border border-[#E2E8F0] bg-slate-50 p-0.5">
          {(["split", "inline"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn(
                "rounded px-2.5 py-1 text-xs font-semibold capitalize transition-colors",
                mode === m ? "bg-white text-navy-800 shadow-sm" : "text-navy-800/55 hover:text-navy-800",
              )}
              aria-pressed={mode === m}
            >
              {m === "split" ? "Side by side" : "Inline"}
            </button>
          ))}
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-[#EDF1F6] bg-slate-50/60 px-5 py-2 text-[11px] text-navy-800/65">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-verdict-supported" />
          {stats.inserted} word(s) inserted
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-verdict-contradicted" />
          {stats.deleted} removed
        </span>
        <span>{stats.unchanged} unchanged</span>
        <span className="font-mono">{stats.similarity}% similarity</span>
        <span className="ml-auto inline-flex items-center gap-2">
          <Badge variant="supported">{approvedCount} approved</Badge>
          {pendingCount > 0 ? <Badge variant="partial">{pendingCount} awaiting review</Badge> : null}
        </span>
      </div>

      {unchanged ? (
        <div className="px-5 py-6 text-center">
          <Lock className="mx-auto h-6 w-6 text-navy-800/40" />
          <p className="mt-2 text-sm font-semibold text-navy-800">No corrections staged</p>
          <p className="mx-auto mt-1 max-w-md text-[13px] leading-relaxed text-navy-800/60">
            Either every claim was supported as written, or no correction has been approved yet. The original answer
            stays byte-for-byte identical.
          </p>
        </div>
      ) : mode === "split" ? (
        <div className="grid gap-0 md:grid-cols-2">
          <div className="border-b border-[#EDF1F6] px-5 py-4 md:border-b-0 md:border-r">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="eyebrow">Original LLM output</span>
              <Button variant="ghost" size="iconSm" onClick={() => handleCopy("original")} aria-label="Copy original">
                {copied === "original" ? <Check className="h-3.5 w-3.5 text-verdict-supported" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>
            </div>
            <DiffPane tokens={tokens} side="before" />
          </div>
          <div className="px-5 py-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="eyebrow">
                {applied ? "Corrected answer (applied)" : "Proposed correction (staged)"}
              </span>
              <Button variant="ghost" size="iconSm" onClick={() => handleCopy("corrected")} aria-label="Copy corrected">
                {copied === "corrected" ? <Check className="h-3.5 w-3.5 text-verdict-supported" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>
            </div>
            <DiffPane tokens={tokens} side="after" />
          </div>
        </div>
      ) : (
        <div className="px-5 py-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="eyebrow">{applied ? "Corrected answer (applied)" : "Proposed correction (staged)"}</span>
            <Button variant="ghost" size="iconSm" onClick={() => handleCopy("corrected")} aria-label="Copy corrected">
              {copied === "corrected" ? <Check className="h-3.5 w-3.5 text-verdict-supported" /> : <Copy className="h-3.5 w-3.5" />}
            </Button>
          </div>
          <InlineDiff tokens={tokens} />
        </div>
      )}
    </div>
  );
}
