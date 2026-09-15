<img src="https://me.glipr.xyz/img/comp/catsanddogs.png" alt="problem header" width="320" style="margin: auto; display: block"/>

You are hosting the annual convention for Cats & Dogs, an often ill fated and messy gathering. In order to crack down on cat fights and butt-sniffing, you've decided to take control of the seating arrangement for dinner.

Dinner will occur on multiple circular tables, with each seat at the table alternating between dog and cat. Easy enough right?
While it is unlikely for dogs and cats to get along, there are a known list of certain cats and dogs which can sit amicably together, and cause little issues.

You are a master craftsman, and so can create as many arbitrarily sized circular tables as you'd like, provided the table seats at least 4 animals, but there should be no seat unused! Can you seat every dog and cat?

## Input

Input will begin with three space-separated integers, `C`, `D` and `P`, the number of cats, dogs, and pairings of cats/dogs which **can** sit adjacent to one another.
`P` lines follow, containing two integers `x` and `y`. This means that Cat `#x` can sit with Dog `#y`. (These are 1-indexed)

## Output

Output a single `YES` or `NO` to tell whether there is some set of tables that can be made to seat everyone.
If the answer is `YES`, output `c` lines, outlining which two dogs each cat is adjacent to, in order, in the following format:
`Cat #x sits with Dog #y and Dog #z`

## Constraints

* ~1 \leq C \leq 3000~
* ~1 \leq D \leq 3000~
* ~0 \leq P \leq 50000~

## Example Run

For the following input:

```
4 4 12
1 4
1 1
1 3
3 3
3 4
3 1
2 2
2 4
2 1
4 2
4 3
4 1
```

One possible answer is

```
YES
Cat #1 sits with Dog #1 and Dog #3
Cat #2 sits with Dog #2 and Dog #4
Cat #3 sits with Dog #4 and Dog #1
Cat #4 sits with Dog #2 and Dog #3
```

there are multiple possible solutions, another including 2 tables of size 4.
