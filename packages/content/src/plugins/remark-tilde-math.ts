/**
 * `remarkTildeMath` reproduces DMOJ's `judge/jinja2/markdown/math.py` delimiters on top of
 * micromark, so that statements written for DMOJ keep rendering the same way.
 *
 * DMOJ inserts two extra inline rules into mistune, both *after* `strikethrough` so that
 * `~~struck~~` keeps winning:
 *
 *     block_math = ^\$\$(.*?)\$\$ | ^\\\[(.*?)\\\]     display
 *     math       = ^~(.*?)~      | ^\\\((.*?)\\\)      inline
 *
 * Here the same four delimiters become micromark text constructs. Extension constructs are
 * tried before micromark's own, so:
 *
 *   - `\(` and `\[` win over `characterEscape`, while `\~` does not (this construct rejects
 *     it), which keeps an escaped tilde literal;
 *   - `~x~` wins over GFM strikethrough, while `~~x~~` is rejected here and falls through to
 *     it;
 *   - `$$x$$` wins over `remark-math`'s text math, so a double dollar is display maths
 *     wherever it appears, exactly as DMOJ's `block_math` rule does. Single `$x$` is left to
 *     `remark-math`.
 *
 * Unlike DMOJ, `~...~` may not span a line ending. DMOJ compiles the rule with `re.DOTALL`,
 * which lets a stray tilde swallow the rest of a paragraph; that is a bug rather than a
 * feature, and the spec asks for the single-line behaviour.
 */

import type { Root } from "mdast";
import type { CompileContext, Extension as FromMarkdownExtension, Token } from "mdast-util-from-markdown";
import type {
  Code,
  Construct,
  Extension as MicromarkExtension,
  State,
  Tokenizer,
} from "micromark-util-types";
import type { Plugin } from "unified";

export type MathDelimiter = "tilde" | "paren" | "bracket" | "dollar";

declare module "micromark-util-types" {
  interface TokenTypeMap {
    mojMathTilde: "mojMathTilde";
    mojMathBackslash: "mojMathBackslash";
    mojMathBackslashMarker: "mojMathBackslashMarker";
    mojMathBackslashData: "mojMathBackslashData";
    mojMathDollar: "mojMathDollar";
    mojMathDollarMarker: "mojMathDollarMarker";
    mojMathDollarData: "mojMathDollarData";
  }
}

const CODE_BACKSLASH = 92;
const CODE_TILDE = 126;
const CODE_DOLLAR = 36;
const CODE_PAREN_OPEN = 40;
const CODE_PAREN_CLOSE = 41;
const CODE_BRACKET_OPEN = 91;
const CODE_BRACKET_CLOSE = 93;

const TOKEN_TILDE = "mojMathTilde";
const TOKEN_BACKSLASH = "mojMathBackslash";
const TOKEN_DOLLAR = "mojMathDollar";
const TOKEN_BACKSLASH_MARKER = "mojMathBackslashMarker";
const TOKEN_BACKSLASH_DATA = "mojMathBackslashData";
const TOKEN_DOLLAR_MARKER = "mojMathDollarMarker";
const TOKEN_DOLLAR_DATA = "mojMathDollarData";

/** Virtual line-ending codes used by micromark's preprocessor. */
function isLineEnding(code: Code): boolean {
  return code === -5 || code === -4 || code === -3;
}

/** `~inline~`; never across a line ending, never `~~`. */
const tildeMath: Construct = {
  name: TOKEN_TILDE,
  tokenize: function tokenizeTilde(effects, ok, nok): State {
    let seenData = false;

    return start;

    function start(code: Code): State | undefined {
      effects.enter(TOKEN_TILDE);
      effects.consume(code);
      return afterOpen;
    }

    function afterOpen(code: Code): State | undefined {
      // `~~` belongs to GFM strikethrough; `~` at end of line stays literal.
      if (code === CODE_TILDE || code === null || isLineEnding(code)) return nok(code);
      return inside(code);
    }

    function inside(code: Code): State | undefined {
      if (code === null || isLineEnding(code)) return nok(code);
      if (code === CODE_TILDE) {
        if (!seenData) return nok(code);
        effects.consume(code);
        effects.exit(TOKEN_TILDE);
        return ok;
      }
      seenData = true;
      effects.consume(code);
      return inside;
    }
  } satisfies Tokenizer,
};

