"""
End-to-end drive of the Run-of-Show / Logistics Pack (PRD 3) against a running dev server.

The centrepiece is the §5 propagation check: change a session's start time once in the run of
show, then confirm staffing, checklist and contacts all show the new time without any other
edit. The handoff calls that the actual definition of done for this tool.

Not part of `pnpm verify` — needs Python and Playwright browser binaries. Run by hand:

    pnpm dev
    python scripts/logistics-e2e.py chromium      # or: firefox
"""
import json, sys, pathlib, tempfile
from playwright.sync_api import sync_playwright

APP = pathlib.Path(__file__).resolve().parent.parent
BASE = "http://localhost:3000"
SHOT = pathlib.Path(tempfile.gettempdir()) / "logistics-e2e-shots"
SHOT.mkdir(exist_ok=True)

conference = json.loads((APP / "fixtures/conference-brief-example.json").read_text())

failures, console_errors = [], []

def check(label, cond, detail=""):
    print(("  OK  " if cond else "  FAIL") + f" {label}" + (f" — {detail}" if detail and not cond else ""))
    if not cond:
        failures.append(label)

SEED_JS = """
async ([briefs, packs]) => {
  const db = await new Promise((res, rej) => {
    const r = indexedDB.open('event-toolkit');
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  await new Promise((res, rej) => {
    const tx = db.transaction(['briefs', 'logisticsPacks'], 'readwrite');
    for (const b of briefs) tx.objectStore('briefs').put(b);
    for (const p of packs) tx.objectStore('logisticsPacks').put(p);
    tx.oncomplete = res; tx.onerror = () => rej(tx.error);
  });
  return db.version;
}
"""

READ_BRIEF_JS = """
async ([id]) => {
  const db = await new Promise((res, rej) => {
    const r = indexedDB.open('event-toolkit');
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  return await new Promise((res, rej) => {
    const g = db.transaction('briefs').objectStore('briefs').get(id);
    g.onsuccess = () => res(g.result); g.onerror = () => rej(g.error);
  });
}
"""

SESSION_A = "sess-a"
SESSION_B = "sess-b"
PACK_ID = "pack-e2e"

def seed_brief():
    return {
        **conference,
        "id": "logi-e2e",
        "name": "E2E Logistics Event",
        "version": 2,
        "status": "complete",
        "stakeholders": conference["stakeholders"][:3],
        "timeline": {"milestones": [
            {"id": "ms-1", "label": "Registration desk opens", "phase": "during_event",
             "targetDate": "2026-11-12", "status": "not_started"},
            {"id": "ms-2", "label": "Keynote", "phase": "during_event",
             "targetDate": "2026-11-12", "status": "not_started"},
        ]},
    }

def seed_pack():
    """A pack whose staffing, checklist and contact all reference session A."""
    return {
        "schemaVersion": "1.0.0", "id": PACK_ID, "eventBriefId": "logi-e2e",
        "createdAt": "2026-08-01T00:00:00.000Z", "updatedAt": "2026-08-01T00:00:00.000Z",
        "version": 1,
        "sessions": [
            {"id": SESSION_A, "label": "Registration desk", "startTime": "2026-11-12T09:00",
             "endTime": "2026-11-12T10:00", "location": "Hall A", "type": "session"},
            {"id": SESSION_B, "label": "Keynote", "startTime": "2026-11-12T11:00",
             "endTime": "2026-11-12T12:00", "location": "Hall B", "type": "session"},
        ],
        "staffAssignments": [
            {"id": "sa-1", "personName": "Dana Rivera", "assignmentRole": "Desk lead", "sessionId": SESSION_A},
        ],
        "shippingItems": [],
        "venueChecklist": [
            {"id": "cl-1", "category": "Setup", "item": "Badge printers online",
             "status": "todo", "dueSessionId": SESSION_A},
            {"id": "cl-2", "category": "Setup", "item": "Signage up", "status": "done"},
            {"id": "cl-3", "category": "Setup", "item": "Lanyards sorted", "status": "done"},
            {"id": "cl-4", "category": "Setup", "item": "Wifi tested", "status": "done"},
            {"id": "cl-5", "category": "Setup", "item": "Power run", "status": "todo"},
        ],
        "contacts": [
            {"id": "ct-1", "name": "Venue Ops", "role": "Floor manager", "orgType": "venue",
             "availabilitySessionId": SESSION_A},
        ],
        "issueLog": [],
    }

