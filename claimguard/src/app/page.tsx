"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Activity,
  ArrowRight,
  Braces,
  CheckCircle2,
  Clock3,
  Database,
  GitBranch,
  HelpCircle,
  Layers,
  Lock,
  Router,
  Scale,
  Search,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  XCircle,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Callout, Separator } from "@/components/ui/feedback";
import { VerdictLegend } from "@/components/verdict-badge";
import { useClaimGuard } from "@/lib/store";
import { CORPUS, DEMO_CLAIMS, DEMO_LLM_OUTPUT, EVIDENCE_SNAPSHOT_DATE } from "@/lib/seed";
import { VERDICT_META } from "@/lib/verdicts";
import { cn } from "@/lib/utils";

const GUARDRAILS = [
  {
    icon: ShieldCheck,
    title: "Never present an unverified claim as verified",
    body: "A claim with no retrieved evidence is UNVERIFIABLE. There is no path in the code that upgrades it.",
  },
  {
    icon: Lock,
    title: "The original text is immutable",
    body: "Corrections are written to a separate field. The original LLM output is preserved byte-for-byte in every export.",
  },
  {
    icon: Scale,
    title: "Human-in-the-loop is mandatory",
    body: "Suggested corrections sit in a staged diff. Only an explicit Approve & Apply writes the corrected answer.",
  },
  {
    icon: Database,
    title: "Zero fabricated citations",
    body: "No invented URLs, dates or statistics. Simulated evidence comes from a real, dated corpus snapshot and is badged [SIMULATED].",
  },
];

const SCREENS = [
  { href: "/verify", label: "Verify", desc: "Paste or upload an LLM answer, watch the 10-step agent run, review every claim.", icon: Zap },
  { href: "/observability", label: "Observability", desc: "Bifrost routing, cost saved, latency P50/P95, fallback log, budget meter.", icon: Activity },
  { href: "/batch", label: "Batch", desc: "Verify many answers in parallel and export one combined report.", icon: Layers },
  { href: "/history", label: "History", desc: "Persisted audit trail, filterable by verdict, exportable as JSON or Markdown.", icon: Database },
  { href: "/demo", label: "Judge walkthrough", desc: "A guided 3-minute script with expected verdicts at each step.", icon: Sparkles },
  { href: "/settings", label: "Settings", desc: "API keys, routing policy, budget cap, simulated-fallback toggle.", icon: Router },
];

const VERDICT_ICON = {
  SUPPORTED: CheckCircle2,
  PARTIALLY_SUPPORTED: TriangleAlert,
  STALE: Clock3,
  CONTRADICTED: XCircle,
  UNVERIFIABLE: HelpCircle,
} as const;

