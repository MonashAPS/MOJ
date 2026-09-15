# Problem format

A problem is one directory named after its problem code. `statement.md`, `editorial.md` and `config.json` become
fields on the problem; everything else becomes the test data archive the judges grade from.
[Problem repos and CI](/problems/repos-and-ci) covers publishing.

Data written for DMOJ grades unchanged: `init.yml` is read only by the judge, which is DMOJ's own code.

```
aplusb/
  config.json
  statement.md
  editorial.md
  images/
  init.yml
  tests/1.in
  tests/1.out
  sol.cpp
```

## Problem codes

Lowercase letters, digits and dots, at most 20 characters, validated against `^[a-z.0-9]+$`, and unique across
the whole site. A dot is a directory separator on the judge, so `course.a1.knapsack` lives at
`/problems/course/a1/knapsack/`.

::: warning
A code is permanent. Changing it orphans the existing submissions and breaks every link to the problem.
:::

## `init.yml`

One YAML object. The only required key is `test_cases`. Paths are relative to the problem directory, or to the
root of `archive` when that is set.

```yaml
test_cases:
- {in: tests/1.in, out: tests/1.out, points: 20}
- {in: tests/2.in, out: tests/2.out, points: 20}
```

| Key | Default | Effect |
| --- | --- | --- |
| `test_cases` | required | Cases and batches, or a regex specification. |
| `archive` | none | A `.zip` in the directory holding the data; case paths name entries in it. |
| `pretest_test_cases` | none | Cases used when a contest problem runs pretests only. |
| `checker` | `standard` | A name, or a mapping with `name` and `args`. |
| `custom_judge` | none | A Python file replacing the grader entirely. |
| `generator` | none | A program producing case data instead of files. |
| `hints` | none | `unicode` allows non-ASCII output; `nobigmath` blocks Java's `BigInteger` and `BigDecimal`. |
| `unbuffered` | false | Disables output buffering. Interactive problems need it. |
| `short_circuit` | true | Stop at the first non-AC case. The site's setting overrides it. |
| `points` | 1 | Points for cases that name none. |
| `time_limit` | site value | Seconds. Overrides the site. |
| `memory_limit` | site value | Kilobytes. Overrides the site. |
| `output_prefix_length` | 64 | Output bytes kept for the output pane. |
| `output_limit_length` | 25165824 | Output cap; past it the verdict is output limit exceeded. |
| `wall_time_factor` | 3 | Wall clock limit as a multiple of the CPU limit. |
| `binary_data` | false | Do not normalise line endings. |
| `symlinks` | `{}` | Extra files exposed inside the sandbox. |

Prefer setting limits in `config.json`, so everyone can see them on the problem page.

### Cases and batches

A batch awards its points only when every case in it passes.

```yaml
test_cases:
- points: 40
  batched:
  - {in: tests/1_0.in, out: tests/1_0.out}
- points: 60
  batched:
  - {in: tests/2_0.in, out: tests/2_0.out}
  dependencies: [1]
```

`dependencies` lists one-indexed earlier batches that must have passed. Batches cannot be nested. `points: 0`
marks a sample case: failing it stops grading immediately, so put zero-point cases first. Short circuiting
overrides dependencies.

When the files follow a pattern, `test_cases` can be a mapping instead:

```yaml
test_cases:
  input_format: '^(?P<case>\d+)\.in$'
  output_format: '^(?P<case>\d+)\.out$'
  case_points: 10
```

Without the two formats the judge uses its own defaults, which match names like `test.1.in`, `test-1.in` and
`problem-1-case-1-batch-2.in`, using the `batch` and `case` named groups.

### Checkers

```yaml
checker:
  name: floatsabs
  args: {precision: 6}
```

| Name | Arguments | Behaviour |
| --- | --- | --- |
| `standard` | none | Token by token, whitespace insensitive. The default. |
| `easy` | none | Ignores whitespace and case, compares character counts. |
| `floats` | `precision` (6), `error_mode` | Numbers within 10 to the minus `precision`; other tokens as strings. |
| `floatsabs`, `floatsrel` | `precision` | `floats` with an absolute or relative error mode. |
| `identical` | `pe_allowed` (true) | Byte for byte, with a presentation-error message for whitespace. |
| `linecount` | `feedback` (true) | Per line, a tick or cross each. Runs even after a runtime error. |
| `sorted` | `split_on` (`lines`, `whitespace`) | Equal ignoring order. |
| `unordered` | none | `sorted` split on whitespace. |
| `bridged` | `files`, `lang`, `type`, `flags`, `feedback`, the three limits | A compiled checker in the sandbox. `type` is `default`, `testlib`, `coci` or `peg`. |

