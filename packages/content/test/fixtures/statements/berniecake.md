# Bernie's Cake

Due to Bernie's political beliefs, he has been forced to share his birthday cake equally. He must share his cake by dividing it into exactly ~n~ pieces that are exactly the **same size and shape.**

Bernie has a cylindrical cake that can be divided using **2 types of cuts.**

 - A horizontal cut can be made which is parallel to the base of the cake.
 - A vertical cut can be made which starts from the edge of the cake and passes through the center of the cake. This straight cut can either end at the center, or pass through the entire cake.

Find the minimum number of cuts need to exactly divide the cake into ~n~ pieces.

![An image of the possible cuts](/media/martor/48482c85-41cd-4bf8-a81d-0a646eb35c87.png)
Here are the possible cuts the cake can have. 

Pieces cannot be discarded as that would be a waste of the hemp and almonds used to make it. 

## Input Format

A single integer, ~n~ represents the number of pieces of cake required.

## Output Format

A single integer, the minimum number of cuts require to divide the cake into ~n~ pieces.

## Constraints

~1 \le n \le 1e9~
## Examples

**Input**

```
6
```

**Output**

```
3
```

2 horizontal cuts and 1 vertical cut can separate the cake into 6 pieces. 

**Input**

```
107
```

**Output**

```
106
```

106 horizontal slices are required to exactly divide the cake into 107 pieces of the same size and shape. 
