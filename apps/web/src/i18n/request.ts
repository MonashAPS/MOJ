import { getRequestConfig } from "next-intl/server";
import { viewerDateSettings } from "@/lib/date-format.server";
import { intlLocale } from "@/lib/language";
import { viewerLanguage } from "@/lib/language.server";
import { loadMessages } from "./messages";

/**
 * Where next-intl gets the viewer's language and their messages.
 *
 * There is no locale segment in the URL. MOJ keeps DMOJ's arrangement, where a
 * page has one address whatever language it is read in and the choice lives in
 * a cookie, so every route stays at the path DMOJ published it at.
 */
export default getRequestConfig(async () => {
  const language = await viewerLanguage();
  const dateSettings = await viewerDateSettings();

  return {
    locale: language,
    // `Intl` does the formatting and does not know DMOJ's spelling of Chinese.
    formats: { dateTime: {}, number: {}, list: {} },
    // Dates with an unknown browser timezone are rendered as placeholders.
    timeZone: dateSettings.timeZone ?? "UTC",
    now: new Date(dateSettings.now),
    messages: await loadMessages(language),
    getMessageFallback({ namespace, key }) {
      // A missing message shows its key rather than an empty space, so a gap in
      // a catalogue is obvious in review instead of invisible in production.
      return namespace ? `${namespace}.${key}` : key;
    },
    onError() {
      // Missing messages fall back to English by construction in `loadMessages`;
      // next-intl's own warning would fire for every one of them in development.
    },
  };
});

export { intlLocale };
