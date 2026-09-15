## Problem Statement

You are given an undirected graph with ~n~ vertices and ~m~ edges. Pondo would like you to determine the number of ~3~-cycles in the graph. A ~3~-cycle (triangle) is a cycle of length ~3~ in the graph.

## Input Statement
Your first line will contain two space-separated integers ~n~ and ~m~ (respectively).

Your next line ~m~ lines will contain two space-separated integers each, ~u~ and ~v~, representing an edge between nodes ~u~ and ~v~.

## Output Statement
You should output a single integer representing the number of ~3~-cycles in the given graph.

## Constraints
- ~1 \leq n \leq 10^4~
- ~1 \leq m \leq \min(10^4, \frac{n \cdot (n - 1)}{2})~
- ~1 \leq u, v \leq n~
- all ~u, v~ pairs are unique and ~u \neq v~

## Sample Cases
### Input 1
```
5 10
1 2
1 3
1 4
1 5
2 3
2 4
2 5
3 4
3 5
4 5
```
### Output 1
```
10
```
### Explanation 1
Notice that all triples of nodes form ~3~-cycles.
### Input 2
```
6 8
1 2
1 3
2 3
2 4
3 5
4 5
4 6
5 6
```
### Output 2
```
2
```
### Explanation 2
There are only two ~3~-cycles formed by ~(1, 2, 3)~ and ~(4, 5, 6)~.