# Validación del conocimiento POP contra la wiki oficial

- **TD build vivo:** TouchDesigner 2025.31760 · **POPs creados en vivo:** 96/97 · **ok_con_input: 78/97** (corrida 2026-09-16, `docs/pop_matrix.json`)
- **Corrida previa (2025.32460):** 100/101 creados, 80 ok_con_input — los conteos por build cambian (alembicoutPOP, textPOP, triangulatePOP no existen en 31760; particlePOP pasa a error_con_input)
- **Fuente oficial:** `https://docs.derivative.ca/api.php?action=query&list=categorymembers&cmtitle=Category:POPs` → **106 páginas** en Category:POPs
- Cruce: **100 POPs coinciden**, 1 solo en TD, 6 solo en la wiki

## Método de validación (actualizado 2026-09-12)

**ANTES:** el test `test_pop_matrix.py` contaba `created_ok` basándose solo en que `create()` no lanzara excepción. TD recién reporta errores cuando el POP cocina, así que el reporte era un falso verde.

**AHORA:** después de crear cada POP se corre `p.cook(force=True)`, se leen `p.errors()` y `p.warnings()`, y se cuanta geometría real con `int(p.numPoints())` y `int(p.numPrims())`. Un POP cuenta como OK real solo si: creación sin excepción + cook sin excepción + sin errores + `numPoints() > 0`.

> **Importante:** `numPoints()` y `numPrims()` son MÉTODOS en la clase POP de TD, no propiedades. Usarlos como atributos devuelve un builtin y rompe comparaciones.

## Matriz estricta con fuente (corrida 2026-09-16, TD TouchDesigner 2025.31760: 78/97 ok)

> Corrida previa 2026-09-12 (TD 2025.32460): 80/101 ok. El build 31760 no tiene
> alembicoutPOP/textPOP/tracePOP/triangulatePOP y particlePOP requiere atributo P real
> en su fuente, así que pasa de sin_geometria a error_con_input.

### Resumen de la corrida 2025.31760 (97 tipos, sandbox /project1/pop_matrix_live5)

| ✅ ok_con_input | ❌ error_con_input | ➖ sin_geometria | 🚫 no_creable |
|---|---|---|---|
| **78** | **9** | **9** | **1** |

Los 9 con error (motivo real de TD): alembicinPOP (no hay alembicoutPOP en este build para
crear el .abc fuente), cplusplusPOP (requiere .dll compilado), importselectPOP (requiere
contexto USD), lookupchannelPOP (requiere CHOP real con canales nombrados), particlePOP
(requiere atributo P en la fuente), polygonizePOP (requiere TOP de altura), rayPOP
(requiere atributo de colisión), skindeformPOP (requiere BonePathsAttrib), zedPOP
(requiere SDK ZED instalado).

Los 9 sin geometría: cacheblendPOP, cacheselectPOP (requieren cachePOP con caches
pobladas), choptoPOP, dattoPOP, soptoPOP, toptoPOP (requieren fuente de OTRA familia con
datos reales), dmxoutPOP (salida DMX), glslselectPOP, oakselectPOP (requieren contexto
de render/hardware).

## Corrida previa (2026-09-12 18:41, TD TouchDesigner 2025.32460: 80/101 ok)

### Método v5 — cada POP bajo prueba recibe fuente boxPOP

**Problema de la v3:** la matriz creaba cada POP **sin alimentarlo**, así que 68 tipos
reportaban `Error: Not enough sources specified` o `Error: No input POP`: el dato medido
era real pero no respondía la pregunta útil (¿el tipo funciona si lo usás bien?).

**Método actual:** para cada tipo POP se crean fuentes `boxPOP` (2×2×2, div 4×4×4) —
**una por cada input connector del tipo (hasta 3)** — y se conectan con la receta
verificada `src.outputConnectors[0].connect(dst.inputConnectors[i])`. Después:
`p.cook(force=True)` → `p.errors()` → `int(p.numPoints())` / `int(p.numPrims())`
(**métodos**, no propiedades). Las fuentes no usadas se destruyen: la matriz queda legible.

> La fuente por defecto del build (boxPOP) es válida para inputs de geometría; los errores
> residuales son de tipos que exigen **otra familia** de input (CHOP, TOP, atributo especial)
> o un contexto particular — ver tabla de errores.

### Clasificación (4 categorías EXCLUYENTES — 101/101 tipos)

| categoría | count | criterio |
|---|---|---|
| ✅ ok_con_input | 80 | cocina sin errores, sin excepciones, numPoints() > 0 |
| ❌ error_con_input | 8 | TD reporta errors() después del cook (cada uno con motivo concreto) |
| ➖ sin_geometria_con_input | 12 | cocina limpio pero numPoints() == 0 (inputs de otra familia u output puro) |
| 🚫 no_creable | 1 | create() lanza excepción |

