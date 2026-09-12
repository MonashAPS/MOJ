// MOJ problem statement template.
//
// The header follows Codeforces' layout (centred title, then the limits and the input/output
// channels), while the body reproduces DMOJ's `.content-description` typography from
// resources/base-description.scss: bold section headings with a hairline under them, boxed
// code, a thick quote rule, and monospace inline code on a tinted background.
//
// Markdown is rendered by `cmarker`, with `mitex` handling the LaTeX that `@moj/content`
// normalises into `$...$` and `$$...$$`.

#import "@preview/cmarker:0.1.10"
#import "@preview/mitex:0.2.7": mitex

#let ink = rgb("#16191d")
#let ink-2 = rgb("#3d474f")
#let muted = rgb("#5f6b76")
#let line-color = rgb("#c9d1d9")
#let code-bg = rgb("#f4f6f8")
#let code-border = rgb("#dde3e9")
#let quote-rule = rgb("#dce3ea")
#let accent = rgb("#2980b9")

#let serif-fonts = ("Times New Roman", "Liberation Serif", "Nimbus Roman", "DejaVu Serif")
#let sans-fonts = ("IBM Plex Sans", "DejaVu Sans", "Liberation Sans", "Arial")
#let mono-fonts = ("IBM Plex Mono", "DejaVu Sans Mono", "Liberation Mono", "Courier New")

#let plural(n, word) = if n == 1 { word } else { word + "s" }

#let format-time(value) = {
  if value == none { return none }
  if type(value) == str { return value }
  let seconds = float(value)
  if seconds == calc.round(seconds) {
    str(int(seconds)) + " " + plural(int(seconds), "second")
  } else {
    str(calc.round(seconds, digits: 2)) + " seconds"
  }
}

// Memory limits are stored in kilobytes, the way DMOJ stores them.
#let format-memory(value) = {
  if value == none { return none }
  if type(value) == str { return value }
  let kb = float(value)
  let mb = kb / 1024.0
  let gb = mb / 1024.0
  if gb >= 1.0 and gb == calc.round(gb) {
    str(int(gb)) + " " + plural(int(gb), "gigabyte")
  } else if gb >= 1.0 {
    str(calc.round(gb, digits: 1)) + " gigabytes"
  } else if mb >= 1.0 and mb == calc.round(mb) {
    str(int(mb)) + " " + plural(int(mb), "megabyte")
  } else if mb >= 1.0 {
    str(calc.round(mb, digits: 1)) + " megabytes"
  } else {
    str(int(kb)) + " " + plural(int(kb), "kilobyte")
  }
}

#let info-line(key, value) = block(spacing: 0.15em)[
  #text(size: 9.4pt, fill: muted, weight: "semibold")[#key: ]
  #text(size: 9.4pt, fill: ink-2)[#value]
]

#let problem-header(
  name: "",
  label: none,
  code: none,
  points: none,
  time-limit: none,
  python-time-limit: none,
  memory-limit: none,
  authors: (),
  input-type: "standard input",
  output-type: "standard output",
) = {
  let title = if label == none { name } else { label + ". " + name }
  align(center)[
    #block(spacing: 0.55em)[
      #text(font: sans-fonts, size: 16.5pt, weight: "bold", fill: ink)[#title]
    ]
    #{
      let time = format-time(time-limit)
      if time != none {
        let extra = format-time(python-time-limit)
        if extra != none { time = time + " (" + extra + " for Python)" }
        info-line("time limit per test", time)
      }
    }
    #{
      let memory = format-memory(memory-limit)
      if memory != none { info-line("memory limit per test", memory) }
    }
    #if input-type != none { info-line("input", input-type) }
    #if output-type != none { info-line("output", output-type) }
    #{
      let bits = ()
      if points != none { bits.push("points: " + str(points)) }
      if code != none { bits.push("problem code: " + code) }
      if authors != none and authors.len() > 0 {
        bits.push(plural(authors.len(), "author") + ": " + authors.join(", "))
      }
      if bits.len() > 0 {
        block(spacing: 0.15em, above: 0.45em)[
          #text(size: 8.8pt, fill: muted)[#bits.join("  ·  ")]
        ]
      }
    }
  ]
  v(0.5em)
  line(length: 100%, stroke: 0.7pt + line-color)
  v(0.45em)
}

