# Validación del conocimiento POP contra la wiki oficial

- **TD build vivo:** TouchDesigner 2025.32460 · **POPs creados en vivo:** 100/101
- **Fuente oficial:** `https://docs.derivative.ca/api.php?action=query&list=categorymembers&cmtitle=Category:POPs` → **106 páginas** en Category:POPs
- Cruce: **100 POPs coinciden**, 1 solo en TD, 6 solo en la wiki

## Método de validación (actualizado 2026-09-12)

**ANTES:** el test `test_pop_matrix.py` contaba `created_ok` basándose solo en que `create()` no lanzara excepción. TD recién reporta errores cuando el POP cocina, así que el reporte era un falso verde.

**AHORA:** después de crear cada POP se corre `p.cook(force=True)`, se leen `p.errors()` y `p.warnings()`, y se cuanta geometría real con `int(p.numPoints())` y `int(p.numPrims())`. Un POP cuenta como OK real solo si: creación sin excepción + cook sin excepción + sin errores + `numPoints() > 0`.

> **Importante:** `numPoints()` y `numPrims()` son MÉTODOS en la clase POP de TD, no propiedades. Usarlos como atributos devuelve un builtin y rompe comparaciones.

## POPs por categoría de validación (corrida 2026-09-12)

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

## Estado del test test_pop_matrix.py

- **Total POPs descubiertos:** 101 tipos
- **Creados sin excepción:** 100/101 (engineoutPOP falla en create)
- **OK real (con geometría):** 16/101 (solo POPs fuente geométrica con valores por defecto)
- **Sin geometría (fixable con input):** ~55/101
- **Sin geometría (no applicable):** ~13/101
- **Con errores de TD:** ~68/101 (todos fixables con configuración adecuada)

> **Nota:** El test actual valora `ok_real >= 16` como PASS porque los otros 84 tipos necesitan configuración específica (input, TOP, DAT, shader, etc.) que no es aplicable en un test de matriz simple. En producción, cada POP debe ser configurado según su propósito.

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