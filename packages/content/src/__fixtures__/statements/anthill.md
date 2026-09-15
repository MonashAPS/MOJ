## Statement

Alice the Ant likes to make Ant Hills, long winding tunnels throughout the ground, so that her and all of her family have places to rest. Alice's family has a terrible sense of direction, so all of the Ant Hills she designs contain no loops (In other words, the only way to get back to a particular point in the hill is to retrace your steps).

Because of her digging ability, We'd like Alice to build a particular Ant Hill for us, but since she is an Ant, we need to specify the building directions in a very simple manner.

Alice only follows two commands:

- Tunnel: Alice will dig a new tunnel from her current position for ~x~ centimeters
- Back: Alice will move backwards ~x~ centimeters from her current position (always towards the start of the ant hill)

So following the following commands:

```
TUNNEL 10
BACK 1
TUNNEL 2
BACK 4
TUNNEL 3
BACK 6
TUNNEL 2
```

She'll have carved out the following tunnel:

(Notion uses aws :p `prod-files-secure` is a good name :D )
![anthill.png](https://prod-files-secure.s3.us-west-2.amazonaws.com/1f49def0-2dfd-4aba-8a45-5dcdb0d30140/7ba023e1-e000-4955-a4b2-75d304844805/anthill.png)

We don't mind the direction of the tunnels, which is why we are just specifying forwards/backwards. Can you provide the instructions to Alice so she can dig the ant hill to our liking?

## Input

Input will begin with a single integer ~N~, the number of *nodes* in the ant hill. Nodes are just the end points of lines.

~N-1~ lines will follow, each containing 3 space separated integers, ~X~, ~Y~ and ~D~. This means that there is a line connecting nodes ~X~ and ~Y~ of length ~D~.

In the example above, input might have been:

```
8
1 2 4
2 3 2
2 4 3
4 5 3
4 6 2
6 7 2
6 8 1
```

Where the bottom most node is node 1, and so the second line of input is connecting that to node 2 with distance 4. The next two lines of input then connect node 2 to two other nodes with distance 2 and 3 respectively, in pink and purple in the diagram above.

## Output

Output should start with an integer ~I~, the number of instructions. ~I~ lines should follow, each containing either `TUNNEL x` or `BACK x` for some integer `x`. If these instructions carve out the ant hill specified, then your program will receive `AC`.

## Note

Note that your instructions must be assumed to start at Node 1 of input. But that still allows for multiple instruction sets to work. For example, in the previous drawing, the following instructions would also be appropriate:

```
9
TUNNEL 2
TUNNEL 4
BACK 2
TUNNEL 6
BACK 1
TUNNEL 2
BACK 4
TUNNEL 3
BACK 6
```

## Constraints

- ~1 \leq N \leq 10^4~
- ~1 \leq d \leq 10^9~
- Your output instructions should have ~I \leq 3 \times N~
- Input will not contain a node which is touched by exactly 2 edges (A redundant stopping point in the hill)
