# RGB Split Glitch
## Operators needed
- type: movieinTOP → name: src1
- type: displaceTOP → name: disp_r
- type: displaceTOP → name: disp_g
- type: displaceTOP → name: disp_b
- type: compositeTOP → name: comp1
## Connections
- src1 out → disp_r in
- src1 out → disp_g in
- src1 out → disp_b in
- disp_r out → comp1 in0
- disp_g out → comp1 in1
- disp_b out → comp1 in2
## Parameters
- disp_r.amp = 0.02
- disp_g.amp = 0.01
- disp_b.amp = 0.03
- comp1.operation = add
## Description
Splits RGB channels with different displace amounts for chromatic aberration / glitch effects.
