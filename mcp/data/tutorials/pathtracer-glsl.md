---
title: "Pathtracer GLSL — Raytracing en GPU"
category: "pathtracer"
difficulty: "expert"
keywords: ["pathtracer", "raytracing", "glsl", "pbr", "materials", "denoising", "mis", "nee"]
duration: "60 min"
requires_td: true
---

# Pathtracer GLSL — Raytracing en GPU

Sistema completo de path tracing en GPU usando GLSL POP compute shaders con pipeline multi-pass, materiales PBR, denoising temporal/espacial, y soporte multi-material.

## Arquitectura

```
main.glsl (dispatcher)
  ├── Pass 0: raytracing()        → Trazado de rayos (16 samples/frame)
  ├── Pass 1: temporalReproject()  → Acumulación temporal entre frames
  └── Pass 2+: spatialFilterPass() → Filtro A-Trous (edge-stopping)
```

## Inputs del GLSL POP

| Input | Contenido |
|-------|-----------|
| 0 | Partículas (posiciones UV de pixel) |
| 1 | Geometría de la escena (merge de materiales) |
| 2 | Cámaras (matrices view/projection) |
| 3 | Luces emisivas (triángulos + CDF precomputado) |

## Pipeline detallado

### Pass 0: Raytracing

1. **Rayos primarios**: Genera rayo desde cámara con DoF opcional
2. **Loop de rebotes** (máx `uQueryIterations`):
   - Intersección hardware via `rayQueryEXT`
   - `getHitData()`: Interpola barycentricamente position, normal, color, emit, roughness, metallic, clearcoat, IOR, transparency, velocity
   - `evaluateBRDF()`: Fresnel Schlick + metallic workflow + clearcoat
   - `sampleLights()`: Muestreo de luces con CDF (Next Event Estimation)
   - `traceShadowRay()`: Shadow rays con transparencia (hasta 8 capas)
   - Russian Roulette después de 3 rebotes
3. **Acumulación**: Color + Variance buffers

### Pass 1: Temporal Reprojection

- Motion vectors → UV previo → sample history
- Neighborhood clamping 3×3 (3σ)
- Variance-based blend weights

### Pass 2+: A-Trous Spatial Filter

- Kernel 3×3 con step size creciente
- Edge-stopping: luma + normal + depth similarity
- Protección temporal (guarda a History antes de filtrar)

## Estructura de materiales

Cada material (PT_MATx) contiene:

```
PT_MATx/
├── in1          (inPOP)
├── attribute2   (attributePOP)  → Vertex attrs: color, emit, roughness, etc.
├── attribute1   (attributePOP)  → Primitive attrs: MaterialId, TextureIds
├── glsl1        (glslPOP)       → Compute shader para texture IDs
├── glsl1_compute (textDAT)
├── glsl1_info   (infoDAT)
└── out1         (outPOP)
```

## Atributos de material

| Atributo | Tipo | Rango | Descripción |
|----------|------|-------|-------------|
| color | vec3 | 0-1 | Albedo |
| Emit | float | 0-∞ | Emisión |
| Roughness | float | 0-1 | 0=specular, 1=difuso |
| Transparency | float | 0-1 | 0=opaco, 1=transparente |
| IOR | float | 1-3 | Índice de refracción |
| Metallic | float | 0-1 | 0=dielectric, 1=metal |
| ClearCoat | float | 0-1 | Capa clearcoat |
| ClearCoatRoughness | float | 0-1 | Rugosidad clearcoat |
| ClearCoatTint | vec3 | 0-1 | Tinte clearcoat |

## Conexión de materiales

```
PT_MAT3/out1 → merge1 (input 0)
PT_MAT1/out1 → merge1 (input 1)
PT_MAT2/out1 → merge1 (input 2)
PT_MAT4/out1 → merge1 (input 3)
                   ↓
             Pathtracer (Input 1: geometría)
```

## Capacidades

- ✅ Hardware ray tracing (rayQueryEXT)
- ✅ PBR metallic + clearcoat
- ✅ Normal mapping (tangent-space)
- ✅ Transparency / Refraction con TIR
- ✅ NEE con CDF precomputado
- ✅ MIS (power heuristic)
- ✅ Temporal reprojection + variance denoising
- ✅ A-Trous spatial filtering
- ✅ Depth of Field
- ✅ Environment map lighting
- ✅ Russian Roulette
- ✅ Multi-material (MaterialId tracking)

## Uniforms principales

| Uniform | Valor | Descripción |
|---------|-------|-------------|
| uIterations | 16 | Muestras por frame |
| uQueryIterations | 17 | Máx rebotes por camino |
| uEnvDimmer | 0.451 | Intensidad environment |
| uAperture | — | Apertura DoF |
| uFocusDistance | — | Distancia enfoque |
| uReset | 0/1 | Reset acumulación |
