# Null Display Chain
## Operators needed
- type: noiseTOP → name: noise1
- type: nullTOP → name: null1
## Connections
- noise1 out → null1 in
## Parameters
- noise1.amp = 0.8
- noise1.freq = 0.15
## Description
Simple noise → null chain for debugging. Null allows previewing intermediate results without display overhead.
