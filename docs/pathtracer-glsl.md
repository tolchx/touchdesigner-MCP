# Pathtracer GLSL — Documentación Completa

> Documentación generada automáticamente desde el proyecto TD en `192.168.100.115:44444`
> Fecha: Junio 2026

---

## Arquitectura General

El pathtracer implementa un **renderizador de trazado de rayos en GPU** usando un **GLSL POP compute shader** con pipeline multi-pass:

```
main.glsl (dispatcher)
  ├── Pass 0: raytracing()        → Genera imagen con trazado de rayos
  ├── Pass 1: temporalReproject()  → Acumulación temporal entre frames
  └── Pass 2+: spatialFilterPass() → Filtro espacial A-Trous (varios pasos)
```

### Uniforms Principales

| Uniform | Tipo | Valor | Descripción |
|---------|------|-------|-------------|
| `uIterations` | float | 16.0 | Muestras por frame (path depth) |
| `uQueryIterations` | float | 17.0 | Máximo de rebotes por camino |
| `uResolution` | vec2 | 1920×1080 | Resolución del render |
| `uEnvDimmer` | float | 0.451 | Intensidad del environment map |
| `uAperture` | float | — | Apertura para Depth of Field |
| `uFocusDistance` | float | — | Distancia de enfoque |
| `uReset` | int | 0/1 | Reset de acumulación |
| `uSeed` | uint | — | Seed para random |
| `uTDPass` | int | 0-4 | Pass actual del multi-pass |
| `uRenderEnv` | int | 0/1 | Habilitar environment map |
| `uFireflyClamp` | float | 1.0 | Clamp de fireflies |
| `uTemporalAccumulation` | float | — | Factor de acumulación temporal |

---

## Pipeline de Rendering

### Pass 0: Raytracing (`raytracing.glsl`)

#### Estructuras Principales

```glsl
struct ray {
    vec3 o;  // Origen
    vec3 d;  // Dirección (normalizada)
};

struct hitData {
    vec3 p;              // Posición world-space
    vec3 n;              // Normal
    vec3 color;          // Albedo
    vec3 emit;           // Emisión
    vec2 uv;             // Coordenadas UV
    float transparency;  // Transparencia (0=opaco, 1=transparente)
    float ior;           // Índice de refracción
    float roughness;     // Rugosidad
    float metallic;      // Metalicidad
    float clearcoat;     // Capa clearcoat
    float clearcoatRoughness;
    vec3 clearcoatTint;
    vec3 velocity;       // Motion vectors
    uint id;             // Material ID
    uvec4 textureId;     // IDs de texturas
};
```

#### Flujo del Shader

**1. Generación de rayos primarios:**
- Calcula rayo desde cámara usando `TDIn_Cam` + `TDIn_ProjInverse`
- Aplica **Depth of Field** si `uAperture > 0` (muestreo de disco en lente)

**2. Loop de rebotes** (máximo `uQueryIterations`):

```
raytracing(id):
  seed = hash(id + uSeed)
  ray = primary ray desde cámara

  for i in 0..uIterations:
    intensity = vec3(1.0)
    iterationColor = vec4(0)

    for query in 0..uQueryIterations:
      hit = queryScene(ray)

      if !hit:
        iterationColor += envColor * intensity
        break

      if query == 0:
        // Guardar G-Buffer: albedo, depth, normal, velocity

      // Evaluar BRDF
      brdf = evaluateBRDF(cosTheta, hitData)

      // Next Event Estimation (muestreo directo de luces)
      lightSample = sampleLights(origin)
      shadowRay = traceShadowRay(origin, lightDir)
      iterationColor += lightContribution * intensity

      // Scatter: specular, diffuse, o transmisión
      if random < brdf.pSpec:
        // Specular bounce
        ray = reflectray
      else:
        // Diffuse / Transmission
        ray = cosineWeightedDirection(normal)
        intensity *= brdf.bsdfValue

      // Russian Roulette después de 3 rebotes
      if query > 3:
        if random > luminance(intensity):
          break

  Color[id] += iterationColor
  Variance[id] = calculateVariance()
```

