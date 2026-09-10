// MOJ division booklet template.
//
// A cover page listing the problems, then one problem per section with a page break in
// between, each page footed with the division name and the problem it belongs to. The body
// typography is shared with statement.typ so a printed booklet and a single printed statement
// look the same.

#import "statement.typ": (
  ink, ink-2, line-color, moj-body-style, moj-markdown, mono-fonts, muted, problem-header,
  sans-fonts, serif-fonts,
)

#let page-number = context text(size: 9pt, fill: muted)[#counter(page).display()]

#let cover-footer() = align(center)[#page-number]

#let problem-footer(left-text, label, name) = grid(
  columns: (1fr, auto, 1fr),
  align(left)[#text(size: 8.6pt, fill: muted)[#left-text]],
  align(center)[#page-number],
  align(right)[
    #text(size: 8.6pt, fill: muted)[#if label == none [#name] else [Problem #label: #name]]
  ],
)

#let booklet-doc(
  title: "",
  paper: "a4",
  margin: (top: 1.7cm, bottom: 1.8cm, left: 1.8cm, right: 1.8cm),
  body,
) = {
  set document(title: title)
  set page(paper: paper, margin: margin, numbering: "1", footer: cover-footer())
  show: moj-body-style
  body
}

#let cover(
  title: "",
  subtitle: none,
  date: none,
  note: none,
  logo: none,
  entries: (),
) = {
  align(center)[
    #v(1.2cm)
    #if logo != none [
      #image(logo, width: 5.5cm)
      #v(0.9cm)
    ]
    #text(font: sans-fonts, size: 30pt, weight: "bold", fill: ink)[#title]
    #if subtitle != none [
      #v(0.35cm)
      #text(font: sans-fonts, size: 17pt, fill: ink-2)[#subtitle]
    ]
    #v(0.55cm)
    #line(length: 82%, stroke: 1.2pt + ink)
    #if date != none [
      #v(0.35cm)
      #text(size: 12pt, fill: muted)[#date]
    ]
    #v(1.1cm)
    #if entries.len() > 0 [
      #grid(
        columns: (auto, auto),
        column-gutter: 0.55em,
        row-gutter: 0.6em,
        align: (right, left),
        ..entries
          .map(entry => (
            text(font: sans-fonts, size: 13.5pt, weight: "semibold")[#entry.at(0):],
            text(font: sans-fonts, size: 13.5pt)[#entry.at(1)],
          ))
          .flatten()
      )
    ]
    #if note != none [
      #v(1.1cm)
      #block(width: 78%)[#align(left)[#text(size: 10pt, fill: ink-2)[#note]]]
    ]
  ]
}
