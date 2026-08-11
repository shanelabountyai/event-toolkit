// apps/web/lib/redact.ts
//
// PRD 10 FR-5 — no personal data in logs, error reports or analytics.
//
// This needs deliberate machinery rather than discipline. The failure mode is not someone
// choosing to log an attendee's email; it is `console.error("import failed", row)` written in a
// hurry, or an error whose message helpfully quotes the value that broke the parse. Both are
// reasonable code. Both put third-party personal data into a log that is retained far longer than
// the data itself is allowed to be, in a system that has no way to erase it when that person asks.
//
// So logging goes through here, and here is driven by the same registry that drives search,
// export and deletion — one description of where personal data lives, four operations built on it.

import { PII_REGISTRY } from "@event-toolkit/pii-registry";

export const REDACTED = "[redacted]";

/**
 * Every field name the registry describes as personal, flattened to its last segment.
 *
 * The last segment because a log entry rarely carries the whole document: it carries `{ email,
 * phone }` plucked out of one, and `contact.email` would never match that. Over-matching is the
 * right bias — redacting a field that happened to be harmless costs a debugging session, and
 * missing one costs a notifiable event.
 */
const PERSONAL_FIELD_NAMES = new Set(
  PII_REGISTRY.flatMap((location) => [...location.emailPaths, ...location.personalPaths])
    .map((path) => path.split(".").pop()!.replace("[]", ""))
    .filter(Boolean),
);

/** Field names that are personal data anywhere they appear, whatever the registry says. */
const ALWAYS_PERSONAL = ["email", "phone", "firstname", "lastname", "fullname", "name", "comment"];

const EMAIL_PATTERN = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
// Deliberately loose. A phone number written six ways is still a phone number.
const PHONE_PATTERN = /(?<![\w.])(?:\+\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)[\s.-]?)?\d{3}[\s.-]?\d{3,4}(?![\w.])/g;

function isPersonalField(key: string): boolean {
  const lower = key.toLowerCase();
  return (
    ALWAYS_PERSONAL.some((f) => lower === f || lower.endsWith(f)) ||
    PERSONAL_FIELD_NAMES.has(key) ||
    [...PERSONAL_FIELD_NAMES].some((f) => f.toLowerCase() === lower)
  );
}

/** Strings get scrubbed even outside a known field — an error message is not a structured object. */
export function redactString(value: string): string {
  return value.replace(EMAIL_PATTERN, REDACTED).replace(PHONE_PATTERN, REDACTED);
}

/**
 * A value safe to log.
 *
 * Cycles are handled because an error caught deep in a request often carries a reference back to
 * the object graph that produced it, and a logger that throws while logging an error loses both.
 */
export function redact(value: unknown, seen: WeakSet<object> = new WeakSet()): unknown {
  if (typeof value === "string") return redactString(value);
  if (value === null || typeof value !== "object") return value;

  if (seen.has(value)) return "[circular]";
  seen.add(value);

  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactString(value.message),
      // Stack frames are file paths and function names, but an interpolated value can reach the
      // message that heads the stack, so it goes through the same scrub.
      stack: value.stack ? redactString(value.stack) : undefined,
    };
  }

  if (Array.isArray(value)) return value.map((item) => redact(item, seen));

  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    out[key] = isPersonalField(key) ? REDACTED : redact(child, seen);
  }
  return out;
}

type LogFn = (...args: unknown[]) => void;

/**
 * The logger the server code uses. Nothing calls `console` directly.
 *
 * Thin on purpose: the value is that there is exactly one door, not that the door is clever. When
 * a real log sink or error reporter is wired in (PRD 10 FR-11 names it as a sub-processor), it is
 * wired in here and every call site is already redacted.
 */
function wrap(fn: LogFn): LogFn {
  return (...args: unknown[]) => fn(...args.map((a) => redact(a)));
}

export const log = {
  info: wrap((...args) => console.info(...args)),
  warn: wrap((...args) => console.warn(...args)),
  error: wrap((...args) => console.error(...args)),
};

/**
 * For the error reporter. Same scrub, shaped as the payload a reporter expects.
 *
 * `context` is where a route handler puts the things that make an error diagnosable — workspace
 * id, kind, document id — none of which is personal data. That distinction is the whole reason
 * this is usable: the report keeps everything needed to find the bug and none of the person.
 */
export function redactErrorReport(error: unknown, context: Record<string, unknown> = {}) {
  return {
    error: redact(error),
    context: redact(context),
  };
}
