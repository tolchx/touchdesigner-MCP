# GLSL Shader Chain
## Operators needed
- type: constantTOP → name: const1
- type: glslTOP → name: glsl1
- type: glslTOP → name: glsl2
## Connections
- const1 out → glsl1 in
- glsl1 out → glsl2 in
## Parameters
- const1.color = { "r": 0.5, "g": 0.5, "b": 0.5, "a": 1.0 }
- glsl1.par.color0 = { "r": 1.0, "g": 0.0, "b": 0.0, "a": 1.0 }
- glsl2.par.color0 = { "r": 0.0, "g": 1.0, "b": 0.0, "a": 1.0 }
## Description
Chains two GLSL TOPs for multi-pass shader effects. First shader processes input, second applies additional effect.
