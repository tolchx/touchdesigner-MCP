# TD-MCP Server — API Reference

> **Versión:** 3.0.0  
> **Protocolo:** MCP (Model Context Protocol) sobre stdio  
> **Backend:** TouchDesigner API HTTP en `http://localhost:44444`  
> **Total de herramientas:** ~90

---

## Índice

- [1. CRUD — Operadores](#1-crud--operadores)
- [2. Parámetros](#2-parámetros)
- [3. Inspección](#3-inspección)
- [4. Ejecución y Planificación](#4-ejecución-y-planificación)
- [5. Datos (DAT/CHOP)](#5-datos-datchop)
- [6. UI y Editor](#6-ui-y-editor)
- [7. Ciclo de Vida](#7-ciclo-de-vida)
- [8. Validación y Tests](#8-validación-y-tests)
- [9. Conocimiento (Knowledge Base)](#9-conocimiento-knowledge-base)
- [10. Herramientas Mejoradas (Enhanced)](#10-herramientas-mejoradas-enhanced)
- [11. Parches (Patch Engine)](#11-parches-patch-engine)
- [12. Seguridad (Safe Mode)](#12-seguridad-safe-mode)
- [13. Historial (History)](#13-historial-history)
- [14. Watchdog (Monitor de Rendimiento)](#14-watchdog-monitor-de-rendimiento)
- [15. WebToe Bridge](#15-webtoe-bridge)
- [16. TDN Export](#16-tdn-export)
- [17. Batch Tool](#17-batch-tool)
- [18. Python Stdio Server](#18-python-stdio-server)
- [19. Códigos de Error](#19-códigos-de-error)

---

## 1. CRUD — Operadores

### `td_create_operator`
Crea un nuevo operador en TouchDesigner.

**Parámetros:**
| Campo | Tipo | Obligatorio | Defecto | Descripción |
|-------|------|-------------|---------|-------------|
| `type` | `string` | ✅ | — | Tipo TD (ej. `noiseTOP`, `constantCHOP`, `glslPOP`) |
| `name` | `string` | ❌ | auto-named | Nombre del nuevo operador |
| `path` | `string` | ❌ | `"/"` | Ruta del padre |
| `position_x` | `number` | ❌ | — | Posición X en el editor |
| `position_y` | `number` | ❌ | — | Posición Y en el editor |
| `outputattrs` | `string` | ❌ | `"P"` (GLSL) | Atributos de salida para GLSL POPs |
| `numelems` | `number` | ❌ | `100` (GLSL) | Número de elementos para GLSL POPs |

**Auto-configuración GLSL POP:**  
Para `glslPOP`, `glslCreatePOP`, `glslAdvancedPOP`, `glslcopyPOP` y `glslCopyPOP`:
- `outputattrs` se auto-set a `"P"` (a menos que se pase `""`)
- `numelems` se auto-set a `100` (a menos que se pase `0`)
- Si `setParameters` falla, se agrega `glslConfigWarning` al resultado

**Ejemplo:**
```json
// Crear noiseTOP con nombre y posición
{ "type": "noiseTOP", "name": "mi_noise", "path": "/project1", "position_x": 0, "position_y": 0 }

// GLSL POP con auto-config
{ "type": "glslPOP", "name": "deformer", "path": "/project1/geo1" }
```

**Respuesta típica:**
```json
{
  "success": true,
  "path": "/project1/mi_noise",
  "name": "mi_noise",
  "type": "noiseTOP",
  "family": "TOP",
  "validation": { "ok": true, "issueCount": 0, "summary": "✅ Network healthy..." }
}
```

**Error:** Si el padre no existe → `"Parent not found"`. Si el tipo es inválido → error TD.

---

### `td_delete_operator`
Elimina un operador por su ruta completa.

| Campo | Tipo | Obligatorio | Descripción |
|-------|------|-------------|-------------|
| `path` | `string` | ✅ | Ruta completa del operador a eliminar |

**Ejemplo:** `{ "path": "/project1/noise1" }`

---

### `td_connect_nodes`
Conecta dos operadores (salida → entrada).

| Campo | Tipo | Obligatorio | Defecto | Descripción |
|-------|------|-------------|---------|-------------|
| `source_path` | `string` | ✅ | — | Operador fuente (output) |
| `target_path` | `string` | ✅ | — | Operador destino (input) |
| `source_output` | `string` | ❌ | `"output"` | Nombre del output |
| `target_input` | `number` | ❌ | `0` | Índice de input en destino |

**Nota:** Usa `.outputConnectors[0].connect(dst)` (NO `.outputs[0].connect()`).  
**Validación post-conexión:** Corre healthcheck para detectar cook loops.

**Ejemplo:**
```json
{
  "source_path": "/project1/noise1",
  "target_path": "/project1/blur1",
  "target_input": 0
}
```

---

### `td_disconnect`
Desconecta una entrada de un operador.

| Campo | Tipo | Obligatorio | Defecto | Descripción |
|-------|------|-------------|---------|-------------|
| `path` | `string` | ✅ | — | Ruta del operador |
| `input_index` | `number` | ❌ | `0` | Índice de input a desconectar |

---

### `td_copy_node`
Duplica un operador.

| Campo | Tipo | Obligatorio | Descripción |
|-------|------|-------------|-------------|
| `path` | `string` | ✅ | Ruta del operador fuente |
| `destination` | `string` | ❌ | Padre destino (omite = mismo padre) |
| `name` | `string` | ❌ | Nuevo nombre para la copia |

---

## 2. Parámetros

### `td_pars_get`
Lee parámetros de un operador.

| Campo | Tipo | Obligatorio | Descripción |
|-------|------|-------------|-------------|
| `path` | `string` | ✅ | Ruta del operador |
| `names` | `string[]` | ❌ | Lista opcional de nombres de parámetros |

**Ejemplo:** `{ "path": "/project1/noise1", "names": ["amp", "type", "seed"] }`

**Respuesta:** Contiene `path`, `operator`, `parameters[]` (cada uno con: `name`, `label`, `style`, `mode`, `value`, `expr`, `default`, `isExpression`, `isPulse`, `menuNames`, `menuLabels`) y `missing[]`.

---

### `td_pars_set`
Set parámetros transaccionalmente con rollback.

| Campo | Tipo | Obligatorio | Defecto | Descripción |
|-------|------|-------------|---------|-------------|
| `path` | `string` | ✅ | — | Ruta del operador |
| `updates` | `array` | ✅ | — | Array de `{name, value?, expr?}` |
| `transactional` | `boolean` | ❌ | `true` | Rollback si falla algún update |

**Validación post-set:** Corre healthcheck para detectar errores de expresión.

**Ejemplo:**
```json
{
  "path": "/project1/noise1",
  "updates": [
    { "name": "type", "value": "simplex" },
    { "name": "amp", "value": 0.8 }
  ],
  "transactional": true
}
```

---

### `td_set_operator_pars`
Set parámetros con interfaz más limpia (solo `name` + `value`).

| Campo | Tipo | Obligatorio | Defecto | Descripción |
|-------|------|-------------|---------|-------------|
| `path` | `string` | ✅ | — | Ruta del operador |
| `updates` | `array` | ✅ | — | Array de `{name, value}` |
| `transactional` | `boolean` | ❌ | `true` | Rollback si falla |

---

### `td_pulse_param`
Pulsa un parámetro (ej. Cook, Reset, Save).

| Campo | Tipo | Obligatorio | Descripción |
|-------|------|-------------|-------------|
| `path` | `string` | ✅ | Ruta del operador |
| `name` | `string` | ✅ | Nombre del parámetro a pulsar |

---

### `td_custom_parameters`
Crea página de parámetros custom en un COMP.

| Campo | Tipo | Obligatorio | Descripción |
|-------|------|-------------|-------------|
| `path` | `string` | ✅ | Ruta del COMP |
| `page` | `string` | ✅ | Nombre de la página custom |
| `params` | `array` | ✅ | Array de `{name, type?, default?, min?, max?, label?}` |

**`type` soportados:** `"float"`, `"int"`, `"toggle"`, `"pulse"` (defecto: `"float"`).  
**Solo COMPs:** Custom parameters solo funcionan en operadores COMP.

---

## 3. Inspección

### `td_pane` (sin args)
Estado del panel del editor: `networkPath`, `x`, `y`, `zoom`.

### `td_selection` (sin args)
Operadores seleccionados: `operators[]` con `path`, `name`, `type`, `opType`, `family`.

### `td_operators`
Lista hijos en una ruta.

| Campo | Tipo | Obligatorio | Defecto | Descripción |
|-------|------|-------------|---------|-------------|
| `path` | `string` | ❌ | `"/"` | Ruta a listar |

### `td_find`
Busca operadores por criterios.

| Campo | Tipo | Obligatorio | Descripción |
|-------|------|-------------|-------------|
| `path` | `string` | ❌ | Ruta base |
| `query` | `string` | ❌ | Texto libre |
| `name` | `string` | ❌ | Substring del nombre |
| `family` | `string` | ❌ | Familia (TOP/CHOP/SOP/POP/DAT/COMP/MAT) |
| `opType` | `string` | ❌ | Substring del tipo |
| `recursive` | `boolean` | ❌ | Buscar descendientes |
| `limit` | `number` | ❌ | Máx. resultados (1-200) |

### `td_connections`
Conexiones reales de un operador/red.

| Campo | Tipo | Obligatorio | Descripción |
|-------|------|-------------|-------------|
| `path` | `string` | ✅ | Ruta del operador/container |
| `recurse` | `boolean` | ❌ | Incluir descendientes |

### `td_get_errors`
Errores y warnings. Force-cookea cada operador.

| Campo | Tipo | Obligatorio | Defecto | Descripción |
|-------|------|-------------|---------|-------------|
| `path` | `string` | ✅ | — | Ruta a inspeccionar |
| `recurse` | `boolean` | ❌ | `true` | Recursivo |

### `td_healthcheck`
Force-cook + valida red.

| Campo | Tipo | Obligatorio | Defecto | Descripción |
|-------|------|-------------|---------|-------------|
| `path` | `string` | ✅ | — | Ruta del operador |
| `recurse` | `boolean` | ❌ | `false` | Validar descendientes |

### `td_get_node_detail`
Info detallada: parámetros, inputs, flags.

| Campo | Tipo | Obligatorio | Defecto | Descripción |
|-------|------|-------------|---------|-------------|
| `path` | `string` | ✅ | — | Ruta del operador |
| `recurse` | `boolean` | ❌ | `false` | Incluir hijos |

### `td_get_hints`
Guía de conexiones para un tipo de operador.

| Campo | Tipo | Obligatorio | Descripción |
|-------|------|-------------|-------------|
| `node_type` | `string` | ✅ | Tipo (ej. `"noiseTOP"`) |

### `td_get_info` (sin args)
Info del entorno TD: `version`, `build`, `commercial`, `platform`, `projectFPS`.

### `td_get_focus` (sin args)
Foco actual del usuario: `networkPath`, `numPanes`, `selection[]`.

### `td_get_perf`
Datos de performance: FPS, operadores lentos.

| Campo | Tipo | Obligatorio | Defecto | Descripción |
|-------|------|-------------|---------|-------------|
| `path` | `string` | ❌ | `"/"` | Ruta a perfilar |
| `top` | `number` | ❌ | `20` | Cant. de ops más lentos |

### `td_pop_inspect`
Lee datos de partículas de un POP.

| Campo | Tipo | Obligatorio | Descripción |
|-------|------|-------------|-------------|
| `path` | `string` | ✅ | Ruta del POP |

### `td_get_build_compatibility`
Verifica si un tipo de operador existe en el build actual.

| Campo | Tipo | Obligatorio | Descripción |
|-------|------|-------------|-------------|
| `op_type` | `string` | ✅ | Tipo a verificar |

### `td_get_release_delta`
Info sobre cambios entre builds de TD.

| Campo | Tipo | Obligatorio | Descripción |
|-------|------|-------------|-------------|
| `build_from` | `string` | ✅ | Build origen |
| `build_to` | `string` | ❌ | Build destino (defecto: actual) |

### `td_spatial_context` (sin args)
Contexto espacial para `*here`, `*this`, `*these`: red activa, op actual, padre, selección, hermanos, paneles.

### `td_explore_project`
Tour guiado de un proyecto: conteo de ops, familias, errores, hotspots, GLSL shaders, extensiones.

| Campo | Tipo | Obligatorio | Defecto | Descripción |
|-------|------|-------------|---------|-------------|
| `path` | `string` | ❌ | `"/"` | Ruta raíz |

### `td_compare_networks`
Compara dos containers lado a lado: estructura, parámetros y conexiones.

| Campo | Tipo | Obligatorio | Descripción |
|-------|------|-------------|-------------|
| `path_a` | `string` | ✅ | Primer container |
| `path_b` | `string` | ✅ | Segundo container |

---

## 4. Ejecución y Planificación

### `td_execute`
Ejecuta Python en TouchDesigner.

| Campo | Tipo | Obligatorio | Defecto | Descripción |
|-------|------|-------------|---------|-------------|
| `code` | `string` | ✅ | — | Código Python |
| `from_op` | `string` | ❌ | `"/"` | Contexto (`me` en TD) |

**Ejemplo:**
```json
{
  "code": "import json; n = op('/project1/noise1'); print(json.dumps({'type': str(n.par.type.eval())}))",
  "from_op": "/project1"
}
```

### `td_network_plan`
Planifica red desde lenguaje natural con topología.

| Campo | Tipo | Obligatorio | Defecto | Descripción |
|-------|------|-------------|---------|-------------|
| `prompt` | `string` | ✅ | — | Instrucción en lenguaje natural |
| `target_path` | `string` | ❌ | — | Container destino |
| `container_name` | `string` | ❌ | — | Nombre del container generado |
| `apply` | `boolean` | ❌ | `false` | Aplicar el plan en TD |
| `use_llm` | `boolean` | ❌ | `true` | Usar LLM (vs determinístico) |

---

## 5. Datos (DAT/CHOP)

### `td_read_dat`
Lee contenido de un DAT.

| Campo | Tipo | Obligatorio | Descripción |
|-------|------|-------------|-------------|
| `path` | `string` | ✅ | Ruta del DAT |
| `start_line` | `number` | ❌ | Línea inicial (1-based) |
| `end_line` | `number` | ❌ | Línea final (inclusive) |

### `td_write_dat`
Escribe o parchea texto en un DAT.

| Campo | Tipo | Obligatorio | Descripción |
|-------|------|-------------|-------------|
| `path` | `string` | ✅ | Ruta del DAT |
| `text` | `string` | ❌ | Texto de reemplazo completo |
| `old_text` | `string` | ❌ | Texto a buscar |
| `new_text` | `string` | ❌ | Texto de reemplazo |
| `replace_all` | `boolean` | ❌ | Reemplazar todas las ocurrencias |

### `td_read_chop`
Lee canales de un CHOP.

| Campo | Tipo | Obligatorio | Descripción |
|-------|------|-------------|-------------|
| `path` | `string` | ✅ | Ruta del CHOP |
| `channels` | `string[]` | ❌ | Nombres de canales |
| `start` | `number` | ❌ | Índice inicial (0-based) |
| `end` | `number` | ❌ | Índice final |

---

## 6. UI y Editor

### `td_screenshot`
Captura screenshot del output de un operador.

| Campo | Tipo | Obligatorio | Descripción |
|-------|------|-------------|-------------|
| `path` | `string` | ❌ | Ruta (defecto: panel activo) |

### `td_get_screenshots`
Screenshots batch de múltiples operadores.

| Campo | Tipo | Obligatorio | Descripción |
|-------|------|-------------|-------------|
| `paths` | `string[]` | ✅ | Lista de rutas |
| `max_size` | `number` | ❌ | Tamaño máximo del lado más largo |

### `td_navigate_to`
Navega el viewport a un operador específico.

| Campo | Tipo | Obligatorio | Descripción |
|-------|------|-------------|-------------|
| `path` | `string` | ✅ | Ruta del operador |

### `td_read_textport`
Lee el textport (consola de TD).

| Campo | Tipo | Obligatorio | Defecto | Descripción |
|-------|------|-------------|---------|-------------|
| `lines` | `number` | ❌ | `20` | Líneas recientes |

### `td_clear_textport` (sin args)
Limpia el buffer del textport.

### `td_search`
Busca texto en DATs, expresiones y parámetros.

| Campo | Tipo | Obligatorio | Defecto | Descripción |
|-------|------|-------------|---------|-------------|
| `query` | `string` | ✅ | — | Texto a buscar |
| `root` | `string` | ❌ | `"/project1"` | Ruta raíz |
| `scope` | `enum` | ❌ | `"all"` | `"all"`, `"code"`, `"expressions"`, `"parameters"` |
| `case_sensitive` | `boolean` | ❌ | `false` | Sensible a mayúsculas |
| `max_results` | `number` | ❌ | `50` | Máx. resultados |
| `count_only` | `boolean` | ❌ | `false` | Solo conteo |

### `td_reinit_extension`
Reinicia la extension de un COMP.

| Campo | Tipo | Obligatorio | Descripción |
|-------|------|-------------|-------------|
| `path` | `string` | ✅ | Ruta del COMP |

### `td_auto_layout`
Auto-ordenamiento topológico de operadores.

| Campo | Tipo | Obligatorio | Defecto | Descripción |
|-------|------|-------------|---------|-------------|
| `path` | `string` | ✅ | — | Container a ordenar |
| `spacingX` | `number` | ❌ | `250` | Espaciado horizontal |
| `spacingY` | `number` | ❌ | `80` | Espaciado vertical |

### `td_smart_connect`
Crea operador entre dos existentes con auto-detección.

| Campo | Tipo | Obligatorio | Descripción |
|-------|------|-------------|-------------|
| `source` | `string` | ✅ | Operador fuente |
| `destination` | `string` | ✅ | Operador destino |
| `type` | `string` | ❌ | Tipo forzado (omite = auto-detecta null*) |
| `name` | `string` | ❌ | Nombre custom |

---

## 7. Ciclo de Vida

### `td_project_lifecycle`
Controla el lifecycle del proyecto TD.

| Campo | Tipo | Obligatorio | Descripción |
|-------|------|-------------|-------------|
| `action` | `enum` | ✅ | `save`, `load`, `undo`, `redo`, `start_undo_block`, `end_undo_block`, `clear_undo` |
| `path` | `string` | ❌ | Ruta de archivo (para save/load) |

### `td_snapshot_scene`
Snapshot de estado (parámetros, modos, expresiones).

| Campo | Tipo | Obligatorio | Defecto | Descripción |
|-------|------|-------------|---------|-------------|
| `path` | `string` | ❌ | `"/"` | Ruta raíz del snapshot |

### `td_memory_save`
Guarda entrada de memoria persistente.

| Campo | Tipo | Obligatorio | Descripción |
|-------|------|-------------|-------------|
| `key` | `string` | ✅ | Clave única |
| `content` | `string` | ✅ | Contenido de la memoria |
| `tags` | `string[]` | ❌ | Tags de categorización |

### `td_memory_recall`
Busca memorias guardadas.

| Campo | Tipo | Obligatorio | Defecto | Descripción |
|-------|------|-------------|---------|-------------|
| `query` | `string` | ✅ | — | Query de búsqueda |
| `limit` | `number` | ❌ | `5` | Máx. resultados |

---

## 8. Validación y Tests

### `td_validate`
Validación completa: healthcheck → auto-fix → re-check → GLSL check → clasificación → reportes.

| Campo | Tipo | Obligatorio | Defecto | Descripción |
|-------|------|-------------|---------|-------------|
| `path` | `string` | ✅ | — | Ruta a validar |
| `recurse` | `boolean` | ❌ | `true` | Validar descendientes |
| `auto_fix` | `boolean` | ❌ | `true` | Auto-fix (sin→math.sin, etc.) |

**Auto-fix:** Corrige `sin()` → `math.sin()`, `log()` → `math.log()`, etc.  
**Clasificación:** `expression_error`, `cook_loop`, `missing_file`, `glsl_error`, `needs_manual`.

### `td_perf_budget`
Verifica performance contra presupuestos configurables.

| Campo | Tipo | Obligatorio | Defecto | Descripción |
|-------|------|-------------|---------|-------------|
| `path` | `string` | ✅ | — | Ruta a perfilar |
| `max_cook_time_ms` | `number` | ❌ | `16.67` | Máx. cook time (60fps) |
| `max_point_count` | `number` | ❌ | `1000000` | Máx. puntos POP |
| `max_resolution` | `number` | ❌ | `4096` | Máx. resolución TOP |
| `max_recook_hz` | `number` | ❌ | `120` | Máx. recook frequency |

### `td_smoke_test`
Tests funcionales post-construcción: existencia, conexiones, feedback loops, atributos.

| Campo | Tipo | Obligatorio | Descripción |
|-------|------|-------------|-------------|
| `path` | `string` | ✅ | Ruta raíz a testear |
| `expected_operators` | `string[]` | ❌ | Rutas esperadas |
| `expected_connections` | `array` | ❌ | `{source, target, input?}` |
| `check_feedback_loops` | `string[]` | ❌ | Rutas con feedback loops |
| `check_attributes` | `array` | ❌ | `{path, attribute}` |

### `td_syntactic_check`
Valida sintaxis Python, seguridad de rutas, integridad JSON y conexiones cross-family.

| Campo | Tipo | Obligatorio | Descripción |
|-------|------|-------------|-------------|
| `code` | `string` | ❌ | Código Python a validar |
| `json_str` | `string` | ❌ | JSON a validar |
| `path` | `string` | ❌ | Ruta TD a validar |
| `connections` | `array` | ❌ | Array de `{source, target}` |

### `td_pop_validate`
Validación específica de POPs: reglas de atributos, topología, advertencias.

| Campo | Tipo | Obligatorio | Descripción |
|-------|------|-------------|-------------|
| `path` | `string` | ✅ | Ruta del POP |

### `td_run_test`
Ejecuta tests legacy `.mjs` desde `mcp/tests/`.

| Campo | Tipo | Obligatorio | Descripción |
|-------|------|-------------|-------------|
| `name` | `string` | ✅ | Nombre del test (sin `.mjs`) |
| `args` | `string` | ❌ | Argumentos CLI |

---

## Recursos MCP

Además de las herramientas, el servidor expone **recursos** (recursos estilo REST) que se pueden leer:

| URI | Descripción | Source |
|-----|-------------|--------|
| `td://status` | Estado de conexión: `{connected, baseUrl}` | `createTouchDesignerMcpServerWithStatus()` |
| `td://info` | Info de TouchDesigner: build, versión, FPS | Python stdio server (`mcp_server_stdio.py`) |
| `td://performance` | Métricas de performance: FPS, ops lentos | Python stdio server |
| `td://spatial_context` | Contexto espacial: *here, *this, *these | Python stdio server |

**Ejemplo de `td://status`:**
```json
{
  "connected": true,
  "baseUrl": "http://localhost:44444"
}
```

---

## 9. Conocimiento (Knowledge Base)

### `td_pops_query`
Busca en la base de conocimiento de POPs.

| Campo | Tipo | Obligatorio | Descripción |
|-------|------|-------------|-------------|
| `search` | `string` | ❌ | Texto de búsqueda |
| `page_slug` | `string` | ❌ | Slug exacto (ej. `Particle_POP`) |
| `limit` | `number` | ❌ | Máx. resultados (1-50) |

### `td_ops_query`
Busca en la base de conocimiento de TOP/CHOP/SOP/DAT.

| Campo | Tipo | Obligatorio | Descripción |
|-------|------|-------------|-------------|
| `search` | `string` | ❌ | Texto de búsqueda |
| `family` | `enum` | ❌ | Familia: `TOP`, `CHOP`, `SOP`, `DAT` |
| `page_slug` | `string` | ❌ | Slug exacto |
| `limit` | `number` | ❌ | Máx. resultados (1-50) |

### `td_templates_query`
Busca templates reutilizables.

| Campo | Tipo | Obligatorio | Descripción |
|-------|------|-------------|-------------|
| `search` | `string` | ✅ | Frase de búsqueda |
| `project` | `string` | ❌ | Filtro de proyecto |
| `limit` | `number` | ❌ | Máx. resultados (1-50) |

### `td_alias_resolve`
Resuelve vocabulario de lenguaje natural a parámetros/atributos TD.

| Campo | Tipo | Obligatorio | Descripción |
|-------|------|-------------|-------------|
| `text` | `string` | ✅ | Texto en lenguaje natural |

**Ejemplo:** `"feedback loop"` → `{families: [...], parameters: [...], attributes: [...]}`.

### `td_get_param_help`
Busca parámetros de un tipo de operador en la KB local.

| Campo | Tipo | Obligatorio | Descripción |
|-------|------|-------------|-------------|
| `type` | `string` | ✅ | Tipo de operador (ej. `noiseTOP`) |

### `td_search_official_docs`
Busca en la documentación offline de TD.

| Campo | Tipo | Obligatorio | Defecto | Descripción |
|-------|------|-------------|---------|-------------|
| `query` | `string` | ✅ | — | Query de búsqueda |
| `limit` | `number` | ❌ | `5` | Máx. resultados |

### `td_export_network`
Exporta red como Python, diff o JSON.

| Campo | Tipo | Obligatorio | Defecto | Descripción |
|-------|------|-------------|---------|-------------|
| `path` | `string` | ✅ | — | Container a exportar |
| `format` | `enum` | ❌ | `"python"` | `"python"`, `"diff"`, `"json"` |

### `td_list_tutorials`
Lista tutoriales disponibles.

| Campo | Tipo | Obligatorio | Descripción |
|-------|------|-------------|-------------|
| `category` | `string` | ❌ | Categoría (audio, glow, feedback, particles, shader) |
| `difficulty` | `string` | ❌ | Dificultad (beginner, intermediate, advanced) |

### `td_get_tutorial`
Obtiene contenido de un tutorial.

| Campo | Tipo | Obligatorio | Descripción |
|-------|------|-------------|-------------|
| `name` | `string` | ✅ | Nombre del tutorial (sin `.md`) |

### `td_list_workflows`
Lista workflows reutilizables.

| Campo | Tipo | Obligatorio | Descripción |
|-------|------|-------------|-------------|
| `category` | `string` | ❌ | Categoría (color, blur, keying, feedback, audio, etc.) |
| `difficulty` | `string` | ❌ | Dificultad |

### `td_get_workflow`
Obtiene contenido de un workflow.

| Campo | Tipo | Obligatorio | Descripción |
|-------|------|-------------|-------------|
| `name` | `string` | ✅ | Nombre del workflow (sin `.md`) |

### `td_get_td_classes`
Lista todas las clases de operadores TD.

| Campo | Tipo | Obligatorio | Descripción |
|-------|------|-------------|-------------|
| `family` | `string` | ❌ | Filtrar por familia |
| `search` | `string` | ❌ | Búsqueda dentro de nombres |
| `limit` | `number` | ❌ | Máx. por familia (defecto 50) |

### `td_get_module_help`
Documentación detallada de un operador.

| Campo | Tipo | Obligatorio | Descripción |
|-------|------|-------------|-------------|
| `name` | `string` | ✅ | Page slug o tdOpTypeGuess |

---

## 10. Herramientas Mejoradas (Enhanced)

### `td_resolve_operator`
Convierte lenguaje natural a tipos exactos de operadores TD. 200+ sinónimos.

| Campo | Tipo | Obligatorio | Defecto | Descripción |
|-------|------|-------------|---------|-------------|
| `prompt` | `string` | ✅ | — | Descripción NLP (ej. `"noisy webcam with blur"`) |
| `limit` | `number` | ❌ | `3` | Máx. matches (1-10) |

### `td_get_template`
Obtiene template de red pre-construido (8 disponibles).

| Campo | Tipo | Obligatorio | Descripción |
|-------|------|-------------|-------------|
| `name` | `string` | ✅ | Nombre del template (usa `"list"` para ver todos) |
| `search` | `string` | ❌ | Buscar por keyword |

**Templates:** `generative-art-feedback`, `audio-reactive-spectrum`, `particle-system-basic`, `glow-bloom`, `glsl-shader-pipeline`, `chroma-key-composite`, `kaleidoscope`, `edge-detect`.

### `td_list_templates`
Lista todos los templates.

| Campo | Tipo | Obligatorio | Descripción |
|-------|------|-------------|-------------|
| `tag` | `string` | ❌ | Filtrar por tag |

### `td_get_recipe`
Obtiene builder recipe con código Python paste-ready.

| Campo | Tipo | Obligatorio | Descripción |
|-------|------|-------------|-------------|
| `name` | `string` | ✅ | Nombre (usa `"list"` para ver todos) |
| `search` | `string` | ❌ | Buscar por keyword |

### `td_search_knowledge`
Búsqueda full-text (FTS5 + BM25) en documentación TD.

| Campo | Tipo | Obligatorio | Defecto | Descripción |
|-------|------|-------------|---------|-------------|
| `query` | `string` | ✅ | — | Query de búsqueda |
| `family` | `enum` | ❌ | — | Filtrar por familia |
| `limit` | `number` | ❌ | `5` | Máx. resultados (1-20) |

### `td_catalog`
Navega el catálogo de operadores.

| Campo | Tipo | Obligatorio | Descripción |
|-------|------|-------------|-------------|
| `action` | `enum` | ✅ | `"list"`, `"search"`, `"get"`, `"stats"` |
| `family` | `enum` | ❌ | Familia (para `"list"`) |
| `query` | `string` | ❌ | Query (para `"search"`) |
| `opType` | `string` | ❌ | Tipo (para `"get"`) |

### `td_get_family_hints`
Sugiere familia de operador desde lenguaje natural.

| Campo | Tipo | Obligatorio | Descripción |
|-------|------|-------------|-------------|
| `prompt` | `string` | ✅ | Descripción NLP |

---

## 11. Parches (Patch Engine)

### `td_patch_plan`
Planifica un parche complejo con inyección de contexto pre-turn.

| Campo | Tipo | Obligatorio | Defecto | Descripción |
|-------|------|-------------|---------|-------------|
| `prompt` | `string` | ✅ | — | Descripción NLP de lo que construir |
| `target_path` | `string` | ❌ | — | Container destino |
| `dry_run` | `boolean` | ❌ | `true` | Solo planificar, no aplicar |

### `td_patch_preview`
Previsualiza qué nodos se crearán y cómo se conectarán.

| Campo | Tipo | Obligatorio | Descripción |
|-------|------|-------------|-------------|
| `prompt` | `string` | ✅ | Descripción NLP |
| `target_path` | `string` | ❌ | Container destino |

### `td_patch_apply`
Aplica un parche con undo-block y auto-rollback.

| Campo | Tipo | Obligatorio | Descripción |
|-------|------|-------------|-------------|
| `prompt` | `string` | ✅ | Descripción NLP |
| `target_path` | `string` | ❌ | Container destino |

### `td_patch_variations`
Genera enfoques alternativos para un parche.

| Campo | Tipo | Obligatorio | Defecto | Descripción |
|-------|------|-------------|---------|-------------|
| `prompt` | `string` | ✅ | — | Descripción NLP |
| `count` | `number` | ❌ | `3` | Número de variaciones (1-5) |

### `td_complexity_check`
Analiza complejidad de un prompt.

| Campo | Tipo | Obligatorio | Descripción |
|-------|------|-------------|-------------|
| `prompt` | `string` | ✅ | Descripción NLP a analizar |

**Retorna:** `tier` (basic/standard/pro), `complexityScore` (0-100), `recommendation`.

---

## 12. Seguridad (Safe Mode)

### `td_safe_plan`
Diagnóstico pre-modificación: contexto espacial + healthcheck + clasificación + plan.

| Campo | Tipo | Obligatorio | Defecto | Descripción |
|-------|------|-------------|---------|-------------|
| `path` | `string` | ❌ | `*here` | Ruta específica a diagnosticar |
| `include_children` | `boolean` | ❌ | `true` | Incluir hijos en healthcheck |

**ALWAYS call before modifications when user uses `*here`, `*this`, or refers to current view.**

---

## 13. Historial (History)

### `td_history_list`
Lista cambios registrados en memoria.

| Campo | Tipo | Obligatorio | Defecto | Descripción |
|-------|------|-------------|---------|-------------|
| `limit` | `number` | ❌ | `20` | Máx. entradas (1-100) |

### `td_history_undo` (sin args)
Revierte el cambio más reciente restaurando parámetros del snapshot.

### `td_history_clear` (sin args)
Limpia todo el historial local (no afecta a TD).

---

## 14. Watchdog (Monitor de Rendimiento)

### `td_watch`
Monitoreo de performance en tiempo real.

| Campo | Tipo | Obligatorio | Defecto | Descripción |
|-------|------|-------------|---------|-------------|
| `path` | `string` | ❌ | `"/"` | Ruta a monitorear |
| `interval` | `number` | ❌ | `5` | Intervalo de polling (segundos) |
| `threshold` | `number` | ❌ | `50` | Umbral de cook time (ms) para alertas |
| `max_samples` | `number` | ❌ | `60` | Máx. samples en buffer circular |
| `action` | `enum` | ❌ | `"snapshot"` | `"start"`, `"stop"`, `"snapshot"` |

---

## 15. WebToe Bridge

### `wt_generate_op`
Genera OpSpec + shader GLSL/WGSL para cualquier operador TD.

| Campo | Tipo | Obligatorio | Defecto | Descripción |
|-------|------|-------------|---------|-------------|
| `op_type` | `string` | ✅ | — | Tipo de operador TD |
| `family` | `enum` | ❌ | — | Forzar familia |
| `with_shaders` | `boolean` | ❌ | `true` | Generar shaders (TOP only) |
| `webtoe_format` | `boolean` | ❌ | `true` | Formato WebToe OpSpec |

### `wt_build_network`
Lenguaje natural → `.webtoe.json`.

| Campo | Tipo | Obligatorio | Defecto | Descripción |
|-------|------|-------------|---------|-------------|
| `prompt` | `string` | ✅ | — | Descripción NLP |
| `title` | `string` | ❌ | — | Título del proyecto |
| `output_format` | `enum` | ❌ | `"json"` | `"json"` o `"download"` |

### `wt_list_gaps`
Lista operadores TD que WebToe aún no implementa.

| Campo | Tipo | Obligatorio | Defecto | Descripción |
|-------|------|-------------|---------|-------------|
| `family` | `enum` | ❌ | — | Filtrar por familia |
| `implementable_only` | `boolean` | ❌ | `true` | Solo implementables |
| `limit` | `number` | ❌ | `20` | Máx. resultados |

### `wt_resolve_prompt`
Lenguaje natural → tipos de operador WebToe.

| Campo | Tipo | Obligatorio | Defecto | Descripción |
|-------|------|-------------|---------|-------------|
| `prompt` | `string` | ✅ | — | Descripción NLP |
| `limit` | `number` | ❌ | `5` | Máx. resultados |

### `wt_list_opspecs`
Lista OpSpecs disponibles localmente.

| Campo | Tipo | Obligatorio | Defecto | Descripción |
|-------|------|-------------|---------|-------------|
| `family` | `enum` | ❌ | — | Filtrar por familia |
| `limit` | `number` | ❌ | `20` | Máx. resultados |

---

## 16. TDN Export

### `td_tdn_export`
Exporta red TD a formato TDN JSON para diff/versionado. Captura: tipos, posiciones, colores, parámetros no-defecto, conexiones, parámetros custom, flags, tags, comentarios, DAT content, anotaciones.

| Campo | Tipo | Obligatorio | Defecto | Descripción |
|-------|------|-------------|---------|-------------|
| `path` | `string` | ✅ | — | Container a exportar |
| `include_children` | `boolean` | ❌ | `true` | Incluir hijos |
| `include_params` | `boolean` | ❌ | `true` | Incluir parámetros |
| `include_dat_content` | `boolean` | ❌ | `false` | Incluir contenido DAT |
| `include_inline_shaders` | `boolean` | ❌ | `false` | Incluir shaders inline (GLSL) |
| `format` | `enum` | ❌ | `"tdn"` | `"tdn"`, `"minimal"`, `"flat"` |

---

## 17. Batch Tool

### `tool_batch`
Ejecuta múltiples tools en un solo batch. Máx. 8 tools por batch.

| Campo | Tipo | Obligatorio | Descripción |
|-------|------|-------------|-------------|
| `tools` | `array` | ✅ | Array de `{name, args?}` (máx. 8) |

**Ejemplo:**
```json
{
  "tools": [
    { "name": "getInfo", "args": {} },
    { "name": "getPaneState", "args": {} },
    { "name": "createOperator", "args": { "type": "noiseTOP", "name": "n1", "path": "/project1" } }
  ]
}
```

**Tools disponibles en batch:** `execute`, `getPaneState`, `getSelection`, `getOperators`, `getParameters`, `setParameters`, `getConnections`, `findOperators`, `healthcheck`, `getErrors`, `getInfo`, `getFocus`, `getPerf`, `createOperator`, `deleteOperator`, `connectNodes`, `disconnect`, `copyNode`, `screenshot`, `getScreenshots`, `projectLifecycle`, `popInspect`, `getNodeDetail`, `getHints`, `getBuildCompatibility`, `getReleaseDelta`, `snapshotScene`, `readDat`, `writeDat`, `readChop`, `searchInTD`, `navigateTo`, `reinitExtension`, `pulseParam`, `customParameters`, `readTextport`, `clearTextport`, `memorySave`, `memoryRecall`, `searchOfficialDocs`.

---

## 18. Python Stdio Server

El archivo `mcp_server_stdio.py` implementa un servidor MCP alternativo en Python puro.

**Tools disponibles:**

| Tool | Descripción |
|------|-------------|
| `create_td_node` | Crea operador. `type` (ej. `td.noiseTOP`), `name`, `parent` |
| `delete_td_node` | Elimina operador. `path` |
| `get_td_nodes` | Lista operadores. `path` |
| `get_td_parameters` | Obtiene parámetros. `path` |
| `set_td_parameters` | Set parámetros. `path`, `params` (dict) |
| `connect_td_nodes` | Conecta nodos. `src`, `dst`, `input` (opcional) |
| `execute_td_python` | Ejecuta Python. `code` |
| `verify_td_network` | Verifica red. `path` |
| `get_td_performance` | Obtiene performance (sin args) |
| `get_td_spatial_context` | Contexto espacial (sin args) |
| `capture_td_screenshot` | Screenshot (sin args) |
| `get_td_help` | Ayuda de operador. `module` |

---

## 19. Códigos de Error

### Errores HTTP (API TD)

| Código | Significado |
|--------|-------------|
| `HTTP 404` | Operador no encontrado |
| `HTTP 500` | Error interno de TD |
| `Timeout` | TD no responde (>30s) |

### Errores MCP

| Tipo | Causa |
|------|-------|
| `"Parent not found"` | El path padre para `createOperator` no existe |
| `"Not found"` | El operador especificado no existe |
| `"Connection refused"` | TD API no está corriendo en el puerto |
| `"SyntaxError"` | Código Python inválido en `td_execute` |
| `"AttributeError"` | Parámetro no existe en el operador |
| `"ExecutionError"` | Error durante ejecución de Python en TD |
| `"Operator type <x> not found"` | Tipo de operador inválido en `createOperator` |
| `"Invalid connection"` | Conexión entre familias incompatibles |

### Errores de Validación Post-Modificación

| Tipo | Descripción |
|------|-------------|
| `expression_error` | Función matemática sin `math.` prefijo |
| `cook_loop` | Dependencia circular de cook |
| `missing_file` | Archivo no encontrado en DAT |
| `glsl_error` | Error de compilación GLSL |
| `needs_manual` | Requiere inspección manual |

---

## Formato de Respuesta

Todas las herramientas devuelven respuestas en formato MCP estándar:

**Éxito:**
```json
{
  "content": [
    { "type": "text", "text": "{ \"success\": true, ... }" }
  ]
}
```

**Error:**
```json
{
  "content": [
    { "type": "text", "text": "{ \"error\": \"mensaje\" }" }
  ],
  "isError": true
}
```

---

## Mejores Prácticas

1. **Leer parámetros antes de setear** — Siempre usa `td_pars_get` primero para conocer nombres exactos
2. **Usar `/exec` para batches** — Crear 10+ operadores individualmente es lento; bátchalos en una llamada
3. **Validar después de modificar** — `td_connect_nodes` y `td_pars_set` incluyen validación automática post-modificación
4. **Safe Plan antes de cambios** — Usa `td_safe_plan` cuando el usuario use `*here`/`*this` para evitar cambios en el lugar equivocado
5. **Tool batch para operaciones múltiples** — Usa `tool_batch` para ejecutar hasta 8 operaciones en secuencia
6. **Tiempo de espera** — Las operaciones en TD pueden tomar tiempo; timeout por defecto es 30s
7. **Nombres de parámetros** — Usa nombres `.eval()` (ej. `amp`, `tx`, `sx`), no labels (ej. "Amplitude", "Translate X")
8. **Conexiones multi-output** — Usa `.outputConnectors[0].connect(dst, input_index)`
9. **GLSL POP requiere** — `outputattrs='P'` y `numelems` > 0 para escribir P[id]/Cd[id]
10. **Python 3.9 en TD** — No uses `str | None` (union syntax); usa `Optional[str]` en su lugar