### ✅ ok_con_input (80) — geometría real CON fuente

| tipo | detalle |
|---|---|
| `accumulatePOP` | in=1 out=1 · fuente→input[0] · pts=8 prims=6 |
| `alembicoutPOP` | in=1 out=1 · fuente→input[0] · pts=8 prims=6 |
| `analyzePOP` | in=1 out=1 · fuente→input[0] · pts=1 prims=1 |
| `attributePOP` | in=1 out=1 · fuente→input[0] · pts=8 prims=6 |
| `attributecombinePOP` | in=1 out=1 · fuente→input[0] · pts=8 prims=6 |
| `attributeconvertPOP` | in=1 out=1 · fuente→input[0] · pts=8 prims=6 |
| `blendPOP` | in=1 out=1 · fuente→input[0] · pts=8 prims=6 |
| `boxPOP` | in=1 out=1 · fuente→input[0] · pts=8 prims=6 |
| `cachePOP` | in=1 out=1 · fuente→input[0] · pts=8 prims=6 |
| `circlePOP` | in=1 out=1 · fuente→input[0] · pts=40 prims=1 |
| `connectivityPOP` | in=1 out=1 · fuente→input[0] · pts=8 prims=1 |
| `convertPOP` | in=1 out=1 · fuente→input[0] · pts=8 prims=6 |
| `copyPOP` | in=2 out=1 · fuente→input[0, 1] · pts=64 prims=48 |
| `curvePOP` | in=1 out=1 · fuente→input[0] · pts=1000 prims=1 |
| `deletePOP` | in=1 out=1 · fuente→input[0] · pts=8 prims=6 |
| `dimensionPOP` | in=1 out=1 · fuente→input[0] · pts=8 prims=6 |
| `dmxfixturePOP` | in=1 out=1 · fuente→input[0] · pts=8 prims=6 |
| `extrudePOP` | in=1 out=1 · fuente→input[0] · pts=32 prims=30 |
| `facetPOP` | in=1 out=1 · fuente→input[0] · pts=8 prims=6 |
| `feedbackPOP` | in=1 out=1 · fuente→input[0] · pts=8 prims=6 |
| `fieldPOP` | in=1 out=1 · fuente→input[0] · pts=8 prims=6 |
| `fileinPOP` | in=0 out=1 · generador (sin fuente) · pts=80 prims=64 |
| `fileoutPOP` | in=1 out=1 · fuente→input[0] · pts=8 prims=6 |
| `forceradialPOP` | in=1 out=1 · fuente→input[0] · pts=8 prims=6 |
| `glslPOP` | in=1 out=1 · fuente→input[0] · pts=8 prims=6 |
| `glsladvancedPOP` | in=1 out=1 · fuente→input[0] · pts=8 prims=6 |
| `glslcopyPOP` | in=2 out=1 · fuente→input[0, 1] · pts=64 prims=48 |
| `gridPOP` | in=1 out=1 · fuente→input[0] · pts=400 prims=361 |
| `groupPOP` | in=1 out=1 · fuente→input[0] · pts=8 prims=6 |
| `histogramPOP` | in=1 out=1 · fuente→input[0] · pts=8 prims=6 |
| `inPOP` | in=1 out=1 · fuente→input[0] · pts=8 prims=6 |
| `limitPOP` | in=1 out=1 · fuente→input[0] · pts=8 prims=6 |
| `linePOP` | in=0 out=1 · generador (sin fuente) · pts=21 prims=1 |
| `linebreakPOP` | in=1 out=1 · fuente→input[0] · pts=8 prims=3 |
| `linedividePOP` | in=1 out=1 · fuente→input[0] · pts=8 prims=6 |
| `linemetricsPOP` | in=1 out=1 · fuente→input[0] · pts=8 prims=6 |
| `lineresamplePOP` | in=1 out=1 · fuente→input[0] · pts=8 prims=6 |
| `linesmoothPOP` | in=1 out=1 · fuente→input[0] · pts=8 prims=6 |
| `lookupattributePOP` | in=2 out=1 · fuente→input[0, 1] · pts=8 prims=6 |
| `lookuptexturePOP` | in=1 out=1 · fuente→input[0] · pts=8 prims=6 |
| `mathPOP` | in=1 out=1 · fuente→input[0] · pts=8 prims=6 |
| `mathcombinePOP` | in=1 out=1 · fuente→input[0] · pts=8 prims=6 |
| `mathmixPOP` | in=1 out=1 · fuente→input[0] · pts=8 prims=6 |
| `mergePOP` | in=1 out=1 · fuente→input[0] · pts=8 prims=6 |
| `neighborPOP` | in=2 out=1 · fuente→input[0, 1] · pts=8 prims=6 |
| `noisePOP` | in=1 out=1 · fuente→input[0] · pts=8 prims=6 |
| `normalPOP` | in=1 out=1 · fuente→input[0] · pts=8 prims=6 |
| `normalizePOP` | in=1 out=1 · fuente→input[0] · pts=8 prims=6 |
| `nullPOP` | in=1 out=1 · fuente→input[0] · pts=8 prims=6 |
| `outPOP` | in=1 out=1 · fuente→input[0] · pts=8 prims=6 |
| `patternPOP` | in=1 out=1 · fuente→input[0] · pts=8 prims=6 |
| `phaserPOP` | in=1 out=1 · fuente→input[0] · pts=8 prims=6 |
| `planePOP` | in=1 out=1 · fuente→input[0] · pts=400 prims=361 |
| `pointPOP` | in=0 out=1 · generador (sin fuente) · pts=1 prims=1 |
| `pointfileinPOP` | in=0 out=1 · generador (sin fuente) · pts=49106 prims=49106 |
| `pointgeneratorPOP` | in=0 out=1 · generador (sin fuente) · pts=10000 prims=10000 |
| `primitivePOP` | in=1 out=1 · fuente→input[0] · pts=8 prims=6 |
| `projectionPOP` | in=1 out=1 · fuente→input[0] · pts=8 prims=6 |
| `proximityPOP` | in=2 out=1 · fuente→input[0, 1] · pts=16 prims=8 |
| `quantizePOP` | in=1 out=1 · fuente→input[0] · pts=8 prims=6 |
| `randomPOP` | in=1 out=1 · fuente→input[0] · pts=8 prims=6 |
| `rectanglePOP` | in=1 out=1 · fuente→input[0] · pts=4 prims=1 |
| `rerangePOP` | in=1 out=1 · fuente→input[0] · pts=8 prims=6 |
| `selectPOP` | in=1 out=1 · fuente→input[0] · pts=8 prims=6 |
| `skinPOP` | in=1 out=1 · fuente→input[0] · pts=8 prims=20 |
| `sortPOP` | in=1 out=1 · fuente→input[0] · pts=8 prims=6 |
| `spherePOP` | in=1 out=1 · fuente→input[0] · pts=252 prims=500 |
| `sprinklePOP` | in=1 out=1 · fuente→input[0] · pts=10000 prims=10000 |
| `subdividePOP` | in=1 out=1 · fuente→input[0] · pts=26 prims=48 |
| `switchPOP` | in=1 out=1 · fuente→input[0] · pts=8 prims=6 |
| `textPOP` | in=0 out=1 · generador (sin fuente) · pts=2316 prims=772 |
| `texturemapPOP` | in=1 out=1 · fuente→input[0] · pts=8 prims=6 |
| `topologyPOP` | in=1 out=1 · fuente→input[0] · pts=8 prims=6 |
| `torusPOP` | in=1 out=1 · fuente→input[0] · pts=800 prims=800 |
| `trailPOP` | in=1 out=1 · fuente→input[0] · pts=8 prims=8 |
| `transformPOP` | in=2 out=1 · fuente→input[0, 1] · pts=8 prims=6 |
| `triangulatePOP` | in=1 out=1 · fuente→input[0] · pts=8 prims=6 |
| `trigPOP` | in=1 out=1 · fuente→input[0] · pts=8 prims=6 |
| `tubePOP` | in=1 out=1 · fuente→input[0] · pts=400 prims=360 |
| `twistPOP` | in=1 out=1 · fuente→input[0] · pts=8 prims=6 |

