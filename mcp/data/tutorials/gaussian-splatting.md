---
title: "Gaussian Splatting en TouchDesigner"
category: "glsl"
difficulty: "expert"
keywords: ["gaussian", "splatting", "3d", "rendering", "glsl", "point", "cloud", "ply", "sort"]
duration: "60 min"
requires_td: true
---

# Gaussian Splatting en TouchDesigner

Renderiza escenas 3D capturadas con Gaussian Splatting usando GLSL shaders, sorting bitónico y geometría instanciada en GPU. Pipeline completo desde carga de archivo .ply hasta render final.

Basado en el patrón GaussianSplatting POPs v1.0.42.

## Requisitos

- TouchDesigner (licencia con POPs)
- GPU NVIDIA con 8+ GB VRAM (recomendado)
- Archivo .ply o .spz de Gaussian Splatting
- Conocimientos avanzados de GLSL y GPU rendering

## Arquitectura del sistema

```
pointfileinPOP (carga .ply) → GaussianSplatSource
    → pointfileselectPOP (Position, Color, Scale, Rotation, SH)
    → glslComputeColor (calcular color SH)
    → glslCalculateDistance (distancia a cámara)
    → bitonic_mergesort (ordenar por profundidad)
    → geoCOMP (instanciar splats) → glslSplat (vertex+pixel shader)
    → renderTOP → output
```

## Paso 1: Cargar el archivo .ply

1. Crea un **pointfilein POP** (nómbralo `source`)
   - File: `tu_archivo.ply` (ruta al archivo de Gaussian Splatting)
   - Esto carga las propiedades: Position, Color, Scale, Rotation, SH coefficients
2. Crea un **select POP** (nómbralo `GaussianSplatSource`)
   - Conecta `source`
   - Esto define la fuente de datos para todo el pipeline

## Paso 2: Extraer propiedades de cada splat

Crea múltiples **pointfileselect POP** para extraer cada propiedad:

1. `positions` — Position (vec3)
2. `colors` — Color (vec3) + SH coefficients
3. `scales` — Scale (vec3)
4. `rotations` — Rotation (quaternion vec4)

Cada select apunta a `GaussianSplatSource` y extrae el atributo correspondiente.

## Paso 3: Calcular color con SH (Spherical Harmonics)

1. Crea un **GLSL TOP** (nómbralo `glslComputeColor`)
   - Input: `colors` + dirección de cámara
   - Compute DAT: crea un **text DAT** (`glslComputeColor_compute`)

```glsl
// Calcular color final desde SH coefficients
// Simplified: usar solo el primer orden SH
uniform vec3 uCameraDir;

out vec4 fragColor;

void main()
{
    vec2 uv = vUV.st;
    // Leer SH coefficients desde textura
    vec3 sh0 = texture(sTD2DInputs[0], uv).rgb; // DC component
    vec3 sh1x = texture(sTD2DInputs[1], uv).rgb;
    vec3 sh1y = texture(sTD2DInputs[2], uv).rgb;
    vec3 sh1z = texture(sTD2DInputs[3], uv).rgb;

    // Evaluar SH con dirección de cámara
    float c0 = 0.282095; // SH basis 0
    vec3 color = sh0 * c0
               + sh1x * uCameraDir.x * 0.488603
               + sh1y * uCameraDir.y * 0.488603
               + sh1z * uCameraDir.z * 0.488603;

    fragColor = vec4(max(color, 0.0), 1.0);
}
```

## Paso 4: Calcular distancia para sorting

1. Crea un **GLSL TOP** (`glslCalculateDistance`)
   - Input: Position de cada splat
   - Output: `Distance` attribute (float)

```glsl
// Calcular distancia al centro de la cámara
uniform vec3 uCameraPosition;

out vec4 fragColor;

void main()
{
    vec2 uv = vUV.st;
    vec3 pos = texture(sTD2DInputs[0], uv).rgb;
    float dist = length(pos - uCameraPosition);
    fragColor = vec4(dist, 0.0, 0.0, 1.0);
}
```

## Paso 5: Sorting bitónico (Bitonic Merge Sort)

