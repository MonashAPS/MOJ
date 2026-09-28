import { cookies } from "next/headers";
import { cache } from "react";
import { renderTimeZone, TIMEZONE_COOKIE } from "./date-formatters";

/** A per-browser hint for SSR, never a stored account preference. */
export const viewerDateSettings = cache(async () => {
  const jar = await cookies();

  return {
    timeZone: renderTimeZone(jar.get(TIMEZONE_COOKIE)?.value),
    now: Date.now(),
  };
});