A custom checker is a Python file beside `init.yml`, named as `checker: checker.py`, defining `check`:

```python
def check(process_output, judge_output, **kwargs):
    return CheckerResult(process_output.split() == judge_output.split(), kwargs["point_value"])
```

Import `CheckerResult` from `dmoj.result`. Return a boolean or a `CheckerResult(passed, points, feedback='')`.
`kwargs` carries `submission_source`, `judge_input`, `point_value`, `case_position`, `batch`,
`submission_language`, `binary_data`, `execution_time`, `problem_id` and the preliminary `result`. Set
`check.run_on_error = True` to run after a timeout or crash. For a checker too slow in Python, compile one:

```yaml
checker:
  name: bridged
  args: {files: checker.cpp, lang: CPP17, type: testlib, compiler_time_limit: 60}
```

### Graders, generators and pretests

`custom_judge` replaces the grading loop, which is what interactive problems use: the file defines a `Grader`
class whose `grade(case)` returns a `Result`. Pair it with `unbuffered: true`.

```yaml
generator: gen.cpp
test_cases:
- {generator_args: [1, 1000], points: 10}
```

The generator writes the case input to stdout and the case output to stderr. It takes a filename, a list whose
first element is the source, or a mapping with `source`, `language`, `flags` and the three limits; set
`compiler_time_limit: 60` when it includes `testlib.h`. A case with `in` uses the file, a case without runs the
generator.

`pretest_test_cases` is a second list in the same format, used when a contest problem is pretested and the
contest runs pretests only. Otherwise the pretest cases run first as part of the full run.

## Statements

`statement.md` is markdown with DMOJ's extensions.

````markdown
In the kingdom of Baldonia, certain hours of the day are celebrated.

## Input

A single integer ~h~, representing an hour.

## Constraints

~1 \le h \le 12~

## Example 1
````

::: warning
Do not put the title in the statement. It comes from `config.json`, and a heading there produces two titles.
Headings are demoted by two levels when rendered.
:::

| Element | How to write it |
| --- | --- |
| Inline maths | `~O(n \log n)~`, `$...$`, or `\(...\)`. A tilde pair may not span a line ending. |
| Display maths | `$$...$$`, `\[...\]`, or a fenced maths block. |
| A literal tilde | `\~` |
| Code | A fenced block with a language tag. |
| Sample data | A fenced block with no language, so spaces and blank lines survive. |
| Images | `![alt](images/archery.jpg)`, committed beside the statement. |
| User links | `[user:name]`, `[ruser:name]` |

`\begin{align}` and friends work; a document-scope `\newcommand` does not. Do not link an image to an external
host: the PDF renderer will not fetch it.

`editorial.md` becomes `/problem/<code>/editorial`. An editorial that exists but is not public is visible to
staff and to users who have solved the problem.

## `config.json`

| Field | Type | Default on create | Meaning |
| --- | --- | --- | --- |
| `title` | string | required | The problem name. |
| `authors` | usernames | `[]` | Can see and edit the problem, and are credited. |
| `testers` | usernames | `[]` | Can see it before it is public; cannot edit. |
| `points` | number | 100 | Points outside a contest. |
| `timeLimit` | seconds | 1 | The default for every language. |
| `pythonTimeLimit` | seconds | `timeLimit` | Written for Python 3 and PyPy 3. |
| `memoryLimit` | kilobytes | 1000000 | 256 MB is `256000`. |
| `shortCircuit` | boolean | true | Stop at the first failing case. |
| `partial` | boolean | false | Whether a submission keeps less than full marks. |
| `summary` | string | none | Used where the statement is too long. |
| `public` | boolean | false | Needs the permission to publish problems. |

Nothing else in the file is read. On update an absent field is left alone, and `authors: []` means unchanged
rather than cleared, so the author list is cleared in the staff console. Group, types, publish date and allowed
languages are set on create only.

::: danger
Whenever `timeLimit`, `pythonTimeLimit` or `memoryLimit` is present, the Python 3 and PyPy 3 limits are
rewritten. Dropping `pythonTimeLimit` while keeping either of the others returns Python to `timeLimit`, or to 1
second when that is absent too.
:::
