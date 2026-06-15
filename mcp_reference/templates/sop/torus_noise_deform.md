# Torus → Noise Deform
## Operators needed
- type: torusSOP → name: torus1
- type: noiseSOP → name: noise1
- type: renderTOP → name: render1
## Connections
- torus1 out → noise1 in
- noise1 out → render1 in0
## Parameters
- torus1.radius = 0.5
- torus1.crossradius = 0.2
- noise1.amp = 0.1
- noise1.freq = 2.0
- render1.resolution = 512
## Description
Deforms a torus with noise displacement. Creates organic, wobbly ring shapes perfect for abstract 3D.
