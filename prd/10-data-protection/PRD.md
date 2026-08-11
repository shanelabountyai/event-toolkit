# PRD 10 — Data Protection & Tenant Operations

**Status:** Draft, ready for review
**Tier:** Platform (v2). Depends on PRD 8 (identity) and PRD 9 (the data actually leaving the device).
**Prepared:** 2026-08-11

---

## 0. Why this is a PRD and not a checklist item

Right now this product holds a lot of other people's personal data and has no obligations
whatsoever, because none of it ever leaves the planner's browser. PRD 5 alone stores attendee
names, work emails, phone numbers, job titles and employers — imported from badge scans of
people who never heard of you.

The moment PRD 9 ships, that data is on your server. You become a data processor. Everything
below follows automatically and none of it is optional:

- Those attendees have rights over their data — access, correction, deletion — and the planner
  who imported them cannot honour those rights unless the product provides a way.
- Your customers will be asked by *their* legal teams what happens to attendee data, and will
  need an answer in writing before they can use the product for a real event.
- A breach involving badge-scan data is a notifiable event, not an embarrassing one.

This is the PRD most likely to be skipped, and the one whose absence blocks the first enterprise
deal. Writing it now costs a fraction of retrofitting it.

**It is also the counterweight to PRD 8's opening trade.** Local-first gave the product a zero
data-protection surface for free. This PRD is the price of the capabilities bought with it.

---

## 1. Problem

Three distinct problems that the same work solves:

1. **Legal exposure with no mechanism.** Under GDPR (and UK GDPR, CCPA and similar), an
   attendee can ask the planner's company to delete their data. If it sits in your database
   with no deletion path, your customer cannot comply, and you are the reason.
2. **Nobody can answer basic questions.** Who has seen the attendee list? How long is it kept?
   Where is it stored? Today: unanswerable — which is fine when the answer is "only on one
   laptop" and unacceptable once it is a server.
3. **No operational safety net.** Once data is centralised, its loss is centralised too. A bad
   migration or a dropped table takes out every customer at once, where previously the blast
   radius was one browser.

## 2. Users

| Role | What they need |
|---|---|
| **Workspace admin** | To answer "delete this person's data" without filing a support ticket |
| **Their legal/privacy team** | A written description of what is stored, where, for how long, and who can reach it |
| **The attendee** (a person who never chose this product) | Their data not kept indefinitely, not visible to people with no reason to see it, and deletable |
| **Whoever operates the service** | Backups that restore, environments that are separate, and a rehearsed answer to a breach |

## 3. User stories

- As an admin, an attendee emails asking to be deleted; I search their email across the workspace, see everywhere they appear, and delete them in one action.
- As an admin, I export everything held about one person, to answer a subject access request.
- As an admin, I set a retention period so lead data is purged automatically after an event, without remembering to do it.
- As a privacy reviewer, I read one page describing every category of personal data the product holds and why.
- As an operator, I restore a workspace to yesterday's state after a customer deletes something by mistake.
- As an operator, I can state confidently that staging contains no real customer data.

## 4. Scope

### In scope
The inventory of personal data. Deletion and export for an individual data subject. Retention
policies and automatic purge. Encryption. Access logging for attendee data specifically.
Backups and restore. Environment separation. The breach process. The customer-facing privacy
documentation the product needs to be adoptable.

### Out of scope (explicit non-goals)
- **No formal certification in v1.** SOC 2 and ISO 27001 are procurement requirements that
  follow demand; this PRD builds the controls they audit, not the audit.
- **No consent management or preference centre.** The product is not the data controller — the
  planner's company is. It provides the mechanisms; it does not run the consent relationship.
- **No data residency choice.** One region in v1, clearly stated. EU-resident storage is a
  known follow-on and the first thing an EU enterprise will ask for.
- **No anonymisation or pseudonymisation of stored records.** Deletion is deletion.
- **No customer-managed encryption keys.**
- **No automated regulatory classification.** The product cannot know whether a given import
  contains EU residents; it gives admins the tools and states the limits.

## 5. Personal data inventory

This table is a deliverable, not documentation of one. It must stay accurate as tools change.

| Data | Source | Held by | Sensitivity |
|---|---|---|---|
| Planner name, email | Sign-up | PRD 8 | Customer contact — low |
| Stakeholder names, roles, emails | Brief intake | PRD 1 | Business contact — low |
| On-site contact names, phones, emails | Logistics pack | PRD 3 | Business contact — low |
| Vendor names | Budget | PRD 4 | Business — low |
| **Attendee names, emails, phones, job titles, employers** | **Badge scans, registration exports** | **PRD 5** | **High — third-party personal data, obtained without a relationship to you** |
| **Attendee engagement signals** (sessions attended, booth visits, demo requests) | Imports | PRD 5 | **High — behavioural profiling of an identified person** |
| Pipeline contact names and emails | CRM export | PRD 6 | Medium — business contacts |
| Survey responses, free-text comments | Survey export | PRD 6 | **Medium-high — may contain anything, including opinions about named staff** |

**The whole of this PRD is driven by the three bold rows.** Everything else is ordinary business
contact data. Those are records about people who have no relationship with you and never agreed
to be in your system.

## 6. Functional requirements

**FR-1 · Data subject search.** An admin can search an email address across a workspace and see
every record referencing it, across all seven tools, with the tool and event named.

