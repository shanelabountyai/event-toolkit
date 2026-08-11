// packages/pii-registry/src/subject.ts
//
// PRD 10 FR-1, FR-2, FR-3 — search, export and erasure for one person, implemented once.
//
// Every function here takes a document and the registry entry describing it, and knows nothing
// about which tool the document came from or how it is stored. That is what makes these three
// operations complete by construction rather than by remembering.

import { erasePath, normaliseEmail, readPath } from "./paths";
import type { PiiLocation } from "./registry";

/** Does this document hold anything about the person at `email`? */
export function matchesSubject(document: unknown, location: PiiLocation, email: string): boolean {
  const wanted = normaliseEmail(email);
  if (!wanted) return false;

  return location.emailPaths.some((path) =>
    readPath(document, path).some((value) => normaliseEmail(value) === wanted),
  );
}

export interface SubjectExtract {
  kind: string;
  label: string;
  sensitivity: PiiLocation["sensitivity"];
  /** Path → the values held there. What a subject access request is answered with. */
  fields: Record<string, unknown[]>;
}

/** FR-3: everything this document holds about that person, for a subject access request. */
export function extractSubject(document: unknown, location: PiiLocation): SubjectExtract {
  const fields: Record<string, unknown[]> = {};
  for (const path of [...location.emailPaths, ...location.personalPaths]) {
    const values = readPath(document, path);
    if (values.length > 0) fields[path] = values;
  }
  return {
    kind: location.kind,
    label: location.label,
    sensitivity: location.sensitivity,
    fields,
  };
}

export type EraseOutcome =
  /** The row goes. The record was about this person. */
  | { action: "delete_record" }
  /** The row stays with the personal fields removed. The record was about something else. */
  | { action: "erase_fields"; document: unknown };

/**
 * FR-2: what deletion does to one document.
 *
 * **Hard deletion, not a flag.** A record marked deleted is a record still held, and "we kept it
 * but stopped showing it" is not an answer to an erasure request.
 *
 * For `fields`, only the paths the registry names are removed. Everything else — a deal amount,
 * an event's dates — survives, because that data is not about the person and destroying it would
 * make honouring one request corrupt somebody else's numbers.
 */
export function eraseSubject(document: unknown, location: PiiLocation): EraseOutcome {
  if (location.eraseStrategy === "record") return { action: "delete_record" };

  let next = document;
  for (const path of [...location.emailPaths, ...location.personalPaths]) {
    next = erasePath(next, path);
  }
  return { action: "erase_fields", document: next };
}

/**
 * Erasure scoped to one person inside a document that names several.
 *
 * A brief lists many stakeholders; erasing "stakeholders[].name" outright would blank all of
 * them. So for `fields` locations whose paths fan out over an array, only the entries matching
 * the subject are touched.
 */
export function eraseSubjectFromCollection(
  document: unknown,
  location: PiiLocation,
  email: string,
): EraseOutcome {
  if (location.eraseStrategy === "record") return { action: "delete_record" };

  const wanted = normaliseEmail(email);
  const arrayPath = [...location.emailPaths, ...location.personalPaths].find((p) => p.includes("[]"));

  if (!wanted || !arrayPath) return eraseSubject(document, location);

  const [arrayKey] = arrayPath.split("[]");
  const source = document as Record<string, unknown>;
  const array = source[arrayKey];
  if (!Array.isArray(array)) return eraseSubject(document, location);

  // Field names relative to one array entry, e.g. "stakeholders[].email" → "email".
  const relative = [...location.emailPaths, ...location.personalPaths]
    .filter((p) => p.startsWith(`${arrayKey}[]`))
    .map((p) => p.slice(arrayKey.length + 3));

  const emailFields = location.emailPaths
    .filter((p) => p.startsWith(`${arrayKey}[]`))
    .map((p) => p.slice(arrayKey.length + 3));

  return {
    action: "erase_fields",
    document: {
      ...source,
      [arrayKey]: array.map((entry) => {
        const isSubject = emailFields.some((f) =>
          readPath(entry, f).some((v) => normaliseEmail(v) === wanted),
        );
        if (!isSubject) return entry;
        return relative.reduce<unknown>((acc, field) => erasePath(acc, field), entry);
      }),
    },
  };
}
