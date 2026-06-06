# GLSL Compute Pipeline

## Pattern: Multi-stage GPU Compute for POPs

## Operators
- Source POP (point generator / geometry)
- GLSL Advanced POP (stage 1: transform)
- GLSL Advanced POP (stage 2: force apply)
- GLSL Advanced POP (stage 3: color/attribute)
- Feedback POP (loop for iterative computation)
- Null POP (inspection endpoint)
- Render POP → Point MAT

## Pipeline
```
Source → GLSL Transform → GLSL Forces → GLSL Color → Feedback → GLSL Transform → ...
                                ↑                                              ↓
                                └──────────────────────────────────────────────┘
```

## Parameters
- GLSL Stage 1: transform (noise displacement, bends, scaling)
- GLSL Stage 2: forces (attraction, repulsion, curl noise)
- GLSL Stage 3: color (age-based, attribute-based)
- Feedback: blend=0.95 (decay rate)

## GLSL Stage 1: Noise Displacement
```glsl
uniform float uAmplitude, uSpeed, uFrequency;
uniform float uDT;

void main() {
    int id = gl_VertexID;
    vec3 pos = TDIn_P(id);
    vec3 n = tdnoise(pos * uFrequency + absTime.x * uSpeed);
    pos += n * uAmplitude;
    P[id] = pos;
}
```

## GLSL Stage 2: Attraction + Repulsion
```glsl
uniform vec3 uAttractCenter;
uniform float uAttractRadius, uAttractStrength;
uniform float uRepelRadius, uRepelStrength;

void main() {
    int id = gl_VertexID;
    vec3 pos = TDIn_P(id);
    vec3 toCenter = uAttractCenter - pos;
    float distToCenter = length(toCenter);
    vec3 force = vec3(0.0);

    // Attraction
    if (distToCenter < uAttractRadius) {
        force += normalize(toCenter) * uAttractStrength;
    }

    // Repulsion from neighbors
    for (int i = 0; i < TD_NUM_POINTS; i++) {
        if (i == id) continue;
        vec3 other = TDIn_P(i);
        float d = distance(pos, other);
        if (d < uRepelRadius && d > 0.001) {
            force += normalize(pos - other) * (1.0 - d/uRepelRadius) * uRepelStrength;
        }
    }

    vec3 vel = TDIn_V(id) + force * uDT;
    P[id] = pos + vel * uDT;
    V[id] = vel;
}
```

## GLSL Stage 3: Color by Age
```glsl
uniform vec3 uColorA, uColorB;

void main() {
    int id = gl_VertexID;
    float age = TDIn_Age(id);
    float life = TDIn_Life(id);
    float t = clamp(age / max(life, 0.001), 0.0, 1.0);
    vec3 col = mix(uColorA, uColorB, t);
    Cd[id] = vec4(col, 1.0 - t * 0.5);
}
```

## Notes
- Cada GLSL stage es un compute pass independiente
- Feedback POP permite iteración multi-frame
- Para performance: reducir TD_NUM_POINTS o usar shared memory
- Verificar compile errors en Textport después de cada shader
