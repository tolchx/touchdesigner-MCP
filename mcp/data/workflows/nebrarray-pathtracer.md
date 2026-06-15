---
title: "Neighbor Array Pathtracer"
category: "pops"
difficulty: "expert"
keywords: ["neighbor", "pathtracer", "gpu", "glsl", "particles", "simulation", "ssbo", "compute"]
duration: "60 min"
requires_td: true
---

# Neighbor Array Pathtracer

Pipeline GPU completo: simulación de partículas con búsqueda de vecinos, GLSL compute para lógica custom, y rendering con materials de línea. Basado en el patrón `nebrarraypathtracer`.

## Requisitos

- TouchDesigner (cualquier licencia con POPs)
- GPU con soporte GLSL compute
- Conocimientos avanzados de POPs, GLSL y atributos

## Arquitectura del sistema

```
pointgenPOP (grid) → attributePOP (PartId, Color)
    → feedbackPOP → particlePOP (GPU simulation)
    → neighborPOP (maxdistance, maxneighbors)
    → glslPOP_compute (collision, proximity logic)
    → glslPOP_info (monitor errors)
    → deletePOP (age-based cleanup)
    → mathcombinePOP (velocity, color lookup)
    → nullPOP (output)
    → geoCOMP → renderTOP (line material)
```

## Paso 1: Generar geometría base

1. Crea un **grid POP** (nómbralo `grid1`)
   - Size: `(4, 4)`
   - Points: `100 x 100` (10,000 puntos)
2. Crea un **attribute POP** (nómbralo `attribute1`)
   - Crear: `PartId` (Integer) → `@P.x * 100 + @P.y`
   - Crear: `Color` (Vector) → `(0.5, 0.7, 1.0)` — color base

## Paso 2: Simulación de partículas con feedback

1. Crea un **feedback POP** (nómbralo `feedback1`)
   - Apunta a: `null2` (se define después)
2. Crea un **particle POP** (nómbralo `particle1`)
   - Conecta `attribute1` como input 0
   - Conecta `feedback1` como input 1
   - Particles Per Frame: `10`
   - Life Expect: `60`
3. Crea un **null POP** (`null2`)
   - Conecta después de `particle1`

## Paso 3: Búsqueda de vecinos

1. Crea un **neighbor POP** (nómbralo `neighbor1`)
   - Conecta `null2`
   - Max Distance: `0.087`
   - Max Neighbors: `50`
   - Output Attribute: `NebrDist`, `NebrId`, `NebrPos`
2. Conecta a un **popto POP** (`popto1`)
   - Convierte datos de vecinos a atributos de punto legibles

## Paso 4: GLSL compute para lógica custom

1. Crea un **text DAT** (nómbralo `glsl1_compute`)
2. Pega el siguiente código GLSL:

```glsl
// compute shader
layout(local_size_x = 256) in;

// Uniforms (declarar en el GLSL TOP o vía DAT)
uniform int numPoints;
uniform int textureWidth;
uniform float deltaTime;

// SSBOs para datos de vecinos (bind via GLSL TOP parameters)
layout(std430, binding = 0) buffer NeighborCounts { int neighborCounts[]; };
layout(std430, binding = 1) buffer NeighborIds { int neighborIds[]; };

// Output image
layout(rgba32f, binding = 0) writeonly uniform image2D resultImg;

#define MAX_NEIGHBORS 50

void main()
{
    uint idx = gl_GlobalInvocationID.x;
    if (idx >= uint(numPoints)) return;

    // Leer posición y atributos
    vec3 pos = texelFetch(sTD2DInputs[0], ivec2(idx % textureWidth, idx / textureWidth), 0).xyz;

    // Búsqueda de vecinos via SSBO
    int neighborCount = neighborCounts[idx];
    vec3 avgForce = vec3(0.0);

    for (int i = 0; i < neighborCount; i++) {
        int neighborId = neighborIds[idx * MAX_NEIGHBORS + i];
        vec3 nPos = texelFetch(sTD2DInputs[0], ivec2(neighborId % textureWidth, neighborId / textureWidth), 0).xyz;
        float dist = length(nPos - pos);

        // Fuerza de repulsión si muy cerca
        if (dist < 0.05) {
            avgForce += normalize(pos - nPos) * (0.05 - dist) * 2.0;
        }

        // Fuerza de cohesión si lejos
        if (dist > 0.02 && dist < 0.15) {
            avgForce += normalize(nPos - pos) * 0.001;
        }
    }

    // Aplicar fuerza promedio
    vec3 vel = texelFetch(sTD2DInputs[1], ivec2(idx % textureWidth, idx / textureWidth), 0).xyz;
    vel += avgForce * deltaTime;
    vel *= 0.98; // drag

    imageStore(resultImg, ivec2(idx % textureWidth, idx / textureWidth), vec4(vel, 0.0));
}
```

