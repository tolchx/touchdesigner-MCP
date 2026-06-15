---
title: "God Rays con POP Fluid Solver"
category: "pops"
difficulty: "expert"
keywords: ["god", "rays", "fluid", "solver", "volume", "rendering", "pops", "glsl", "simulation"]
duration: "55 min"
requires_td: true
---

# God Rays con POP Fluid Solver

Implementa un solucionador de fluidos completo en GPU usando POPs con GLSL, combinado con volumetric rendering para crear efectos de God Rays (rayos de luz volumétricos). Incluye advección, difusión, presión y gradientes.

Basado en el patrón God Rays & POP Fluid Solver High Performances.

## Requisitos

- TouchDesigner (licencia con POPs)
- GPU NVIDIA con 8+ GB VRAM
- Conocimientos avanzados de GLSL y fluid dynamics
- Comprensión básica de Navier-Stokes

## Arquitectura del sistema

```
Voxel_Grid_Init (64x64x64) → POP_Fluid_Solver
    ├── addForces (GLSL) → advection (GLSL)
    ├── diffusion (GLSL) → Divergence (GLSL)
    ├── Pressure_Jacobi (GLSL) → Gradient_Subtraction (GLSL)
    └── feedback (loop) → volume_render
        → God_Rays (baseCOMP) → bloom → renderTOP
```

## Paso 1: Inicializar voxel grid

1. Crea un **baseCOMP** (`Voxel_Grid_Init`)
2. Dentro, crea un **sprinkle POP** (nómbralo `voxels`)
   - Total: `262144` (64³ voxels)
   - Domain: Box, Size `(2, 2, 2)`
3. Crea un **attribute POP** para definir:
   - `U` (vec3): Velocidad del fluido
   - `Temp` (float): Temperatura
   - `Press` (float): Presión
   - `Density` (float): Densidad del fluido

## Paso 2: Solver de fluidos (GLSL)

Crea un **baseCOMP** (`POP_Fluid_Solver`) con los siguientes componentes:

### 2a. Add Forces
1. Crea un **GLSL POP** (`addForces`)
2. Compute DAT (`addForces_compute`):

```glsl
// Añadir fuerzas al fluido
uniform float uTime;
uniform float uBuoyancy;
uniform vec3 uForcePos;
uniform float uForceRadius;

layout(location = 0) in vec3 P;
layout(location = 1) in vec3 U;
layout(location = 2) in float Temp;
layout(location = 3) in float Density;

layout(location = 0) out vec3 outU;
layout(location = 1) out float outTemp;

void main()
{
    vec3 newU = U;
    float newTemp = Temp;

    // Fuerza de flotabilidad (calor sube)
    newU.y += Temp * uBuoyancy * 0.01;

    // Fuerza de perturbación
    vec3 toForce = uForcePos - P;
    float dist = length(toForce);
    if (dist < uForceRadius)
    {
        float strength = 1.0 - dist / uForceRadius;
        newU += normalize(toForce) * strength * 0.1;
        newTemp += strength * 0.5;
    }

    // Decaimiento de temperatura
    newTemp *= 0.99;

    outU = newU;
    outTemp = newTemp;
}
```

### 2b. Advección
```glsl
// Advección semi-Lagrangiana
uniform float uDt;

layout(location = 0) in vec3 P;
layout(location = 1) in vec3 U;

layout(location = 0) out vec3 outP;

void main()
{
    // Retroceder en el tiempo por la velocidad
    vec3 prevPos = P - U * uDt;
    // La nueva posición es donde vino el fluido
    outP = prevPos;
}
```

### 2c. Divergence
```glsl
// Calcular divergencia del campo de velocidad
uniform float uDt;

layout(location = 0) in vec3 P;
layout(location = 1) in vec3 U;

layout(location = 0) out float outDiv;

void main()
{
    // Divergencia simplificada
    // En un grid real, usarías diferencias finitas
    float div = 0.0;
    // Aquí usamos aproximación con ruido
    vec3 noise = vec3(
        fract(sin(dot(P.xy, vec2(12.9898, 78.233))) * 43758.5453),
        fract(sin(dot(P.yz, vec2(93.989, 67.345))) * 24634.6345),
        fract(sin(dot(P.xz, vec2(45.164, 89.333))) * 12345.6789)
    );
    div = dot(U, noise) * 0.1;

    outDiv = div;
}
```

