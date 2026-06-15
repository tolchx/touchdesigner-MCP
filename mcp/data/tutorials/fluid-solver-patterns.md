# Fluid Solver Patterns — TouchDesigner POPs + GLSL

> **Source:** 8 Toe_Expand projects: POP Fluid Solver (Example, Technical, A/B/C/D), God Rays + Fluid (High/Low Perf)

---

## 1. General Fluid Solver Architecture

The fluid solver implements a grid-based (Eulerian) simulation using POPs + GLSL compute.

### Computation Pipeline (per frame)

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│  addForces   │ ──→ │  Advection   │ ──→ │  Diffusion   │
│  (external)  │     │  (velocity)  │     │  (viscosity) │
└─────────────┘     └──────────────┘     └──────────────┘
                                                 │
                                                ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Gradient   │ ←── │   Pressure   │ ←── │  Divergence  │
│  Subtraction │     │  Jacobi (N×) │     │              │
└──────────────┘     └──────────────┘     └──────────────┘
        │
        ▼
┌──────────────┐
│ Corrected    │ ──→ [Feedback] → next frame
│ Velocity     │
└──────────────┘
```

### Data Fields

| Field | Type | Description |
|-------|------|-------------|
| Velocity (u) | vec2/vec3 | Velocity field |
| Pressure (p) | float | Pressure field |
| Divergence | float | Velocity field divergence |
| Temperature | float | Temperature field (optional) |
| Density | float | Fluid density (optional) |

---

## 2. GLSL Shaders for the Pipeline

### 2.1 Advection
Transport a field by the velocity field. Uses Semi-Lagrangian method (tracing rays backward).

```glsl
uniform sampler2D uVelocity;
uniform sampler2D uSource;
uniform float uDt;
uniform vec2 uTexelSize;

void main() {
    vec2 uv = gl_FragCoord.xy * uTexelSize;
    vec2 vel = texture(uVelocity, uv).xy;
    vec2 prevUV = uv - vel * uDt * uTexelSize;
    fragColor = texture(uSource, prevUV);
}
```

### 2.2 Diffusion (Viscosity)
Jacobi iteration for diffusion.

```glsl
uniform sampler2D uField;
uniform float uAlpha;  // dt * viscosity / (dx * dx)
uniform float uRBeta;  // 1 / (4 + alpha)

void main() {
    vec2 uv = gl_FragCoord.xy * uTexelSize;
    vec4 center = texture(uField, uv);
    vec4 left = texture(uField, uv - vec2(uTexelSize.x, 0));
    vec4 right = texture(uField, uv + vec2(uTexelSize.x, 0));
    vec4 up = texture(uField, uv + vec2(0, uTexelSize.y));
    vec4 down = texture(uField, uv - vec2(0, uTexelSize.y));
    fragColor = (left + right + up + down + uAlpha * center) * uRBeta;
}
```

### 2.3 Divergence
Calculate the divergence of the velocity field.

```glsl
uniform sampler2D uVelocity;
uniform float uHalfInvDx;

void main() {
    vec2 uv = gl_FragCoord.xy * uTexelSize;
    float vRight = texture(uVelocity, uv + vec2(uTexelSize.x, 0)).x;
    float vLeft = texture(uVelocity, uv - vec2(uTexelSize.x, 0)).x;
    float vUp = texture(uVelocity, uv + vec2(0, uTexelSize.y)).y;
    float vDown = texture(uVelocity, uv - vec2(0, uTexelSize.y)).y;
    fragColor = vec4(uHalfInvDx * (vRight - vLeft + vUp - vDown), 0, 0, 1);
}
```

### 2.4 Pressure Jacobi
Iterative pressure solver (N iterations per frame).

```glsl
uniform sampler2D uPressure;
uniform sampler2D uDivergence;
uniform float uRBeta;

