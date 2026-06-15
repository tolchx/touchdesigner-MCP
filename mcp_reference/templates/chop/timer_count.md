# Timer → Count → CHOP
## Operators needed
- type: timerCHOP → name: timer1
- type: countCHOP → name: count1
## Connections
- timer1 out → count1 in
## Parameters
- timer1.length = 1.0
- count1.start = 0
- count1.end = 10
## Description
Timer drives a counter for sequential animation or triggering. Good for timed events and stepping through values.
