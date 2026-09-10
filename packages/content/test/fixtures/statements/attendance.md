Winson’s Semester 2 has started, and he wants to make plans to ace his studies and win the Dean’s “Most Locked In” award.

Semester 2 consists of ~N~ days. On the ~i~-th day, ~1 \le i \le N~, Winson will choose exactly one of his four units to attend a lecture on:

- **Unit A**: gain ~a_\text{i}~ knowledge points
- **Unit B**: gain ~b_\text{i}~ knowledge points
- **Unit C**: gain ~c_\text{i}~ knowledge points
- **Unit D**: gain ~d_\text{i}~ knowledge points

Due to his dwindling attention span, Winson is unable to attend a lecture on the same unit two or more days in a row. That is, on the ~i~-th day, where ~1 < i \le N~, he cannot choose to attend the same lecture as he did on the ~i-1~-th day.

Find the maximum total knowledge points that Winson can gain over the semester.
```
## Input
The first line contains an integer ~N~, the number of days in Semester 2.
The following ~N~ lines contain integers ~a_i, b_i, c_i, d_i~, the number of knowledge points winson can gain by attending a unit's lecture on the ~i~th day.

## Output
Output the maximum total knowledge points that Winson can gain over the semester.

## Constraints
- ~1 \le n \le 10^5~
- ~1 \le a_i, b_i, c_i, d_i \le 10^4~

## Example 1
### Input
```
3
1 2 3 4
2 4 6 8
1 3 5 7
```

### Output
```
17
```
If Winson chooses to go to Unit D's lecture on the first day, unit C's lecture on the second day, then unit D's lecture on the third day, he will obtain 4 + 6 + 7 = 17 knowledge points.

## Example 2
### Input
```
1
2102 2014 2004 2099
```

### Output
```
2102
```

## Example 3
### Input
```
7
3 1 4 10
4 10 6 8
1 4 7 1
3 10 5 6
10 3 1 9
1 10 9 3
4 11 9 5
```

### Output
```
67
```

