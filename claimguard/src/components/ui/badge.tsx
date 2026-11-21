import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide transition-colors",
  {
    variants: {
      variant: {
        default: "border-transparent bg-navy-800/5 text-navy-800",
        accent: "border-accent-200 bg-accent-50 text-accent-700",
        supported: "border-verdict-supported-line bg-verdict-supported-soft text-verdict-supported",
        partial: "border-verdict-partial-line bg-verdict-partial-soft text-verdict-partial",
        contradicted: "border-verdict-contradicted-line bg-verdict-contradicted-soft text-verdict-contradicted",
        unverifiable: "border-verdict-unverifiable-line bg-verdict-unverifiable-soft text-verdict-unverifiable",
        simulated: "border-amber-400 bg-amber-100 text-amber-800",
        outline: "border-slate-300 bg-white text-navy-800/70",
        onDark: "border-white/20 bg-white/10 text-white/90",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { badgeVariants };
