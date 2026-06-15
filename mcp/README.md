# MCP TouchDesigner Server

Servidor MCP para TouchDesigner con **69 tools**. Soporta modo online (conexión TD) y offline (base de conocimiento local).

## Estado

- **69 tools total** (68 td_ + 1 tool_batch)
- **Smoke test (offline):** 9/10 ✅
- **Smoke test (online):** 10/10 ✅
- **Compatibilidad multi-cliente:** 30/30 ✅
- **Pruebas avanzadas (online):** 31/34 ✅

## Build

```bash
cd touchdesigner
npm install
npx tsc -p api/tsconfig.json
npx tsc -p mcp/tsconfig.json
```

## Run

```bash
cd touchdesigner
TDAPI_HOST=172.24.0.1 TDAPI_PORT=44444 node mcp/dist/index.js
```

## Environment

| Variable | Default | Descripción |
|----------|---------|-------------|
| `TDAPI_HOST` | `localhost` | Host de TouchDesigner (desde WSL: IP de Windows) |
| `TDAPI_PORT` | `44444` | Puerto HTTP del API de TD |

## Tools

### 🔌 Requiere conexión TD (modo online)

| Tool | Descripción |
|------|-------------|
| `td_create_operator` | Crear operador (type, name, path, position) |
| `td_delete_operator` | Eliminar operador por path |
| `td_connect_nodes` | Conectar dos operadores |
| `td_disconnect` | Desconectar input de un operador |
| `td_copy_node` | Duplicar operador (usa `parent.copy(src)`) |
| `td_pars_get` | Leer parámetros de un operador |
| `td_pars_set` | Setear parámetros (vía `/exec`) |
| `td_set_operator_pars` | Set parámetros (interfaz limpia) |
| `td_pulse_param` | Pulsar un parámetro (búsqueda fuzzy) |
| `td_custom_parameters` | Crear páginas custom en COMPs |
| `td_execute` | Ejecutar Python en TD (vía `/exec`) |
| `td_network_plan` | Planificar y aplicar redes desde prompt |
| `td_pane` | Estado del panel del network editor |
| `td_selection` | Operadores seleccionados |
| `td_operators` | Listar hijos de un path |
| `td_find` | Buscar operadores por query/name/family |
| `td_connections` | Inspeccionar conexiones |
| `td_get_errors` | Errores y warnings de un operador |
| `td_healthcheck` | Validar red (default recurse=false) |
| `td_validate` | Validar + auto-fix automático de expresiones (sin→math.sin, etc.) + GLSL check |
| `td_get_node_detail` | Info detallada de un operador |
| `td_get_hints` | Sugerencias de conexión |
| `td_get_build_compatibility` | Verificar si opType existe |
| `td_get_release_delta` | Cambios entre builds |
| `td_get_info` | Info del entorno TD |
| `td_get_focus` | Foco actual del usuario |
| `td_get_perf` | Performance (FPS, operadores lentos) |
| `td_screenshot` | Screenshot de operador (base64) |
| `td_get_screenshots` | Screenshots batch (con maxSize) |
| `td_navigate_to` | Navegar a un operador |
| `td_read_textport` | Leer consola de TD |
| `td_clear_textport` | Limpiar consola |
| `td_search` | Buscar texto en código/expresiones/pars |
| `td_reinit_extension` | Reinicializar extensión en COMP |
| `td_read_dat` | Leer contenido de un DAT |
| `td_write_dat` | Escribir/patch un DAT |
| `td_read_chop` | Leer canales de un CHOP |
| `td_project_lifecycle` | Save/load/undo/redo |
| `td_snapshot_scene` | Snapshot de estado (para undo) |
| `td_memory_save` | Guardar entrada en memoria TD |
| `td_memory_recall` | Buscar en memoria TD |
| `td_search_official_docs` | Buscar en ayuda offline de TD |
| `td_pop_inspect` | Leer datos de un POP |
| `td_export_network` | Exportar red a código Python/diff/JSON |
| `td_watch` | Monitoreo de performance en tiempo real |
| `td_get_tutorial` | Obtener tutorial interactivo |
| `td_list_tutorials` | Listar tutoriales disponibles |
| `td_get_workflow` | Obtener workflow reutilizable |
| `td_list_workflows` | Listar workflows disponibles |
| `td_get_td_classes` | Listar clases Python de TD por familia |
| `td_get_module_help` | Documentación detallada de operador |
| `td_spatial_context` | Contexto espacial (*here/*this/*selected) |
| `td_explore_project` | Tour guiado de un proyecto TD |
| `td_safe_plan` | Diagnóstico-first: spatial + healthcheck + plan |

### 📚 Solo base de conocimiento local (modo offline)

| Tool | Descripción |
|------|-------------|
| `td_pops_query` | Buscar en base de POPs |
| `td_ops_query` | Buscar en base de TOP/CHOP/SOP/DAT |
| `td_templates_query` | Buscar templates en Toe_Expand |
| `td_alias_resolve` | Resolver vocabulario a parámetros TD |
| `td_get_param_help` | Ayuda de parámetros (busca en OPs + POPs) |
| `tool_batch` | Ejecutar hasta 8 tools en batch |

### ↩️ Historial

| Tool | Descripción |
|------|-------------|
| `td_history_list` | Listar últimos cambios registrados |
| `td_history_undo` | Revertir el último cambio |
| `td_history_clear` | Limpiar historial local |

## 🔧 td_validate — Validación y auto-fix automático

Tool que ejecuta un pipeline completo después de CUALQUIER modificación:

```
Modificar TD → Healthcheck → ¿Errores? → Auto-Fix → Re-Validate → GLSL Check
```

### Qué hace

1. **Healthcheck** recursivo del path indicado (force-cook + detección de errores)
2. **Auto-fix** de expresiones Python comunes:
   - `sin(x)` → `math.sin(x)`
   - `cos(x)` → `math.cos(x)`
   - `log(x)` → `math.log(x)`
   - `sqrt(x)` → `math.sqrt(x)`
   - Y 40+ funciones más (trig, log, rounding, etc.)
3. **Re-validación** post-fix para confirmar que los errores se resolvieron
4. **GLSL Check** de todos los shaders glslPOP descendientes

### Funciones matemáticas cubiertas

| Categoría | Funciones |
|-----------|-----------|
| Trigonométricas | sin, cos, tan, asin, acos, atan, atan2, sinh, cosh, tanh, asinh, acosh, atanh |
| Potencia/raíz | sqrt, cbrt, pow, exp, exp2, expm1 |
| Logarítmicas | log, log2, log10, log1p |
| Redondeo | floor, ceil, round, trunc |
| Misc | abs, fabs, fmod, gcd, hypot, factorial, comb, perm |
| Comparación | min, max, sum, prod |
| Signo/clamp | sign, clamp |

### Uso

```json
{
  "tool": "td_validate",
  "arguments": {
    "path": "/project1/Pathtracer",
    "recurse": true,
    "auto_fix": true
  }
}
```

### Ejemplo de respuesta

```json
{
  "path": "/project1/Pathtracer",
  "final_status": "healthy",
  "summary": {
    "total_issues_before": 3,
    "fixes_applied": 3,
    "glsl_shaders_checked": 2,
    "glsl_errors": 0,
    "final_status": "healthy"
  },
  "errors_fixed": {
    "fixed": [
      {"path": "/project1/animated_torus/anim_box", "param": "rx", "old": "sin(...)", "new": "math.sin(...)"}
    ],
    "count": 3
  }
}
```

### Cuándo usarlo

- **Después de cada modificación** vía MCP (crear operador, setear parámetros, etc.)
- **Al detectar errores** con `td_healthcheck` — ejecutar `td_validate` para fix automático
- **Antes de un commit** — validar que toda la red está limpia

---

## 🔍 td_explore_project — Tour guiado de un proyecto TD

Inspired by TWOZERO's "Study this project" feature. Analyzes an entire TD project
and returns a structured report for the AI agent.

### Qué hace

1. **Walks the operator tree** (max depth 5, max 200 operators)
2. **Counts operators by family** (TOP, CHOP, SOP, DAT, COMP, POP, etc.) and type
3. **Detects errors** across all descendants (force-cook + error collection)
4. **Finds performance hotspots** — operators cooking slower than 1ms
5. **Identifies GLSL shaders** — glslTOP/glslPOP with compilation errors
6. **Lists extensions** — COMPs with Python extensions attached
7. **Finds custom parameters** — COMPs with custom parameter pages
8. **Returns a summary** optimized for AI agent consumption (structured JSON)

### Uso

```json
{
  "tool": "td_explore_project",
  "arguments": {
    "path": "/"
  }
}
```

### Ejemplo de respuesta

```json
{
  "path": "/",
  "total_ops": 47,
  "family_counts": {"TOP": 18, "CHOP": 12, "SOP": 5, "COMP": 8, "DAT": 4},
  "type_counts": {"noiseTOP": 3, "nullTOP": 6, "selectTOP": 2},
  "errors": [{"path": "/project1/geo1", "error": "NameError"}],
  "performance_hotspots": [{"path": "/project1/render1", "cookTime": 2.3}],
  "glsl_shaders": [{"path": "/project1/glsl1", "status": "ok"}],
  "extensions": ["/project1/TouchDesignerAPI"],
  "custom_par_comps": ["/project1/params1"]
}
```

### Cuándo usarlo

- **Al recibir un proyecto nuevo** — entender la estructura antes de modificar
- **Al diagnosticar problemas** — ver errores y cuellos de botella de un vistazo
- **Antes de td_network_plan** — entender qué ya existe en la red

---

## Mejoras implementadas

| # | Mejora | Detalle |
|---|--------|---------|
| 1 | **Cache de conexión** | `isConnected()` con TTL 2s. No hace fetch repetido. |
| 2 | **Watchdog reconexión** | `startConnectionWatchdog()` cada 10s. Callback `onConnectionChange`. |
| 3 | **Async execution** | `executeAsync()` + `waitForTask()` para tareas largas. |
| 4 | **Output preview** | `screenshotMulti()` batch con `maxSize` opcional. |
| 5 | **Base conocimiento precargada** | `ensureKnowledgeLoaded()` al iniciar. Búsqueda O(1) con índice Map. Fuzzy search con scoring. |
| 6 | **td_wizard** | `td_network_plan` con `apply=true` crea y conecta operadores automáticamente. |
| 7 | **td_watch** | Monitoreo en tiempo real: polling cada N segundos, alertas por threshold. |
| 8 | **td_export_network** | Exporta red TD a código Python / diff / JSON. |
| 9 | **Historial de cambios** | `td_history_list/undo/clear` con snapshots. |
| 10 | **Tests CI** | `npm run ci` compila + corre todos los tests. |
| 11 | **Documentación HTML** | Página interactiva en `mcp/docs/index.html` con buscador. |
| 12 | **Tutoriales integrados** | 5 tutoriales (audio-reactive, bloom, feedback, particles, GLSL). Tools `td_get_tutorial` y `td_list_tutorials`. |
| 13 | **Workflows reutilizables** | 8 workflows (color, motion-blur, chroma-key, feedback-trail, audio-visualizer, kaleidoscope, edge-detect, depth-of-field). Tools `td_get_workflow` y `td_list_workflows`. |
| 14 | **Python API reference** | `td_get_td_classes` lista operadores por familia. `td_get_module_help` da documentación detallada. |
| 15 | **Bundle .mcpb** | `mcp/mcp-bundle.json` para instalación one-click en Claude Desktop. |
| 16 | **Setup simplificado** | `mcp/setup/` con guías, script de extensión Python, e `install.mjs` interactivo. |
| 17 | **Git-diff export** | `td_export_network` soporta formatos `python`, `diff`, `json`. |
| 18 | **Multi-cliente** | Compatibilidad verificada: 30/30 tests. `npm run compat`. |
| 19 | **td_validate** | Validación + auto-fix automático de expresiones + GLSL check post-modificación. |
| 20 | **Knowledge base Pathtracer** | Tutorial, workflow y prompt maestro para path tracing GLSL en GPU. |
| 21 | **td_spatial_context** | Contexto espacial: *here (network), *this (selected), siblings, pane state. |
| 22 | **td_explore_project** | Tour guiado: estructura, operadores, flujo de datos, errores, performance. |
| 23 | **td_safe_plan** | Safe mode: diagnose-first workflow (spatial + healthcheck + classify + plan). |
| 24 | **Verify-after-fixes** | Auto-validate después de cada modificación (create, connect, pars_set, etc.). |
| 25 | **WebSocket transport** | JSON-RPC over WebSocket con auto-reconnect, heartbeat, HTTP fallback. |

## Fixes de bugs (historial)

- `setParameters`: migrado de endpoint HTTP `/parameters/set` a `/exec` (elimina HTTP 400)
- `copyNode`: `parent.copy(src)` sin name + `newOp.name = name` (TD no acepta 2 args)
- `customParameters`: `appendFloat(name, label=label)` con keyword arg + nombres con mayúscula
- `execute`: migrado de `/execute` a `/exec` (captura stdout correctamente)
- `executeJson`: maneja stdout vacío, stderr, regex fallback para JSON extraviado
- `readChop`: valida `t.family == 'CHOP'` antes de leer
- `pulseParam`: búsqueda fuzzy por nombre + fallback
- `templatesDb`: límite 200 archivos, 5 niveles de profundidad
- `healthcheck`: default `recurse=false`
- `getPerf`: usa `op('/')` en vez de `me`
- `hasattr` en customParameters: reemplazado por try/except directo

## Tests

```bash
# Smoke test sin TD (tools locales)
node mcp/test_smoke.mjs

# Smoke test con TD
TDAPI_HOST=192.168.x.x node mcp/test_smoke.mjs

# Pruebas avanzadas (requiere TD)
TDAPI_HOST=192.168.x.x node mcp/test_advanced.mjs

# CI: compila + corre todo
npm run ci

# Compatibilidad multi-cliente
npm run compat

# Instalación interactiva
node mcp/install.mjs
```

## Documentación interactiva

Abrir `mcp/docs/index.html` en un navegador para una página con:
- Lista completa de tools con descripciones
- Indicador online/offline
- Buscador en vivo
- Schema de inputs
- Dark theme

## Arquitectura

```
touchdesigner/
├── api/              # TDClient (librería HTTP)
│   ├── src/index.ts  # Cliente con caché, watchdog, async
│   └── src/tdWebSocket.ts  # WebSocket transport client
├── mcp/              # MCP Server
│   ├── src/
│   │   ├── server.ts           # Entry point + registro
│   │   ├── networkPlanner.ts   # Planificador + fuzzy search
│   │   ├── templatesDb.ts      # Búsqueda en templates
│   │   ├── tools/              # Implementación de tools
│   │   │   ├── knowledge.ts    # Base conocimiento + export
│   │   │   ├── crud.ts         # Create/delete/connect/copy
│   │   │   ├── parameters.ts   # Get/set/pulse/custom pars
│   │   │   ├── inspection.ts   # Healthcheck, perf, spatial context, explore project
│   │   │   ├── execution.ts    # Execute + network plan
│   │   │   ├── ui.ts           # Screenshot, navigate, search
│   │   │   ├── data.ts         # DAT/CHOP read/write
│   │   │   ├── lifecycle.ts    # Save/load, snapshot, memory
│   │   │   ├── batch.ts        # Tool batch
│   │   │   ├── history.ts      # Undo tracking
│   │   │   ├── watchdog.ts     # Performance monitor
│   │   │   ├── validate.ts     # Auto-fix + validation pipeline
│   │   │   ├── postValidate.ts # Post-modification validation
│   │   │   ├── classify.ts     # Shared issue classifier
│   │   │   └── safeMode.ts     # Safe mode (diagnose-first)
│   ├── data/                   # Base de conocimiento
│   │   ├── ops/                # Operadores TOP/CHOP/SOP/DAT
│   │   └── pops/               # Operadores POP
│   ├── docs/                   # Documentación HTML
│   └── test_smoke.mjs          # Tests
└── toe/
    └── src/TouchDesignerAPI.py # Servidor HTTP en TD
```
