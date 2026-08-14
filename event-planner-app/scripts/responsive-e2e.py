"""
Responsive audit: does anything overflow, and does any content require a sideways swipe?

Written after an audit found the landing page scrolling to 999px inside a 375px viewport, and the
budget page rendering line-item names as a single character inside 50 nested horizontal scrollers.
Both look fine in a screenshot taken at desktop width.

Two things are checked:
  1. Whole-page horizontal scroll. Always a bug — the page slides sideways under your thumb.
  2. Nested horizontal scrollers with real overflow, reported per route. Not always wrong (a wide
     analytical table on a desktop is fine) but on a phone it competes with the page scroll and
     with the browser's back-swipe, so it is worth knowing about.

Run with: pnpm responsive   (needs `pnpm dev` running and `pnpm e2e:setup` done)
"""

import sys
from playwright.sync_api import sync_playwright

ROUTES = [
    "/brief", "/brief/new", "/promo", "/promo/kit", "/promo/pacing",
    "/logistics", "/budget", "/leads", "/roi", "/retro", "/calibration",
    "/sign-in", "/verify", "/workspace",
]

MEASURE = """() => {
  const doc = document.documentElement;
  const scrollers = [...document.querySelectorAll('*')].filter((el) => {
    const cs = getComputedStyle(el);
    return (cs.overflowX === 'auto' || cs.overflowX === 'scroll') && el.scrollWidth > el.clientWidth + 2;
  }).map((el) => ({
    tag: el.tagName.toLowerCase(),
    cls: (el.className || '').toString().slice(0, 40),
    content: el.scrollWidth,
    well: el.clientWidth,
  }));
  // Anything actually painted past the right edge.
  const spills = [...document.querySelectorAll('*')].filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.right > doc.clientWidth + 2;
  }).length;
  return { page: doc.scrollWidth, viewport: doc.clientWidth, scrollers, spills };
}"""

failures = 0

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    for width, label in ((375, "phone"), (1440, "desktop")):
        print(f"\n=== {label} ({width}px) ===")
        ctx = browser.new_context(viewport={"width": width, "height": 900})
        page = ctx.new_page()
        for route in ROUTES:
            try:
                page.goto(f"http://localhost:3200{route}", wait_until="networkidle", timeout=20000)
                page.wait_for_timeout(150)
            except Exception as e:
                print(f"  !! {route}: {type(e).__name__}")
                failures += 1
                continue
            m = page.evaluate(MEASURE)
            problems = []
            if m["page"] > m["viewport"] + 2:
                problems.append(f"PAGE SCROLLS SIDEWAYS {m['page']}px > {m['viewport']}px")
                failures += 1
            if width == 375 and m["scrollers"]:
                worst = max(m["scrollers"], key=lambda s: s["content"])
                problems.append(
                    f"{len(m['scrollers'])} nested scroller(s), widest {worst['content']}px in {worst['well']}px"
                )
            if problems:
                print(f"  {route:16} {' · '.join(problems)}")
        ctx.close()
    browser.close()

if failures:
    print(f"\n{failures} route(s) scroll sideways or failed to load.\n")
    sys.exit(1)
print("\nNo page scrolls sideways at either width.\n")
