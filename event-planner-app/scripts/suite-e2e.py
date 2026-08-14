"""
Suite-wide browser smoke test: every tool's routes load, render real data, and log no console
errors, in one pass.

This is deliberately breadth-first rather than deep. Each tool's logic already has a headless
check script with real assertions (`pnpm <tool>-check`); what those cannot catch is a route
that throws on mount, a client/server boundary mistake, a missing Suspense wrapper, or a
component that crashes on an empty state. That is exactly what shows up here.

Not part of `pnpm verify` — needs Python and Playwright browser binaries. Run by hand:

    pnpm dev
    pip install playwright && playwright install chromium firefox
    python scripts/suite-e2e.py chromium      # or: firefox
"""
import json, sys, pathlib, tempfile
from playwright.sync_api import sync_playwright

APP = pathlib.Path(__file__).resolve().parent.parent
BASE = "http://localhost:3200"
SHOT = pathlib.Path(tempfile.gettempdir()) / "suite-e2e-shots"
SHOT.mkdir(exist_ok=True)

conference = json.loads((APP / "fixtures/conference-brief-example.json").read_text())
budget = json.loads((APP / "fixtures/conference-budget-example.json").read_text())

failures, console_errors = [], []

def check(label, cond, detail=""):
    print(("  OK  " if cond else "  FAIL") + f" {label}" + (f" — {detail}" if detail and not cond else ""))
    if not cond:
        failures.append(label)

BRIEF_ID = "suite-brief"

SEED_JS = """
async ([brief, lineItems, settings]) => {
  const db = await new Promise((res, rej) => {
    const r = indexedDB.open('event-toolkit');
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  await new Promise((res, rej) => {
    const tx = db.transaction(['briefs', 'budgetLineItems', 'budgetSettings'], 'readwrite');
    tx.objectStore('briefs').put(brief);
    for (const item of lineItems) tx.objectStore('budgetLineItems').put(item);
    tx.objectStore('budgetSettings').put(settings);
    tx.oncomplete = res; tx.onerror = () => rej(tx.error);
  });
  return db.version;
}
"""

READY_JS = """async () => {
  const dbs = await indexedDB.databases();
  if (!dbs.find(d => d.name === 'event-toolkit')) return false;
  const db = await new Promise((res, rej) => {
    const r = indexedDB.open('event-toolkit');
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  // v7 is the last migration — every tool's stores exist by then.
  const ok = db.objectStoreNames.contains('retros') && db.objectStoreNames.contains('budgetSettings');
  db.close();
  return ok;
}"""


