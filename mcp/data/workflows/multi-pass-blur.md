---
title: "Multi-Pass GLSL Smooth"
category: "pops"
difficulty: "advanced"
keywords: ["glsl", "smooth", "multi-pass", "geometry", "neighbor", "iterative", "compute", "blur", "surface"]
duration: "35 min"
requires_td: true
---

# Multi-Pass GLSL Smooth

Suavizado iterativo de geometría usando GLSL compute con múltiples passes en TouchDesigner POPs. Aplica smoothing laplaciano sobre la superficie de una malla para crear efectos de relajación y deformación orgánica.

## Concepto

El suavizado multi-pass funciona promediando la posición de cada punto con sus vecinos, repitiendo el proceso N veces. Cada pass reduce el ruido en la geometría y produce un efecto de "relajación" progresiva.

```
Grid/Sphere → NoisePOP → GLSL Smooth (4 passes) → Normal → Render
                ↓
         neighbor_connected POP → glsl1_compute
                ↓
         glsl_smooth POP (npasses: 4, outputatt: P)
```

## Operadores Principales

| Operador | Tipo | Función |
|----------|------|---------|
| `grid1` | Grid SOP | Geometría base (malla) |
| `sphere1` | Sphere SOP | Geometría alternativa |
| `noise1` | NoisePOP | Deformación inicial con ruido |
| `neighbor_connected` | Neighbor POP | Calcula conexiones entre puntos |
| `glsl1_compute` | Compute DAT | Shader de smoothing laplaciano |
| `glsl_smooth` | GLSL POP | Ejecuta N passes del compute |
| `normal1` | Normal POP | Recalcula normales post-smooth |
| `replicator1` | Replicator POP | Replica instancias |

## Red de Operadores

```
grid1 (size 4x4, rows 20, cols 20)
    ↓
noise1 (translatealongnormal, me.time.seconds * 0.1)
    ↓
neighbor_connected1 (connectivity: by proximity)
    ↓
glsl_smooth1 (glsl1_compute, npasses: 4, outputatt: P)
    ↓
normal1 (post-smooth normals)
    ↓
merge1 → geo1 → renderTOP
```

## Paso a Paso

### 1. Crear Geometría Base

1. Crea un **gridSOP** (`grid1`)
   - Size: `(4, 4)`
   - Rows: `20`
   - Columns: `20`
2. Opcional: crea un **sphereSOP** (`sphere1`) para variar

### 2. Deformar con Ruido

1. Crea un **noisePOP** (`noise1`)
   - Conecta a `grid1`
   - Translate Along Normal: ON
   - Expression: `me.time.seconds * 0.1`
   - Esto deforma la malla con ruido animado

### 3. Calcular Vecinos

1. Crea un **neighborPOP** (`neighbor_connected1`)
   - Conecta a `noise1`
   - Connectivity: `By Proximity`
   - Esto genera el atributo `neighbours` que lista los vecinos de cada punto

### 4. Crear GLSL Compute de Smoothing

Crea un **textDAT** (`glsl1_compute`) con el shader:

```glsl
// language: glsl
// Multi-pass laplacian smooth
layout(local_size_x = 256) in;

layout(location = 0) in vec3 P;

uniform int numPoints;
uniform int texWidth;
uniform int maxNeighbors;
uniform float deltaTime;
layout(rgba32f) writeonly uniform image2D resultImg;

// SSBOs para datos de vecinos (pasados desde POPs)
layout(std430, binding = 0) buffer NeighborCounts { int numNeighbours[]; };
layout(std430, binding = 1) buffer NeighborIds { int neighbours[]; };

// Promedio de posiciones de vecinos
void main()
{
    uint idx = gl_GlobalInvocationID.x;
    if (idx >= numPoints) return;

    vec3 sum = vec3(0.0);
    int count = 0;

    // Leer vecinos del atributo neighbours
    for (int i = 0; i < numNeighbours[idx]; i++) {
        int neighborId = neighbours[idx * maxNeighbors + i];
        if (neighborId >= 0 && neighborId < numPoints) {
            sum += vec3(
                texelFetch(sTD2DInputs[0], neighborId % texWidth, neighborId / texWidth).xyz
            );
            count++;
        }
    }

    // Promedio laplaciano
    vec3 smoothed = count > 0 ? sum / count : P;

    // Mezcla suave (factor de suavizado)
    float blendFactor = 0.8;
    vec3 result = mix(P, smoothed, blendFactor);

    // Guardar resultado
    imageStore(resultImg, ivec2(idx % texWidth, idx / texWidth), vec4(result, 1.0));
}
```

### 5. Configurar GLSL Smooth POP

1. Crea un **glslPOP** (`glsl_smooth1`)
   - Compute DAT: `glsl1_compute`
   - Output Attribute: `P`
   - Number of Passes: `4` (más passes = más suavizado)
   - Esto ejecuta el shader 4 veces, cada vez suavizando más

### 6. Recalcular Normales

1. Crea un **normalPOP** (`normal1`)
   - Conecta a `glsl_smooth1`
   - Esto recalcula las normales después del suavizado

### 7. Renderizar

1. Conecta `normal1 → merge1 → geo1 → renderTOP`
2. Añade **camera** y **light** para ver el resultado

## Parámetros Clave

| Parámetro | Valor | Descripción |
|-----------|-------|-------------|
| `glsl_smooth/npasses` | `4` | Número de iteraciones de smoothing |
| `glsl_smooth/outputatt` | `P` | Atributo a suavizar (posición) |
| `noise1/amplitude` | `0.5` | Intensidad del ruido inicial |
| `neighbor_connected/proximity` | `1.5` | Radio de búsqueda de vecinos |
| `blendFactor` (en GLSL) | `0.8` | Factor de mezcla por pass |

## Optimización

- **Reducir passes**: 2-3 passes son suficientes para suavizado sutil
- **Limitar vecinos**: `maxNeighbors = 6` para rendimiento
- **Adaptive passes**: más passes en regiones de alto ruido
- **GPU-only**: todo el cálculo se ejecuta en la GPU con GLSL

## Variaciones

- **Selective smooth**: suaviza solo una región (usa groupPOP para select)
- **Animated smooth**: varía `blendFactor` con un CHOP para efecto pulsante
- **Edge-aware**: penaliza bordes para preservar detalles en zonas duras
- **Multi-attribute**: suaviza `Cd` (color) además de `P` (posición)
