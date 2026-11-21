import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    container: {
      center: true,
      padding: "1rem",
      screens: { "2xl": "1360px" },
    },
    extend: {
      colors: {
        // Deep navy shell (product spec: #0B132B)
        navy: {
          50: "#EEF3FA",
          100: "#D7E1F0",
          200: "#AFC3E0",
          300: "#7B99C8",
          400: "#45699E",
          500: "#1C2B54",
          600: "#152347",
          700: "#101B39",
          800: "#0B132B",
          900: "#070D1F",
          950: "#040813",
        },
        // Electric teal / blue accent (product spec: #00B4D8)
        accent: {
          DEFAULT: "#00B4D8",
          50: "#E8FAFE",
          100: "#CEF4FD",
          200: "#9CE9FB",
          300: "#66DDF8",
          400: "#33D1F5",
          500: "#00B4D8",
          600: "#0093B4",
          700: "#00738D",
          800: "#005366",
          900: "#003340",
        },
        verdict: {
          supported: "#15803D",
          "supported-soft": "#DCFCE7",
          "supported-line": "#86EFAC",
          partial: "#B45309",
          "partial-soft": "#FEF3C7",
          "partial-line": "#FCD34D",
          contradicted: "#B91C1C",
          "contradicted-soft": "#FEE2E2",
          "contradicted-line": "#FCA5A5",
          unverifiable: "#475569",
          "unverifiable-soft": "#F1F5F9",
          "unverifiable-line": "#CBD5E1",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
      },
      borderRadius: {
        lg: "0.625rem",
        md: "0.4375rem",
        sm: "0.3125rem",
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "pulse-soft": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.45" },
        },
        "shimmer": {
          "0%": { backgroundPosition: "-400px 0" },
          "100%": { backgroundPosition: "400px 0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "pulse-soft": "pulse-soft 1.4s ease-in-out infinite",
        shimmer: "shimmer 1.6s linear infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