### ❌ error_con_input (8) — el motivo concreto, ya con fuente conectada

| tipo | detalle |
|---|---|
| `cplusplusPOP` | in=1 · Error: Error reading file "" |
| `importselectPOP` | in=0 · Error: Import Select POP must be contained within a USD or FBX COMP, or have one specified |
| `lookupchannelPOP` | in=1 · Error: CHOP not found |
| `polygonizePOP` | in=1 · Error: Input POP needs to have 3 dimensions, use Trace POP for POPs with 2 dimensions. |
| `rayPOP` | in=2 · Error: Attribute not found. |
| `skindeformPOP` | in=1 · Error: BonePathsAttrib attribute not found |
| `tracePOP` | in=1 · Error: Input POP needs to have 2 dimensions, use Polygonize POP for POPs with 3 dimensions |
| `zedPOP` | in=0 · Error: ZED TOP parameter must point to a ZED TOP. |

### ➖ sin_geometria_con_input (12) — sin errores, requieren input de OTRA familia

| tipo | detalle |
|---|---|
| `alembicinPOP` | in=0 · requiere TOP/DAT/SOP/CHOP/alembic |
| `cacheblendPOP` | in=0 · requiere TOP/DAT/SOP/CHOP/alembic |
| `cacheselectPOP` | in=0 · requiere TOP/DAT/SOP/CHOP/alembic |
| `choptoPOP` | in=0 · requiere TOP/DAT/SOP/CHOP/alembic |
| `dattoPOP` | in=0 · requiere TOP/DAT/SOP/CHOP/alembic |
| `dmxoutPOP` | in=1 · wired=[0] pero pts=0 |
| `glslselectPOP` | in=0 · requiere TOP/DAT/SOP/CHOP/alembic |
| `oakselectPOP` | in=0 · requiere TOP/DAT/SOP/CHOP/alembic |
| `particlePOP` | in=1 · wired=[0] pero pts=0 |
| `revolvePOP` | in=1 · wired=[0] pero pts=0 |
| `soptoPOP` | in=0 · requiere TOP/DAT/SOP/CHOP/alembic |
| `toptoPOP` | in=0 · requiere TOP/DAT/SOP/CHOP/alembic |

