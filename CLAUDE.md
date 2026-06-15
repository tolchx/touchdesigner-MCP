# TD-MCP Server — Agent Rules

## Server Info
- **URL**: `http://localhost:44444`
- **Protocol**: HTTP JSON (Content-Type: `application/json`)
- **Build**: TD 2025.31760

## CRITICAL RULES

### NEVER
- **Guess parameter names.** Always call `/parameters?path=/op/path` first.
- **Hardcode paths** like `op('/project1/noise1')` in exec callbacks. Use `me.parent()` or relative paths.
- **Assume opType strings** work with `container.create()`. Use `td.<Type>` classes (e.g. `td.glslPOP`, `td.boxPOP`).
- **Use `.pars` as an iterable** — it's not. Use specific `.par.<name>` access.

### ALWAYS
- **Run `/verify?path=/project1`** after creating or wiring operators.
- **Use native endpoints** for single operations (`/create`, `/connect`, `/parameters/set`).
- **Fall back to `/exec`** only for multi-step logic.
- **Check `n.errors()`** after any creation or modification.
- **Position nodes** with `.nodeX` and `.nodeY` after creation.

## Available Endpoints

```
GET    /info                     TD build info
GET    /operators?path=/         List operators at path
GET    /connections?path=/       Connection graph (wires)
GET    /parameters?path=/op      Get parameter values
POST   /parameters/set           Set parameters (batch)
GET    /editor/selection         Current selection
GET    /editor/pane              Current pane state
GET    /spatial_context          *here, *this, *these resolution
GET    /verify?path=/            Network verification (errors + connections)
GET    /audit/performance        Slowest ops by cook time
GET    /help?module=noiseTOP     Python help() for TD module
POST   /screenshot               Capture viewer as base64 PNG
POST   /exec                     Execute Python in TD
POST   /execute                  Same as /exec
```

## Wiring Pattern (TD Python)
```python
# CORRECT: use outputConnectors[0].connect(target_op)
src = op('/project1/noise1')
dst = op('/project1/blur1')
src.outputConnectors[0].connect(dst)

# ALSO CORRECT:
dst.inputConnectors[0].connect(src)
```

## Parameter Setting
```python
# Single param:
op('/project1/noise1').par.amp = 0.5

# Batch (preferred):
POST /parameters/set
{"path": "/project1/noise1", "params": {"amp": 0.5, "freq": 10}}
```

## Error Checking Pattern
```python
# After any operation:
result = POST /exec {"code": "print([n.errors() for n in op('/project1').findChildren() if n.errors()])"}
# If errors found, fix and re-verify:
GET /verify?path=/project1
```

## Operator Creation Pattern
```python
# 1. Create
g = container.create(td.glslPOP, 'name')
# 2. Set params
g.par.computedat = 'dat_name'
g.par.numelems = 200
g.par.outputattrs = 'P'
# 3. Position
g.nodeX = 0; g.nodeY = -300
# 4. Connect source
src.outputConnectors[0].connect(g)
# 5. Verify
GET /verify?path=/project1
```
