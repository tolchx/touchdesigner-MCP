# Lookup Table CHOP
## Operators needed
- type: noiseCHOP → name: noise1
- type: lookupCHOP → name: lookup1
## Connections
- noise1 out → lookup1 in
## Parameters
- noise1.amp = 1.0
- lookup1.method = linear
## Description
Maps noise values through a lookup table for custom response curves. Shape noise into any distribution.
