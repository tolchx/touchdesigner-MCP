# Gaussian Splatting

## Pattern: Point Cloud Rendering with Gaussian Splatting

## Operators
- File In POP (load .ply/.xyz point cloud)
- Attribute POP (create: scale, rotation, opacity)
- GLSL POP (splat computation)
- Camera COMP (viewpoint)
- Geometry COMP (splat instances)
- Render TOP (rasterization)
- Composite TOP (alpha blending)
- Null TOP (output)

## Connections
1. File In POP → Attribute POP
2. Attribute POP → GLSL POP
3. GLSL POP → Geometry COMP
4. Geometry COMP → Render TOP
5. Render TOP → Composite TOP
6. Composite TOP → Null TOP

## Parameters
- File In: format=ply, file=path/to/cloud.ply
- Scale: per-point gaussian width
- Rotation: per-point covariance orientation
- Opacity: per-point alpha
- Camera: perspective, FOV=60

## GLSL Splat Computation
```glsl
uniform mat4 uViewProj;
uniform vec3 uCamPos;

void main() {
    int id = gl_VertexID;
    vec3 pos = TDIn_P(id);
    vec3 color = TDIn_Cd(id).rgb;
    float scale = scaleAttr[id];

    // Project to screen space
    vec4 clipPos = uViewProj * vec4(pos, 1.0);
    vec2 screenPos = clipPos.xy / clipPos.w;

    // Splat size based on distance to camera
    float dist = distance(pos, uCamPos);
    float splatSize = scale / dist;

    // Store screen-space position and size
    screenPosAttr[id] = screenPos;
    splatSizeAttr[id] = splatSize;
    Cd[id] = vec4(color, opacityAttr[id]);
}
```

## Notes
- Point cloud files: .ply, .xyz, .csv
- Per-point attributes: position, color, scale, rotation, opacity
- Splat size inversely proportional to camera distance
- Alpha blending for overlapping splats
- 3 versions in Toe_Expand: 1.0.30, 1.0.37, 1.0.42
