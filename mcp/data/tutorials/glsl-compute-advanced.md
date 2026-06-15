# GLSL Compute Advanced Patterns — TouchDesigner POPs

> **Source:** 18+ GLSL projects from Toe_Expand: GLSLPOPs, GlslAdvanced, GLSL Copy POP series, CacheSelectGLSLPOP, etc.

---

## 1. GLSL Architecture in POPs (TD 2025+)

### Standard Layout Locations
```glsl
layout(location = 0) vec3 P;        // Position (read/write)
layout(location = 1) vec3 V;        // Velocity (read/write)
layout(location = 2) vec4 Cd;       // Color (read/write)
layout(location = 3) vec3 N;        // Normal (read/write)
layout(location = 4) float Age;     // Age (read)
layout(location = 5) float Life;    // Life (read)
layout(location = 6) vec2 uv;       // UV (read)
layout(location = 7) vec3 Pprev;    // Previous position (read)
```

### Read-Modify-Write Rule
```glsl
// ✅ CORRECT
void main() {
    int id = gl_VertexID;
    vec3 pos = TDIn_P(id);      // READ to local
    pos += someForce;            // MODIFY local
    P[id] = pos;                // WRITE once
}

// ❌ INCORRECT
void main() {
    P[gl_VertexID] += someForce;  // Direct read+write = undefined behavior
}
```

**Golden Rule:** Always read into a local variable, modify that variable, and write the final result back to the global array once.

---

## 2. Advanced Patterns from Toe_Expand Projects

### 2.1 GLSL Copy POP — Instancing with Animation Offset
**Source:** GLSL Copy POP AnimOffsetInstancesConnectingLines

```glsl
// Uniforms
uniform sampler2D uAnimTexture;     // Animation texture (pose library)
uniform float uAnimOffset;          // Offset per instance
uniform float uAnimSpeed;           // Animation speed
uniform float uAnimFrame;           // Current frame

void main() {
    int id = gl_VertexID;
    vec3 basePos = TDIn_P(id);
    float instanceId = TDIn_customAttrib(id, "instanceId");

    // Calculate animation frame with per-instance offset
    float animFrame = fract(uAnimFrame * uAnimSpeed + instanceId * uAnimOffset);

    // Sample animation texture
    vec2 animUV = vec2(animFrame, instanceId / float(TD_NUM_POINTS));
    vec3 animOffset = texture(uAnimTexture, animUV).xyz;

    // Apply transformation
    vec3 finalPos = basePos + animOffset;
    P[id] = finalPos;
}
```

### 2.2 Connecting Lines Between Instances
**Source:** GLSL Copy POP AnimOffsetInstancesConnectingLines

```glsl
// Create connecting lines between related instances
uniform int uLineSegmentCount;
uniform float uLineThickness;

void main() {
    int id = gl_VertexID;
    int totalVerts = TD_NUM_POINTS;

    // Determine if this vertex is a line or point
    int pointsPerInstance = totalVerts / (uLineSegmentCount + 1);

    if (id % (uLineSegmentCount + 1) == 0) {
        // It's an instance point
        vec3 pos = TDIn_P(id);
        Cd[id] = vec4(1.0, 1.0, 1.0, 1.0);
    } else {
        // It's a line vertex
        int lineId = id / (uLineSegmentCount + 1);
        int segId = id % (uLineSegmentCount) - 1;
        float t = float(segId) / float(uLineSegmentCount);

        // Interpolate between adjacent instances
        vec3 pA = TDIn_P(lineId * (uLineSegmentCount + 1));
        vec3 pB = TDIn_P((lineId + 1) * (uLineSegmentCount + 1));
        vec3 pos = mix(pA, pB, t);
        P[id] = pos;

        // Semi-transparent line
        Cd[id] = vec4(0.5, 0.5, 1.0, 0.3);
    }
}
```

### 2.3 Copy by ID — Template Matching
**Source:** GLSL Copy POP CopyId

```glsl
// Match template vertices with instance data by ID
uniform sampler2D uTemplatePositions;
uniform sampler2D uInstanceData;
uniform int uTemplatePointCount;

void main() {
    int id = gl_VertexID;
    float customId = TDIn_customAttrib(id, "copyId");

    // Find template point by ID
    int templateIdx = int(customId);
    if (templateIdx >= 0 && templateIdx < uTemplatePointCount) {
        vec3 templatePos = texelFetch(uTemplatePositions, templateIdx, 0).xyz;
        vec3 instancePos = TDIn_P(id);

        // Apply template position as offset
        P[id] = instancePos + templatePos;
    }
}
```

### 2.4 Template Bends — Mesh Deformation
**Source:** GLSL Copy POP TemplateBends

```glsl
// Deform template mesh with bends
uniform float uBendAngle;
uniform vec3 uBendAxis;
uniform float uBendCenter;
uniform float uBendFalloff;

void main() {
    int id = gl_VertexID;
    vec3 pos = TDIn_P(id);

    // Calculate distance to bend center
    float dist = dot(pos - vec3(uBendCenter), uBendAxis);

    // Apply rotation proportional to distance
    float angle = uBendAngle * smoothstep(0.0, uBendFalloff, abs(dist));
    float s = sin(angle);
    float c = cos(angle);

    // Rotate around axis
    vec3 perp = pos - dist * uBendAxis;
    vec3 rotated = perp * c + cross(uBendAxis, perp) * s + dist * uBendAxis;
    P[id] = rotated;
}
```

