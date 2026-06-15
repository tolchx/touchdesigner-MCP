# Switch Between Sources
## Operators needed
- type: noiseCHOP → name: src_a
- type: constantCHOP → name: src_b
- type: switchCHOP → name: switch1
## Connections
- src_a out → switch1 in0
- src_b out → switch1 in1
## Parameters
- switch1.index = 0
## Description
Switches between two input signals. Toggle index to select which source passes through.
