# Spec changes

Append dated bullets when you had to extend or deviate from docs/SPEC.md.

## packages/content

- 2026-09-10: `renderMarkdown(source, preset, options?)` is asynchronous and returns
  `{html, meta}` rather than a bare HTML string. Shiki loads its grammars on demand and KaTeX
  is rendered in process, neither of which can be done synchronously without bundling every
  grammar. `meta` carries the headings, images, links, `[user:]` references, per-delimiter
  maths counts, fence languages, plain text and a summary, which the problem pages need
  anyway for `og:` tags and the editorial table of contents.
- 2026-09-10: preset names. Section 10 lists `contest` but not DMOJ's `contest_tag`; the
  package adds `contest-tag` (hyphenated, like the other multi-word presets) and a `default`
  alias, so every entry of DMOJ's `MARKDOWN_STYLES` has a preset.
- 2026-09-10: `$...$` inline maths is a MOJ addition. DMOJ's `MathInlineGrammar` has no
  single-dollar rule at all: only `$$...$$`, `\[...\]` (display) and `~...~`, `\(...\)`
  (inline). Section 10 asks for `$...$`, so it is on by default and can be turned off with
  `singleDollarMath: false`.
- 2026-09-10: `~...~` may not span a line ending. DMOJ compiles the rule with `re.DOTALL`, so
  a stray tilde swallows the rest of the paragraph; the spec asks for the single-line
  behaviour and this package implements that.
- 2026-09-10: heading demotion by two is applied to every preset, not only the statement ones.
  `AwesomeRenderer.header` is unconditional in DMOJ, and `options.demoteHeadings` overrides it
  per call.
- 2026-09-10: `rel="nofollow"` is applied for every preset, matching DMOJ (`nofollow` defaults
  to `True` in `judge.jinja2.markdown.markdown`), and `rel` is added to the sanitiser's `a`
  allowlist. DMOJ's `BLEACH_USER_SAFE_ATTRS` omits `rel`, so bleach strips the attribute its
  own renderer had just added for the staff-editable styles; that is a bug, not a rule.
- 2026-09-10: images are deferred with `loading="lazy"` and `decoding="async"` instead of
  DMOJ's `blank.gif` placeholder plus the `unveil` JavaScript, so `loading` and `decoding` are
  added to the `img` allowlist. DMOJ's skip rules are kept (`data:` sources and `*-math`
  classes are left alone).
- 2026-09-10: three more allowlist additions for markup this pipeline generates itself:
  `aria-hidden` on any element and `tabindex` on `pre` (KaTeX and Shiki emit them), and
  `data-username` / `data-rating` on `a` for the `[user:]` references the web app hydrates.
  CSS custom properties beginning `--shiki-` are allowed in `style`, which is how the dual
  GitHub themes travel; every other declaration is filtered against bleach's
  `all_styles` property list.
- 2026-09-10: elements outside the allowlist are escaped into text rather than unwrapped, so
  that `<script>void(0)</script>` comes back as `&lt;script&gt;void(0)&lt;/script&gt;` the way
  DMOJ's own `test_markdown.py` expects. A closing tag is only printed back for known HTML
  element names: parse5 builds a tree, so a made-up `<name1>` silently adopts the rest of the
  paragraph, and printing `</name1>` would add text DMOJ never shows.
- 2026-09-10: `renderPdf(typstSource, {workdir, assets, ...})` copies `typst/statement.typ` and
  `typst/booklet.typ` into the work directory and compiles with `--root` set to it, and
  `markdownToTypst` rewrites statement image paths to be root-absolute. `cmarker` evaluates
  the Typst it generates with its own package's file identity, so image paths would otherwise
  resolve inside `typst/packages/preview/cmarker/<version>/`; the template hands `cmarker` an
  `image` function of its own to move the lookup back to the compile root.
- 2026-09-10: `packages/content/typst/packages/preview/{cmarker,mitex}` are committed,
  including the two `.wasm` plugins they ship (about 600 kB together). They are a runtime
  dependency of every PDF, and vendoring them is what keeps a compile offline;
  `npm run vendor:typst` refreshes them.
