# Shape → Merge → Render
## Operators needed
- type: sphereSOP → name: sphere1
- type: boxSOP → name: box1
- type: mergeSOP → name: merge1
- type: renderTOP → name: render1
## Connections
- sphere1 out → merge1 in0
- box1 out → merge1 in1
- merge1 out → render1 in0
## Parameters
- sphere1.radius = 0.3
- sphere1.tx = -0.5
- box1.size = 0.4
- box1.tx = 0.5
- render1.resolution = 512
## Description
Merges a sphere and box into a single scene and renders them. Multi-object scene assembly.
