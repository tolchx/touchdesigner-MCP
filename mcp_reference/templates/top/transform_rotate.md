# Transform Rotate
## Operators needed
- type: constantTOP → name: src1
- type: transformTOP → name: xform1
## Connections
- src1 out → xform1 in
## Parameters
- src1.color = { "r": 0.0, "g": 1.0, "b": 0.0, "a": 1.0 }
- xform1.rotate = 45.0
- xform1.tx = 0.0
- xform1.ty = 0.0
## Description
Rotates and positions a source using transformTOP. Foundation for spatial manipulation of visuals.
