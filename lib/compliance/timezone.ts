/**
 * Quiet-hours resolution.
 *
 * TCPA quiet hours are defined in the *recipient's* local time (8:00–20:00 by
 * default). We derive an IANA timezone from the property's 2-letter US state
 * and compute the local hour with `Intl.DateTimeFormat` (correct across DST
 * with no dependencies).
 *
 * Known limitation: several states span two zones (FL, TX, …). We use each
 * state's majority zone. This is an approximation; for boundary-zip precision a
 * zip→timezone lookup can override `stateToTimeZone` later. The gate fails
 * closed when a state does not resolve, so an unknown/blank state blocks rather
 * than risks an out-of-hours send.
 */

const STATE_TIME_ZONE: Readonly<Record<string, string>> = {
  AL: "America/Chicago",
  AK: "America/Anchorage",
  AZ: "America/Phoenix",
  AR: "America/Chicago",
  CA: "America/Los_Angeles",
  CO: "America/Denver",
  CT: "America/New_York",
  DE: "America/New_York",
  DC: "America/New_York",
  FL: "America/New_York",
  GA: "America/New_York",
  HI: "Pacific/Honolulu",
  ID: "America/Boise",
  IL: "America/Chicago",
  IN: "America/Indiana/Indianapolis",
  IA: "America/Chicago",
  KS: "America/Chicago",
  KY: "America/New_York",
  LA: "America/Chicago",
  ME: "America/New_York",
  MD: "America/New_York",
  MA: "America/New_York",
  MI: "America/Detroit",
  MN: "America/Chicago",
  MS: "America/Chicago",
  MO: "America/Chicago",
  MT: "America/Denver",
  NE: "America/Chicago",
  NV: "America/Los_Angeles",
  NH: "America/New_York",
  NJ: "America/New_York",
  NM: "America/Denver",
  NY: "America/New_York",
  NC: "America/New_York",
  ND: "America/Chicago",
  OH: "America/New_York",
  OK: "America/Chicago",
  OR: "America/Los_Angeles",
  PA: "America/New_York",
  RI: "America/New_York",
  SC: "America/New_York",
  SD: "America/Chicago",
  TN: "America/Chicago",
  TX: "America/Chicago",
  UT: "America/Denver",
  VT: "America/New_York",
  VA: "America/New_York",
  WA: "America/Los_Angeles",
  WV: "America/New_York",
  WI: "America/Chicago",
  WY: "America/Denver",
  PR: "America/Puerto_Rico",
  VI: "America/St_Thomas",
  GU: "Pacific/Guam",
};

/** Resolve a US state code to its majority IANA timezone, or null if unknown. */
export function stateToTimeZone(state: string | null | undefined): string | null {
  if (!state) return null;
  return STATE_TIME_ZONE[state.trim().toUpperCase()] ?? null;
}

/** The recipient-local hour (0–23) in a given IANA timezone at instant `now`. */
export function localHourInZone(timeZone: string, now: Date): number {
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    hour12: false,
  }).format(now);
  // Intl can emit "24" for midnight under hour12:false on some runtimes.
  const hour = Number.parseInt(formatted, 10) % 24;
  return Number.isFinite(hour) ? hour : 0;
}

export interface QuietHoursResult {
  /** Resolved IANA zone, or null when the state could not be mapped. */
  timeZone: string | null;
  /** Recipient-local hour, or null when the zone is unresolved. */
  localHour: number | null;
  /** True only when the zone resolved AND the local hour is inside the window. */
  allowed: boolean;
}

/**
 * Evaluate quiet hours for a recipient in `state` at `now`. Sending is allowed
 * only within [startHour, endHour) in the recipient's local time. Unresolved
 * state -> allowed:false (fail closed).
 */
export function evaluateQuietHours(args: {
  state: string | null | undefined;
  now: Date;
  startHour: number;
  endHour: number;
}): QuietHoursResult {
  const timeZone = stateToTimeZone(args.state);
  if (!timeZone) {
    return { timeZone: null, localHour: null, allowed: false };
  }
  const localHour = localHourInZone(timeZone, args.now);
  const allowed = localHour >= args.startHour && localHour < args.endHour;
  return { timeZone, localHour, allowed };
}
