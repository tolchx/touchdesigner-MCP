# Cache Data
## Operators needed
- type: noiseCHOP → name: noise1
- type: lagCHOP → name: cache1
## Connections
- noise1 out → cache1 in
## Parameters
- noise1.amp = 0.5
- cache1.filter = 0.9
## Description
Smooths/slows signal changes using lag. Acts as a data cache for values that should transition gradually.
