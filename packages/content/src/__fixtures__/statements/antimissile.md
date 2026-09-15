We want to execute a strategic missile strike against an enemy's critical resources. The
enemy has deployed air defence systems to protect these resources. However, their defence
setup has certain vulnerabilities, and your mission is to exploit them effectively.

Each air defence system can protect all strategic resources and air defence systems within
its radius of operation, but cannot defend itself. Due to technical limitations, each
critical resource or air defence system is protected by at most one other air defence
system.

Missiles can be used to destroy either an undefended strategic resource or an air defence
system. A resource is considered undefended if no active air defence system protects it.
When an air defence system is destroyed, it can no longer protect any resources or other
air defence systems. Your goal is to maximize the number of strategic resources
destroyed.

## Input

The first line contains three integers ~m~ (number of missiles), ~n~ (number of strategic
resources), and ~d~ (number of air defence systems), where ~0 \le m, n, d \le 5000~.

The next ~n~ lines contain two integers ~x_i~ and ~y_i~ (~0 \le x_i, y_i \le 10^9~), the
coordinates of the ~i~th strategic resource.

The following ~d~ lines each contain three integers ~x_j~, ~y_j~ and ~r_j~
(~0 \le x_j, y_j \le 10^9~; ~0 \le r_j \le 10^9~), the coordinates of the ~j~th air
defence system and its radius of protection.

## Output

Output the maximum number of strategic resources that can be destroyed.

## Constraints

- ~0 \le m, n, d \le 5000~
- ~0 \le x_i, y_i, x_j, y_j, r_j \le 10^9~

## Example 1

### Input

```
3 4 3
0 0
10 20
20 20
30 30
5 5 9
16 16 14
25 25 5
```

### Output

```
2
```

### Explanation

The example test case is depicted by the figure below:

![](example.png)
