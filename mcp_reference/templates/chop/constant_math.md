# Constant → Math → CHOP
## Operators needed
- type: constantCHOP → name: const1
- type: mathCHOP → name: math1
- type: nullCHOP → name: null1
## Connections
- const1 out → math1 in
- math1 out → null1 in
## Parameters
- const1.level = 0.5
- math1.op = add
- math1.val0 = 0.2
## Description
Generates a constant signal, applies math, and routes to null. Simple signal generation and processing chain.
