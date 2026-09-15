/**
 * Turns the code blocks in a rendered statement into the window motif
 * (DESIGN 14.3): a 26px titlebar carrying the block's role and a Copy button,
 * over the code body, with an input/output pair sitting side by side above 900px.
 *
 * This runs on the server, on the HTML `renderMarkdown` produced, so the final
 * height of every sample is known before the page paints — the reason it is not
 * done by a `useEffect` after hydration.
 */

const FRAME =
  "not-prose my-4 overflow-hidden rounded-md border border-border-strong bg-code " +
  // The statement stylesheet loads after Tailwind's utilities layer, so the
  // frame has to win the margin and border back explicitly.
  "[&_pre]:m-0! [&_pre]:rounded-none! [&_pre]:border-0! [&_.codehilite]:m-0! [&_.codehilite]:rounded-none! [&_.codehilite]:border-0!";

const BAR = "flex h-[26px] items-center justify-between gap-2 bg-titlebar pl-3 pr-1 text-titlebar-ink";

const BAR_LABEL = "font-sans text-xs font-semibold uppercase tracking-label";

const COPY_BUTTON =
  "inline-flex size-[22px] items-center justify-center rounded-sm text-titlebar-ink-2 hover:bg-white/10 hover:text-titlebar-ink focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-royal";

const COPY_ICON =
  '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" data-icon="copy"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>';

const CHECK_ICON =
  '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" data-icon="check"><path d="M20 6 9 17l-5-5"/></svg>';

export const STATEMENT_COPY_ICONS = { copy: COPY_ICON, check: CHECK_ICON };

type Block = { start: number; end: number; html: string };

type PairedOutput = { html: string; end: number };

/** The fenced and indented code blocks, in document order, without descending
 *  into one another: `.codehilite` already wraps its own `<pre>`. */
function findBlocks(html: string): Block[] {
  const blocks: Block[] = [];
  const pattern = /<div class="codehilite">[\s\S]*?<\/div>|<pre(?:\s[^>]*)?>[\s\S]*?<\/pre>/g;
  let match = pattern.exec(html);

  while (match !== null) {
    blocks.push({ start: match.index, end: match.index + match[0].length, html: match[0] });
    match = pattern.exec(html);
  }

  return blocks;
}

const HEADING = /<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/g;

type BlockRole = { label: string; role: "input" | "output" | "code" };

/** The role of a block is the nearest heading above it: DMOJ's statements put a
 *  `### Input` / `### Output` pair over each sample. */
function roleFor(html: string, at: number): BlockRole {
  let heading: string | null = null;
  HEADING.lastIndex = 0;
  let match = HEADING.exec(html);

  while (match !== null && match.index < at) {
    heading = match[1] ?? null;
    match = HEADING.exec(html);
  }

  const text = (heading ?? "").replace(/<[^>]*>/g, "").trim();

  if (/\binput\b/i.test(text)) return { label: "Input", role: "input" };

  if (/\boutput\b/i.test(text)) return { label: "Output", role: "output" };

  if (/\bsample\b|\bexample\b/i.test(text)) return { label: "Sample", role: "code" };

  return { label: "Code", role: "code" };
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function frame(inner: string, label: string, role: string, index: number): string {
  const name = escapeAttribute(`Copy ${label.toLowerCase()} ${index}`);

  return [
    `<figure class="${FRAME}" data-sample-role="${role}">`,
    `<figcaption class="${BAR}">`,
    `<span class="${BAR_LABEL}">${label} ${index}</span>`,
    `<button type="button" class="${COPY_BUTTON}" data-statement-copy aria-label="${name}" title="${name}">${COPY_ICON}</button>`,
    "</figcaption>",
    `<div class="max-h-[320px] overflow-auto bg-code" data-statement-code>${inner}</div>`,
    "</figure>",
  ].join("");
}

/**
 * Rewrites `html`. An input frame immediately followed by an output frame — with
 * nothing between them but that output's own heading — becomes one two-column
 * grid, so a page of five samples does not double its own scroll.
 */
export function decorateStatement(html: string): string {
  const blocks = findBlocks(html);

  if (blocks.length === 0) return html;

  const counters = new Map<string, number>();

  const frames = blocks.map((block) => {
    const { label, role } = roleFor(html, block.start);
    const count = (counters.get(label) ?? 0) + 1;
    counters.set(label, count);

    return { role, label, html: frame(block.html, label, role, count) };
  });

  /** The output frame that pairs with the input frame at `index`: only that
   *  output's own heading may sit between the two. */
  function pairedOutput(index: number): PairedOutput | null {
    const left = frames[index];
    const right = frames[index + 1];
    const leftBlock = blocks[index];
    const rightBlock = blocks[index + 1];

    if (!left || !right || !leftBlock || !rightBlock) return null;

    if (left.role !== "input" || right.role !== "output") return null;
    const between = html.slice(leftBlock.end, rightBlock.start);

    const text = between
      .replace(/<[^>]*>/g, " ")
      .replace(/output/gi, " ")
      .replace(/[\s\d:.\u2014-]+/g, "");

    return text === "" ? { html: right.html, end: rightBlock.end } : null;
  }

  const out: string[] = [];
  let cursor = 0;
  let index = 0;

  while (index < frames.length) {
    const current = frames[index];
    const block = blocks[index];

    if (!current || !block) break;
    out.push(html.slice(cursor, block.start));
    const paired = pairedOutput(index);

    if (paired === null) {
      out.push(current.html);
      cursor = block.end;
      index += 1;
    } else {
      out.push(
        `<div class="not-prose my-4 grid items-start gap-3 min-[900px]:grid-cols-2 [&>figure]:my-0">${current.html}${paired.html}</div>`,
      );
      cursor = paired.end;
      index += 2;
    }
  }

  out.push(html.slice(cursor));

  return out.join("");
}
