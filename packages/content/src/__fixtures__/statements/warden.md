You and a friend are in adjacent cells in prison, and you are planning an escape!

In order to escape, some information needs to be shared between you however, which is the final passcode digit on your friends door. You know this value, but your friend does not. The value is between 1 and 8.

Luckily, there are a set of lights that both you and your friend can see, which begin either on or off. You may flip one light from off to on, or on to off, and your friend must then use the new configuration of lights to decide what the final passcode digit is. If you're wrong, then it's off to the gallows for both of you!

### Interaction

Your code will play the role of you and your friend in this problem.

Input will start with 1 integer. If this integer is `1`, you are the friend. Otherwise the integer is `0`, and you are yourself.

**Yourself** then has 2 remaining lines of input

The first line will contain 8 characters, representing the lights. These will be `x` (on) or `o` (off). The second line is a single integer between 1 and 8, representing the warden's passcode digit.

You should then output the light you want to flip, an integer from 1 to 8.

**Your friend** then has 1 remaining line of input

This line will contain 8 characters, representing the lights. These will be `x` (on) or `o` (off).

Your friend should output what they think the warden's passcode digit is.


### Example Run

The Judge will first print:

```
0
xoooxooo
4
```

To yourself (a python process), then you might print `6`. Next, the judge then prints

```
1
xoooxxoo
```

To your friend (another python process), then your friend prints `4`, Guessing the passcode and setting you free!

Note that the input for your friend has the 6th light flipped from off to on.