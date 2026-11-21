"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ClipboardPaste,
  Download,
  FileUp,
  Loader2,
  RotateCcw,
  Sparkles,
  Trash2,
  Upload,
  Zap,
} from "lucide-react";
import { AgentTimeline } from "@/components/agent-timeline";
import { ApprovalGate } from "@/components/approval-gate";
import { ClaimCard } from "@/components/claim-card";
import { DiffView } from "@/components/diff-view";
import { EvidenceDrawerBody } from "@/components/evidence-drawer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout, Separator, Stat } from "@/components/ui/feedback";
import { ConfirmDialog, Sheet } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/form";
import { SimulatedBadge } from "@/components/verdict-badge";
import { useClaimGuard, buildCorrectedText } from "@/lib/store";
import { runToMarkdown, runToJson, slugify } from "@/lib/exporters";
import { CORPUS, DEMO_LLM_OUTPUT, EVIDENCE_SNAPSHOT_DATE } from "@/lib/seed";
import { cn, downloadFile, usd } from "@/lib/utils";
import { VERDICT_META } from "@/lib/verdicts";

const SAMPLES = [
  { label: "Official hackathon demo", text: DEMO_LLM_OUTPUT },
  {
    label: "Mixed: one stale, one unverifiable",
    text:
      "India's handloom sector employs over 35 lakh people. The company will probably dominate the market next quarter. Gadwal sarees received GI recognition in 2010.",
  },
  {
    label: "Time-sensitive financial claims",
    text:
      "The Indian rupee is currently trading at ₹75 per US dollar. The latest ONDC seller fee is 2%. Buyers should join the network today for the lowest fees.",
  },
];

