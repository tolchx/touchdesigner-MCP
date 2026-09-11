# Validación del conocimiento POP contra la wiki oficial

- **TD build vivo:** TouchDesigner 2025.32460 · **POPs creados en vivo:** 100/101
- **Fuente oficial:** `https://docs.derivative.ca/api.php?action=query&list=categorymembers&cmtitle=Category:POPs` → **106 páginas** en Category:POPs
- Cruce: **100 POPs coinciden**, 1 solo en TD, 6 solo en la wiki

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