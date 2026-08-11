# Sub-processors

*Draft. Confirm each entry against a signed agreement before publishing.*

Every third party that processes customer data on our behalf, and what each one receives.

| Sub-processor | Purpose | Data it receives | Region |
|---|---|---|---|
| **Vercel** | Application hosting | All request data in transit; no persistent storage of customer records | [[REGION]] |
| **Neon** | Postgres database | Everything stored: accounts, events, attendee records, survey responses | [[REGION]] |
| **Resend** | Transactional email | Email addresses of your team members only — verification, sign-in and invitation messages. **No attendee data is ever sent by email.** | [[REGION]] |

## Notes worth keeping accurate

- **Resend receives no attendee data.** Sign-in links and invitations go to workspace members.
  Nothing in the product emails an attendee. If that changes, this table changes first.
- **No error-tracking or analytics sub-processor is listed** because none is wired in. If one is
  added, it belongs here, and the redaction layer in `apps/web/lib/redact.ts` must be pointed at
  it before it is switched on.

## Changes

We will give **[[NOTICE PERIOD, e.g. 30 days]]** notice before adding or replacing a
sub-processor. To be notified, [[HOW TO SUBSCRIBE]].