1. Crea un **baseCOMP** (nómbralo `bitonic_mergesort`)
2. Dentro, implementa sorting bitónico con GLSL:
   - Cada pass compara pares de elementos y los ordena
   - Múltiples passes para ordenar todo el array
3. Input: `Distance` attribute del paso anterior
4. Output: `SortedIndex` — índice reordenado

**Parámetros del sorter:**
- `Autosort`: `On` — reordenar cada frame
- `Sort`: pulse para ordenar manualmente
- `SortBy`: Camera distance

## Paso 6: Geometry COMP con instancing

1. Crea un **Geometry COMP** (nómbralo `Splats`)
2. Configura:
   - Instance Count Mode: `Manual`
   - Num Instances: `InputInfo.numPoints` (dinámico)
   - Instance Data: Position, Scale, Rotation, Color (ordenados)
3. Conecta los datos ordenados como inputs

## Paso 7: GLSL Splat Shader

Crea un **GLSL MAT** (`glslSplat`) con vertex y pixel shader:

### Vertex Shader
```glsl
// Vertex shader para Gaussian Splat
in vec3 P;      // Position
in vec3 tdinstanceScale;  // Scale del splat
in vec4 tdinstanceRotate; // Rotation (quaternion)

void main()
{
    // Rotar vértice por quaternion del splat
    vec3 rotated = P;

    // Escalar por el scale del splat
    rotated *= tdinstanceScale;

    // Transformar a espacio world
    vec4 worldPos = TDWorldMat * vec4(rotated, 1.0);
    vec4 camPos = TDViewMat * worldPos;
    gl_Position = TDProjMat * camPos;

    // Pasar datos al pixel shader
    vUV = vec2(uv[0], uv[1]);
    vColor = Cd; // Color del splat
}
```

### Pixel Shader
```glsl
out vec4 fragColor;

void main()
{
    // Calcular opacidad gaussiana desde centro del splat
    vec2 center = vec2(0.5, 0.5);
    float d = distance(vUV, center);
    float sigma = 0.2; // Ancho del splat
    float alpha = exp(-d * d / (2.0 * sigma * sigma));

    // Color con alpha
    fragColor = vec4(vColor * alpha, alpha);
}
```

## Paso 8: Renderizar

1. Conecta `Splats` → **render TOP** (`render1`)
2. Resolución: `1920x1080`
3. Activa **Alpha blending** en el render TOP:
   - Extension: `Add`
   - Depth Test: `Off` (para transparencia)

## Pipeline completo

```
source → extract (Position, Color, Scale, Rotation, SH)
    → glslComputeColor (SH → RGB)
    → glslCalculateDistance (distancia a cámara)
    → bitonic_mergesort (ordenar por profundidad)
    → geoCOMP (instanciar con datos ordenados)
    → glslSplat (vertex + pixel shader)
    → renderTOP (alpha blending)
```

## Parámetros de render

| Parámetro | Efecto | Rango |
|-----------|--------|-------|
| `sigma` | Ancho de cada splat | 0.05 - 0.5 |
| `uCameraPosition` | Posición de cámara | Vec3 |
| `Autosort` | Reordenar cada frame | On/Off |
| `Resolution` | Resolución de render | 720p - 4K |

## Optimización

- **LOD**: Reducir número de splats lejanos
- **Frustum Culling**: No renderizar splats fuera de cámara
- **Resolution Scaling**: Reducir resolución para preview
- **Sort Caching**: No reordenar si la cámara no se mueve

## Solución de problemas

- **Splats no aparecen**: Verifica que el .ply esté cargado y el sort funcione
- **Color incorrecto**: Revisa la evaluación SH y la dirección de cámara
- **Performance baja**: Reduce sigma, activa frustum culling, reduce resolución
- **Transparencia incorrecta**: Verifica alpha blending en render TOP

## Consejos

- Usa archivos .ply de alta calidad para mejores resultados
- El sorting por profundidad es ESencial para transparencia correcta
- El shader de splat debe generar opacidad gaussiana suave
- Para escenas grandes (1M+ splats), usa LOD agresivo
- Combina con **bloom TOP** para efecto de resplandor
