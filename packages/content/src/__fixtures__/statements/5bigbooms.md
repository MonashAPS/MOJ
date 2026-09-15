# 5 Big Booms

Parsa is tired of FIT1047. The FIT1047 textbook has ~n~ pages. Parsa decides to determine the average BOOM Power produced when closing the book quickly and forcefully.

Parsa randomly opens the book to a page, with each page being equally likely to be selected. If the book is opened to a certain page, the BOOM Power is equal to the smaller number of pages on either side of the book (this count can range from ~0~ to ~n~).
Given the number of sheets in Parsa's book, calculate the expected BOOM Power. In other words, the expected BOOM Power is given by:
$$\frac{\sum_{i = 0}^{n} \min(i, n - i)}{n + 1}$$
where ~\min(a, b)~ is the smaller value of ~a~ and ~b~.

## Input

The only line of input contains ~n~ which is the number of pages in Parsa's book.

## Output

Print the expected BOOM Power of the book.
Any answer with absolute error not exceeding ~10^{-6}~ will be accepted.

## Constraints

- ~1 \le n \le 2 \times 10^9~

## Example 1

### Input

```
3
```

### Output

```
0.500000
```

## Example 2

### Input

```
21
```

### Output

```
5.000000
```