void main() {
    vec2 uv = gl_FragCoord.xy * uTexelSize;
    float pLeft = texture(uPressure, uv - vec2(uTexelSize.x, 0)).x;
    float pRight = texture(uPressure, uv + vec2(uTexelSize.x, 0)).x;
    float pUp = texture(uPressure, uv + vec2(0, uTexelSize.y)).x;
    float pDown = texture(uPressure, uv - vec2(0, uTexelSize.y)).x;
    float div = texture(uDivergence, uv).x;
    fragColor = vec4((pLeft + pRight + pUp + pDown - div) * uRBeta, 0, 0, 1);
}
```

### 2.5 Gradient Subtraction
Correct velocity using the pressure gradient.

```glsl
uniform sampler2D uVelocity;
uniform sampler2D uPressure;
uniform float uHalfInvDx;

void main() {
    vec2 uv = gl_FragCoord.xy * uTexelSize;
    float pLeft = texture(uPressure, uv - vec2(uTexelSize.x, 0)).x;
    float pRight = texture(uPressure, uv + vec2(uTexelSize.x, 0)).x;
    float pUp = texture(uPressure, uv + vec2(0, uTexelSize.y)).x;
    float pDown = texture(uPressure, uv - vec2(0, uTexelSize.y)).x;
    vec2 vel = texture(uVelocity, uv).xy;
    vel -= uHalfInvDx * vec2(pRight - pLeft, pUp - pDown);
    fragColor = vec4(vel, 0, 1);
}
```

---

## 3. Project Variants

### Simple Projects (Example, A/B)
- Velocity + pressure only (no temperature)
- Jacobi iterations: 20-40
- Grid resolution: 128-256

### Technical Projects (Technical, C/D)
- Velocity + pressure + temperature + density
- Temperature affects velocity (buoyancy)
- Jacobi iterations: 40-80
- Grid resolution: 256-512

### God Rays + Fluid
- Adds light scattering through density field
- High Performance: simplified scattering, fewer iterations
- Low Performance: full scattering, more iterations
- Post-process: blur + composite

---

## 4. Connection Patterns

### Feedback Loop Core
```
Frame N: Vel Field → [Advection → Diffusion → Div → Pressure(N×) → Gradient] → Vel Field N+1
                                          ↓
                                    Pressure Field → Feedback POP
```

### Temperature Coupling
```
Temp Field → [Advection_Temp → Diffusion_Temp] → Temp Field'
                                                      ↓
                                          Buoyancy Force (density - temp)
                                                      ↓
                                          addForces → Velocity Field
```

---

## 5. Key Parameters

| Parameter | Typical Range | Effect |
|-----------|--------------|--------|
| Jacobi Iterations | 20-80 | More = more accurate, slower |
| Viscosity | 0.0001-0.01 | More = thicker fluid |
| Diffusion Rate | 0.1-1.0 | Field propagation speed |
| Buoyancy Strength | 0.5-2.0 | Floating force |
| Grid Resolution | 128-512 | Simulation resolution |
| Time Step | 0.01-0.1 | Simulation speed |

---

## 6. Multi-Pass Feedback in TD

### Ping-Pong Buffering
```glsl
// Read previous frame state
uniform sampler2D sPreviousFrame;

void main() {
    vec2 uv = gl_FragCoord.xy * uTexelSize;
    vec4 prevState = texture(sPreviousFrame, uv);
    vec4 newState = computeNewState(prevState);
    fragColor = mix(prevState, newState, uBlendFactor);
}
```

### Color Buffer Offloading
```
Pass 1: Generate noise data → texture
Pass 2: Read texture via sampler2D → displace geometry
```

---

## 7. Performance Tips

| Technique | When to Use |
|-----------|-------------|
| Shared memory | Neighbor search within workgroup |
| Texture fetch | Large datasets (positions, velocities) |
| Minimal branching | Always — use smoothstep instead of if/else |
| Reduce Jacobi iterations | When real-time performance is critical |
| Lower grid resolution | When visual quality is less important |
| Half precision | For non-critical fields (density, temperature) |
