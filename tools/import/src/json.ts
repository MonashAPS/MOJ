/**
 * The value space `JSON.parse` can produce. Everything the importer reads back
 * from disk — the raw JSONL rows, the extraction manifest, the state file and
 * the JSON columns DMOJ stores as text — enters the program as one of these and
 * is narrowed from here.
 */
export interface JsonObject {
  [key: string]: JsonValue;
}

export type JsonValue = string | number | boolean | null | JsonValue[] | JsonObject;

export function isJsonText(value: JsonValue | undefined): value is string {
  return typeof value === "string";
}

export function isJsonNumber(value: JsonValue | undefined): value is number {
  return typeof value === "number";
}

export function isJsonArray(value: JsonValue | undefined): value is JsonValue[] {
  return Array.isArray(value);
}

export function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Parses one JSON document, returning null when the text is not valid JSON. */
export function parseJson(text: string): JsonValue | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