/**
 * `\(inline\)` and `\[display\]` share an opening character, so they share a construct and a
 * token type; the handler tells them apart from the serialised source.
 */
const backslashMath: Construct = {
  name: TOKEN_BACKSLASH,
  tokenize: function tokenizeBackslash(effects, ok, nok): State {
    let closer = 0;
    let open = false;

    return start;

    function start(code: Code): State | undefined {
      effects.enter(TOKEN_BACKSLASH);
      effects.enter(TOKEN_BACKSLASH_MARKER);
      effects.consume(code);
      return afterBackslash;
    }

    function afterBackslash(code: Code): State | undefined {
      if (code === CODE_PAREN_OPEN) {
        closer = CODE_PAREN_CLOSE;
      } else if (code === CODE_BRACKET_OPEN) {
        closer = CODE_BRACKET_CLOSE;
      } else {
        // Anything else (`\~`, `\*`, `\\`, ...) is left to `characterEscape`.
        return nok(code);
      }
      effects.consume(code);
      effects.exit(TOKEN_BACKSLASH_MARKER);
      return inside;
    }

    function inside(code: Code): State | undefined {
      if (code === null) return closeData(nok)(code);
      if (isLineEnding(code)) {
        closeData();
        effects.enter("lineEnding");
        effects.consume(code);
        effects.exit("lineEnding");
        return inside;
      }
      openData();
      if (code === CODE_BACKSLASH) {
        effects.consume(code);
        return maybeClose;
      }
      effects.consume(code);
      return inside;
    }

    function maybeClose(code: Code): State | undefined {
      if (code === null) return closeData(nok)(code);
      if (code === closer) {
        // The `\` already consumed above belongs to the closing marker; the data token is
        // trimmed by the handler, which knows both delimiters are two characters wide.
        effects.consume(code);
        closeData();
        effects.exit(TOKEN_BACKSLASH);
        return ok;
      }
      // A backslash that is not the closer is ordinary TeX (`\frac`, `\\`, ...).
      return inside(code);
    }

    function openData(): void {
      if (!open) {
        effects.enter(TOKEN_BACKSLASH_DATA);
        open = true;
      }
    }

    function closeData(next?: State): State {
      if (open) {
        effects.exit(TOKEN_BACKSLASH_DATA);
        open = false;
      }
      return next ?? (inside as State);
    }
  } satisfies Tokenizer,
};

/** `$$display$$` anywhere, including inside a paragraph, as DMOJ's `block_math` rule does. */
const dollarDisplayMath: Construct = {
  name: TOKEN_DOLLAR,
  tokenize: function tokenizeDollar(effects, ok, nok): State {
    let seenData = false;
    let open = false;

    return start;

    function start(code: Code): State | undefined {
      effects.enter(TOKEN_DOLLAR);
      effects.enter(TOKEN_DOLLAR_MARKER);
      effects.consume(code);
      return secondOpen;
    }

    function secondOpen(code: Code): State | undefined {
      if (code !== CODE_DOLLAR) return nok(code);
      effects.consume(code);
      effects.exit(TOKEN_DOLLAR_MARKER);
      return inside;
    }

    function inside(code: Code): State | undefined {
      if (code === null) return closeData(nok)(code);
      if (isLineEnding(code)) {
        closeData();
        effects.enter("lineEnding");
        effects.consume(code);
        effects.exit("lineEnding");
        return inside;
      }
      if (code === CODE_DOLLAR) {
        if (!seenData) return closeData(nok)(code);
        closeData();
        effects.enter(TOKEN_DOLLAR_MARKER);
        effects.consume(code);
        return maybeClose;
      }
      seenData = true;
      openData();
      effects.consume(code);
      return inside;
    }

    function maybeClose(code: Code): State | undefined {
      if (code === CODE_DOLLAR) {
        effects.consume(code);
        effects.exit(TOKEN_DOLLAR_MARKER);
        effects.exit(TOKEN_DOLLAR);
        return ok;
      }
      if (code === null) return nok(code);
      // A lone `$` inside the maths: it was not a closing marker after all.
      effects.exit(TOKEN_DOLLAR_MARKER);
      return inside(code);
    }

    function openData(): void {
      if (!open) {
        effects.enter(TOKEN_DOLLAR_DATA);
        open = true;
      }
    }

    function closeData(next?: State): State {
      if (open) {
        effects.exit(TOKEN_DOLLAR_DATA);
        open = false;
      }
      return next ?? (inside as State);
    }
  } satisfies Tokenizer,
};

