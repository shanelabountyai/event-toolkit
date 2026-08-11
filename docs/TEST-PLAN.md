# Manual test plan — one pass through the whole suite

**Time:** about 2.5 hours. **What you need:** the app running, and this page open beside it.

## What this is for

Automated coverage already exists and is green: eight headless check scripts (~450 assertions)
cover the domain logic, and three Playwright scripts confirm every route renders in Chromium
and Firefox with no console errors.

None of that tells you whether the thing is *usable*, or whether the same number agrees with
itself across two screens. This plan targets what automation structurally cannot reach:

1. **Cross-tool seams** — six places where one tool reads another's data. These are where bugs
   live, and where a mistake is invisible until it produces a wrong number in a report.
2. **Numbers agreeing with themselves** — the same figure is shown by up to three tools. No
   automated test compares them.
3. **Whether it makes sense to use.** Only you can judge that.

**No real data.** Everything below uses fixture files that ship with the repo.

---

## Setup (5 min)

```bash
cd "~/Documents/Claude/Projects/event toolkit/event-planner-app"
pnpm build && pnpm start
```

Open **http://localhost:3000** in a normal (not private) window. Keep the terminal open.

**Start clean.** If you have used the app before, wipe it: DevTools → Application → Storage →
IndexedDB → `event-toolkit` → Delete database, then reload. Do this again if you want to re-run
the plan from scratch.

Have these fixture files ready — they're in `event-planner-app/fixtures/`:

| File | Used in |
|---|---|
| `budget-sample-actuals.csv` | Part 4 |
| `lead-triage-sample-badgescan.csv` | Part 5 |
| `lead-triage-sample-registrants.csv` | Part 5 |
| `lead-triage-sample-demorequests.csv` | Part 5 |
| `roi-sample-pipeline.csv` | Part 6 |
| `roi-sample-survey.csv` | Part 6 |

**How to record results.** Note anything that doesn't match the expected result and *keep
going* — later parts depend on earlier data, so stopping at the first failure costs you the
rest of the run. There's a results table at the bottom.

---

## Part 1 · Brief (15 min)

The rest of the suite hangs off this, so fill it in properly.

| # | Do | Expect |
|---|---|---|
| 1.1 | `/brief` → **New brief** → pick **Conference** | Intake wizard opens on step 1 |
| 1.2 | Name it **Test Summit 2026**. Set dates: start **2026-09-14**, end **2026-09-15** | Accepts both |
| 1.3 | Work through every step. Add **3 stakeholders**, **2 target personas** (give one the title *VP of Marketing*), **1 during-event milestone** | Each step saves as you move on |
| 1.4 | In success metrics add exactly these three: **Registrations** target 500 · **MQLs generated** target 100 · **Swag budget** target 5000 | All three listed |
| 1.5 | Add 2 risks and a venue name (**Test Convention Centre**) | Saved |
| 1.6 | Finish intake, land on the brief view | Completeness shows a percentage; "Launch a tool" lists all 6 downstream tools as **live links**, none saying "coming soon" |
| 1.7 | Reload the page | Everything persists |

> **Why those three metrics:** they're chosen to exercise PRD 6's matcher — "Registrations"
> and "MQLs generated" should match later, "Swag budget" should deliberately *not*.

---

## Part 2 · Promo (15 min)

| # | Do | Expect |
|---|---|---|
| 2.1 | From the brief, launch **Promo Campaign Kit** | Entry screen previewing 18 assets |
| 2.2 | **Generate promo kit** | 18 assets in 4 sections; landing page, 5 emails, 9 social, 3 sales |
| 2.3 | **Read the landing page and one email properly** | Copy mentions *Test Convention Centre*, reads like a conference, no `{{tokens}}`, nothing says "undefined" |
| 2.4 | Check the 3 X posts | Each visibly shorter than the LinkedIn equivalents |
| 2.5 | Edit one email — add a sentence | Badge changes to "% edited" |
| 2.6 | Reload | Your edit survived |
| 2.7 | Go to the brief, change the event name to **Test Summit 2026 (Renamed)**, come back to the kit | Amber "brief has changed" banner |
| 2.8 | **Review and regenerate** | Dialog lists your edited asset as *"Edited — will be skipped"* and others as *"Will update"* |
| 2.9 | Confirm | **Your edited email keeps your sentence.** Others now say "(Renamed)" |
| 2.10 | Pacing tab → add **2026-08-20 / 40** then **2026-09-01 / 120** | Chart draws, status badge appears, "Recommended next steps" shows if behind |

