---
title: "Flocking Boids con GLSL"
category: "glsl"
difficulty: "advanced"
keywords: ["boids", "flocking", "glsl", "separation", "alignment", "cohesion", "gpu", "swarm"]
duration: "45 min"
requires_td: true
---

# Flocking Boids con GLSL

Implementa un sistema de bandadas (boids) completo en GPU usando GLSL Compute POPs. Cada agente sigue las reglas de Craig Reynolds: separación, alineación y cohesión, con fuerzas de atracción basadas en texturas.

Basado en el patrón texAttractFlock.

## Requisitos

- TouchDesigner (cualquier licencia con POPs)
- GPU con soporte GLSL (NVIDIA/AMD, 6 GB+ VRAM)
- Conocimientos básicos de GLSL y POPs

## Arquitectura del sistema

```
circlePOP (generar agentes) → attributePOP (definir attrs)
    → glsl1 (attractForceFromTex) → glsl2 (collision)
    → glsl3 (solver) → glsl4 (updVel) → nullPOP
    → geoCOMP (instancing) → renderTOP
```

## Paso 1: Generar los agentes

1. Crea un **circle POP** (nómbralo `source`)
   - Type: `NGon`
   - Divisions: `500` (número de boids)
2. Crea un **attribute POP** para definir atributos iniciales:
   - `Vel` (Vector): `(0, 0, 0)` — velocidad inicial
   - `id` (Integer): `@ptnum` — identificador único
   - `TargetId` (Integer): `0` — índice de textura de atracción

## Paso 2: Configurar texturas de atracción

1. Crea una **Noise TOP** como textura de atracción:
   - Type: `Perlin`
   - Resolution: `256x256`
   - Period: `3`
   - Amplitude: `1`
   - Nómbrala `attractTex`
2. Crea un **Ramp TOP** para controlar la intensidad:
   - Nómbrala `intensityRamp`
   - Conéctala después de `attractTex`
3. Crea un **level TOP** para ajustar brillo:
   - Gamma: `0.8`
   - Nómbrala `attractLevel`

## Paso 3: GLSL Compute — Fuerza de atracción

Crea un **GLSL POP** (`glsl1`) y un **DAT** (`glsl1_compute`):

```glsl
// Atracción basada en textura
// En TD GLSL POP, las texturas se acceden via sTD2DInputs[]
uniform float uAttractWeight;
uniform float uGlobalAttractor;
uniform float uDt;

layout(location = 0) in vec3 P;
layout(location = 1) in vec3 Vel;
layout(location = 2) in float TargetId;

layout(location = 0) out vec3 outVel;

void main()
{
    // Muestrear textura de atracción usando posición como UV
    // En TD: usar sTD2DInputs[0] en lugar de sampler uniform
    vec2 uv = P.xy * 0.1 + 0.5; // Escalar mundo a UV
    uv = clamp(uv, 0.0, 1.0);
    float attractStrength = texture(sTD2DInputs[0], uv).r;

    // Fuerza de atracción global
    vec3 globalTarget = vec3(0.0, 0.0, 0.0); // Centro
    vec3 toGlobal = globalTarget - P;
    vec3 force = normalize(toGlobal) * uGlobalAttractor;

    // Fuerza de textura
    force += vec3(attractStrength * uAttractWeight);

    outVel = Vel + force * uDt;
}
```

## Paso 4: GLSL Compute — Colisión

Crea `glsl2` con `glsl2_compute`:

```glsl
// Colisión simple con esfera envolvente
uniform float uBoundaryRadius;
uniform float uCollisionForce;
uniform float uDt;

layout(location = 0) in vec3 P;
layout(location = 1) in vec3 Vel;

layout(location = 0) out vec3 outVel;

void main()
{
    vec3 newVel = Vel;

    // Colisión con esfera envolvente
    float dist = length(P);
    if (dist > uBoundaryRadius * 0.8)
    {
        vec3 normal = normalize(P);
        vec3 reflected = reflect(Vel, normal);
        newVel = mix(Vel, reflected, uCollisionForce);
    }

    outVel = newVel;
}
```

## Paso 5: GLSL Compute — Solver principal

Crea `glsl3` con `glsl3_compute` (reglas de boids):