export function mojMathSyntax(): MicromarkExtension {
  return {
    text: {
      [CODE_TILDE]: tildeMath,
      [CODE_BACKSLASH]: backslashMath,
      [CODE_DOLLAR]: dollarDisplayMath,
    },
  };
}

interface MathNodeShape {
  type: string;
  value: string;
  meta?: string | null;
  data?: Record<string, unknown>;
}

function inlineMathData(value: string): Record<string, unknown> {
  return {
    hName: "code",
    hProperties: { className: ["language-math", "math-inline"] },
    hChildren: [{ type: "text", value }],
  };
}

function displayMathData(value: string): Record<string, unknown> {
  // A `span` rather than `mdast-util-math`'s `pre`: `\[...\]` and `$$...$$` can appear inside
  // a paragraph, and `rehype-raw` re-parses the tree with parse5, which would hoist a `pre`
  // out of its paragraph and split it. `rehype-katex` only looks at the class names.
  return {
    hName: "span",
    hProperties: { className: ["language-math", "math-display"] },
    hChildren: [{ type: "text", value }],
  };
}

function enterMath(display: boolean) {
  return function enter(this: CompileContext, token: Token): void {
    const node = display ? { type: "math", value: "", meta: null } : { type: "inlineMath", value: "" };
    this.enter(node as never, token);
  };
}

function exitMath(fixed: { delimiter: MathDelimiter; display: boolean; open: number } | undefined) {
  return function exit(this: CompileContext, token: Token): void {
    const raw = this.sliceSerialize(token);
    const shape = fixed ?? {
      delimiter: (raw.charCodeAt(1) === CODE_BRACKET_OPEN ? "bracket" : "paren") as "bracket" | "paren",
      display: raw.charCodeAt(1) === CODE_BRACKET_OPEN,
      open: 2,
    };
    const value = raw.slice(shape.open, raw.length - shape.open);
    const node = this.stack[this.stack.length - 1] as unknown as MathNodeShape;
    // `\(` and `\[` share a construct, so the node type is settled here.
    node.type = shape.display ? "math" : "inlineMath";
    if (shape.display && node.meta === undefined) node.meta = null;
    node.value = value;
    node.data = {
      ...(shape.display ? displayMathData(value) : inlineMathData(value)),
      mojDelimiter: shape.delimiter,
    };
    this.exit(token);
  };
}

export function mojMathFromMarkdown(): FromMarkdownExtension {
  return {
    enter: {
      [TOKEN_TILDE]: enterMath(false),
      [TOKEN_BACKSLASH]: enterMath(false),
      [TOKEN_DOLLAR]: enterMath(true),
    },
    exit: {
      [TOKEN_TILDE]: exitMath({ delimiter: "tilde", display: false, open: 1 }),
      [TOKEN_BACKSLASH]: exitMath(undefined),
      [TOKEN_DOLLAR]: exitMath({ delimiter: "dollar", display: true, open: 2 }),
    },
  };
}

/**
 * Adds DMOJ's `~...~`, `\(...\)`, `\[...\]` and inline `$$...$$` maths delimiters.
 *
 * Use it together with `remark-math`, which keeps handling `$...$` and block `$$`.
 */
const remarkTildeMath: Plugin<[], Root> = function remarkTildeMath() {
  const data = this.data();
  if (!data.micromarkExtensions) data.micromarkExtensions = [];
  if (!data.fromMarkdownExtensions) data.fromMarkdownExtensions = [];
  const micromarkExtensions = data.micromarkExtensions;
  const fromMarkdownExtensions = data.fromMarkdownExtensions;

  micromarkExtensions.push(mojMathSyntax());
  fromMarkdownExtensions.push(mojMathFromMarkdown());
};

export default remarkTildeMath;
export { remarkTildeMath };