### 🚫 no_creable (1)

| tipo | detalle |
|---|---|
| `engineoutPOP` | tdError: Invalid number or type of arguments. See help for details. Value:(<class 'td.engi |

### Comparación con la corrida sin fuente (v3)

| | v3 (sin fuente) | v5 (con fuente por input) |
|---|---|---|
| con geometría real | 17 | **80** |
| con errores de TD | 68 | 8 |
| sin geometría | 84 | 12 |
| no creable | 1 | 1 |

> En v3 los "errores" eran casi todos `Not enough sources specified` / `No input POP`:
> el resultado medido era real pero trivial. En v5 los 8 errores
> residuales son requisitos genuinos (CHOP, TOP 2D/3D, atributo de deformación, archivo,
> contexto USD/FBX, device ZED/OAK), no falta de fuente.

### Datos crudos
- JSON: `docs/pop_matrix.json` (claves nuevas: `categories`, `ok_con_input_count`,
  `no_creables`, `wired_count`, `multi_source_count`, `method`; se mantiene
  `ok_real` como alias de `ok_con_input_count` para los consumers viejos).
- Sandbox visible en TD: `/project1/pop_matrix_live4` (100 operadores, fuentes eliminadas salvo las conectadas).

## POPs por categoría de validación (corrida v3 2026-09-12) — SUPERADO

> ⚠️ **Superado por la Matriz estricta con fuente (método v5) de arriba.**
> Esta sección se conserva como histórico: las categorías "Fixable / No aplicable / Con errores"
> eran estimaciones hechas SIN fuente conectada (68 "errores" eran solo falta de input).
> La clasificación por evidencia vigente está en la sección v5.

### ✅ OK real (con geometría después de cook forzado): 16/101

| tipo | numPoints | numPrims | nota |
|---|---|---|---|
| boxPOP | 8 | 6 | Fuente geométrica básica |
| circlePOP | ~24 | ~24 | Círculo de points |
| curvePOP | ~8 | ~8 | Curva de símbolo |
| fileinPOP | variable | variable | Depende del archivo |
| gridPOP | 12 | 6 | Rejilla 2x2 por defecto |
| linePOP | ~8 | ~8 | Línea simple |
| patternPOP | 8 | 6 | Patrón de símbolos |
| planePOP | 8 | 2 | Plano XY |
| pointPOP | 4 | 0 | Puntos aislados |
| pointfileinPOP | variable | variable | Depende del archivo |
| pointgeneratorPOP | 4 | 0 | Generador de puntos |
| rectanglePOP | 8 | 2 | Rectángulo |
| spherePOP | ~16 | ~32 | Esfera (default subdivisions) |
| textPOP | variable | variable | Depende del texto |
| torusPOP | 32 | 64 | Toroide (default) |
| tubePOP | 32 | 64 | Tubo (default) |

### 🔧 Fixable (sin geometría porque necesitan input/config): ~55/101

Estos POPs NO tienen errores pero tampoco geometría porque necesitan ser conectados a una fuente o configurados:

| Categoría | Ejemplos | Config necesaria |
|---|---|---|
| Input POP (1 fuente) | accumulatePOP, analyzePOP, attributePOP, blendPOP, cachePOP, connectivityPOP, convertPOP, deletePOP, dimensionPOP, fieldPOP, neighborpOP, normalPOP, etc. | Conectar boxPOP → inputConnectors[0] |
| Input POP (2+ fuentes) | copyPOP, mathPOP, mergePOP, switchPOP, trailPOP, transformPOP, etc. | Conectar 2+ POPs fuente |
| TOP input | choptoPOP, lookuptexturePOP, texturemappOP, tracePOP, polygonizePOP, toptoPOP | Necesitan TOP creado y referenciado |
| DAT input | dattoPOP | Necesitan DAT con datos |
| SOP input | soptoPOP | Necesitan SOP creado |
| Shader GLSL | glslPOP, glsladvancedPOP, glslcopyPOP, glslselectPOP | Necesitan DAT con shader GLSL válido |

### ❌ No se puede validar geometría (output operators o especiales): ~13/101

| tipo | razón |
|---|---|
| alembicoutPOP | Output operator - exporta a archivo |
| cacheblendPOP | Cache blend - no produce geometría directamente |
| cacheselectPOP | Cache select - no produce geometría directamente |
| dmxfixturePOP | DMX fixture - output only |
| dmxoutPOP | DMX output - no produce geometría |
| fileoutPOP | Output operator - exporta a archivo |
| forceradialPOP | Force operator - no produce geometría |
| groupPOP | Group operator - no produce geometría |
| histogramPOP | Histogram - no produce geometría |
| importselectPOP | Requiere USD/FBX COMP - no tiene sentido en baseCOMP |
| inPOP | Input operator - no produce geometría |
| oakselectPOP | OAK select - no produce geometría |
| outPOP | Output operator - no produce geometría |
| primitivePOP | Primitive operator - no produce geometría |
| topologyPOP | Topology operator - no produce geometría |
| zedPOP | Requiere ZED TOP específico |

### ⚠️ Con errores de TD (necesitan más configuración): ~68/101

| Error común | Tipos afectados | Solución |
|---|---|---|
| "Not enough sources specified" | accumulatePOP, analyzePOP, attributePOP, cachePOP, connectivityPOP, convertPOP, deletePOP, dimensionPOP, fieldPOP, mathPOP, mergePOP, etc. (55 tipos) | Conectar 1+ POPs fuente |
| "No input POP" | alembicoutPOP, attributecombinePOP, blendPOP, glslPOP, glsladvancedPOP, mathcombinePOP, mathmixPOP, mergePOP (8 tipos) | Conectar boxPOP a input 0 |
| "Error reading file" | cplusplusPOP | Configurar archivo C++ válido |
| "Invalid source TOP specified" | polygonizePOP, tracePOP | Crear y referenciar TOP |
| "ZED TOP parameter must point to a ZED TOP" | zedPOP | Configurar ZED TOP |
| "Import Select POP must be contained within a USD or FBX COMP" | importselectPOP | Mover a USD/FBX COMP |
| engineoutPOP | create() falla con excepción | No creable en baseCOMP |

## Estado del test test_pop_matrix.py (v5 — con fuente por input)

- **Total POPs descubiertos:** 101 tipos
- **Creados sin excepción:** 100/101 (engineoutPOP falla en create → `no_creable`)
- **ok_con_input:** 80/101 (cocina limpio + numPoints() > 0 CON fuente boxPOP conectada)
- **error_con_input:** 8/101 (cada uno con motivo concreto: CHOP, TOP 2D/3D, atributo, archivo, contexto)
- **sin_geometria_con_input:** 12/101 (requieren input de otra familia: TOP/DAT/SOP/CHOP/alembic)
- **no_creable:** 1/101 (engineoutPOP)

> **Nota:** El test valora `ok_con_input >= 25` como PASS (la corrida sin fuente daba 17).
> Con el método v5 da 80: cada tipo tiene su categoría por EVIDENCIA (geometría real con input),
> no por "no lanzó excepción".

### Método v6 (implementado 2026-09-13, re-corrida pendiente de TD)

Los 12 `sin_geometria_con_input` de v5 reciben ahora fuente de SU PROPIA FAMILIA en vez de
un boxPOP que no pueden consumir: `choptoPOP←noiseCHOP`, `toptoPOP←noiseTOP`,
`soptoPOP←sphereSOP`, `dattoPOP←tableDAT` (con filas), `revolvePOP←linePOP` (curva, no caras),
`cacheblendPOP`/`cacheselectPOP←box→cachePOP`, `particlePOP←sprinklePOP+feedbackPOP` (in1 =
estado del frame previo, 4 cooks), `alembicinPOP←alembicoutPOP` (escribe un `.abc` real),
`glslselectPOP←boxPOP`. Los temporal-dependientes cocinan varios frames. Quedan en
`sin_geometria_con_input` solo `dmxoutPOP` (salida DMX, sin input que genere geometría) y
`oakselectPOP` (cámara OAK-D hardware) — ahora con evidencia, no por fuente equivocada.
Efecto esperado: hasta 9 tipos podrían migrar a `ok_con_input` (≤89, dentro del guard +10
del gate nocturno). Al re-corre la matriz y confirmar, promover nuevo baseline:
`python toe/src/test_pop_matrix.py` → `tests/test_pop_matrix_baseline.py` → commit del JSON.
La re-corrida quedó bloqueada: el bridge HTTP de TD sigue caído (puerto enlazado, TCP rechazado,
verificado 2026-09-13); el script reporta `RESULT: TD_UNREACHABLE` (exit 3).

## Redes POP canónicas — test_pop_networks.py (pass rate actual)

| Métrica | Valor | Fuente |
|---|---|---|
| Última corrida real registrada | **10/10 redes OK** (100%), 29 conexiones, 0 errores TD | `docs/pop_networks.json` (2026-09-11T22:23, TD 2025.32460) |
| Corrida posterior a la mejora de la matriz (v5, 2026-09-12) | **no ejecutada aún** — TD quedó inaccesible (bridge HTTP caído) desde la sesión del 12/09 | verificado 2026-09-13: puerto 44444 enlazado, TCP rechazado |

Redes validadas por la suite (verificación por evidencia: cook forzado + `errors()` + conexiones reales + `/verify` del árbol):
`basic_chain`, `copy_instancing`, `particles_solver`, `trail_line_strip`, `merge_switch`,
`math_ops_chain`, `glsl_shader`, `line_divide_resample`, `feedback_loop`, `field_deform`.

> Estas redes usan solo tipos clasificados `ok_con_input` en la matriz v5 (80/101), por lo que
> el pass rate 10/10 es consistente con la matriz. El método de la matriz mejoró después de la
> última corrida de esta suite; re-corriendo `python toe/src/test_pop_networks.py` cuando TD
> responda se refresca este número (la suite es idempotente: destruye y recrea su contenedor).
> Si TD no responde, la suite ahora reporta `RESULT: TD_UNREACHABLE` (exit 3) en vez de tracebacks.

## Baseline nocturna — CI falla si ok_con_input baja de 80

`docs/pop_matrix.json` es el **baseline versionado** (80/101 `ok_con_input`, TD 2025.32460,
corrida v5 del 12/09 con fuente boxPOP por input). El gate nocturno compara cada corrida
fresca contra **git HEAD** (no contra el working tree), así que la comparación es estable:

- **Falla CI** si `ok_con_input_count` baja del baseline (regresión de evidencia real).
- **Falla CI** si sube más de +10 de golpe (corrida sospechosa — típicamente un gate roto
  que ya no lee `errors()` tras el cook).
- **Falla CI** si un tipo que era `ok_con_input` deja de crearse, o desaparece del run
  (cambio de forma del build de TD).
- **Falla CI** si TD está caído o el bridge colgado (puerto enlazado, TCP rechazado):
  TD intesteable es build rojo, no pass silencioso.
- Permite `SKIP_LIVE_REQUIRED=1` para corridas offline explícitas (skips, no pasa falso).

Componentes:

- `scripts/check_pop_matrix_baseline.py` — el gate (tests offline: `tests/test_pop_matrix_baseline.py`, 19 tests).
- `.github/workflows/td-nightly.yml` — workflow nocturno (cron 04:00 UTC + manual):
  - job `offline-gate` (GitHub-hosted): suite del checker + tests Node + integridad del baseline commiteado;
  - job `live-gate` (runner `self-hosted, touchdesigner` en la máquina de TD): probe del bridge →
    `python toe/src/test_pop_matrix.py --keep` → gate → artifact con el JSON fresco (14 días).
- **Auto-commit de metadata (después de un PASS):** si el JSON fresco difiere del baseline
  commiteado pero la EVIDENCIA es idéntica (mismo `type_count` y misma categoría por tipo —
  solo se movieron `generated_at`/`td_build`/`sandbox`/`method`), el gate lo commitea él mismo
  (`chore(pop-matrix): refresh baseline metadata ...`) y el workflow lo pushea, de modo que la
  próxima noche compara contra metadata corriente. Un cambio de EVIDENCIA (cualquier movimiento
  de categoría, tipo nuevo o desaparecido) NUNCA se auto-commitea: el gate lo reporta como
  `evidence-changed` y exige revisión manual del commit para adoptar el nuevo baseline.
  Clasificador puro testeado offline (`classify_run`: `identical` / `metadata-only` /
  `evidence-changed`); en corridas locales, `--no-autocommit` desactiva el comportamiento.

Para activar el job live: registrar un runner self-hosted con labels `self-hosted, touchdesigner`
en la máquina con TD abierto (API en 127.0.0.1:44444) y Python en PATH. Sin runner, el job
queda en espera pero el job offline sigue corriendo cada noche.

Para promover un nuevo baseline tras un upgrade de TD verificado:

    python toe/src/test_pop_matrix.py          # regenera docs/pop_matrix.json
    python tests/test_pop_matrix_baseline.py   # suite del checker en verde
    git add docs/pop_matrix.json && git commit -m "data(pop-matrix): re-baseline after TD <build>"

## POPs presentes en TouchDesigner pero SIN página en la wiki

| tipo TD | creado en vivo | params reales |
|---|---|---|
| `engineoutPOP` | ❌ | - |

> Marcados como **no documentados oficialmente al día de hoy** — no inferir su comportamiento: probarlos en vivo.

## Páginas de la wiki sin operador en el build actual

`glslcreatePOP`, `linethickPOP`, `pointsverticesandprimitivesinpops`, `pop`, `scriptPOP`, `timefilterPOP`

### Sondeo en vivo de esos tipos (¿existen en el build?)

| tipo | clase en `td` | creable por nombre | nota |
|---|---|---|---|
| `glslcreatePOP` | no | no | Unknown operator type. Value:'glslcreatePOP' Type:<class 'str'>. |
| `linethickPOP` | no | no | Unknown operator type. Value:'linethickPOP' Type:<class 'str'>. |
| `pointsverticesandprimitivesinpops` | no | no | Unknown operator type. Value:'pointsverticesandprimitivesinpops' Type:<class 'str'>. |
| `pop` | no | no | Unknown operator type. Value:'pop' Type:<class 'str'>. |
| `scriptPOP` | no | no | Unknown operator type. Value:'scriptPOP' Type:<class 'str'>. |
| `timefilterPOP` | no | no | Unknown operator type. Value:'timefilterPOP' Type:<class 'str'>. |
| `engineoutPOP` | sí | no | Invalid number or type of arguments. See help for details. Value:('engineoutPOP', 'engineoutpop') Type:<class 'tuple'>. |

> Interpretación: *clase no / creable no* = el build instalado no tiene ese operador (la wiki puede ir adelante del build). *clase sí / creable no* = existe pero `create()` no lo acepta en un baseCOMP (requiere contexto propio).

## Cobertura de parámetros (wiki oficial ↔ build instalado)

Fuente autoritativa: plantillas `{{Parameter}}` de la wiki (`parLabel` + `parName`). Cache: `mcp/data/pops/wiki_params.json` (2026-09-10 13:59:45).

- Parámetros documentados (POPs en común): **1916**
- Confirmados en el build: **1609**
- Documentados pero **ausentes en este build**: **296** → son *drift*, no usarlos sin verificar

| POP | params wiki | confirmados en build | drift (doc sin build) |
|---|---|---|---|
| DAT to POP | 34 | 8 | cnvrtallpointcols, cnvrtallprimcols, cnvrtallvertcols |
| Triangulate POP | 11 | 4 | connectholes, exceedmaxverts, hwraytracing |
| Limit POP | 18 | 9 | attrdefaultval, max, maxtype |
| Phaser POP | 17 | 9 | attrdefaultval, edge, fromhigh |
| Pattern POP | 29 | 16 | attrdefaultval, bias, exp |
| Lookup Texture POP | 23 | 13 | attrdefaultval, cyclic, fromhigh |
| Normalize POP | 17 | 10 | attrdefaultval, bias, exp |
| Math POP | 21 | 13 | attrdefaultval, fromhigh, fromlow |
| Point Generator POP | 21 | 13 | p, pointa, pointb |

## Corrida v7 (2026-09-17, TD 2025.31760) — fuentes específicas por tipo

Extensión de la v6: los POPs que se alimentan por **par-path** (0 inputs) y los
que requieren setups especiales reciben su fuente real. Resultado: **89/97
`ok_con_input`** (v6: 78). Quedan fuera 8, todos con dependencias externas
legítimas:

| tipo | categoría | razón medida |
|---|---|---|
| alembicinPOP | error_con_input | requiere archivo .abc real (esta build no tiene alembicoutPOP) |
| cplusplusPOP | error_con_input | requiere plugin C++ compilado (`Error reading file ""`) |
| importselectPOP | error_con_input | requiere COMP USD/FBX con red cargada (`Invalid geometry name` en usdCOMP vacío) |
| skindeformPOP | error_con_input | requiere red de rig/bones (`BonePathsAttrib attribute not found`) |
| zedPOP | error_con_input | requiere SDK ZED (`TensorRT is not found`) |
| dmxoutPOP | sin_geometria_con_input | salida DMX (hardware), no genera geometría |
| oakselectPOP | sin_geometria_con_input | cámara OAK-D (hardware), no genera geometría |
| engineoutPOP | no_creable | `create()` lanza `Invalid number or type of arguments` |

### Recetas validadas en vivo (v7) — todas con 0 errores y numPoints()>0

| POP bajo prueba | fuente | cableado |
|---|---|---|
| choptoPOP | noiseCHOP | par `chop=<path>` (0 inputs) |
| toptoPOP | noiseTOP | par `input0top=<path>` (0 inputs) |
| soptoPOP | sphereSOP | par `sop=<path>` (0 inputs) |
| dattoPOP | tableDAT con texto | par `pointsdat=<path>` (0 inputs) |
| lookupchannelPOP | noiseCHOP + boxPOP | par `chop=<path>` **y** input0 POP |
| polygonizePOP | noiseTOP | par `top=<path>` (0 inputs) |
| cacheblendPOP / cacheselectPOP | box→cachePOP | par `cachepop=<path>` (0 inputs) |
| particlePOP | boxPOP + feedbackPOP en input1 | input0 + `initializepulse.pulse()` + `preroll=2.0` |
| rayPOP | box→normalPOP (input0, N real) + spherePOP (input1) | 2 inputs fijos |
| glslselectPOP | glsladvancedPOP con `extraout=True`, `extraout0name='myout'`, `extraout0pop=<boxPOP>` | par `pop=<path>` + `name='myout'` |

Notas de la corrida v7:

- El descubrimiento clave: **8 POPs no tienen inputs** — se alimentan por
  parámetro tipo OP (`chop`, `sop`, `pointsdat`, `top`, `cachepop`, `pop`).
- glslselectPOP solo acepta **outputs con nombre**: el glslPOP básico no nombra
  su output (0 puntos sin error, nombres arbitrarios → `Invalid Output Name`);
  la vía viva es glsladvancedPOP + extra outputs (Regla 5: el diagnóstico real
  salió del infoDAT `*_info`, que mostró `'P' : undeclared identifier` para el
  shader escrito a mano en glsladvancedPOP).
| Quantize POP | 14 | 9 | attrdefaultval, quantcompare, quantize |
| ReRange POP | 14 | 9 | attrdefaultval, fromhigh, fromlow |
| Grid POP | 21 | 14 | line, plane, r |
| Texture Map POP | 27 | 18 | attrdefaultval, cameraaspect, center |
| Random POP | 31 | 21 | amp, attrdefaultval, conedir |
| Field POP | 38 | 27 | combineattrdefaultval, p, pointa |
| Math Combine POP | 42 | 30 | attr0defaultval, color0rgb, post0fromhigh |
| TOP to POP | 35 | 25 | attr0defaultval, center, focallengths |
| Torus POP | 19 | 14 | angleu, anglev, r |

### Ejemplo de mapeo verificado (Triangulate POP)

| label wiki | nombre eval (build) | label en el build | tipo wiki | estilo build |
|---|---|---|---|---|
| Mode | `mode` | Mode | Menu | Menu |
| Max Verts per Input Line Strip | `lsmaxverts` | Max Verts per Input Line Strip | Int | Int |
| Max Iterations | `maxiter` | Max Iterations | Int | Int |
| Triangulate Quads | `triangulatequads` | Triangulate Quads | Toggle | Toggle |

## Verificación en vivo de páginas de la wiki (muestra)

| página | categorías | experimental | params de wiki detectados |
|---|---|---|---|
| Accumulate POP | POPs | no | 8 |
| Alembic In POP | POPs | no | 22 |
| Alembic Out POP | OP_Help_Common_Pages, POPs | no | 25 |
| Analyze POP | POPs | no | 19 |
| Attribute POP | POPs | no | 28 |
| Attribute Combine POP | POPs | no | 7 |

## GLSL POP

- Funciones usadas por nuestra biblioteca: —
- Confirmadas en la doc oficial (*Write a GLSL POP*): —
- Página GLSL POP accesible: sí

## Regla de oro para el conocimiento guardado

Cada dato POP se etiqueta con su fuente: **wiki oficial** (autoritativa) · **live TD** (comportamiento real del build) · **corpus .toe** (empírico, no normativo). Sin etiqueta → no se guarda.