**3. Materiales y BRDF** (`evaluateBRDF`):

```glsl
BRDFEval evaluateBRDF(float cosTheta, hitData hd, ...) {
    // Fresnel Schlick con IOR remapeado
    float F0_dielectric = pow((1.0 - validIor) / (1.0 + validIor), 2.0);
    vec3 F0 = mix(F0_dielectric, hd.color, hd.metallic);

    // Fresnel con roughness
    b.F = F0 + (max(1.0 - roughness, F0) - F0) * pow(1.0 - cosTheta, 5.0);

    // Probabilidad specular
    b.pSpec = clamp(max(F.r, max(F.g, F.b)), 0.0, 1.0);

    // Diffuse base
    b.bsdfValue = hd.color / PI;

    return b;
}
```

**4. Next Event Estimation (NEE):**

```glsl
LightSample sampleLights(vec3 origin, inout uint seed) {
    // Muestrea triángulos emisivos usando CDF precomputado (Input 3)
    // Binary search en CDF para selección eficiente
    // Retorna: posición, normal, emisión, PDF, área
}

ShadowRayResult traceShadowRay(vec3 origin, vec3 direction, float maxDist) {
    // Traza shadow ray con soporte de transparencia
    // Hasta 8 capas transparentes
    // Acumula transmittance
}
```

**5. Transmisión y refracción:**

```glsl
vec3 myRefract(vec3 d, vec3 n, float r) {
    float c = -dot(n, d);
    float b = 1.0 - r*r*(1.0 - c*c);
    return r*d + (r*c - sign(b)*sqrt(abs(b)))*n;
}
```

**6. Acumulación:**

| Buffer | Contenido |
|--------|-----------|
| `Color[id]` | Color acumulado |
| `Variance[id]` | Varianza para denoising |
| `Albedo[id]` | Color base (G-Buffer) |
| `Normal[id]` | Normales world-space |
| `Depth[id]` | Profundidad |
| `Velocity[id]` | Motion vectors |

---

### Pass 1: Temporal Reprojection (`temporal_reprojection.glsl`)

- **Motion vectors:** Usa `Velocity` buffer + cámaras actual/anterior
- **Reprojection:** Calcula UV previo → samplea history buffers
- **Validación:** Thresholds para depth, normal, y albedo para evitar ghosting
- **Neighborhood clamping:** 3×3 clamp con 3σ para evitar specular boiling
- **Varianza adaptive:** Blend weights basados en varianza

```glsl
void temporalReproject(uint id) {
    // Calcular UV previo usando velocity
    vec2 prevUv = projectToPreviousFrame(currentWSP, velocity);

    // Samplear history buffers (bilinear)
    vec4 prevColor = sampleBilinearVec4(HistoryColor, prevUv);

    // Validar con thresholds
    bool validDepth = abs(depth - prevDepth) < uTemporalDepthThreshold;
    bool validNormal = dot(normal, prevNormal) > uTemporalNormalThreshold;
    bool validAlbedo = length(albedo - prevAlbedo) < uTemporalAlbedoThreshold;

    // Neighborhood clamping (3×3)
    vec4 minColor, maxColor;
    for (int dx = -1; dx <= 1; dx++)
        for (int dy = -1; dy <= 1; dy++)
            clamp Neighborhood(Color, uv + vec2(dx, dy));

    // Blend con varianza
    float weight = varianceBasedWeight(currentColor, prevColor);
    TemporaryColor[id] = mix(prevColor, currentColor, weight);
}
```

---

### Pass 2+: Spatial Filtering A-Trous (`spatial_filtering.glsl`)

