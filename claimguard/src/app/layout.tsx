import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { AppShell } from "@/components/app-shell";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
  display: "swap",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "ClaimGuard — Source-grounded verification for AI agents",
    template: "%s · ClaimGuard",
  },
  description:
    "ClaimGuard turns uncertain AI answers into evidence-backed, source-linked, human-approved answers. Token-efficient claim verification with Tavily stale-answer detection and Bifrost tiered routing.",
  keywords: [
    "AI verification",
    "stale answer detection",
    "Tavily",
    "Bifrost",
    "Maxim AI",
    "hallucination detection",
    "human in the loop",
    "LLM fact checking",
  ],
  authors: [{ name: "ClaimGuard" }],
  openGraph: {
    title: "ClaimGuard — Token-efficient, source-grounded verification layer",
    description:
      "Every claim gets exactly one of five verdicts, a real citation, and a human approval gate.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#0B132B",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
