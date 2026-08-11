"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SUITE_TOOLS } from "@/lib/tools";
import { ThemeToggle } from "@/components/ThemeToggle";
import { WorkspaceSync } from "@/components/WorkspaceSync";

/**
 * The suite nav.
 *
 * On a phone it collapses to the app name and a menu button. The expanded version costs 305px of
 * a 812px viewport — 37% of the screen before any content — on every route, and this product's
 * hardest case is a planner reading a run of show one-handed in a venue. They have already
 * navigated; the nav is pure overhead at that moment.
 *
 * Above `md` it is the same row it always was.
 */
export function SiteNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // A tap that navigates should also close the menu, or the destination arrives behind it.
  useEffect(() => setOpen(false), [pathname]);

  return (
    <header className="no-print border-b border-line bg-surface">
      <div className="mx-auto flex max-w-6xl items-center gap-x-6 gap-y-2 px-4 py-2 sm:px-6 sm:py-3">
        <Link
          href="/brief"
          className="flex min-h-11 items-center text-sm font-semibold tracking-tight text-content"
        >
          Event Planner Suite
        </Link>

        {/* Desktop: the full row. Driven by `tool.available`, so shipping a PRD lights up its entry. */}
        <nav className="hidden items-center gap-1 text-sm md:flex md:flex-wrap">
          {SUITE_TOOLS.map((tool) => (
            <NavItem key={tool.key} tool={tool} active={pathname.startsWith(tool.href)} />
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <WorkspaceSync />
          <div className="hidden md:block">
            <ThemeToggle />
          </div>
          <Link
            href="/workspace"
            className="hidden min-h-11 items-center rounded-md px-2.5 text-sm font-medium text-content-muted hover:bg-surface-hover hover:text-content md:inline-flex"
          >
            Account
          </Link>

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="site-menu"
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-content-muted hover:bg-surface-hover hover:text-content md:hidden"
          >
            <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              {open ? (
                <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              ) : (
                <path d="M3 6h14M3 10h14M3 14h14" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {open ? (
        <nav id="site-menu" className="border-t border-line px-4 pb-3 pt-2 md:hidden">
          <div className="flex flex-col">
            {SUITE_TOOLS.map((tool) => (
              <NavItem key={tool.key} tool={tool} active={pathname.startsWith(tool.href)} block />
            ))}
            <Link
              href="/workspace"
              className="flex min-h-11 items-center rounded-md px-2 text-sm font-medium text-content-muted hover:bg-surface-hover"
            >
              Account
            </Link>
          </div>
          <div className="mt-3 border-t border-line pt-3">
            <ThemeToggle />
          </div>
        </nav>
      ) : null}
    </header>
  );
}

function NavItem({
  tool,
  active,
  block = false,
}: {
  tool: (typeof SUITE_TOOLS)[number];
  active: boolean;
  block?: boolean;
}) {
  const shape = block
    ? "flex min-h-11 items-center rounded-md px-2 text-sm"
    : "inline-flex min-h-11 items-center rounded-md px-2.5 text-sm";

  if (!tool.available) {
    return (
      <span
        aria-disabled="true"
        title={`${tool.name} — coming soon (PRD ${tool.prd})`}
        className={`${shape} cursor-not-allowed text-content-subtle`}
      >
        {tool.name}
        <span className="ml-1.5 text-[11px] uppercase tracking-wide text-content-subtle">soon</span>
      </span>
    );
  }

  return (
    <Link
      href={tool.href}
      aria-current={active ? "page" : undefined}
      className={`${shape} font-medium ${
        active ? "bg-surface-hover text-content" : "text-content hover:bg-surface-hover"
      }`}
    >
      {tool.name}
    </Link>
  );
}
