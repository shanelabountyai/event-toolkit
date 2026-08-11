# HANDOFF: Data Protection & Tenant Operations (PRD 10) — Claude Code Kickoff Brief

Paste this whole file into a fresh Claude Code session to start building immediately. You do not
need to read the PRD first — everything required is inlined below.

**Prerequisite: PRD 8 and PRD 9 must be built.** This session covers the obligations that begin
the moment other people's personal data lands on a server.

---

## 1. Why this session exists

Until PRD 9 shipped, this product held a lot of other people's personal data and had no
obligations whatsoever, because none of it left the planner's browser.

PRD 5 alone stores attendee **names, work emails, phone numbers, job titles and employers**,
imported from badge scans of people who have never heard of you, plus behavioural signals about
each of them — sessions attended, booth visits, demo requests. PRD 6 adds survey free-text, which
can contain literally anything, including opinions about named staff.

That data is now on your server. You are a data processor. Three things follow automatically:

1. Those attendees have rights over their data — access, correction, deletion — and your
   customer **cannot honour them unless this product provides a mechanism**.
2. Your customers' legal teams will ask what is stored, where, for how long, and who can reach
   it, and will need it in writing before a real event goes through the system.
3. A breach of badge-scan data is a notifiable event, not an embarrassing one.

**This is the session most likely to be skipped**, because nothing visibly breaks without it. It
is also the gating dependency for selling to anyone with a legal team. Build it *with* PRD 9,
not after.

## 2. Where this slots into the monorepo

```
event-toolkit/
├── apps/web/
│   ├── app/workspace/
│   │   ├── privacy/page.tsx            # <-- NEW: subject search, export, delete
│   │   └── retention/page.tsx          # <-- NEW: retention policy
│   ├── app/api/
│   │   ├── privacy/search/route.ts     # <-- NEW
│   │   ├── privacy/export/route.ts     # <-- NEW
│   │   ├── privacy/delete/route.ts     # <-- NEW
│   │   └── cron/retention/route.ts     # <-- NEW: Vercel Cron, daily
│   └── lib/redact.ts                   # <-- NEW: log redaction
├── packages/
│   └── pii-registry/                   # <-- NEW PACKAGE: where personal data lives, as data
│       └── src/{index,registry,search,erase}.ts
├── docs/
│   ├── privacy.md                      # <-- NEW: customer-facing
│   ├── sub-processors.md               # <-- NEW
│   └── dpa-template.md                 # <-- NEW
└── scripts/
    └── pii-check.ts                    # <-- NEW, added to the `verify` chain
```

## 3. The core design idea: the PII registry

Do **not** hand-write subject search, export and deletion seven times, once per tool. Describe
where personal data lives as data, and implement the three operations once against that
description. When PRD 11 adds an eighth tool, it adds a registry entry, not three more code
paths.

```typescript
// packages/pii-registry/src/registry.ts

export type Sensitivity = "business_contact" | "third_party_personal";

export interface PiiLocation {
  /** Sync `kind` from PRD 9. */
  kind: string;
  /** Dotted paths to email fields — what subject search matches on. */
  emailPaths: string[];
  /** Dotted paths to every other personal field, for export and redaction. */
  personalPaths: string[];
  sensitivity: Sensitivity;
  /**
   * What deletion does. "record" removes the whole row — correct when the record *is* about a
   * person. "fields" blanks the personal paths and keeps the row — correct when the record is
   * about something else and merely names someone.
   */
  eraseStrategy: "record" | "fields";
  /** Subject to the retention policy (FR-4). */
  retained: boolean;
}

export const PII_REGISTRY: PiiLocation[] = [
  { kind: "leadRecords",           emailPaths: ["contact.email"],
    personalPaths: ["contact.firstName","contact.lastName","contact.fullName","contact.phone",
                    "contact.company","contact.jobTitle","signals"],
    sensitivity: "third_party_personal", eraseStrategy: "record", retained: true },

  { kind: "surveyResponses",       emailPaths: ["respondentEmail"],
    personalPaths: ["respondentId","comment"],
    sensitivity: "third_party_personal", eraseStrategy: "record", retained: true },

  { kind: "pipelineOpportunities", emailPaths: ["contactEmail"],
    personalPaths: ["contactName"],
    // The record is about a deal, not a person — keep the deal, drop the person.
    sensitivity: "third_party_personal", eraseStrategy: "fields", retained: true },

  { kind: "logisticsPack.contact", emailPaths: ["email"],
    personalPaths: ["name","phone"],
    sensitivity: "business_contact", eraseStrategy: "record", retained: false },

  { kind: "briefs",                emailPaths: ["stakeholders[].email"],
    personalPaths: ["stakeholders[].name"],
    sensitivity: "business_contact", eraseStrategy: "fields", retained: false },

  { kind: "budgetLineItems",       emailPaths: [],
    personalPaths: ["vendor"],
    sensitivity: "business_contact", eraseStrategy: "fields", retained: false },
];
```

**`scripts/pii-check.ts` must assert the registry is complete**: every sync `kind` known to
PRD 9 either appears here or is on an explicit `NO_PII` allowlist. A new tool that forgets to
register fails the build rather than silently leaking a category of data out of every privacy
operation. That check is the single highest-value thing in this session.

