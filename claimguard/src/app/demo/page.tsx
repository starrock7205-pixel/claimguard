"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  CheckCircle2,
  CircleDashed,
  Clock,
  Download,
  FileText,
  Gauge,
  Loader2,
  PlayCircle,
  Route,
  Search,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  UserCheck,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout, Progress } from "@/components/ui/feedback";
import { VerdictBadge } from "@/components/verdict-badge";
import { useClaimGuard } from "@/lib/store";
import { runToMarkdown, slugify } from "@/lib/exporters";
import { CORPUS, DEMO_CLAIMS, DEMO_LLM_OUTPUT, EVIDENCE_SNAPSHOT_DATE } from "@/lib/seed";
import type { Verdict } from "@/lib/types";
import { cn, downloadFile } from "@/lib/utils";
import { VERDICT_META } from "@/lib/verdicts";

interface Step {
  id: number;
  title: string;
  seconds: string;
  say: string;
  expect: string;
  icon: React.ComponentType<{ className?: string }>;
}

const SCRIPT: Step[] = [
  {
    id: 1,
    title: "Load the official 4-claim demo",
    seconds: "0:00 – 0:15",
    say: "This is one ordinary LLM answer about Indian textiles and markets. Nothing here looks obviously wrong — that is the point.",
    expect: "4 atomic claims extracted from a single paragraph.",
    icon: Zap,
  },
  {
    id: 2,
    title: "Watch the 10-step agent timeline",
    seconds: "0:15 – 0:45",
    say: "Parsing, extraction, classification, risk scoring, Bifrost routing, Tavily retrieval, ranking, staleness detection, correction drafting, then the approval gate. Every step emits real events.",
    expect: "All 10 steps reach Done, with per-step messages you can read.",
    icon: PlayCircle,
  },
  {
    id: 3,
    title: "Point at the routing decision",
    seconds: "0:45 – 1:10",
    say: "The handloom statistic and the Gadwal GI fact are low risk, so they went to the cheap fast model. The ONDC fee and the rupee rate are time-sensitive and financial, so they escalated to the reasoning model.",
    expect: "2 claims on the fast tier, 2 on the reasoning tier.",
    icon: Route,
  },
  {
    id: 4,
    title: "Show the Bifrost fallback event",
    seconds: "1:10 – 1:25",
    say: "The gateway reported the primary reasoning model unavailable. Bifrost re-routed to the fallback model, and the event is logged in Observability — not hidden.",
    expect: "1 fallback event: gpt-4o → claude-3-5-sonnet on the ONDC claim.",
    icon: TriangleAlert,
  },
  {
    id: 5,
    title: "Walk the four verdicts",
    seconds: "1:25 – 2:15",
    say: "Two supported, one partially supported because there is no single network-level ONDC fee, and the rupee rate flatly contradicted by dated FX evidence. Every card carries the full schema: title, URL, publication date, snippet, confidence, reasoning.",
    expect: "SUPPORTED, PARTIALLY SUPPORTED, SUPPORTED, CONTRADICTED.",
    icon: Search,
  },
  {
    id: 6,
    title: "Open the evidence drawer on the rupee claim",
    seconds: "2:15 – 2:30",
    say: "This is the stale-answer detector doing its job: the claim says ₹75, the newest dated source says around ₹92.7, and the 52-week range never went near ₹75.",
    expect: "Ranked sources with authority and recency scores, and an Unknown publication date on the live converter pages.",
    icon: FileText,
  },
  {
    id: 7,
    title: "Clear the human approval gate",
    seconds: "2:30 – 2:50",
    say: "Nothing has been written yet. The corrections sit in a staged side-by-side diff until a human clicks Approve & Apply. The original text is never overwritten.",
    expect: "Corrected answer appears only after approval; original preserved alongside it.",
    icon: UserCheck,
  },
  {
    id: 8,
    title: "Export the audit report",
    seconds: "2:50 – 3:00",
    say: "One Markdown file with every claim, verdict, citation, routing decision and the final approved text. That is the compliance artefact.",
    expect: "Markdown report downloads with the full schema and the [SIMULATED] disclosure.",
    icon: Download,
  },
];

const EXPECTED_VERDICTS: Verdict[] = DEMO_CLAIMS.map((c) => c.verdict);

