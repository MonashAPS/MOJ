import { cookies } from "next/headers";
import { LANGUAGE_COOKIE, normaliseLanguage } from "./language";

/**
 * `request.LANGUAGE_CODE` on the server.
 *
 * Kept apart from `lib/language.ts` because `next/headers` cannot be pulled
 * into a client bundle, and the footer's switcher needs the language list.
 */
export async function viewerLanguage(): Promise<string> {
  const jar = await cookies();

  return normaliseLanguage(jar.get(LANGUAGE_COOKIE)?.value);
}
