Ali recently found a treasure and has arranged the coins from the treasure around a
circle. There are ~k~ houses around the circle with equal distances. Houses are numbered
~1~ through ~k~ consecutively in the clockwise direction. The treasure contains ~n~
coins, where the ~i~th coin (for ~1 \le i \le n~) has the value ~w_i~ and is located at
the house ~x_i~.

To protect the treasure, Ali has installed two radars stationed at the center of the
circle, monitoring its circumference. Radar ~i~ (for ~i \in \{1, 2\}~) starts by
monitoring house ~r_i~ and moves ~\frac{1}{v_i}~ houses per minute. More intuitively,
every ~v_i~ minutes, Radar ~i~ goes one house forward. Initially, the first radar moves
clockwise, and the second radar moves counterclockwise. Whenever the two radars meet,
they both reverse their directions. Note that this can happen in the area between two
adjacent houses.

Gholi, who wants to steal as many coins as possible, plans to start at an arbitrary house
on the circle and move at most ~\frac{1}{v}~ houses per minute in either direction
(clockwise or counterclockwise). He starts moving at time zero. He can reverse his
direction anytime or stay still for a while. If Gholi crosses paths with one of the
radars at any moment, he will be immediately caught and sent to jail. He cannot steal a
coin if this happens at a house.

Help Gholi to maximize the total value of the coins he can steal before being detected by
the radars.

## Input

The first line contains three integers, ~n~ (~1 \le n \le 10^5~) the number of coins,
~k~ (~1 \le k \le 10^9~) the number of houses around the circle, and ~v~
(~1 \le v \le 10^4~) the speed of Gholi.

The second line contains the starting monitoring house ~r_1~ and speed ~v_1~ of the first
radar (~1 \le r_1 \le k~, ~1 \le v_1 \le 10^4~).

The third line contains the starting monitoring house ~r_2~ and speed ~v_2~ of the second
radar (~1 \le r_2 \le k~, ~1 \le v_2 \le 10^4~). It is guaranteed that ~r_1 \neq r_2~.

The fourth line contains ~n~ distinct integers, ~x_1, x_2, \ldots, x_n~, representing the
houses where the coins are located (~1 \le x_i \le k~).

The fifth line contains ~n~ integers, ~w_1, w_2, \ldots, w_n~, representing the value of
each coin (~1 \le w_i \le 10^9~).

## Output

Output the maximum total value of coins Gholi can steal before being detected by the
radars.

## Constraints

- ~1 \le n \le 10^5~
- ~1 \le k \le 10^9~
- ~1 \le v, v_1, v_2 \le 10^4~
- ~1 \le r_1, r_2 \le k~ and ~r_1 \neq r_2~
- ~1 \le x_i \le k~, all ~x_i~ distinct
- ~1 \le w_i \le 10^9~

## Example 1

### Input

```
3 5 1
1 2
2 3
1 2 4
1 2 4
```

### Output

```
6
```
