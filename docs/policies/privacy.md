# Privacy — how this product handles personal data

*Draft. Replace every [[MARKER]] before publishing. See README.md in this folder.*

## Who is responsible for what

**You are the data controller.** The people whose details you import — attendees whose badges
were scanned, survey respondents — have a relationship with your organisation, not with this
product. You decide what to collect and why.

**[[COMPANY]] is the data processor.** We store what you put in, provide the mechanisms to find,
export and delete it, and do nothing else with it. We do not sell it, we do not train models on
it, and we do not use it to contact anyone.

## What is stored

| Category | Examples | Sensitivity |
|---|---|---|
| Your account | Name, email address | Business contact |
| Your events | Briefs, budgets, logistics packs, ROI reports, post-mortems | Business data |
| Attendee records | Names, work emails, phone numbers, job titles, employers, sessions attended, booth visits, demo requests | **Third-party personal data** |
| Survey responses | Free text, NPS and CSAT scores, respondent email | **Third-party personal data** |
| Pipeline records | Contact name and email against an opportunity | **Third-party personal data** |

The three marked rows are people who never agreed to anything with us. They are treated
differently throughout: only three of five roles can read them, every read is logged, and they
are the only categories the retention policy deletes.

## Where it is stored

One region: **[[REGION, e.g. AWS us-east-1]]**. There is no data residency choice today. If you
need EU residency, ask — it is a known gap rather than a decision against it.

Sub-processors are listed in [sub-processors.md](sub-processors.md).

## How long it is kept

Attendee records and survey responses are deleted automatically **12 months** after an event's
last activity, by default. Workspace owners can change this between 6 and 36 months, or turn it
off deliberately. The purge runs daily and writes an audit entry each time.

Your own event records — briefs, budgets, logistics, ROI reports, post-mortems — are never purged
automatically. They are your record of your own work.

## Answering someone who asks about their data

Any workspace member with attendee-data access can, from **Attendee data requests**:

- **Search** an email address and see every record referencing it, across all seven tools.
- **Export** everything held about that person as JSON, for a subject access request.
- **Delete** all of it. Records that *are* about the person are removed entirely. Records about
  something else that merely name them — a pipeline opportunity, an event brief — keep the record
  and lose the person, so your revenue figures and event history stay intact.

Deletion is permanent, not a hidden flag, and propagates to every signed-in device on its next
sync.

**Figures already calculated are not recalculated.** A lead count or a cost-per-lead from last
quarter stays as it was. Those numbers contain no personal data, and rewriting a past report to
pretend somebody was never there would not remove anything about them — it would only damage the
report.

## Security

- Encrypted in transit (TLS) and at rest, including backups.
- Attendee data sits behind its own permission, absent from two of the five roles by design.
- Every read of attendee data is recorded with who, which workspace, and when.
- Personal data is stripped from application logs and error reports by a redaction layer driven
  by the same registry as the privacy tools, so a new field cannot be added to one and forgotten
  in the other.
- Removing someone from a workspace deletes their session rows immediately. Access ends on their
  next request, not when a token expires.

**What we cannot do:** wipe data already downloaded to somebody else's device. A removed member's
local copy is cleared the next time they open the app. We say so rather than implying otherwise.

## Deleting a workspace

All data is removed within 30 days. The delay is deliberate, so an accident is recoverable.
Backups age out on their own schedule, disclosed in the DPA rather than glossed over.

## Contact

[[PRIVACY CONTACT EMAIL]]