export default function DemoPage() {
  const { runs, activeRunId, loadDemo, setActiveRun, hydrated } = useClaimGuard();
  const run = runs.find((r) => r.id === activeRunId) ?? runs[0];

  const isDemoRun = run?.source === "demo";
  const done = run?.timeline.filter((s) => s.state === "done").length ?? 0;
  const verdicts = run?.verdicts ?? [];
  const fallbacks = run?.verdicts.filter((v) => v.routing.fallbackUsed).length ?? 0;
  const approvedAny = verdicts.some((v) => v.decision === "approved");
  const applied = Boolean(run?.correctedText);

  const checklist = [
    { id: 1, ok: isDemoRun && (run?.claims.length ?? 0) === 4, detail: `${run?.claims.length ?? 0}/4 claims` },
    { id: 2, ok: done === 10, detail: `${done}/10 steps done` },
    {
      id: 3,
      ok: verdicts.filter((v) => v.routing.tier === "FAST").length >= 2 && verdicts.filter((v) => v.routing.tier === "REASONING").length >= 2,
      detail: `${verdicts.filter((v) => v.routing.tier === "FAST").length} fast · ${verdicts.filter((v) => v.routing.tier === "REASONING").length} reasoning`,
    },
    { id: 4, ok: fallbacks >= 1, detail: `${fallbacks} fallback event(s)` },
    {
      id: 5,
      ok: EXPECTED_VERDICTS.every((v, i) => verdicts[i]?.verdict === v),
      detail: verdicts.map((v) => VERDICT_META[v.verdict].short).join(" · ") || "—",
    },
    { id: 6, ok: (verdicts.find((v) => v.verdict === "CONTRADICTED")?.evidence.length ?? 0) >= 3, detail: "FX sources ranked" },
    { id: 7, ok: approvedAny || applied, detail: applied ? "applied" : approvedAny ? "approved" : "awaiting" },
    { id: 8, ok: applied, detail: applied ? "exportable" : "not applied yet" },
  ];
  const completed = checklist.filter((c) => c.ok).length;

  return (
    <div className="mx-auto w-full max-w-[1360px] px-4 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow">For judges</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-navy-800 sm:text-3xl">3-minute walkthrough</h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-navy-800/65">
            A timed script with the exact line to say at each step and what the screen should show. The checklist below
            ticks itself off from live run state, so you can prove each claim as you go.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="accent"
            onClick={() => {
              const id = loadDemo();
              setActiveRun(id);
              window.location.assign("/verify");
            }}
          >
            <Sparkles className="h-4 w-4" />
            Run the demo now
          </Button>
          <Link href="/verify">
            <Button variant="outline">
              Open workspace
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>

      {/* ------------------------------------------------------- live checklist */}
      <section className="shell-panel mt-5 overflow-hidden">
        <header className="flex flex-wrap items-center gap-3 border-b border-[#EDF1F6] px-5 py-4">
          <ShieldCheck className="h-4 w-4 text-accent-600" />
          <h2 className="text-sm font-semibold text-navy-800">Live proof checklist</h2>
          <Badge variant={completed === checklist.length ? "supported" : "outline"}>
            {completed}/{checklist.length} verified
          </Badge>
          <div className="ml-auto w-40">
            <Progress value={(completed / checklist.length) * 100} />
          </div>
        </header>
        <ul className="grid gap-px bg-[#F1F5F9] sm:grid-cols-2">
          {checklist.map((c, i) => (
            <li key={c.id} className="flex items-start gap-2.5 bg-white px-5 py-3">
              {c.ok ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-verdict-supported" />
              ) : (
                <CircleDashed className="mt-0.5 h-4 w-4 shrink-0 text-navy-800/30" />
              )}
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold text-navy-800">
                  {i + 1}. {SCRIPT[i].title}
                </span>
                <span className="block font-mono text-[11px] text-navy-800/55">{c.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      {!hydrated ? (
        <div className="shell-panel mt-5 flex items-center gap-3 px-5 py-8">
          <Loader2 className="h-4 w-4 animate-spin text-accent-600" />
          <p className="text-sm text-navy-800/60">Loading…</p>
        </div>
      ) : (
        <>
          {/* ------------------------------------------------------------ input */}
          <section className="shell-panel mt-5 px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-navy-800">The answer under test</h2>
              <Badge variant="outline">4 claims · 1 paragraph</Badge>
            </div>
            <p className="mt-2 rounded-md border border-[#EDF1F6] bg-slate-50/70 px-4 py-3 text-[15px] leading-relaxed text-navy-800">
              “{DEMO_LLM_OUTPUT}”
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {DEMO_CLAIMS.map((c, i) => {
                const actual = verdicts[i];
                return (
                  <div key={c.originalClaim} className="rounded-md border border-[#EDF1F6] bg-white p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="grid h-5 w-5 place-items-center rounded bg-navy-800 font-mono text-[10px] font-bold text-white">
                        {i + 1}
                      </span>
                      <Badge variant="outline">{c.claimType}</Badge>
                      <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide text-navy-800/45">
                        expected
                      </span>
                      <VerdictBadge verdict={c.verdict} />
                    </div>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-navy-800">{c.originalClaim}</p>
                    {actual ? (
                      <p className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-navy-800/55">
                        <span className="font-semibold uppercase tracking-wide">actual</span>
                        <VerdictBadge verdict={actual.verdict} />
                        {actual.verdict === c.verdict ? (
                          <span className="text-verdict-supported">match</span>
                        ) : (
                          <span className="text-verdict-contradicted">differs</span>
                        )}
                      </p>
                    ) : (
                      <p className="mt-1.5 text-[11px] text-navy-800/40">Not verified yet in this session.</p>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* ------------------------------------------------------------ script */}
          <section className="mt-5 space-y-3">
            {SCRIPT.map((step, i) => {
              const item = checklist[i];
              return (
                <motion.article
                  key={step.id}
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-30px" }}
                  transition={{ duration: 0.22 }}
                  className={cn("shell-panel overflow-hidden border-l-4", item?.ok ? "border-l-verdict-supported" : "border-l-slate-200")}
                >
                  <div className="flex flex-wrap items-start gap-3 px-5 py-4">
                    <span
                      className={cn(
                        "grid h-9 w-9 shrink-0 place-items-center rounded-md",
                        item?.ok ? "bg-verdict-supported-soft text-verdict-supported" : "bg-navy-800 text-accent-300",
                      )}
                    >
                      <step.icon className="h-[1.15rem] w-[1.15rem]" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold text-navy-800">
                          {step.id}. {step.title}
                        </h3>
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[10px] text-navy-800/60">
                          <Clock className="h-3 w-3" />
                          {step.seconds}
                        </span>
                        {item?.ok ? <Badge variant="supported">proven</Badge> : null}
                      </div>
                      <p className="mt-1.5 text-[13.5px] leading-relaxed text-navy-800/80">
                        <span className="font-semibold text-navy-800">Say: </span>
                        {step.say}
                      </p>
                      <p className="mt-1.5 inline-flex items-start gap-1.5 rounded bg-accent-50/70 px-2.5 py-1.5 text-[12.5px] leading-relaxed text-accent-800">
                        <Gauge className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span>
                          <span className="font-semibold">Should show: </span>
                          {step.expect}
                        </span>
                      </p>
                    </div>
                  </div>
                </motion.article>
              );
            })}
          </section>

          {/* ----------------------------------------------------- closing notes */}
          <section className="mt-5 grid gap-4 lg:grid-cols-2">
            <Callout tone="warn" icon={<TriangleAlert className="h-4 w-4" />} title="If you have no API keys (the usual case)">
              Evidence comes from a real {CORPUS.length}-document corpus snapshot captured on {EVIDENCE_SNAPSHOT_DATE},
              searched client-side and badged [SIMULATED] everywhere it appears. Latency is simulated too. Add
              TAVILY_API_KEY and BIFROST_API_KEY in Settings and the same pipeline runs against live web search and a
              live gateway — no code change.
            </Callout>
            <Callout tone="good" icon={<ShieldCheck className="h-4 w-4" />} title="The line to end on">
              ClaimGuard never upgrades an unsourced claim, never invents a citation, and never writes a correction
              without a human clicking Approve &amp; Apply — and it does all of that while routing most claims to the
              cheapest model that can handle them.
            </Callout>
          </section>

          {run && applied ? (
            <section className="shell-panel mt-5 px-5 py-4">
              <h2 className="text-sm font-semibold text-navy-800">Final artefact</h2>
              <p className="mt-1 text-xs text-navy-800/60">
                The corrected answer was approved by a human at {run.completedAt ? new Date(run.completedAt).toLocaleString("en-IN") : "—"}.
              </p>
              <p className="mt-2 rounded border-l-2 border-verdict-supported bg-verdict-supported-soft/60 px-3 py-2 text-[13px] leading-relaxed text-navy-800 wrap-anywhere">
                {run.correctedText}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => downloadFile(`claimguard-${slugify(run.label)}.md`, runToMarkdown(run), "text/markdown")}
              >
                <Download className="h-3.5 w-3.5" />
                Export audit report
              </Button>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
