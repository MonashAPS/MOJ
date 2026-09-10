<!-- <img src="https://me.glipr.xyz/img/comp/meowmeow.png" alt="problem header" width="180"/> -->

# Meow Meow

## Problem Statement

Digger and Rykker (pictured below, taking a break from meowing) like to make noise.

<img src="https://me.glipr.xyz/img/comp/diggerrykker.jpg" alt="cats" width="180"/>

We've categorised the noises they make as follows:

* `hiss`: This is represented in text as `hi`, followed by at least 2 `s`s.
* `trill`: This is represented in text as `tr`, followed by some non-zero amount of `i`s, and at least 2 `l`s.
* `burble`: This is represented in text as `b`, followed by some non-zero amount of `u`s, followed by some non-zero amount of `r`s, followed by a `b`, followed by some non-zero amount of `l`s, followed by an `e`.

We want you to write a program to recognise these.

## Input

Your first line of input will be a single integer ~t~: the number of noises made.

Next, ~t~ lines will follow, each containing a single string ~s_i~: the noise made by either Digger and Rykker or a human.

## Output

For each ~s_i~, if it is a `hiss`, `trill`, or `burble` noise, output `hiss`, `trill` or `burble`, respectively, on its own line.

If ~s_i~ is none of these, output `human noises` instead.

## Constraints

For all test cases...
* ~1 \leq t \leq 100~
* ~1 \leq |s_i| \leq 100~
* Each ~s_i~ only contains English lower-case alphabet letters.

## Example

### Input
```
7
hisss
triiilll
buuurrrbllle
his
trlll
burbble
hello
```

### Output
```
hiss
trill
burble
human noises
human noises
human noises
human noises
```

### Explanation

The first ~3~ lines fit their respective definitions. 
* `his` does not have two `s`s.
* `trlll` needs at least 1 `i`.
* `burbble` repeats a `b` when it should not.
* `hello` kind of just...does not fit into any of the specified categories.

## Python Template
```python
t = int(input())
a = [input() for _ in range(t)]
# Continue your code here and print your final answer!
```
