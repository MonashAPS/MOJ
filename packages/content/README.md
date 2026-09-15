# @moj/content

The markdown pipeline and the markdown-to-Typst converter for MOJ, the MAPS Online Judge.

Everything here exists so that a problem statement written for DMOJ keeps rendering the same
way on the new site: the same maths delimiters, the same sanitiser allowlists, the same
`codehilite` markup and the same `[user:name]` references. The Typst half turns the same
statement into a printable PDF and a division booklet.

The package is server-side: it spawns the Typst binary and uses `node:crypto` for camo URLs.

## Rendering

```ts
import { renderMarkdown, renderPlain, extractSummary } from "@moj/content";

const { html, meta } = await renderMarkdown(problem.description, "problem");
const description = extractSummary(problem.description);   // og:description
const searchable = renderPlain(problem.description);
```

`renderMarkdown` is asynchronous because Shiki loads its grammars on demand. `meta` carries the
headings (with slugs), the image and link URLs, the `[user:]` references, per-delimiter maths
counts, the fence languages, the plain text and a summary.

### The pipeline

| Step | DMOJ equivalent |
| --- | --- |
| `remark-parse`, `remark-gfm` | `mistune.Markdown` |
| `remarkTildeMath` | `MathInlineGrammar` (`~x~`, `\(x\)`, `\[x\]`, `$$x$$`) |
| `remark-math` | — (`$x$` is new in MOJ) |
| heading demotion by two | `AwesomeRenderer.header` |
| HTML escaping | mistune `escape=True`, for the `safe_mode` styles |
| `remark-rehype`, `rehype-raw` | `parse_block_html` / `parse_inline_html` |
| `rehype-katex` | `MathoidMathParser`, but rendered in process |
| Shiki, wrapped in `.codehilite` | `judge.highlight_code` (Pygments) |
| `.h-scrollable-table` wrapper | `AwesomeRenderer.table` |
| `rel="nofollow"` | `AwesomeRenderer._link_rel` |
| `loading="lazy"` | `judge.jinja2.markdown.lazy_load` |
| camo | `judge.utils.camo` |
| `[user:name]` | `judge.jinja2.reference.reference` |
| `rehype-sanitize` | `bleach.Cleaner` with the style's allowlist |

### Presets

One per entry in DMOJ's `MARKDOWN_STYLES`. They differ in two ways: whether raw HTML is parsed
or printed as text (`safe_mode`), and whether the result is passed through the allowlist.

| Preset | Raw HTML | Sanitised | DMOJ style |
| --- | --- | --- | --- |
| `problem`, `contest`, `contest-tag`, `blog`, `solution`, `license`, `language`, `judge` | yes | yes | `MARKDOWN_STAFF_EDITABLE_STYLE` |
| `problem-full`, `flatpage` | yes | no | `MARKDOWN_ADMIN_EDITABLE_STYLE` |
| `comment`, `self-description`, `organization-about`, `ticket`, `default` | no | yes | `MARKDOWN_DEFAULT_STYLE` / `MARKDOWN_USER_LARGE_STYLE` |

`problem-full` and `flatpage` back DMOJ's `judge.problem_full_markup` permission and the flat
page editor: an administrator writing them is trusted, and their output is emitted verbatim.
Every other preset is sanitised even when its raw HTML was already escaped, so a bug upstream
cannot turn into stored XSS.

### Styles

```ts
import "katex/dist/katex.min.css";
import "@moj/content/styles/content.css";
```

`content.css` is DMOJ's `base-description.scss` on the MOJ design tokens, plus the `codehilite`
theme. Shiki emits both GitHub themes as `--shiki-light` / `--shiki-dark` custom properties, so
one rendered document works in either colour scheme with no re-render.

## PDFs

```ts
import { markdownToTypst, booklet, renderPdf } from "@moj/content";

const source = markdownToTypst(statement, {
  name: "Coconut Pairs",
  code: "coconutpairs",
  points: 100,
  timeLimit: 1,          // seconds
  memoryLimit: 256000,   // kilobytes, as DMOJ stores it
  authors: ["swofty"],
  inputType: "standard input",
  outputType: "standard output",
});

const pdf = await renderPdf(source, { assets: { "media/x.png": bytes } });
```

`markdownToTypst` normalises the statement for [`cmarker`](https://typst.app/universe/package/cmarker),
which parses CommonMark inside Typst and hands maths to [`mitex`](https://typst.app/universe/package/mitex):

- every maths delimiter becomes `$...$` or `$$...$$`, because pulldown-cmark reads `~x~` as
  strikethrough;
- a leading `# Title` is dropped and the remaining headings are lifted so the top section is
  `##`, which `h1-level: 0` maps onto Typst's first heading level;
- `<img>` becomes a real image and other raw HTML becomes literal text, so an `<name>`
  placeholder in an output specification survives;
- image paths are made root-absolute, and `cmarker` is handed an `image` function defined in
  `typst/statement.typ` (it evaluates its generated Typst with the package's own file identity,
  so paths would otherwise be looked up inside the `cmarker` package).

`booklet(problems, contestMeta)` produces a division booklet: a cover page listing the
problems, then one problem per section with a page break and a footer naming the division.

`renderPdf` spawns the Typst binary (`TYPST_BIN`, or `typst` on `PATH`), copies
`typst/statement.typ` and `typst/booklet.typ` into the work directory, writes the assets, and
points `TYPST_PACKAGE_PATH` at the vendored packages under `typst/packages`, so a compile never
touches the network. `typstAvailable()` reports whether a binary is reachable.

Refresh the vendored packages with `npm run vendor:typst`.

## Tests

```
npm test --workspace @moj/content
TYPST_BIN=/path/to/typst npm test --workspace @moj/content
```

Tests that need Typst skip cleanly when the binary is missing. `src/__fixtures__/statements`
holds real statements taken from a problem repository; `src/__fixtures__/TYPST_CORPUS.md` is the
generated report of which of them compile.
