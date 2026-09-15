You have an ~n \times n~ matrix and you are tasked with finding a local peak.
A local peak is an element that is larger than all of its adjacent elements, (but not diagonals).
You can only query an element in the matrix ~10 n~ times.

## Interaction
The first line of input contains an integer ~n~, the size of the matrix.

You can make a query of the form `? x y`, which queries the element at position ~(x,y)~ (0 indexed). The judge will respond with that element, which you can read as a line of input.

You can make a final answer in the form `! x y`, stating that there is a local peak at position ~(x,y)~

## Constraints
- ~2 \le n \le 2000~