> **2.9 is the load-bearing one.** Silently overwriting a planner's edit is the failure this
> whole flow exists to prevent.

---

## Part 3 · Logistics (30 min)

| # | Do | Expect |
|---|---|---|
| 3.1 | From the brief, launch **Logistics Pack** | Redirects to a pack; overview shows 5 tiles |
| 3.2 | Check **Run of show** | 1 session, seeded from your during-event milestone, located at *Test Convention Centre* |
| 3.3 | **Add session** twice. Name them *Registration* and *Keynote*. Give both location **Hall A**, overlapping times (09:00–10:00 and 09:30–10:30) | **Both rows flag "Room clash"** |
| 3.4 | Change Keynote's location to **Hall B** | Warning clears on both |
| 3.5 | Staffing → **Add assignment** → person *Dana*, pick **Registration** | Row shows Registration's time, labelled "from session" |
| 3.6 | Add a second assignment: *Dana*, session **Keynote** — first set Keynote back to overlap Registration | **Both flag "Double booked"** |
| 3.7 | Checklist → add a Setup item, set its **Due** to *Registration* | Shows Registration's time underneath |
| 3.8 | Contacts → set one contact's **On site during** to *Registration* | Shows Registration's time |
| 3.9 | **⭐ Go back to Run of show. Change Registration's start time to 06:30. Change nothing else.** | |
| 3.10 | **⭐ Visit Staffing, Checklist, Contacts** | **All three show 06:30.** This is the whole point of the tool |
| 3.11 | Run of show → delete **Registration** (the ✕) | Dialog appears naming how many records point at it, offering *move to another session* or *keep the time as a note* |
| 3.12 | Choose **move to another session** → confirm | Staffing still lists Dana, now under Keynote |
| 3.13 | From any artifact header, **Flag an issue** → description only, severity **high** | Saves without demanding other fields |
| 3.14 | Flag two more: one **high**, one **low**. Do it from the **Shipping** tab | Issues tab shows 3, attributed to the right artifacts |
| 3.15 | Shipping → **Import CSV** → **Download template**, then import that same file back | Preview then 1 row imported |
| 3.16 | Overview → set a risk to **Occurred** | Saves; go to the brief and confirm the risk shows Occurred |
| 3.17 | **Print full pack** → browser print preview (⌘P) | No nav or buttons; sections start on fresh pages; no table row split across a page break |

> **3.9–3.10 is the single most important check in this document.** If a time changes in one
> place and the others don't follow, the tool has failed at its stated purpose regardless of
> everything else.

---

## Part 4 · Budget (25 min)

| # | Do | Expect |
|---|---|---|
| 4.1 | From the brief, launch **Budget Builder** | Template auto-generates; a one-time note explains it; **all 9 category sections present** |
| 4.2 | Check conference seeding | Venue rental, AV package, 2 F&B rows, 2 travel rows, etc. |
| 4.3 | Enter budgeted amounts: Venue **95000**, AV **42000**, Breakfast/lunch/breaks **54000**, Reception catering **22000**, Speaker travel **18000**, Digital promotion **20000**, Registration desk staff **12000** | Grand total updates live |
| 4.4 | Set AV **actual** to **48200** | Row flags — 15% over on a 10% threshold |
| 4.5 | Set AV actual to **55000** | Flag escalates to red (30% ≥ 20%) |
| 4.6 | Add a line item under **Other**: name *Photobooth*, budgeted **0**, committed **3200** | **Flags "Unbudgeted" red immediately**, on the commitment alone |
| 4.7 | **Import** → `budget-sample-actuals.csv` | Mapping step auto-maps **"Actual Spend" → Actual amount** |
| 4.8 | Continue → Preview → Review matches | **7 will update, 1 will create (Photobooth), 1 row rejected** with a stated reason |
| 4.9 | Import | Actuals populate; Photobooth appears |
| 4.10 | **⭐ Note the grand total Actual figure** — write it down | You'll compare it in Parts 6 and 7 |
| 4.11 | Go to the brief, change **estimated audience size** by more than 15%, return to the budget | **Amber reforecast banner**, naming the old and new value |
| 4.12 | **Reforecast** → change one budgeted amount → save | Banner clears; Settings shows it in reforecast history |
| 4.13 | Return to the budget again | **Banner does not reappear** — the same change must not nag twice |
| 4.14 | **Mark reconciled** | Badge changes |
| 4.15 | **Export XLSX**, open it | 3 sheets; Summary-by-Category totals match the Line Items sheet |

---

## Part 5 · Leads (30 min)

