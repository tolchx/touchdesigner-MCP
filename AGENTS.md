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
11. **Parameter names**: use `.eval()` names (e.g. `amp` not "Amplitude") — read with `/parameters` first
12. **Multi-input wiring** (verified on 2025.32460 — `connect(dst, input_index)` FAILS with "Invalid number or type of arguments", both for POPs and TOPs):
    - Input 0 / dynamic inputs: `src.outputConnectors[0].connect(dst)`
    - Indexed input (operator already has several connectors, e.g. copyPOP): `src.outputConnectors[0].connect(dst.inputConnectors[i])`
    - mergePOP and compositeTOP have **dynamic inputs**: they start with 1 connector and add one per connection (measured live: 1 → 2 → 3)
    - copyPOP has 2 fixed inputs: [0]=geometry, [1]=template
13. **7 operator families**: COMP (🔵), TOP (🟢), CHOP (🟡), SOP (🟠), POP (🔴), DAT (🟣), MAT (⚪) — see `mcp_reference/OPERATOR_FAMILIES.md`
14. **COMP and MAT exist!**: COMPs (baseCOMP, geometryCOMP, etc.) son contenedores de redes; MATs (phongMAT, pbrMAT, glslMAT, etc.) son materiales asignados a geometryCOMP

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
