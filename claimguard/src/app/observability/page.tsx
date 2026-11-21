"use client";

import * as React from "react";
import Link from "next/link";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Activity, Coins, Cpu, Gauge, Loader2, Timer, TriangleAlert, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Callout, Progress, Separator, Stat } from "@/components/ui/feedback";
import { SimulatedBadge } from "@/components/verdict-badge";
import { aggregateFallbacks, useClaimGuard } from "@/lib/store";
import { BASELINE_MODEL, MODEL_PRICING, TIER_META } from "@/lib/verdicts";
import { budgetStatus } from "@/lib/adapters/bifrost";
import { formatDateTime, pctile, round, truncate, usd } from "@/lib/utils";

const TIER_HEX: Record<string, string> = { FAST: "#00B4D8", STANDARD: "#0093B4", REASONING: "#0B132B" };
const MODEL_HEX = ["#00B4D8", "#0B132B", "#0093B4", "#45699E", "#7B99C8", "#B45309"];

const tooltipStyle = {
  backgroundColor: "#0B132B",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 8,
  fontSize: 12,
  color: "#fff",
  padding: "8px 10px",
} as const;

export default function ObservabilityPage() {
  const runs = useClaimGuard((s) => s.runs);
  const fallbackLog = useClaimGuard((s) => s.fallbackLog);
  const settings = useClaimGuard((s) => s.settings);
  const hydrated = useClaimGuard((s) => s.hydrated);
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => setMounted(true), []);

  const claims = React.useMemo(
    () =>
      runs.flatMap((r) =>
        r.verdicts.map((v) => ({
          runId: r.id,
          runLabel: r.label,
          claimText: r.claims.find((c) => c.id === v.claimId)?.originalClaim ?? "",
          ...v.routing,
        })),
      ),
    [runs],
  );

  const totals = React.useMemo(() => {
    const actual = runs.reduce((a, r) => a + r.totals.actualCostUsd, 0);
    const baseline = runs.reduce((a, r) => a + r.totals.baselineCostUsd, 0);
    const tokensIn = runs.reduce((a, r) => a + r.totals.tokensIn, 0);
    const tokensOut = runs.reduce((a, r) => a + r.totals.tokensOut, 0);
    const cacheHits = runs.reduce((a, r) => a + r.totals.cacheHits, 0);
    const offFrontier = runs.reduce((a, r) => a + r.totals.tokensSavedVsBaseline, 0);
    const latencies = claims.map((c) => c.latencyMs);
    return {
      actual,
      baseline,
      saved: Math.max(0, baseline - actual),
      savedPercent: baseline > 0 ? round((Math.max(0, baseline - actual) / baseline) * 100, 1) : 0,
      tokensIn,
      tokensOut,
      cacheHits,
      offFrontier,
      p50: pctile(latencies, 50),
      p95: pctile(latencies, 95),
      claimCount: claims.length,
      runCount: runs.length,
    };
  }, [runs, claims]);

  const costByRun = React.useMemo(
    () =>
      runs
        .filter((r) => r.totals.claims > 0)
        .slice(0, 10)
        .map((r) => ({
          name: truncate(r.label, 18),
          routed: round(r.totals.actualCostUsd, 6),
          baseline: round(r.totals.baselineCostUsd, 6),
        })),
    [runs],
  );

  const modelDistribution = React.useMemo(() => {
    const map = new Map<string, number>();
    claims.forEach((c) => map.set(c.usedModel, (map.get(c.usedModel) ?? 0) + 1));
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [claims]);

  const tierDistribution = React.useMemo(() => {
    const map = new Map<string, number>();
    claims.forEach((c) => map.set(c.tier, (map.get(c.tier) ?? 0) + 1));
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [claims]);

  const latencySeries = React.useMemo(
    () =>
      claims.slice(-24).map((c, i) => ({
        name: `#${i + 1}`,
        latency: c.latencyMs,
        tier: c.tier,
        model: c.usedModel,
        claim: truncate(c.claimText, 48),
      })),
    [claims],
  );

  const fallbacks = React.useMemo(() => aggregateFallbacks(runs, fallbackLog), [runs, fallbackLog]);
  const budget = budgetStatus(settings.bifrost);
  const anySimulated = claims.some((c) => c.mode === "simulated");

  if (!hydrated) {
    return (
      <div className="mx-auto flex max-w-[1360px] items-center gap-3 px-4 py-16">
        <Loader2 className="h-4 w-4 animate-spin text-accent-600" />
        <p className="text-sm text-navy-800/60">Loading observability data…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1360px] px-4 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow">Bifrost routing · cost · latency</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-navy-800 sm:text-3xl">Observability</h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-navy-800/65">
            Every routing decision ClaimGuard made, what it cost, and how much the unrouted all-frontier baseline would
            have cost instead.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {anySimulated ? <SimulatedBadge label="SIMULATED accounting" /> : null}
          <Link href="/settings">
            <Button variant="outline" size="sm">
              <Cpu className="h-3.5 w-3.5" />
              Routing policy
            </Button>
          </Link>
        </div>
      </div>

      {claims.length === 0 ? (
        <div className="shell-panel mt-6 px-5 py-14 text-center">
          <Activity className="mx-auto h-8 w-8 text-navy-800/25" />
          <h3 className="mt-3 text-base font-semibold text-navy-800">No routing data yet</h3>
          <p className="mx-auto mt-1.5 max-w-lg text-sm leading-relaxed text-navy-800/60">
            Run a verification and this dashboard fills with per-claim routing decisions, cost deltas, latency
            percentiles and the fallback event log.
          </p>
          <Link href="/verify" className="mt-4 inline-block">
            <Button variant="accent">
              <Zap className="h-4 w-4" />
              Run the demo
            </Button>
          </Link>
        </div>
      ) : (
        <>
          {/* ------------------------------------------------------- key stats */}
          <section className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Cost saved vs baseline"
              value={usd(totals.saved, 4)}
              sub={`${totals.savedPercent}% of ${usd(totals.baseline, 4)}`}
              tone="good"
              icon={<Coins className="h-3.5 w-3.5 text-navy-800/40" />}
            />
            <Stat
              label="Actual spend"
              value={usd(totals.actual, 4)}
              sub={`${totals.runCount} run(s) · ${totals.claimCount} claim(s)`}
              icon={<Gauge className="h-3.5 w-3.5 text-navy-800/40" />}
            />
            <Stat
              label="Latency P50 / P95"
              value={`${totals.p50} / ${totals.p95}`}
              sub="milliseconds per claim"
              icon={<Timer className="h-3.5 w-3.5 text-navy-800/40" />}
            />
            <Stat
              label="Tokens off frontier"
              value={totals.offFrontier.toLocaleString("en-IN")}
              sub={`${totals.cacheHits} cache hit(s) · ${totals.tokensIn} in / ${totals.tokensOut} out`}
              tone="warn"
              icon={<Cpu className="h-3.5 w-3.5 text-navy-800/40" />}
            />
          </section>

          {/* ---------------------------------------------------- budget meter */}
          <section className="shell-panel mt-5 px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-navy-800">Monthly budget cap</h2>
                <p className="text-xs text-navy-800/60">
                  Spend is enforced, not advisory — once the cap is hit, Bifrost calls stop and affected claims become
                  UNVERIFIABLE rather than silently degrading.
                </p>
              </div>
              <div className="text-right">
                <div className="font-mono text-lg font-semibold tabular-nums text-navy-800">
                  {usd(budget.spent, 4)} <span className="text-sm text-navy-800/45">/ {usd(budget.cap, 2)}</span>
                </div>
                <div className="text-[11px] text-navy-800/55">{round(budget.usedPercent, 1)}% used</div>
              </div>
            </div>
            <Progress
              value={budget.usedPercent}
              className="mt-3 h-2.5"
              indicatorClassName={budget.usedPercent > 85 ? "bg-verdict-contradicted" : budget.usedPercent > 60 ? "bg-amber-500" : "bg-accent-500"}
            />
            {budget.exceeded ? (
              <Callout tone="bad" className="mt-3" icon={<TriangleAlert className="h-4 w-4" />} title="Budget cap reached">
                Further Bifrost calls will be refused until you raise the cap in Settings.
              </Callout>
            ) : null}
          </section>

          {/* --------------------------------------------------------- charts */}
          <section className="mt-5 grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Routed cost vs unrouted frontier baseline</CardTitle>
                <p className="text-xs text-navy-800/60">
                  Baseline assumes every claim went to <span className="font-mono">{BASELINE_MODEL}</span>.
                </p>
              </CardHeader>
              <CardContent>
                {mounted ? (
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={costByRun} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#EDF1F6" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#475569" }} interval={0} angle={-18} textAnchor="end" height={54} />
                      <YAxis tick={{ fontSize: 10, fill: "#475569" }} tickFormatter={(v: number) => `$${v.toFixed(4)}`} width={62} />
                      <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => `$${Number(v).toFixed(6)}`} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="baseline" name="Unrouted baseline" fill="#CBD5E1" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="routed" name="ClaimGuard routed" fill="#00B4D8" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[240px] animate-pulse-soft rounded bg-slate-100" />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Model distribution</CardTitle>
                <p className="text-xs text-navy-800/60">Claims handled per model after routing and fallback.</p>
              </CardHeader>
              <CardContent>
                {mounted ? (
                  <ResponsiveContainer width="100%" height={240}>
                    <PieChart>
                      <Pie
                        data={modelDistribution}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={54}
                        outerRadius={86}
                        paddingAngle={2}
                        stroke="#fff"
                        strokeWidth={2}
                      >
                        {modelDistribution.map((entry, i) => (
                          <Cell key={entry.name} fill={MODEL_HEX[i % MODEL_HEX.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={tooltipStyle} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[240px] animate-pulse-soft rounded bg-slate-100" />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Latency per claim</CardTitle>
                <p className="text-xs text-navy-800/60">
                  Last {latencySeries.length} claim(s) with P50 and P95 reference lines.
                </p>
              </CardHeader>
              <CardContent>
                {mounted ? (
                  <ResponsiveContainer width="100%" height={240}>
                    <LineChart data={latencySeries} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#EDF1F6" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#475569" }} />
                      <YAxis tick={{ fontSize: 10, fill: "#475569" }} width={52} />
                      <Tooltip
                        contentStyle={tooltipStyle}
                        formatter={(v: number) => [`${v} ms`, "Latency"]}
                        labelFormatter={(_l, payload) => {
                          const p = payload?.[0]?.payload as { claim?: string; model?: string } | undefined;
                          return p ? `${p.model} · ${p.claim}` : "";
                        }}
                      />
                      <ReferenceLine y={totals.p50} stroke="#15803D" strokeDasharray="4 4" label={{ value: `P50 ${totals.p50}ms`, fontSize: 10, fill: "#15803D", position: "insideTopRight" }} />
                      <ReferenceLine y={totals.p95} stroke="#B91C1C" strokeDasharray="4 4" label={{ value: `P95 ${totals.p95}ms`, fontSize: 10, fill: "#B91C1C", position: "insideBottomRight" }} />
                      <Line type="monotone" dataKey="latency" stroke="#00B4D8" strokeWidth={2} dot={{ r: 3, fill: "#00B4D8" }} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[240px] animate-pulse-soft rounded bg-slate-100" />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Routing tier split</CardTitle>
                <p className="text-xs text-navy-800/60">Which tier absorbed the traffic.</p>
              </CardHeader>
              <CardContent>
                {mounted ? (
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={tierDistribution} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#EDF1F6" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 10, fill: "#475569" }} allowDecimals={false} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "#334155" }} width={92} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Bar dataKey="value" name="Claims" radius={[0, 4, 4, 0]} barSize={26}>
                        {tierDistribution.map((entry) => (
                          <Cell key={entry.name} fill={TIER_HEX[entry.name] ?? "#00B4D8"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[240px] animate-pulse-soft rounded bg-slate-100" />
                )}
                <div className="mt-3 space-y-1.5">
                  {(["FAST", "STANDARD", "REASONING"] as const).map((t) => (
                    <p key={t} className="text-[11.5px] leading-snug text-navy-800/60">
                      <span className="font-semibold" style={{ color: TIER_HEX[t] }}>
                        {TIER_META[t].label}:
                      </span>{" "}
                      {TIER_META[t].blurb}
                    </p>
                  ))}
                </div>
              </CardContent>
            </Card>
          </section>

          {/* -------------------------------------------------- fallback events */}
          <section className="shell-panel mt-5 overflow-hidden">
            <header className="flex flex-wrap items-center gap-2 border-b border-[#EDF1F6] px-5 py-4">
              <TriangleAlert className="h-4 w-4 text-amber-600" />
              <h2 className="text-sm font-semibold text-navy-800">Bifrost fallback event log</h2>
              <Badge variant={fallbacks.length > 0 ? "partial" : "outline"}>{fallbacks.length} event(s)</Badge>
            </header>
            {fallbacks.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-navy-800/55">
                No fallback events recorded. Turn on <span className="font-semibold">Simulate fallback</span> in
                Settings and re-run the demo to watch one fire on a high-risk claim.
              </p>
            ) : (
              <div className="scrollbar-thin overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-[13px]">
                  <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-navy-800/55">
                    <tr>
                      <th className="px-5 py-2.5 font-semibold">When</th>
                      <th className="px-3 py-2.5 font-semibold">Claim</th>
                      <th className="px-3 py-2.5 font-semibold">Route</th>
                      <th className="px-3 py-2.5 font-semibold">Reason</th>
                      <th className="px-5 py-2.5 font-semibold">Mode</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F1F5F9]">
                    {fallbacks.map((f) => (
                      <tr key={`${f.claimId}-${f.at}`} className="align-top hover:bg-slate-50/60">
                        <td className="whitespace-nowrap px-5 py-2.5 font-mono text-[11px] text-navy-800/60">
                          {formatDateTime(f.at)}
                        </td>
                        <td className="max-w-[280px] px-3 py-2.5 text-navy-800/80 wrap-anywhere">{truncate(f.claimText, 70)}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[11px]">
                          <span className="text-verdict-contradicted line-through">{f.from}</span>
                          <span className="mx-1 text-navy-800/40">→</span>
                          <span className="text-verdict-supported">{f.to}</span>
                        </td>
                        <td className="max-w-[280px] px-3 py-2.5 text-navy-800/65 wrap-anywhere">{f.reason}</td>
                        <td className="px-5 py-2.5">
                          {f.mode === "simulated" ? <SimulatedBadge /> : <Badge variant="accent">live</Badge>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* ------------------------------------------------- routing decisions */}
          <section className="shell-panel mt-5 overflow-hidden">
            <header className="border-b border-[#EDF1F6] px-5 py-4">
              <h2 className="text-sm font-semibold text-navy-800">Per-claim routing decisions</h2>
              <p className="text-xs text-navy-800/60">
                Every decision, in order. Cost is computed from the Bifrost pricing table, not estimated.
              </p>
            </header>
            <div className="scrollbar-thin overflow-x-auto">
              <table className="w-full min-w-[860px] text-left text-[13px]">
                <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-navy-800/55">
                  <tr>
                    <th className="px-5 py-2.5 font-semibold">Claim</th>
                    <th className="px-3 py-2.5 font-semibold">Tier</th>
                    <th className="px-3 py-2.5 font-semibold">Model used</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Tokens</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Latency</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Actual</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Baseline</th>
                    <th className="px-5 py-2.5 text-right font-semibold">Saved</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F1F5F9]">
                  {claims.slice(0, 40).map((c, i) => (
                    <tr key={`${c.runId}-${i}`} className="align-top hover:bg-slate-50/60">
                      <td className="max-w-[300px] px-5 py-2.5 text-navy-800/80 wrap-anywhere">
                        {truncate(c.claimText, 64)}
                        {c.cacheHit ? <Badge variant="accent" className="ml-2">cache</Badge> : null}
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className="inline-block rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase text-white"
                          style={{ backgroundColor: TIER_HEX[c.tier] ?? "#00B4D8" }}
                        >
                          {c.tier}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[11px] text-navy-800/75">
                        {c.usedModel}
                        {c.fallbackUsed ? <span className="ml-1 text-amber-700">↩</span> : null}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono text-[11px] tabular-nums text-navy-800/70">
                        {c.tokensIn}+{c.tokensOut}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono text-[11px] tabular-nums text-navy-800/70">
                        {c.latencyMs}ms
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono text-[11px] tabular-nums text-navy-800/70">
                        {usd(c.actualCostUsd, 6)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono text-[11px] tabular-nums text-navy-800/45">
                        {usd(c.baselineCostUsd, 6)}
                      </td>
                      <td className="whitespace-nowrap px-5 py-2.5 text-right font-mono text-[11px] tabular-nums font-semibold text-verdict-supported">
                        {usd(Math.max(0, c.baselineCostUsd - c.actualCostUsd), 6)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t border-[#EDF1F6] px-5 py-3">
              <Separator className="mb-3" />
              <p className="eyebrow mb-2">Pricing table in use ($ per 1M tokens)</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(MODEL_PRICING).map(([model, p]) => (
                  <span key={model} className="rounded border border-[#E2E8F0] bg-white px-2.5 py-1 font-mono text-[11px] text-navy-800/70">
                    {model} · in {p.inputPerM} · out {p.outputPerM}
                  </span>
                ))}
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
