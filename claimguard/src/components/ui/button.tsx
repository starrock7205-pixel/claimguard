import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-navy-800 text-white shadow-sm hover:bg-navy-700 active:bg-navy-900",
        accent: "bg-accent-500 text-navy-900 shadow-sm hover:bg-accent-400 active:bg-accent-600",
        outline: "border border-[#CBD5E1] bg-white text-navy-800 shadow-sm hover:border-accent-500 hover:text-accent-700",
        ghost: "text-navy-800/80 hover:bg-navy-800/5 hover:text-navy-800",
        subtle: "bg-navy-800/5 text-navy-800 hover:bg-navy-800/10",
        destructive: "bg-verdict-contradicted text-white shadow-sm hover:bg-red-700",
        success: "bg-verdict-supported text-white shadow-sm hover:bg-green-700",
        link: "text-accent-700 underline-offset-4 hover:underline",
        onDark: "bg-white/10 text-white hover:bg-white/20",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-10 px-4",
        lg: "h-12 px-6 text-base",
        icon: "h-9 w-9",
        iconSm: "h-7 w-7",
      },
    },
    defaultVariants: { variant: "default", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = "button", ...props }, ref) => (
    <button ref={ref} type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  ),
);
Button.displayName = "Button";

export { buttonVariants };
