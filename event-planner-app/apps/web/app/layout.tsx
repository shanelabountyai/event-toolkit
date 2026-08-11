import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { SUITE_TOOLS } from "@/lib/tools";
import { WorkspaceSync } from "@/components/WorkspaceSync";

export const metadata: Metadata = {
  title: "Event Planner Productivity Suite",
  description:
    "Standalone, local-first toolkit for corporate and field marketing event planners. Event Brief Generator and Promo Campaign Kit.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="flex min-h-full flex-col">
          <header className="no-print border-b border-slate-200 bg-white">
            <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-3">
              <Link href="/brief" className="text-sm font-semibold tracking-tight text-slate-900">
                Event Planner Suite
              </Link>
              {/* Driven by `tool.available`, so shipping a PRD lights up its nav entry. */}
              <nav className="flex flex-wrap items-center gap-1 text-sm">
                {SUITE_TOOLS.map((tool) =>
                  tool.available ? (
                    <Link
                      key={tool.key}
                      href={tool.href}
                      className="rounded-md px-2.5 py-1.5 font-medium text-slate-900 hover:bg-slate-100"
                    >
                      {tool.name}
                    </Link>
                  ) : (
                    <span
                      key={tool.key}
                      aria-disabled="true"
                      title={`${tool.name} — coming soon (PRD ${tool.prd})`}
                      className="cursor-not-allowed rounded-md px-2.5 py-1.5 text-slate-400"
                    >
                      {tool.name}
                      <span className="ml-1.5 text-[10px] uppercase tracking-wide text-slate-300">
                        soon
                      </span>
                    </span>
                  ),
                )}
              </nav>
              {/*
                A plain link rather than a session-aware badge. Reading the session here would make
                the root layout dynamic and opt every static page in the suite out of prerendering,
                to save one click. /workspace sends you to sign-in if you are not signed in.
              */}
              <div className="ml-auto flex items-center gap-3">
                <WorkspaceSync />
              </div>
              <Link
                href="/workspace"
                className="rounded-md px-2.5 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              >
                Account
              </Link>
            </div>
          </header>
          <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">{children}</main>
          <footer className="no-print border-t border-slate-200 bg-white">
            <div className="mx-auto max-w-6xl px-6 py-4 text-xs text-slate-500">
              Without an account, everything stays in this browser via IndexedDB — no server, no
              sync — and that is a supported way to work, not a trial. Sign in to share a workspace
              with colleagues across devices. Export a brief to Markdown, HTML or JSON either
              way.{" "}
              <Link href="/calibration" className="font-medium underline underline-offset-4 hover:text-slate-700">
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
