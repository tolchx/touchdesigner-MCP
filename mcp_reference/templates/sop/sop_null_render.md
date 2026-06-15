# SOP → Null → Render
## Operators needed
- type: boxSOP → name: box1
- type: nullSOP → name: null1
- type: renderTOP → name: render1
## Connections
- box1 out → null1 in
- null1 out → render1 in0
## Parameters
- box1.size = 0.5
- render1.resolution = 512
## Description
Box geometry routed through a null SOP for preview before rendering. Debug and intermediate checkpoints.
