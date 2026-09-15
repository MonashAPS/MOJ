# Guess The Number
You friend is thinking of a number between ~l~ and ~r~, and you are trying to guess it in as few guesses as possible. In response to each of your guesses, they will respond "HIGHER", "LOWER", or "CORRECT". You are required to find the number with at most ~\lceil \log_2{\left(l-r+1\right)} \rceil~ guesses.

## Interaction
The first line of input contains integers ~l~ and ~r~, the range of valid numbers. You may now make guesses by printing an integer. In response to each of your guesses, the judge will respond with a line containing `HIGHER`, `LOWER` or `CORRECT` which you can read as a line of input.

### Example
The judge first inputs 
```
1 10
```

Your program prints `5`.
```
LOWER
```

Your program prints `4`
```
CORRECT
```

## Constrainst
- ~1 \le l \le r \le 10^9~

## Template
```py
l,r = (int(x) for x in input().split())

while True:
    print(guess)
    response = input()

    # Process response

    if response == "CORRECT":
        break
```