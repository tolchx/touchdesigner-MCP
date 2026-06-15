# LFO → Null
## Operators needed
- type: lfoCHOP → name: lfo1
- type: nullCHOP → name: null1
## Connections
- lfo1 out → null1 in
## Parameters
- lfo1.type = sine
- lfo1.rate = 0.5
- lfo1.amp = 1.0
- lfo1.offset = 0.0
## Description
Generates an LFO signal and routes it to a null for preview or further processing. Basic modulation signal generator.
