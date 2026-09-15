/**
 * The JSON a `v.any()` column carries, and the narrowings that read one.
 *
 * Convex hands a `v.any()` field back as whatever was written, so the reader
 * decodes it through these predicates rather than asserting a type onto it.
 */

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/** A JSON object: what a keyed read and `Object.entries` need. */
export type JsonObject = { [key: string]: JsonValue };

/** A missing key reads as `undefined`, which no JSON value is. */
export type MaybeJson = JsonValue | undefined;

export function isJsonObject(value: MaybeJson): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isJsonArray(value: MaybeJson): value is JsonValue[] {
  return Array.isArray(value);
}

export function isJsonString(value: MaybeJson): value is string {
  return typeof value === "string";
}

export function isJsonNumber(value: MaybeJson): value is number {
  return typeof value === "number";
}

/** A non-empty string, which is how DMOJ spells "this optional field is set". */
export function isNonEmptyString(value: MaybeJson): value is string {
  return typeof value === "string" && value.length > 0;
}
