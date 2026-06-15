# Geometry Instancing
## Operators needed
- type: boxSOP → name: box1
- type: instanceSOP → name: inst1
- type: renderTOP → name: render1
## Connections
- box1 out → inst1 in
- inst1 out → render1 in0
## Parameters
- box1.size = 0.1
- inst1.num = 100
- inst1.distribution = grid
- render1.resolution = 512
## Description
Instances a box across a grid layout. Foundation for particle systems, arrays, and scatter effects.
