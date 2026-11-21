"use client";

import * as React from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Coins,
  Cpu,
  Eye,
  EyeOff,
  Info,
  RotateCcw,
  Router,
  Save,
  Search,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Callout, Separator, Stat } from "@/components/ui/feedback";
import { Field, Input, Select, Switch } from "@/components/ui/form";
import { DEFAULT_SETTINGS, useClaimGuard } from "@/lib/store";
import { budgetStatus, cacheSize, clearCache } from "@/lib/adapters/bifrost";
import { CORPUS, EVIDENCE_SNAPSHOT_DATE } from "@/lib/seed";
import { MODEL_PRICING } from "@/lib/verdicts";
import { round, usd } from "@/lib/utils";

const MODEL_OPTIONS = Object.keys(MODEL_PRICING);

function EnvBadge({ present, name }: { present: boolean; name: string }) {
  return present ? (
    <Badge variant="accent" title={`Loaded from the ${name} environment variable`}>
      <CheckCircle2 className="h-3 w-3" />
      env
    </Badge>
  ) : (
    <Badge variant="outline" title={`No ${name} set — enter a key below or leave it blank for [SIMULATED] mode`}>
      not set
    </Badge>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
  tone = "default",
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  tone?: "default" | "warn";
}) {
  return (
    <div className="flex items-start gap-3 rounded-md border border-[#EDF1F6] bg-white px-4 py-3">
      <Switch checked={checked} onCheckedChange={onChange} label={label} />
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-navy-800">{label}</p>
        <p className={tone === "warn" ? "text-xs leading-relaxed text-amber-800" : "text-xs leading-relaxed text-navy-800/60"}>
          {description}
        </p>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const { settings, hydrated, updateSettings, updateTavily, updateBifrost, resetSettings } = useClaimGuard();

  const [showTavily, setShowTavily] = React.useState(false);
  const [showBifrost, setShowBifrost] = React.useState(false);
  const [saved, setSaved] = React.useState<string | null>(null);
  const [cacheCount, setCacheCount] = React.useState(0);

  React.useEffect(() => {
    setCacheCount(cacheSize());
  }, [hydrated, settings.bifrost.cacheEnabled]);

  React.useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(null), 2600);
    return () => clearTimeout(t);
  }, [saved]);

  const envTavily = (process.env.NEXT_PUBLIC_TAVILY_API_KEY ?? "").length > 0;
  const envBifrost = (process.env.NEXT_PUBLIC_BIFROST_API_KEY ?? "").length > 0;
  const tavilyLive = envTavily || settings.tavily.apiKey.trim().length > 0;
  const bifrostLive = envBifrost || settings.bifrost.apiKey.trim().length > 0;
  const budget = budgetStatus(settings.bifrost);

  if (!hydrated) {
    return (
      <div className="mx-auto max-w-[1360px] px-4 py-16 text-sm text-navy-800/60">Loading settings…</div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1360px] px-4 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow">Configuration</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-navy-800 sm:text-3xl">
            API keys &amp; routing policy
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-navy-800/65">
            Keys entered here are stored in your browser&apos;s local storage and sent only to the Tavily and Bifrost
            endpoints. Set <span className="font-mono">TAVILY_API_KEY</span> and{" "}
            <span className="font-mono">BIFROST_API_KEY</span> as server-side environment variables for deployments —
            then keys never reach the browser.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              resetSettings();
              setSaved("Settings restored to defaults.");
            }}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset to defaults
          </Button>
        </div>
      </div>

      {saved ? (
        <Callout tone="good" className="mt-4" icon={<Save className="h-4 w-4" />}>
          {saved}
        </Callout>
      ) : null}

      <section className="mt-5 grid gap-3 sm:grid-cols-3">
        <Stat
          label="Tavily"
          value={tavilyLive ? "Live" : "[SIMULATED]"}
          sub={tavilyLive ? "Live web search per claim" : `${CORPUS.length}-doc corpus snapshot ${EVIDENCE_SNAPSHOT_DATE}`}
          tone={tavilyLive ? "good" : "warn"}
          icon={<Search className="h-3.5 w-3.5 text-navy-800/40" />}
        />
        <Stat
          label="Bifrost"
          value={bifrostLive ? "Live" : "[SIMULATED]"}
          sub={bifrostLive ? settings.bifrost.baseUrl : "Deterministic mock engine"}
          tone={bifrostLive ? "good" : "warn"}
          icon={<Router className="h-3.5 w-3.5 text-navy-800/40" />}
        />
        <Stat
          label="Budget this month"
          value={usd(budget.spent, 4)}
          sub={`cap ${usd(settings.bifrost.monthlyBudgetCapUsd, 2)} · ${round(budget.usedPercent, 1)}% used`}
          tone={budget.usedPercent > 85 ? "bad" : "default"}
          icon={<Coins className="h-3.5 w-3.5 text-navy-800/40" />}
        />
      </section>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {/* ------------------------------------------------------------ Tavily */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-accent-600" />
              <CardTitle>Tavily · stale-answer detection</CardTitle>
              <span className="ml-auto">
                <EnvBadge present={envTavily} name="TAVILY_API_KEY" />
              </span>
            </div>
            <p className="text-xs text-navy-800/60">src/lib/adapters/tavily.ts</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field
              label="Tavily API key"
              hint="Stored locally. Leave blank to run against the seeded corpus with [SIMULATED] badges."
            >
              <span className="relative block">
                <Input
                  type={showTavily ? "text" : "password"}
                  value={settings.tavily.apiKey}
                  onChange={(e) => updateTavily({ apiKey: e.target.value })}
                  placeholder="tvly-…"
                  className="pr-10 font-mono"
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={() => setShowTavily((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-navy-800/45 hover:text-navy-800"
                  aria-label={showTavily ? "Hide key" : "Show key"}
                >
                  {showTavily ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </span>
            </Field>

            <Field label="Max results per claim" hint="How many sources Tavily returns for each claim.">
              <Input
                type="number"
                min={1}
                max={10}
                value={settings.tavily.maxResults}
                onChange={(e) => updateTavily({ maxResults: Math.max(1, Math.min(10, Number(e.target.value) || 1)) })}
              />
            </Field>

            <ToggleRow
              label="Request raw page content"
              description="Ask Tavily for full page text as well as snippets. Costs more tokens; off by default."
              checked={settings.tavily.includeRawContent}
              onChange={(v) => updateTavily({ includeRawContent: v })}
            />

            <Callout tone="info" icon={<Info className="h-4 w-4" />}>
              Search depth is chosen per claim automatically: <span className="font-semibold">basic</span> for low-risk
              claims and <span className="font-semibold">advanced</span> once the risk score reaches{" "}
              {settings.advancedDepthRiskThreshold} or the claim is time-sensitive.
            </Callout>
          </CardContent>
        </Card>

        {/* ----------------------------------------------------------- Bifrost */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Cpu className="h-4 w-4 text-accent-600" />
              <CardTitle>Bifrost by Maxim AI · routing gateway</CardTitle>
              <span className="ml-auto">
                <EnvBadge present={envBifrost} name="BIFROST_API_KEY" />
              </span>
            </div>
            <p className="text-xs text-navy-800/60">src/lib/adapters/bifrost.ts</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Bifrost API key" hint="A Bifrost virtual key. Stored locally.">
              <span className="relative block">
                <Input
                  type={showBifrost ? "text" : "password"}
                  value={settings.bifrost.apiKey}
                  onChange={(e) => updateBifrost({ apiKey: e.target.value })}
                  placeholder="bf-…"
                  className="pr-10 font-mono"
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={() => setShowBifrost((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-navy-800/45 hover:text-navy-800"
                  aria-label={showBifrost ? "Hide key" : "Show key"}
                >
                  {showBifrost ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </span>
            </Field>

            <Field
              label="Gateway base URL"
              hint="Bifrost exposes an OpenAI-compatible API. Local default is http://localhost:8080/v1; use your hosted gateway for deployments."
            >
              <Input
                value={settings.bifrost.baseUrl}
                onChange={(e) => updateBifrost({ baseUrl: e.target.value })}
                placeholder="http://localhost:8080/v1"
                className="font-mono"
              />
            </Field>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Fast tier model" hint="LOW and MEDIUM risk claims.">
                <Select value={settings.bifrost.fastModel} onChange={(e) => updateBifrost({ fastModel: e.target.value })}>
                  {MODEL_OPTIONS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Standard tier model" hint="HIGH risk but not time-sensitive.">
                <Select
                  value={settings.bifrost.standardModel}
                  onChange={(e) => updateBifrost({ standardModel: e.target.value })}
                >
                  {MODEL_OPTIONS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Reasoning tier model" hint="Time-sensitive, financial and legal claims.">
                <Select
                  value={settings.bifrost.reasoningModel}
                  onChange={(e) => updateBifrost({ reasoningModel: e.target.value })}
                >
                  {MODEL_OPTIONS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Fallback model" hint="Used automatically when the primary fails.">
                <Select
                  value={settings.bifrost.fallbackModel}
                  onChange={(e) => updateBifrost({ fallbackModel: e.target.value })}
                >
                  {MODEL_OPTIONS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Monthly budget cap (USD)" hint="Hard stop — calls are refused once it is reached.">
                <Input
                  type="number"
                  min={0}
                  step={1}
                  value={settings.bifrost.monthlyBudgetCapUsd}
                  onChange={(e) => updateBifrost({ monthlyBudgetCapUsd: Math.max(0, Number(e.target.value) || 0) })}
                />
              </Field>
              <Field label="Request timeout (ms)" hint="After this the call re-routes to the fallback model.">
                <Input
                  type="number"
                  min={1000}
                  step={1000}
                  value={settings.bifrost.requestTimeoutMs}
                  onChange={(e) => updateBifrost({ requestTimeoutMs: Math.max(1000, Number(e.target.value) || 1000) })}
                />
              </Field>
            </div>

            <ToggleRow
              label="Simulate fallback"
              description="Forces the primary model to fail on the first high-risk claim of each run so judges can see a real Bifrost Fallback Event."
              checked={settings.bifrost.simulateFallback}
              onChange={(v) => updateBifrost({ simulateFallback: v })}
              tone="warn"
            />

            <ToggleRow
              label="Semantic caching"
              description={`Reuses an identical verdict payload instead of calling the gateway again. ${cacheCount} entr(y|ies) cached now.`}
              checked={settings.bifrost.cacheEnabled}
              onChange={(v) => updateBifrost({ cacheEnabled: v })}
            />

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  clearCache();
                  setCacheCount(0);
                  setSaved("Semantic cache cleared.");
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Clear semantic cache
              </Button>
              <span className="font-mono text-[11px] text-navy-800/50">{cacheCount} cached entr(y|ies)</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ------------------------------------------------------ routing policy */}
      <Card className="mt-4">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Router className="h-4 w-4 text-accent-600" />
            <CardTitle>Verification &amp; routing policy</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 lg:grid-cols-3">
            <ToggleRow
              label="Escalate high-risk claims"
              description="Time-sensitive, financial and legal claims go to the reasoning tier. Turn off to send everything to the fast tier (cheapest, least accurate)."
              checked={settings.escalateHighRisk}
              onChange={(v) => updateSettings({ escalateHighRisk: v })}
            />
            <ToggleRow
              label="Require human approval"
              description="Guardrail 5. Turning this off is not recommended: corrections would still be staged, but the gate would not block publishing."
              checked={settings.requireHumanApproval}
              onChange={(v) => updateSettings({ requireHumanApproval: v })}
              tone="warn"
            />
            <div className="rounded-md border border-[#EDF1F6] bg-white px-4 py-3">
              <p className="text-[13px] font-semibold text-navy-800">Advanced search threshold</p>
              <p className="text-xs leading-relaxed text-navy-800/60">
                Claims at or above this risk score get Tavily <span className="font-semibold">advanced</span> depth.
              </p>
              <Input
                type="number"
                min={10}
                max={95}
                className="mt-2"
                value={settings.advancedDepthRiskThreshold}
                onChange={(e) =>
                  updateSettings({ advancedDepthRiskThreshold: Math.max(10, Math.min(95, Number(e.target.value) || 60)) })
                }
              />
            </div>
          </div>

          <Separator />

          <div>
            <p className="eyebrow mb-2">Effective routing map</p>
            <div className="grid gap-2 sm:grid-cols-3">
              {[
                { tier: "LOW / MEDIUM risk", model: settings.bifrost.fastModel, hex: "#00B4D8" },
                { tier: "HIGH, stable", model: settings.escalateHighRisk ? settings.bifrost.standardModel : settings.bifrost.fastModel, hex: "#0093B4" },
                {
                  tier: "HIGH + time-sensitive / financial / legal",
                  model: settings.escalateHighRisk ? settings.bifrost.reasoningModel : settings.bifrost.fastModel,
                  hex: "#0B132B",
                },
              ].map((r) => (
                <div key={r.tier} className="rounded-md border border-[#EDF1F6] bg-slate-50/60 px-3 py-2.5">
                  <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: r.hex }} />
                  <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-navy-800/55">{r.tier}</p>
                  <p className="font-mono text-[13px] font-semibold text-navy-800">{r.model}</p>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-navy-800/55">
              Fallback for any tier: <span className="font-mono">{settings.bifrost.fallbackModel}</span> · unrouted
              baseline used for savings: <span className="font-mono">gpt-4o</span>
            </p>
          </div>

          <Separator />

          <div>
            <p className="eyebrow mb-2">Cost model ($ per 1M tokens)</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(MODEL_PRICING).map(([model, p]) => (
                <span
                  key={model}
                  className="rounded border border-[#E2E8F0] bg-white px-2.5 py-1 font-mono text-[11px] text-navy-800/70"
                >
                  {model} · in {p.inputPerM} · out {p.outputPerM}
                </span>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Callout tone="warn" className="mt-4" icon={<AlertTriangle className="h-4 w-4" />} title="[SIMULATED] disclosure">
        When either key is missing, the corresponding adapter runs a realistic mock flow — simulated latency,
        deterministic results, and a seeded corpus of {CORPUS.length} real documents captured on{" "}
        {EVIDENCE_SNAPSHOT_DATE}. Every simulated response is visibly badged [SIMULATED] in the timeline, on claim
        cards, in the evidence drawer, in Observability and in exports. Defaults restored by{" "}
        <button
          type="button"
          className="font-semibold underline underline-offset-2"
          onClick={() => {
            updateBifrost(DEFAULT_SETTINGS.bifrost);
            updateTavily(DEFAULT_SETTINGS.tavily);
            setSaved("Adapter settings restored.");
          }}
        >
          resetting adapter settings
        </button>
        .
      </Callout>
    </div>
  );
}
