# Select Channel
## Operators needed
- type: noiseCHOP → name: noise1
- type: selectCHOP → name: select1
- type: nullCHOP → name: null1
## Connections
- noise1 out → select1 in
- select1 out → null1 in
## Parameters
- select1.channel = 0
## Description
Selects a single channel from a multi-channel signal. Essential for isolating specific data streams.
