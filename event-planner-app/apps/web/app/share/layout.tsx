/**
 * The share view has its own chrome, deliberately.
 *
 * Everything else renders through the root layout, which carries seven tool names, a theme
 * switcher, an Account link and a footer explaining IndexedDB — 305px of it on a phone. The
 * audience here is a vendor, an AV tech or a venue contact who is not a customer, opening one
 * link on bad wifi to read one artifact. Showing them the product's internal surface area is both
 * noise and an advertisement they did not ask for.
 */
export default function ShareLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-col bg-canvas">
      <header className="no-print border-b border-line bg-surface">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3">
          <span className="text-sm font-semibold tracking-tight text-content">Event day</span>
          <span className="text-xs text-content-subtle">Shared with you · read-only</span>
        </div>
      </header>
      <div className="flex-1">{children}</div>
      <footer className="no-print border-t border-line bg-surface">
        <div className="mx-auto max-w-2xl px-4 py-3 text-xs text-content-subtle">
          You&rsquo;re seeing one event&rsquo;s schedule because somebody shared it. Nothing you do
          here changes it, apart from reporting a problem.
        </div>
      </footer>
    </div>
  );
}
