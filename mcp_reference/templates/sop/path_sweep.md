# Path → Sweep → Render
## Operators needed
- type: lineSOP → name: path1
- type: circleSOP → name: cross1
- type: sweepSOP → name: sweep1
- type: renderTOP → name: render1
## Connections
- path1 out → sweep1 in0
- cross1 out → sweep1 in1
- sweep1 out → render1 in0
## Parameters
- path1.numsegments = 20
- cross1.radius = 0.05
- render1.resolution = 512
## Description
Sweeps a circle cross-section along a line path to create a tubular 3D shape. Great for ribbons and cables.
