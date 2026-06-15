# Box → GLSL POP Noise
## Operators needed
- type: boxPOP → name: box1
- type: glslPOP → name: glsl1
## Connections
- box1 out → glsl1 in
## Parameters
- box1.num = 1000
- glsl1.par.amp = 0.5
- glsl1.par.freq = 1.0
## Description
Generates particles from a box POP and processes them through a GLSL POP for custom noise displacement.
