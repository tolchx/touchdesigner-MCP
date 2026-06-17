# TD-MCP HTTP API Reference

## Server
- **URL**: `http://localhost:44444`
- **Protocol**: HTTP JSON
- **Content-Type**: `application/json` (except `/dashboard`)
- **Port scanning**: Ports 44444–44449 are auto-scanned for multi-instance TD sessions

---

## 📋 Dashboard

### GET / (or /dashboard, /dashboard.html)
Serves the Nexus HTML dashboard (~100KB, self-contained dark-themed UI).

**Response**: `Content-Type: text/html` — full HTML dashboard with tabs, SSE, live updates.

---

## ℹ️ Server Info & Status

### GET /info
Returns TouchDesigner build info.

```json
{"build": "2025.32280", "version": "...", "projectFPS": 60.0}
```

### GET /instances
Detect multi-instance TD sessions by scanning ports 44444–44449.

```json
{"instances": [
  {"port": 44444, "status": "ok", "info": {"build": "2025.32280"}},
  {"port": 44445, "status": "timeout"}
]}
```

### GET /events
Server-Sent Events (SSE) stream — real-time FPS, operator count, error count.

**Header**: `Content-Type: text/event-stream`

```text
data: {"fps": 60.0, "operator_count": 15, "error_count": 0}
```

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
Alias for `/exec` with the same interface.

### POST /execute_async
Execute Python asynchronously — returns a task ID immediately. Non-blocking.

**Body**:
```json
{"code": "...", "timeout": 30, "priority": "normal"}
```

**Response**:
```json
{"task_id": "abc-123-def", "status": "queued"}
```

### GET /task_status?taskId=abc-123-def
Poll status of an async execution task.

**Response**:
```json
{"task_id": "abc-123-def", "status": "completed", "output": "...", "errors": ""}
```

---

## 🔧 Operator CRUD

### GET /operators?path=/project1
List all operators under a container path.

**Parameters**: `path` (default: `/`)

```json
{
  "path": "/project1",
  "operators": [
    {"name": "noise1", "type": "TOP", "opType": "noiseTOP"}
  ]
}
```

### POST /create_operator
Create a new operator inside a container.

**Body**:
```json
{
  "type": "noiseTOP",
  "path": "/project1",
  "name": "noise1",
  "position": {"x": -300, "y": 0}
}
```

**Response**:
```json
{"path": "/project1/noise1", "opType": "noiseTOP"}
```

### POST /delete_operator?path=/project1/noise1
Delete an operator.

**Parameters**: `path` — full path to operator

```json
{"result": "deleted"}
```

### POST /copy_node
Copy an operator within the network.

**Body**:
```json
{
  "src_path": "/project1/noise1",
  "dst_path": "/project1/noise_copy",
  "name": "noise_copy",
  "keep_connections": false
}
```

---

## 🎛 Parameters

### GET /parameters?path=/project1/noise1&names=amp,freq
Get parameter values for an operator.

**Parameters**: `path` (required), `names` — comma-separated list (optional, omit for all)

```json
{
  "path": "/project1/noise1",
  "parameters": [
    {"name": "amp", "value": 0.5, "type": "float"},
    {"name": "freq", "value": 10.0, "type": "float"}
  ]
}
```

### POST /parameters/set
Set parameters transactionally. Supports batch setting with expressions.

**Body**:
```json
{
  "path": "/project1/noise1",
  "params": {"amp": 0.5, "freq": 10},
  "expressions": {"freq": "absTime.frame * 0.1"}
}
```

**Response**:
```json
{"result": "success", "updated": ["amp", "freq"]}
```

---

## 🔌 Connections / Wiring

### GET /connections?path=/project1&recurse=false
Get the connection graph (wires) for operators.

**Parameters**: `path` (default: `/`), `recurse` (`true`/`false`, default: `false`)

```json
{
  "path": "/project1",
  "operators": [
    {"name": "noise1", "inputs": [], "outputs": ["/project1/blur1"]}
  ]
}
```

### POST /connect_nodes
Wire two operators together.

**Body**:
```json
{
  "src": "/project1/noise1",
  "dst": "/project1/blur1",
  "input": 0
}
```

**Response**:
```json
{"result": "connected", "src": "/project1/noise1", "dst": "/project1/blur1", "input": 0}
```

### POST /disconnect?path=/project1/blur1&input_index=0
Remove a wire from an operator's input.

**Parameters**: `path` — destination operator, `input_index` — input connector index

```json
{"result": "disconnected"}
```

---

## 🧭 Editor / Navigation

### GET /editor/pane
Get the current pane state — network viewer position, zoom level.

