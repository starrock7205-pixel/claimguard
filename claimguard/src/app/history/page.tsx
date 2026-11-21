"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  CheckCircle2,
  ChevronDown,
  Database,
  Download,
  ExternalLink,
  FileUp,
  Loader2,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout, Separator, Stat } from "@/components/ui/feedback";
import { Input, Select } from "@/components/ui/form";
import { ConfirmDialog } from "@/components/ui/sheet";
import { VerdictBadge } from "@/components/verdict-badge";
import { useClaimGuard } from "@/lib/store";
import { runToJson, runToMarkdown, runsToMarkdown, slugify } from "@/lib/exporters";
import type { VerificationRun, Verdict } from "@/lib/types";
import { cn, downloadFile, formatDateTime, isSafeHttpUrl, truncate, usd } from "@/lib/utils";
import { VERDICTS, VERDICT_META } from "@/lib/verdicts";

function RunRow({
  run,
  expanded,
  onToggle,
  onOpen,
  onDelete,
}: {
  run: VerificationRun;
  expanded: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const flagged = run.verdicts.filter((v) => v.verdict !== "SUPPORTED").length;

  return (
    <li className="border-b border-[#F1F5F9] last:border-b-0">
      <div className="flex flex-wrap items-start gap-3 px-5 py-4">
        <button
          type="button"
          onClick={onToggle}
          className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded border border-[#E2E8F0] bg-white text-navy-800/60 transition-colors hover:border-accent-400 hover:text-accent-700"
          aria-expanded={expanded}
          aria-label={expanded ? "Collapse run" : "Expand run"}
        >
          <ChevronDown className={cn("h-4 w-4 transition-transform", expanded && "rotate-180")} />
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-navy-800">{run.label}</h3>
            <Badge variant="outline">{run.source}</Badge>
            {run.simulated ? <Badge variant="simulated">[SIMULATED]</Badge> : <Badge variant="accent">live</Badge>}
            <Badge variant={run.approvedBy === "human" ? "supported" : run.status === "rejected" ? "contradicted" : "outline"}>
              {run.approvedBy === "human" ? "human approved" : run.status.replace(/_/g, " ")}
            </Badge>
          </div>
          <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-navy-800/65 wrap-anywhere">{run.originalText}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-navy-800/55">
            <span>{formatDateTime(run.createdAt)}</span>
            <span className="font-mono">{run.totals.claims} claims</span>
            <span className={flagged > 0 ? "font-semibold text-verdict-partial" : "text-verdict-supported"}>
              {flagged > 0 ? `${flagged} flagged` : "all supported"}
            </span>
            <span className="font-mono">{usd(run.totals.actualCostUsd, 6)}</span>
            <span className="font-mono">saved {usd(run.totals.costSavedUsd, 6)}</span>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-1">
          <div className="mr-1 flex flex-wrap gap-1">
            {VERDICTS.map((v) => {
              const count = run.totals.verdictCounts[v] ?? 0;
              if (count === 0) return null;
              const meta = VERDICT_META[v];
              return (
                <span
                  key={v}
                  title={`${meta.label}: ${count}`}
                  className="rounded px-1.5 py-0.5 font-mono text-[10px] font-bold"
                  style={{ backgroundColor: meta.softHex, color: meta.hex }}
                >
                  {meta.short} {count}
                </span>
              );
            })}
          </div>
          <Button variant="ghost" size="sm" onClick={onOpen}>
            Open
          </Button>
          <Button
            variant="ghost"
            size="iconSm"
            onClick={() => downloadFile(`claimguard-${slugify(run.label)}.json`, runToJson(run), "application/json")}
            aria-label="Export JSON"
          >
            <Download className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="iconSm"
            onClick={() => downloadFile(`claimguard-${slugify(run.label)}.md`, runToMarkdown(run), "text/markdown")}
            aria-label="Export Markdown"
          >
            <FileUp className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="iconSm" onClick={onDelete} aria-label="Delete run">
            <Trash2 className="h-3.5 w-3.5 text-verdict-contradicted" />
          </Button>
        </div>
      </div>

      {expanded ? (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="overflow-hidden">
          <div className="bg-slate-50/60 px-5 pb-5 pl-14">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="text-[10px] uppercase tracking-wide text-navy-800/50">
                  <th className="py-2 pr-3 font-semibold">Claim</th>
                  <th className="py-2 pr-3 font-semibold">Verdict</th>
                  <th className="py-2 pr-3 font-semibold">Confidence</th>
                  <th className="py-2 pr-3 font-semibold">Human decision</th>
                  <th className="py-2 font-semibold">Primary source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E7ECF3]">
                {run.claims.map((claim) => {
                  const verdict = run.verdicts.find((v) => v.claimId === claim.id);
                  const src = verdict?.primaryEvidence;
                  return (
                    <tr key={claim.id} className="align-top">
                      <td className="max-w-[320px] py-2.5 pr-3 text-navy-800/80 wrap-anywhere">
                        <span className="mr-1.5 font-mono text-[11px] text-navy-800/40">#{claim.verificationPriority}</span>
                        {truncate(claim.originalClaim, 90)}
                      </td>
                      <td className="py-2.5 pr-3">
                        {verdict ? <VerdictBadge verdict={verdict.verdict} /> : <Badge variant="outline">pending</Badge>}
                      </td>
                      <td className="py-2.5 pr-3 font-mono text-[11px] tabular-nums text-navy-800/70">
                        {verdict?.confidenceScore ?? "—"}/100
                      </td>
                      <td className="py-2.5 pr-3 text-[11px] capitalize text-navy-800/65">{verdict?.decision ?? "pending"}</td>
                      <td className="py-2.5 text-[11px] text-navy-800/65">
                        {src ? (
                          <span className="block">
                            <span className="block font-medium text-navy-800/80 wrap-anywhere">{truncate(src.title, 46)}</span>
                            <span className="block text-navy-800/45">published {src.publishedAt ?? "Unknown"}</span>
                            {isSafeHttpUrl(src.url) ? (
                              <a
                                href={src.url}
                                target="_blank"
                                rel="noopener noreferrer nofollow"
                                className="inline-flex items-center gap-1 text-accent-700 underline decoration-accent-300 underline-offset-2"
                              >
                                {src.domain}
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            ) : null}
                          </span>
                        ) : (
                          <span className="italic text-navy-800/45">none — unverifiable</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {run.correctedText ? (
              <>
                <Separator className="my-3" />
                <p className="eyebrow">Corrected answer (applied)</p>
                <p className="mt-1.5 rounded border-l-2 border-verdict-supported bg-verdict-supported-soft/60 px-3 py-2 text-[13px] leading-relaxed text-navy-800 wrap-anywhere">
                  {run.correctedText}
                </p>
              </>
            ) : null}
          </div>
        </motion.div>
      ) : null}
    </li>
  );
}

export default function HistoryPage() {
  const {
    runs,
    hydrated,
    historyFilter,
    setHistoryFilter,
    deleteRun,
    clearHistory,
    importRuns,
    setActiveRun,
  } = useClaimGuard();

  const [query, setQuery] = React.useState("");
  const [sourceFilter, setSourceFilter] = React.useState("ALL");
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const [confirmClear, setConfirmClear] = React.useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = React.useState<string | null>(null);
  const [flash, setFlash] = React.useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 3200);
    return () => clearTimeout(t);
  }, [flash]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return runs.filter((r) => {
      if (sourceFilter !== "ALL" && r.source !== sourceFilter) return false;
      if (historyFilter !== "ALL" && !r.verdicts.some((v) => v.verdict === historyFilter)) return false;
      if (q && !`${r.label} ${r.originalText}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [runs, query, sourceFilter, historyFilter]);

  const stats = React.useMemo(() => {
    const claims = runs.reduce((a, r) => a + r.totals.claims, 0);
    const saved = runs.reduce((a, r) => a + r.totals.costSavedUsd, 0);
    const approvals = runs.filter((r) => r.approvedBy === "human").length;
    const verdictTotals = VERDICTS.reduce<Record<string, number>>((acc, v) => {
      acc[v] = runs.reduce((a, r) => a + (r.totals.verdictCounts[v] ?? 0), 0);
      return acc;
    }, {});
    return { claims, saved, approvals, verdictTotals };
  }, [runs]);

  if (!hydrated) {
    return (
      <div className="mx-auto flex max-w-[1360px] items-center gap-3 px-4 py-16">
        <Loader2 className="h-4 w-4 animate-spin text-accent-600" />
        <p className="text-sm text-navy-800/60">Loading audit trail…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1360px] px-4 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow">Audit trail</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-navy-800 sm:text-3xl">Verification history</h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-navy-800/65">
            Every run is persisted to your browser&apos;s local storage — claims, verdicts, evidence, routing decisions
            and human approvals. Export any of it as JSON or Markdown.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
            <Upload className="h-3.5 w-3.5" />
            Import JSON
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              const body = await file.text();
              const { imported, error } = importRuns(body);
              setFlash(error ? `Import failed: ${error}` : `Imported ${imported} run(s).`);
            }}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => downloadFile(`claimguard-history-${slugify(new Date().toISOString())}.md`, runsToMarkdown(filtered), "text/markdown")}
            disabled={filtered.length === 0}
          >
            <Download className="h-3.5 w-3.5" />
            Export filtered
          </Button>
          <Button variant="outline" size="sm" onClick={() => setConfirmClear(true)} disabled={runs.length === 0}>
            <Trash2 className="h-3.5 w-3.5" />
            Clear all
          </Button>
        </div>
      </div>

      {flash ? (
        <Callout tone={flash.startsWith("Import failed") ? "bad" : "good"} className="mt-4" icon={<CheckCircle2 className="h-4 w-4" />}>
          {flash}
        </Callout>
      ) : null}

      <section className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Runs stored" value={runs.length} sub={`${stats.claims} claims verified`} />
        <Stat label="Human approvals" value={stats.approvals} sub="runs explicitly approved" tone="good" />
        <Stat label="Cost saved" value={usd(stats.saved, 4)} sub="vs unrouted baseline" tone="good" />
        <Stat
          label="Flagged claims"
          value={VERDICTS.filter((v) => v !== "SUPPORTED").reduce((a, v) => a + stats.verdictTotals[v], 0)}
          sub="stale, contradicted, partial or unverifiable"
          tone="warn"
        />
      </section>

      {/* ------------------------------------------------------------- filters */}
      <section className="shell-panel mt-5 px-5 py-4">
        <div className="grid gap-3 sm:grid-cols-[1.6fr_1fr_1fr]">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-navy-800/70">Search</span>
            <span className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-navy-800/35" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter by label or answer text…"
                className="pl-9"
                aria-label="Search runs"
              />
            </span>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-navy-800/70">Verdict</span>
            <Select value={historyFilter} onChange={(e) => setHistoryFilter(e.target.value)} aria-label="Filter by verdict">
              <option value="ALL">All verdicts</option>
              {VERDICTS.map((v) => (
                <option key={v} value={v}>
                  {VERDICT_META[v].label}
                </option>
              ))}
            </Select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-navy-800/70">Source</span>
            <Select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} aria-label="Filter by source">
              <option value="ALL">All sources</option>
              <option value="demo">Demo</option>
              <option value="paste">Pasted</option>
              <option value="upload">Uploaded</option>
              <option value="batch">Batch</option>
            </Select>
          </label>
        </div>
        <p className="mt-2.5 text-[11px] text-navy-800/50">
          Showing {filtered.length} of {runs.length} run(s).
        </p>
      </section>

      {/* ---------------------------------------------------------------- list */}
      {filtered.length === 0 ? (
        <div className="shell-panel mt-5 px-5 py-14 text-center">
          <Database className="mx-auto h-8 w-8 text-navy-800/25" />
          <h3 className="mt-3 text-base font-semibold text-navy-800">
            {runs.length === 0 ? "No runs yet" : "Nothing matches those filters"}
          </h3>
          <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-navy-800/60">
            {runs.length === 0
              ? "Run a verification and it will be recorded here with its full evidence and approval trail."
              : "Try clearing the verdict or source filter, or search for different text."}
          </p>
          {runs.length === 0 ? (
            <Link href="/verify" className="mt-4 inline-block">
              <Button variant="accent">Go to Verify</Button>
            </Link>
          ) : (
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => {
                setQuery("");
                setSourceFilter("ALL");
                setHistoryFilter("ALL");
              }}
            >
              Reset filters
            </Button>
          )}
        </div>
      ) : (
        <ul className="shell-panel mt-5 overflow-hidden">
          {filtered.map((run) => (
            <RunRow
              key={run.id}
              run={run}
              expanded={expandedId === run.id}
              onToggle={() => setExpandedId((v) => (v === run.id ? null : run.id))}
              onOpen={() => {
                setActiveRun(run.id);
                window.location.assign("/verify");
              }}
              onDelete={() => setConfirmDeleteId(run.id)}
            />
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title="Clear the entire audit trail?"
        description="All runs, verdicts, evidence and fallback events stored in local storage will be removed. Reports you have already exported are unaffected."
        confirmLabel="Clear everything"
        onConfirm={() => {
          clearHistory();
          setFlash("Audit trail cleared.");
        }}
      />

      <ConfirmDialog
        open={Boolean(confirmDeleteId)}
        onOpenChange={(open) => {
          if (!open) setConfirmDeleteId(null);
        }}
        title="Delete this run?"
        description="The run and its evidence are removed from local storage permanently."
        confirmLabel="Delete run"
        onConfirm={() => {
          if (confirmDeleteId) deleteRun(confirmDeleteId);
          setConfirmDeleteId(null);
        }}
      />
    </div>
  );
}

export type { Verdict };
