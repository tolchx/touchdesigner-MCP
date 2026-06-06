# Phased Blending

## Pattern: Temporal State Blending with Phases

## Operators
- Sphere POP (state A: initial positions)
- Sphere POP (state B: target positions)
- Attribute POP (create: blendFactor, phase)
- GLSL POP (phase-based interpolation)
- Feedback POP (persistent blend state)
- Noise POP (organic variation)
- Render POP → Point MAT

## Connections
1. Sphere POP A → Attribute POP (blend)
2. Sphere POP B → Attribute POP (blend)
3. Attribute POP → GLSL POP (phase interpolate)
4. GLSL POP → Feedback POP
5. Feedback POP → GLSL POP (loop)
6. GLSL POP → Noise POP
7. Noise POP → Render POP

## Parameters
- Sphere A: radius=2, numPoints=1000
- Sphere B: radius=3, numPoints=1000
- Phase speed: 0.01-0.05
- Blend easing: ease-in-out
- Feedback blend: 0.98

## GLSL Phase Interpolation
```glsl
uniform float uPhaseSpeed, uTime;

void main() {
    int id = gl_VertexID;
    vec3 posA = posAAttr[id];
    vec3 posB = posBAttr[id];

    // Per-point phase offset
    float phase = fract(uTime * uPhaseSpeed + float(id) * 0.001);

    // Eased interpolation
    float t = phase;
    t = t * t * (3.0 - 2.0 * t); // smoothstep easing

    vec3 pos = mix(posA, posB, t);
    P[id] = pos;

    // Color by phase
    Cd[id] = vec4(mix(vec3(1,0,0), vec3(0,0,1), t), 1.0);
}
```

## Notes
- Phase offsets create wave-like transitions
- Easing functions control interpolation curve
- Useful for: morphing, transitions, generative art
- 4 versions in Toe_Expand: base, v.2, .4, .5
