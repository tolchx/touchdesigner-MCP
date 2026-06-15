# Noise → Blur
## Operators needed
- type: noiseTOP → name: noise1
- type: blurTOP → name: blur1
## Connections
- noise1 out → blur1 in
## Parameters
- noise1.amp = 0.5
- noise1.freq = 0.1
- blur1.radius = 10
## Description
Generates noise and applies a blur filter. Useful for cloud-like textures, soft gradients, or organic backgrounds.
