# GLSL Copy POP Instancing

## Pattern: Template Mesh Instancing with GLSL Transform

## Operators
- SOP to POP (template mesh as points)
- Point Generator POP (instance positions)
- Attribute POP (instanceId, animOffset)
- GLSL Advanced POP (per-instance transform)
- Geometry COMP (render container)
- Camera COMP
- Render TOP → Null TOP

## Connections
1. SOP to POP → GLSL Advanced POP (input 0: template)
2. Point Generator POP → GLSL Advanced POP (input 1: instances)
3. GLSL Advanced POP → Geometry COMP
4. Geometry COMP → Render TOP

## Parameters
- Template: torus, 100 vertices
- Instances: 1000 points, radius=5
- Anim offset: 0.0-1.0 per instance
- GLSL: noise displacement + rotation

## GLSL Instance Transform
```glsl
uniform sampler2D uAnimTexture;
uniform float uAnimOffset, uAnimSpeed, uAnimFrame;
uniform float uAnimOffset, uAnimSpeed, uAnimFrame;

void main() {
    int id = gl_VertexID;
    vec3 basePos = TDIn_P(id);
    layout(location = 8) in float instanceIdAttr;
    float instanceId = instanceIdAttr;

    // Animation frame with per-instance offset
    float animFrame = fract(uAnimFrame * uAnimSpeed + instanceId * uAnimOffset);

    // Sample animation texture
    vec2 animUV = vec2(animFrame, instanceId / float(TD_NUM_POINTS));
    vec3 animOffset = texture(uAnimTexture, animUV).xyz;

    // Apply
    P[id] = basePos + animOffset;
}
```

## Variants from Toe_Expand
- **AnimOffsetInstancesConnectingLines:** + connecting lines between instances
- **CopyId:** matching by unique ID
- **Humanoid_AnimOffsetInstances:** humanoid mesh animation
- **TemplateBends:** mesh deformation with bends

## Notes
- Template mesh vertices are input 0, instances are input 1
- instanceId attribute maps each point to a template
- Anim texture stores pose library (frames × instances)
- For connecting lines: extra vertices between instance points
