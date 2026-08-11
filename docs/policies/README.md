# Policy documents — read this first

These four documents satisfy PRD 10 FR-10 to FR-12. They are **drafts written from what the
system actually does**, which is the hard part and the part an engineer can do. They are not
legal advice and have not been reviewed by a lawyer.

Every `[[SQUARE BRACKET]]` marker is a fact only you can supply — a legal entity name, an
accountable person, a signed sub-processor agreement. **Do not publish these with the markers
still in them.** A privacy page naming "[[COMPANY]]" is worse than none: it tells a customer's
legal team that nobody has thought about this.

Two things to get right before publishing:

1. **Have a lawyer read the DPA.** It is a contract. The technical measures described in it are
   accurate to the build, which is the part usually wrong in a template; the contractual terms
   around them are not something to take from a generated draft.
2. **The breach process must name a person, not a team.** PRD 10 FR-10 is explicit about this,
   for the reason that "the security team will be notified" is what organisations say when
   nobody in particular is going to be woken up.

## What is true today, without any of these documents

The controls exist and are tested: role-based access with attendee data behind its own
permission, subject search, export and deletion driven by one registry, hard deletion rather
than flagging, retention with a daily purge and an audit entry, log redaction, TLS, and an
access log for every read of third-party personal data. `pnpm verify` proves the behaviour.

What is *not* done is the operational half — backups with a rehearsed restore, environment
separation, and a first restore against a real workspace with the date recorded. That is
PRD 10 FR-7 to FR-9 and it needs the hosting decisions made, not code written.
