# Statement fixtures

`statements/` holds real MAPS problem statements, copied verbatim from
`MonashAPS/mcpc-problems` (`problems/<code>/statement.md`). They are club content and are kept
here so the renderer and the Typst converter are exercised against the markdown the site
actually has to serve, rather than against invented examples. None of them comes from a
problem whose `config.json` sets `public: false`.

`problems.json` carries the metadata `markdownToTypst` needs, taken from each problem's
`config.json` where it has one (`title`, `points`, `timeLimit`, `pythonTimeLimit`,
`memoryLimit`, `authors`) and filled in with defaults otherwise. `inputType` and `outputType`
are always the standard channels; the problem repository has no field for them.

The set was chosen for coverage rather than size:

| Feature | Fixtures |
| --- | --- |
| `~x~` tilde maths | most of them |
| `$x$` and `$$x$$` dollar maths | `5bigbooms`, `cardtrick`, `tenniscomp2`, `tradingcards` |
| `\(x\)` and `\[x\]` | `gptdarkdown` |
| `~~strikethrough~~` next to tilde maths | `allblue` |
| Markdown images | `anthill`, `antimissile`, `berniecake`, `tiltedtowers` |
| Raw `<img>` with inline styles | `catsanddogs`, `meowmeow`, `pickyeater`, `tradingcards` |
| Raw HTML placeholders such as `<name>` | `tenniscomp2` |
| HTML comments | `meowmeow` |
| Interactive protocol sections | `guessnumber`, `localpeak`, `warden`, `cardtrick` |
| Long statements with many sections | `gptdarkdown`, `orderbookomni` |
| Heavier TeX (`\frac`, `\displaystyle`, `\begin`) | `doubleradars`, `kthsum`, `teque`, `pondotriples` |
| No fenced code at all | `localpeak` |
