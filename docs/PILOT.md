# Pilot: running one real event through the suite

The suite is built and verified. What it has never done is meet an event.

Every tool shipped with defaults marked *"assumption — pending validation"* — scoring weights,
variance thresholds, attribution windows, retro timing. None of them are wrong exactly; they
are guesses made carefully, by people who could not run planner interviews. One real event
turns most of them into either evidence or a correction.

This is the runbook for that event. It is deliberately short. The constraint is running an
event, not tooling.

---

## Before you start

**Pick the right event.** Not the biggest one. You want an event that:

- has a real budget you will reconcile afterwards,
- captures leads somehow (badge scans, a registration export — anything with names),
- someone will actually ask you to justify later.

A small conference or a trade show booth is ideal. A webinar works but exercises less of the
suite — no venue, no shipping, thinner logistics.

**Accept that this run is slower than your spreadsheet.** You are paying once to find out
whether the defaults hold. That is the entire point, and it is worth saying out loud to
whoever is waiting on the output.

**One thing to decide up front:** who is the single planner running this? The suite assumes
single-planner editing throughout (PRD 1's documented default, no real-time collaboration). If
two people need to edit concurrently, you will find that out fast, and it is worth recording
as the first finding.

---

## The run

Each step names what to do, and — more importantly — **what to notice**. The noticing is the
deliverable. `/calibration` will read the numbers; only you can read the friction.

### 1 · Brief — before anything is booked

Create the brief in `/brief`. Fill in success metrics properly, with real targets. This matters
more than it looks: PRD 6 writes actuals back against these, and PRD 7's scorecard scores the
hit rate. Vague metrics here produce a meaningless verdict three months later.

> **Notice:** how long intake took, and which questions you could not answer yet. A field you
> had to guess at is a field the brief asked for too early.

### 2 · Promo — as soon as the date is fixed

Generate the kit in `/promo/kit`. Read all 18 assets before editing anything.

> **Notice:** which assets you rewrote heavily versus used as-is. The tool records an
> edit-distance per asset — a section you rewrite every time is a template that is wrong, not
> a template you dislike. Also note whether the tone fits your company at all; brand voice is
> deferred to v1.1 on the assumption that one neutral tone is survivable.

Enter registration numbers weekly in `/promo/pacing`. Two entries is enough to be useful.

> **Notice:** whether the backloaded curve resembles how registrations actually arrive for
> you. If yours are front-loaded, the "behind pace" warnings will cry wolf all campaign.

### 3 · Logistics — the fortnight before

Build the pack in `/logistics`. Fill in the run of show first; everything else references it.

> **Notice:** whether the five artifacts are in a useful order (PRD 3's build order is an
> explicit guess), and whether the room-clash and double-booking warnings caught anything real
> or just annoyed you.

**On the day, log issues as they happen.** This is the single highest-value habit in the whole
pilot. Every issue you log becomes a candidate lesson in step 7; every one you do not log is
gone by the retro. "Flag an issue" is in every artifact header for exactly this reason.

### 4 · Budget — throughout, then reconcile

Build the budget in `/budget` when the brief is signed off. Enter committed amounts as you sign
vendors, actuals as invoices land. **Mark it reconciled when the last invoice is in** — the ROI
scorecard treats an unreconciled budget as missing data, not as good discipline.

> **Notice:** how many line items flagged amber or red. If nearly all of them did, the 10/20%
> thresholds are noise for your kind of event and you will stop reading the flags — which is
> the actual failure mode, not the number itself.

### 5 · Leads — within 48 hours of close

This is the tool with the sharpest deadline. Import every list you have into one session in
`/leads` — badge scans, registrations, demo requests.

> **Notice, and this is the important one:** in merge review, how many suggested duplicates
> were real. That queue is a labelled dataset for the 0.85 similarity threshold and nothing
> else produces it. Resolve every pair rather than leaving them pending.

Then check the tiers before assigning owners.

> **Notice:** whether "hot" is a shortlist a salesperson would actually work. If 2% or 60% of
> leads are hot, the thresholds are wrong for your event size.

Generate drafts, assign owners, export per owner. Ask the sales owners one question afterwards:
*was the order useful?* That is the only real test of the rubric.

### 6 · ROI — about 30 days after

Build the report in `/roi`. Budget and leads populate themselves. Import a CRM opportunity
export and a survey export.

> **Notice:** how many scorecard dimensions came back "not enough data". The verdict rests on
> whatever is left, and if that is one or two dimensions the recommendation is thinner than it
> looks.

> **On attribution:** open `/calibration` and look at the sensitivity table before quoting any
> sourced-pipeline number. If it swings wildly between a 14- and 60-day window, say so when you
> present it. That number is a choice, and presenting it as a measurement is the one way this
> tool can actively mislead someone.

### 7 · Retro — within two weeks

Open `/retro`. It will have generated candidate lessons from your issue log, budget variance and
ROI scorecard.

> **Notice:** how many candidates you kept versus deleted. A tool generating mostly noise is
> worse than a blank page, because deleting is slower than typing.

Complete it. Then — the payoff — start a brief for your next event of the same type and check
that the lessons appear during intake. If they do not, something is wrong and worth reporting.

---

## After: read the calibration page

Open `/calibration`. It reads everything above and reports what the data says about each
default, refusing to conclude anything below a stated sample size.

After one event most findings will still say *"not enough data yet"*. That is correct and not a
failure — a few need 20-25 data points, which is two or three events. What one event **will**
tell you:

| Answerable after one event | Needs several | Needs a person |
|---|---|---|
| Do variance flags fire on everything? | Dedupe threshold (needs ~10 reviewed pairs) | Is the retro prompt annoying? |
| Does "hot" select a workable shortlist? | Retro timing (needs ~3 completed) | Do the artifacts come in a useful order? |
| Does any rubric rule never fire? | Reforecast sensitivity | Does the copy sound like your company? |
| How fragile is the attribution number? | Scorecard coverage across events | Was the lead order useful to sales? |

## What the pilot cannot settle

Worth knowing before you start, so nobody expects an answer that isn't coming:

- **Duplicates you never caught.** Rejected pairs are visible; missed ones leave no trace.
  Calibration can show the threshold is too loose, never that it is too tight.
- **Whether lead scores predict revenue.** That needs conversion outcomes, which arrive a sales
  cycle after the event. Revisit by comparing this event's hot leads against its own imported
  pipeline once both exist.
- **Attribution causality.** Not resolvable by any standalone tool, ever. Sensitivity is the
  ceiling.

## Recording what you find

Findings that came from noticing rather than from data have nowhere to live in the app — the
suite has no place to store "the intake asked for the venue before we'd chosen one". Keep them
in a plain list as you go, and raise them against the relevant PRD's *Open Questions* section
afterwards. That section is where each default is documented, and it is the right place for the
correction to land.
