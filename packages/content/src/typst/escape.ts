/** Escapes a JavaScript string into a Typst string literal, including the quotes. */
export function typstEscapeString(value: string): string {
  let out = '"';

  for (const character of value) {
    switch (character) {
      case "\\":
        out += "\\\\";
        break;
      case '"':
        out += '\\"';
        break;
      case "\n":
        out += "\\n";
        break;
      case "\r":
        break;
      case "\t":
        out += "\\t";
        break;
      default: {
        const code = character.codePointAt(0) ?? 0;
        // Control characters have no literal spelling in Typst.
        out += code < 0x20 ? `\\u{${code.toString(16)}}` : character;
      }
    }
  }

  return `${out}"`;
}

/** A Typst array literal of strings, e.g. `("a", "b")`. */
export function typstStringArray(values: readonly string[]): string {
  if (values.length === 0) return "()";
  const body = values.map(typstEscapeString).join(", ");

  // A one-element Typst array keeps a trailing comma, or it is just a parenthesis.
  return values.length === 1 ? `(${body},)` : `(${body})`;
}

function isNumberValue(value: string | number): value is number {
  return typeof value === "number";
}

/** A Typst literal for a value that may be absent. */
export function typstOptional(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "none";

  if (isNumberValue(value)) return Number.isFinite(value) ? String(value) : "none";

  return typstEscapeString(value);
}
