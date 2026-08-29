"""
End-to-end drive of the Promo Campaign Kit (PRD 2) against a running dev server.

Not part of `pnpm verify` — it needs Python and Playwright browser binaries, which CI does not
install. Run it by hand when changing the promo UI:

    pnpm dev                                    # in one terminal
    pip install playwright && playwright install chromium firefox
    python scripts/promo-e2e.py chromium        # or: firefox

Briefs are seeded straight into IndexedDB so the run does not depend on the PRD 1 intake wizard.
Console/page-error listeners deliberately attach *after* seeding: errors raised by Playwright's
own evaluate sandbox are harness artefacts, not app behaviour.
"""
import json, sys, pathlib, tempfile
from playwright.sync_api import sync_playwright

APP = pathlib.Path(__file__).resolve().parent.parent
BASE = "http://localhost:3200"
SHOT = pathlib.Path(tempfile.gettempdir()) / "promo-e2e-shots"
SHOT.mkdir(exist_ok=True)

conference = json.loads((APP / "fixtures/conference-brief-example.json").read_text())

failures, console_errors = [], []

def check(label, cond, detail=""):
    print(("  OK  " if cond else "  FAIL") + f" {label}" + (f" — {detail}" if detail and not cond else ""))
    if not cond:
        failures.append(label)

SEED_JS = """
async ([briefs]) => {
  const db = await new Promise((res, rej) => {
    const r = indexedDB.open('event-toolkit');
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  await new Promise((res, rej) => {
    const tx = db.transaction('briefs', 'readwrite');
    for (const b of briefs) tx.objectStore('briefs').put(b);
    tx.oncomplete = res; tx.onerror = () => rej(tx.error);
  });
  return db.version;
}
"""

BUMP_JS = """
async ([id, name]) => {
  const db = await new Promise((res, rej) => {
    const r = indexedDB.open('event-toolkit');
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  const store = () => db.transaction('briefs', 'readwrite').objectStore('briefs');
  const brief = await new Promise((res, rej) => { const g = store().get(id); g.onsuccess = () => res(g.result); g.onerror = () => rej(g.error); });
  brief.version += 1; brief.name = name;
  await new Promise((res, rej) => { const p = store().put(brief); p.onsuccess = res; p.onerror = () => rej(p.error); });
  return brief.version;
}
"""