export default function LandingPage() {
  const loadDemo = useClaimGuard((s) => s.loadDemo);
  const setActiveRun = useClaimGuard((s) => s.setActiveRun);
  const settings = useClaimGuard((s) => s.settings);
  const hydrated = useClaimGuard((s) => s.hydrated);

  const live =
    (process.env.NEXT_PUBLIC_TAVILY_API_KEY ?? "").length > 0 ||
    settings.tavily.apiKey.trim().length > 0;

  return (
    <div>
      {/* ---------------------------------------------------------------- hero */}
      <section className="relative overflow-hidden bg-navy-800">
        <div className="grid-noise absolute inset-0 opacity-40" aria-hidden />
        <div
          className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-accent-500/20 blur-3xl"
          aria-hidden
        />
        <div className="relative mx-auto w-full max-w-[1360px] px-4 py-16 sm:py-20">
          <div className="grid items-start gap-10 lg:grid-cols-[1.15fr_1fr]">
            <div>
              <Badge variant="onDark" className="mb-4">
                Global AI Hackathon · HackCulture
              </Badge>
              <h1 className="text-3xl font-bold leading-[1.12] tracking-tight text-white sm:text-5xl">
                ClaimGuard turns uncertain AI answers into{" "}
                <span className="text-accent-300">evidence-backed, source-linked, human-approved</span> answers.
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-relaxed text-white/70 sm:text-lg">
                Every atomic claim in an LLM answer is extracted, risk-scored, routed to the cheapest model that can
                handle it, and checked against live dated evidence. Then — and only then — a human decides what gets
                published.
              </p>

              <div className="mt-7 flex flex-wrap items-center gap-3">
                <Button
                  variant="accent"
                  size="lg"
                  onClick={() => {
                    const id = loadDemo();
                    setActiveRun(id);
                    window.location.assign("/verify");
                  }}
                >
                  <Zap className="h-4 w-4" />
                  Load Official Hackathon Demo
                </Button>
                <Link href="/verify">
                  <Button variant="onDark" size="lg">
                    Verify your own answer
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              </div>

              <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-white/55">
                <span className="inline-flex items-center gap-1.5">
                  <Search className="h-3.5 w-3.5 text-accent-300" />
                  Tavily · stale-answer detection
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Router className="h-3.5 w-3.5 text-accent-300" />
                  Bifrost by Maxim AI · tiered routing
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Braces className="h-3.5 w-3.5 text-accent-300" />
                  {hydrated && live ? "Live adapters configured" : `[SIMULATED] mode · ${CORPUS.length}-doc seeded corpus`}
                </span>
              </div>
            </div>

            {/* verdict taxonomy card */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35 }}
              className="rounded-lg border border-white/10 bg-white p-5 shadow-2xl"
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-navy-800">The strict 5-verdict taxonomy</h2>
                <Badge variant="outline">closed set</Badge>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-navy-800/60">
                Every extracted claim receives exactly one verdict. There is no sixth option and no free-text verdict.
              </p>
              <ul className="mt-4 space-y-2">
                {(Object.keys(VERDICT_META) as Array<keyof typeof VERDICT_META>).map((v) => {
                  const meta = VERDICT_META[v];
                  const Icon = VERDICT_ICON[v];
                  return (
                    <li key={v} className="flex items-start gap-2.5 rounded-md px-2 py-1.5" style={{ backgroundColor: meta.softHex }}>
                      <Icon className="mt-0.5 h-4 w-4 shrink-0" style={{ color: meta.hex }} />
                      <span className="min-w-0">
                        <span className="block text-[13px] font-semibold" style={{ color: meta.hex }}>
                          {meta.label}
                        </span>
                        <span className="block text-[11.5px] leading-snug text-navy-800/65">{meta.description}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
              <Separator className="my-4" />
              <VerdictLegend />
            </motion.div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------- demo scenario */}
      <section className="mx-auto w-full max-w-[1360px] px-4 py-14">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow">One-click demo scenario</p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight text-navy-800">Four claims, four different verdicts</h2>
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-navy-800/65">
              The seeded scenario is a single LLM answer with one supported statistic, one over-generalised fee, one
              correct historical fact and one badly stale FX rate.
            </p>
          </div>
          <Button variant="outline" onClick={() => {
            const id = loadDemo();
            setActiveRun(id);
            window.location.assign("/verify");
          }}>
            <Zap className="h-4 w-4" />
            Run it
          </Button>
        </div>

        <Card className="mt-5">
          <CardContent className="pt-5">
            <div className="rounded-md border border-[#EDF1F6] bg-slate-50/70 px-4 py-3">
              <span className="eyebrow">Input LLM answer</span>
              <p className="mt-1.5 text-[15px] leading-relaxed text-navy-800">“{DEMO_LLM_OUTPUT}”</p>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {DEMO_CLAIMS.map((c, i) => {
                const meta = VERDICT_META[c.verdict];
                const Icon = VERDICT_ICON[c.verdict];
                return (
                  <div key={c.originalClaim} className="rounded-md border border-[#EDF1F6] bg-white p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="grid h-6 w-6 place-items-center rounded bg-navy-800 font-mono text-[11px] font-bold text-white">
                        {i + 1}
                      </span>
                      <Badge variant="outline">{c.claimType}</Badge>
                      {c.timeSensitive ? <Badge variant="partial">Time-sensitive</Badge> : null}
                      <span
                        className="ml-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide"
                        style={{ backgroundColor: meta.softHex, color: meta.hex }}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {meta.label}
                      </span>
                    </div>
                    <p className="mt-2 text-[13.5px] font-medium leading-relaxed text-navy-800">
                      {c.originalClaim}
                    </p>
                    <p className="mt-1.5 text-xs leading-relaxed text-navy-800/60">
                      Risk {c.riskScore}/100 → {c.routingTier === "FAST" ? "fast tier" : "reasoning tier"} · Tavily{" "}
                      {c.searchDepth} · confidence {c.confidenceScore}
                    </p>
                    {c.suggestedReplacement ? (
                      <p className="mt-2 rounded border-l-2 border-accent-300 bg-accent-50/60 px-3 py-1.5 text-[12.5px] leading-relaxed text-navy-800/80">
                        → {c.suggestedReplacement}
                      </p>
                    ) : (
                      <p className="mt-2 text-[12.5px] text-verdict-supported">No correction needed.</p>
                    )}
                  </div>
                );
              })}
            </div>

            <Callout tone="warn" className="mt-4" icon={<TriangleAlert className="h-4 w-4" />} title="Honest mock labelling">
              Without a TAVILY_API_KEY, evidence comes from a real {CORPUS.length}-document corpus snapshot captured on{" "}
              {EVIDENCE_SNAPSHOT_DATE} and every response is badged [SIMULATED]. Add keys in Settings to switch to live
              web search and live Bifrost routing — no code changes.
            </Callout>
          </CardContent>
        </Card>
      </section>

      {/* -------------------------------------------------------- architecture */}
      <section className="border-y border-[#E2E8F0] bg-white">
        <div className="mx-auto w-full max-w-[1360px] px-4 py-14">
          <p className="eyebrow">Partner integrations, not wrappers</p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-navy-800">Two deep integrations</h2>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <Card>
              <CardContent className="pt-5">
                <div className="flex items-center gap-2.5">
                  <span className="grid h-9 w-9 place-items-center rounded-md bg-accent-50 text-accent-700">
                    <Search className="h-[1.15rem] w-[1.15rem]" />
                  </span>
                  <div>
                    <h3 className="text-base font-semibold text-navy-800">Tavily · stale-answer detection</h3>
                    <p className="text-xs text-navy-800/60">src/lib/adapters/tavily.ts</p>
                  </div>
                </div>
                <ul className="mt-4 space-y-2.5 text-[13.5px] leading-relaxed text-navy-800/80">
                  {[
                    "Per-claim live web search — `basic` depth for low-risk claims, `advanced` for high-risk and time-sensitive ones.",
                    "Extracts source title, URL, publication date and a verbatim snippet for every hit.",
                    "Ranks sources on 0.45 × relevance + 0.30 × authority + 0.25 × recency; undated sources are penalised, never flattered.",
                    "Detects temporal staleness and direct contradiction by comparing the claim's own number against the newest dated evidence.",
                  ].map((t) => (
                    <li key={t} className="flex gap-2">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent-600" />
                      <span>{t}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-5">
                <div className="flex items-center gap-2.5">
                  <span className="grid h-9 w-9 place-items-center rounded-md bg-navy-800 text-accent-300">
                    <Router className="h-[1.15rem] w-[1.15rem]" />
                  </span>
                  <div>
                    <h3 className="text-base font-semibold text-navy-800">Bifrost by Maxim AI · tiered routing</h3>
                    <p className="text-xs text-navy-800/60">src/lib/adapters/bifrost.ts</p>
                  </div>
                </div>
                <ul className="mt-4 space-y-2.5 text-[13.5px] leading-relaxed text-navy-800/80">
                  {[
                    "OpenAI-compatible gateway client with configurable base URL, key and monthly USD budget cap that actually stops spend.",
                    "LOW/MEDIUM risk claims route to the fast, low-cost model; time-sensitive, financial and legal claims escalate to a frontier reasoning model.",
                    "Automatic fallback: when the primary model errors or times out, the call re-routes and a visible Bifrost Fallback Event is logged.",
                    "Semantic cache plus per-claim accounting — tokens, latency, cost, cache hits and every routing decision land in the audit trail.",
                  ].map((t) => (
                    <li key={t} className="flex gap-2">
                      <GitBranch className="mt-0.5 h-4 w-4 shrink-0 text-accent-600" />
                      <span>{t}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------- guardrails */}
      <section className="mx-auto w-full max-w-[1360px] px-4 py-14">
        <p className="eyebrow">Non-negotiable</p>
        <h2 className="mt-1 text-2xl font-bold tracking-tight text-navy-800">Four guardrails with zero exceptions</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {GUARDRAILS.map((g, i) => (
            <motion.div
              key={g.title}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.25, delay: i * 0.05 }}
              className={cn("shell-panel p-5")}
            >
              <div className="flex items-start gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-navy-800 text-accent-300">
                  <g.icon className="h-[1.15rem] w-[1.15rem]" />
                </span>
                <div>
                  <h3 className="text-sm font-semibold text-navy-800">{g.title}</h3>
                  <p className="mt-1 text-[13.5px] leading-relaxed text-navy-800/70">{g.body}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------------- screens */}
      <section className="border-t border-[#E2E8F0] bg-white">
        <div className="mx-auto w-full max-w-[1360px] px-4 py-14">
          <p className="eyebrow">Seven wired screens</p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-navy-800">No dead buttons</h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {SCREENS.map((s) => (
              <Link key={s.href} href={s.href} className="group">
                <div className="shell-panel h-full p-4 transition-all group-hover:border-accent-300 group-hover:shadow-md">
                  <div className="flex items-center gap-2.5">
                    <span className="grid h-8 w-8 place-items-center rounded-md bg-accent-50 text-accent-700">
                      <s.icon className="h-4 w-4" />
                    </span>
                    <h3 className="text-sm font-semibold text-navy-800">{s.label}</h3>
                    <ArrowRight className="ml-auto h-4 w-4 text-navy-800/25 transition-transform group-hover:translate-x-0.5 group-hover:text-accent-600" />
                  </div>
                  <p className="mt-2 text-[13px] leading-relaxed text-navy-800/65">{s.desc}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
