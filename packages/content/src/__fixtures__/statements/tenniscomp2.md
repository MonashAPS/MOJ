Alexandra is back at it again running a tennis tournament between friends to determine who is the best, but Alexandra thinks there is a cheater in her midst!

The tournament is already concluded, and Alexandra has the log of all battles the were completed (not necessarily in order). However, this log has been tampered with.

Alexandra knows that one player has marked all of their lost games as wins, and changed nothing else. They also know that this competitor did not win the competition.

Can you help Alexandra figure out who the cheater is?

## Input

Input will begin with a single integer $c$, the number of competitors, and is followed by $c$ lines, each containing a single name.
What follows is then $c-1$ lines detailing the games. Each game is of the form "<name1> defeats <name2>".

## Output

Output should contain 3 or more lines.
The first line should state the name of the cheater: "<name> must be the cheater"
The second line should state how many games they forged: "They cheated on <x> games"
And any subsequent lines should state what those games are: "<name> defeats <actual_winner>"

## Constraints

* $1 \leq c \leq 1024$.
* $c$ is always a power of 2.
* Each name contains only lowercase english letters and numbers.
* Each name is at most 20 characters long.

## Example Test Case

For input:
```
4
name1
name2
name3
name4
name4 defeats name2
name2 defeats name1
name3 defeats name4
```

The program should output:
```
name3 must be the cheater
They cheated on 1 games
name3 defeats name4
```
