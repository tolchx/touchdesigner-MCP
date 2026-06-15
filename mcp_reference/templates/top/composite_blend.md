# Composite Blend
## Operators needed
- type: constantTOP → name: fg
- type: constantTOP → name: bg
- type: compositeTOP → name: comp1
## Connections
- fg out → comp1 in0
- bg out → comp1 in1
## Parameters
- fg.color = { "r": 1.0, "g": 0.0, "b": 0.0, "a": 1.0 }
- bg.color = { "r": 0.0, "g": 0.0, "b": 1.0, "a": 1.0 }
- comp1.operation = over
- comp1.opacity = 0.5
## Description
Blends two color sources together using compositeTOP with adjustable opacity. Foundation for layering visuals.
