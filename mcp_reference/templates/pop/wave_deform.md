# Wave Deform
## Operators needed
- type: boxPOP → name: box1
- type: glslPOP → name: wave1
## Connections
- box1 out → wave1 in
## Parameters
- box1.num = 2000
- wave1.par.freq = 2.0
- wave1.par.amp = 0.5
- wave1.par.speed = 1.0
## Description
Applies a wave deformation to particles via GLSL. Particles undulate like a flag or water surface.
