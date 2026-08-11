// packages/pii-registry/src/paths.ts
//
// The dotted-path reader and writer the registry's paths are expressed in.
//
// Two forms, and deliberately no more: `a.b.c` walks objects, and `a[].b` fans out across an
// array. A full JSONPath implementation would be a dependency and a surface area; these two cover
// every shape in the registry, and a path the notation cannot express is a signal the data shape
// wants looking at rather than the path language.

/** Values found at a path. Always an array, because `a[].b` legitimately yields many. */
export function readPath(document: unknown, path: string): unknown[] {
  return path.split(".").reduce<unknown[]>(
    (nodes, segment) => {
      const fanOut = segment.endsWith("[]");
      const key = fanOut ? segment.slice(0, -2) : segment;

      const next: unknown[] = [];
      for (const node of nodes) {
        if (node === null || typeof node !== "object") continue;
        const value = (node as Record<string, unknown>)[key];
        if (value === undefined || value === null) continue;
        if (fanOut) {
          if (Array.isArray(value)) next.push(...value);
        } else {
          next.push(value);
        }
      }
      return next;
    },
    [document],
  );
}

/**
 * Returns a copy of `document` with every value at `path` removed.
 *
 * Structurally shared where it can be, copied where it must be: the input is never mutated,
 * because these documents come off a cache that other code is still holding.
 *
 * "Removed" means the key is deleted, not set to empty string. A blank string is still a field
 * asserting something about a person; an absent key asserts nothing. Deletion is deletion.
 */
export function erasePath(document: unknown, path: string): unknown {
  const [segment, ...rest] = path.split(".");
  if (segment === undefined) return document;
  if (document === null || typeof document !== "object") return document;

  const fanOut = segment.endsWith("[]");
  const key = fanOut ? segment.slice(0, -2) : segment;
  const source = document as Record<string, unknown>;
  if (!(key in source)) return document;

  const copy: Record<string, unknown> = Array.isArray(document)
    ? ([...(document as unknown[])] as unknown as Record<string, unknown>)
    : { ...source };

  if (fanOut) {
    const array = source[key];
    if (!Array.isArray(array)) return document;
    copy[key] =
      rest.length === 0
        ? []
        : array.map((item) => erasePath(item, rest.join(".")));
    return copy;
  }

  if (rest.length === 0) {
    delete copy[key];
    return copy;
  }

  copy[key] = erasePath(source[key], rest.join("."));
  return copy;
}

/** Case-insensitive, whitespace-trimmed. An email that differs only in case is the same person. */
export function normaliseEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}
