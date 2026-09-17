# Conocimiento POP — validado y con fuentes

- Build validado: **TouchDesigner 2025.31760** · POPs creados en vivo: **96/97**
- Documentados en la wiki oficial: **96** · sin página oficial: **1**
- Patrones POP→POP extraídos de proyectos reales: **1120** · GLSL indexados: **62**

> **Regla:** cada dato lleva su fuente. `oficial` = wiki Derivative · `live-verified` = probado contra TD real · `empirico` = extraído de .toe (no normativo).

## POPs por grupo funcional (con parámetros reales)

### Generadores / fuentes

| POP | wiki | params | in/out | usos en corpus |
|---|---|---|---|---|
| `boxPOP` | ✅ | 30 | 1/1 | 0 |
| `spherePOP` | ✅ | 42 | 1/1 | 0 |
| `gridPOP` | ✅ | 41 | 1/1 | 0 |
| `circlePOP` | ✅ | 29 | 1/1 | 0 |
| `linePOP` | ✅ | 36 | 0/1 | 0 |
| `rectanglePOP` | ✅ | 30 | 1/1 | 0 |
| `tubePOP` | ✅ | 31 | 1/1 | 0 |
| `curvePOP` | ✅ | 48 | 1/1 | 0 |
| `planePOP` | ✅ | 25 | 1/1 | 0 |
| `pointPOP` | ✅ | 13 | 0/1 | 0 |
| `pointgeneratorPOP` | ✅ | 43 | 0/1 | 0 |
| `sprinklePOP` | ✅ | 19 | 1/1 | 0 |
| `patternPOP` | ✅ | 62 | 1/1 | 0 |
| `randomPOP` | ✅ | 43 | 1/1 | 0 |
| `torusPOP` | ✅ | 32 | 1/1 | 0 |
| `revolvePOP` | ✅ | 15 | 1/1 | 0 |
| `extrudePOP` | ✅ | 14 | 1/1 | 0 |
| `fileinPOP` | ✅ | 12 | 0/1 | 0 |
| `pointfileinPOP` | ✅ | 37 | 0/1 | 0 |
| `alembicinPOP` | ✅ | 14 | 0/1 | 0 |
| `toptoPOP` | ✅ | 67 | 0/1 | 0 |
| `choptoPOP` | ✅ | 33 | 0/1 | 0 |
| `dattoPOP` | ✅ | 16 | 0/1 | 0 |
| `soptoPOP` | ✅ | 11 | 0/1 | 0 |
| `cplusplusPOP` | ✅ | 10 | 1/1 | 0 |
| `glslPOP` | ✅ | 85 | 1/1 | 0 |
| `glsladvancedPOP` | ✅ | 139 | 1/1 | 0 |
| `glslcopyPOP` | ✅ | 73 | 2/1 | 0 |
| `glslselectPOP` | ✅ | 8 | 0/1 | 0 |

### Modificadores

| POP | wiki | params | in/out | usos en corpus |
|---|---|---|---|---|
| `noisePOP` | ✅ | 62 | 1/1 | 0 |
| `transformPOP` | ✅ | 63 | 2/1 | 0 |
| `mathPOP` | ✅ | 30 | 1/1 | 0 |
| `mathcombinePOP` | ✅ | 66 | 1/1 | 0 |
| `mathmixPOP` | ✅ | 35 | 1/1 | 0 |
| `trigPOP` | ✅ | 21 | 1/1 | 0 |
| `limitPOP` | ✅ | 27 | 1/1 | 0 |
| `normalizePOP` | ✅ | 38 | 1/1 | 0 |
| `rerangePOP` | ✅ | 23 | 1/1 | 0 |
| `quantizePOP` | ✅ | 23 | 1/1 | 0 |
| `twistPOP` | ✅ | 25 | 1/1 | 0 |
| `facetPOP` | ✅ | 19 | 1/1 | 0 |
| `subdividePOP` | ✅ | 10 | 1/1 | 0 |
| `normalPOP` | ✅ | 34 | 1/1 | 0 |
| `attributePOP` | ✅ | 38 | 1/1 | 0 |
| `attributecombinePOP` | ✅ | 14 | 1/1 | 0 |
| `attributeconvertPOP` | ✅ | 12 | 1/1 | 0 |
| `lookupattributePOP` | ✅ | 25 | 2/1 | 0 |
| `lookupchannelPOP` | ✅ | 29 | 1/1 | 0 |
| `lookuptexturePOP` | ✅ | 54 | 1/1 | 0 |
| `texturemapPOP` | ✅ | 51 | 1/1 | 0 |
| `convertPOP` | ✅ | 7 | 1/1 | 0 |
| `polygonizePOP` | ✅ | 17 | 0/1 | 0 |
| `projectionPOP` | ✅ | 27 | 1/1 | 0 |
| `rayPOP` | ✅ | 38 | 2/1 | 0 |
| `revolvePOP` | ✅ | 15 | 1/1 | 0 |
| `skindeformPOP` | ✅ | 22 | 1/1 | 0 |
| `topologyPOP` | ✅ | 62 | 1/1 | 0 |
| `dimensionPOP` | ✅ | 10 | 1/1 | 0 |
| `histogramPOP` | ✅ | 16 | 1/1 | 0 |

