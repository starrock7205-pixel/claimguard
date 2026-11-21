"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  Activity,
  Layers,
  Menu,
  Settings as SettingsIcon,
  ShieldCheck,
  X,
  Zap,
} from "lucide-react";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { useClaimGuard } from "@/lib/store";
import { budgetStatus } from "@/lib/adapters/bifrost";
import { cn, round } from "@/lib/utils";

export const NAV_ITEMS = [
  { href: "/", label: "Overview", icon: ShieldCheck },
  { href: "/verify", label: "Verify", icon: Zap },
  { href: "/observability", label: "Observability", icon: Activity },
  { href: "/batch", label: "Batch", icon: Layers },
  { href: "/history", label: "History", icon: Activity },
  { href: "/demo", label: "Judge walkthrough", icon: ShieldCheck },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
];

function AdapterStatus() {
  const settings = useClaimGuard((s) => s.settings);
  const hydrated = useClaimGuard((s) => s.hydrated);
  const tavilyLive = (process.env.NEXT_PUBLIC_TAVILY_API_KEY ?? "").length > 0 || settings.tavily.apiKey.trim().length > 0;
  const bifrostLive = (process.env.NEXT_PUBLIC_BIFROST_API_KEY ?? "").length > 0 || settings.bifrost.apiKey.trim().length > 0;
  const live = tavilyLive && bifrostLive;

  if (!hydrated) {
    return <Badge variant="onDark" className="opacity-60">checking…</Badge>;
  }

  const budget = budgetStatus(settings.bifrost);

  return (
    <div className="flex items-center gap-2">
      <Badge variant={live ? "accent" : "simulated"} className="shrink-0">
        <span className={cn("h-1.5 w-1.5 rounded-full", live ? "bg-accent-600" : "bg-amber-600 animate-pulse-soft")} />
        {live ? "Live adapters" : "Simulated mode"}
      </Badge>
      <span className="hidden text-[11px] tabular-nums text-white/55 lg:inline">
        ${round(budget.spent, 4)} / ${budget.cap}
      </span>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const loadDemo = useClaimGuard((s) => s.loadDemo);
  const setActiveRun = useClaimGuard((s) => s.setActiveRun);

  React.useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const nav = (onNavigate?: () => void) => (
    <nav className="flex flex-1 flex-col gap-1 lg:flex-row lg:items-center lg:gap-0.5">
      {NAV_ITEMS.map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn("nav-link", active && "nav-link-active")}
            aria-current={active ? "page" : undefined}
          >
            <item.icon className="h-4 w-4" />
            <span>{item.label}</span>
            {active ? (
              <motion.span
                layoutId="nav-underline"
                className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent-500"
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
              />
            ) : null}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="flex min-h-screen flex-col bg-[#F4F7FB]">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-navy-800">
        <div className="mx-auto flex h-16 w-full max-w-[1360px] items-center gap-3 px-4">
          <Link href="/" className="flex shrink-0 items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-md bg-accent-500 text-navy-900">
              <ShieldCheck className="h-5 w-5" strokeWidth={2.4} />
            </span>
            <span className="leading-tight">
              <span className="block text-[15px] font-bold tracking-tight text-white">ClaimGuard</span>
              <span className="block text-[10px] font-medium uppercase tracking-[0.16em] text-accent-300">
                source-grounded
              </span>
            </span>
          </Link>

          <div className="hidden flex-1 lg:flex">{nav()}</div>

          <div className="ml-auto flex items-center gap-2">
            <AdapterStatus />
            <Button
              variant="onDark"
              size="sm"
              className="hidden sm:inline-flex"
              onClick={() => {
                const id = loadDemo();
                setActiveRun(id);
                window.location.assign("/verify");
              }}
            >
              <Zap className="h-3.5 w-3.5" />
              Load demo
            </Button>
            <Button
              variant="onDark"
              size="icon"
              className="lg:hidden"
              onClick={() => setMobileOpen((v) => !v)}
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileOpen}
            >
              {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {mobileOpen ? (
          <div className="border-t border-white/10 bg-navy-900 px-3 py-3 lg:hidden">
            {nav(() => setMobileOpen(false))}
            <Button
              variant="accent"
              size="sm"
              className="mt-2 w-full"
              onClick={() => {
                const id = loadDemo();
                setActiveRun(id);
                window.location.assign("/verify");
              }}
            >
              <Zap className="h-3.5 w-3.5" />
              Load Official Hackathon Demo
            </Button>
          </div>
        ) : null}
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-[#E2E8F0] bg-white">
        <div className="mx-auto flex w-full max-w-[1360px] flex-col gap-2 px-4 py-6 text-xs text-navy-800/60 sm:flex-row sm:items-center sm:justify-between">
          <p>
            ClaimGuard · token-efficient, source-grounded verification layer for AI agents. Built for the Global AI
            Hackathon on HackCulture.
          </p>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>Tavily · stale-answer detection</span>
            <span className="hidden sm:inline">·</span>
            <span>Bifrost by Maxim AI · tiered routing</span>
            <span className="hidden sm:inline">·</span>
            <span>Human-in-the-loop by default</span>
          </p>
        </div>
      </footer>
    </div>
  );
}
