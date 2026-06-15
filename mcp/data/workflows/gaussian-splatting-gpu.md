---
title: "Gaussian Splatting en GPU"
category: "pops"
difficulty: "expert"
keywords: ["gaussian", "splatting", "3dgs", "pointcloud", "glsl", "bitonic", "sort", "rendering", "gpu", "volumetric"]
duration: "60 min"
requires_td: true
---

# Gaussian Splatting en GPU

Renderiza escenas 3D reconstruidas con Gaussian Splatting (3DGS) directamente en la GPU usando POPs y GLSL compute en TouchDesigner.

## Concepto

Gaussian Splatting representa escenas como miles de pequeñas gaussianas 3D con posición, rotación, escala, color y opacidad. El renderizado requiere:

1. **Sorting** por profundidad (de atrás hacia adelante) — usa bitonic merge sort en GPU
2. **Splatting** — proyecta cada gaussiana como un elipse 2D y las compone con alpha blending
3. **Color computation** — evalúa funciones de base esférica (SH) para iluminación

```
PointCloud (.spz) → Positions + Rotations + Scales + Colors
    ↓
Bitonic Sort (GPU) → Sorted by depth
    ↓
GLSL Splat → Project + Alpha Blend → renderTOP → Output
```

## Operadores Principales

| Operador | Tipo | Función |
|----------|------|---------|
| `pointfilein` | POP | Lee archivo .spz con puntos gaussianos |
| `bitonic_mergesort` | BaseCOMP | Sort GPU multi-pass |
| `glsl1_compute` | Compute DAT | Shader de sorting por distancia |
| `glslSplat` | GLSL TOP | Vertex + fragment shader de splatting |
| `glslComputeColor` | GLSL TOP | Evalúa SH para color |
| `renderTOP` | TOP | Render final |
| `geo1` | Geo COMP | Contiene splats como instancias |

## Red de Operadores

```
pointfilein1 (Positions)
pointfilein2 (Rotations)
pointfilein3 (Scales)
    ↓
null_merge1 → mergePOP → CalculateColors (baseCOMP)
    ↓
Sort (baseCOMP)
    ├── glsl1_compute (distancia a cámara)
    ├── bitonic_mergesort
    └── null_sorted
    ↓
geo1 (instance positions from sorted)
    ↓
Splats (geo) → glslSplat (GLSL TOP) → renderTOP → over1 (composite)
```

## Paso a Paso

### 1. Cargar Point Cloud

1. Crea un **pointfilein POP** (`pointfilein1`)
   - Point File: `tu_archivo.ply` o `.spz`
2. Extrae posiciones con **soptoPOP** o **attribute POP**:
   - `position POP` → separa `P` (x,y,z)
   - `attribute POP` → extrae `rot` (cuaternion), `scale`, `opacity`
3. Conecta a un **nullPOP** (`null_positions`)

### 2. Calcular Distancia para Sorting

Crea un **textDAT** (`glsl1_compute`) con el shader:

```glsl
// language: glsl
// Compute shader: calcular distancia al centro de cada splat
layout(local_size_x = 256) in;

layout(location = 0) in vec3 P;
layout(location = 1) in vec3 Scale;

uniform int numPoints;
uniform int textureWidth;
uniform vec3 cameraPos;
uniform float deltaTime;
uniform vec3 posOffset;
layout(rgba32f) writeonly uniform image2D resultImg;

void main()
{
    uint idx = gl_GlobalInvocationID.x;
    if (idx >= numPoints) return;

    vec3 worldPos = P + posOffset;
    float dist = distance(worldPos, cameraPos);

    // Guardar distancia para el sort
    vec4 pixel = vec4(dist, float(idx), 0.0, 1.0);
    imageStore(resultImg, ivec2(idx % textureWidth, idx / textureWidth), pixel);
}
```

### 3. Bitonic Merge Sort (GPU)

Crea un **BaseCOMP** (`bitonic_mergesort`) con:

1. Dentro, crea un **glslPOP** con compute shader de bitonic sort
2. Usa **mergePOP** con **selectPOP** para pasar estados (pass, active)
3. Parámetros clave:
   - `npasses: log2(numPoints)` (ej: 14 pasos para 16384 puntos)
   - `local_size: 256`
4. Al finalizar, los splats están ordenados por profundidad

