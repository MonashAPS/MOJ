import { describe, expect, it } from "vitest";
import { DEFAULT_LANGUAGE, normaliseLanguage, SITE_LANGUAGES } from "./language";

describe("normaliseLanguage", () => {
  it("keeps a language settings.LANGUAGES lists", () => {
    expect(normaliseLanguage("es")).toBe("es");
    expect(normaliseLanguage("zh-hans")).toBe("zh-hans");
    expect(normaliseLanguage("sr-latn")).toBe("sr-latn");
  });

  it("falls back to LANGUAGE_CODE for anything else", () => {
    expect(normaliseLanguage(null)).toBe(DEFAULT_LANGUAGE);
    expect(normaliseLanguage("")).toBe(DEFAULT_LANGUAGE);
    expect(normaliseLanguage("klingon")).toBe(DEFAULT_LANGUAGE);
    // No prefix matching: DMOJ's lookup is an exact translations.get().
    expect(normaliseLanguage("es-MX")).toBe(DEFAULT_LANGUAGE);
  });

  it("is case insensitive and trims", () => {
    expect(normaliseLanguage(" ES ")).toBe("es");
  });
});

describe("SITE_LANGUAGES", () => {
  it("offers every language the imported translations use", () => {
    const codes = new Set(SITE_LANGUAGES.map((language) => language.code));
    // halftheproblem carries its input and output spec only in the `es` row.
    expect(codes.has("es")).toBe(true);
    expect(codes.has(DEFAULT_LANGUAGE)).toBe(true);
  });

  it("lists no duplicates", () => {
    const codes = SITE_LANGUAGES.map((language) => language.code);
    expect(new Set(codes).size).toBe(codes.length);
  });
});
