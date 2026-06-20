# TD-MCP HTTP API Reference

## Server
- **URL**: `http://localhost:44444`
- **Protocol**: HTTP JSON
- **Content-Type**: `application/json` (except `/dashboard`)
- **Multi-instance**: Ports 44444–44449 auto-scanned

---

## 📋 Dashboard

### GET / (or /dashboard, /dashboard.html)
Serves the Nexus HTML dashboard (~100KB, self-contained dark-themed UI).

**Response**: `Content-Type: text/html`

---

## ℹ️ Server Info & Status

### GET /info
Returns TouchDesigner build info.

```json
{"build": null, "projectFPS": 60.0}
```

### GET /instances
Detect multi-instance TD sessions by scanning ports 44444–44449.

### GET /events
Server-Sent Events (SSE) stream — real-time FPS, operator count, error count.

---

## 📝 Code Execution

### POST /exec
Execute arbitrary Python code in TouchDesigner context. Captures `print()` output.

**Body**:
```json
{"code": "print(op('/project1/noise1').par.amp.eval())"}
```

**Response**:
```json
{"result": "success", "output": "0.5\n", "errors": ""}
```

### POST /execute
Alias for `/exec`.

### POST /execute_async
Non-blocking execution — returns a task ID.

### GET /task_status?taskId=abc-123-def
Poll async execution status.

---

## 🔧 Operator CRUD

### GET /operators?path=/project1
List operators under a container.

### POST /create_operator (alias: **POST /create**)
Create a new operator.

**Body** (JSON body):
```json
{"path": "/project1/myop", "type": "noiseTOP"}
```

**Also works with** (query params or JSON body):
```json
{"path": "/project1/noise1", "type": "noiseTOP"}
```

**Alias**: `POST /create` — same body format as `/create_operator`.
**Important for Agents**: When calling `/create` with `POST`, the body must be JSON. `path` is the full path including the operator name. `type` is the TD operator type string like `noiseTOP`, `blurTOP`, `nullTOP`, etc.

### POST /delete_operator?path=/project1/noise1
Delete an operator.

### POST /copy_node
Copy an operator.

---

## 🎛 Parameters

### GET /parameters?path=/project1/noise1&names=amp,freq
Get parameter values. Omit `names` for all.

### POST /parameters/set
Set parameters transactionally. Supports batch setting.

**Body**:
```json
{"path": "/project1/noise1", "params": {"amp": 0.5, "freq": 10}}
```

**Important**: Use parameter `.eval()` names, not labels. e.g. `amp`, not `Amplitude`.

---

## 🔌 Connections / Wiring

### GET /connections?path=/project1&recurse=false
Get the connection graph (wires). Returns per-operator inputs/outputs.

### POST /connect_nodes (alias: **POST /connect**)
Wire two operators together.

**Body**:
```json
{"src": "/project1/noise1", "dst": "/project1/blur1", "input": 0}
```

`input` defaults to 0 (first input). **Alias**: `POST /connect`.

### POST /disconnect?path=/project1/blur1&input_index=0
Remove a wire.

---

## 🧭 Editor / Navigation

### GET /editor/pane — Pane state (position, zoom)
### GET /editor/selection — Currently selected operators
### GET /navigate_to?path=/project1/noise1 — Navigate to operator
### GET /spatial_context — Resolve `*here`, `*this`, `*these`, `*selected`, `*parent`

---

## 🔍 Search / Find

| Endpoint | Description |
|----------|-------------|
| `GET /find?query=noise&family=TOP` | Find operators by name/type/family |
| `GET /search?q=noise&target=ops` | Full search across ops, params, DATs |
| `GET /get_hints?node_type=noiseTOP` | Connection suggestions |
| `GET /get_focus` | Currently focused operator |
| `GET /build_compatibility?op_type=noiseTOP` | Check if op exists in current build |
| `GET /release_delta?build_from=...` | Changes between TD builds |

---

## 🐛 Verification & Debug

### GET /verify?path=/project1
Full network verification — errors, warnings, connections.

```json
{
  "path": "/project1",
  "operator_count": 12,
  "errors": [],
  "error_count": 0,
  "total_connections": 8,
  "healthy": true
}
```