## 4. P0 checklist

- [ ] **FR-1 Subject search.** Search an email across a workspace; results name every record referencing it, with tool and event. Driven entirely by `emailPaths`.
- [ ] **FR-2 Subject deletion.** Delete everything about that person in one action, honouring each location's `eraseStrategy`. **Hard delete** — the row goes, it is not flagged. Propagates to every device via PRD 9's tombstones. Aggregates already computed (a lead count, a cost per lead) are not recomputed; the UI states this plainly, because a count is not personal data and pretending otherwise would be theatre.
- [ ] **FR-3 Subject export.** Everything held about one person as JSON, for a subject access request.
- [ ] **FR-4 Retention.** Per-workspace policy, default **12 months** after event end, applied to locations with `retained: true`. A daily cron purges expired data and writes an audit entry. Briefs, budgets and retros are unaffected.
- [ ] **FR-5 Encryption and log hygiene.** TLS in transit; encryption at rest for database and backups. **No personal data in logs, error reports or analytics** — this needs deliberate redaction in `lib/redact.ts` wrapping the logger and the error reporter, not hope.
- [ ] **FR-6 Access logging for attendee data.** Every read of a `third_party_personal` location is logged with user, workspace and time. Paired with PRD 8's `leads:view`, this is the whole access-control story for the highest-sensitivity data.
- [ ] **FR-7 Backups and rehearsed restore.** Daily, encrypted, 30-day retention, PITR to any point in the last 7 days. **A restore is performed against a real workspace quarterly and the date recorded** — an untested backup is not a backup.
- [ ] **FR-8 Environment separation.** Production, staging and development fully separate. **No production data ever copied to staging** — the repo already ships fixtures precisely so this is easy.
- [ ] **FR-9 Workspace deletion.** All data removed within 30 days, the delay stated so an accident is reversible. Backup ageing is disclosed rather than glossed.
- [ ] **FR-10 Breach process.** Written and rehearsed: detection, assessment, customer notification within 72 hours of awareness, post-incident report. Names an accountable person, not a team.
- [ ] **FR-11 Sub-processor register.** Published list — hosting, database, email, error tracking — and what each receives.
- [ ] **FR-12 Privacy documentation.** Customer-facing page plus a signable DPA.
- [ ] **FR-13 Import-time notice.** When a planner imports a lead file, state plainly that they are uploading third-party personal data to a server, name the retention period in force, and remind them they are the controller. One sentence, once per session, at the exact moment the responsibility is taken on.

## 5. Acceptance criteria

- An admin searches an attendee's email, sees every record across all seven tools, exports it, and deletes it — **in under five minutes, unaided**.
- The deletion reaches a second signed-in device on its next sync.
- Deleting a pipeline contact leaves the opportunity and its amount intact, with the person's name and email gone — `eraseStrategy: "fields"` proven, not assumed.
- `scripts/pii-check.ts` fails when a new sync kind is added without a registry entry. **Verify by actually adding one and watching it fail.**
- Retention purge runs on schedule and writes an audit entry.
- A restore from backup has been performed against a real workspace and the date recorded.
- Staging is provably free of production data.
- Grepping application logs and the error reporter for a known test attendee's email returns nothing.
- The privacy page, sub-processor register and DPA exist and are published.
- A lead import shows the notice naming the retention period in force.
- A Finance user (no `leads:view`) cannot reach subject search results containing attendee data.

## 6. Explicit non-goals

- No SOC 2 or ISO 27001 certification — build the controls, not the audit.
- No consent management or preference centre. The product is not the controller; the planner's company is. Provide mechanisms, do not run the consent relationship.
- No data residency choice. One region in v1, **clearly stated** — EU residency is the first thing an EU enterprise will ask for and is a known follow-on.
- No anonymisation or pseudonymisation. Deletion is deletion.
- No customer-managed encryption keys.
- No automated regulatory classification. The product cannot know whether an import contains EU residents; it gives admins tools and states the limits.

## 7. Suggested build order

1. **`packages/pii-registry`** — the registry and the pure search/erase functions over a document. Write `scripts/pii-check.ts` first: registry completeness, plus erase behaviour for both strategies. Pure, no database.
2. **Log redaction** (`lib/redact.ts`) — wrap the logger and error reporter, then grep the logs of a full test run to prove it works. Do this early: every day it is missing, more personal data accumulates in logs you will then have to purge.
3. **Subject search** (FR-1) over the `records` table using `emailPaths`.
4. **Subject export** (FR-3) — trivial once search exists.
5. **Subject deletion** (FR-2) — the strategies, tombstones, propagation.
6. **Retention** (FR-4) — per-workspace policy, Vercel Cron daily, audit entries.
7. **Access logging** (FR-6) at the pull and read boundaries.
8. **Import-time notice** (FR-13) — small, and the highest-visibility item to the customer.
9. **Operations** — backups, PITR, environment separation, the first restore rehearsal.
10. **Documentation** (FR-10, FR-11, FR-12) — breach process, sub-processors, privacy page, DPA.

Build the registry and its completeness check first. Everything else in this session is a
straightforward implementation over it, and without it you will write the same traversal seven
times and miss one — which is exactly how a category of personal data ends up invisible to every
privacy operation you have built.
