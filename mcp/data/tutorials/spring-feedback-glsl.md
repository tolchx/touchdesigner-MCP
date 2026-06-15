---
title: "Simulación de Resortes con GLSL y Feedback"
category: "glsl"
difficulty: "advanced"
keywords: ["glsl", "spring", "feedback", "mass", "gpu", "compute", "pops", "simulation"]
duration: "40 min"
requires_td: true
---

# Simulación de Resortes con GLSL y Feedback

Implementa un sistema masa-resorte completo en GPU usando GLSL Compute POPs con feedback loop para simulación incremental de física. Basado en el patrón SpringFeedbackPOP.

## Requisitos

- TouchDesigner (cualquier licencia con POPs)
- GPU con soporte GLSL (NVIDIA/AMD, 6 GB+ VRAM)
- Conocimientos básicos de GLSL y POPs

## Arquitectura del sistema

```
circle1 (fuente) → attribute2 (definir attrs) → glsl1 (compute) → null1 (feedback)
     ↑                        ↑                        ↑
     |                   attrib_createVel          glsl1_compute
     |                                                |
     └────────────── feedback1 (loop) ←───────────────┘
                                                        |
                                              sphere1 → transform2 (objetivos)
                                                        ↓
                                                    render1
```

## Paso 1: Crear la geometría base

1. Crea un **circle POP** (nómbralo `circle1`)
2. Configura:
   - Type: `NGon`
   - Divisions: `100` (número de puntos)
3. Crea un **sphere POP** (nómbralo `sphere1`) como objetivo dinámico
   - Radius: `2`

## Paso 2: Definir atributos de simulación

1. Crea un **attribute POP** (nómbralo `attribute2`)
   - Conecta `circle1` como input
   - Define atributo `P` (posición) — ya existe por defecto
2. Crea un **attribCreate POP** (nómbralo `attrib_createVel`)
   - Conecta `attribute2` como input
   - Nombre: `Vel`
   - Tipo: `Vector` (XYZ)
   - Valor: `(0, 0, 0)` (velocidad inicial cero)

## Paso 3: Escribir el GLSL Compute

1. Crea un **GLSL POP** (nómbralo `glsl1`)
2. Crea un **DAT text** (nómbralo `glsl1_compute`) y pégale este código:

```glsl
// Spring-Mass GPU Compute Shader
// Parámetros uniformes
uniform float uTimeStep;   // Paso de tiempo (0.016 ≈ 60fps)
uniform float uStiffness;  // Rigidez del resorte (0.5-5.0)
uniform float uDamping;    // Amortiguamiento (0.9-0.99)
uniform float uMass;       // Masa de cada punto (1.0)

// Inputs
layout(location = 0) in vec3 P;      // Posición actual
layout(location = 1) in vec3 Vel;    // Velocidad actual
layout(location = 2) in vec3 Target; // Posición objetivo

// Outputs
layout(location = 0) out vec3 outP;
layout(location = 1) out vec3 outVel;

void main()
{
    // Fuerza del resorte: F = -k * (P - Target)
    vec3 displacement = P - Target;
    vec3 springForce = -uStiffness * displacement;

    // Fuerza de amortiguamiento: F_d = -damping * Vel
    vec3 dampingForce = -uDamping * Vel;

    // Aceleración: a = F / m
    vec3 acceleration = (springForce + dampingForce) / uMass;

    // Integración Verlet / Euler sem implícito
    vec3 newVel = Vel + acceleration * uTimeStep;
    vec3 newP = P + newVel * uTimeStep;

    outP = newP;
    outVel = newVel;
}
```

3. En el GLSL POP `glsl1`, configura:
   - Compute DAT: `glsl1_compute`
   - Input Attributes: `P`, `Vel`, `Target`
   - Output Attributes: `P`, `Vel`
   - Dispatch: `Points`

## Paso 4: Cerrar el feedback loop

1. Crea un **feedback POP** (nómbralo `feedback1`)
2. Conecta la salida de `glsl1` al **segundo input** de `feedback1`
3. Crea un **null POP** (nómbralo `null1`) como salida
4. Conecta `feedback1` → `null1`
5. **Configurar el feedback loop:**
   - Selecciona `glsl1`
   - En parámetros, busca `Target Feedback Loop POP`
   - Apunta a `null1`

## Paso 5: Configurar targets dinámicos

1. Usa un **transform POP** (nómbralo `transform2`) para mover `sphere1`:
   - `tx`: `sin(absTime.seconds * 0.5) * 3`
   - `ty`: `cos(absTime.seconds * 0.7) * 2`
   - `tz`: `sin(absTime.seconds * 0.3) * 1.5`
2. Conecta el resultado a un **lookupAtt POP** o usa expresiones para mapear `sphere1` positions como `Target` attribute

## Paso 6: Renderizar

1. Crea un **render TOP** (nómbralo `render1`)
2. Conecta `null1` → **Geometry COMP** → `render1`
3. Resolución: `1280x720`
4. Material: **Line MAT** o **Phong MAT**

## Parámetros ajustables

| Parámetro | Efecto | Rango típico |
|-----------|--------|--------------|
| `uTimeStep` | Rapidez de la simulación | 0.001 - 0.05 |
| `uStiffness` | Qué tan rígido es el resorte | 0.5 - 10.0 |
| `uDamping` | Pérdida de energía | 0.9 - 0.999 |
| `uMass` | Inercia de las partículas | 0.1 - 5.0 |

## Variante: Múltiples resortes

Para crear una red de resortes (cloth simulation):

1. Usa **neighbor POP** para encontrar vecinos cercanos
2. En el GLSL, itera sobre los vecinos:
```glsl
// Para cada vecino j:
vec3 toNeighbor = P_j - P;
float dist = length(toNeighbor);
float restLength = 0.1; // Distancia de reposo
vec3 springForce_j = uStiffness * (dist - restLength) * normalize(toNeighbor);
totalForce += springForce_j;
```

## Solución de problemas

- **Partículas explotan**: Reduce `uTimeStep` o aumenta `uDamping`
- **No se mueven**: Verifica que el feedback loop apunte al null correcto
- **GLSL no compila**: Revisa que los attribute names coincidan entre POP y GLSL
- **Performance baja**: Reduce el número de puntos o simplifica el compute shader

## Consejos

- El GLSL Compute POP ejecuta en paralelo — ideal para 1000-100k puntos
- Usa `uTimeStep` en lugar de `absTime.delta` para control explícito
- El feedback loop es esencial: sin él, cada frame se reinicia
- Conecta un **Info CHOP** al `glsl1` para monitorear cook time
