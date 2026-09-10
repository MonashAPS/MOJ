You work at a coconut factory, and your job is to package coconuts into pairs for shipping. Two
coconuts can be paired together if the absolute difference between their diameters is at most ~k~.
Each coconut can be used in at most one pair.

Given the diameters of ~n~ coconuts, what is the maximum number of disjoint pairs you can form?

## Input

The first line contains two integers ~n~ and ~k~, the number of coconuts and the maximum allowed
diameter difference for a valid pair.

The second line contains ~n~ integers, the diameters ~d_1, d_2, \ldots, d_n~ of the coconuts.


## Output

A single integer: the maximum number of disjoint coconut pairs.


## Constraints

- ~1 \le n \le 10^5~
- ~0 \le k \le 10^9~
- ~1 \le d_i \le 10^9~

## Example 1

### Input

```text
6 2
1 3 5 2 4 6
```

### Output

```text
3
```

### Explanation

We can have ~3~ pairs of coconuts by pairing coconuts ~1~ and ~2~ ~(1, 3)~,
coconuts ~3~ and ~6~ ~(5, 6)~, and coconuts ~4~ and ~5~ ~(2, 4)~.

## Example 2

### Input

```text
5 1
1 5 3 2 4
```

### Output

```text
2
```

## Example 3

### Input

```text
7 0
1 3 1 2 2 5 4
```

### Output
```text
2
```