export default function VerifyPage() {
  const {
    runs,
    activeRunId,
    settings,
    hydrated,
    startRun,
    loadDemo,
    cancelRun,
    setActiveRun,
    decideClaim,
    approveAllActionable,
    rejectAllPending,
    applyCorrections,
    revertCorrections,
  } = useClaimGuard();

  const [text, setText] = React.useState("");
  const [timelineOpen, setTimelineOpen] = React.useState(true);
  const [drawerClaimId, setDrawerClaimId] = React.useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [flash, setFlash] = React.useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const run = runs.find((r) => r.id === activeRunId);
  const running = run?.status === "running";

  const drawerClaim = run?.claims.find((c) => c.id === drawerClaimId) ?? null;
  const drawerVerdict = run?.verdicts.find((v) => v.claimId === drawerClaimId);

  const proposedText = React.useMemo(
    () => (run ? buildCorrectedText({ ...run, verdicts: run.verdicts }, "approved") : ""),
    [run],
  );
  const approvedCount = run?.verdicts.filter((v) => v.decision === "approved").length ?? 0;
  const rejectedCount = run?.verdicts.filter((v) => v.decision === "rejected").length ?? 0;
  const pendingCount = run?.verdicts.filter((v) => v.decision === "pending").length ?? 0;
  const stagedCount = run?.verdicts.filter((v) => v.suggestedReplacement).length ?? 0;

  React.useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 2600);
    return () => clearTimeout(t);
  }, [flash]);

  const handleRun = (value?: string) => {
    const body = (value ?? text).trim();
    if (!body) {
      setFlash("Paste or upload an LLM answer first.");
      return;
    }
    startRun(body, value === DEMO_LLM_OUTPUT ? "demo" : "paste", value === DEMO_LLM_OUTPUT ? "Pasted demo scenario" : "Pasted LLM answer");
    setTimelineOpen(true);
    setDrawerClaimId(null);
  };

  const handleFile = async (file: File) => {
    if (file.size > 512 * 1024) {
      setFlash("File too large — keep uploads under 512 KB.");
      return;
    }
    const body = await file.text();
    setText(body);
    startRun(body, "upload", file.name);
    setTimelineOpen(true);
  };

  const liveMode =
    (process.env.NEXT_PUBLIC_TAVILY_API_KEY ?? "").length > 0 || settings.tavily.apiKey.trim().length > 0;

  return (
    <div className="mx-auto w-full max-w-[1360px] px-4 py-8">
      {/* ------------------------------------------------------------- header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow">Core verification workspace</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-navy-800 sm:text-3xl">Verify an LLM answer</h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-navy-800/65">
            Paste an answer or upload a file. ClaimGuard extracts every atomic claim, routes each one through Bifrost,
            retrieves dated evidence via Tavily, and stages corrections for your approval.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {hydrated && !liveMode ? <SimulatedBadge label="SIMULATED evidence" /> : <Badge variant="accent">Live adapters</Badge>}
          {runs.length > 0 ? (
            <Button variant="outline" size="sm" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="h-3.5 w-3.5" />
              Clear all runs
            </Button>
          ) : null}
        </div>
      </div>

      {flash ? (
        <Callout tone="warn" className="mt-4" icon={<AlertTriangle className="h-4 w-4" />}>
          {flash}
        </Callout>
      ) : null}

      {/* -------------------------------------------------------- input panel */}
      <section className="shell-panel mt-5 overflow-hidden">
        <header className="flex flex-wrap items-center gap-2 border-b border-[#EDF1F6] px-5 py-3">
          <ClipboardPaste className="h-4 w-4 text-accent-600" />
          <h2 className="text-sm font-semibold text-navy-800">Step 1 · Provide the LLM output</h2>
          <span className="ml-auto font-mono text-[11px] tabular-nums text-navy-800/45">
            {text.trim() ? `${text.trim().split(/\s+/).length} words` : "empty"}
          </span>
        </header>

        <div className="px-5 py-4">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            placeholder="Paste the AI answer you want verified. Each sentence becomes an independently checked claim…"
            className="resize-y font-[inherit]"
            aria-label="LLM output to verify"
          />

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button variant="accent" onClick={() => handleRun()} disabled={running}>
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {running ? "Verifying…" : "Verify claims"}
            </Button>
            <Button
              variant="default"
              onClick={() => {
                setText(DEMO_LLM_OUTPUT);
                const id = loadDemo();
                setActiveRun(id);
                setTimelineOpen(true);
                setDrawerClaimId(null);
              }}
              disabled={running}
            >
              <Zap className="h-4 w-4" />
              Load Official Hackathon Demo
            </Button>
            <Button variant="outline" onClick={() => fileRef.current?.click()}>
              <FileUp className="h-4 w-4" />
              Upload .txt / .md
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".txt,.md,.markdown,text/plain,text/markdown"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
                e.target.value = "";
              }}
            />
            {running ? (
              <Button variant="ghost" onClick={() => run && cancelRun(run.id)}>
                Cancel run
              </Button>
            ) : null}
            {text ? (
              <Button variant="ghost" onClick={() => setText("")}>
                Clear input
              </Button>
            ) : null}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-navy-800/45">Try:</span>
            {SAMPLES.map((s) => (
              <button
                key={s.label}
                type="button"
                onClick={() => {
                  setText(s.text);
                  handleRun(s.text);
                }}
                className="rounded-full border border-[#E2E8F0] bg-white px-3 py-1 text-[11.5px] font-medium text-navy-800/70 transition-colors hover:border-accent-400 hover:text-accent-700"
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {!hydrated ? (
        <div className="shell-panel mt-5 flex items-center gap-3 px-5 py-8">
          <Loader2 className="h-4 w-4 animate-spin text-accent-600" />
          <p className="text-sm text-navy-800/60">Restoring your workspace from local storage…</p>
        </div>
      ) : !run ? (
        <div className="shell-panel mt-5 px-5 py-14 text-center">
          <Upload className="mx-auto h-8 w-8 text-navy-800/25" />
          <h3 className="mt-3 text-base font-semibold text-navy-800">No verification run yet</h3>
          <p className="mx-auto mt-1.5 max-w-lg text-sm leading-relaxed text-navy-800/60">
            Paste an LLM answer above, or load the official 4-claim demo scenario. The agent timeline, claim dashboard,
            evidence drawer and approval gate all appear here.
          </p>
          {!liveMode ? (
            <p className="mx-auto mt-3 max-w-lg text-xs leading-relaxed text-navy-800/50">
              No API key detected — evidence will come from the real {CORPUS.length}-document corpus snapshot captured{" "}
              {EVIDENCE_SNAPSHOT_DATE} and every response will be badged [SIMULATED]. Add keys in{" "}
              <Link href="/settings" className="font-semibold text-accent-700 underline underline-offset-2">
                Settings
              </Link>{" "}
              for live search.
            </p>
          ) : null}
        </div>
      ) : (
        <>
          {/* --------------------------------------------------- run summary */}
          <section className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Claims"
              value={run.totals.claims || run.claims.length}
              sub={run.simulated ? "[SIMULATED] evidence" : "Live evidence"}
            />
            <Stat
              label="Tokens in / out"
              value={`${run.totals.tokensIn} / ${run.totals.tokensOut}`}
              sub={`${run.totals.tokensSavedVsBaseline} routed off the frontier baseline`}
            />
            <Stat
              label="Cost vs baseline"
              value={usd(run.totals.actualCostUsd, 4)}
              sub={`saved ${usd(run.totals.costSavedUsd, 4)} vs ${usd(run.totals.baselineCostUsd, 4)}`}
              tone="good"
            />
            <Stat
              label="Fallbacks · cache hits"
              value={`${run.totals.fallbackEvents} · ${run.totals.cacheHits}`}
              sub={`P95 latency ${run.totals.p95LatencyMs} ms`}
              tone={run.totals.fallbackEvents > 0 ? "warn" : "default"}
            />
          </section>

          {/* ------------------------------------------------------- timeline */}
          <section className="mt-5">
            <AgentTimeline timeline={run.timeline} collapsed={!timelineOpen} onToggle={() => setTimelineOpen((v) => !v)} />
          </section>

          {run.error ? (
            <Callout tone="bad" className="mt-5" icon={<AlertTriangle className="h-4 w-4" />} title="Run failed">
              {run.error}
            </Callout>
          ) : null}

          {/* ------------------------------------------------ verdict summary */}
          {run.verdicts.length > 0 ? (
            <section className="shell-panel mt-5 px-5 py-4">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-sm font-semibold text-navy-800">Verdict distribution</h2>
                <Separator orientation="vertical" className="hidden h-5 sm:block" />
                <div className="flex flex-wrap gap-2">
                  {(Object.keys(run.totals.verdictCounts) as Array<keyof typeof run.totals.verdictCounts>).map((v) => {
                    const count = run.totals.verdictCounts[v];
                    if (count === 0) return null;
                    const meta = VERDICT_META[v];
                    return (
                      <span
                        key={v}
                        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide"
                        style={{ backgroundColor: meta.softHex, color: meta.hex }}
                      >
                        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: meta.hex }} />
                        {meta.label} · {count}
                      </span>
                    );
                  })}
                </div>
                <div className="ml-auto flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      downloadFile(`claimguard-${slugify(run.label)}.json`, runToJson(run), "application/json")
                    }
                  >
                    <Download className="h-3.5 w-3.5" />
                    JSON
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => downloadFile(`claimguard-${slugify(run.label)}.md`, runToMarkdown(run), "text/markdown")}
                  >
                    <Download className="h-3.5 w-3.5" />
                    Markdown
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => revertCorrections(run.id)} disabled={!run.correctedText}>
                    <RotateCcw className="h-3.5 w-3.5" />
                    Reset decisions
                  </Button>
                </div>
              </div>
            </section>
          ) : null}

          {/* ------------------------------------------------- claim dashboard */}
          <section className="mt-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-bold tracking-tight text-navy-800">Claim-by-claim dashboard</h2>
              <p className="text-xs text-navy-800/55">
                Ordered by verification priority · {run.claims.length} claim(s)
              </p>
            </div>

            {run.claims.length === 0 ? (
              <div className="shell-panel px-5 py-10 text-center">
                <Loader2 className="mx-auto h-6 w-6 animate-spin text-accent-600" />
                <p className="mt-2 text-sm text-navy-800/60">Extracting claims…</p>
              </div>
            ) : (
              run.claims.map((claim) => (
                <ClaimCard
                  key={claim.id}
                  claim={claim}
                  verdict={run.verdicts.find((v) => v.claimId === claim.id)}
                  disabled={running}
                  onApprove={() => decideClaim(run.id, claim.id, "approved")}
                  onReject={() => decideClaim(run.id, claim.id, "rejected")}
                  onUndo={() => decideClaim(run.id, claim.id, "pending")}
                  onOpenEvidence={() => setDrawerClaimId(claim.id)}
                />
              ))
            )}
          </section>

          {/* ------------------------------------------------------ diff + HITL */}
          {run.verdicts.length > 0 ? (
            <section className="mt-5 space-y-4">
              <DiffView
                originalText={run.originalText}
                correctedText={run.correctedText ?? proposedText}
                applied={Boolean(run.correctedText)}
                approvedCount={approvedCount}
                pendingCount={pendingCount}
              />
              <ApprovalGate
                run={run}
                stagedCount={stagedCount}
                approvedCount={approvedCount}
                rejectedCount={rejectedCount}
                pendingCount={pendingCount}
                onApply={() => {
                  applyCorrections(run.id);
                  setFlash("Corrections applied and saved to the audit trail.");
                }}
                onApproveAll={() => approveAllActionable(run.id)}
                onRejectAll={() => rejectAllPending(run.id)}
                onRevert={() => revertCorrections(run.id)}
              />
            </section>
          ) : null}

          {/* ------------------------------------------------- run history nav */}
          {runs.length > 1 ? (
            <section className="shell-panel mt-5 px-5 py-4">
              <h2 className="text-sm font-semibold text-navy-800">Recent runs</h2>
              <div className="mt-2 flex flex-wrap gap-2">
                {runs.slice(0, 8).map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setActiveRun(r.id)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-[11.5px] font-medium transition-colors",
                      r.id === run.id
                        ? "border-accent-500 bg-accent-50 text-accent-700"
                        : "border-[#E2E8F0] bg-white text-navy-800/65 hover:border-accent-400 hover:text-accent-700",
                    )}
                  >
                    {r.label.length > 34 ? `${r.label.slice(0, 34)}…` : r.label}
                  </button>
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}

      {/* ---------------------------------------------------- evidence drawer */}
      <Sheet
        open={Boolean(drawerClaim)}
        onOpenChange={(open) => {
          if (!open) setDrawerClaimId(null);
        }}
        title="Tavily evidence drawer"
        subtitle={drawerClaim ? `Claim #${drawerClaim.verificationPriority} · ${drawerClaim.searchDepth} search depth` : undefined}
      >
        {drawerClaim ? <EvidenceDrawerBody claim={drawerClaim} verdict={drawerVerdict} /> : null}
      </Sheet>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Clear every verification run?"
        description="This removes all runs, verdicts, evidence and the fallback log from local storage. Exported JSON and Markdown reports you already downloaded are unaffected."
        confirmLabel="Clear everything"
        onConfirm={() => {
          useClaimGuard.getState().clearHistory();
          setFlash("History cleared.");
        }}
      />
    </div>
  );
}
