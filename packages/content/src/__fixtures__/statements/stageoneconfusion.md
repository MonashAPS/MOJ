Parsa is taking a multiple-choice exam with ~n~ questions. He looks at the questions in order,
answers some of them, and never goes back.

Parsa's answer sheet contains ~m~ answers. The ~i~-th answer says that he chose option ~c_i~ for
question ~p_i~. The question numbers on the sheet are strictly increasing.

Parsa may have made at most one copying mistake on the sheet. Such a mistake could have happened
to one consecutive block of his answers: while copying that block onto the sheet, every intended
question number in the block was changed by the same nonzero offset. More precisely, starting from
Parsa's intended answer sheet, one copying mistake consists of choosing one block ~l, l+1, \ldots,
r~ and one nonzero integer ~d~, then changing every question number in that block from ~q_i~ to
~q_i+d~.

Both the intended question numbers and the written question numbers must be strictly increasing and between
~1~ and ~n~. You may also decide that no mistake was made.

Given the correct answer key and Parsa's answer sheet as written, find the largest possible number
of answers Parsa could have gotten correct before the copying mistake was made.

<img src="/media/martor/5b7814a6-dd2f-4380-8fcf-14d8d80f6bf7.png" width = 400/>

In the picture, one block is shifted by ~d=1~ while being copied onto the sheet.

## Input

The first line contains an integer ~T~, the number of test cases.

Each test case has the following format:

- The first line contains two integers ~n~ and ~m~.
- The second line contains a string ~S~ of length ~n~. The ~i~-th character is the correct answer
  for question ~i~.
- The next ~m~ lines each contain an integer ~p_i~ and a character ~c_i~, meaning Parsa wrote
  answer ~c_i~ for question ~p_i~.

If ~m > 0~, it is guaranteed that ~1 \le p_1 < p_2 < \cdots < p_m \le n~.

## Output

For each test case, print one integer: the maximum possible number of correct answers on Parsa's
intended answer sheet, before any copying mistake.

## Constraints

- ~1 \le T \le 10^4~
- ~1 \le n \le 2000~
- ~0 \le m \le n~
- The sum of ~n~ over all test cases is ~\le 2000~.
- Each character of ~S~ and each ~c_i~ is one of `A`, `B`, `C`, `D`, or `E`.

## Example 1

### Input

```
5
5 4
AECDB
1 A
2 A
4 C
5 B
7 2
AAACDAA
1 C
3 D
7 2
AAACDAA
1 C
2 D
10 5
ABECCDBAEA
3 B
4 E
6 C
8 A
10 E
4 0
ABCD
```

### Output

```
3
1
2
4
0
```

### Explanation

In the first test case, the score on the sheet as written is ~2~. Parsa could have originally
written that answer for question ~3~, then copied it as question ~4~ by mistake. Before that
mistake, his score would have been ~3~.
