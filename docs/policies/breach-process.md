# Breach response

*Draft. This document is useless until the [[NAMED PERSON]] markers are filled in and the
rehearsal has actually happened.*

## Who is accountable

**[[FULL NAME, ROLE]]** — decides whether an incident is a breach, and owns customer notification.
Reachable at [[PHONE]] / [[EMAIL]].

**[[FULL NAME, ROLE]]** — deputy, when the above is unreachable within 1 hour.

PRD 10 FR-10 requires a person, not a team, and this is why: "the security team has been
notified" is what gets said when nobody in particular is going to be woken up.

## 1. Detection

Sources: [[MONITORING/ALERTING]], a report from a customer, a report from a sub-processor, or a
disclosure from a researcher.

Anyone who suspects a breach contacts the accountable person **directly** — not a shared inbox,
not a ticket. Suspecting wrongly costs an interrupted evening. Suspecting rightly and going
through a queue costs the notification deadline.

## 2. Assessment — within 4 hours of awareness

Establish and write down:

- What data was exposed. **Was any of it third-party personal data** — attendee records, survey
  responses, pipeline contacts? That answer changes everything that follows.
- Which workspaces, and therefore which customers.
- How many people's data.
- Whether exposure is ongoing.

The access log (`access_events`) records every read of attendee data with actor, workspace and
time. It is the first place to look and the reason it exists.

## 3. Containment

Revoke credentials, close the vector, and — if a workspace's data is exposed — delete the
sessions of any account involved. Removing a member already does this; the same query does it
manually.

## 4. Customer notification — within 72 hours of awareness

Not 72 hours from investigation finishing. Notify affected customers in writing with: what
happened, what data, when, what has been done, and what they need to do. Your customers are the
controllers; **their** regulatory clock starts when we tell them, which is why the deadline is
ours to meet and not theirs to chase.

Notify even when the assessment is incomplete. An incomplete notification on time beats a
thorough one late.

## 5. Post-incident report — within 14 days

Written, shared with affected customers, and covering root cause, timeline, what worked, what
did not, and what changes as a result. Filed at [[LOCATION]].

## Rehearsal

This process is walked through **[[FREQUENCY, e.g. every 6 months]]** against a scenario nobody
has seen in advance. An unrehearsed process is a document, not a capability.

| Date | Scenario | Who took part | What it changed |
|---|---|---|---|
| *(none yet)* | | | |
