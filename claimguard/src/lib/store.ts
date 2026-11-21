"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { emptyTimeline, emptyTotals, runPipeline, type PipelineEvent } from "./pipeline";
import { DEMO_LABEL, DEMO_LLM_OUTPUT } from "./seed";
import type {
  BatchJob,
  Claim,
  ClaimVerdict,
  FallbackEvent,
  RunSource,
  RunStatus,
  Settings,
  TimelineStep,
  VerificationRun,
} from "./types";
import { uid } from "./utils";
import { buildCorrectedText } from "./corrected-text";

export { buildCorrectedText };

export const DEFAULT_SETTINGS: Settings = {
  tavily: {
    apiKey: process.env.NEXT_PUBLIC_TAVILY_API_KEY ?? "",
    maxResults: 5,
    includeRawContent: false,
  },
  bifrost: {
    apiKey: process.env.NEXT_PUBLIC_BIFROST_API_KEY ?? "",
    baseUrl: process.env.NEXT_PUBLIC_BIFROST_BASE_URL ?? "http://localhost:8080/v1",
    fastModel: "gpt-4o-mini",
    standardModel: "gpt-4o-mini",
    reasoningModel: "gpt-4o",
    fallbackModel: "claude-3-5-sonnet",
    monthlyBudgetCapUsd: 25,
    simulateFallback: true,
    requestTimeoutMs: 20000,
    cacheEnabled: true,
  },
  escalateHighRisk: true,
  requireHumanApproval: true,
  advancedDepthRiskThreshold: 60,
};

/** Live abort flags, keyed by run id. Not persisted. */
const abortFlags = new Map<string, { aborted: boolean }>();

function newRun(source: RunSource, label: string, text: string): VerificationRun {
  const id = uid("run");
  return {
    id,
    createdAt: new Date().toISOString(),
    completedAt: null,
    source,
    label,
    originalText: text,
    correctedText: null,
    status: "idle",
    claims: [],
    verdicts: [],
    timeline: emptyTimeline(),
    totals: emptyTotals(),
    simulated: false,
    error: null,
    approvedBy: null,
  };
}

function applyTimeline(timeline: TimelineStep[], stepId: number, state?: TimelineStep["state"], message?: { text: string; tone: "info" | "success" | "warn" | "error" | "route" }) {
  return timeline.map((step) => {
    if (step.id !== stepId) return step;
    const next: TimelineStep = { ...step };
    if (state) {
      next.state = state;
      if (state === "active" && next.startedAt === null) next.startedAt = Date.now();
      if (state === "done" || state === "failed" || state === "skipped") next.endedAt = Date.now();
    }
    if (message) {
      next.messages = [...next.messages, { id: uid("msg"), text: message.text, tone: message.tone, at: Date.now() }];
    }
    return next;
  });
}

function statusFromDecisions(verdicts: ClaimVerdict[], requireApproval: boolean): RunStatus {
  if (verdicts.length === 0) return "awaiting_approval";
  const decided = verdicts.filter((v) => v.decision !== "pending");
  if (decided.length === 0) return "awaiting_approval";
  const approved = decided.filter((v) => v.decision === "approved").length;
  const rejected = decided.filter((v) => v.decision === "rejected").length;
  if (decided.length < verdicts.length) return "awaiting_approval";
  if (approved > 0 && rejected > 0) return "partially_approved";
  if (approved > 0) return "approved";
  if (rejected > 0) return "rejected";
  return requireApproval ? "awaiting_approval" : "approved";
}

export interface ClaimGuardState {
  hydrated: boolean;
  settings: Settings;
  runs: VerificationRun[];
  activeRunId: string | null;
  batchJobs: BatchJob[];
  fallbackLog: FallbackEvent[];
  /** Verdict filter used on /history. */
  historyFilter: string;

