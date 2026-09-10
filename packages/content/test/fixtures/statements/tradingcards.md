<img src="https://me.glipr.xyz/img/comp/tradingcards.png" alt="problem header" width="180"/>

Ian is collecting trading cards, and wants to collect an entire set of the latest release (at least 1 of every card)
The collection of cards have an index, such as #1, #2, #3... this dictates their rarity (#1 is the least rare, increasing index has increasing rarity)

Ian can trade cards with his friend Penelope, who has an unlimited supply of every card, but will only trade any particular card for a particular card of **strictly lower** rarity. For example, she might give you a `#1 charmander`, but only if you give her a `#3 squirtle`.

Ian wants to know, given his current inventory, if it is possible to own at least 1 of every card!

## Input

Input will start with a single integer, the number of cards to collect, $c$.
Next, $c$ lines will follow, each containing 4 space separated values:

1. The index of the card $\#i$ - This will always be a number from #1 to #c, increasing (So first entry is always #1, second entry is always #2, ...).
2. The name of the card $s$ - This will only contain the lowercase letters a-z.
3. The amount of this card Ian currently has - a non-negative integer $a$.
4. The card you'd need to give penelope to get this card in return - `#0` means Penelope will not trade you this card.

## Output

Output should simply be either `YES` or `NO`, depending on whether it is possible.

## Constraints

* $1 \leq c \leq 800$
* $1 \leq |s| \leq 26$
* $0 \leq a \leq 8000$

## Example Run

For input

```
5
#1 charmander 0 #2
#2 squirtle 1 #4
#3 bulbasaur 3 #5
#4 gastly 1 #5
#5 eevee 2 #0
```

your program should output

```
YES
```

Since you can trade an eevee for a gastly, a gastly for a squirtle, and a squirtle for a charmander, and then you have 1 charmander, 1 squirtle, 3 bulbasaurs, 1 gastly and 1 eevee.