### Combinadores / flujo

| POP | wiki | params | in/out | usos en corpus |
|---|---|---|---|---|
| `mergePOP` | ✅ | 13 | 1/1 | 0 |
| `copyPOP` | ✅ | 59 | 2/1 | 0 |
| `blendPOP` | ✅ | 21 | 1/1 | 0 |
| `switchPOP` | ✅ | 16 | 1/1 | 0 |
| `selectPOP` | ✅ | 10 | 1/1 | 0 |
| `groupPOP` | ✅ | 53 | 1/1 | 0 |
| `deletePOP` | ✅ | 47 | 1/1 | 0 |
| `sortPOP` | ✅ | 34 | 1/1 | 0 |
| `cachePOP` | ✅ | 16 | 1/1 | 0 |
| `cacheblendPOP` | ✅ | 16 | 0/1 | 0 |
| `cacheselectPOP` | ✅ | 10 | 0/1 | 0 |
| `feedbackPOP` | ✅ | 16 | 1/1 | 0 |
| `importselectPOP` | ✅ | 33 | 0/1 | 0 |
| `oakselectPOP` | ✅ | 10 | 0/1 | 0 |
| `neighborPOP` | ✅ | 24 | 2/1 | 0 |
| `proximityPOP` | ✅ | 22 | 2/1 | 0 |
| `connectivityPOP` | ✅ | 12 | 1/1 | 0 |
| `analyzePOP` | ✅ | 25 | 1/1 | 0 |
| `primitivePOP` | ✅ | 27 | 1/1 | 0 |
| `trailPOP` | ✅ | 37 | 1/1 | 0 |
| `particlePOP` | ✅ | 50 | 1/1 | 0 |
| `forceradialPOP` | ✅ | 48 | 1/1 | 0 |
| `phaserPOP` | ✅ | 26 | 1/1 | 0 |
| `skinPOP` | ✅ | 10 | 1/1 | 0 |
| `accumulatePOP` | ✅ | 17 | 1/1 | 0 |
| `linebreakPOP` | ✅ | 21 | 1/1 | 0 |
| `linedividePOP` | ✅ | 35 | 1/1 | 0 |
| `linemetricsPOP` | ✅ | 48 | 1/1 | 0 |
| `lineresamplePOP` | ✅ | 18 | 1/1 | 0 |
| `linesmoothPOP` | ✅ | 35 | 1/1 | 0 |
| `zedPOP` | ✅ | 39 | 0/1 | 0 |

### I/O y dispositivos

| POP | wiki | params | in/out | usos en corpus |
|---|---|---|---|---|
| `nullPOP` | ✅ | 6 | 1/1 | 0 |
| `inPOP` | ✅ | 8 | 1/1 | 0 |
| `outPOP` | ✅ | 9 | 1/1 | 0 |
| `fileoutPOP` | ✅ | 27 | 1/1 | 0 |
| `dmxoutPOP` | ✅ | 34 | 1/1 | 0 |
| `dmxfixturePOP` | ✅ | 30 | 1/1 | 0 |
| `engineoutPOP` | — | None | None/None | 0 |

## Patrones de conexión POP→POP (empírico, de proyectos reales)

