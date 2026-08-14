"""
Contrast audit, in both themes, against a running dev server.

Written after a design audit measured page headings at 1.05:1 in dark mode — the theme toggle had
shipped while every component still hard-coded `slate-*`, so the tokens flipped and the text did
not. Numbers are the only way to know that is fixed and stays fixed.

Alpha-aware: an element with no background of its own inherits whatever is actually painted behind
it. An earlier version of this script compared every element against black because of a string
mismatch on `rgba(0, 0, 0, 0)`, and cheerfully reported dark mode as passing while it was broken.

Thresholds are WCAG AA: 4.5:1 for body text, 3:1 for large text (>=24px, or >=18.66px bold).

Run with: pnpm a11y   (needs `pnpm dev` running and `pnpm e2e:setup` done)
"""

from playwright.sync_api import sync_playwright

def lum(c):
    def f(v):
        v = v/255
        return v/12.92 if v <= 0.03928 else ((v+0.055)/1.055)**2.4
    return 0.2126*f(c[0]) + 0.7152*f(c[1]) + 0.0722*f(c[2])

def ratio(a, b):
    la, lb = lum(a), lum(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi+0.05)/(lo+0.05)

def parse(s):
    return tuple(int(float(x)) for x in s.replace("rgba(","").replace("rgb(","").replace(")","").split(",")[:3])

ROUTES = ["/brief", "/promo/kit", "/logistics", "/budget", "/leads", "/roi", "/retro", "/calibration", "/sign-in"]

# Alpha-aware: an element with no background inherits whatever is actually painted behind it.
JS = """() => {
  const opaque = (c) => {
    const m = c.match(/rgba?\\(([^)]+)\\)/); if (!m) return false;
    const p = m[1].split(',').map(s => parseFloat(s));
    return p.length < 4 || p[3] > 0.5;
  };
  const out = [];
  for (const el of document.querySelectorAll('h1,h2,h3,h4,p,td,th,span,a,label,li,button,summary')) {
    const text = (el.textContent || '').trim();
    if (!text) continue;
    if (el.children.length && el.firstElementChild) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue;
    const size = parseFloat(cs.fontSize);
    if (!size) continue;
    let node = el, bg = null;
    while (node) {
      const c = getComputedStyle(node).backgroundColor;
      if (opaque(c)) { bg = c; break; }
      node = node.parentElement;
    }
    if (!bg) bg = getComputedStyle(document.body).backgroundColor;
    out.push({ t: text.slice(0, 34), fg: cs.color, bg, size: cs.fontSize, weight: cs.fontWeight });
  }
  return out;
}"""

failed_total = 0

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    for scheme in ("light", "dark"):
        print(f"\n=== {scheme.upper()} ===")
        ctx = b.new_context(color_scheme=scheme, viewport={"width":1280,"height":900})
        pg = ctx.new_page()
        fails, checked = [], 0
        for route in ROUTES:
            pg.goto(f"http://localhost:3000{route}", wait_until="networkidle")
            pg.wait_for_timeout(200)
            for r in pg.evaluate(JS):
                try:
                    cr = ratio(parse(r["fg"]), parse(r["bg"]))
                except Exception:
                    continue
                checked += 1
                size, weight = float(r["size"].replace("px","")), int(r["weight"])
                large = size >= 24 or (size >= 18.66 and weight >= 700)
                need = 3.0 if large else 4.5
                if cr < need:
                    fails.append((round(cr,2), need, route, r["t"], r["size"]))
        fails.sort()
        print(f"  checked {checked} text nodes")
        if not fails:
            print("  ✓ everything meets WCAG AA")
        else:
            seen = set()
            for cr, need, route, t, size in fails:
                if (t[:20], route) in seen: continue
                seen.add((t[:20], route))
                print(f"  {cr:5.2f}:1 (needs {need})  {route:13} {size:>5}  {t!r}")
                if len(seen) >= 12: break
            print(f"  {len(fails)} failing nodes")
            failed_total += len(fails)
        ctx.close()
    b.close()

if failed_total:
    print(f"\n{failed_total} contrast failure(s). Both themes must meet AA.\n")
    raise SystemExit(1)
print("\nBoth themes meet WCAG AA.\n")
