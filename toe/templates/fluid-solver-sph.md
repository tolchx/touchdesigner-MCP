# SPH Fluid Solver

## Pattern: Smoothed Particle Hydrodynamics

## Operators
- Point Generator POP (particle source, 5000-10000 points)
- Attribute POP (create: density, pressure, viscosity)
- GLSL POP (density computation via neighbor search)
- GLSL POP (pressure force from density gradient)
- GLSL POP (viscosity force from velocity diffusion)
- Force Radial POP (external attractors/repellers)
- Drag POP (damping)
- Particle POP (integration solver)
- Trail POP (flow visualization)
- Render POP → Point MAT

## Connections
1. Point Generator POP → Attribute POP
2. Attribute POP → GLSL POP (density)
3. GLSL POP → GLSL POP (pressure)
4. GLSL POP → GLSL POP (viscosity)
5. GLSL POP → Force Radial POP
6. Force Radial POP → Drag POP
7. Drag POP → Particle POP
8. Particle POP → Trail POP
9. Trail POP → Render POP

## Parameters
- Point Generator: rate=5000, life=-1 (infinite), radius=2
- Density GLSL: smoothingRadius=0.5, kernel=Poly6
- Pressure GLSL: gasConstant=200, restDensity=1.0
- Viscosity GLSL: viscosityCoeff=0.01
- Drag: amount=0.01
- Particle POP: gravity=-9.8, substeps=4
- Trail: length=20

## GLSL Density Compute
```glsl
uniform float uSmoothingRadius;
const float PI = 3.14159265;

float poly6(float r, float h) {
    if (r >= h) return 0.0;
    return 315.0 / (64.0 * PI * pow(h, 9.0)) * pow(h*h - r*r, 3.0);
}

layout(location = 8) out float densityAttr;

void main() {
    int id = gl_VertexID;
    vec3 pos = TDIn_P(id);
    float density = 0.0;
    for (int i = 0; i < TD_NUM_POINTS; i++) {
        float d = distance(pos, TDIn_P(i));
        density += poly6(d, uSmoothingRadius);
    }
    densityAttr[id] = density;
}
```

## GLSL Pressure Force
```glsl
uniform float uGasConstant, uRestDensity;


void main() {
    int id = gl_VertexID;
    vec3 pos = TDIn_P(id);
    float pI = max(0.0, (densityAttr[id] - uRestDensity) * uGasConstant);
    vec3 force = vec3(0.0);
    for (int i = 0; i < TD_NUM_POINTS; i++) {
        if (i == id) continue;
        float d = distance(pos, TDIn_P(i));
        if (d < uSmoothingRadius && d > 0.001) {
            float pJ = max(0.0, (densityAttr[i] - uRestDensity) * uGasConstant);
            force += normalize(pos - TDIn_P(i)) * (pI + pJ) / (2.0 * densityAttr[i]);
        }
    }
    P[id] = pos + force * 0.001;
}
```

## Notes
- SPH es O(n²) — usar Neighbor POP o grid-based acceleration para >5000 puntos
- Substeps (4-8) mejoran estabilidad
- Kernel Poly6 para densidad, Spiky para gradiente de presión
- Viscosity using viscosity kernel o simple velocity averaging
