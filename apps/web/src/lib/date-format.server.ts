import { cookies } from "next/headers";
import { cache } from "react";
import { TIMEZONE_COOKIE, validTimeZone } from "./date-formatters";

/** A per-browser hint for SSR, never a stored account preference. */
export const viewerDateSettings = cache(async () => {
  const jar = await cookies();

  return {
    timeZone: validTimeZone(jar.get(TIMEZONE_COOKIE)?.value),
    now: Date.now(),
  };
});
