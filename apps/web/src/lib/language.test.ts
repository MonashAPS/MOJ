import { describe, expect, it } from "vitest";
import { DEFAULT_LANGUAGE, intlLocale, normaliseLanguage, SITE_LANGUAGES } from "./language";

describe("normaliseLanguage", () => {
  it("keeps a language the site is translated into", () => {
    expect(normaliseLanguage("es")).toBe("es");
    expect(normaliseLanguage("zh-hans")).toBe("zh-hans");
    expect(normaliseLanguage("ru")).toBe("ru");
    expect(normaliseLanguage("id")).toBe("id");
  });

  it("falls back to LANGUAGE_CODE for anything else", () => {
    expect(normaliseLanguage(null)).toBe(DEFAULT_LANGUAGE);
    expect(normaliseLanguage("")).toBe(DEFAULT_LANGUAGE);
    expect(normaliseLanguage("klingon")).toBe(DEFAULT_LANGUAGE);
    // No prefix matching: DMOJ's lookup is an exact translations.get().
    expect(normaliseLanguage("es-MX")).toBe(DEFAULT_LANGUAGE);
  });

  it("drops a DMOJ language the interface is not translated into", () => {
    // The menu used to carry all nineteen of DMOJ's languages while the
    // interface stayed English in every one of them. A cookie left over from
    // then reads as English rather than as a half-translated page.
    for (const stale of ["sr-latn", "fr", "ja", "vi", "zh-hant"]) {
      expect(normaliseLanguage(stale)).toBe(DEFAULT_LANGUAGE);
    }
  });

  it("is case insensitive and trims", () => {
    expect(normaliseLanguage(" ES ")).toBe("es");
  });
});

describe("SITE_LANGUAGES", () => {
  it("offers every language that has a catalogue", () => {
    const codes = SITE_LANGUAGES.map((language) => language.code);
    expect([...codes].sort()).toEqual(["en", "es", "id", "ru", "zh-hans"]);
  });

  it("lists no duplicates", () => {
    const codes = SITE_LANGUAGES.map((language) => language.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("labels each language in itself", () => {
    // A reader looking for their language finds it written the way they write
    // it, not the way English writes it.
    const labels = Object.fromEntries(SITE_LANGUAGES.map((l) => [l.code, l.label]));
    expect(labels.es).toContain("Español");
    expect(labels.ru).toContain("Русский");
    expect(labels.id).toContain("Bahasa Indonesia");
    expect(labels["zh-hans"]).toContain("简体中文");
  });
});

describe("intlLocale", () => {
  it("spells Chinese the way Intl does", () => {
    // The cookie and the statement lookup keep DMOJ's `zh-hans`; `Intl` wants
    // the BCP 47 casing, and gets it only here.
    expect(intlLocale("zh-hans")).toBe("zh-Hans");
  });

  it("leaves the others alone", () => {
    for (const code of ["en", "es", "id", "ru"]) {
      expect(intlLocale(code)).toBe(code);
    }
  });
});