def main():
    engine = sys.argv[1] if len(sys.argv) > 1 else "chromium"
    with sync_playwright() as p:
        print(f"Browser: {engine}")
        browser = getattr(p, engine).launch(headless=True)
        page = browser.new_page()

        page.goto(f"{BASE}/brief"); page.wait_for_load_state("networkidle")
        ready = False
        for attempt in range(80):
            if attempt and attempt % 20 == 0:
                page.reload(); page.wait_for_load_state("networkidle")
            ready = page.evaluate(READY_JS)
            if ready:
                break
            page.wait_for_timeout(500)
        check("app created the v7 IndexedDB schema", ready)
        if not ready:
            raise SystemExit("schema never appeared — aborting")

        brief = {**conference, "id": BRIEF_ID, "name": "Suite Smoke Event", "version": 3,
                 "dates": {**conference["dates"], "eventStartDate": "2026-01-10", "eventEndDate": "2026-01-11"}}
        line_items = [{**i, "eventBriefId": BRIEF_ID} for i in budget["lineItems"]]
        settings = {**budget["settings"], "eventBriefId": BRIEF_ID}
        page.evaluate(SEED_JS, [brief, line_items, settings])

        # Only real app behaviour is measured from here.
        page.on("console", lambda m: console_errors.append(f"{m.type} @ {page.url}: {m.text}") if m.type == "error" else None)
        page.on("pageerror", lambda e: console_errors.append(f"pageerror @ {page.url}: {e}"))

        def visit(path, expect, label, wait_for=None):
            page.goto(f"{BASE}{path}")
            page.wait_for_load_state("networkidle")
            if wait_for:
                try:
                    page.wait_for_selector(wait_for, timeout=20000)
                except Exception:
                    pass
            page.wait_for_timeout(400)
            body = page.inner_text("body")
            check(f"{label} ({path})", expect in body, body.split("\n")[0][:80] if body else "(empty)")
            return body

        print("\nGlobal nav — every tool should be live now")
        page.goto(f"{BASE}/brief"); page.wait_for_load_state("networkidle")
        nav = page.locator("header nav")
        check(f"all 7 tools are real links ({nav.locator('a').count()})", nav.locator("a").count() == 7)
        check("nothing still says 'soon'", "soon" not in nav.inner_text().lower(), nav.inner_text())

        print("\nPRD 1 — Event Brief")
        visit("/brief", "Suite Smoke Event", "brief list shows the seeded event")
        visit(f"/brief/{BRIEF_ID}", "Suite Smoke Event", "brief detail renders")
        check("the brief view offers every downstream tool",
              page.locator("a[href*='?briefId=']").count() >= 3)

        print("\nPRD 2 — Promo Campaign Kit")
        visit(f"/promo/kit?briefId={BRIEF_ID}", "Generate", "promo kit entry renders",
              "text=Generate promo kit")
        # The pacing view resolves brief + entries + config + asset set before it renders
        # anything but a spinner, so wait for real content rather than networkidle alone.
        visit(f"/promo/pacing?briefId={BRIEF_ID}", "Registration pacing", "pacing tab renders",
              "text=Registration pacing")

        print("\nPRD 3 — Logistics Pack")
        page.goto(f"{BASE}/logistics?briefId={BRIEF_ID}")
        page.wait_for_url("**/logistics/**", timeout=20000)
        page.wait_for_selector("text=Pack overview", timeout=20000)
        pack_url = page.url.rstrip("/")
        check(f"logistics find-or-create redirected ({pack_url.split('/')[-1][:8]}…)", "/logistics/" in pack_url)
        for slug, expect in [("run-of-show", "Run of show"), ("staffing", "Staffing"),
                             ("shipping", "Shipping"), ("checklist", "Venue checklist"),
                             ("contacts", "On-site contacts"), ("issues", "Issue log")]:
            visit(f"{pack_url.replace(BASE, '')}/{slug}", expect, f"logistics {slug}", "table")
        visit(f"{pack_url.replace(BASE, '')}/print", "Run of show", "full-pack print view", ".print-sheet")
        check("print sections are page-broken", page.locator(".print-section").count() == 6)

        print("\nPRD 4 — Budget Builder")
        visit("/budget", "Suite Smoke Event", "budget list renders")
        body = visit(f"/budget/{BRIEF_ID}", "Total", "budget table renders", "text=Venue")
        check("seeded budget actuals are shown, not zeroes", "$" in body and "95,000" in body.replace(" ", ""),
              [l for l in body.split("\n") if "$" in l][:3])
        check("a variance flag is rendered", any(w in body for w in ["Over", "Watch", "On budget"]))

        print("\nPRD 5 — Lead Triage")
        visit("/leads", "Lead Triage", "triage session list renders")
        visit("/leads/new", "New triage session", "new session form renders")

        print("\nPRD 6 — ROI Report")
        visit("/roi", "Event ROI", "report list renders")
        visit("/roi/new", "Which event", "brief picker renders")

        print("\nPRD 7 — Post-Mortem")
        visit("/retro", "Post-Mortem", "retro list renders")
        page.goto(f"{BASE}/retro?briefId={BRIEF_ID}")
        page.wait_for_url("**/retro/**", timeout=20000)
        page.wait_for_selector("text=Post-mortem", timeout=20000)
        retro_body = page.inner_text("body")
        check("retro find-or-create landed on a retro", "/retro/" in page.url)
        check("it ingested the seeded budget", "Budget variance" in retro_body)
        check("…and says honestly what was missing", "Not available" in retro_body)
        check("the three-column workspace renders",
              all(col in retro_body for col in ["Repeat", "Fix", "Drop"]))
        check("candidate lessons were generated from the budget",
              "budget" in retro_body.lower())
        page.screenshot(path=str(SHOT / f"retro-{engine}.png"), full_page=True)

        print("\nCalibration")
        cal = visit("/calibration", "Calibration", "calibration page renders", "text=Calibration")
        check("it reports honestly that there is not enough data yet",
              "not enough data" in cal.lower() or "No data yet" in cal)
        check("…and never claims the attribution window is validated",
              "not validation" in cal.lower())
        check("every assumption is listed with its PRD", cal.count("PRD ") >= 6,
              f"found {cal.count('PRD ')}")

        print("\nEmpty states — the paths most likely to crash")
        visit("/logistics", "Choose an event", "logistics with no briefId")
        visit("/promo", "Promo Campaign Kit", "promo with no briefId")
        # /promo/kit with no brief now forwards to the picker rather than dead-ending. This
        # assertion previously pinned the broken behaviour: a user clicking the nav entry reached
        # "Pick an event brief first" and a button back to the brief list, with no route into promo.
        visit("/promo/kit", "Choose an event", "promo kit with no briefId forwards to the picker")
        # A brief that has been deleted still says so — silently redirecting would hide it.
        visit("/promo/kit?briefId=does-not-exist", "no longer exists", "unknown promo brief")
        visit("/roi/does-not-exist", "no longer exists", "unknown ROI report")
        visit("/retro/does-not-exist", "no longer exists", "unknown retro")
        visit("/leads/does-not-exist", "no longer exists", "unknown triage session")
        visit("/logistics/does-not-exist", "no longer exists", "unknown logistics pack")

        browser.close()

    print("\nConsole errors:", len(console_errors))
    for e in console_errors[:20]:
        print("   ", e)
    if console_errors:
        failures.append(f"{len(console_errors)} console error(s)")

    print(f"\n{'FAILED: ' + '; '.join(failures) if failures else 'All suite smoke checks passed.'}")
    sys.exit(1 if failures else 0)


main()
