# Revolve Profile
## Operators needed
- type: lineSOP → name: profile1
- type: revolveSOP → name: rev1
- type: renderTOP → name: render1
## Connections
- profile1 out → rev1 in
- rev1 out → render1 in0
## Parameters
- profile1.numsegments = 10
- profile1.point = { "x": 0.5, "y": 0.0 }
- rev1.axis = y
- rev1.arc = 360
- render1.resolution = 512
## Description
Revolves a 2D profile around an axis to create lathe-style 3D geometry. For vases, bowls, symmetrical objects.
