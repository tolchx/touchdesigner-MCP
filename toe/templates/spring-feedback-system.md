# Spring Feedback System

## Pattern: Spring Constraints with Feedback Loop

## Operators
- Sphere POP (rest positions)
- Attribute POP (create: velocity, springForce)
- GLSL POP (spring force computation)
- Drag POP (damping)
- Feedback POP (persistent state)
- Particle POP (integration)
- Null POP (inspection)
- Render POP → Point MAT

## Connections
1. Sphere POP → Attribute POP
2. Attribute POP → GLSL POP (springs)
3. GLSL POP → Drag POP
4. Drag POP → Particle POP
5. Particle POP → Feedback POP
6. Feedback POP → GLSL POP (loop)
7. Particle POP → Render POP

## Parameters
- Sphere POP: radius=2, type=point, numPoints=500
- Spring stiffness: 0.1-0.5
- Spring damping: 0.01-0.05
- Drag: 0.05-0.1
- Feedback blend: 0.95-0.98

## GLSL Spring Force
```glsl
uniform float uStiffness, uDamping;
uniform sampler2D uRestPositions;

void main() {
    int id = gl_VertexID;
    vec3 pos = TDIn_P(id);
    vec3 rest = texelFetch(uRestPositions, ivec2(id, 0), 0).xyz;
    vec3 vel = TDIn_V(id);

    // Spring force toward rest position
    vec3 springForce = (rest - pos) * uStiffness;

    // Damping
    vec3 dampingForce = -vel * uDamping;

    vec3 totalForce = springForce + dampingForce;
    vel += totalForce * uDT;
    pos += vel * uDT;

    P[id] = pos;
    V[id] = vel;
}
```

## Notes
- Rest positions stored in Feedback POP initial state
- Stiffness controls how fast points return to rest
- Damping prevents oscillation
- Useful for: organic deformations, cloth simulation, soft bodies
