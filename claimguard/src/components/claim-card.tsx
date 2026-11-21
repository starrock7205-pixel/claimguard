"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
  Check,
  Clock3,
  Cpu,
  ExternalLink,
  FileText,
  Gauge,
  Layers,
  RotateCcw,
  Search,
  Timer,
  TriangleAlert,
  X,
} from "lucide-react";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Separator } from "./ui/feedback";
import { RiskBadge, SimulatedBadge, VerdictBadge } from "./verdict-badge";
import type { Claim, ClaimVerdict } from "@/lib/types";
import { ageLabel, cn, formatDateTime, isSafeHttpUrl, usd } from "@/lib/utils";
import { TIER_META, VERDICT_META } from "@/lib/verdicts";

function SchemaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-x-3 gap-y-1 py-1.5 text-sm sm:grid-cols-[9rem_1fr]">
      <dt className="font-mono text-[11px] uppercase tracking-wide text-navy-800/50">{label}</dt>
      <dd className="min-w-0 text-[13px] leading-relaxed text-navy-800 wrap-anywhere">{children}</dd>
    </div>
  );
}

function SourceLink({ url }: { url: string }) {
  if (!isSafeHttpUrl(url)) {
    return <span className="text-navy-800/50 italic">URL withheld — not a valid https link</span>;
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="inline-flex items-center gap-1 break-all font-medium text-accent-700 underline decoration-accent-300 underline-offset-2 hover:decoration-accent-600"
    >
      {url}
      <ExternalLink className="h-3 w-3 shrink-0" />
    </a>
  );
}

