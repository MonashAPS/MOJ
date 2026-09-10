Sanjindra is close to finding the All Blue and fulfilling their dream! However, there remains yet one obstacle in their path: a treacherous portion of the Calm Belt filled with evil sea monsters. Sanjindra knows that their ship, the Thousand Sunny, is strong and can take **less than ~k~** points of damage before that it will sink. 

The portion of the Calm Belt can be modelled as a graph with ~n~ nodes, connected by ~m~ routes. Each route has a two endpoints (~a_i~ and ~b_i~), a distance (~w_i~), and the damage the sea monsters will do (~d_i~).

As Namindra, the navigator of the ship, it is your job to find **the shortest route** from nodes ~x~ to ~y~ which takes **less than ~k~ points of damage**. Can you help Sanjindra with this task?

# Input Format
The first line of input will consist of 3 integers, ~k~ ~n~ ~m~. Each of the next lines will consist of 4 integers ~a_i~ ~b_i~ ~w_i~ and ~d_i~, as described in the description. Finally, the last line will contain two integers ~x~ and ~y~, the point Sanjindra starts and wants to end.

# Output Format
The output should consist of a single integer, the minimum length of the path if it is possible, or **~-1~~ if it is not**.

# Constraints
~1 \le k \le 200~

~2 \le n \le 2000~

~n \le m \le 10000~

~0 \le a_i, b_i \le n-1~

~1 \le w_i \le 1e5~

~0 \le c_i \le 200~

# Sample Input
10 4 7
1 2 4 4
1 3 7 2
3 1 8 1
3 2 2 2
4 2 1 6
3 4 1 1
1 4 6 12
1 4
# Sample Output
7