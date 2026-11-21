"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Check,
  CircleDashed,
  Info,
  Loader2,
  MinusCircle,
  Route,
  XCircle,
} from "lucide-react";
import type { StepState, TimelineMessage, TimelineStep } from "@/lib/types";
import { cn } from "@/lib/utils";

const STATE_META: Record<
  StepState,
  { label: string; ring: string; dot: string; Icon: React.ComponentType<React.SVGProps<SVGSVGElement>> }
> = {
  pending: { label: "Pending", ring: "border-slate-200 bg-white", dot: "bg-slate-300", Icon: CircleDashed },
  active: { label: "Running", ring: "border-accent-500 bg-accent-50", dot: "bg-accent-500", Icon: Loader2 },
  done: { label: "Done", ring: "border-verdict-supported-line bg-verdict-supported-soft", dot: "bg-verdict-supported", Icon: Check },
  skipped: { label: "Skipped", ring: "border-slate-200 bg-slate-50", dot: "bg-slate-400", Icon: MinusCircle },
  failed: { label: "Failed", ring: "border-verdict-contradicted-line bg-verdict-contradicted-soft", dot: "bg-verdict-contradicted", Icon: XCircle },
};

const TONE_META: Record<
  TimelineMessage["tone"],
  { className: string; Icon: React.ComponentType<React.SVGProps<SVGSVGElement>> }
> = {
  info: { className: "text-navy-800/75", Icon: Info },
  success: { className: "text-verdict-supported", Icon: Check },
  warn: { className: "text-amber-700", Icon: AlertTriangle },
  error: { className: "text-verdict-contradicted", Icon: XCircle },
  route: { className: "text-accent-700", Icon: Route },
};

function MessageRow({ message }: { message: TimelineMessage }) {
  const meta = TONE_META[message.tone];
  return (
    <motion.li
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.18 }}
      className="flex gap-2 py-0.5"
    >
      <meta.Icon className={cn("mt-[3px] h-3.5 w-3.5 shrink-0", meta.className)} />
      <span className={cn("text-[13px] leading-relaxed wrap-anywhere", meta.className)}>{message.text}</span>
    </motion.li>
  );
}

function StepRow({ step, isLast }: { step: TimelineStep; isLast: boolean }) {
  const meta = STATE_META[step.state];
  const durationMs = step.startedAt && step.endedAt ? step.endedAt - step.startedAt : null;

  return (
    <li className="relative flex gap-3">
      {/* connector line */}
      {!isLast ? (
        <span
          className={cn(
            "absolute left-[13px] top-7 h-[calc(100%-1.25rem)] w-px",
            step.state === "done" ? "bg-verdict-supported-line" : "bg-slate-200",
          )}
          aria-hidden
        />
      ) : null}

      <span
        className={cn(
          "relative z-10 mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 transition-colors",
          meta.ring,
        )}
      >
        <meta.Icon
          className={cn("h-3.5 w-3.5", step.state === "active" && "animate-spin", "text-navy-800/70")}
          style={step.state === "done" ? { color: "#15803D" } : step.state === "active" ? { color: "#00B4D8" } : undefined}
        />
      </span>

      <div className="min-w-0 flex-1 pb-4">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-mono text-[11px] text-navy-800/40">{String(step.id).padStart(2, "0")}</span>
          <h4
            className={cn(
              "text-sm font-semibold",
              step.state === "pending" ? "text-navy-800/40" : "text-navy-800",
            )}
          >
            {step.title}
          </h4>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
              step.state === "active"
                ? "bg-accent-50 text-accent-700"
                : step.state === "done"
                  ? "bg-verdict-supported-soft text-verdict-supported"
                  : step.state === "failed"
                    ? "bg-verdict-contradicted-soft text-verdict-contradicted"
                    : "bg-slate-100 text-navy-800/50",
            )}
          >
            {meta.label}
          </span>
          {durationMs !== null ? (
            <span className="font-mono text-[11px] tabular-nums text-navy-800/40">{durationMs}ms</span>
          ) : null}
        </div>

        {step.messages.length > 0 ? (
          <ul className="mt-1.5 space-y-0.5 border-l border-slate-100 pl-0">
            <AnimatePresence initial={false}>
              {step.messages.map((m) => (
                <MessageRow key={m.id} message={m} />
              ))}
            </AnimatePresence>
          </ul>
        ) : null}
      </div>
    </li>
  );
}

export function AgentTimeline({
  timeline,
  collapsed = false,
  onToggle,
}: {
  timeline: TimelineStep[];
  collapsed?: boolean;
  onToggle?: () => void;
}) {
  const done = timeline.filter((s) => s.state === "done").length;
  const total = timeline.length;
  const activeStep = timeline.find((s) => s.state === "active");
  const messageCount = timeline.reduce((a, s) => a + s.messages.length, 0);

  return (
    <div className="shell-panel overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 border-b border-[#EDF1F6] px-5 py-4 text-left transition-colors hover:bg-slate-50/70"
        aria-expanded={!collapsed}
      >
        <span className="relative grid h-8 w-8 shrink-0 place-items-center rounded-md bg-navy-800">
          {activeStep ? (
            <Loader2 className="h-4 w-4 animate-spin text-accent-300" />
          ) : (
            <Check className="h-4 w-4 text-verdict-supported-soft" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-navy-800">Agent Activity Timeline</span>
          <span className="block text-xs text-navy-800/60">
            {activeStep
              ? `Step ${activeStep.id} of ${total} · ${activeStep.title}`
              : `${done}/${total} steps complete · ${messageCount} event(s) logged`}
          </span>
        </span>
        <span className="hidden font-mono text-xs tabular-nums text-navy-800/50 sm:inline">
          {Math.round((done / total) * 100)}%
        </span>
        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-200 sm:w-32">
          <motion.div
            className="h-full rounded-full bg-accent-500"
            animate={{ width: `${(done / total) * 100}%` }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          />
        </div>
      </button>

      <AnimatePresence initial={false}>
        {!collapsed ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <ol className="scrollbar-thin max-h-[520px] overflow-y-auto px-5 py-4">
              {timeline.map((step, i) => (
                <StepRow key={step.id} step={step} isLast={i === timeline.length - 1} />
              ))}
            </ol>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
