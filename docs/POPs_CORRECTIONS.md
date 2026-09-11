# Correcciones y hallazgos verificados — POPs y API del MCP

> **Fecha:** 2026-09-10 · **Entorno:** TouchDesigner 2025.32460 · `TouchDesignerAPI.toe` · API HTTP `:44444`
> **Método:** prueba en vivo contra TD + cruce con la wiki oficial (`docs.derivative.ca`).
> **Nota:** `AGENTS.md` está protegido: estas correcciones NO se aplicaron ahí todavía. Requieren tu OK.

## 1. `/parameters/set` — el payload documentado NO funciona (falla silenciosa)

`AGENTS.md` y `API_REFERENCE.md` documentan `{"path":..., "params":{...}}`. Ese payload **no aplica nada y no devuelve error**:

```bash
# ❌ documentado — devuelve {"updated":[], "missing":[], "transactional":true} y no cambia nada
-d '{"path":"/project1/noise1","params":{"amp":0.35}}'
```

El correcto (y el que ya usa `mcp/src/applyNetwork.ts:52`):

```bash
# ✅ verificado: actualiza de verdad
-d '{"path":"/project1/noise1","updates":[{"name":"amp","value":0.35}]}'
```

**Causa:** `_handle_parameters_set` (`toe/src/TouchDesignerAPI.py:3085`) lee `payload.get("updates", [])` (lista). Con `params` (dict) el bucle no itera.
**Pendiente:** corregir `AGENTS.md` + `mcp_server_stdio.py:261`, y (opcional) aceptar la forma legacy con warning.

## 2. Cableado multi-input — la regla 12 de `AGENTS.md` es incorrecta

`AGENTS.md` dice: *"use `connect(dst, input_index)`"*. **Eso falla** en 2025.32460:
`tdError: Invalid number or type of arguments ... Value:(type:copyPOP ..., 1)`.

Verificado en vivo:

| Caso | API correcta | Resultado |
|---|---|---|
| Entrada 0 / inputs dinámicos | `src.outputConnectors[0].connect(dst)` | ✅ |
| Input indexado (p.ej. `copyPOP` in1) | `src.outputConnectors[0].connect(dst.inputConnectors[i])` | ✅ |
| ❌ Forma documentada | `src.outputConnectors[0].connect(dst, i)` | falla |

**`mergePOP` tiene inputs dinámicos**: arranca con **1** conector y **suma uno por cada conexión**
(1 → 2 → 3 al conectar dos fuentes). Confirmado por la wiki: *"merges together the points, vertices and primitives of all its inputs"*.
`copyPOP`: 2 inputs fijos (in0 = geometría, in1 = plantilla de puntos).

## 3. POPs documentados en la wiki que NO existen en el build

`Category:POPs` (wiki) tiene **106** páginas; el build expone **101** tipos.

| Tipo | Existe como clase `td` | Creable | Interpretación |
|---|---|---|---|
| `glslcreatePOP` | no | no | la wiki va adelante del build |
| `linethickPOP` | no | no | idem |
| `scriptPOP` | no | no | idem |
| `timefilterPOP` | no | no | idem |
| `engineoutPOP` | **sí** | **no** | existe pero `create()` no lo acepta en un baseCOMP (requiere contexto propio) |

→ No intentar crear los cuatro primeros en este build, y no asumir comportamiento de `engineoutPOP`.

## 4. Parámetros: label (wiki) vs nombre eval (build)

La wiki documenta el **label** (`Input Attribute Scope`); TD usa el **nombre eval abreviado** (`inputattrscope`).
El mapeo autoritativo está en las plantillas `{{Parameter}}` de la wiki (`|parLabel=` + `|parName=`) y quedó cacheado en
`mcp/data/pops/wiki_params.json`.

Cobertura medida: **1916** parámetros documentados · **1609** confirmados en el build · **296** documentados pero ausentes
(esos son *drift*: verificar antes de usarlos).

## 5. `/info` devuelve metadatos en null (bug menor del bridge)

```bash
curl http://localhost:44444/info
# {"build": null, "version": null, "commercial": null, "platform": null, "release": null, "projectPath": null, "projectFPS": 60.0}
```

En TD las propiedades correctas son `app.build` (`2025.32460`), `app.product`, `app.version` (devuelve `099` — no es la versión).

## 6. `/screenshot` no resuelve un TOP válido (bug menor)

`POST /screenshot {"path":"/project1/<sandbox>/out1"}` (un `nullTOP` que cocina sin errores) responde
`{"success": false, "error": "No TOP output found"}`. Revisar cómo resuelve el path/op el handler.

---

## Cómo se validó (reproducible)

```bash
# 1) matriz viva: crea los 101 POPs en /project1/pop_matrix_live y lee params reales
python toe/src/test_pop_matrix.py

# 2) cruce con la wiki oficial (lista Category:POPs + parLabel/parName + drift)
python toe/src/verify_pop_knowledge.py            # --refresh-wiki para re-bajar la wiki

# 3) patrones de conexión reales desde los .toe descomprimidos
python toe/src/mine_pop_knowledge_v3.py

# 4) uso empírico de parámetros + biblioteca GLSL
python toe/src/mine_pop_params_glsl.py

# 5) base de conocimiento final (JSON + doc + notas Obsidian + FTS del MCP)
python toe/src/build_pop_knowledge.py

# 6) redes POP canónicas en vivo (10 redes, 29 conexiones, 0 errores)
python toe/src/test_pop_networks.py
```
