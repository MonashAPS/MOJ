# Problem format

A problem in MOJ is two things kept in different places. The **test data** lives on the judge boxes as a directory
of files with an `init.yml` in it, and is exactly DMOJ's format. The **statement and metadata** live on the site and
are pushed there from a problem repository by `config.json` and `statement.md`.

If you have written problems for DMOJ before, nothing on this page is new except `config.json`. Data written for
`judge.monashaps.com` grades unchanged on MOJ, including batches, dependencies, checkers, custom graders,
generators and pretests.

## The problem directory

The judge reads problems from the directories named in its `problem_storage_globs`, which in the container is
`/problems/*`. One directory per problem, named after the problem code:

```
/problems/
  aplusb/
    init.yml
    tests/
      1.in
      1.out
      2.in
      2.out
  knightspatrol/
    init.yml
    checker.py
    tests/
      0_0.in
      0_0.out
      ...
```

The judge reports the directory names it finds during its handshake, and the site only offers a submission to a
judge that has that problem code. A problem whose data has not reached any judge sits in the queue.

## Problem codes

A problem code is the identity of the problem everywhere: the directory name on the judge, the directory name in
the problem repository, the URL at `/problem/<code>`, and the key the problems API writes to.

- Lowercase letters, digits and dots only. The site validates against `^[a-z.0-9]+$`.
- At most 20 characters.
- Globally unique across the site, not per contest and not per repository.
- Fixed once problems have been submitted to. Changing a code orphans the existing submissions and breaks every
  link to the problem, so treat it as permanent.

Codes like `aplusb`, `mcpc26a` and `dmopc19c6p3` are all valid. `A+B`, `MCPC26A` and `mcpc-26-a` are not.

## `init.yml`

The whole file is one YAML object. The only required key is `test_cases`.

```yaml
# The simplest problem: five cases, twenty points each.
test_cases:
- {in: tests/1.in, out: tests/1.out, points: 20}
- {in: tests/2.in, out: tests/2.out, points: 20}
- {in: tests/3.in, out: tests/3.out, points: 20}
- {in: tests/4.in, out: tests/4.out, points: 20}
- {in: tests/5.in, out: tests/5.out, points: 20}
```

Paths are relative to the problem directory, or relative to the root of the archive when `archive` is set.

### Top-level keys

| Key | Default | What it does |
| --- | --- | --- |
| `test_cases` | required | The list of cases and batches, or a regex specification (see below). |
| `archive` | none | A `.zip` file inside the problem directory holding the test data. Case paths then refer to entries in the archive. |
| `pretest_test_cases` | none | Cases used when a contest problem is set to run pretests only. |
| `checker` | `standard` | The per-case checker. A name, or a mapping with `name` and `args`. |
| `custom_judge` | none | Path to a Python file that replaces the grader entirely. |
| `generator` | none | A program that produces the case data instead of files on disk. |
| `hints` | none | Executor hints. `unicode` allows non-ASCII output, `nobigmath` blocks Java's `BigInteger` and `BigDecimal`. |
| `unbuffered` | false | Disables output buffering in the submission. Interactive problems need this. |
| `short_circuit` | true | Stop grading at the first non-AC case. The site's per-problem setting overrides it. |
| `points` | 1 | Points for cases that do not name their own. |
| `time_limit` | site value | Overrides the site's time limit, in seconds, for this problem's data. |
| `memory_limit` | site value | Overrides the site's memory limit, in KB. |
| `output_prefix_length` | 64 | How many bytes of the submission's output are kept and shown in the output pane. |
| `output_limit_length` | 25165824 | Hard cap on output bytes. Exceeding it is an output limit exceeded verdict. |
| `wall_time_factor` | 3 | Wall clock limit as a multiple of the CPU time limit, for programs that sleep or block. |
| `binary_data` | false | Do not normalise line endings before comparing. |
| `symlinks` | `{}` | Extra files to expose inside the sandbox. |

`time_limit` and `memory_limit` in `init.yml` are a data-side override, and they win over what the site has stored.
Prefer setting limits on the site through `config.json` so that everyone can see them on the problem page. Use the
`init.yml` override only when the data itself demands it, for example a problem whose generator needs a longer
budget than the statement advertises.

### Cases and batches

A normal case is a mapping with `in`, `out` and `points`:

```yaml
test_cases:
- {in: sample.in, out: sample.out, points: 0}
- {in: 1.in, out: 1.out, points: 10}
```