### 2.5 Proximity Triangles — GLSL Create
**Source:** GLSLCreate_ProximityTriangles

```glsl
// Create triangles based on proximity between points
uniform float uProximityRadius;
uniform int uMaxConnections;

void main() {
    int id = gl_VertexID;
    vec3 pos = TDIn_P(id);

    // Find nearby neighbors
    int connections = 0;
    for (int i = 0; i < TD_NUM_POINTS && connections < uMaxConnections; i++) {
        if (i == id) continue;
        vec3 other = TDIn_P(i);
        float d = distance(pos, other);
        if (d < uProximityRadius && d > 0.001) {
            // Create intermediate triangle vertex
            vec3 midPoint = (pos + other) * 0.5;
            // ... emit vertex
            connections++;
        }
    }
}
```

### 2.6 Cache + Select Pipeline
**Source:** CacheSelectGLSLPOP

```glsl
// Select between multiple cache frames
uniform sampler2D uCacheA;
uniform sampler2D uCacheB;
uniform float uBlendFactor;
uniform int uCacheFrameA;
uniform int uCacheFrameB;

void main() {
    int id = gl_VertexID;
    vec2 uv = vec2(float(id) / float(TD_NUM_POINTS), 0.0);

    vec3 posA = texelFetch(uCacheA, ivec2(id, uCacheFrameA), 0).xyz;
    vec3 posB = texelFetch(uCacheB, ivec2(id, uCacheFrameB), 0).xyz;

    vec3 blended = mix(posA, posB, uBlendFactor);
    P[id] = blended;
}
```

---

## 3. Performance Patterns

### 3.1 Shared Memory for Neighbor Search
```glsl
shared vec3 sharedPositions[256];

void main() {
    // Load data to shared memory cooperatively
    int localId = gl_LocalInvocationID.x;
    sharedPositions[localId] = TDIn_P(gl_GlobalInvocationID.x);
    barrier();

    // Now neighbor search is local (faster)
    for (int i = 0; i < 256; i++) {
        float d = distance(sharedPositions[localId], sharedPositions[i]);
        // ...
    }
}
```

### 3.2 Texture Fetch for Large Data
```glsl
// Instead of SSBO for large data, use textures
uniform sampler2D uPositionBuffer;  // 2D texture with positions
uniform ivec2 uBufferResolution;

vec3 getPosition(int id) {
    ivec2 coord = ivec2(id % uBufferResolution.x, id / uBufferResolution.x);
    return texelFetch(uPositionBuffer, coord, 0).xyz;
}
```

### 3.3 Minimal Branching
```glsl
// ❌ Expensive branching
if (dist < radius) {
    force += calculateRepulsion(pos, other);
} else if (dist < attractRadius) {
    force += calculateAttraction(pos, other);
}

// ✅ smoothstep without branching
float repulsion = (1.0 - smoothstep(0.0, radius, dist)) * repulsionStrength;
float attraction = smoothstep(radius, attractRadius, dist) * attractionStrength;
force += normalize(pos - other) * (repulsion - attraction);
```

---

## 4. GLSL POP Types Reference

| Operator | Purpose | Input/Output |
|----------|---------|--------------|
| **GLSL POP** | Modify attributes one class at a time | Read-only input, write-only output |
| **GLSL Advanced POP** | Simultaneous read/write, topological changes | Read-write input, multiple outputs |
| **GLSL Copy POP** | Instancing with custom GLSL per copy | Template input + instance data |
| **GLSL Create POP** | Procedural geometry generation (deprecated → use GLSL Advanced) | No input, generates geometry |

---

## 5. TD-Specific GLSL Extensions

### Read Functions (`TDIn_...`)
```glsl
TDIn_P(id)        // Position (vec3)
TDIn_Vel(id)      // Velocity (vec3)
TDIn_Cd(id)       // Color (vec4)
TDIn_N(id)        // Normal (vec3)
TDIn_uv(id)       // UV coords (vec2)
TDIn_pscale(id)   // Size (float)
TDIn_age(id)      // Age (float)
TDIn_life(id)     // Max life (float)
```

### Write Variables
```glsl
P[id]    // vec3 position
Vel[id]  // vec3 velocity
Cd[id]   // vec4 color
```

### Key Constants
```glsl
TD_NUM_POINTS     // Total number of points
gl_VertexID       // Current vertex index
gl_LocalInvocationID.x  // Local thread ID
gl_GlobalInvocationID.x // Global thread ID
```

---

## 6. Naming Conventions

| Convention | Example |
|-----------|---------|
| Uniforms | `uCamPos`, `uLightDir`, `uTime` |
| Attributes | `instanceId`, `copyId`, `lineId` |
| Outputs | `P[id]`, `Cd[id]`, `V[id]` |
| Helper functions | `curlNoise()`, `fbm()`, `snoise()` |
| Constants | `M_PI`, `EPSILON`, `MAX_POINTS` |

---

## 7. Precision Guidelines

| Precision | Use Case |
|-----------|----------|
| `lowp` (8-bit) | Flags, simple operations |
| `mediump` (16-bit) | Colors, UVs |
| `highp` (32-bit) | Positions, critical math |
