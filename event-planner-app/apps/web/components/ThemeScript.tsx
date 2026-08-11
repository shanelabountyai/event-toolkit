/**
 * Applies the theme before first paint.
 *
 * This has to be an inline, blocking script in <head>. Any React-based approach runs after the
 * first paint, which means a dark-mode user gets a white flash on every single navigation — the
 * single most noticeable way to get dark mode wrong.
 *
 * The logic is deliberately tiny and duplicated from `theme.ts` rather than imported, because it
 * must not depend on a bundle that has not loaded yet.
 */
export function ThemeScript() {
  const script = `
(function () {
  try {
    var stored = localStorage.getItem('event-toolkit:theme');
    var dark = stored === 'dark' || (stored !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', dark);
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  } catch (e) {
    /* Private browsing can throw on localStorage. Falling back to light is fine. */
  }
})();
`;
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
