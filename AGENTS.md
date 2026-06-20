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
- `GET /verify?path=/project1` — errors + connection count
- `GET /audit/performance` — slowest ops

### Write
- `POST /parameters/set {"path":..., "params":{...}}` — batch set params
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
11. **Parameter names**: use `.eval()` names (e.g. `amp` not "Amplitude") — read with `/parameters` first
12. **Connections after multi-output**: compositeTOP has inputs [0]=top A, [1]=top B, [2]=top C — use `connect(dst, input_index)`

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