A batch has `points` and `batched`, and awards its points only when every case inside it passes:

```yaml
test_cases:
- points: 0
  batched:
  - {in: tests/0_0.in, out: tests/0_0.out}
  - {in: tests/0_1.in, out: tests/0_1.out}
- points: 40
  batched:
  - {in: tests/1_0.in, out: tests/1_0.out}
  - {in: tests/1_1.in, out: tests/1_1.out}
- points: 60
  batched:
  - {in: tests/2_0.in, out: tests/2_0.out}
  - {in: tests/2_1.in, out: tests/2_1.out}
  dependencies: [1, 2]
```

`dependencies` is a list of one-indexed batch numbers. The batch runs only if all of them passed, which saves judge
time on problems where the large batch is pointless if the small one failed. Batches cannot be nested, and a
dependency has to name an earlier batch.

`points: 0` marks a sample or pretest case: failing it stops the rest of the grading immediately. Order matters,
because the judge runs cases in file order. Put the zero-point cases first:

```yaml
test_cases:
- {in: case1.0.in, out: case1.0.out, points: 0}   # runs first, stops grading if it fails
- {in: case1.1.in, out: case1.1.out, points: 100}
```

Short circuiting overrides dependencies: with short circuit on, the first non-AC case ends the submission whatever
the dependency graph says.

### Specifying cases with a regex

When the files follow a pattern, `test_cases` can be a mapping instead of a list:

```yaml
archive: aplusb.zip
test_cases:
  input_format: '^(?P<case>\d+)\.in$'
  output_format: '^(?P<case>\d+)\.out$'
  case_points: 10
```

Without `input_format` and `output_format` the judge uses its own defaults, which match names like `test.1.in`,
`test-1.in`, `1.2.in` and `problem-1-case-1-batch-2.in`, using the `batch` and `case` named groups to decide what
is batched. `case_points` sets the points per case and defaults to 1; a top-level `points` sets it for all cases.

### Checkers

The checker decides whether one case passed. Without a `checker` key the problem uses `standard`, which compares
token by token and ignores trailing whitespace and blank lines.

```yaml
checker: identical
```

```yaml
checker:
  name: floatsabs
  args:
    precision: 6
```

| Name | Arguments | Behaviour |
| --- | --- | --- |
| `standard` | none | Line by line, token by token, whitespace insensitive. The default. |
| `easy` | none | Ignores whitespace and case, compares character counts. |
| `floats` | `precision` (default 6), `error_mode` (`default`, `absolute`, `relative`) | Numbers compare within an epsilon of 10 to the minus `precision`; non-numeric tokens compare as strings. |
| `floatsabs` | `precision` | `floats` with `error_mode: absolute`. |
| `floatsrel` | `precision` | `floats` with `error_mode: relative`. |
| `identical` | `pe_allowed` (default true) | Byte for byte. With `pe_allowed`, output that is right except for whitespace gets the feedback "Presentation Error, check your whitespace". |
| `linecount` | `feedback` (default true) | Per-line comparison with a tick or cross per line, as ECOO problems use. Runs even after a runtime error or timeout. |
| `sorted` | `split_on` (`lines` or `whitespace`) | Equal ignoring order. |
| `unordered` | none | `sorted` with `split_on: whitespace`. |
| `bridged` | `files`, `lang`, `type`, `time_limit`, `memory_limit`, `compiler_time_limit`, `flags`, `feedback` | Runs a compiled checker in the sandbox. `type` is `default`, `testlib`, `coci` or `peg`. |

A custom checker is a Python file next to `init.yml` that defines `check`:

```python
# checker.py
from dmoj.result import CheckerResult


def check(process_output, judge_output, **kwargs):
    expected = judge_output.decode().split()
    actual = process_output.decode().split()
    if len(actual) != len(expected):
        return CheckerResult(False, 0, feedback='wrong number of tokens')
    correct = sum(a == b for a, b in zip(actual, expected))
    return CheckerResult(correct == len(expected), kwargs['point_value'] * correct // len(expected))
```

```yaml
checker: checker.py
```

`kwargs` carries `submission_source`, `judge_input`, `point_value`, `case_position`, `batch`,
`submission_language`, `binary_data`, `execution_time`, `problem_id` and the preliminary `result`. Return either a
boolean or a `CheckerResult(passed, points, feedback='')`. Set `check.run_on_error = True` if the checker should
still run when the submission already timed out or crashed.