| desde | hacia | veces | proyectos de ejemplo |
|---|---|---|---|
| `in` | `out` | 235 | 20250823_TDSW, ExampleLensFlare, GLSL Copy POP AnimOffsetInstancesConnectingLines |
| `line` | `merge` | 181 | 20250823_TDSW, ExampleLensFlare, God Rays & POP Fluid Solver - High Performances |
| `circle` | `merge` | 179 | 20250823_TDSW, ExampleLensFlare, GLSLPOPs |
| `transform` | `merge` | 155 | 20250823_TDSW, Attribute_Blur_exmaple, ExampleLensFlare |
| `glsl` | `glsl` | 140 | GLSLPOPs, GaussianSplatting-1.0.30_POPs, God Rays & POP Fluid Solver - High Performances |
| `merge` | `switch` | 113 | 20250823_TDSW, ExampleLensFlare, God Rays & POP Fluid Solver - High Performances |
| `attribute` | `merge` | 70 | Overview, POP_Ray_Scene_240815, POP_Ray_Scene_240815.1 |
| `attribute` | `null` | 69 | CacheSelectGLSLPOP, GLSLPOPs, GaussianSplatting-1.0.30_POPs |
| `mathcombine` | `mathcombine` | 66 | God Rays & POP Fluid Solver - High Performances, God Rays & POP Fluid Solver - Low Performances, POP Fluid Solver - Example Project |
| `tube` | `merge` | 61 | 20250823_TDSW, ExampleLensFlare, God Rays & POP Fluid Solver - High Performances |
| `circle` | `transform` | 60 | CacheSelectGLSLPOP, ExampleLensFlare, GroupPOPBoundingSphere |
| `sphere` | `merge` | 59 | 20250823_TDSW, ExampleLensFlare, GLSLPOPs |
| `copy` | `merge` | 58 | 20250823_TDSW, God Rays & POP Fluid Solver - High Performances, God Rays & POP Fluid Solver - Low Performances |
| `grid` | `merge` | 55 | 20250823_TDSW, ExampleLensFlare, GLSLCreate_ProximityTriangles |
| `grid` | `attribute` | 54 | 20250823_TDSW, GLSLPOPs, Overview |
| `noise` | `noise` | 54 | 20250823_TDSW, GLSLPOPs, JPOPsDev |
| `mathcombine` | `null` | 52 | 20250823_TDSW, GLSLPOPs, JPOPsDev |
| `filein` | `transform` | 52 | ExampleLensFlare, Overview, POPsGuide.0.0 |
| `in` | `null` | 52 | GLSL Copy POP AnimOffsetInstancesConnectingLines, GLSL Copy POP AnimOffsetInstancesConnectingLines.22, GLSL Copy POP Humanoid_AnimOffsetInstances |
| `select` | `glsl` | 52 | GLSL Copy POP Humanoid_AnimOffsetInstances, GLSL Copy POP Humanoid_AnimOffsetInstances.31, GLSL Copy POP Humanoid_AnimOffsetInstancesPOPvsTOP |
| `glsl` | `attribute` | 52 | God Rays & POP Fluid Solver - High Performances, God Rays & POP Fluid Solver - Low Performances, JPOPsDev |
| `mathmix` | `mathmix` | 52 | JPOPsDev, POPsGuide.0.0, Toe_Expand |
| `glsl` | `null` | 50 | AccurateColoring_v, GLSL Copy POP Humanoid_AnimOffsetInstancesPOPvsTOP, GLSL Copy POP Humanoid_AnimOffsetInstancesPOPvsTOP.7 |
| `mathmix` | `null` | 50 | GLSLPOPs, God Rays & POP Fluid Solver - High Performances, God Rays & POP Fluid Solver - Low Performances |
| `noise` | `mathmix` | 49 | 20250823_TDSW, Blending Attributes, JPOPsDev |
| `copy` | `glsl` | 48 | GLSL Copy POP Humanoid_AnimOffsetInstances, GLSL Copy POP Humanoid_AnimOffsetInstances.31, GLSL Copy POP Humanoid_AnimOffsetInstancesPOPvsTOP |
| `noise` | `null` | 46 | 20250823_TDSW, ExampleLensFlare, GLSL Copy POP AnimOffsetInstancesConnectingLines |
| `attribute` | `random` | 46 | God Rays & POP Fluid Solver - High Performances, God Rays & POP Fluid Solver - Low Performances, POP Fluid Solver - Example Project |
| `pointgen` | `attribute` | 46 | God Rays & POP Fluid Solver - High Performances, God Rays & POP Fluid Solver - Low Performances, NeighborBalls |
| `grid` | `noise` | 45 | 20250823_TDSW, AttribManip, ExampleLensFlare |

## Cadenas de 3 POPs (empírico)

- `line` → `merge` → `copy`  (x168)
- `line` → `merge` → `switch`  (x167)
- `circle` → `merge` → `switch`  (x161)
- `line` → `merge` → `merge`  (x158)
- `circle` → `merge` → `copy`  (x153)
- `line` → `merge` → `skin`  (x148)
- `circle` → `merge` → `merge`  (x145)
- `glsl` → `glsl` → `glsl`  (x140)
- `line` → `merge` → `primitive`  (x139)
- `circle` → `merge` → `connectivity`  (x138)
- `circle` → `merge` → `skin`  (x138)
- `line` → `merge` → `connectivity`  (x137)
- `circle` → `merge` → `null`  (x134)
- `circle` → `merge` → `analyze`  (x134)
- `glsl` → `glsl` → `attribute`  (x134)

## GLSL POP

- Shaders indexados del corpus: **62**
- Biblioteca propia del repo: `glsl_files/*.glsl`
- Regla verificada: GLSL POP necesita entrada POP (p.ej. `boxPOP`) y `outputattrs='P'`
