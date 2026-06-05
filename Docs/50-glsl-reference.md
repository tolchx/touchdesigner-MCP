# GLSL Reference for POPs

## Architecture
- GLSL 4.60 compute shaders
- SSBOs for buffer access
- Zero-Copy: attributes passed by pointer
- SoA (Struct of Arrays) for memory coalescence

## Golden Rule: Read-Modify-Write

### INCORRECT
```glsl
P[id].x += sin(time) * amplitude; // FAILS: P is write-only
```

### CORRECT
```glsl
vec3 pos = TDIn_P(id);           // 1. READ to local
pos.x += sin(time) * amplitude;  // 2. MODIFY local
P[id] = pos;                     // 3. WRITE once
```

## Read Functions
| Function | Returns |
|----------|----------|
| TDIn_P(id) | Position (vec3) |
| TDIn_Vel(id) | Velocity (vec3) |
| TDIn_Cd(id) | Color (vec4) |
| TDIn_N(id) | Normal (vec3) |
| TDIn_uv(id) | UV coords (vec2) |
| TDIn_pscale(id) | Size (float) |
| TDIn_age(id) | Age (float) |
| TDIn_life(id) | Max life (float) |

## Write Variables
| Variable | Type |
|----------|------|
| P[id] | vec3 (position) |
| Vel[id] | vec3 (velocity) |
| Cd[id] | vec4 (color) |

## Shader Patterns

### Noise Displacement
```glsl
uniform float uAmplitude = 1.0;
uniform float uFrequency = 0.5;
uniform float uTime = 0.0;
void main() {
    int id = gl_VertexID;
    vec3 pos = TDIn_P(id);
    float n = snoise(pos * uFrequency + uTime);
    pos += TDIn_N(id) * n * uAmplitude;
    P[id] = pos;
}
```

### Curl Noise (Fluids)
```glsl
vec3 curlNoise(vec3 p) {
    const float e = 0.01;
    // ... compute curl ...
    return normalize(vec3(x, y, z)) / (2.0 * e);
}
void main() {
    int id = gl_VertexID;
    vec3 pos = TDIn_P(id);
    vec3 vel = TDIn_Vel(id);
    vec3 curl = curlNoise(pos * frequency + time * speed);
    vel += curl * amplitude * uDT;
    P[id] = pos + vel * uDT;
    Vel[id] = vel * damping;
}
```

### Color by Age
```glsl
void main() {
    int id = gl_VertexID;
    float normAge = TDIn_age(id) / TDIn_life(id);
    vec3 c1 = vec3(1.0, 0.2, 0.0);
    vec3 c2 = vec3(0.0, 0.2, 1.0);
    vec3 color = mix(c1, c2, normAge);
    float alpha = 1.0 - smoothstep(0.8, 1.0, normAge);
    Cd[id] = vec4(color, alpha);
}
```

### Neighbor Detection (SDF)
```glsl
void main() {
    int id = gl_VertexID;
    vec3 pos = TDIn_P(id);
    vec3 force = vec3(0.0);
    for (int i = 0; i < numPoints; i++) {
        if (i == id) continue;
        float dist = distance(pos, TDIn_P(i));
        if (dist < radius) {
            force += normalize(pos - TDIn_P(i)) * (radius - dist);
        }
    }
    P[id] = pos + force * strength * uDT;
}
```

### Atomic Operations
```glsl
layout(std430, binding = 0) buffer Counter { int counter; };
void main() {
    if (collision) {
        int idx = atomicAdd(counter, 1);
        collisions[idx] = pos;
    }
}
```

## Precision Guidelines
| Type | Precision | Use |
|------|-----------|-----|
| lowp | 8-bit | Flags, simple ops |
| mediump | 16-bit | Color, UVs |
| highp | 32-bit | Position, critical math |

## Debugging
1. Check textport for GLSL compile errors
2. Recreate operator if compute DAT corrupted
3. Verify outputattrs includes all written attributes
4. Use td_healthcheck after shader changes
