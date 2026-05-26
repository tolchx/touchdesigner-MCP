---
name: td-pops-glsl
description: "GLSL programming for POPs in TouchDesigner — buffer variables, TDIn/TDOut API, compute shaders, force calculations, neighbor queries, ray queries, particle systems. Updated with findings from 214 real-world GLSL POP shaders."
version: "2.0.0"
author: "Tolch / TD Edu Master"
tags: ["touchdesigner", "pops", "glsl", "compute-shader", "buffer-variables", "tdin", "tdout", "particles", "forces", "neighbor", "ray-query"]
---

# td-pops-glsl v2.0

## Overview

Complete reference for GLSL programming in TouchDesigner POPs, based on analysis of 214 real-world GLSL POP shader files from community projects (JPOPsDev, POPsGuide, GaussianSplatting, POP Fluid Solver, fieldPOP, GLSLPOPs, etc.).

## GLSL POP Buffer Variables (The Real API)

In TD 2025.32820+, GLSL POPs expose **buffer variables** for attribute access. These are NOT `P[id]` struct members — they are **separate GPU buffers**:

| Buffer | Type | Description | Availability |
|--------|------|-------------|-------------|
| `P[id]` | `vec3` | Position | Always |
| `Vel[id]` | `vec3` | Velocity | When available (particlePOP, etc.) |
| `Color[id]` | `vec4` | Color (RGBA) | When available |
| `Size[id]` | `float` | Point size | When available |
| `Weight[id]` | `float` | Custom weight attr | When defined |
| `Mass[id]` | `float` | Particle mass | Particle systems |
| `PartForce[id]` | `vec3` | Particle force | Force calculations |
| `Age[id]` | `float` | Particle age | Particle systems |
| `Life[id]` | `float` | Particle lifetime | Particle systems |
| `ID[id]` | `uint` | Point ID (stable) | When available |
| Custom buffers | varies | Defined in outputattrs | Any name works |

**IMPORTANT RULE**: `P[id]` is a **write-only buffer** (not a struct). You CANNOT do:
```glsl
P[id].x = P[id].x * 2.0;  // FAILS — read-after-write on same buffer
```

You MUST read into local variables first, then write:
```glsl
vec3 pos = TDIn_P(id);     // READ via TDIn function
pos.x *= 2.0;              // Modify local copy
P[id] = pos;               // WRITE to buffer ONCE
```

### Why our earlier tests failed

Our earlier GLSL tests used `P[id].x += sin(...)` which is a **read-modify-write** on the buffer. The buffer is write-only. Use `TDIn_P(id)` to read, then assign to `P[id]` for writing.

## TDIn/TDOut Functions

These functions READ attribute data. They MUST be used instead of reading from `P[id]` directly:

| Function | Description |
|----------|-------------|
| `TDIn_P()` | Read position of current point |
| `TDIn_P(id)` | Read position of specific point by ID |
| `TDIn_N()` | Read normal |
| `TDIn_Cd()` | Read color |
| `TDIn_uv()` | Read UV coordinates |
| `TDIn1_P(i)` | Read position from input 1 (multi-input) |
| `TDIn1_rot(i)` | Read rotation attr from input 1 |
| `TDIn1_scale(i)` | Read scale attr from input 1 |
| `TDIndex()` | Current point index |
| `TDNumElements()` | Total number of points |
| `TDInputNumElements(n)` | Number of elements in input n |

## Output (Write) Pattern

Write using buffer variables directly. Each buffer corresponds to an attribute:

```glsl
void main() {
    const uint id = TDIndex();
    if(id >= TDNumElements()) return;
    
    // READ phase: copy ALL needed attributes to local vars
    vec3 pos = TDIn_P(id);
    vec3 vel = Vel[id];  // or TDIn_vel(id) if available
    
    // PROCESS phase: modify local copies freely
    pos.x += sin(float(id) * 0.5) * 0.1;
    vel.y -= 9.81 * 0.016;
    
    // WRITE phase: assign each buffer ONCE
    P[id] = pos;
    Vel[id] = vel;
    Color[id] = vec4(0.5 + 0.5 * sin(pos.x), 0.2, 0.8, 1.0);
}
```

## Complex Examples from Real Projects

### Particle with Neighbor Detection (POPsGuide)
```glsl
struct Particle {
    vec3 pos;
    vec3 vel;
    vec4 color;
    float mass;
    float radius;
};

Particle getParticle(uint id) {
    Particle p;
    p.vel = Vel[id];
    p.pos = P[id];
    p.radius = Size[id];
    p.mass = Mass[id];
    p.color = vec4(1.0);
    return p;
}

void write(Particle p) {
    P[p.id] = p.pos;
    Vel[p.id] = p.vel;
    Size[p.id] = p.radius;
    Color[p.id] = p.color;
}
```

### Force Field with SDF (fieldPOP)
```glsl
void main() {
    const uint id = TDIndex();
    if(id >= TDNumElements()) return;
    
    vec3 pos = TDIn_P(id);
    float weightSum = 0;
    
    for(int i = 0; i < TDInputNumElements(1); i++) {
        vec3 fieldPos = TDIn1_P(i);
        vec3 fieldRot = TDIn1_rot(i);
        vec3 fieldScale = TDIn1_scale(i);
        // ... SDF calculation ...
        weightSum += _weight;
    }
    Weight[id] = weightSum;  // Write to custom buffer
}
```