```glsl
// language: glsl
// Bitonic compare-and-swap
layout(local_size_x = 256) in;

uniform int stage;
uniform int passInStage;

layout(std430, binding = 0) buffer Data { float data[]; };

shared float sharedData[512];

void main()
{
    uint tid = gl_LocalInvocationID.x;
    uint gid = gl_GlobalInvocationID.x;
    uint blockSize = 1u << (stage + 1);
    uint halfBlock = blockSize >> 1;
    uint pairDistance = 1u << passInStage;

    sharedData[tid] = data[gid];
    barrier();

    uint leftId = gid & (pairDistance - 1);
    bool ascending = ((gid / halfBlock) & 1) == 0;
    bool compare = ascending ? (leftId < pairDistance) : (leftId >= pairDistance);

    if (compare) {
        uint right = tid | pairDistance;
        float leftVal = sharedData[tid];
        float rightVal = sharedData[right];
        bool swap = ascending ? (leftVal > rightVal) : (leftVal < rightVal);
        if (swap) {
            sharedData[tid] = rightVal;
            sharedData[right] = leftVal;
        }
    }
    barrier();
    data[gid] = sharedData[tid];
}
```

### 4. GLSL Splat Vertex + Fragment

Crea un **GLSL TOP** (`glslSplat`) con vertex y fragment shader:

```glsl
// language: glsl
// Vertex shader: proyecta gaussiana a elipse 2D
// Input: P, Rot, Scale, Opacidad, Color

uniform mat4 worldCamera;
uniform mat4 proj;
uniform vec2 screenRes;

void main()
{
    vec4 worldPos = worldMatrix * vec4(P, 1.0);
    vec4 viewPos = worldCamera * worldPos;

    // Proyectar elipse: rotar escala por rotación de cámara
    vec3 covA, covB;
    computeCovariance3D(Scale, Rot, covA, covB);

    mat3 J = mat3(
        focalLength / viewPos.z, 0.0, 0.0,
        0.0, focalLength / viewPos.z, 0.0,
        0.0, 0.0, 1.0
    );
    mat3 W = mat3(worldCamera);
    mat3 T = W * J;
    mat3 cov2D = transpose(T) * (outerProduct(covA, covA) + outerProduct(covB, covB)) * T;

    // Eigenvalues de cov2D para la elipse
    float mid = (cov2D[0][0] + cov2D[1][1]) * 0.5;
    float delta = sqrt(max((cov2D[0][0] - cov2D[1][1]) * (cov2D[0][0] - cov2D[1][1]) / 4.0 + cov2D[0][1] * cov2D[0][1], 1e-6));
    vec2 eig1 = vec2(mid + delta, 0.0);
    vec2 eig2 = vec2(mid - delta, 0.0);
    float maxRadius = ceil(sqrt(max(eig1.x, eig2.x) * 2.0));

    // Generar quad (4 vértices) usando instancing
    vec2 quadPos = quadVerts * maxRadius / screenRes * viewPos.w;
    vec4 clipPos = proj * vec4(viewPos.xy + quadPos, viewPos.zw);
    gl_Position = clipPos;

    // Paso de atributos al fragment
    vColor = SHEvaluate(n_rest, Color, viewPos.xyz);
    vOpacity = Opacity;
    vCov2D = cov2D;
}
```

```glsl
// language: glsl
// Fragment shader: evalúa gaussiana 2D y compone con alpha
in vec2 texCoord;
in vec4 vColor;
in float vOpacity;
in vec2 vCov2D;

out vec4 fragColor;

void main()
{
    vec2 d = texCoord - vec2(0.5);
    float power = -0.5 * (d.x * d.x * vCov2D.x + d.y * d.y * vCov2D.y);
    float alpha = min(0.99, vOpacity * exp(power));

    // Pre-multiply alpha
    fragColor = vec4(vColor.rgb * alpha, alpha);
}
```

### 5. Configurar Render

1. Crea un **renderTOP** (`render1`)
   - Camera: `camera1`
   - Geometry: `geo1/Splats`
2. Crea un **overTOP** (`over1`) para compositing
3. Conecta `glslSplat → render1 → over1 → null1 (output)`

## Parámetros Clave

| Parámetro | Valor | Descripción |
|-----------|-------|-------------|
| `npasses` | `log2(N)` | Pasos del bitonic sort |
| `local_size` | `256` | Thread group size |
| `focalLength` | `500` | Distancia focal cámara |
| `SH_Degree` | `0-3` | Orden funciones esféricas |

## Optimización

- **Near-plane culling**: elimina splats detrás de la cámara
- **Adaptive density**: reduce splats en regiones densas
- **Tile-based rendering**: divide pantalla en tiles para parallel sort
- **Mipmap de covarianza**: usa mipmaps para acelerar splatting de gaussianas grandes

## Variaciones

- **Real-time (< 30K splats)**: bitonic sort en GPU, sin adaptivity
- **High quality (> 100K splats)**: sort multi-pass + tile-based rendering
- **Editable**: permite mover/rotar splats individuales con transformPOP