- **Kernel 3×3** con step size creciente por pass
- **Edge-stopping filters:**
  - Luma similarity (guiado por varianza + `uLumaSigma`)
  - Normal similarity (`uNormalSigma`)
  - Depth similarity (`uDepthSigma`)
- **Protección temporal:** En pass 2, guarda datos a History buffers ANTES de filtrar

```glsl
void spatialFilterPass(uint id) {
    // En pass 2: guardar a History ANTES de filtrar
    if (uTDPass == 2) {
        HistoryColor[id] = Color[id];
        HistoryNormal[id] = Normal[id];
        HistoryDepth[id] = Depth[id];
        HistoryAlbedo[id] = Albedo[id];
        HistoryVariance[id] = Variance[id];
    }

    // Kernel A-Trous 3×3
    float stepSize = pow(2.0, float(uTDPass - 2));
    vec4 filteredColor = vec4(0);
    float totalWeight = 0;

    for (int dx = -1; dx <= 1; dx++) {
        for (int dy = -1; dy <= 1; dy++) {
            vec2 neighborUv = uv + vec2(dx, dy) * stepSize * texelSize;

            // Edge-stopping weights
            float wLuma = exp(-lumaDiff * uLumaSigma);
            float wNormal = exp(-normalDiff * uNormalSigma);
            float wDepth = exp(-depthDiff * uDepthSigma);
            float weight = wLuma * wNormal * wDepth;

            filteredColor += sample(neighborUv) * weight;
            totalWeight += weight;
        }
    }

    // Output alternando buffers
    if (uTDPass % 2 == 0)
        Color[id] = filteredColor / totalWeight;
    else
        TemporaryColor[id] = filteredColor / totalWeight;
}
```

---

## Inputs del GLSL POP

| Input | Nombre | Contenido |
|-------|--------|-----------|
| 0 | Partículas | Posiciones de pixel (UV) |
| 1 | Geometría | Mesh de la escena (merge de PT_MAT1/2/3/4) |
| 2 | Cámaras | Camera matrices (`TDIn_Cam`, `TDIn_ProjInverse`) |
| 3 | Luces | Triángulos emisivos + CDF precomputado |

---

## Sub-componentes

| COMP | Función | Operadores clave |
|------|---------|------------------|
| `attributes` | Procesa geometría | in1 → convert1 → attconvert1 → normal1 → attribute1/2 → mathcombine2 → out1 |
| `lights` | Prepara luces | in1 → attconvert2 → group1 → delete1 → area (glslPOP) → accumulate1 → out1 |
| `Render_Buffers` | Gestiona buffers | in1 → attribute3 → mathcombine1 → out1 |
| `Textures` | Array de texturas | Texturas para materiales |
| `Reset_Logic` | Reset de acumulación | Feedback CHOP loops |
| `interaction` | Input del panel | Panel events → distance, selected_mat |

---

## Materiales (PT_MAT1-4)

### Estructura de cada material

```
PT_MATx/
├── in1          (inPOP)      — Recibe geometría
├── attribute2   (attributePOP) — Asigna atributos vertex (color, emit, roughness, etc.)
├── attribute1   (attributePOP) — Asigna atributos primitive (MaterialId, TextureIds)
├── glsl1        (glslPOP)    — Asigna texture IDs via compute shader
├── glsl1_compute (textDAT)   — Código GLSL del compute
├── glsl1_info   (infoDAT)    — Estado de compilación
└── out1         (outPOP)     — Sale del material
```

### Flujo de datos

```
in1 → attribute2 (vertex attrs) → attribute1 (prim attrs) → glsl1 (texture IDs) → out1
```

### Atributos de Material (attribute2)