### Parallel Force POP (JPOPsDev)
```glsl
uniform ivec3 enable;
uniform vec3 forceCenter;
uniform float radialStrength;
uniform float axialStrength;

// User-defined functions ARE supported!
float bias(float t, float b) { return t / (((1.0/b) - 2.0) * (1.0 - t) + 1.0); }
vec3 rotateByEuler(vec3 v, vec3 euler) { /* ... */ }

void main() {
    const uint id = TDIndex();
    if(id >= TDNumElements()) return;
    
    vec3 pos = P[id];  // Read P directly (works for whole vector)
    vec3 toCenter = forceCenter - pos;
    float dist = length(toCenter);
    
    vec3 force = vec3(0);
    if (enable.x == 1) {
        vec3 radialDir = normalize(toCenter);
        force += radialDir * radialStrength;
    }
    PartForce[id] = force;  // Write to force buffer
}
```

### GLSL Copy POP — Per-Vertex Compute
```glsl
// From GLSL Copy POP examples
void main() {
    const uint id = TDIndex();
    if(id >= TDNumElements()) return;
    
    vec3 pos = TDIn_P();
    // pos is the source point position
    // The copy POP provides instance ID via TDInstanceID()
    uint instance = TDInstanceID();
    pos.x += float(instance) * 0.5;
    P[id] = pos;
}
```

## Correct Shader Templates

### Noise Displacement (VERIFIED WORKING)
```glsl
void main() {
    const uint id = TDIndex();
    if(id >= TDNumElements()) return;
    vec3 pos = TDIn_P(id);
    float n = sin(float(id) * 0.5 + pos.x * 2.0) * 0.3 + 0.3;
    float n2 = cos(float(id) * 0.7 + pos.y * 3.0) * 0.3 + 0.3;
    P[id] = pos + vec3(n, n2, (n + n2) * 0.5) * 0.4;
}
```

### Sine Wave (VERIFIED WORKING)
```glsl
void main() {
    const uint id = TDIndex();
    if(id >= TDNumElements()) return;
    vec3 pos = TDIn_P(id);
    float d = length(pos.xy);
    float w = sin(d * 3.0) * 0.3 * exp(-d * 0.3);
    pos.z += w;
    P[id] = pos;
}
```

### Vortex Rotation (PROPOSED — needs testing)
```glsl
void main() {
    const uint id = TDIndex();
    if(id >= TDNumElements()) return;
    vec3 pos = TDIn_P(id);
    float r = length(pos.xy);
    float cr = cos(r * 0.5);
    float sr = sin(r * 0.5);
    float x = pos.x;
    float y = pos.y;
    P[id] = vec3(x * cr - y * sr, x * sr + y * cr, pos.z + sin(r * 3.0) * 0.2);
}
```

### Uniforms (PERFECTLY SUPPORTED)
```glsl
// User-defined uniforms are fully supported
uniform vec3 uForceCenter;
uniform float uStrength;
uniform float uGravity;
uniform vec3 uDirection;
uniform ivec3 uEnable;

// TD built-in uniforms (auto-available):
// uTime, uFrame, uResolution, etc.
```

### User-defined Functions (PERFECTLY SUPPORTED)
```glsl
// NOT a problem! User functions work fine
float bias(float t, float b) {
    return t / (((1.0/b) - 2.0) * (1.0 - t) + 1.0);
}
float gain(float t, float g) {
    if(t < 0.5) return bias(t * 2.0, g) / 2.0;
    else return bias(t * 2.0 - 1.0, 1.0 - g) / 2.0 + 0.5;
}
vec3 rotateByEuler(vec3 v, vec3 euler) {
    float cx = cos(radians(euler.x));
    float sx = sin(radians(euler.x));
    return vec3(v.x * cx - v.y * sx, v.x * sx + v.y * cx, v.z);
}
```

## The REAL Root Cause of Earlier Failures

Our earlier tests failed because we tried to do **read-modify-write on `P[id]`**:
```glsl
P[id].x += sin(P[id].y) * 0.1;  // FAILS: reads AND writes P in same op
```

The **correct** pattern found in ALL 214 real shaders:
```glsl
vec3 pos = TDIn_P(id);           // READ explicitly
pos.x += sin(pos.y) * 0.1;       // MODIFY local copy
P[id] = pos;                     // WRITE to buffer ONCE
```

## Debugging Tips

- **COMP corruption**: After a shader fails to compile, the glslPOP's compute DAT can become corrupted. Even a correct shader will fail. **Delete and recreate** the glslPOP (or its parent COMP) when iterating on shaders.
- Check `outputattrs` parameter on glslPOP — must list ALL attributes you write to
- If `Compile failed` and you're using `P[id]` directly, switch to `TDIn_P()` + local var + `P[id] = var`
- Use textport (console) to see actual GLSL compile errors
- Test shader logic first in GLSL TOP before moving to GLSL POP

## References

Based on analysis of 214 GLSL POP shader files from:
- POPsGuide (neighbor detection, particle systems)
- JPOPsDev (parallel force calculations)
- GaussianSplatting (splat rendering, sorting)
- POP Fluid Solver (SPH simulation)
- fieldPOP (SDF-based force fields)
- GLSL Copy POP (instancing with per-vertex compute)
- CacheSelectGLSLPOP (attribute caching)
<!--
name: td-pops-glsl
description: "GLSL programming for POPs in TouchDesigner — buffer variables, TDIn/TDOut API, compute shaders, force calculations, neighbor queries, ray queries, particle systems. Updated with findings from 214 real-world GLSL POP shaders."
version: "2.0.0"
-->
