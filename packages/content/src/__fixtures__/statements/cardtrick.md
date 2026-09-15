<img src="https://me.glipr.xyz/img/comp/cardtrick.png" alt="problem header" width="180"/>

Gerald and Leanne are doing a card trick. This trick is centred around Gerald guessing the final card in Leanne's hand.

Leanne will begin by drawing 5 random cards from a standard deck of 52 cards. Then, one by one, she will reveal 4 out of the 5 cards she has drawn. After this, without looking, Gerald will respond with the final card that Leanne drew!

Your job is to execute this card trick.

### Interaction

This program will be tested across two process, which will communicate with one another.

Your program should first read in a single integer on a line. If this integer is `0`, you are Leanne. If this integer is `1`, you are Gerald.

In either case, you should read a single integer $T$, the number of test cases.

If you are Leanne, $T$ lines will follow, each containing 5 space-separated card values.
Card values are represented as 2 characters, the first representing suit (One of `SCDH`) and the second representing face value (One of `A23456789TJQK`).

Next, for each test case Leanne should output 4 space-separated card values, that she wants to show Gerald, one by one.

If you are Bob, $T$ lines will follow, each containing 4 space-separated card values, these will be exactly the card values that Leanne printed.

Gerald should then output a single card value for each test case: The value of Leanne's final card.

### Constraints

* $1 \leq T \leq 10^5$
* The five space-separated cards Leanne receives will be distinct.

### Example Run

Leanne's Input:
```
2
ST D5 HJ DA C8
HA SA CA DA H5
```

Leanne's Output:
```
D5 DA HJ ST
DA SA CA HA
```

Gerald's Input:
```
2
D5 DA HJ ST
DA SA CA HA
```

Gerald's Output:
```
C8
H5
```

