import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { SUITE_TOOLS } from "@/lib/tools";

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
              <span className="ml-auto text-xs text-slate-400">
                Local-first · data stays in this browser
              </span>
            </div>
          </header>
          <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">{children}</main>
          <footer className="no-print border-t border-slate-200 bg-white">
            <div className="mx-auto max-w-6xl px-6 py-4 text-xs text-slate-500">
              v1 stores everything in this browser via IndexedDB — no account, no server, no
              sync. Export a brief to Markdown, HTML or JSON to back it up or share it.
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
