"use client";

import * as React from "react";
import { ExternalLink, FileText, Info, Scale, Sparkles, Timer } from "lucide-react";
import { Badge } from "./ui/badge";
import { Separator } from "./ui/feedback";
import { SimulatedBadge, VerdictBadge } from "./verdict-badge";
import type { Claim, ClaimVerdict } from "@/lib/types";
import { ageLabel, formatDateTime, isSafeHttpUrl } from "@/lib/utils";

function ScoreBar({ label, value, hex }: { label: string; value: number; hex: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-[4.5rem] text-[10px] font-semibold uppercase tracking-wide text-navy-800/50">{label}</span>
      <span className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
        <span className="block h-full rounded-full" style={{ width: `${value}%`, backgroundColor: hex }} />
      </span>
      <span className="w-7 text-right font-mono text-[11px] tabular-nums text-navy-800/60">{value}</span>
    </div>
  );
}

export function EvidenceDrawerBody({ claim, verdict }: { claim: Claim; verdict?: ClaimVerdict }) {
  if (!verdict) {
    return <p className="text-sm text-navy-800/60">Evidence is still being retrieved for this claim.</p>;
  }

  const anySimulated = verdict.evidence.some((e) => e.simulated);

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-[#EDF1F6] bg-slate-50/60 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <VerdictBadge verdict={verdict.verdict} />
          <Badge variant="outline">{claim.claimType}</Badge>
          <Badge variant="outline">Tavily {claim.searchDepth}</Badge>
          {anySimulated ? <SimulatedBadge /> : <Badge variant="accent">Live evidence</Badge>}
        </div>
        <p className="mt-2 text-sm font-medium text-navy-800 wrap-anywhere">“{claim.originalClaim}”</p>
        <p className="mt-2 text-[13px] leading-relaxed text-navy-800/75">{verdict.reasoningSummary}</p>
      </div>

      <div>
        <h3 className="eyebrow mb-2">Detection rules that fired</h3>
        <ul className="space-y-1">
          {(verdict as ClaimVerdict & { rulesFired?: string[] }).rulesFired?.map((rule) => (
            <li key={rule} className="flex gap-2 text-[13px] text-navy-800/75">
              <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-600" />
              <span className="wrap-anywhere">{rule}</span>
            </li>
          )) ?? (
            <li className="flex gap-2 text-[13px] text-navy-800/60">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-navy-800/40" />
              Rules are recorded by the deterministic engine; this verdict came from a live model call.
            </li>
          )}
        </ul>
      </div>

      <Separator />

      <div>
        <h3 className="eyebrow mb-3">
          Retrieved sources ({verdict.evidence.length}) — ranked by recency &amp; authority
        </h3>

        {verdict.evidence.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center">
            <Scale className="mx-auto h-6 w-6 text-navy-800/40" />
            <p className="mt-2 text-sm font-semibold text-navy-800">No sources retrieved</p>
            <p className="mx-auto mt-1 max-w-sm text-[13px] leading-relaxed text-navy-800/60">
              ClaimGuard will not invent a URL, a publication date or a statistic. With no evidence this claim is
              marked UNVERIFIABLE and handed to a human.
            </p>
          </div>
        ) : (
          <ol className="space-y-3">
            {verdict.evidence.map((e, i) => (
              <li key={e.id} className="rounded-lg border border-[#EDF1F6] bg-white p-4">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded bg-navy-800 font-mono text-[11px] font-bold text-white">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-sm font-semibold text-navy-800 wrap-anywhere">
                        <FileText className="mr-1 inline h-3.5 w-3.5 text-navy-800/40" />
                        {e.title}
                      </h4>
                      {e.simulated ? <SimulatedBadge label="seeded" /> : null}
                    </div>

                    {isSafeHttpUrl(e.url) ? (
                      <a
                        href={e.url}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        className="mt-1 inline-flex items-center gap-1 break-all text-xs font-medium text-accent-700 underline decoration-accent-300 underline-offset-2 hover:decoration-accent-600"
                      >
                        {e.url}
                        <ExternalLink className="h-3 w-3 shrink-0" />
                      </a>
                    ) : (
                      <span className="mt-1 block text-xs italic text-navy-800/50">URL withheld — invalid</span>
                    )}

                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-navy-800/60">
                      <span className="inline-flex items-center gap-1">
                        <Timer className="h-3 w-3" />
                        published: {e.publishedAt ?? "Unknown"}
                      </span>
                      {e.publishedAt ? <span>{ageLabelFrom(e.publishedAt)}</span> : null}
                      <span className="font-mono">{e.domain}</span>
                    </div>

                    <blockquote className="mt-2 border-l-2 border-accent-300 bg-accent-50/50 py-1.5 pl-3 text-[13px] italic leading-relaxed text-navy-800/85">
                      “{e.snippet}”
                    </blockquote>

                    <div className="mt-3 space-y-1">
                      <ScoreBar label="Rank" value={Math.round(e.rankScore)} hex="#00B4D8" />
                      <ScoreBar label="Authority" value={e.authorityScore} hex="#0B132B" />
                      <ScoreBar label="Recency" value={e.recencyScore} hex="#15803D" />
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>

      <p className="text-[11px] leading-relaxed text-navy-800/45">
        Verified {formatDateTime(verdict.verifiedAt)} · rank score = 0.45 × relevance + 0.30 × authority + 0.25 ×
        recency. Undated sources receive a recency score of 35 because recency cannot be established.
      </p>
    </div>
  );
}

function ageLabelFrom(iso: string | null) {
  const days = iso
    ? Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000))
    : null;
  return days === null ? "" : `· ${ageLabel(days)}`;
}