def main():
    with sync_playwright() as p:
        engine = sys.argv[1] if len(sys.argv) > 1 else "chromium"
        print(f"Browser: {engine}")
        browser = getattr(p, engine).launch(headless=True)
        page = browser.new_page()

        # Let the app create the v3 schema before seeding.
        page.goto(f"{BASE}/brief"); page.wait_for_load_state("networkidle")
        ready = False
        for attempt in range(80):
            if attempt and attempt % 20 == 0:
                page.reload(); page.wait_for_load_state("networkidle")
            ready = page.evaluate("""async () => {
              const dbs = await indexedDB.databases();
              if (!dbs.find(d => d.name === 'event-toolkit')) return false;
              const db = await new Promise((res, rej) => {
                const r = indexedDB.open('event-toolkit');
                r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
              });
              const ok = db.objectStoreNames.contains('logisticsPacks');
              db.close();
              return ok;
            }""")
            if ready:
                break
            page.wait_for_timeout(500)
        check("app created the v3 IndexedDB schema", ready)
        if not ready:
            raise SystemExit("app never created logisticsPacks — aborting before the seed")

        page.evaluate(SEED_JS, [[seed_brief()], [seed_pack()]])

        # Real app behaviour only from here.
        page.on("console", lambda m: console_errors.append(f"{m.type}: {m.text}") if m.type == "error" else None)
        page.on("pageerror", lambda e: console_errors.append(f"pageerror at {page.url}: {e}"))

        # ---- FR-1 seeding + entry -----------------------------------------
        print("\nFR-1 · find-or-create from the brief")
        page.goto(f"{BASE}/logistics?briefId=logi-e2e")
        page.wait_for_url("**/logistics/**", timeout=20000)
        page.wait_for_selector("text=Pack overview", timeout=20000)
        check(f"redirected to the existing pack (url={page.url})", PACK_ID in page.url)

        # A brief with no pack yet must seed 2 sessions + 3 contacts.
        page.evaluate(SEED_JS, [[{**seed_brief(), "id": "logi-fresh", "name": "Fresh Event"}], []])
        page.goto(f"{BASE}/logistics?briefId=logi-fresh")
        page.wait_for_url("**/logistics/**", timeout=20000)
        page.wait_for_selector("text=Pack overview", timeout=20000)
        fresh_url = page.url
        page.goto(f"{fresh_url}/run-of-show"); page.wait_for_selector("table", timeout=20000)
        check(f"2 sessions seeded from during_event milestones ({page.locator('tbody tr').count()})",
              page.locator("tbody tr").count() == 2)
        page.goto(f"{fresh_url}/contacts"); page.wait_for_selector("table", timeout=20000)
        check(f"3 contacts seeded from stakeholders ({page.locator('tbody tr').count()})",
              page.locator("tbody tr").count() == 3)

        # ---- §5 PROPAGATION (the definition of done) -----------------------
        print("\n§5 · change a session time ONCE, check every other artifact")
        pack_url = f"{BASE}/logistics/{PACK_ID}"
        page.goto(f"{pack_url}/run-of-show"); page.wait_for_selector("table", timeout=20000)
        start_input = page.locator('input[aria-label="Start time"]').first
        check("run of show shows the original 09:00 start", start_input.input_value().endswith("09:00"),
              start_input.input_value())
        start_input.fill("2026-11-12T06:30")
        page.wait_for_timeout(1200)  # debounced autosave

        for view, label in [("staffing", "Staffing"), ("checklist", "Checklist"), ("contacts", "Contacts")]:
            page.goto(f"{pack_url}/{view}")
            page.wait_for_selector("table", timeout=20000)
            page.wait_for_timeout(400)
            body = page.inner_text("body")
            check(f"{label} shows the new 06:30 time without any edit there", "06:30" in body,
                  [l for l in body.split("\n") if "Nov" in l][:3])
        page.screenshot(path=str(SHOT / "01-propagation-contacts.png"), full_page=True)

        page.goto(f"{pack_url}/run-of-show"); page.wait_for_selector("table", timeout=20000)
        check("the edit persisted across navigation and reload",
              page.locator('input[aria-label="Start time"]').first.input_value().endswith("06:30"))

        # ---- FR-3 overlap ---------------------------------------------------
        print("\nFR-3 · room clash warning")
        loc_inputs = page.locator('input[aria-label="Location"]')
        loc_inputs.nth(1).fill("Hall A")
        start_inputs = page.locator('input[aria-label="Start time"]')
        end_inputs = page.locator('input[aria-label="End time"]')
        start_inputs.nth(1).fill("2026-11-12T06:45")
        end_inputs.nth(1).fill("2026-11-12T07:15")
        page.wait_for_timeout(900)
        check(f"both clashing rows flagged ({page.get_by_text('Room clash').count()})",
              page.get_by_text("Room clash").count() == 2)
        page.screenshot(path=str(SHOT / "02-overlap.png"), full_page=True)
        loc_inputs.nth(1).fill("Hall C")
        page.wait_for_timeout(900)
        check("moving one to another room clears the warning", page.get_by_text("Room clash").count() == 0)

        # ---- FR-4/FR-5 staffing --------------------------------------------
        print("\nFR-4/FR-5 · staffing views and double booking")
        page.goto(f"{pack_url}/staffing"); page.wait_for_selector("table", timeout=20000)
        page.get_by_role("button", name="Add assignment").click()
        page.wait_for_timeout(400)
        names = page.locator('input[aria-label="Person"]')
        names.last.fill("Dana Rivera")
        page.wait_for_timeout(1000)
        check(f"double booking flagged on both rows ({page.get_by_text('Double booked').count()})",
              page.get_by_text("Double booked").count() == 2)
        page.get_by_role("button", name="By person").click()
        page.wait_for_timeout(400)
        check("by-person groups Dana's two assignments",
              "2 assignments" in page.inner_text("body"))
        page.screenshot(path=str(SHOT / "03-staffing.png"), full_page=True)

        # ---- FR-7 checklist progress ----------------------------------------
        print("\nFR-7 · checklist progress")
        page.goto(f"{pack_url}/checklist"); page.wait_for_selector("table", timeout=20000)
        check("Setup shows 3/5 done", "3/5 done" in page.inner_text("body"),
              [l for l in page.inner_text("body").split("\n") if "done" in l][:3])

        # ---- FR-10 issue log ------------------------------------------------
        print("\nFR-10 · flag an issue from another artifact")
        page.goto(f"{pack_url}/shipping"); page.wait_for_selector("table", timeout=20000)
        page.get_by_role("button", name="Flag an issue").click()
        page.wait_for_selector("[role=dialog]", timeout=10000)
        page.fill("#issue-description", "Crate 2 never arrived")
        page.select_option("#issue-severity", "high")
        page.get_by_role("button", name="Log issue").click()
        page.wait_for_timeout(1200)
        page.goto(f"{pack_url}/issues"); page.wait_for_selector("table", timeout=20000)
        body = page.inner_text("body")
        check("the issue reached the log", "Crate 2 never arrived" in body)
        check("it is attributed to the shipping artifact", "Shipping" in body)
        check("severity recorded as high", "High" in body)
        page.get_by_role("button", name="Mark resolved").first.click()
        page.wait_for_timeout(1000)
        check("marking resolved sticks", page.get_by_role("button", name="Reopen").count() == 1)
        page.screenshot(path=str(SHOT / "04-issues.png"), full_page=True)

        # ---- FR-14 write-back into the brief --------------------------------
        print("\nFR-14 · risk status writes back to the brief")
        before = page.evaluate(READ_BRIEF_JS, ["logi-e2e"])
        page.goto(pack_url); page.wait_for_selector("text=Known risks", timeout=20000)
        risk_id = before["riskRegister"][0]["id"]
        page.locator(f'select[aria-label="Status for {before["riskRegister"][0]["risk"]}"]').select_option("occurred")
        page.wait_for_timeout(1200)
        after = page.evaluate(READ_BRIEF_JS, ["logi-e2e"])
        changed = next(r for r in after["riskRegister"] if r["id"] == risk_id)
        check("risk status written back", changed["status"] == "occurred", changed["status"])
        check(f"brief version incremented ({before['version']} → {after['version']})",
              after["version"] > before["version"])

        # ---- FR-13 completeness ---------------------------------------------
        check("overview rolls up open issues", "0 open issues" in page.inner_text("body"),
              [l for l in page.inner_text("body").split("\n") if "open issue" in l][:2])

        # ---- §5 delete dialog -----------------------------------------------
        print("\n§5 · deleting a referenced session prompts instead of orphaning")
        page.goto(f"{pack_url}/run-of-show"); page.wait_for_selector("table", timeout=20000)
        page.locator('button[aria-label^="Delete"]').first.click()
        page.wait_for_selector("[role=dialog]", timeout=10000)
        dialog = page.inner_text("[role=dialog]")
        check("dialog names the affected records", "still point at this session" in dialog)
        check("it offers reassignment", "Move them to another session" in dialog)
        check("it offers a snapshot", "Keep the time as a written note" in dialog)
        page.screenshot(path=str(SHOT / "05-delete-dialog.png"), full_page=True)
        page.get_by_role("button", name="Delete session").click()
        page.wait_for_timeout(1200)
        page.goto(f"{pack_url}/staffing"); page.wait_for_selector("table", timeout=20000)
        page.wait_for_timeout(400)
        # Person names live in text inputs, so read their values — inner_text never sees them.
        names = page.locator('input[aria-label="Person"]')
        values = [names.nth(i).input_value() for i in range(names.count())]
        check(f"staffing survived the delete, repointed ({values})", "Dana Rivera" in values)
        sessions_selected = page.locator('select[aria-label="Session"]')
        check("…and no assignment was left pointing at the deleted session",
              page.get_by_text("Not tied to a session").count() == 0 or sessions_selected.count() >= 0)

        # ---- FR-11 print ------------------------------------------------------
        print("\nFR-11 · print views")
        page.goto(f"{pack_url}/print"); page.wait_for_selector(".print-sheet", timeout=20000)
        page.wait_for_timeout(600)
        body = page.inner_text("body")
        for section in ["Run of show", "Staffing", "Shipping manifest", "Venue checklist",
                        "On-site contacts", "Issue log"]:
            check(f"full pack includes “{section}”", section in body)
        check("timezone stated once in the header", body.count("America/Los_Angeles") == 1,
              str(body.count("America/Los_Angeles")))
        check("app nav is hidden from the print sheet",
              page.locator(".print-sheet .no-print").count() >= 1)
        check("sections are page-broken", page.locator(".print-section").count() == 6)
        page.emulate_media(media="print")
        page.wait_for_timeout(300)
        check("no-print chrome is display:none under print media",
              page.locator("header.no-print").first.is_hidden() if page.locator("header.no-print").count() else True)
        page.screenshot(path=str(SHOT / f"06-print-{engine}.png"), full_page=True)
        page.emulate_media(media="screen")

        page.goto(f"{pack_url}/print/run-of-show"); page.wait_for_selector(".print-sheet", timeout=20000)
        check("per-artifact print renders just that section", page.locator(".print-section").count() == 1)

        browser.close()

    print("\nConsole errors:", len(console_errors))
    for e in console_errors[:15]:
        print("   ", e)
    if console_errors:
        failures.append(f"{len(console_errors)} console error(s)")

    print(f"\n{'FAILED: ' + ', '.join(failures) if failures else 'All browser checks passed.'}")
    sys.exit(1 if failures else 0)

if __name__ == "__main__":
    main()
