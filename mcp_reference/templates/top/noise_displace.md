# Noise Displace
## Operators needed
- type: constantTOP → name: src1
- type: noiseTOP → name: noise1
- type: displaceTOP → name: disp1
## Connections
- src1 out → disp1 in
- noise1 out → disp1 displace
## Parameters
- noise1.freq = 0.05
- noise1.amp = 0.3
- disp1.amp = 0.1
## Description
Uses noise as a displacement map to distort a source image. Produces swirling, liquid-like organic warps.
