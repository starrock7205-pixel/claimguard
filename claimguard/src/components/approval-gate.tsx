"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { CheckCheck, RotateCcw, ShieldAlert, ShieldCheck, UserCheck, XOctagon } from "lucide-react";
import { Button } from "./ui/button";
import { Callout } from "./ui/feedback";
import type { VerificationRun } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

/**
 * The mandatory human-in-the-loop gate (guardrail 5).
 *
 * `onApply` is the only code path in the app that writes `run.correctedText`.
 * It stays disabled until at least one claim has an explicit human decision.
 */
export function ApprovalGate({
  run,
  stagedCount,
  approvedCount,
  rejectedCount,
  pendingCount,
  onApply,
  onApproveAll,
  onRejectAll,
  onRevert,
}: {
  run: VerificationRun;
  stagedCount: number;
  approvedCount: number;
  rejectedCount: number;
  pendingCount: number;
  onApply: () => void;
  onApproveAll: () => void;
  onRejectAll: () => void;
  onRevert: () => void;
}) {
  const applied = Boolean(run.correctedText);
  const canApply = approvedCount > 0 && !applied;

  return (
    <motion.div layout className="shell-panel overflow-hidden border-l-4 border-l-navy-800">
      <header className="flex flex-wrap items-center gap-3 border-b border-[#EDF1F6] bg-navy-800 px-5 py-4">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-accent-500 text-navy-900">
          <UserCheck className="h-4 w-4" strokeWidth={2.4} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-white">Human approval gate</h3>
          <p className="text-xs text-white/60">
            {applied
              ? "Corrections applied and written to the audit trail."
              : "Corrections stay staged until you explicitly approve them."}
          </p>
        </div>
        <span className="rounded-full bg-white/10 px-3 py-1 font-mono text-[11px] tabular-nums text-white/85">
          {approvedCount} approved · {rejectedCount} rejected · {pendingCount} pending
        </span>
      </header>

      <div className="space-y-4 px-5 py-4">
        {applied ? (
          <>
            <Callout tone="good" icon={<ShieldCheck className="h-4 w-4" />} title="Approved and applied by a human">
              {approvedCount} correction(s) were written into the corrected answer at {formatDateTime(run.completedAt)}.
              The original LLM output is preserved verbatim alongside it — nothing was overwritten.
            </Callout>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={onRevert}>
                <RotateCcw className="h-3.5 w-3.5" />
                Revert to staged diff
              </Button>
            </div>
          </>
        ) : (
          <>
            <Callout tone="info" icon={<ShieldAlert className="h-4 w-4" />} title="Nothing has been applied yet">
              {stagedCount > 0
                ? `${stagedCount} correction(s) are staged in the diff above. ClaimGuard will not write any of them until you click Approve & Apply.`
                : "No corrections are staged. You can still record a decision on each claim for the audit trail."}
            </Callout>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="accent"
                onClick={onApply}
                disabled={!canApply}
                title={canApply ? "Write approved corrections into the corrected answer" : "Approve at least one claim first"}
              >
                <CheckCheck className="h-4 w-4" />
                Approve &amp; Apply
              </Button>
              <Button variant="outline" onClick={onApproveAll} disabled={pendingCount === 0}>
                <ShieldCheck className="h-4 w-4" />
                Approve all pending
              </Button>
              <Button variant="outline" onClick={onRejectAll} disabled={pendingCount === 0}>
                <XOctagon className="h-4 w-4" />
                Reject all pending
              </Button>
              {!canApply ? (
                <span className="text-xs text-navy-800/55">
                  {approvedCount === 0 ? "Approve at least one claim to enable apply." : ""}
                </span>
              ) : null}
            </div>
          </>
        )}
      </div>
    </motion.div>
  );
}