### GET /editor/selection
Get the currently selected operators in the network editor.

```json
{"selected": ["/project1/noise1"]}
```

### GET /navigate_to?path=/project1/noise1
Navigate the Network Editor to show a specific operator.

```json
{"result": "navigated"}
```

### GET /spatial_context
Resolve spatial context references: `*here`, `*this`, `*these`, `*selected`, `*parent`.

```json
{
  "here": "/project1",
  "this": "/project1/noise1",
  "these": ["/project1/noise1", "/project1/blur1"],
  "selected": ["/project1/noise1"],
  "parent": "/"
}
```

---

## 🔍 Search / Find

### GET /find?query=noise&family=TOP
Find operators by name, type, family, or parameter.

**Parameters**: `query` (fuzzy match), `family` filter, `path` scope

```json
{
  "results": [
    {"path": "/project1/noise1", "opType": "noiseTOP", "name": "noise1"}
  ]
}
```

### GET /search?q=noise&target=ops
Search inside TouchDesigner — operators, parameters, DAT content.

**Parameters**: `q` — query string, `target` — scope (`ops`, `params`, `dat`)

### GET /get_hints?node_type=noiseTOP
Get operator hints and connection suggestions.

### GET /get_focus
Get the operator the user is currently interacting with (mouse hover, selected).

```json
{"focus": "/project1/noise1"}
```

### GET /build_compatibility?op_type=noiseTOP
Check if an operator type exists in the current TD build.

```json
{"exists": true, "op_type": "noiseTOP"}
```

### GET /release_delta?build_from=2025.30000&build_to=2025.32280
List operator type changes between TD builds.

---

## 🐛 Verification & Debug

### GET /verify?path=/project1
Full network verification — errors, warnings, connection count.

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

### GET /healthcheck?path=/&recurse=true
Validate all operators: cooks, warnings, errors. Provides detailed per-op status.

### GET /get_errors?path=/&recurse=true
Get all operators with errors (alias for healthcheck, always recursive).

### GET /get_node_detail?path=/project1/noise1&recurse=false
Detailed operator info — children, parameters, connections, cook time.

### POST /diagnose
AI-assisted diagnosis of operator issues — fetches errors, inputs, cook state, and suggests fixes.

**Body**:
```json
{"path": "/project1/noise1"}
```

**Response**:
```json
{
  "path": "/project1/noise1",
  "issues": [{"type": "error", "message": "...", "severity": "error"}],
  "suggested_fixes": ["Connect missing input", "Reset parameters"]
}
```

---

## ⚡ Performance

### GET /get_perf?path=/&top=20
Get performance data for operators — cook times sorted descending.

**Parameters**: `path`, `top` — number of results (default: 20)

### GET /audit/performance
Get the slowest operators by cook time across the network.

```json
{
  "total_ops": 15,
  "slowest_ops": [
    {"path": "/project1/sdfTOP1", "cookTimeMs": 8.5, "cookCount": 120}
  ],
  "total_cook_time_ms": 45.2,
  "fps": 60.0
}
```

---

## 📸 Screenshots

### POST /screenshot
Capture the current viewer — auto-finds a valid TOP, renders to temp file, returns base64.

```json
{
  "width": 1920,
  "height": 1080,
  "mime": "image/png",
  "image": "iVBORw0KGgoAAAANSUhEUg...",
  "path": "/project1/outTOP1"
}
```

### GET /screenshot?path=/project1/outTOP1&max_size=512
Screenshot a specific operator with optional max dimension constraint.

**Parameters**: `path` — operator to capture, `max_size` — optional max dimension

---

## 🔮 GLSL

### POST /glsl_reload
Force recompile a GLSL TOP or POP by toggling bypass.

**Body**:
```json
{"path": "/project1/glsl1"}
```

**Response**:
```json
{"result": "reloaded", "compile_result": "success"}
```

### POST /glsl_update
Atomically write new GLSL code to a DAT and recompile.

**Body**:
```json
{
  "path": "/project1/glsl1",
  "code": "void main() { vec4 c = texture(sTD2DInputs[0], vUV.st); fragColor = TDOutputSwizzle(c); }",
  "dat_path": "/project1/shader_code"
}
```

**Response**:
```json
{"result": "compiled", "errors": ""}
```

---

## 📐 Auto-Layout & Smart Connect

### POST /auto_layout
Topologically sort and auto-layout operators in a container. Sources on the left, outputs on the right.

**Body**:
```json
{
  "path": "/project1",
  "spacing_x": 250,
  "spacing_y": 80
}
```