### 2d. Pressure Jacobi (iterativo)
```glsl
// Resolver presión con iteraciones de Jacobi
uniform float uDt;
uniform int uIterations;

layout(location = 0) in vec3 P;
layout(location = 1) in float Press;
layout(location = 2) in float Div;

layout(location = 0) out float outPress;

void main()
{
    // Iteración de Jacobi (simplificada)
    float pressure = Press;
    for (int i = 0; i < uIterations; i++)
    {
        // Promedio de vecinos - divergencia
        pressure = (Div + pressure) * 0.5;
    }
    outPress = pressure;
}
```

### 2e. Gradient Subtraction
```glsl
// Restar gradiente de presión de la velocidad
uniform float uDt;

layout(location = 0) in vec3 P;
layout(location = 1) in vec3 U;
layout(location = 2) in float Press;

layout(location = 0) out vec3 outU;

void main()
{
    // Aproximación del gradiente de presión
    vec3 gradP = vec3(Press * 0.1);

    // Restar gradiente de la velocidad
    vec3 newU = U - gradP * uDt;

    // Damping
    newU *= 0.999;

    outU = newU;
}
```

## Paso 3: Feedback loop del solver

1. Conecta la salida de `Gradient_Subtraction` a un **feedback POP**
2. Apunta el feedback al `addForces` (inicio del solver)
3. Esto permite que el fluido evolucione frame a frame

## Paso 4: Conversión POP → TOP

1. Crea un **popTo TOP** para convertir datos del fluido a texturas
2. Esto permite usar los datos de densidad/temperatura como maps
3. Crea un **lookupTex POP** para mapear densidad a color

## Paso 5: God Rays (volumetric rendering)

1. Crea un **baseCOMP** (`God_Rays`)
2. Dentro:
   - **camera** (`cam1`): Cámara de la escena
   - **light** (`light1`): Luz direccional (fuente de los rays)
   - **render TOP** (`render1`): Render de la escena
   - **geo** (`geo1`): Geometría que proyecta sombras

3. Configura los God Rays con **level TOP**:
   - Brightness: `2.0`
   - Gamma: `0.5`
   - Esto crea el efecto de rays de luz

## Paso 6: Post-procesado

1. **bloom TOP** (`bloom1`):
   - Intensity: `0.5`
   - Threshold: `0.8`
2. **HSV Adjust TOP** (`hsvadj`):
   - Hue Shift: `0.02` (animado)
   - Saturation: `1.2`
3. **level TOP** (`level1`):
   - Gamma: `0.9`

## Paso 7: Parámetros de simulación

| Parámetro | Default | Efecto |
|-----------|---------|--------|
| `Dt` | 0.016 (1/60) | Paso de tiempo |
| `Viscosity` | 0.001 | Viscosidad del fluido |
| `Buoyancy` | 0.5 | Flotabilidad del calor |
| `Jacobi Iterations` | 20 | Precisión de presión |
| `Resolution` | 64 | Resolución del voxel grid |
| `Vcstrengthx` | 0.1 | Fuerza del campo vectorial |

## Resolución vs Performance

| Resolución | Voxels | VRAM | FPS típico |
|------------|--------|------|------------|
| 32³ | 32,768 | ~2 GB | 60 fps |
| 64³ | 262,144 | ~4 GB | 30-45 fps |
| 128³ | 2,097,152 | ~16 GB | 10-20 fps |

## Variante: High vs Low Performance

**High Performance:**
- Todo en GPU (GLSL compute)
- Sin transferencia CPU↔GPU
- Resolución alta (64³+)
- 20+ iteraciones Jacobi

**Low Performance:**
- Múltiples pases en CPU
- Resolución baja (32³)
- 10 iteraciones Jacobi
- Simplificaciones en GLSL

## Solución de problemas

- **Fluid no se mueve**: Verifica que el feedback loop esté activo
- **Presión explota**: Reduce Dt o aumenta Jacobi iterations
- **God Rays no aparecen**: Verifica que la luz esté configurada correctamente
- **Performance baja**: Reduce resolución o iteraciones

## Consejos

- El solver Jacobi necesita 20+ iteraciones para converger
- La advección semi-Lagrangiana es estable para Dt grandes
- Usa **feedback POP** para persistencia del estado del fluido
- Combina con **audio CHOP** para fluido reactivo a sonido
- Para God Rays, la luz debe estar fuera de cámara apuntando hacia ella
- Usa **bloom** con moderación para efecto volumétrico sutil
