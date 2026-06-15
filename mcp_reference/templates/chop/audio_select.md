# Audio → Select → CHOP
## Operators needed
- type: audioinCHOP → name: audio1
- type: selectCHOP → name: select1
## Connections
- audio1 out → select1 in
## Parameters
- select1.channel = 0
## Description
Selects a single channel from an audio input. Useful for isolating specific audio channels for analysis.