| Atributo | Tipo | Descripción |
|----------|------|-------------|
| `color` | vec3 RGB | Color base (albedo) |
| `Emit` | float | Intensidad de emisión |
| `Roughness` | float | Rugosidad (0=specular, 1=difuso) |
| `Transparency` | float | Transparencia (0=opaco, 1=transparente) |
| `IOR` | float | Índice de refracción |
| `Metallic` | float | Metalicidad (0=dielectric, 1=metal) |
| `ClearCoat` | float | Intensidad de clearcoat |
| `ClearCoatRoughness` | float | Rugosidad del clearcoat |
| `ClearCoatTint` | vec3 RGB | Tinte del clearcoat |

### Atributos de Primitive (attribute1)

| Atributo | Tipo | Descripción |
|----------|------|-------------|
| `MaterialId` | uint | ID del material (para CDF de luces) |
| `TextureIds` | uint[6] | IDs de texturas (color, emit, metallic, roughness, transparency, normal) |

### Materiales en el proyecto

#### PT_MAT1 — Cobre/Cobre
| Propiedad | Valor |
|-----------|-------|
| Color | `(1.0, 0.68, 0.51)` — naranja cálido |
| Emit | `0.0` |
| Roughness | `0.5` |
| Metallic | `0.0` |
| ClearCoat | `0.0` |
| IOR | `1.5` |

#### PTматериал2 — (defecto del clone)
| Propiedad | Valor |
|-----------|-------|
| Color | `(1.0, 0.68, 0.51)` |
| Emit | `0.0` |
| Roughness | `0.5` |
| Metallic | `0.0` |
| ClearCoat | `0.0` |

#### PT_MAT3 — (defecto del clone)
| Propiedad | Valor |
|-----------|-------|
| Color | `(1.0, 0.68, 0.51)` |
| Emit | `0.0` |
| Roughness | `0.5` |
| Metallic | `0.0` |
| ClearCoat | `0.0` |

#### PT_MAT4 — Azul Metálico Brillante ✨
| Propiedad | Valor |
|-----------|-------|
| Color | `(0.1, 0.3, 0.9)` — azul profundo |
| Emit | `0.3` — brillo sutil |
| Roughness | `0.1` — superficie lisa |
| Metallic | `0.95` — muy metálico |
| ClearCoat | `0.8` — clearcoat fuerte |
| ClearCoatRoughness | `0.05` — smooth |
| ClearCoatTint | `(0.8, 0.85, 1.0)` — tinte azul |
| IOR | `2.5` — alto índice |

### Conexión al Pipeline

```
PT_MAT3/out1 ──→ merge1 (input 0)
PT_MAT1/out1 ──→ merge1 (input 1)
PT_MAT2/out1 ──→ merge1 (input 2)
PT_MAT4/out1 ──→ merge1 (input 3)
                    │
                    ▼
              Pathtracer/raytracer (Input 1: geometría)
```

---

## Resumen Técnico

### Capacidades del Pathtracer

- ✅ **Hardware ray tracing** (rayQueryEXT)
- ✅ **PBR materials** (metallic + clearcoat workflow)
- ✅ **Normal mapping** (tangent-space)
- ✅ **Transparency / Refraction** con TIR (Total Internal Reflection)
- ✅ **Next Event Estimation** con CDF precomputado
- ✅ **MIS** (Multiple Importance Sampling) — power heuristic
- ✅ **Temporal reprojection** + variance denoising
- ✅ **A-Trous spatial filtering** (edge-stopping)
- ✅ **Depth of Field** (apertura configurable)
- ✅ **Environment map** lighting
- ✅ **Russian Roulette** path termination
- ✅ **Firefly clamping**
- ✅ **Motion vectors** para temporal accumulation
- ✅ **Multi-material** (merge de geometrías con MaterialId)

### Tipo de Renderer

**Unidirectional Path Tracer** con:
- Muestreo de luz directa (NEE)
- Muestreo BSDF (cosine-weighted hemisphere)
- MIS para combinar ambos
- Acumulación temporal + filtrado espacial para reducir ruido

---

*Documentación generada por MCP TouchDesigner — v3.0.0*
