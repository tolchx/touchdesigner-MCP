# Grid-Based Fluid Solver (Eulerian)

## Pattern: Navier-Stokes on GPU via GLSL

## Operators
- Grid POP (velocity field, 256×256)
- GLSL TOP (advection pass)
- GLSL TOP (diffusion pass / Jacobi)
- GLSL TOP (divergence computation)
- GLSL TOP (pressure solve, N iterations)
- GLSL TOP (gradient subtraction)
- Feedback TOP (velocity field buffer)
- Feedback TOP (pressure field buffer)
- Noise TOP (external force injection)
- Composite TOP (visualize velocity)
- Render TOP → Null TOP

## Pipeline (per frame)
```
Forces → Advection → Diffusion → Divergence → Pressure(N×) → Gradient Sub → Velocity'
                                              ↑                    ↓
                                         Feedback POP      Pressure Feedback
```

## Parameters
- Grid Resolution: 256×256
- Jacobi Iterations: 40-80
- Viscosity: 0.001
- Time Step: 0.05
- Pressure Tolerance: 0.0001

## GLSL Advection (Semi-Lagrangian)
```glsl
uniform sampler2D uVelocity;
uniform float uDt;
uniform vec2 uTexelSize;

void main() {
    vec2 uv = gl_FragCoord.xy * uTexelSize;
    vec2 vel = texture(uVelocity, uv).xy;
    vec2 prevUV = uv - vel * uDt * uTexelSize;
    fragColor = texture(uVelocity, prevUV);
}
```

## GLSL Divergence
```glsl
uniform sampler2D uVelocity;
uniform float uHalfInvDx;

void main() {
    vec2 uv = gl_FragCoord.xy * uTexelSize;
    float vR = texture(uVelocity, uv + vec2(uTexelSize.x, 0)).x;
    float vL = texture(uVelocity, uv - vec2(uTexelSize.x, 0)).x;
    float vU = texture(uVelocity, uv + vec2(0, uTexelSize.y)).y;
    float vD = texture(uVelocity, uv - vec2(0, uTexelSize.y)).y;
    fragColor = vec4(uHalfInvDx * (vR - vL + vU - vD), 0, 0, 1);
}
```

## GLSL Pressure Jacobi
```glsl
uniform sampler2D uPressure, uDivergence;
uniform float uRBeta;

void main() {
    vec2 uv = gl_FragCoord.xy * uTexelSize;
    float pL = texture(uPressure, uv - vec2(uTexelSize.x, 0)).x;
    float pR = texture(uPressure, uv + vec2(uTexelSize.x, 0)).x;
    float pU = texture(uPressure, uv + vec2(0, uTexelSize.y)).x;
    float pD = texture(uPressure, uv - vec2(0, uTexelSize.y)).x;
    float div = texture(uDivergence, uv).x;
    fragColor = vec4((pL + pR + pU + pD - div) * uRBeta, 0, 0, 1);
}
```

## GLSL Gradient Subtraction
```glsl
uniform sampler2D uVelocity, uPressure;
uniform float uHalfInvDx;

void main() {
    vec2 uv = gl_FragCoord.xy * uTexelSize;
    float pL = texture(uPressure, uv - vec2(uTexelSize.x, 0)).x;
    float pR = texture(uPressure, uv + vec2(uTexelSize.x, 0)).x;
    float pU = texture(uPressure, uv + vec2(0, uTexelSize.y)).x;
    float pD = texture(uPressure, uv - vec2(0, uTexelSize.y)).x;
    vec2 vel = texture(uVelocity, uv).xy;
    vel -= uHalfInvDx * vec2(pR - pL, pU - pD);
    fragColor = vec4(vel, 0, 1);
}
```

## Notes
- Jacobi iterations: 20-80 (más = más preciso, más lento)
- Feedback TOP con blend=1.0 para campos persistentes
- Temperature coupling: campo adicional para buoyancy
- Visualización: mapear velocity magnitude a color con Ramp TOP
