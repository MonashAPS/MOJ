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
  if (values.length === 1) return `(${typstEscapeString(values[0] as string)},)`;
  return `(${values.map(typstEscapeString).join(", ")})`;
}

/** A Typst literal for a value that may be absent. */
export function typstOptional(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "none";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "none";
  return typstEscapeString(value);
}
