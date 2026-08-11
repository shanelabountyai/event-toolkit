# Data Processing Agreement — template

*Draft. **Have a lawyer read this.** The technical measures below are accurate to what the system
does, which is the part templates usually get wrong. The contractual terms around them are not
something to take from a generated draft.*

Between **[[CUSTOMER LEGAL ENTITY]]** ("Controller") and **[[COMPANY LEGAL ENTITY]]**
("Processor"), effective **[[DATE]]**.

## 1. Subject matter and duration

The Processor provides event-planning software. Processing continues for the term of the
subscription and the deletion period in §7.

## 2. Nature and purpose

Storing and making available data the Controller enters or imports, so the Controller's staff can
plan and evaluate events. The Processor does not use the data for any other purpose, does not
sell it, and does not use it to train machine-learning models.

## 3. Categories of data subject

The Controller's own staff; and event attendees, survey respondents and sales contacts whose
details the Controller imports.

## 4. Categories of personal data

Names, business email addresses, telephone numbers, job titles, employers; event attendance and
engagement signals; free-text survey responses.

## 5. Controller instructions

The Processor processes only on documented instructions from the Controller, which the use of the
service constitutes, except where required otherwise by law.

## 6. Technical and organisational measures

The measures below are implemented and covered by automated tests in the product's build.

- **Encryption** in transit (TLS) and at rest, including backups.
- **Access control.** Five roles. Attendee personal data is behind a single permission, absent
  from two roles by design. One permission function governs every access decision.
- **Access logging.** Every read of third-party personal data is recorded with user, workspace
  and timestamp.
- **Log hygiene.** Personal data is removed from application logs and error reports by a
  redaction layer driven by the same registry that drives the data-subject tools.
- **Session revocation.** Removing a member deletes their session records; access ends on their
  next request.
- **Data-subject tooling.** Search, export and erasure across every part of the product, from one
  registry rather than per-feature implementations.
- **Retention.** Configurable per workspace, 12 months by default, enforced by a daily job that
  writes an audit entry.

**Limitation the Processor discloses rather than omits:** data already synchronised to a user's
own device cannot be erased remotely. It is cleared when that user next opens the application.

## 7. Deletion and return

On termination, the Controller may export their data. All data is deleted within 30 days.
Backups containing it age out within **[[BACKUP RETENTION, e.g. 30 days]]** thereafter and are
not restored except to recover the Controller's own service.

## 8. Sub-processors

Listed in [sub-processors.md](sub-processors.md). The Controller consents to those listed. The
Processor gives **[[NOTICE PERIOD]]** notice of additions, during which the Controller may object.

## 9. Breach notification

The Processor notifies the Controller without undue delay and **within 72 hours** of becoming
aware of a personal data breach, with the information available at that time. Process:
[breach-process.md](breach-process.md).

## 10. Audit

The Processor makes available the information necessary to demonstrate compliance and allows
audits **[[FREQUENCY / CONDITIONS]]**.

## 11. Data location and transfers

Data is stored in **[[REGION]]**. There is no data residency option at present. Transfers, if
any, rely on **[[MECHANISM, e.g. Standard Contractual Clauses]]**.

## 12. Not covered

The Processor holds no SOC 2 or ISO 27001 certification. The controls in §6 are implemented and
tested; they are not independently audited.

Signed:

Controller: ______________________  Date: __________

Processor: ______________________  Date: __________
