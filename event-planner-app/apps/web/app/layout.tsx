import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { ThemeScript } from "@/components/ThemeScript";
import { SiteNav } from "@/components/SiteNav";

export const metadata: Metadata = {
  title: "Event Planner Productivity Suite",
  description:
    "Standalone, local-first toolkit for corporate and field marketing event planners. Event Brief Generator and Promo Campaign Kit.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: ThemeScript adds a class to <html> before React hydrates, which
    // is the point of it. Without this, React logs a mismatch for the one element it should.
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body>
        <div className="flex min-h-full flex-col">
          <SiteNav />
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">{children}</main>
          <footer className="no-print border-t border-line bg-surface">
            <div className="mx-auto max-w-6xl px-4 py-4 text-xs text-content-muted sm:px-6">
              Without an account, everything stays in this browser via IndexedDB — no server, no
              sync — and that is a supported way to work, not a trial. Sign in to share a workspace
              with colleagues across devices. Export a brief to Markdown, HTML or JSON either
              way.{" "}
              <Link href="/calibration" className="font-medium underline underline-offset-4 hover:text-content">
                Calibration
              </Link>{" "}
              shows what your recorded data says about the suite&rsquo;s default assumptions.
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
