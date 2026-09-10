import { cookies } from "next/headers";

/**
 * The viewer's display language, DMOJ's `request.LANGUAGE_CODE`.
 *
 * DMOJ picks a problem statement with `problem.translations.get(language=
 * request.LANGUAGE_CODE)` — an exact match on the viewer's language, and the
 * untranslated statement otherwise. MOJ has no message catalogues, so the only
 * thing the language selects is which `problemTranslations` row a statement
 * comes from, but the rule and the code space are DMOJ's.
 */

/** `settings.LANGUAGES` (dmoj/settings.py:399). */
export const SITE_LANGUAGES: readonly { readonly code: string; readonly label: string }[] = [
  { code: "en", label: "English (en)" },
  { code: "ca", label: "Català (ca)" },
  { code: "de", label: "Deutsch (de)" },
  { code: "el", label: "Ελληνικά (el)" },
  { code: "es", label: "Español (es)" },
  { code: "fr", label: "Français (fr)" },
  { code: "hr", label: "Hrvatski (hr)" },
  { code: "hu", label: "Magyar (hu)" },
  { code: "ja", label: "日本語 (ja)" },
  { code: "kk", label: "Қазақша (kk)" },
  { code: "ko", label: "한국어 (ko)" },
  { code: "pt", label: "Português (pt)" },
  { code: "ro", label: "Română (ro)" },
  { code: "ru", label: "Русский (ru)" },
  { code: "sr-latn", label: "Srpski (sr-latn)" },
  { code: "tr", label: "Türkçe (tr)" },
  { code: "vi", label: "Tiếng Việt (vi)" },
  { code: "zh-hans", label: "简体中文 (zh-hans)" },
  { code: "zh-hant", label: "繁體中文 (zh-hant)" },
];

/** `settings.LANGUAGE_CODE`. */
export const DEFAULT_LANGUAGE = "en";

export const LANGUAGE_COOKIE = "moj-language";

const CODES = new Set(SITE_LANGUAGES.map((language) => language.code));

/** A cookie value is only a language if `settings.LANGUAGES` lists it. */
export function normaliseLanguage(value: string | null | undefined): string {
  if (!value) return DEFAULT_LANGUAGE;
  const trimmed = value.trim().toLowerCase();
  return CODES.has(trimmed) ? trimmed : DEFAULT_LANGUAGE;
}

/** Server side `request.LANGUAGE_CODE`. */
export async function viewerLanguage(): Promise<string> {
  const jar = await cookies();
  return normaliseLanguage(jar.get(LANGUAGE_COOKIE)?.value);
}
