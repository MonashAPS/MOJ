/**
 * The viewer's display language, DMOJ's `request.LANGUAGE_CODE`.
 *
 * DMOJ picks a problem statement with `problem.translations.get(language=
 * request.LANGUAGE_CODE)` — an exact match on the viewer's language, and the
 * untranslated statement otherwise. That rule and this code space are DMOJ's,
 * and the language still selects which `problemTranslations` row a statement
 * comes from.
 *
 * What is listed here is what the interface itself is translated into. DMOJ
 * offers nineteen languages; MOJ offers the ones it has a complete message
 * catalogue for, because a language in the menu that leaves the page in English
 * is worse than a language that is not offered at all.
 */

/** A language the interface is translated into, and statements are chosen by. */
export const SITE_LANGUAGES: readonly { readonly code: string; readonly label: string }[] = [
  { code: "en", label: "English (en)" },
  { code: "es", label: "Español (es)" },
  { code: "id", label: "Bahasa Indonesia (id)" },
  { code: "ru", label: "Русский (ru)" },
  { code: "zh-hans", label: "简体中文 (zh-hans)" },
];

/** `settings.LANGUAGE_CODE`. */
export const DEFAULT_LANGUAGE = "en";

export const LANGUAGE_COOKIE = "moj-language";

const CODES = new Set(SITE_LANGUAGES.map((language) => language.code));

/** A cookie value is only a language if `SITE_LANGUAGES` lists it. */
export function normaliseLanguage(value: string | null | undefined): string {
  if (!value) return DEFAULT_LANGUAGE;
  const trimmed = value.trim().toLowerCase();

  return CODES.has(trimmed) ? trimmed : DEFAULT_LANGUAGE;
}

/**
 * The BCP 47 tag `Intl` wants, which is not always DMOJ's spelling. Dates,
 * numbers and plural rules are formatted with this; the cookie and the
 * statement lookup keep the DMOJ code.
 */
export function intlLocale(language: string): string {
  return language === "zh-hans" ? "zh-Hans" : language;
}
