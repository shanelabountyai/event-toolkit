/**
 * UUID generation for every entity in the suite.
 *
 * `crypto.randomUUID()` is available in every evergreen browser and in Node 19+, so we
 * avoid taking a `uuid` dependency. The fallback exists only for exotic runtimes (e.g. a
 * non-secure browsing context) so the app degrades instead of throwing.
 */
/** Structural subset of the Web Crypto API — declared locally so this package needs no DOM lib. */
interface CryptoLike {
  randomUUID?: () => string;
  getRandomValues?: <T extends Uint8Array>(array: T) => T;
}

export function newId(): string {
  const cryptoObj: CryptoLike | undefined = (
    globalThis as unknown as { crypto?: CryptoLike }
  ).crypto;

  if (cryptoObj && typeof cryptoObj.randomUUID === "function") {
    return cryptoObj.randomUUID();
  }

  // RFC 4122 v4 fallback built from random bytes when available, Math.random otherwise.
  const bytes = new Uint8Array(16);
  if (cryptoObj && typeof cryptoObj.getRandomValues === "function") {
    cryptoObj.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(
    16,
    20,
  )}-${hex.slice(20)}`;
}

/** Current time as an ISO 8601 datetime string. */
export function nowIso(): string {
  return new Date().toISOString();
}

/** Today as an ISO 8601 date (YYYY-MM-DD) in the local timezone. */
export function todayIsoDate(): string {
  const d = new Date();
  return toIsoDate(d);
}

/** Format a Date as YYYY-MM-DD using local calendar fields (no UTC shifting). */
export function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Add (or subtract, with a negative value) whole days to a YYYY-MM-DD date string.
 * Parsed as a local calendar date so results never drift by a day across timezones.
 */
export function addDaysToIsoDate(isoDate: string, days: number): string {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!parts) return isoDate;
  const d = new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]));
  d.setDate(d.getDate() + days);
  return toIsoDate(d);
}
