/**
 * `loosenHtmlBlocks` lets a `<details>` hold markdown.
 *
 * CommonMark ends a raw HTML block at the next blank line, so everything written
 * under `<details>` with no blank line between is raw HTML too, and a solution
 * folded away behind "View solution" arrived as literal `**bold**` and unparsed
 * bullets. Writers hit this constantly, because nothing about the source says
 * that the blank line is load-bearing.
 *
 * The repair is a blank line in the places CommonMark wants one: after the tags
 * that open the disclosure and before the tags that close it. What is between
 * them is then ordinary markdown, and `rehype-raw` puts the pieces back together
 * around it.
 *
 * Only `<details>` and `<summary>`. Loosening every block container would be the
 * same two lines, but it would also reflow statements that already render the
 * way their author meant: text alone in a `<div>` is raw HTML today and would
 * become a `<p>` with margins on it. A disclosure has no such history — nobody
 * has content relying on markdown inside one staying unparsed, since that is the
 * complaint.
 */

/** Ends with an opening `<details>`/`<summary>`, or with `</summary>`. */
const OPENS_CONTENT = /(?:<(?:details|summary)(?:\s[^<>]*)?>|<\/summary\s*>)\s*$/i;

/** Starts with one of the tags, which is what makes the line structural rather than prose. */
const STARTS_WITH_TAG = /^ {0,3}<\/?(?:details|summary)(?:[\s/>]|$)/i;

/** Starts with a closing tag, so the markdown above it has ended. */
const CLOSES_CONTENT = /^ {0,3}<\/(?:details|summary)\s*>/i;

/** A fence line, with the run that a matching closing fence has to reach. */
const FENCE = /^ {0,3}(`{3,}|~{3,})/;

function isBlank(line: string | undefined): boolean {
  return line === undefined || line.trim() === "";
}

export function loosenHtmlBlocks(source: string): string {
  if (!/<\/?(?:details|summary)\b/i.test(source)) return source;

  const lines = source.split("\n");
  const out: string[] = [];
  /** The fence run currently open, or null outside a fenced block. */
  let fence: string | null = null;

  for (const [index, line] of lines.entries()) {
    const fenceMatch = FENCE.exec(line);

    if (fence) {
      // Only a fence of the same character and at least the same length closes.
      if (fenceMatch?.[1]?.startsWith(fence[0] ?? "") && fenceMatch[1].length >= fence.length) fence = null;
      out.push(line);

      continue;
    }

    if (fenceMatch?.[1]) {
      fence = fenceMatch[1];
      out.push(line);

      continue;
    }

    if (!STARTS_WITH_TAG.test(line)) {
      out.push(line);

      continue;
    }

    if (CLOSES_CONTENT.test(line) && !isBlank(out[out.length - 1])) out.push("");

    out.push(line);

    if (OPENS_CONTENT.test(line) && !isBlank(lines[index + 1])) out.push("");
  }

  return out.join("\n");
}
