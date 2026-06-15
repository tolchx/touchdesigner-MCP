# Subdivide → Displace → Render
## Operators needed
- type: gridSOP → name: grid1
- type: subdivideSOP → name: sub1
- type: noiseSOP → name: noise1
- type: renderTOP → name: render1
## Connections
- grid1 out → sub1 in
- sub1 out → noise1 in
- noise1 out → render1 in0
## Parameters
- grid1.size = 2.0
- grid1.rows = 5
- grid1.cols = 5
- sub1.iterations = 3
- noise1.amp = 0.3
- render1.resolution = 512
## Description
Subdivides a grid, then deforms with noise for terrain-like geometry. Foundation for landscapes and organic surfaces.