For a checker that is too slow in Python, write it in C++ and use `bridged`:

```yaml
checker:
  name: bridged
  args:
    files: checker.cpp
    lang: CPP17
    type: testlib
    compiler_time_limit: 60
```

### Custom graders

`custom_judge` replaces the whole grading loop and is what interactive problems use. The file defines a `Grader`
class whose `grade(case)` returns a `Result`:

```yaml
custom_judge: interactor.py
unbuffered: true
test_cases:
- points: 100
```

Use one only when the normal "feed stdin, compare stdout" interaction is not enough. A checker is the right tool
for "many correct answers"; a grader is the right tool for "the judge has to talk back".

### Generators

For data too large to commit, a generator produces the cases at grading time:

```yaml
generator: gen.cpp
test_cases:
- {generator_args: [1, 1000], points: 10}
- {generator_args: [2, 1000000], points: 90}
```

`generator` accepts a filename, a list whose first element is the source and whose remaining elements are
auxiliary files, or a mapping with `source`, `language`, `flags`, `time_limit`, `memory_limit` and
`compiler_time_limit`. Set `compiler_time_limit: 60` when the generator includes `testlib.h`.

The generator writes the case input to stdout and the case output to stderr. `generator_args` are stringified and
passed on the command line after the auxiliary file argument. Generated and file-based cases can be mixed in one
problem: a case with `in` uses the file, a case without runs the generator.

### Pretests

`pretest_test_cases` is a second, usually smaller, list of cases in the same format. It is used when a contest
problem is marked as pretested and the contest is set to run pretests only: submissions are graded against the
pretests during the contest and the full data afterwards.

```yaml
pretest_test_cases:
- {in: tests/sample1.in, out: tests/sample1.out, points: 50}
- {in: tests/sample2.in, out: tests/sample2.out, points: 50}
test_cases:
- {in: tests/1.in, out: tests/1.out, points: 10}
# ...
```

When a problem has pretests and the contest is not pretests-only, the pretest cases run first as part of the full
run.

### Output limits

Two separate numbers control output:

- `output_prefix_length` (default 64) is how many bytes of the submission's output the judge keeps and sends back
  for display in the output pane. Raise it for problems where seeing the answer helps, lower it to zero for
  problems where the output would give the answer away. The contest setting `outputPrefixOverride` can raise or
  lower it per contest problem.
- `output_limit_length` (default 25165824, which is 24 MiB) is the point at which a submission is killed with an
  output limit exceeded verdict. Set it lower for problems where a runaway loop would otherwise fill a disk.

Both can be set per case and per batch as well as at the top level.

### Hints

```yaml
hints:
- unicode
- nobigmath
```

`unicode` tells the executors that non-ASCII output is expected, so it is not treated as a malformed output error.
`nobigmath` blocks `java.math.BigInteger` and `java.math.BigDecimal`, which is how a problem about implementing
arbitrary precision arithmetic stops Java submissions from calling the library.

## Statements

A statement is a single `statement.md` in the problem's directory in the problem repository. It is markdown with
the extensions DMOJ uses, rendered by `packages/content` on the site and converted to Typst for the PDF at
`/problem/<code>/pdf`.

### Sections

The conventional shape, and the one the PDF template expects:

````markdown
In the kingdom of MAPS, specific hours of the day are celebrated.

## Input

The input consists of a single integer ~h~, representing an hour.

## Output

Print `YES` if that hour is celebrated. Otherwise print `NO`.

## Constraints

~1 \le h \le 12~

## Example 1

### Input

```
1
```

### Output

```
NO
```
````

Do not put the problem title in the statement. The title comes from `config.json`, and the site renders it as the
page heading; a heading in the statement produces two titles. Headings in statements are demoted by two levels
when rendered, so `##` becomes an `h4` inside the page.

### Maths

Inline maths is written between tildes, which is DMOJ's convention and the one the club's existing problems use:

```markdown
The answer is ~O(n \log n)~ for ~1 \le n \le 10^6~.
```

`$...$` is accepted as well. Display maths is `$$...$$`, `\[...\]`, or a fenced block. `\(...\)` works inline.
Everything goes through KaTeX, so KaTeX's function support is the limit; `\begin{align}` and friends are
available, `\newcommand` at document scope is not.