function ConfidenceMeter({ score }: { score: number }) {
  const tone = score >= 80 ? "#15803D" : score >= 55 ? "#B45309" : "#B91C1C";
  return (
    <span className="inline-flex items-center gap-2">
      <span className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-200">
        <motion.span
          className="block h-full rounded-full"
          style={{ backgroundColor: tone }}
          initial={{ width: 0 }}
          animate={{ width: `${score}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />
      </span>
      <span className="font-mono text-xs font-semibold tabular-nums" style={{ color: tone }}>
        {score}/100
      </span>
    </span>
  );
}

export function ClaimCard({
  claim,
  verdict,
  onApprove,
  onReject,
  onUndo,
  onOpenEvidence,
  disabled,
}: {
  claim: Claim;
  verdict?: ClaimVerdict;
  onApprove: () => void;
  onReject: () => void;
  onUndo: () => void;
  onOpenEvidence: () => void;
  disabled?: boolean;
}) {
  const meta = verdict ? VERDICT_META[verdict.verdict] : null;
  const primary = verdict?.primaryEvidence ?? null;
  const decision = verdict?.decision ?? "pending";
  const hasCorrection = Boolean(verdict?.suggestedReplacement);
  const tierMeta = verdict ? TIER_META[verdict.routing.tier] : null;

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      className={cn(
        "shell-panel overflow-hidden border-l-4",
        meta ? "" : "border-l-slate-300",
      )}
      style={meta ? { borderLeftColor: meta.hex } : undefined}
    >
      {/* ---------------------------------------------------------- header */}
      <header className="flex flex-wrap items-start gap-3 border-b border-[#EDF1F6] bg-slate-50/50 px-5 py-4">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-navy-800 font-mono text-xs font-bold text-white">
          {claim.verificationPriority}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {verdict ? <VerdictBadge verdict={verdict.verdict} /> : <Badge variant="outline">Verifying…</Badge>}
            <RiskBadge level={claim.riskLevel} score={claim.riskScore} />
            <Badge variant="outline">{claim.claimType}</Badge>
            {claim.timeSensitive ? (
              <Badge variant="partial" className="gap-1">
                <Clock3 className="h-3 w-3" />
                Time-sensitive
              </Badge>
            ) : null}
            {verdict?.routing.mode === "simulated" ? <SimulatedBadge /> : null}
          </div>

          {/* Guardrail 4: the original claim is rendered read-only, verbatim. */}
          <p className="mt-2 text-[15px] font-medium leading-relaxed text-navy-800 wrap-anywhere">
            “{claim.originalClaim}”
          </p>
        </div>
      </header>

      {!verdict ? (
        <div className="space-y-2 px-5 py-4">
          <div className="skeleton-line w-2/3" />
          <div className="skeleton-line w-full" />
          <div className="skeleton-line w-5/6" />
        </div>
      ) : (
        <div className="px-5 py-4">
          {/* -------------------------------------- mandatory verdict schema */}
          <dl className="divide-y divide-[#F1F5F9] rounded-md border border-[#EDF1F6] bg-white px-4 py-1">
            <SchemaRow label="originalClaim">
              <span className="font-medium">{claim.originalClaim}</span>
            </SchemaRow>

            <SchemaRow label="evidenceSourceTitle">
              {primary ? (
                <span className="inline-flex items-start gap-1.5">
                  <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-navy-800/40" />
                  {primary.title}
                </span>
              ) : (
                <span className="italic text-navy-800/50">
                  No source — verdict is UNVERIFIABLE and no citation has been invented.
                </span>
              )}
            </SchemaRow>

            <SchemaRow label="sourceUrl">{primary ? <SourceLink url={primary.url} /> : <span className="italic text-navy-800/50">None</span>}</SchemaRow>

            <SchemaRow label="publicationDate">
              {primary ? (
                <span className="inline-flex items-center gap-2">
                  <span className={primary.publishedAt ? "" : "italic text-navy-800/50"}>
                    {primary.publishedAt ?? "Unknown"}
                  </span>
                  {verdict.evidenceAgeDays !== null ? (
                    <span className="text-[11px] text-navy-800/45">({ageLabel(verdict.evidenceAgeDays)})</span>
                  ) : null}
                </span>
              ) : (
                <span className="italic text-navy-800/50">Unknown</span>
              )}
            </SchemaRow>

            <SchemaRow label="evidenceSnippet">
              {primary ? (
                <blockquote className="border-l-2 border-accent-300 bg-accent-50/50 py-1 pl-3 text-[13px] italic leading-relaxed text-navy-800/85">
                  “{primary.snippet}”
                </blockquote>
              ) : (
                <span className="italic text-navy-800/50">No snippet retrieved.</span>
              )}
            </SchemaRow>

            <SchemaRow label="confidenceScore">
              <ConfidenceMeter score={verdict.confidenceScore} />
            </SchemaRow>

            <SchemaRow label="reasoningSummary">
              <span className="text-navy-800/85">{verdict.reasoningSummary}</span>
            </SchemaRow>
          </dl>

          {/* ------------------------------------------------ value comparison */}
          {verdict.claimValue || verdict.evidenceValue ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <div className="rounded-md border border-[#EDF1F6] bg-slate-50/60 px-3 py-2">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-navy-800/50">Claim asserts</div>
                <div className="mt-0.5 font-mono text-sm font-semibold text-navy-800 wrap-anywhere">
                  {verdict.claimValue?.raw ?? "—"}
                </div>
              </div>
              <div className="rounded-md border border-[#EDF1F6] bg-slate-50/60 px-3 py-2">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-navy-800/50">Evidence shows</div>
                <div className="mt-0.5 font-mono text-sm font-semibold text-navy-800 wrap-anywhere">
                  {verdict.evidenceValue?.raw ?? "—"}
                </div>
              </div>
              <div className="rounded-md border border-[#EDF1F6] bg-slate-50/60 px-3 py-2">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-navy-800/50">Drift</div>
                <div className="mt-0.5 font-mono text-sm font-semibold text-navy-800">
                  {verdict.driftPercent !== null ? `${verdict.driftPercent}%` : "n/a"}
                </div>
              </div>
            </div>
          ) : null}

          {/* --------------------------------------------------- routing row */}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border border-[#EDF1F6] bg-white px-3 py-2 text-[11px] text-navy-800/65">
            <span className="inline-flex items-center gap-1.5">
              <Cpu className="h-3.5 w-3.5 text-accent-600" />
              <span className="font-semibold text-navy-800/80">{tierMeta?.label ?? verdict.routing.tier}</span>
              <span className="font-mono">{verdict.routing.usedModel}</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Timer className="h-3.5 w-3.5" />
              {verdict.routing.latencyMs} ms
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5" />
              {verdict.routing.tokensIn} in / {verdict.routing.tokensOut} out
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Gauge className="h-3.5 w-3.5" />
              {usd(verdict.routing.actualCostUsd, 6)}
              <span className="text-navy-800/40">vs baseline {usd(verdict.routing.baselineCostUsd, 6)}</span>
            </span>
            {verdict.routing.cacheHit ? <Badge variant="accent">Cache hit</Badge> : null}
            {verdict.routing.fallbackUsed ? (
              <Badge variant="partial" className="gap-1">
                <TriangleAlert className="h-3 w-3" />
                Fallback {verdict.routing.fallbackFrom} → {verdict.routing.fallbackTo}
              </Badge>
            ) : null}
            <span className="ml-auto inline-flex items-center gap-1.5">
              <Search className="h-3.5 w-3.5" />
              Tavily {claim.searchDepth}
            </span>
          </div>

          {/* --------------------------------------------------- HITL actions */}
          <Separator className="my-3" />

          {hasCorrection ? (
            <div className="rounded-md border border-dashed border-[#D9E2EC] bg-slate-50/70 px-3 py-2.5">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-navy-800/50">
                Staged correction — not applied
              </div>
              <p className="mt-1 text-[13px] leading-relaxed text-navy-800 wrap-anywhere">{verdict.suggestedReplacement}</p>
            </div>
          ) : (
            <p className="rounded-md border border-dashed border-[#D9E2EC] bg-slate-50/70 px-3 py-2.5 text-[13px] text-navy-800/65">
              {verdict.verdict === "SUPPORTED"
                ? "No correction required — retrieved evidence agrees with the claim as written."
                : "No automatic rewrite is proposed. A human must source or rephrase this claim."}
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {decision === "pending" ? (
              <>
                <Button
                  variant="success"
                  size="sm"
                  onClick={onApprove}
                  disabled={disabled}
                  title={hasCorrection ? "Approve this correction and stage it for apply" : "Accept the verdict as-is"}
                >
                  <Check className="h-3.5 w-3.5" />
                  Approve
                </Button>
                <Button variant="outline" size="sm" onClick={onReject} disabled={disabled}>
                  <X className="h-3.5 w-3.5" />
                  Reject
                </Button>
              </>
            ) : (
              <>
                <Badge variant={decision === "approved" ? "supported" : "contradicted"}>
                  {decision === "approved" ? "Approved by human" : "Rejected by human"}
                </Badge>
                {verdict.decidedAt ? (
                  <span className="text-[11px] text-navy-800/50">{formatDateTime(verdict.decidedAt)}</span>
                ) : null}
                <Button variant="ghost" size="sm" onClick={onUndo} disabled={disabled}>
                  <RotateCcw className="h-3.5 w-3.5" />
                  Undo decision
                </Button>
              </>
            )}

            <Button variant="ghost" size="sm" onClick={onOpenEvidence} className="ml-auto">
              <FileText className="h-3.5 w-3.5" />
              All {verdict.evidence.length} source(s)
            </Button>
          </div>
        </div>
      )}
    </motion.article>
  );
}