def main():
    with sync_playwright() as p:
        engine = sys.argv[1] if len(sys.argv) > 1 else "chromium"
        print(f"Browser: {engine}")
        browser = getattr(p, engine).launch(headless=True)
        page = browser.new_page()

        # Let the app create/upgrade the database, then seed briefs into it. The app opens
        # IndexedDB after hydration, so poll until the stores actually exist.
        page.goto(f"{BASE}/brief"); page.wait_for_load_state("networkidle")
        ready = False
        for attempt in range(80):
            if attempt and attempt % 20 == 0:
                page.reload(); page.wait_for_load_state("networkidle")
            ready = page.evaluate("""async () => {
              const dbs = await indexedDB.databases();
              const found = dbs.find(d => d.name === 'event-toolkit');
              if (!found) return false;
              const db = await new Promise((res, rej) => {
                const r = indexedDB.open('event-toolkit');
                r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
              });
              const ok = db.objectStoreNames.contains('briefs');
              db.close();
              return ok;
            }""")
            if ready:
                break
            page.wait_for_timeout(500)
        check("app created the IndexedDB schema", ready)
        if not ready:
            raise SystemExit("app never opened IndexedDB — aborting before the seed")

        full = {**conference, "id": "e2e-conf", "name": "E2E Conference", "version": 3}
        no_metric = {**conference, "id": "e2e-nometric", "name": "E2E No Metric", "version": 1, "successMetrics": []}
        no_date = {**conference, "id": "e2e-nodate", "name": "E2E No Date", "version": 1,
                   "dates": {**conference["dates"], "eventStartDate": ""}}
        version = page.evaluate(SEED_JS, [[full, no_metric, no_date]])
        check(f"seeded 3 briefs into IndexedDB v{version}", version >= 2, f"version={version}")

        # Listeners attach only now: errors raised by the seeding harness above are Playwright
        # sandbox artefacts, not app behaviour. Everything from here is the real user flow.
        page.on("console", lambda m: console_errors.append(f"{m.type}: {m.text}") if m.type == "error" else None)
        page.on("pageerror", lambda e: console_errors.append(f"pageerror at {page.url}: {e}"))

        # ---- Global nav ---------------------------------------------------
        print("\nGlobal nav")
        nav = page.locator("header nav")
        check("Promo Campaign Kit is a real nav link, not 'soon'",
              nav.locator("a", has_text="Promo Campaign Kit").count() == 1,
              nav.inner_text().replace("\n", " | "))
        # Was "unbuilt tools still read 'soon'" — obsolete since PRD 7 shipped and every tool
        # in the registry is live. The nav is now fully built out.
        check(f"every tool in the nav is a real link ({nav.locator('a').count()})",
              nav.locator("a").count() == 7 and "soon" not in nav.inner_text().lower())

        # ---- Generation guard --------------------------------------------
        print("\nGeneration guard")
        page.goto(f"{BASE}/promo/kit?briefId=e2e-nodate"); page.wait_for_load_state("networkidle")
        page.wait_for_selector("text=Generate promo kit", timeout=20000)
        gen = page.get_by_role("button", name="Generate promo kit")
        check("generate is blocked with no start date", gen.is_disabled())
        check("the blocked reason names the field", page.get_by_text("Event start date").count() > 0)
        page.screenshot(path=str(SHOT / "01-blocked.png"), full_page=True)

        # ---- Generate ----------------------------------------------------
        print("\nGenerate the kit")
        page.goto(f"{BASE}/promo/kit?briefId=e2e-conf"); page.wait_for_load_state("networkidle")
        page.wait_for_selector("text=Generate promo kit", timeout=20000)
        check("home screen previews the 18 assets", page.get_by_text("Generate 18 promo assets from this brief").count() > 0)
        page.get_by_role("button", name="Generate promo kit").click()
        page.wait_for_selector("text=18 assets", timeout=15000)
        textareas = page.locator("textarea")
        check(f"18 asset cards rendered ({textareas.count()})", textareas.count() == 18)
        check("all four sections present", all(page.get_by_text(s, exact=True).count() > 0
              for s in ["Landing page", "Email sequence", "Social posts", "Sales outreach"]))
        body = page.content()
        check("no un-interpolated tokens on the page", "{{" not in body)
        check("copy is branched for an in-person conference", "Moscone West" in body)
        page.screenshot(path=str(SHOT / "02-kit.png"), full_page=True)

        # ---- Edit + persistence ------------------------------------------
        print("\nEdit an asset and reload")
        first = textareas.first
        original = first.input_value()
        first.fill(original + "\n\nAdded by the planner during E2E.")
        page.wait_for_timeout(1200)  # debounce + write
        page.reload(); page.wait_for_load_state("networkidle")
        page.wait_for_selector("textarea", timeout=15000)
        check("the edit survived a reload", "Added by the planner during E2E." in page.locator("textarea").first.input_value())
        check("an edit-distance badge appeared", page.get_by_text("% edited").count() > 0)
        check("the header counts the edit", page.get_by_text("1 edited").count() > 0)
        page.screenshot(path=str(SHOT / "03-edited.png"), full_page=True)

        # ---- Staleness + regenerate --------------------------------------
        print("\nBump the brief, then regenerate")
        new_version = page.evaluate(BUMP_JS, ["e2e-conf", "E2E Conference (renamed)"])
        check(f"brief bumped to version {new_version}", new_version == 4)
        page.reload(); page.wait_for_load_state("networkidle")
        page.wait_for_selector("textarea", timeout=15000)
        check("stale banner appears", page.get_by_text("The brief has changed since this kit was generated.").count() > 0)
        page.screenshot(path=str(SHOT / "04-stale.png"), full_page=True)

        page.get_by_role("button", name="Review and regenerate").click()
        page.wait_for_selector("[role=dialog]", timeout=10000)
        check("dialog flags the edited asset as skipped", page.get_by_text("Edited — will be skipped").count() > 0)
        check("dialog shows assets that will update", page.get_by_text("Will update").count() > 0)
        page.screenshot(path=str(SHOT / "05-regen-dialog.png"), full_page=True)
        page.get_by_role("button", name="Regenerate", exact=True).click()
        page.wait_for_timeout(1200)
        check("stale banner cleared after regenerating",
              page.get_by_text("The brief has changed since this kit was generated.").count() == 0)
        check("the edited asset kept the planner's copy",
              "Added by the planner during E2E." in page.locator("textarea").first.input_value())
        check("unedited assets picked up the renamed event", "(renamed)" in page.content())
        page.screenshot(path=str(SHOT / "06-after-regen.png"), full_page=True)

        # ---- Pacing blocked state ----------------------------------------
        print("\nPacing")
        page.goto(f"{BASE}/promo/pacing?briefId=e2e-nometric"); page.wait_for_load_state("networkidle")
        page.wait_for_selector("text=This brief has no registration goal yet", timeout=20000)
        check("pacing blocked without a registration metric",
              page.get_by_text("This brief has no registration goal yet").count() > 0)
        check("blocked state links back to the brief",
              page.get_by_role("link", name="Add a registration metric to the brief").count() > 0)
        page.screenshot(path=str(SHOT / "07-pacing-blocked.png"), full_page=True)

        page.goto(f"{BASE}/promo/pacing?briefId=e2e-conf"); page.wait_for_load_state("networkidle")
        page.wait_for_selector("#pacing-count", timeout=20000)
        check("pacing unblocked with a registration metric", page.get_by_text("Registrations so far").count() > 0)
        page.fill("#pacing-date", "2026-09-15")
        # 20 against a target of 25 is a 20% shortfall, which is Behind Pace
        # (on_pace is <=10%, critical is >25%). It has to be BELOW target: the
        # next check asserts interventions appear, and recommendedInterventions()
        # returns [] on_pace. This previously read 40 — fifteen AHEAD of target —
        # so the app correctly rendered nothing and the assertion below failed.
        page.fill("#pacing-count", "20")
        page.get_by_role("button", name="Add", exact=True).click()
        page.wait_for_timeout(800)
        rows = page.locator("tbody tr")
        row_text = rows.first.inner_text() if rows.count() else ""
        check(f"the entry landed in the table ({rows.count()} row(s): {row_text!r})",
              rows.count() == 1 and "20" in row_text and "2026" in row_text)
        check("a status badge is shown", any(page.get_by_text(s, exact=True).count() > 0
              for s in ["On pace", "Behind pace", "Critical"]))
        check("interventions appear when behind", page.get_by_text("Recommended next steps").count() > 0)
        check("the chart rendered", page.locator("svg polyline").count() >= 1)
        page.screenshot(path=str(SHOT / "08-pacing.png"), full_page=True)

        # ---- Deep link from an intervention -------------------------------
        link = page.get_by_role("link", name__contains="Open") if False else page.locator("a[href*='#asset-']").first
        href = link.get_attribute("href")
        link.click()
        page.wait_for_load_state("networkidle")
        page.wait_for_selector("textarea", timeout=15000)
        page.wait_for_timeout(600)
        asset_id = href.split("#asset-")[1]
        check("intervention deep link resolves to a real card", page.locator(f"#asset-{asset_id}").count() == 1)
        # `border-accent`, not `border-sky-400`: AssetCard styles the highlight with the
        # semantic token (AssetCard.tsx:73). The literal Tailwind colour it used to carry was
        # replaced by the design-token migration, and this assertion kept naming the old one.
        check("the linked card is highlighted", "border-accent" in (page.locator(f"#asset-{asset_id}").get_attribute("class") or ""))
        page.screenshot(path=str(SHOT / "09-deeplink.png"), full_page=True)

        # ---- Two-brief isolation ------------------------------------------
        print("\nIsolation")
        page.goto(f"{BASE}/promo/kit?briefId=e2e-nometric"); page.wait_for_load_state("networkidle")
        page.wait_for_selector("text=Generate promo kit", timeout=20000)
        check("a second brief has its own (empty) kit",
              page.get_by_role("button", name="Generate promo kit").count() == 1)
        page.goto(f"{BASE}/promo/pacing?briefId=e2e-nometric"); page.wait_for_load_state("networkidle")
        check("second brief shows no pacing rows from the first", page.locator("tbody tr td").count() == 0)

        # ---- Launch link from the brief view -------------------------------
        page.goto(f"{BASE}/brief/e2e-conf"); page.wait_for_load_state("networkidle")
        page.wait_for_selector("text=Launch a tool from this brief", timeout=20000)
        # `/promo`, not `/promo/kit`: the brief view builds this from the tools registry
        # (lib/tools.ts:35, href "/promo"). `/promo/kit` was the entry point before the tool
        # grew kit/pacing tabs and `/promo` became the landing route.
        launch = page.locator("a[href='/promo?briefId=e2e-conf']")
        check("brief view has a live Promo Campaign Kit link", launch.count() == 1)
        launch.first.click()
        landed = True
        try:
            page.wait_for_url("**/promo/kit**", timeout=10000)
        except Exception:
            landed = False
        check(f"it lands on the kit (url={page.url})", landed and "/promo/kit" in page.url)

        browser.close()

    print("\nConsole errors:", len(console_errors))
    for e in console_errors[:15]:
        print("   ", e)
    if console_errors:
        failures.append(f"{len(console_errors)} console error(s)")

    print(f"\n{'FAILED: ' + ', '.join(failures) if failures else 'All browser checks passed.'}")
    sys.exit(1 if failures else 0)

main()
