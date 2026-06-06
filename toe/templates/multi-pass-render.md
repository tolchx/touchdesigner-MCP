# Multi-Pass Render

## Pattern: Multiple Render Passes with Composite

## Operators
- Geometry COMP (scene)
- Camera COMP (viewpoint)
- Render TOP (pass 1: diffuse)
- Render TOP (pass 2: specular)
- Render TOP (pass 3: emissive)
- Composite TOP (combine passes)
- Level TOP (post-process)
- Null TOP (output)

## Connections
1. Geometry COMP → Render TOP 1
2. Geometry COMP → Render TOP 2
3. Geometry COMP → Render TOP 3
4. Render TOP 1 → Composite TOP (input 0)
5. Render TOP 2 → Composite TOP (input 1)
6. Render TOP 3 → Composite TOP (input 2)
7. Composite TOP → Level TOP
8. Level TOP → Null TOP

## Parameters
- Render 1: diffuse lighting only
- Render 2: specular highlights
- Render 3: emissive/self-illumination
- Composite: operation=add (additive blending)
- Level: brightness=1.2, gamma=1.0

## Multi-Pass Blur (from Toe_Expand)
```
Source TOP → Blur TOP (horizontal) → Blur TOP (vertical) → Output TOP
```

## Notes
- Each render pass uses same camera/geometry
- Different materials per pass (via geometryCOMP material)
- Additive composite for light passes
- Level TOP for final color correction
- Multi-pass blur: separate H/V for better performance