// DMOJ's `.content-description` rules, translated.
#let moj-body-style(body) = {
  set text(font: serif-fonts, size: 10.6pt, fill: ink, lang: "en")
  set par(justify: true, leading: 0.62em, spacing: 0.95em)
  set list(indent: 1.1em, body-indent: 0.4em, spacing: 0.7em)
  set enum(indent: 1.1em, body-indent: 0.4em, spacing: 0.7em)
  set table(stroke: 0.5pt + line-color)

  show heading: it => {
    let level = it.level
    if level <= 1 {
      block(above: 1.15em, below: 0.5em, breakable: false)[
        #text(font: sans-fonts, size: 12.2pt, weight: "bold", fill: ink)[#it.body]
        #v(-0.5em)
        #line(length: 100%, stroke: 0.5pt + line-color)
      ]
    } else if level == 2 {
      block(above: 0.95em, below: 0.35em, sticky: true)[
        #text(font: sans-fonts, size: 10.9pt, weight: "bold", fill: ink)[#it.body]
      ]
    } else {
      block(above: 0.8em, below: 0.3em, sticky: true)[
        #text(font: sans-fonts, size: 10.2pt, weight: "bold", fill: ink-2)[#it.body]
      ]
    }
  }

  show raw.where(block: true): it => block(
    width: 100%,
    fill: code-bg,
    stroke: 0.5pt + code-border,
    radius: 3pt,
    inset: 7pt,
    breakable: false,
    text(font: mono-fonts, size: 9.1pt, fill: ink, it),
  )

  show raw.where(block: false): it => box(
    fill: code-bg,
    stroke: 0.4pt + code-border,
    radius: 2pt,
    inset: (x: 3pt, y: 0pt),
    outset: (y: 3pt),
    text(font: mono-fonts, size: 0.94em, fill: ink, it),
  )

  show quote.where(block: true): it => block(
    inset: (left: 1.1em),
    stroke: (left: 4pt + quote-rule),
    text(fill: ink-2, it.body),
  )

  show link: it => text(fill: accent, it)

  body
}

#let statement-page(
  name: "",
  label: none,
  code: none,
  points: none,
  time-limit: none,
  python-time-limit: none,
  memory-limit: none,
  authors: (),
  input-type: "standard input",
  output-type: "standard output",
  paper: "a4",
  margin: (top: 1.7cm, bottom: 1.8cm, left: 1.8cm, right: 1.8cm),
  numbering: "1",
  body,
) = {
  set document(title: name)
  set page(paper: paper, margin: margin, numbering: numbering)
  show: moj-body-style
  problem-header(
    name: name,
    label: label,
    code: code,
    points: points,
    time-limit: time-limit,
    python-time-limit: python-time-limit,
    memory-limit: memory-limit,
    authors: authors,
    input-type: input-type,
    output-type: output-type,
  )
  body
}

// `cmarker` evaluates the Typst it generates with the package's own file identity, so an
// image path inside it would be looked up under `cmarker/0.1.10/` rather than under the
// compile root. Handing `cmarker` an `image` from this file moves the lookup back here, which
// is why `@moj/content` rewrites statement images to root-absolute paths.
#let moj-image(path, ..args) = image(path, ..args)

// Renders one markdown string. `@moj/content` has already turned DMOJ's `~x~`, `\(x\)` and
// `\[x\]` into `$x$` and `$$x$$`, which is what `cmarker` hands to `mitex`.
#let moj-markdown(src) = cmarker.render(
  src,
  math: mitex,
  smart-punctuation: false,
  h1-level: 0,
  set-document-title: false,
  heading-labels: none,
  raw-typst: false,
  scope: (image: moj-image),
)