### GET /healthcheck — Per-op cook/warning/error status
### GET /get_errors — All errors (recursive)
### GET /get_node_detail — Detailed operator info
### POST /diagnose — AI-assisted error diagnosis

---

## ⚡ Performance

| Endpoint | Description |
|----------|-------------|
| `GET /get_perf?path=/&top=20` | Cook times sorted descending |
| `GET /audit/performance` | Slowest ops across the network |

---

## 📸 Screenshots

### POST /screenshot
Capture viewer — auto-finds TOP, returns base64.

### GET /screenshot?path=/project1/outTOP1&max_size=512
Screenshot specific operator with optional resize.

---

## 🔮 GLSL

| Endpoint | Description |
|----------|-------------|
| `POST /glsl_reload` | Force recompile GLSL |
| `POST /glsl_update` | Write code + recompile |

---

## 📐 Auto-Layout & Smart Connect

### POST /auto_layout
Topological sort + layout operators.

**Body**:
```json
{"path": "/project1", "spacing_x": 250, "spacing_y": 80}
```

### POST /smart_connect
Insert operator between two existing ones.

**Body**:
```json
{"source": "/project1/noise1", "destination": "/project1/null1", "type": "blurTOP"}
```

---

## 📋 Best Practices for AI Agents

### Creating a Complex Network
Use `/exec` for batch operations — it's faster and more reliable than individual API calls:

```python
# Example: Create noise → blur → null pipeline
code = '''
import json
P = "/project1"

# Create
n = op(P).create(td.noiseTOP, "mynoise")
n.nodeX, n.nodeY = 0, 0

b = op(P).create(td.blurTOP, "myblur")
b.nodeX, b.nodeY = 250, 0

o = op(P).create(td.nullTOP, "myout")
o.nodeX, o.nodeY = 500, 0
o.par.display = True

# Connect
n.outputConnectors[0].connect(b)
b.outputConnectors[0].connect(o)

# Set params
n.par.amp = 0.8
b.par.radius = 5

print("OK")
'''

POST /exec {"code": code}
```

### Creating GLSL POPs
```python
src = op(P).create(td.boxPOP, "src")
src.nodeX, src.nodeY = -300, 0

code_dat = op(P).create(td.textDAT, "shader_code")
code_dat.text = '...'

glsl = op(P).create(td.glslPOP, "myshader")
glsl.par.computedat = "shader_code"
glsl.par.outputattrs = "P"
glsl.nodeX, glsl.nodeY = 0, 0

src.outputConnectors[0].connect(glsl)
```

### TD Type Reference (Common)
| Type String | Python Class | Family |
|-------------|-------------|--------|
| `noiseTOP` | `td.noiseTOP` | TOP |
| `blurTOP` | `td.blurTOP` | TOP |
| `levelTOP` | `td.levelTOP` | TOP |
| `compositeTOP` | `td.compositeTOP` | TOP |
| `nullTOP` | `td.nullTOP` | TOP |
| `constantTOP` | `td.constantTOP` | TOP |
| `outTOP` | `td.outTOP` | TOP |
| `glslTOP` | `td.glslTOP` | TOP |
| `glslPOP` | `td.glslPOP` | POP |
| `boxPOP` | `td.boxPOP` | POP |
| `lfoCHOP` | `td.lfoCHOP` | CHOP |
| `mathCHOP` | `td.mathCHOP` | CHOP |
| `filterCHOP` | `td.filterCHOP` | CHOP |
| `nullCHOP` | `td.nullCHOP` | CHOP |
| `audioDeviceInCHOP` | `td.audioDeviceInCHOP` | CHOP |
| `textDAT` | `td.textDAT` | DAT |
| `nullDAT` | `td.nullDAT` | DAT |
| `torusSOP` | `td.torusSOP` | SOP |
| `nullSOP` | `td.nullSOP` | SOP |

### Known Issues
- `/create` endpoint exists as alias for `/create_operator` (added Jun 2026)
- `/connect` endpoint exists as alias for `/connect_nodes` (added Jun 2026)
- `audioinCHOP` does NOT exist — use `audioDeviceInCHOP`
- Python 3.9 TD: no `str | None` syntax — use `Optional[str]` or plain args
- Use `.outputConnectors[0].connect(dst)` for wiring (NOT `.outputs[0].connect()`)
- Parameter names are `.eval()` names, not labels — read with `/parameters` first
