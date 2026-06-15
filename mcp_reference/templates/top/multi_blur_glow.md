# Multi-Blur Glow
## Operators needed
- type: constantTOP → name: src1
- type: blurTOP → name: blur1
- type: compositeTOP → name: comp1
## Connections
- src1 out → blur1 in
- blur1 out → comp1 in0
- src1 out → comp1 in1
## Parameters
- blur1.radius = 20
- comp1.operation = add
- comp1.opacity = 0.6
## Description
Creates a glow effect by blurring the source and compositing it back over the original. Adjust radius for glow spread.