  setHydrated: (value: boolean) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  updateTavily: (patch: Partial<Settings["tavily"]>) => void;
  updateBifrost: (patch: Partial<Settings["bifrost"]>) => void;
  resetSettings: () => void;

  startRun: (text: string, source: RunSource, label: string) => string;
  loadDemo: () => string;
  cancelRun: (runId: string) => void;
  setActiveRun: (runId: string | null) => void;
  decideClaim: (runId: string, claimId: string, decision: ClaimVerdict["decision"]) => void;
  approveAllActionable: (runId: string) => void;
  rejectAllPending: (runId: string) => void;
  applyCorrections: (runId: string) => void;
  revertCorrections: (runId: string) => void;
  deleteRun: (runId: string) => void;
  clearHistory: () => void;
  importRuns: (json: string) => { imported: number; error: string | null };

  setHistoryFilter: (value: string) => void;
  addBatchJob: (label: string, text: string) => string;
  updateBatchJob: (id: string, patch: Partial<BatchJob>) => void;
  removeBatchJob: (id: string) => void;
  clearBatchJobs: () => void;
  runBatch: () => Promise<void>;
}

export const useClaimGuard = create<ClaimGuardState>()(
  persist(
    (set, get) => ({
      hydrated: false,
      settings: DEFAULT_SETTINGS,
      runs: [],
      activeRunId: null,
      batchJobs: [],
      fallbackLog: [],
      historyFilter: "ALL",

      setHydrated: (value) => set({ hydrated: value }),

      updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
      updateTavily: (patch) => set((s) => ({ settings: { ...s.settings, tavily: { ...s.settings.tavily, ...patch } } })),
      updateBifrost: (patch) =>
        set((s) => ({ settings: { ...s.settings, bifrost: { ...s.settings.bifrost, ...patch } } })),
      resetSettings: () => set({ settings: DEFAULT_SETTINGS }),

      startRun: (text, source, label) => {
        const run = newRun(source, label, text);
        const flag = { aborted: false };
        abortFlags.set(run.id, flag);
        set((s) => ({ runs: [run, ...s.runs], activeRunId: run.id }));

        // Fire the pipeline without blocking the caller so the UI can animate.
        void runPipeline(
          { text, source, label, runId: run.id, settings: get().settings },
          {
            signal: flag,
            emit: (event) => applyPipelineEvent(run.id, event, set),
          },
        ).catch((err) => {
          applyPipelineEvent(
            run.id,
            { kind: "status", status: "failed", error: err instanceof Error ? err.message : String(err) },
            set,
          );
        });

        return run.id;
      },

      loadDemo: () => get().startRun(DEMO_LLM_OUTPUT, "demo", DEMO_LABEL),

      cancelRun: (runId) => {
        const flag = abortFlags.get(runId);
        if (flag) flag.aborted = true;
        set((s) => ({
          runs: s.runs.map((r) =>
            r.id === runId
              ? { ...r, status: "failed" as RunStatus, error: "Run cancelled by user.", completedAt: new Date().toISOString() }
              : r,
          ),
        }));
      },

      setActiveRun: (runId) => set({ activeRunId: runId }),

      decideClaim: (runId, claimId, decision) =>
        set((s) => {
          const runs = s.runs.map((r) => {
            if (r.id !== runId) return r;
            const verdicts = r.verdicts.map((v) =>
              v.claimId === claimId
                ? { ...v, decision, decidedAt: decision === "pending" ? null : new Date().toISOString() }
                : v,
            );
            return { ...r, verdicts, status: statusFromDecisions(verdicts, s.settings.requireHumanApproval) };
          });
          return { runs };
        }),

      approveAllActionable: (runId) =>
        set((s) => ({
          runs: s.runs.map((r) => {
            if (r.id !== runId) return r;
            const verdicts = r.verdicts.map((v) =>
              v.decision === "pending" && v.suggestedReplacement
                ? { ...v, decision: "approved" as const, decidedAt: new Date().toISOString() }
                : v.decision === "pending" && !v.suggestedReplacement
                  ? { ...v, decision: "approved" as const, decidedAt: new Date().toISOString() }
                  : v,
            );
            return { ...r, verdicts, status: statusFromDecisions(verdicts, s.settings.requireHumanApproval) };
          }),
        })),

      rejectAllPending: (runId) =>
        set((s) => ({
          runs: s.runs.map((r) => {
            if (r.id !== runId) return r;
            const verdicts = r.verdicts.map((v) =>
              v.decision === "pending" ? { ...v, decision: "rejected" as const, decidedAt: new Date().toISOString() } : v,
            );
            return { ...r, verdicts, status: statusFromDecisions(verdicts, s.settings.requireHumanApproval) };
          }),
        })),

      /**
       * Guardrail 5: the only path that writes `correctedText`. Requires at
       * least one explicitly approved claim.
       */
      applyCorrections: (runId) =>
        set((s) => ({
          runs: s.runs.map((r) => {
            if (r.id !== runId) return r;
            const approved = r.verdicts.filter((v) => v.decision === "approved" && v.suggestedReplacement);
            if (approved.length === 0) return r;
            return {
              ...r,
              correctedText: buildCorrectedText(r, "approved"),
              status: "approved" as RunStatus,
              approvedBy: "human" as const,
              completedAt: new Date().toISOString(),
            };
          }),
        })),

      revertCorrections: (runId) =>
        set((s) => ({
          runs: s.runs.map((r) =>
            r.id === runId
              ? {
                  ...r,
                  correctedText: null,
                  approvedBy: null,
                  status: "awaiting_approval" as RunStatus,
                  verdicts: r.verdicts.map((v) => ({ ...v, decision: "pending" as const, decidedAt: null })),
                }
              : r,
          ),
        })),

      deleteRun: (runId) =>
        set((s) => ({
          runs: s.runs.filter((r) => r.id !== runId),
          activeRunId: s.activeRunId === runId ? (s.runs.find((r) => r.id !== runId)?.id ?? null) : s.activeRunId,
        })),

      clearHistory: () => set({ runs: [], activeRunId: null, fallbackLog: [] }),

      importRuns: (json) => {
        try {
          const parsed = JSON.parse(json) as { runs?: VerificationRun[] } | VerificationRun[];
          const incoming = Array.isArray(parsed) ? parsed : parsed.runs;
          if (!Array.isArray(incoming)) return { imported: 0, error: "Expected an array of runs or {runs: [...]}." };
          const valid = incoming.filter(
            (r) => r && typeof r.id === "string" && typeof r.originalText === "string" && Array.isArray(r.verdicts),
          );
          set((s) => ({ runs: [...valid, ...s.runs.filter((r) => !valid.some((v) => v.id === r.id))] }));
          return { imported: valid.length, error: null };
        } catch (err) {
          return { imported: 0, error: err instanceof Error ? err.message : "Invalid JSON." };
        }
      },

      setHistoryFilter: (value) => set({ historyFilter: value }),

      addBatchJob: (label, text) => {
        const job: BatchJob = { id: uid("batch"), label, text, runId: null, status: "queued", error: null };
        set((s) => ({ batchJobs: [...s.batchJobs, job] }));
        return job.id;
      },

      updateBatchJob: (id, patch) =>
        set((s) => ({ batchJobs: s.batchJobs.map((j) => (j.id === id ? { ...j, ...patch } : j)) })),

      removeBatchJob: (id) => set((s) => ({ batchJobs: s.batchJobs.filter((j) => j.id !== id) })),

      clearBatchJobs: () => set({ batchJobs: [] }),

      runBatch: async () => {
        const { batchJobs } = get();
        for (const job of batchJobs) {
          if (job.status === "done") continue;
          get().updateBatchJob(job.id, { status: "running", error: null });
          try {
            const runId = get().startRun(job.text, "batch", job.label);
            get().updateBatchJob(job.id, { runId, status: "done" });
          } catch (err) {
            get().updateBatchJob(job.id, { status: "failed", error: err instanceof Error ? err.message : String(err) });
          }
          await new Promise<void>((r) => setTimeout(r, 300));
        }
      },
    }),
    {
      name: "claimguard-store-v1",
      storage: createJSONStorage(() => (typeof window === "undefined" ? noopStorage : window.localStorage)),
      partialize: (state) => ({
        settings: state.settings,
        runs: state.runs.slice(0, 40),
        activeRunId: state.activeRunId,
        batchJobs: state.batchJobs,
        fallbackLog: state.fallbackLog.slice(0, 60),
        historyFilter: state.historyFilter,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true);
      },
    },
  ),
);

const noopStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
};

// ---------------------------------------------------------------------------
// Pipeline → store reducer
// ---------------------------------------------------------------------------

type SetState = (partial: Partial<ClaimGuardState> | ((state: ClaimGuardState) => Partial<ClaimGuardState>)) => void;

function applyPipelineEvent(runId: string, event: PipelineEvent, set: SetState) {
  set((s) => {
    const runs = s.runs.map((run) => {
      if (run.id !== runId) return run;
      const next: VerificationRun = { ...run };

      switch (event.kind) {
        case "step":
          next.timeline = applyTimeline(run.timeline, event.stepId, event.state, event.message);
          break;
        case "claims":
          next.claims = event.claims;
          break;
        case "verdict":
          next.verdicts = [...run.verdicts.filter((v) => v.claimId !== event.verdict.claimId), event.verdict].sort((a, b) => {
            const ca = run.claims.find((c) => c.id === a.claimId);
            const cb = run.claims.find((c) => c.id === b.claimId);
            return (ca?.verificationPriority ?? 99) - (cb?.verificationPriority ?? 99);
          });
          break;
        case "totals":
          next.totals = event.totals;
          next.completedAt = new Date().toISOString();
          break;
        case "status":
          next.status = event.status;
          if (event.simulated !== undefined) next.simulated = event.simulated || run.simulated;
          if (event.error !== undefined) next.error = event.error;
          if (event.status !== "running") next.completedAt = new Date().toISOString();
          break;
        case "fallback":
          break;
      }
      return next;
    });

    const patch: Partial<ClaimGuardState> = { runs };
    if (event.kind === "fallback") {
      patch.fallbackLog = [event.event, ...s.fallbackLog].slice(0, 60);
    }
    return patch;
  });
}

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

