"use client";

import * as React from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Download,
  FileUp,
  Layers,
  Loader2,
  Play,
  Trash2,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout, Progress, Stat } from "@/components/ui/feedback";
import { Field, Input, Textarea } from "@/components/ui/form";
import { ConfirmDialog } from "@/components/ui/sheet";
import { useClaimGuard } from "@/lib/store";
import { runsToMarkdown, slugify } from "@/lib/exporters";
import { VERDICT_META } from "@/lib/verdicts";
import { cn, downloadFile, usd } from "@/lib/utils";

const STATUS_META = {
  queued: { label: "Queued", className: "bg-slate-100 text-navy-800/60" },
  running: { label: "Running", className: "bg-accent-50 text-accent-700" },
  done: { label: "Done", className: "bg-verdict-supported-soft text-verdict-supported" },
  failed: { label: "Failed", className: "bg-verdict-contradicted-soft text-verdict-contradicted" },
} as const;

export default function BatchPage() {
  const {
    batchJobs,
    runs,
    hydrated,
    addBatchJob,
    removeBatchJob,
    clearBatchJobs,
    runBatch,
    setActiveRun,
  } = useClaimGuard();

  const [label, setLabel] = React.useState("");
  const [text, setText] = React.useState("");
  const [running, setRunning] = React.useState(false);
  const [confirmClear, setConfirmClear] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const doneJobs = batchJobs.filter((j) => j.status === "done");
  const progress = batchJobs.length === 0 ? 0 : (doneJobs.length / batchJobs.length) * 100;

  const batchRuns = React.useMemo(
    () => runs.filter((r) => batchJobs.some((j) => j.runId === r.id)),
    [runs, batchJobs],
  );

  const totals = React.useMemo(() => {
    const claims = batchRuns.reduce((a, r) => a + r.totals.claims, 0);
    const saved = batchRuns.reduce((a, r) => a + r.totals.costSavedUsd, 0);
    const actual = batchRuns.reduce((a, r) => a + r.totals.actualCostUsd, 0);
    const verdicts = batchRuns.reduce((a, r) => a + r.verdicts.length, 0);
    const flagged = batchRuns.reduce(
      (a, r) => a + r.verdicts.filter((v) => v.verdict !== "SUPPORTED").length,
      0,
    );
    return { claims, saved, actual, verdicts, flagged };
  }, [batchRuns]);

  const handleAdd = () => {
    const body = text.trim();
    if (!body) return;
    addBatchJob(label.trim() || `Batch item ${batchJobs.length + 1}`, body);
    setText("");
    setLabel("");
  };

  const handleFiles = async (files: FileList) => {
    for (const file of Array.from(files)) {
      if (file.size > 512 * 1024) continue;
      const body = await file.text();
      addBatchJob(file.name, body);
    }
  };

  const handleRunAll = async () => {
    setRunning(true);
    await runBatch();
    setRunning(false);
  };

  if (!hydrated) {
    return (
      <div className="mx-auto flex max-w-[1360px] items-center gap-3 px-4 py-16">
        <Loader2 className="h-4 w-4 animate-spin text-accent-600" />
        <p className="text-sm text-navy-800/60">Loading batch queue…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1360px] px-4 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow">Parallel verification</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-navy-800 sm:text-3xl">Batch verification</h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-navy-800/65">
            Queue several LLM answers, verify them all, then export one combined audit report. Each item becomes a full
            verification run with its own timeline, evidence and approval gate.
          </p>
        </div>
        {batchJobs.length > 0 ? (
          <Button variant="outline" size="sm" onClick={() => setConfirmClear(true)}>
            <Trash2 className="h-3.5 w-3.5" />
            Clear queue
          </Button>
        ) : null}
      </div>

      {/* ------------------------------------------------------------ enqueue */}
      <section className="shell-panel mt-5 overflow-hidden">
        <header className="flex items-center gap-2 border-b border-[#EDF1F6] px-5 py-3">
          <Layers className="h-4 w-4 text-accent-600" />
          <h2 className="text-sm font-semibold text-navy-800">Add LLM outputs to the queue</h2>
        </header>
        <div className="grid gap-4 px-5 py-4 lg:grid-cols-[1fr_1.6fr]">
          <Field label="Label (optional)" hint="Used in the combined report and in History.">
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Support macro — refunds"
              aria-label="Batch item label"
            />
          </Field>
          <Field label="LLM output" hint="One answer per item. Add as many as you like.">
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={5}
              placeholder="Paste an AI answer to queue for verification…"
              className="resize-y"
              aria-label="Batch item text"
            />
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-[#EDF1F6] px-5 py-3">
          <Button variant="accent" onClick={handleAdd} disabled={!text.trim()}>
            Add to queue
          </Button>
          <Button variant="outline" onClick={() => fileRef.current?.click()}>
            <FileUp className="h-4 w-4" />
            Upload multiple files
          </Button>
          <input
            ref={fileRef}
            type="file"
            multiple
            accept=".txt,.md,.markdown,text/plain,text/markdown"
            className="hidden"
            onChange={(e) => {
              if (e.target.files) void handleFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <span className="ml-auto text-xs text-navy-800/55">{batchJobs.length} item(s) queued</span>
        </div>
      </section>

      {/* --------------------------------------------------------------- queue */}
      <section className="shell-panel mt-5 overflow-hidden">
        <header className="flex flex-wrap items-center gap-3 border-b border-[#EDF1F6] px-5 py-4">
          <h2 className="text-sm font-semibold text-navy-800">Queue</h2>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button variant="accent" onClick={handleRunAll} disabled={running || batchJobs.length === 0}>
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {running ? "Running batch…" : `Run ${batchJobs.length || ""} item(s)`}
            </Button>
            <Button
              variant="outline"
              onClick={() => downloadFile(`claimguard-batch-${slugify(new Date().toISOString())}.md`, runsToMarkdown(batchRuns), "text/markdown")}
              disabled={batchRuns.length === 0}
            >
              <Download className="h-4 w-4" />
              Export combined report
            </Button>
          </div>
        </header>

        {batchJobs.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <Layers className="mx-auto h-8 w-8 text-navy-800/25" />
            <p className="mt-3 text-sm font-semibold text-navy-800">The queue is empty</p>
            <p className="mx-auto mt-1 max-w-md text-[13px] leading-relaxed text-navy-800/60">
              Add a few LLM answers above — for example, three different support macros — then run the batch and export
              a single combined audit report.
            </p>
          </div>
        ) : (
          <>
            <div className="border-b border-[#EDF1F6] bg-slate-50/60 px-5 py-3">
              <Progress value={progress} />
              <p className="mt-1.5 text-[11px] text-navy-800/55">
                {doneJobs.length} of {batchJobs.length} complete
              </p>
            </div>
            <ul className="divide-y divide-[#F1F5F9]">
              {batchJobs.map((job, i) => {
                const meta = STATUS_META[job.status];
                const jobRun = runs.find((r) => r.id === job.runId);
                return (
                  <li key={job.id} className="flex flex-wrap items-start gap-3 px-5 py-3.5">
                    <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded bg-navy-800 font-mono text-[11px] font-bold text-white">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold text-navy-800">{job.label}</h3>
                        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide", meta.className)}>
                          {meta.label}
                        </span>
                        {jobRun?.simulated ? <Badge variant="simulated">[SIMULATED]</Badge> : null}
                      </div>
                      <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-navy-800/65 wrap-anywhere">
                        {job.text}
                      </p>
                      {job.error ? (
                        <p className="mt-1 text-xs text-verdict-contradicted">{job.error}</p>
                      ) : null}
                      {jobRun ? (
                        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-navy-800/60">
                          <span className="font-mono">{jobRun.totals.claims} claims</span>
                          <span>·</span>
                          <span className="font-mono">{usd(jobRun.totals.actualCostUsd, 6)}</span>
                          <span>·</span>
                          <span>
                            {jobRun.verdicts
                              .filter((v) => v.verdict !== "SUPPORTED")
                              .map((v) => VERDICT_META[v.verdict].short)
                              .join(", ") || "all supported"}
                          </span>
                        </div>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {job.status === "done" ? <CheckCircle2 className="h-4 w-4 text-verdict-supported" /> : null}
                      {job.status === "failed" ? <XCircle className="h-4 w-4 text-verdict-contradicted" /> : null}
                      {job.status === "running" ? <Loader2 className="h-4 w-4 animate-spin text-accent-600" /> : null}
                      {jobRun ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setActiveRun(jobRun.id);
                            window.location.assign("/verify");
                          }}
                        >
                          Open run
                        </Button>
                      ) : null}
                      <Button variant="ghost" size="iconSm" onClick={() => removeBatchJob(job.id)} aria-label={`Remove ${job.label}`}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>

      {/* ------------------------------------------------------- batch totals */}
      {batchRuns.length > 0 ? (
        <>
          <section className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Runs completed" value={batchRuns.length} sub={`${batchJobs.length} queued`} />
            <Stat label="Claims verified" value={totals.claims} sub={`${totals.flagged} flagged for review`} tone={totals.flagged > 0 ? "warn" : "good"} />
            <Stat label="Actual spend" value={usd(totals.actual, 4)} sub="across the batch" />
            <Stat label="Saved vs baseline" value={usd(totals.saved, 4)} sub="tiered routing" tone="good" />
          </section>

          <Callout tone="info" className="mt-5">
            Each batch item is a normal verification run — open any of them to review its claims, evidence and approval
            gate, or visit{" "}
            <Link href="/history" className="font-semibold underline underline-offset-2">
              History
            </Link>{" "}
            to filter and export them.
          </Callout>
        </>
      ) : null}

      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title="Clear the batch queue?"
        description="This removes queued items only. Verification runs already created stay in History."
        confirmLabel="Clear queue"
        onConfirm={clearBatchJobs}
      />
    </div>
  );
}
