/** DMOJ shows a plain timezone select. Intl gives us the canonical IANA list on
 *  Node 24, with a small fallback for runtimes that do not implement it. */

const FALLBACK = [
  "UTC",
  "Australia/Adelaide",
  "Australia/Brisbane",
  "Australia/Darwin",
  "Australia/Hobart",
  "Australia/Melbourne",
  "Australia/Perth",
  "Australia/Sydney",
  "Asia/Hong_Kong",
  "Asia/Kolkata",
  "Asia/Shanghai",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Paris",
  "America/New_York",
  "America/Toronto",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Pacific/Auckland",
];

export function timezoneList(): string[] {
  const supported = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf;
  if (typeof supported === "function") {
    try {
      const zones = supported("timeZone");
      if (zones.length > 0) return zones;
    } catch {
      // fall through
    }
  }
  return FALLBACK;
}

export const DEFAULT_TIMEZONE = "Australia/Melbourne";