| # | Do | Expect |
|---|---|---|
| 5.1 | `/leads` → **New triage session** → **From an event brief** → pick Test Summit | Shows the brief's objective and personas, read-only |
| 5.2 | Create → lands on Import | |
| 5.3 | Import `lead-triage-sample-badgescan.csv` | *Full Name* → name, *Booth Scans* → booth interactions, *Demo* → demo requested |
| 5.4 | Preview → import | 6 leads |
| 5.5 | Import `lead-triage-sample-registrants.csv` | **"Email Address" auto-maps to Email** |
| 5.6 | Import it | Summary reports **rows merged on matching email** — total is *not* 12 |
| 5.7 | Import `lead-triage-sample-demorequests.csv` | Reports 1+ possible duplicate needing review |
| 5.8 | **⭐ Merge review** | Shows **Tom Alvarez / Thomas Alvarez** side by side — same person, different name form, neither has an email |
| 5.9 | Pick winning values per conflicting field → **Merge into one lead** | Pool shrinks by one; queue empties |
| 5.10 | Scoring tab | Rubric pre-loaded: demo +40, booth +10 (cap 30), sessions +5 (cap 25), persona match +15 |
| 5.11 | Change demo request to **80** | **Tier counts change immediately**, no re-import |
| 5.12 | Change it back to 40 | Counts return |
| 5.13 | Leads tab → add owners **Alex Rivera**, **Jordan Kim**, **Sam Okafor** | Listed |
| 5.14 | **Apply owners from file** | The registrants file named Alex and Jordan — those leads get assigned, marked *column mapped* |
| 5.15 | **Auto-assign unassigned** | Everyone has an owner; distribution roughly even |
| 5.16 | Click a lead row | Drawer: contact, **score breakdown per rule**, owner, status |
| 5.17 | Templates → read the hot-tier body | Reads sensibly, no raw tokens; preview fills in a real lead |
| 5.18 | **Generate all drafts** | Every lead becomes draft-ready |
| 5.19 | Open one lead, edit its draft, **Save edit** | Marked "Edited" |
| 5.20 | **⭐ Generate all drafts again** | Reports *"1 edited draft left untouched"*; **your edit survives** |
| 5.21 | Export → **XLSX per owner** | One workbook, a sheet per owner; each sorted hot→cold then by score; draft subject and body are columns |

---

## Part 6 · ROI (25 min)

| # | Do | Expect |
|---|---|---|
| 6.1 | `/roi` → **New report** → pick Test Summit | Report opens |
| 6.2 | **⭐ Budget section** | **The Actual total matches what you wrote down at 4.10** |
| 6.3 | **⭐ Leads section** | Auto-linked to your triage session, showing its lead count, labelled *"from the linked triage session"* |
| 6.4 | Pipeline tab → import `roi-sample-pipeline.csv` | *"Opp ID" → Record id*, *"Created Date" → Created date*, *"Amount" → Amount* |
| 6.5 | **⭐ At Preview, look at the "Will classify as" column** | Each row shows sourced / influenced / outside window **before** you commit |
| 6.6 | Import | 7 records: 5 opportunities, 2 meetings |
| 6.7 | Overview → Pipeline section | Sourced, influenced **and an "outside attribution window" row** — nothing dropped |
| 6.8 | Survey tab → import `roi-sample-survey.csv` | *"How likely are you to recommend" → NPS score* |
| 6.9 | Import → overview | NPS computed from 10 responses |
| 6.10 | Attribution tab → change **sourced window** to 7 | **Rows reclassify immediately**, no re-import. Table shows *timing says* vs *CRM says* vs *counted as* |
| 6.11 | Set it back to 30 | Reclassifies back |
| 6.12 | Overview → **scorecard** | 5 dimensions, each with raw value, verdict **and the exact bands applied**. Any missing input reads *"not enough data"*, never 0 |
| 6.13 | Re-import the same pipeline file | **Counts do not double** — matched on record id |
| 6.14 | Export → **Executive summary (Markdown)**, open it | Self-contained: recommendation, spend, pipeline, cost per lead, NPS. Real numbers, no tokens, never says "see full report" |
| 6.15 | **⭐ Finalise** | Match screen: **Registrations and MQLs generated matched with proposed values; Swag budget unmatched** |
| 6.16 | Accept both matches → finalise | Report goes Final |
| 6.17 | Open the brief → success metrics | Those two have actuals; **Swag budget is still empty**; brief version incremented |

---

## Part 7 · Retro, and the loop (20 min)

