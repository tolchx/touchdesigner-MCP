# Text → Font → Render
## Operators needed
- type: fontSOP → name: font1
- type: renderTOP → name: render1
## Connections
- font1 out → render1 in0
## Parameters
- font1.text = "Hello TD"
- font1.font = "Arial"
- font1.size = 0.5
- render1.resolution = 512
## Description
Creates 3D text geometry and renders it. Useful for titles, labels, and kinetic typography.