**FR-2 · Data subject deletion.** From those results, delete everything about that person in one
action. Deletion is hard — the row is removed, not flagged — and propagates to every synced
device via PRD 9's tombstones. Aggregate figures already computed (a lead count, a cost per
lead) are not retroactively recomputed; this is stated in the UI, because it is a real limit and
the honest position is that a count is not personal data.

**FR-3 · Data subject export.** Export everything held about one person as JSON, to answer a
subject access request.

**FR-4 · Retention policy per workspace.** An admin sets how long lead and survey data is kept
after an event ends. Default **12 months**. On expiry the data is deleted automatically and an
entry is written to the audit log. Briefs, budgets and retros — which contain no third-party
personal data of consequence — are unaffected.

**FR-5 · Encryption.** TLS in transit. Encryption at rest for the database and backups. No
personal data in logs, error reports, or analytics — attendee emails must never appear in a
stack trace, which requires deliberate redaction rather than hope.

**FR-6 · Access logging for attendee data.** Every read of lead or survey data is logged with
user, workspace, and time. This is the record that answers "who saw the attendee list", and
paired with PRD 8's `leads:view` gating it is the whole access-control story for the highest-
sensitivity data.

**FR-7 · Backups and rehearsed restore.** Daily automated backups, 30-day retention, encrypted.
**Restore is tested quarterly against a real workspace** — an untested backup is not a backup.
Point-in-time recovery to any moment in the last 7 days.

**FR-8 · Environment separation.** Production, staging and development are fully separate
databases and credentials. **No production data is ever copied to staging.** Seed and fixture
data only — the repository already ships fixtures precisely so this is easy.

**FR-9 · Workspace deletion.** Deleting a workspace removes all its data within 30 days, with
the delay stated so an accidental deletion can be reversed. Backups age out on their own
schedule, which must be disclosed rather than glossed.

**FR-10 · Breach process.** A written, rehearsed procedure: detection, assessment, notification
to affected customers within 72 hours of becoming aware, and a post-incident report. Names an
accountable owner rather than a team.

**FR-11 · Sub-processor register.** A published list of every third party touching customer
data — hosting, database, email delivery, error tracking — with what each receives. Customers'
legal teams ask for this by name, and it is trivial to produce now and painful to reconstruct
later.

**FR-12 · Privacy documentation.** A customer-facing page describing categories of data held,
purposes, retention, sub-processors, and how to exercise data subject rights. Plus a Data
Processing Agreement customers can sign, because enterprise procurement will require one.

**FR-13 · Import-time notice.** When a planner imports a lead file, the UI states plainly that
they are uploading third-party personal data to a server, names the workspace's retention
period, and reminds them they are the controller. One sentence, shown once per session — the
one moment where the responsibility is actually being taken on.

## 7. Success metrics

| Metric | Target |
|---|---|
| Time for an admin to fulfil a deletion request | < 5 minutes, unaided |
| Quarterly restore rehearsals completed | 100% |
| Personal data found in logs during review | 0 |
| Workspaces with an explicit retention setting after 60 days | ≥ 80% |
| Enterprise deals blocked on unanswerable privacy questions | 0 |

## 8. Risks

| Risk | Mitigation |
|---|---|
| **A breach of badge-scan data.** The highest-severity risk in the entire product. | Gated by `leads:view` (PRD 8 FR-5), not pulled to devices lacking it (PRD 9 FR-12), access-logged (FR-6), encrypted (FR-5), and auto-purged (FR-4). |
| **Deletion misses a copy.** Data in a backup, or on an offline device, after a "delete". | Tombstones propagate (PRD 9 FR-8); backup lag is disclosed (FR-9); an offline device that never reconnects cannot be reached, and this must be stated rather than implied away — the same honesty PRD 8 FR-7 requires. |
| **Retention defaults are wrong for a given jurisdiction.** | Configurable per workspace with a stated default; the product does not claim to know the customer's obligations. |
| **This PRD gets deferred** because nothing visibly breaks without it. | It is the gating dependency for selling to anyone with a legal team. Ship it with PRD 9, not after. |
| **Free-text survey comments contain anything.** Names, complaints, health information. | Treated at the same sensitivity as attendee data throughout: same gating, same retention, same deletion path. |

## 9. Open questions — decided defaults, pending validation

- **12-month default retention for lead and survey data.** Long enough for a full sales cycle
  and a year-over-year comparison, short enough to be defensible. *Assumption — pending
  validation:* no customer has stated a requirement yet.
- **Single region in v1.** Stated plainly rather than hidden. *Assumption — pending
  validation:* that the first customers are not EU enterprises, which would make residency a
  blocker rather than a roadmap item.
- **Hard delete, not anonymisation.** Simpler to explain and to verify. *Assumption:* nobody
  needs the aggregate rows preserved after deletion.
- **30-day workspace deletion delay.** Balances accident recovery against "delete means
  delete". Unvalidated.
- **Access logging on reads of attendee data only**, not all reads. Keeps volume sane while
  covering the data that matters. *Assumption — pending validation:* that no auditor asks for
  more.

## 10. Definition of done

- An admin can search an attendee's email, see every record about them across seven tools, export it, and delete it — in under five minutes, without help.
- A deletion propagates to a second signed-in device on its next sync.
- Retention purge runs automatically and writes an audit entry.
- A restore from backup has been performed successfully against a real workspace, and the date of that rehearsal is recorded.
- Staging is provably free of production data.
- Grepping application logs for a known test attendee's email returns nothing.
- The privacy page, sub-processor register and DPA exist and are published.
- A lead import shows the notice, naming the retention period in force.
