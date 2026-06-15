# Sphere → Transform → Render
## Operators needed
- type: sphereSOP → name: sphere1
- type: transformSOP → name: xform1
- type: renderTOP → name: render1
## Connections
- sphere1 out → xform1 in
- xform1 out → render1 in0
## Parameters
- sphere1.radius = 0.5
- sphere1.rows = 20
- sphere1.cols = 20
- xform1.ty = 0.0
- xform1.tz = -3.0
- render1.resolution = 512
## Description
Creates a 3D sphere, positions it with transform, and renders with a renderTOP. Basic 3D geometry pipeline.