| # | Do | Expect |
|---|---|---|
| 7.1 | `/retro` → find Test Summit → **Start** | Opens with three ingestion tiles |
| 7.2 | **⭐ Check the tiles** | Issue log shows **3 issues (2 high, 1 low)**; budget shows **the same actual total as 4.10 and 6.2**; ROI shows your recommendation, labelled *final* |
| 7.3 | Look at the generated lessons | Candidates from all three sources. Low-severity issue suggests **Repeat**; high suggest **Fix** |
| 7.4 | **⭐ Both your high-severity issues shared an artifact?** | If they shared one (e.g. both from Shipping), there's an **extra consolidated "Drop" lesson** naming it as a pattern |
| 7.5 | Budget-sourced lessons | Photobooth (unbudgeted) suggests **Drop**; the over-budget category suggests **Fix** |
| 7.6 | Add a manual lesson under Repeat: *"Test Convention Centre worked well — rebook"* | Appears in the Repeat column |
| 7.7 | Delete text from one lesson, try **Complete retro** | **Blocked**, telling you a lesson needs text |
| 7.8 | Restore the text. Untick **Carry forward** on exactly one lesson | |
| 7.9 | **Complete retro** | Confirmation counts what will carry, split repeat/fix/drop |
| 7.10 | Confirm | Notice reports how many were added to the brief |
| 7.11 | Open the brief → carry-forward lessons | Exactly the ticked ones. **The unticked one is absent** |
| 7.12 | **⭐ Re-open the retro, edit one lesson's wording, Complete again** | **Brief entry count is unchanged** — it updated in place, it did not duplicate |
| 7.13 | Success metrics panel → **Adjust** one, enter a value and a reason → save | Requires the reason; writes to the brief; correction listed with its previous value |
| 7.14 | **⭐⭐ THE LOOP: `/brief` → New brief → Conference → work to the Goals step** | **Your lessons from Test Summit appear as suggestions** |

> **7.14 is the payoff of the entire suite.** Seven tools exist so that a lesson learned at one
> event shows up while planning the next one. If it doesn't appear, nothing else compensates.

---

## Part 8 · Calibration (10 min)

| # | Do | Expect |
|---|---|---|
| 8.1 | Footer → **Calibration** | Nine findings |
| 8.2 | Read the statuses | Mostly *"too early to say"* — you have one event's worth of data. **That is the correct output** |
| 8.3 | Dedupe finding | Reports the pair you resolved; says *not enough yet* (needs ~10) |
| 8.4 | Attribution sensitivity table | Sourced pipeline at 7/14/30/45/60/90-day windows, current default highlighted |
| 8.5 | **⭐ Check it never claims validation** | The attribution finding must **not** say the window is confirmed — only that the number moves |

---

## Cross-checks — the same number in three places

The seams automation covers headlessly but never compares on screen. Do these last:

| Figure | Should be identical in |
|---|---|
| Budget total actual | `/budget` grand total · ROI budget section · Retro budget tile |
| Lead count | Leads progress bar · ROI leads section |
| Scorecard recommendation | ROI scorecard · Retro ROI tile · ROI executive summary |
| Issue count | Logistics issues tab · Retro issue-log tile |

**Any disagreement here is a real bug** — two tools reading the same source and getting
different answers.

---

## Where I'd look first

Being straight about the odds: the domain logic is well covered, the UI far less so. Most
likely to be wrong, roughly in order:

1. **Multi-step wizards under real clicking** — the leads and ROI import wizards have the most
   state and the least automated coverage. Steps 5.3–5.9 and 6.4–6.6.
2. **Autosave races** — typing fast then navigating immediately. Debounced saves are 600ms;
   try editing a lead draft and clicking away instantly.
3. **The print view in your actual browser** — pagination was checked structurally, not
   visually. Step 3.17.
4. **Empty states you reach by deleting** — remove every lead, every session, every line item
   and see what renders.
5. **XLSX exports opening in real Excel/Numbers**, not just downloading.

## Recording results

| Part | Pass / Fail | Notes |
|---|---|---|
| 1 Brief | | |
| 2 Promo | | |
| 3 Logistics (esp. 3.10 propagation) | | |
| 4 Budget | | |
| 5 Leads (esp. 5.20 draft preservation) | | |
| 6 ROI (esp. 6.15 metric matching) | | |
| 7 Retro (esp. 7.12 idempotency, 7.14 the loop) | | |
| 8 Calibration | | |
| Cross-checks | | |

For anything that fails, note **what you did, what you expected, what happened**. That's enough
to reproduce it.
