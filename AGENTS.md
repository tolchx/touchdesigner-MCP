# TD-MCP Server — Agent Instructions

## Overview
This MCP server connects AI agents to a live TouchDesigner session. It runs on `http://localhost:44444` and provides HTTP JSON endpoints to create, read, update, and delete TouchDesigner operators, parameters, and connections.

## Quick Start
```
GET http://localhost:44444/info
GET http://localhost:44444/operators?path=/project1
GET http://localhost:44444/verify?path=/project1
```

## Key Endpoints

### Read
- `GET /info` — TD version, FPS
- `GET /operators?path=/project1` — list nodes
- `GET /parameters?path=/project1/op1` — get params
- `GET /connections?path=/project1` — wire structure
- `GET /editor/selection` — selected ops
- `GET /spatial_context` — *here/*this/*these
- `GET /verify?path=/project1[&recurse=true]` — errors, warnings, connections, POP stats. Default recurse=true (scans COMP children). recurse=false → root only (legacy).
- `GET /audit/performance` — slowest ops

### Write
- `POST /parameters/set {"path":..., "updates":[...]}` — batch set params (also accepts `{"path":..., "params":{name: value}}`; returns explicit error if nothing can be applied)
- `POST /exec {"code":"..."}` — execute Python in TD
- `POST /screenshot` — capture viewer image

### Help
- `GET /help?module=noiseTOP` — TD class documentation

## Important Rules
1. Never guess parameter names — always read them first with `/parameters`
2. Use `.outputConnectors[0].connect(dst)` for wiring (NOT `.outputs[0].connect()`)
3. Set `.nodeX`/`.nodeY` to position operators after creation
4. Run `/verify` after any write operation
5. Check `n.errors()` when something fails
6. **Use `/exec` for batch operations** — creating 10+ ops individually via `/create` is slow; batch them in one `/exec` call
7. **Endpoint aliases**: `/create` = `/create_operator`, `/connect` = `/connect_nodes`
8. **TD type mistakes to avoid**: `audioinCHOP` does NOT exist → use `audioDeviceInCHOP`; `glsl1MAT` cannot be created with `create()`
9. **Python 3.9 in TD**: No `str | None` union type syntax — use `Optional[str]` or omit type hints
10. **GLSL POP requires**: `boxPOP` source (NOT SOP), `outputattrs='P'`, `uniform float u_time;` declared manually
10a. **Output no se lee (Regla 1)**: `P[id] = TDIn_P(0, id) * 1.001;` compila; `P[id] = P[id] * 1.001;` da Compile failed. Nunca leer un atributo que también se escribe.
10b. **Patrón canónico (Regla 2)**: `const uint id = TDIndex(); if (id >= TDNumElements()) return;` — omitir la guarda puede causar acceso fuera de rango.
10c. **Atributos nuevos (Regla 3)**: `outputattrs` solo selecciona atributos que YA existen en la entrada. Para escribir Cd / N / un custom hay que crearlos con la página Create Attributes del glslPOP: `attr0name='Custom'`, `attr0customname='Cd'`, `attr0numcomps=4`. `attr0name='Cd'` NO funciona. Componentes: Cd=4, N=3, uv=2, float custom=1.
10d. **Atributos WRITE-ONLY (Regla 4)**: leer un atributo que también se escribe da `'*' : can't read from writeonly object`. Para leerlo usar `outputaccess='readwrite'`.
10e. **Error real del compilador (Regla 5)**: `errors()` solo dice 'Compile failed'. El log real está en el infoDAT `<nombre_glsl>_info`. Leer ese DAT para diagnosticar.
10f. **API de POP (Regla 6)**: `numPoints`, `numPrims`, `bounds` y `points` son MÉTODOS: `p.numPoints()`, no atributos.
10g. **Camino seguro automatizado**: las reglas 1-4 y el puntero al infoDAT están implementados en el MCP — usá `td_glsl_analyze` (chequeo estático, sin TD) y `td_glsl_apply` (crea el glslPOP con Create Attributes automáticos, readwrite automático, y si falla la compilación devuelve el log real de `<nombre>_info` dentro del error). No setees atributos a mano salvo que necesites algo que el tool no cubre.
10h. **Solo POPs ok_con_input en redes generadas**: la base de conocimiento (`pop_operators.json`) lleva la categoría de evidencia de la matriz en vivo por tipo. El planner penaliza y advierte sobre POPs que NO son `ok_con_input` (8 tipos en TD 2025.31760: 5 con errors() por dependencias externas —USD, ZED SDK, C++—, 2 de hardware sin geometría, 1 no creable); se aceptan solo si el pedido los nombra explícitamente. Consultá `isRecommendedForNetworks(type)` antes de sugerir un POP en una red nueva.
10i. **Multi-input GLSL POP (verificado en vivo 2025.32460)**: el loop sobre OTRO input usa `TDInputNumPoints(inputIndex)` — `TDNumElements(k)` con argumento es compile error (`no matching overloaded function found`, solo visible en el infoDAT). Leer atributos custom del otro input: `TDIn_<attr>(inputIndex, elemIndex)`. Fuente: docs/tutorials/pop_tutorial/TUTORIAL_KNOWLEDGE.md.
10j. **glslcopyPOP ≠ glslPOP**: sus params de código son `ptcomputedat`/`ptoutputattrs` (no `computedat`/`outputattrs`) y su set de builtins es otro: `TDNumPoints()` / `TDInputNumPoints()` / `TDCopyIndex()` / `TDTemplate_*` — NO existen `TDIndex()`/`TDNumElements()` en copy POPs.
10k. **POP→imagen**: `/screenshot` solo captura TOPs; no existe operador POP→TOP y las nubes de puntos renderizan NEGRO vía geometryCOMP+renderTOP (solo superficies rasterizan; verificado en vivo). Con path de POP, `/screenshot` devuelve diagnósticos del POP (opType, numPoints, errors) + opciones reales. Verificación numérica confiable: `td_pop_inspect` (TS) o `get_td_pop_attributes` (stdio) — enumeran attrs vía `pointAttributes` y muestrean vía `points(attr)`; los attrs custom GLSL SÍ son CPU-readable tras cocinar (ID==index verificado). Creación con reemplazo: `replace: true` en `td_create_operator`/`create_td_node`/`POST /create` (TD renombra en silencio en colisión; `op.children` es LISTA, no método).
11. **Parameter names**: use `.eval()` names (e.g. `amp` not "Amplitude") — read with `/parameters` first
12. **Multi-input wiring** (verified on 2025.32460 — `connect(dst, input_index)` FAILS with "Invalid number or type of arguments", both for POPs and TOPs):
    - Input 0 / dynamic inputs: `src.outputConnectors[0].connect(dst)` (append-safe SOLO en ops de inputs dinámicos; en ops de inputs fijos el connect simple apunta al slot 0 y PISA el wire existente — ver matriz medida abajo)
    - Indexed input (operator already has several connectors, e.g. copyPOP): `src.outputConnectors[0].connect(dst.inputConnectors[i])`
    - mergePOP and compositeTOP have **dynamic inputs**: they start with 1 connector and add one per connection (measured live: 1 → 2 → 3)
    - **Dynamic-input REPLACEMENT semantics** (NEG3 in `scripts/live/post_build_wiring_check.py --selftest`, TD 2025.31760): connecting to a slot ALREADY occupied on a dynamic-input op **overwrites** it instead of appending. Live evidence — build `srcA→nz→mg(0)`, `srcB→mg(1)`, then rewire `srcB.connect(mg.inputConnectors[0])` and the edge `nz→mg(0)` is GONE (selftest output: `missing=[('nz','mg',0)] extra=[('srcB','mg',0)]`). Consequence: when a multi-input build "succeeds" but reports fewer edges than expected, first suspect that a later connect REPLACED an earlier wire — only the `/connections` edge-set comparison (rule 16) sees it; the build can report success throughout.
    - copyPOP has 2 fixed inputs: [0]=geometry, [1]=template
    - **Measured replacement matrix** (`scripts/live/dynamic_input_probe.py --ops ...`, TD 2025.31760, veredicto por sets de aristas `[(from, input)]` capturadas paso a paso):
        - Inputs DINÁMICOS (arrancan con 1 conector; el connect simple APPENDEA al slot libre siguiente, no pisa): `mergePOP`, `compositeTOP`
        - Inputs FIJOS de 2 slots medidos (el connect simple apunta al slot 0 y REEMPLAZA el wire que esté ahí — nunca "agrega"): `crossTOP`, `overTOP`, `copyPOP`
        - Universal a ambas clases: connect explícito sobre un slot OCUPADO REEMPLAZA su wire (medido en slot 0 y slot 1); `inputConnectors[N]` con N >= cantidad de conectores lanza excepción (NO crece la lista)
13. **7 operator families**: COMP (🔵), TOP (🟢), CHOP (🟡), SOP (🟠), POP (🔴), DAT (🟣), MAT (⚪) — see `mcp_reference/OPERATOR_FAMILIES.md`
14. **COMP and MAT exist!**: COMPs (baseCOMP, geometryCOMP, etc.) son contenedores de redes; MATs (phongMAT, pbrMAT, glslMAT, etc.) son materiales asignados a geometryCOMP
15. **Read cache en `/operators` y `/verify`** (verificado en vivo en 2025.31760 — backlog #05):
    - Confiá en `"cache": "hit"`: la respuesta cacheada tiene las MISMAS claves y semántica que una lectura fresca (paginación `total/returned/limit/offset/truncated` intacta) y no re-recorre la red.
    - NO invalides nada a mano: toda escritura (`POST /exec`, `/parameters/set`, `/create`, `/connect`, `/disconnect`, `/delete`, copy, glsl_*, import…) vacía el caché completo ANTES de ejecutarse, así que tu primera lectura después de escribir siempre vuelve `"cache": "miss"` y refleja el cambio (nada de datos rancios).
    - Si la red cambia por fuera de tus escrituras (el usuario edita, una sim anima, otros clientes escriben), leé con `?no_cache=1` (o `?refresh=1`) para forzar una lectura fresca que además refresca la entrada.
    - `/info` expone `readCache {hits, misses, entries}`; los errores (non-200) nunca se cachean. Método y mediciones: `docs/PERFORMANCE.md` · contrato: `docs/API_CONTRACT_AUDIT.md`.
16. **Post-build wiring check (verificado en vivo en 2025.31760)**: después de CUALQUIER script que cree/cablee red, verificá el cableado — NO confíes en el output del build. Fuente de verdad: `GET /connections` (aristas reales `{from, fromPath, to, toPath, input}`; `total` = aristas). Compará aristas como SETS de `(from, to, input_index)` contra lo esperado: detecta wire faltante, output faltante E input index equivocado (mergePOP/copyPOP), y nombra la arista exacta que falta.
    - **Primero la tool MCP**: `td_verify_wiring` con `path` + `expect: "srcA->nz:0,nz->mg:0,srcB->mg:1,mg->out:0"` (o `edges: [{from,to,input}]`). Hace exactamente ese set-compare, y si ve un par missing+unexpected sobre el mismo slot con distinto origen NOMBRA el patrón de reemplazo de inputs dinámicos (regla 12) con el fix. Aceptación en vivo 4/4 (`scripts/live/wiring_tool_live.mjs`) y en el nightly de CI.
    - **Fallback sin MCP** (transport HTTP crudo o entorno sin el server MCP): `python scripts/live/post_build_wiring_check.py --path /project1/mi_red --expect "srcA->nz:0,..."` (selftest con 1 positivo + 3 negativos detectados: `--selftest`).
    - Por qué: un build puede reportar éxito con la mitad de los wires (try/except que traga, connect dinámico que reemplaza un slot — regla 12) — la única fuente de verdad del cableado es el propio TD vía `/connections` (ítem 38). Es el paso que sigue a la regla 4 (`/verify` errors) y la regla 5 (`n.errors()`): estructura primero, luego errores.

## Example: Create a GLSL POP
```python
# 1. Create boxPOP source
src = op('/project1').create(td.boxPOP, 'src_name')
src.nodeX = -300; src.nodeY = 0

# 2. Create GLSL code DAT
code = op('/project1').create(td.textDAT, 'shader_code')
code.text = 'void main(){P[TDIndex()] = TDIn_P(0, TDIndex()) * 1.001;}'

# 3. Create GLSL POP
glsl = op('/project1').create(td.glslPOP, 'my_shader')
glsl.par.computedat = 'shader_code'
glsl.par.outputattrs = 'P'
glsl.nodeX = 0; glsl.nodeY = 0

# 4. Connect
src.outputConnectors[0].connect(glsl)
```