export function selectRun(state: ClaimGuardState, runId: string | null): VerificationRun | undefined {
  return state.runs.find((r) => r.id === runId);
}

export function selectClaimsAndVerdicts(run: VerificationRun | undefined): Array<{ claim: Claim; verdict: ClaimVerdict | undefined }> {
  if (!run) return [];
  return run.claims.map((claim) => ({ claim, verdict: run.verdicts.find((v) => v.claimId === claim.id) }));
}

export function aggregateFallbacks(runs: VerificationRun[], log: FallbackEvent[]): FallbackEvent[] {
  const fromRuns = runs.flatMap((r) =>
    r.verdicts
      .filter((v) => v.routing.fallbackUsed)
      .map<FallbackEvent>((v) => ({
        id: `${r.id}_${v.claimId}`,
        runId: r.id,
        claimId: v.claimId,
        claimText: r.claims.find((c) => c.id === v.claimId)?.originalClaim ?? "",
        from: v.routing.fallbackFrom ?? v.routing.requestedModel,
        to: v.routing.fallbackTo ?? v.routing.usedModel,
        reason: v.routing.fallbackReason ?? "Primary model error",
        at: v.verifiedAt,
        mode: v.routing.mode,
      })),
  );
  const seen = new Set<string>();
  return [...log, ...fromRuns].filter((e) => {
    const key = `${e.claimId}:${e.at}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