**Response**:
```json
{
  "result": "layed_out",
  "operators": [
    {"path": "/project1/noise1", "x": -300, "y": 0},
    {"path": "/project1/blur1", "x": 0, "y": 0}
  ]
}
```

### POST /smart_connect
Create an operator between two existing ones, auto-detecting compatible type.

**Body**:
```json
{
  "src": "/project1/noise1",
  "dst": "/project1/null1",
  "target_type": "blurTOP"
}
```

**Response**:
```json
{
  "result": "created",
  "path": "/project1/blur1",
  "opType": "blurTOP"
}
```

---

## 📝 Document Generation

### POST /document
Generate natural language documentation of a network — ASCII diagram, operator roles, connections, parameters.

**Body**:
```json
{"path": "/project1"}
```

**Response**:
```json
{
  "summary": "A simple noise→blur→composite pipeline",
  "structure": [
    {"path": "/project1/noise1", "type": "noiseTOP", "role": "source"},
    {"path": "/project1/blur1", "type": "blurTOP", "role": "processor"}
  ],
  "connections": [{"from": "noise1", "to": "blur1", "input": 0}],
  "diagram": " noisetop ──→ blurtop ──→ compositetop ──→ outtop"
}
```

---

## 🎨 Parameter Presets

### GET /param_presets
List available parameter presets.

```json
{"presets": [
  {"name": "glow-soft", "description": "Soft glow effect"},
  {"name": "chroma-key-green", "description": "Green screen key"}
]}
```

### POST /param_presets
Apply a preset to an operator by name.

**Body**:
```json
{"path": "/project1/blur1", "preset": "motion-blur-fast"}
```

**Response**:
```json
{"result": "applied", "params_changed": ["uniform", "radius"]}
```

---

## ⚡ Batch Operations

### POST /batch
Execute multiple operations atomically. Not truly transactional (TD has no rollback) but provides per-operation error context.

**Body**:
```json
{
  "operations": [
    {"method": "POST", "path": "/exec", "body": {"code": "..."}},
    {"method": "POST", "path": "/parameters/set", "body": {"path": "/project1/noise1", "params": {"amp": 0.5}}}
  ]
}
```

**Response**:
```json
{
  "results": [
    {"status": "success", "data": {"output": "..."}},
    {"status": "success", "data": {"updated": ["amp"]}}
  ],
  "failures": []
}
```

---

## 💾 Memory & Project

### POST /memory_save
Save a memory entry (name + data + context) for later recall.

### GET /memory_recall?query=noise&limit=5
Recall memory entries by semantic query.

### POST /project_lifecycle
Save, load, undo, redo project operations.

**Body**:
```json
{"action": "save", "path": "/project1"}
```

### GET /snapshot_scene?path=/
Take a snapshot of the current scene state — operators, connections, parameters.

---

## 📄 DAT & CHOP Access

### GET /read_dat?path=/project1/code1&start_line=1&end_line=50
Read DAT content with line range.

**Parameters**: `path`, `start_line`, `end_line`

### POST /write_dat
Write content to a DAT.

**Body**:
```json
{"path": "/project1/code1", "text": "new DAT content"}
```

### GET /read_chop?path=/project1/chan1&channels=chan1,chan2&start=0&end=100
Read CHOP channel data.

**Parameters**: `path`, `channels` (comma-separated), `start` (sample index), `end`

---

## 🛠 Utilities

### GET /help?module=noiseTOP
Get Python help/documentation for a TD module or operator class.

```json
{
  "module": "noiseTOP",
  "help": "noiseTOP class reference...",
  "parameters": [
    {"name": "amp", "type": "float", "default": 0.5, "label": "Amplitude"}
  ]
}
```

### GET /read_textport?lines=20
Read the last N lines from the TouchDesigner Textport.

### GET /clear_textport
Clear the TouchDesigner Textport.

### GET /reinit_extension?path=/project1/tdapi
Reinitialize a TouchDesigner extension at the given path.

### GET /pop_inspect?path=/project1/pop1
Inspect a POP operator and its particle data.

```json
{
  "path": "/project1/pop1",
  "numElements": 1000,
  "attributes": ["P", "v", "Cd", "age"]
}
```

---

## ✅ Verification Pattern

After creating/wiring operators, ALWAYS run:

1. **Verify the network structure**:
   ```
   GET /verify?path=/project1
   ```
   This checks for errors, connections, and overall health.

2. **Spatial resolution** (for LLM agents resolving references):
   ```
   GET /spatial_context
   ```
   Resolves `*here`, `*this`, `*these`, `*selected` references.

3. **Check specific operator health**:
   ```
   GET /healthcheck?path=/project1&recurse=true
   ```