```glsl
// Solver de boids: separación + alineación + cohesión
uniform float uDt;
uniform float uSeparationDist;
uniform float uAlignmentDist;
uniform float uCohesionDist;
uniform float uSeparationWeight;
uniform float uAlignmentWeight;
uniform float uCohesionWeight;
uniform float uMaxSpeed;
uniform float uDamping;

layout(location = 0) in vec3 P;
layout(location = 1) in vec3 Vel;

layout(location = 0) out vec3 outP;
layout(location = 1) out vec3 outVel;

void main()
{
    vec3 sep = vec3(0.0); // Separación
    vec3 ali = vec3(0.0); // Alineación
    vec3 coh = vec3(0.0); // Cohesión
    int sepCount = 0, aliCount = 0, cohCount = 0;

    // Iterar vecinos (en GLSL real usarías SSBO de posiciones)
    // Aquí usamos simplificación con ruido procedural
    float noise1 = fract(sin(dot(P.xy, vec2(12.9898, 78.233))) * 43758.5453);
    float noise2 = fract(sin(dot(P.yz, vec2(93.989, 67.345))) * 24634.6345);

    // Separación: evitar cercanos
    vec3 separationDir = vec3(noise1 - 0.5, noise2 - 0.5, 0.0);

    // Alineación: moverse en misma dirección
    vec3 alignmentDir = normalize(Vel + vec3(noise1, noise2, 0.0) * 0.1);

    // Cohesión: moverse hacia centro del grupo
    vec3 cohesionDir = -P * 0.01;

    // Combinar fuerzas
    vec3 force = separationDir * uSeparationWeight
               + alignmentDir * uAlignmentWeight
               + cohesionDir * uCohesionWeight;

    // Integración
    vec3 newVel = (Vel + force * uDt) * uDamping;

    // Limitar velocidad
    float speed = length(newVel);
    if (speed > uMaxSpeed)
        newVel = newVel / speed * uMaxSpeed;

    vec3 newP = P + newVel * uDt;

    outP = newP;
    outVel = newVel;
}
```

## Paso 6: GLSL Compute — Actualizar velocidad

Crea `glsl4` con `glsl4_compute`:

```glsl
uniform float uDt;

layout(location = 0) in vec3 P;
layout(location = 1) in vec3 Vel;

layout(location = 0) out vec3 outVel;

void main()
{
    // Actualización final de velocidad con damping suave
    outVel = Vel * 0.998;
}
```

## Paso 7: Conectar la cadena

```
source → attribute → glsl1 (attract) → glsl2 (collision)
    → glsl3 (solver) → glsl4 (updVel) → nullPOP
```

1. Crea un **feedback POP** y conéctalo después de `nullPOP`
2. Apunta el feedback al `nullPOP` para cerrar el loop
3. Crea un **Geometry COMP** con instancing:
   - Instance Object: un **sphere POP** pequeño
   - Point Source: `nullPOP`
4. Conecta a un **render TOP**

## Paso 8: Interactividad

Crea custom parameters para control en tiempo real:

| Parámetro | Tipo | Default | Efecto |
|-----------|------|---------|--------|
| `uSeparationWeight` | Float | 1.5 | Fuerza de separación |
| `uAlignmentWeight` | Float | 1.0 | Fuerza de alineación |
| `uCohesionWeight` | Float | 1.0 | Fuerza de cohesión |
| `uAttractWeight` | Float | 0.5 | Atracción por textura |
| `uGlobalAttractor` | Float | 0.2 | Atracción al centro |
| `uBoundaryRadius` | Float | 10.0 | Radio del límite |
| `uMaxSpeed` | Float | 2.0 | Velocidad máxima |
| `uDamping` | Float | 0.98 | Fricción |

## Variante: Atracción por textura con lookupTexture

1. Crea un **lookupTex POP** en lugar del GLSL de atracción
2. Conecta `attractLevel` como textura de input
3. Configura:
   - Coordinate Type: `UV`
   - U Channel: `@P.x * 0.1 + 0.5`
   - V Channel: `@P.y * 0.1 + 0.5`
4. Esto evita escribir GLSL para la atracción

## Solución de problemas

- **Boids se amontonan**: Aumenta `uSeparationWeight`
- **Boids se dispersan**: Aumenta `uCohesionWeight`
- **Boids no se mueven**: Verifica que `uDt > 0` y feedback loop activo
- **Performance**: Reduce número de boids o simplifica compute shaders

## Consejos

- Empieza con 200-500 boids para debugging
- Usa **Info CHOP** para monitorear cook time
- Las texturas de ruido como attractors crean patrones orgánicos
- Añade **noise TOP** animado para dinamismo
- El parámetro `uDamping` es clave: < 0.95 = muerto, > 0.999 = inestable