3. Crea un **GLSL TOP** (nómbralo `glsl1`)
   - Conecta `glsl1_compute` como Compute Shader DAT
   - Crea un **info DAT** (`glsl1_info`) para monitorear errores
   - Wire: `glsl1_compute` → `glsl1`

## Paso 5: Limpieza de memoria

1. Crea un **delete POP** (nómbralo `delete1`)
   - Conecta `glsl1` (output del compute)
   - Delete By: `Age`
   - Age Limit: `120`
   - Esto previene memory leaks en GPU
2. Crea otro **delete POP** (`delete2`)
   - Conecta `delete1`
   - Delete By: `Thin Out`
   - Thin Out: `0.5` — reduce densidad

## Paso 6: Lookup y mezcla de atributos

1. Crea un **lookupChan CHOP** (nómbralo `lookupchan1`)
   - Conecta `delete2`
   - Channel: `Age`
   - Output: mapea Age a color/velocidad
2. Crea un **mathCombine POP** (nómbralo `mathcombine1`)
   - Operation: `A * B`
   - A: `Color` (color base)
   - B: `lookupchan1` (factor de age)
   - Output: `Cd`

## Paso 7: Renderizar con material de línea

1. Crea un **Geometry COMP** (`geo1`)
   - Conecta `mathcombine1`
2. Crea un **line MAT** (nómbralo `line1`)
   - Apply to: `geo1`
   - Width: `0.002`
   - Color: `Cd` (from particle attributes)
3. Crea un **render TOP** (`render1`)
   - Camera: `cam1` (o cámara default)
   - Resolution: `1920x1080`

## Diagrama completo

```
grid1 → attribute1 → feedback1 → particle1 → null2
            ↑                        ↓
            └────────────────────────┘
                                    ↓
                             neighbor1 → popto1
                                    ↓
                        glsl1_compute → glsl1
                                    ↓
                              delete1 → delete2
                                    ↓
                        lookupchan1 → mathcombine1
                                    ↓
                           geo1 → line1 → render1
```

## Parámetros de simulación

| Parámetro | Efecto | Rango típico |
|-----------|--------|--------------|
| `Max Distance` (neighbor) | Radio de búsqueda | 0.01 - 0.5 |
| `Max Neighbors` | Límite de vecinos | 10 - 100 |
| `Particles Per Frame` | Densidad de emisión | 1 - 50 |
| `Life Expect` | Duración de partículas | 30 - 300 |
| `Line Width` | Grosor de línea render | 0.001 - 0.01 |

## Variante: Tracer lines con cache

1. Agrega un **cache POP** después de `mathcombine1`
   - Cache Length: `60` frames
2. Conecta el cache al **Geometry COMP**
3. Las líneas seguirán las trayectorias históricas

## Variante: GLSL compute para colisiones

1. En el GLSL, agrega detección de colisión con geometría externa:
   ```glsl
   // Leer depth buffer para colisión
   float depth = texture(sTD2DInputs[2], uv).r;
   if (pos.z > depth) {
       vel.z *= -0.5; // rebote
       pos.z = depth;
   }
   ```
2. Conecta un depth map como input 2 del GLSL TOP

## Solución de problemas

- **Performance lenta**: Reduce `Max Neighbors` o resolución de grid
- **GLSL errors**: Revisa `glsl1_info` para ver errores de compilación
- **Partículas no aparecen**: Verifica que `particle1` tenga inputs correctos
- **Memory leak**: Asegúrate de que `delete1` esté eliminando partículas viejas

## Consejos

- El **neighbor POP** es el cuello de botella — ajusta `Max Distance` para balance
- Usa **GLSL compute** para lógica que no se puede expresar con POPs
- El **popto POP** es esencial para convertir datos POP a formato legible
- Combina con **audio CHOP** para simular comportamiento reactivo a sonido
- Para producción, reduce la resolución de grid y usa instancing en render
