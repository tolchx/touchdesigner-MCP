# Extrude Profile
## Operators needed
- type: circleSOP → name: profile1
- type: extrudeSOP → name: extrude1
- type: renderTOP → name: render1
## Connections
- profile1 out → extrude1 in
- extrude1 out → render1 in0
## Parameters
- profile1.radius = 0.3
- extrude1.distance = 1.0
- extrude1.twist = 0.0
- render1.resolution = 512
## Description
Extrudes a circle profile along a path to create 3D tube/column geometry. Adjust twist for helical forms.