Escape a literal tilde as `\~` when writing about the home directory or a URL.

### Code and samples

Fenced code blocks are highlighted by Shiki. Give the fence a language when the content is code:

````markdown
```cpp
for (int i = 0; i < n; i++) cout << a[i] << '\n';
```
````

Sample input and output go in plain fences with no language, so that leading spaces and blank lines survive
exactly.

### Images

Reference images by their file name, relative to the problem directory:

```markdown
![Layout of the archery banners](images/archery.jpg)
```

`upload-problem.mjs` uploads any local image referenced by a markdown image or an HTML `<img src="...">` and
rewrites the source to the uploaded URL, keeping other attributes such as `width`. Keep the files next to the
statement in an `images/` directory and commit them; do not link to an external host, because those links rot and
the PDF renderer will not fetch them.

### Editorials

An `editorial.md` beside the statement becomes the problem's editorial at `/problem/<code>/editorial`. It uses the
same markdown. Visibility is controlled from the site or through the problems API `editorial` field; an editorial
that exists but is not public is visible to staff and to users who have solved the problem, following DMOJ's rule.

## `config.json`

`config.json` is the metadata for the problem: everything the site needs that is not the statement and not the test
data. It sits in the problem's directory in the repository and is read by `upload-problem.mjs`.

```json
{
  "title": "Celebrated Hours",
  "authors": ["indra", "swofty"],
  "testers": ["alice"],
  "points": 100,
  "timeLimit": 1,
  "pythonTimeLimit": 3,
  "memoryLimit": 256000,
  "shortCircuit": true,
  "public": true
}
```

| Field | Type | Default on create | Meaning |
| --- | --- | --- | --- |
| `title` | string | required | The problem name shown everywhere. |
| `authors` | array of usernames | `[]` | Problem setters. They can see and edit the problem, and are credited on the page. |
| `testers` | array of usernames | `[]` | Testers. They can see the problem before it is public but cannot edit it. |
| `points` | number | 100 | Points the problem is worth outside a contest. |
| `timeLimit` | number, seconds | 1 | The default time limit for every language. |
| `pythonTimeLimit` | number, seconds | falls back to `timeLimit` | Language-specific limit written for Python 3 and PyPy 3. |
| `memoryLimit` | number, KB | 1000000 | Memory limit. This is kilobytes, so 256 MB is `256000`. |
| `shortCircuit` | boolean | true | Stop at the first failing case. |
| `public` | boolean | true | Whether the problem is visible to everyone. |

Two notes that catch people out. `memoryLimit` is in **kilobytes**, matching DMOJ's admin field, so `1000000` is
roughly one gigabyte rather than one megabyte. And `pythonTimeLimit` exists because the interpreted languages need
more than the reference C++ solution; if you omit it, Python gets the same limit as everything else.

On update, a field that is absent from `config.json` is left alone on the site. The exception is the Python
language limits: whenever `timeLimit` or `pythonTimeLimit` is present, the Python 3 and PyPy 3 rows are rewritten,
so removing `pythonTimeLimit` restores them to `timeLimit` rather than leaving a stale value behind. `authors: []`
is treated as "not specified" and leaves the current authors alone, which means you cannot clear the author list
from `config.json`; do that in the staff console.

The problem group, the problem types and the publish date are set when the problem is created (group and types
default to `uncategorized`, publish date to now, allowed languages to all) and are not touched by later updates.
Change them in the staff console.

## Problem repository layout

A problem repository holds the statements, the metadata and the test data together, and its CI pushes both halves
to where they belong. The layout the club uses:

```
mcpc26/
  .github/workflows/ci.yml       pushes to the site and the judge
  problems/
    template/                    an example, skipped by CI
    celebratedhours/
      config.json                metadata for the site
      statement.md               statement for the site
      editorial.md               optional editorial for the site
      images/archery.jpg         referenced by the statement
      init.yml                   read by the judge
      tests/                     test data, read by the judge
        1.in
        1.out
      gen.py                     optional, generates tests/
      sol.cpp                    reference solution, not uploaded
  README.md
```

The directory name is the problem code. The site half (`config.json`, `statement.md`, `editorial.md`, images) goes
through the problems API. The judge half (`init.yml`, `tests/`, checkers, generators) is copied to the judge boxes
with rsync. [Problem repos and CI](/problems/repos-and-ci) has the workflow that does both.
