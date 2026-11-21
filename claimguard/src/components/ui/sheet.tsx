"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { Button } from "./button";
import { cn } from "@/lib/utils";

/**
 * Right-hand drawer used for the Tavily Evidence Drawer.
 * Closes on Escape and on backdrop click; traps no focus by design (the panel
 * is non-blocking on wide screens).
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  subtitle,
  children,
  footer,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  return (
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-50 flex justify-end">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={() => onOpenChange(false)}
            className="absolute inset-0 bg-navy-900/45 backdrop-blur-[2px]"
            aria-hidden
          />
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "tween", duration: 0.22, ease: "easeOut" }}
            role="dialog"
            aria-modal="true"
            className={cn(
              "relative flex h-full w-full max-w-2xl flex-col border-l border-[#E2E8F0] bg-white shadow-2xl",
              className,
            )}
          >
            <header className="flex items-start justify-between gap-4 border-b border-[#EDF1F6] px-5 py-4">
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-navy-800">{title}</h2>
                {subtitle ? <p className="mt-0.5 text-xs text-navy-800/60">{subtitle}</p> : null}
              </div>
              <Button variant="ghost" size="iconSm" onClick={() => onOpenChange(false)} aria-label="Close panel">
                <X className="h-4 w-4" />
              </Button>
            </header>
            <div className="scrollbar-thin flex-1 overflow-y-auto px-5 py-4">{children}</div>
            {footer ? <footer className="border-t border-[#EDF1F6] px-5 py-3">{footer}</footer> : null}
          </motion.aside>
        </div>
      ) : null}
    </AnimatePresence>
  );
}

/** Small confirmation dialog used by destructive actions (clear history, delete run). */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  onConfirm,
  tone = "destructive",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  onConfirm: () => void;
  tone?: "destructive" | "default";
}) {
  return (
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-navy-900/45 backdrop-blur-[2px]"
            onClick={() => onOpenChange(false)}
            aria-hidden
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.16 }}
            role="alertdialog"
            aria-modal="true"
            className="relative w-full max-w-md rounded-lg border border-[#E2E8F0] bg-white p-5 shadow-2xl"
          >
            <h3 className="text-base font-semibold text-navy-800">{title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-navy-800/70">{description}</p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                variant={tone === "destructive" ? "destructive" : "default"}
                onClick={() => {
                  onConfirm();
                  onOpenChange(false);
                }}
              >
                {confirmLabel}
              </Button>
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
