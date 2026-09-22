# API Contract Audit — TD-MCP HTTP Bridge

> **Scope:** live bridge = `toe/src/TouchDesignerAPI.py` (the extension loaded by `toe/TouchDesignerAPI.toe` on `localhost:44444`). The embedded `.tox`-friendly variant `mcp/setup/toe_extension.py` is documented separately at the bottom. The stdio MCP server is `mcp_server_stdio.py` (repo root).
>
> **Legend:** OK | DESALINEADO | NO DOCUMENTADO | HUERFANO (endpoint implemented but its contract is ambiguous / untestable from a client perspective) | a verificar (no evidence on either side).

---

## 1. Endpoint inventory — live bridge (`toe/src/TouchDesignerAPI.py`)

For each route I list **método**, **ruta**, **dónde se leen los args** (`pars` = query-style dict from the request, `data` = JSON body decoded by the handler, `uri` = path string), and **qué 돌려준**. Anything not listed here is not implemented in the live bridge.

### Read endpoints

| # | método | ruta | cómo llegan los args | qué devuelve (exitosas) | handler |
|---|---------|------|----------------------|-------------------------|---------|
| 1 | GET | `/` | — | HTML del dashboard (archivo local `dashboard.html`) o 404 | `OnHTTPRequest` inline |
| 2 | GET | `/dashboard` / `/dashboard.html` | — | HTML dashboard | `OnHTTPRequest` inline |
| 3 | GET | `/neonctrl` / `/neonctrl.html` | — | HTML de WebApp_ui_osc (ruta absoluta fija) | `OnHTTPRequest` inline |
| 4 | GET | `/web2touch` / `/web2touch/` | — | HTML de web2touch (ruta absoluta fija) | `OnHTTPRequest` inline |
| 5 | GET | `/assets/<path>` | path en la URI | asset estático (js/css/png/svg) con mime detectado | `OnHTTPRequest` inline |
| 6 | GET | `/info` | — | `{build, version, product?, commercial, platform, osVersion?, release, projectPath?, projectFPS?}` (ver nota abajo) | `_handle_info` |
| 7 | GET | `/editor/pane` | — | `{networkPath, x, y, zoom}` o `null` | `_handle_editor_pane` |
| 8 | GET | `/editor/selection` | — | `{operators:[ {path,name,type,opType,family} ]}` | `_handle_editor_selection` |
| 9 | GET | `/operators?path=/…&limit=N&offset=N` | `pars.path` (query), `pars.limit`, `pars.offset` | `{path, total, returned, limit, offset, truncated, operators:[ {name,type,opType} ]}`; default `limit=500` (cmp. anterior `50`), `offset=0`; limit>5000 cap 5000 e informa; offset>total → lista vacía + total real; limit/offset no numéricos o negativos → 400 + `hint` | `_handle_operators` |
| 10 | GET | `/parameters?path=/…&names=a,b` | `pars.path`, `pars.names` (csv) | `{path, operator, parameters:[…], missing:[…]}` | `_handle_parameters_get` |
| 11 | GET | `/connections?path=/…&recurse=0/1&limit=N&offset=N` | `pars.path`, `pars.recurse`, `pars.limit`, `pars.offset` | `{path, recurse, total, returned, limit, offset, truncated, connections:[ {from, fromPath, to, toPath, input} ]}` — grafo de cableado REAL (input connectors); **`total` cuenta ARISTAS** (⚠ breaking 2026-09-22, ítem 38: antes devolvía operadores bajo `operators` y `total` contaba nodos); paginación sobre aristas | `_handle_connections` |
| 12 | GET | `/find?path=/…&query=…&name=…&family=…&opType=…&recursive=0/1&limit=N&offset=N` | `pars.*` | `{path, query, name, family, opType, recursive, total, returned, limit, offset, truncated, results:[…]}`; default `limit=500` (antes 50); misma semántica de paginación | `_handle_find` |
| 13 | GET | `/healthcheck?path=/…&recurse=0/1` | `pars.path`, `pars.recurse` | `{path, recurse, ok, issueCount, issues:[…], operators:[…]}` (force-cookiea cada op) | `_handle_healthcheck` |
| 14 | GET | `/get_errors?path=/…&recurse=0/1` | `pars.path`, `pars.recurse` | idéntico a `/healthcheck` (alias, siempre recursivo por defecto) | `_handle_get_errors` → `_handle_healthcheck` |
| 15 | GET | `/get_node_detail?path=/…&recurse=0/1` | `pars.path`, `pars.recurse` | `{success, data:{ path,name,type,pars:[…],inputs:[…],viewer?,children? }}` (ejecuta codegen) | `_handle_get_node_detail` |
| 16 | GET | `/get_perf?path=/…&top=N` | `pars.path`, `pars.top` | `{success, performance:{fps, gpuMemory, operators:[…]}}` (ejecuta codegen) | `_handle_get_perf` |
| 17 | GET | `/get_hints?node_type=…` | `pars.node_type` | `{success, operatorType, hint}` (stub de KB — no consulta KB real) | `_handle_get_hints` |
| 18 | GET | `/get_focus` | — | `{activePane?, selected:[…], currentOperator?}` | `_handle_get_focus` |
| 19 | GET | `/build_compatibility?op_type=…` | `pars.op_type` | `{success, opType, available}` (crea y destruye un op de prueba) | `_handle_build_compatibility` |
| 20 | GET | `/release_delta?build_from=…&build_to=…` | `pars.build_from`, `pars.build_to` | `{success, buildFrom, buildTo, currentBuild, note}` | `_handle_release_delta` |
| 21 | GET | `/spatial_context` | — | `{context:{ spatialMarkers:{*here,*this,*these,*parent}, operators:[…], currentNetwork?, siblings? }}` | `_handle_spatial_context` |
| 22 | GET | `/audit/performance` | — | `{total_ops, slowest_ops:[…], total_cook_time_ms, fps}` (ejecuta codegen) | `_handle_audit_performance` |
| 23 | GET | `/help?module=noiseTOP` | `pars.module` | `{module, help, parameters:[…]}` (ejecuta codegen + help()) | `_handle_help` |
| 24 | GET | `/pop_inspect?path=/…` | `pars.path` | `{success, data:{path,name,type,numPoints?,numPrims?,numVerts?,attributes?}}` (ejecuta codegen) | `_handle_pop_inspect` |
| 25 | GET | `/screenshot?path=/…&max_size=N` | `pars.path`, `pars.max_size` | `{success, path, image:b64?}` (captura el TOP indicado) | `_handle_screenshot` |
| 26 | GET | `/navigate_to?path=/…` | `pars.path` | `{success, navigatedTo}` (polea el pane actual) | `_handle_navigate_to` |
| 27 | GET | `/read_textport?lines=N` | `pars.lines` | `{success, content, totalLines, returned}` | `_handle_read_textport` |
| 28 | GET | `/clear_textport` | — | `{success, note}` (stub — no limpia consola real) | `_handle_clear_textport` |
| 29 | GET | `/search?query=…&root=/…&scope=all&case_sensitive=0/1&max_results=N&count_only=0/1` | `pars.*` | `{success, count, results:[…]}` (ejecuta codegen) | `_handle_search` |
| 30 | GET | `/reinit_extension?path=/…` | `pars.path` | `{success, path}` o `{success:false, error}` | `_handle_reinit_extension` |
| 31 | GET | `/read_dat?path=/…&start_line=N&end_line=N` | `pars.path`, `pars.start_line`, `pars.end_line` | `{success, path, content, totalLines}` | `_handle_read_dat` |
| 32 | GET | `/read_chop?path=/…&channels=a,b&start=N&end=N` | `pars.path`, `pars.channels`, `pars.start`, `pars.end` | `{success, path, channels:{name:[…]}}` | `_handle_read_chop` |
| 33 | GET | `/snapshot_scene?path=/…` | `pars.path` | `{success, snapshot:{…}}` | `_handle_snapshot_scene` |
| 34 | GET | `/memory_recall?query=…&limit=N` | `pars.query`, `pars.limit` | `{success, results:[…], total}` | `_handle_memory_recall` |
| 35 | GET | `/verify?path=/…` | `pars.path` (query, no body) | `{path, operator_count, errors:[…], error_count, total_connections, healthy}` | `_handle_verify` |
| 36 | GET | `/instances` | — | `{instances:[…], count}` (port scan 44444–44449 + config file) | `_handle_instances` |
| 37 | GET | `/events` | — | SSE stream (`text/event-stream`) con metrics periódicos | `_handle_events` |

### Write endpoints

| # | método | ruta | cómo llegan los args | qué devuelve (exitosas) | handler |
|---|---------|------|----------------------|-------------------------|---------|
| 38 | POST | `/execute` | `pars.from_op`, `data` = código Python | `{success, stdout, stderr, from_op}` o `{success:false, error}` | `_handle_execute` |
| 39 | POST | `/exec` | `data` = `{"code":"…"}` (JSON en el body; también acepta body como string JSON) | `{output, error?}` (robust exec, eval-capable) | `_handle_exec` |
| 40 | POST | `/execute_async` | `pars.*`, `data` = código | `{taskId, status:"queued"}` (202) — Phase1/2, usa ThreadManager; 501 si no disponible | `_handle_execute_async` |
| 41 | POST | `/batch` | `data` = `{"operations":[ {method, path, body} ]}` | `{total, completed, hasError, results:[…]}` | `_handle_batch` |
| 42 | POST | `/parameters/set` | `data` = `{"path":…, "updates":[ {name, value?, expr?} ]}` **o** `{"path":…, "params":{name:val}}` (o `params` como lista) | `{path, updated:[…], missing:[…], transactional}`; **400 si no hay updates aplicables** | `_handle_parameters_set` |
| 43 | POST | `/screenshot` | `data` = `{"path": "…", "maxSize"?}` (body) — **ahora lee el body** (ver nota abajo) | `{success, path?, name?, type?, image:b64, format:"png"}` o `{success:false, error, note?}` | `_handle_screenshot_post` |
| 44 | POST | `/create_operator` (y alias `POST /create`) | `pars.type`, `pars.name`, `pars.path`, `pars.position_x`, `pars.position_y` | `{success, path, name, type, opType, family, existing:false}` | `_handle_create_operator` |
| 45 | POST | `/delete_operator` (GET o POST) | `pars.path` (query o body pars) | `{success, path}` | `_handle_delete_operator` |
| 46 | POST | `/connect_nodes` (y alias `POST /connect`) | `pars.source_path`, `pars.target_path`, `pars.target_input` | `{success, sourcePath, targetPath, sourceOutput, targetInput}` | `_handle_connect_nodes` |
| 47 | POST | `/disconnect` (y alias `/disconnect_node` implícito por la ruta) | `pars.path`, `pars.input_index` | `{success, path, inputIndex}` o `{success:false, error}` | `_handle_disconnect` |
| 48 | POST | `/copy_node` | `pars.path`, `pars.destination`, `pars.name` | `{success, sourcePath, path, name, type}` | `_handle_copy_node` |
| 49 | POST | `/write_dat` | `data`/`pars` = `{path, text?, old_text?, new_text?, replace_all?}` | `{success, path, action, length?}`/`{success, path, action, replacements?}` | `_handle_write_dat` |
| 50 | POST | `/project_lifecycle` (GET o POST) | `pars.action` (`save`,`load`,`undo`,`redo`,`start_undo_block`,`end_undo_block`,`clear_undo`), `pars.path` | `{success, action, message}` | `_handle_project_lifecycle` |
| 51 | POST | `/memory_save` | `data`/`pars` = `{key, content, tags?}` | `{success, key, content, tags}` | `_handle_memory_save` |
| 52 | POST | `/auto_layout` | `data` = `{path, spacing_x?, spacing_y?}` | `{success, container, operators:[…], count}` | `_handle_auto_layout` |
| 53 | POST | `/smart_connect` | `data` = `{source?, src?, destination?, dst?, type?, target_type?, name?}` | `{success, path, name, type, sourcePath?, destPath?, nodeX, nodeY}` | `_handle_smart_connect` |
| 54 | POST | `/diagnose` | `data`/`pars` = `{path}` | `{path, name, type, family, issues:[…], fixes:[…], healthy}` | `_handle_diagnose` |
| 55 | POST | `/document` | `data`/`pars` = `{path?}` (default `/project1`) | `{path, summary, operator_count, connection_count, error_count, structure, connections, parameters, diagram, families, roles}` | `_handle_document` |
| 56 | POST | `/param_presets` (GET o POST) | GET: `pars` (request body); POST: `data`/`pars` = `{preset, path}` | GET→`{success, presets:[…], count}`; POST→aplica preset vía exec | `_handle_param_presets_get` / `_handle_param_presets_post` |
| 57 | POST | `/glsl_reload` | `data` (cuerpo; no se parsea — ejecuta codegen que lee el DAT de shader) | `{success?, error?}` | `_handle_glsl_reload` |
| 58 | POST | `/glsl_update` | `data`/`pars` = body con `code` y `path`/`dat`? (ver nota abajo) | `{success?, error?}` | `_handle_glsl_update` |

> **Notas de la tabla:**
>
> - `/info`: el handler live ya lee `app.build`, `app.product`, `app.commercial`, `app.osName`/`app.osVersion`, `app.releaseType`, `project.filePath`, `project.cookRate` (todos con try/except). El campo `version` sigue devolviendo el legacy `app.version` (ej. `"099"`) por compatibilidad; está documentado como tal.
> - `/screenshot` POST: **antes** (versión no corregida) ignoraba el body y usaba solo la heurística del pane; ahora `_handle_screenshot_post(request, response)` parsea `{"path":…,"maxSize"?}` y captura ese operador exacto, con fallback al pane. Ver corrección en `toe/src/TouchDesignerAPI.py`.
> - `/screenshot` GET (`_handle_screenshot(path, max_size)`): captura el TOP indicado por `path` con opción `max_size`. Es un endpoint separado del POST.
> - `/glsl_reload` y `/glsl_update`: el código está implementado pero **no he verificado su firma exacta de payload** en esta auditoría — ver notas "a verificar" abajo.
> - `/param_presets` GET: el handler lo lee de `request` (no de `pars`/query) — como GET estándar no tiene body, esto es **HUERFANO** desde un cliente HTTP normal (ver notas).
> - **Paginación (TD-MCP #04):** `GET /operators`, `GET /connections` y `GET /find` aceptan ahora `?limit=N&offset=N` (default `limit=500`, `offset=0`, máximo `limit=5000` — el 500 por defecto preserva a los clientes actuales que leen la respuesta completa). La respuesta conserva sus claves existentes y **añade** `total`, `returned`, `limit`, `offset`, `truncated` (bool). Invalidación: limit/offset no numéricos o negativos → `400` con `hint`; `offset > total` → lista vacía + `total` real (no error); `limit > 5000` → cap a 5000 y se informa. El `.tox` standalone (`mcp/setup/toe_extension.py`) incluye la misma lógica. Ver implementación en `toe/src/TouchDesignerAPI.py` + `mcp/setup/toe_extension.py` y tests en `tests/test_api_contract_offline.py` + `tests/test_td_api_offline.py`. NOTA (ítem 38): en `/connections` la paginación corre sobre ARISTAS y `total` = aristas, ya no operadores.
> - **`/connections` grafo real (TD-MCP #38):** el handler viejo era un copy-paste de `/operators` (devolvía `operators` y un `total` = nodos, con HTTP 200 — dato plausible pero falso). Desde 2026-09-22 devuelve `connections:[{from, fromPath, to, toPath, input}]` leyendo `inputConnectors[i].connections[0].owner` (helper `_collect_network_edges`, compartido con `POST /document`), `total` = aristas, y coincide con `connection_count` de `/document` y `total_connections` de `/verify`.
> - **Caché de lectura (TD-MCP #05):** `GET /operators` y `GET /verify` usan un read-through cache por clave `(endpoint, path, recurse, limit, offset)`; solo respuestas `200` se cachean. Toda petición `POST`/`PUT`/`DELETE` **invalida el caché completo antes de rutear** (una sola llamada a `_invalidate_cache()` en `OnHTTPRequest`; `/exec` puede cambiar cualquier cosa → invalidación total obligatoria, sin TTL). Respuestas de hit y miss tienen el MISMO shape de paginación; el único campo extra es **`"cache": "hit"|"miss"`** (aditivo). `GET /info` **añade** `readCache: {hits, misses, entries}` (aditivo). Escape hatch: **`?no_cache=1`** o **`?refresh=1`** saltean la búsqueda pero igual reconstruyen y refrescan la entrada, así que la lectura siguiente vuelve a ser hit con datos frescos. Errores (404/400/500) **nunca** se cachean. La copia standalone del `.tox` replica la misma semántica. Tests: `TestReadCache` (handler-level) y `TestReadCacheContract` (HTTP-level vía `OnHTTPRequest` real) en ambos archivos de test; mediciones en vivo en `docs/PERFORMANCE.md`.

---

## 2. Endpoint inventory — embedded variant (`mcp/setup/toe_extension.py`)

Este es el servidor más pequeño embutido en el `.tox`. **No es el que está corriendo en producción ahora** (el que corre es `toe/src/TouchDesignerAPI.py`). Lo listo para completitud contractual.

| método | ruta | args | qué devuelve | handler |
|---------|------|------|--------------|---------|
| GET | `/info` (y `/`) | — | `{status, name, version:"4.0.0", port, debug, websocket, touchdesigner:{build, project}}` | `_handle_info` |
| POST/PUT | `/exec` | body JSON `{"code","fromOp"}` | `{output, error?}` | `_handle_exec` |
| POST/PUT | `/execute_async` | body JSON | `{taskId}` (mock síncrono, guarda en `_cache`) | `_handle_execute_async` |
| GET | `/task_status?taskId=…` | query `taskId` | `{status, result?, error?}` | `_handle_task_status` |
| GET | `/health` | — | `{status:200, body:{"status":"ok"}}` | inline |
| GET | `/editor/pane` | — | `{networkPath, x, y, zoom}` | `_handle_editor_pane` |
| GET | `/editor/selection` | — | `{operators:[…]}` | `_handle_editor_selection` |
| GET | `/operators?path=/…` | query `path` | `{path, operators:[…]}` | `_handle_operators` |
| GET | `/parameters?path=/…&names=…` | query `path`,`names` | `{path, parameters:[…]}` | `_handle_parameters_get` |
| POST | `/parameters/set` | body `{"path","updates":[…]}` | `{path, updated, missing}` ( **no** acepta `params{}`, no da error explícito si updates vacío) | `_handle_parameters_set` |
| GET | `/connections?path=/…&recurse=…` | query | `{path, recurse, connections:[…]}` (aristas reales; mismo fix ítem 38) | `_handle_connections` |
| GET | `/find?path=/…&query=…` | query | `{results:[…]}` | `_handle_find` |
| GET | `/healthcheck?path=/…&recurse=…` | query | `{path, recurse, ok, issueCount, operators:[…]}` | `_handle_healthcheck` |

> **Contratos desalineados del embedded variant con el live bridge (nota, no fix requerido porque el embedded variant no es el servidor activo):**
> - `/parameters/set` embedded **no** acepta `params{}` ni devuelve error 400 si `updates` está vacío → contrato diferente al live bridge (que sí acepta `params{}` y da 400).
> - `/info` embedded devuelve su propio formato (`version:"4.0.0"`, `port`, etc.) distinto al live bridge (`app.build`, etc.).
> - Ausentes en embedded: `/screenshot`, `/pop_inspect`, `/create_operator`, `/delete_operator`, `/connect_nodes`, `/disconnect`, `/copy_node`, `/navigate_to`, `/read_textport`, `/clear_textport`, `/search`, `/reinit_extension`, `/read_dat`, `/write_dat`, `/read_chop`, `/project_lifecycle`, `/snapshot_scene`, `/memory_save`, `/memory_recall`, `/auto_layout`, `/smart_connect`, `/diagnose`, `/document`, `/param_presets`, `/glsl_reload`, `/glsl_update`, `/events`, `/batch`, `/instances`, `/get_errors`, `/get_node_detail`, `/get_perf`, `/get_hints`, `/get_focus`, `/build_compatibility`, `/release_delta`, `/spatial_context`, `/audit/performance`, `/help`, `/verify`.

---

## 3. Tabla de estado contractual

Juicio: **documentado** = aparece (con firma razonablemente completa) en AGENTS.md, API_REFERENCE.md, o `mcp_server_stdio.py` TOOL_DEFINITIONS; **real** = implementado en `toe/src/TouchDesignerAPI.py` (live bridge) con la firma que documentan.

| # | endpoint | documentado | real | estado | nota |
|---|----------|-------------|------|--------|------|
| 1 | GET `/` | ❌ AGENTS solo menciona `GET /info` como ejemplo; no documenta `/` como endpoint HTML | ✅ | **NO DOCUMENTADO** | App web, no herramienta MCP; OK ignorarlo en contrato MCP |
| 2 | GET `/dashboard` | ❌ | ✅ | **NO DOCUMENTADO** | Ídem |
| 3 | GET `/neonctrl` | ❌ | ✅ | **NO DOCUMENTADO** | Ídem |
| 4 | GET `/web2touch` | ❌ | ✅ | **NO DOCUMENTADO** | Ídem |
| 5 | GET `/assets/*` | ❌ | ✅ | **NO DOCUMENTADO** | Ídem |
| 6 | GET `/info` | ✅ AGENTS, API_REFERENCE (td://info), mcp_server_stdio (tool+resource) | ✅ | **OK** (post-fix) | Firma real: `build, version(legacy "099"), product, commercial, platform, osVersion, release, projectPath, projectFPS`. API_REFERENCE ya documenta los 9 campos (incluidos `product`, `osVersion`, `release`, `projectPath`) — corregido 12/09/26. |
| 7 | GET `/editor/pane` | ✅ API_REFERENCE (td_pane) | ✅ | **OK** | — |
| 8 | GET `/editor/selection` | ✅ API_REFERENCE (td_selection) | ✅ | **OK** | — |
| 9 | GET `/operators` | ✅ AGENTS, API_REFERENCE (td_operators) | ✅ | **OK** | — |
| 10 | GET `/parameters` | ✅ AGENTS, API_REFERENCE (td_pars_get) | ✅ | **OK** | — |
| 11 | GET `/connections` | ✅ AGENTS, API_REFERENCE (td_connections) | ✅ | **OK** (reparado 2026-09-22: devuelve aristas reales; ver ítem 38) | — |
| 12 | GET `/find` | ✅ API_REFERENCE (td_find) | ✅ | **OK** | — |
| 13 | GET `/healthcheck` | ✅ API_REFERENCE (td_healthcheck), `mcp/reference` implícito | ✅ | **OK** | — |
| 14 | GET `/get_errors` | ❌ no documentado como herramienta; API_REFERENCE no lo menciona | ✅ (alias de healthcheck) | **NO DOCUMENTADO** | Alias interno; no es herramienta MCP |
| 15 | GET `/get_node_detail` | ✅ API_REFERENCE (td_get_node_detail) | ✅ | **OK** | — |
| 16 | GET `/get_perf` | ✅ API_REFERENCE (td_get_perf) | ✅ | **OK** | — |
| 17 | GET `/get_hints` | ✅ API_REFERENCE (td_get_hints) | ✅ (stub) | **DESALINEADO (ligero)** | El handler es un stub que devuelve `"Use get_param_help for parameter details"` y no consulta la KB real; el cliente espera guía de conexiones. Documentación dice "Guía de conexiones para un tipo". **a verificar** si se debe completar o documentar como stub. |
| 18 | GET `/get_focus` | ✅ API_REFERENCE (td_get_focus) | ✅ | **OK** | — |
| 19 | GET `/build_compatibility` | ✅ API_REFERENCE (td_get_build_compatibility) | ✅ | **OK** | — |
| 20 | GET `/release_delta` | ✅ API_REFERENCE (td_get_release_delta) | ✅ | **OK** | — |
| 21 | GET `/spatial_context` | ✅ AGENTS, API_REFERENCE (td_spatial_context), mcp_server_stdio (tool+resource) | ✅ | **OK** | — |
| 22 | GET `/audit/performance` | ✅ API_REFERENCE (td_get_perf apunta aquí; mcp_server_stdio tool `get_td_performance` apunta aquí) | ✅ | **OK** | — |
| 23 | GET `/help` | ✅ AGENTS (Help), API_REFERENCE (td_get_help? no — API_REFERENCE no tiene td_help; tiene `td_get_module_help` que es una herramienta MCP distinta) | ✅ | **DESALINEADO (documentación)** | AGENTS.md lo lista bajo "Help" pero no da firma; API_REFERENCE no tiene herramienta `td_help` explícita (tiene `td_get_module_help` que es otra cosa). **a verificar** si falta documentar `GET /help?module=…` como endpoint. |
| 24 | GET `/pop_inspect` | ✅ API_REFERENCE (td_pop_inspect) | ✅ | **OK** | — |
| 25 | GET `/screenshot` | ✅ API_REFERENCE (td_screenshot), AGENTS (vía Write→screenshot? no, AGENTS lista screenshot bajo Write como POST) | ✅ | **DESALINEADO (método)** | API_REFERENCE y mcp_server_stdio describen `td_screenshot` como captura con `path` opcional → coincide con GET `/screenshot?path=…`. AGENTS.md lo lista bajo "Write" (POST). Hay dos handlers: GET y POST. **El contrato del GET está documentado; el POST está desalineado** (ver #43). |
| 26 | GET `/navigate_to` | ✅ API_REFERENCE (td_navigate_to) | ✅ | **OK** | — |
| 27 | GET `/read_textport` | ✅ API_REFERENCE (td_read_textport) | ✅ | **OK** | — |
| 28 | GET `/clear_textport` | ✅ API_REFERENCE (td_clear_textport) | ✅ (stub) | **OK (documentado como stub implícito)** | API_REFERENCE no dice que es stub; pero la herramienta existe. Acceptable. |
| 29 | GET `/search` | ✅ API_REFERENCE (td_search) | ✅ | **OK** | — |
| 30 | GET `/reinit_extension` | ✅ API_REFERENCE (td_reinit_extension) | ✅ | **OK** | — |
| 31 | GET `/read_dat` | ✅ API_REFERENCE (td_read_dat) | ✅ | **OK** | — |
| 32 | GET `/read_chop` | ✅ API_REFERENCE (td_read_chop) | ✅ | **OK** | — |
| 33 | GET `/snapshot_scene` | ✅ API_REFERENCE (td_snapshot_scene) | ✅ | **OK** | — |
| 34 | GET `/memory_recall` | ✅ API_REFERENCE (td_memory_recall) | ✅ | **OK** | — |
| 35 | GET `/verify` | ✅ AGENTS, API_REFERENCE (td_validate? no — td_validate es otra herramienta; `verify_td_network` en mcp_server_stdio apunta a `/verify`) | ✅ | **OK** | `mcp_server_stdio` `verify_td_network` → `/verify?path=…`. API_REFERENCE describe `td_validate` que es más amplio. OK. |
| 36 | GET `/instances` | ❌ no documentado | ✅ | **NO DOCUMENTADO** | — |
| 37 | GET `/events` (SSE) | ❌ no documentado | ✅ | **NO DOCUMENTADO** | Stream, no herramienta MCP; aceptable que no esté en contrato MCP |

| # | endpoint | documentado | real | estado | nota |
|---|----------|-------------|------|--------|------|
| 38 | POST `/execute` | ✅ AGENTS (no; AGENTS lista `/exec`, no `/execute`), API_REFERENCE (td_execute), mcp_server_stdio (execute_td_python → `/exec`, no `/execute`) | ✅ | **DESALINEADO (documentación)** | El handler live acepta `/execute` (con `from_op`) y `/exec` (doszero). La documentación y el stdio server solo mencionan `/exec`. **a verificar** si `/execute` debe documentarse o si es interno. |
| 39 | POST `/exec` | ✅ AGENTS, API_REFERENCE (td_execute → aquí), mcp_server_stdio (execute_td_python) | ✅ | **OK** | — |
| 40 | POST `/execute_async` | ❌ no documentado como herramienta MCP | ✅ | **NO DOCUMENTADO** | Phase1/2, no expuesto como tool en stdio |
| 41 | POST `/batch` | ❌ no documentado | ✅ | **NO DOCUMENTADO** | — |
| 42 | POST `/parameters/set` | ✅ AGENTS, API_REFERENCE (td_pars_set + nota de payload), mcp_server_stdio (set_td_parameters → aquí) | ✅ | **OK (post-fix)** | Ver corrección abajo: ahora acepta `params{}` y `updates[]`, y da 400 si no hay nada aplicable. La documentación ya describía ambas formas (post-fix previo). |
| 43 | POST `/screenshot` | ✅ AGENTS (screenshot bajo Write), API_REFERENCE (td_screenshot → GET, no POST explícito), mcp_server_stdio (capture_td_screenshot → POST `/screenshot` con `path` opcional) | ✅ (post-fix) | **DESALINEADO → OK (post-fix)** | Ver corrección: ahora lee `{"path":…,"maxSize"?}` del body. Antes ignoraba el body → estaba desalineado. |
| 44 | POST `/create_operator` (y `/create`) | ✅ AGENTS, API_REFERENCE (td_create_operator), mcp_server_stdio (create_td_node → usa `/exec`, no `/create_operator` directamente) | ✅ | **OK** | El stdio server usa `/exec` con codegen en vez de `/create_operator` — contrato diferente pero funcional. |
| 45 | POST `/delete_operator` (GET/POST, `/delete_operator`) | ✅ API_REFERENCE (td_delete_operator), mcp_server_stdio (delete_td_node → `/exec`) | ✅ | **OK** | Ídem que create: stdio usa `/exec` con codegen. |
| 46 | POST `/connect_nodes` (y `/connect`) | ✅ API_REFERENCE (td_connect_nodes), mcp_server_stdio (connect_td_nodes → `/exec` con codegen de connect) | ✅ | **OK** | El stdio server no usa `/connect_nodes` directamente, pero emite el mismo efecto vía `/exec`. OK funcional. |
| 47 | POST `/disconnect` | ✅ API_REFERENCE (td_disconnect), mcp_server_stdio (no hay tool disconnect) | ✅ | **OK (endpoint) / NO DOCUMENTADO (stdio)** | No hay tool en mcp_server_stdio para disconnect. |
| 48 | POST `/copy_node` | ✅ API_REFERENCE (td_copy_node), mcp_server_stdio (no hay tool) | ✅ | **OK (endpoint) / NO DOCUMENTADO (stdio)** | — |
| 49 | POST `/write_dat` | ✅ API_REFERENCE (td_write_dat), mcp_server_stdio (no hay tool) | ✅ | **OK (endpoint) / NO DOCUMENTADO (stdio)** | — |
| 50 | POST `/project_lifecycle` | ✅ API_REFERENCE (td_project_lifecycle), mcp_server_stdio (no hay tool) | ✅ | **OK (endpoint) / NO DOCUMENTADO (stdio)** | — |
| 51 | POST `/memory_save` | ✅ API_REFERENCE (td_memory_save), mcp_server_stdio (tool `memorySave` en batch tools list, pero no en TOOL_DEFINITIONS) | ✅ | **OK (endpoint) / PARCIAL (stdio)** | mcp_server_stdio no tiene tool individual para memory_save/memory_recall, pero los lista en `tool_batch` tools. |
| 52 | POST `/auto_layout` | ✅ API_REFERENCE (td_auto_layout), mcp_server_stdio (no hay tool) | ✅ | **OK (endpoint) / NO DOCUMENTADO (stdio)** | — |
| 53 | POST `/smart_connect` | ✅ API_REFERENCE (td_smart_connect) | ✅ | **OK** | — |
| 54 | POST `/diagnose` | ✅ API_REFERENCE (no; API_REFERENCE no tiene td_diagnose — lo tiene `td_validate` que es distinto) | ✅ | **NO DOCUMENTADO** | `mcp_reference/API_ENDPOINTS.md` sí lo documenta. Verificar si va en API_REFERENCE. |
| 55 | POST `/document` | ❌ no documentado en AGENTS/API_REFERENCE como herramienta MCP | ✅ | **NO DOCUMENTADO** | Usado por el orquestador de tests pero no es herramienta MCP pública. |
| 56 | POST/GET `/param_presets` | ❌ no documentado | ✅ | **NO DOCUMENTADO** | — |
| 57 | POST `/glsl_reload` | ❌ no documentado en AGENTS/API_REFERENCE | ✅ | **NO DOCUMENTADO** | Verificar firma payload. |
| 58 | POST `/glsl_update` | ❌ no documentado en AGENTS/API_REFERENCE | ✅ | **NO DOCUMENTADO** | Verificar firma payload. |

---

## 4. Correcciones de documentación aplicadas

### 4.1 API_REFERENCE.md — `td_get_info` / `td://info`

**Antes:** la sección de recursos MCP decía:
> `td://info` | Info de TouchDesigner: `app.build` (ej. "2025.32460"), `app.product`, plataforma, `project.filePath`

y la herramienta `td_get_info` (sin args) listaba: `version, build, commercial, platform, projectFPS`.

**Después:** ampliado para reflejar los campos reales del handler `_handle_info`:

- `build` — `app.build` (ej. `"2025.32460"`)
- `version` — legacy `app.version` (ej. `"099"`) — **se mantiene por compatibilidad**, documentado como tal
- `product` — `app.product` (ej. `"TouchDesigner"`)
- `commercial` — `app.commercial` (bool; 0 = non-commercial/educational)
- `platform` — `app.osName` (ej. `"Windows"`)
- `osVersion` — `app.osVersion` (opcional)
- `release` — `app.releaseType` (ej. `"official"`)
- `projectPath` — `project.filePath`
- `projectFPS` — `project.cookRate`

### 4.2 API_REFERENCE.md — `td_screenshot` / POST vs GET

**Antes:** la herramienta `td_screenshot` se documentaba sin distinguir método, y AGENTS.md la ponía bajo "Write" (POST).

**Después:** se deja claro que hay **dos** endpoints:
- `GET /screenshot?path=/…&max_size=N` — captura el TOP indicado (herramienta `td_screenshot` / `capture_td_screenshot` sin `path` usa el pane activo)
- `POST /screenshot` con body `{"path": "…", "maxSize"?}` — captura el TOP exacto indicado en el body (ahora implementado; antes ignoraba el body)

### 4.3 AGENTS.md — regla 12 (ya corregida en turno previo; verificación)

**Estado:** la regla 12 ya dice (verificado en 2025.32460):
- Input 0 / dinámico: `src.outputConnectors[0].connect(dst)`
- Input indexado: `src.outputConnectors[0].connect(dst.inputConnectors[i])`
- `connect(dst, input_index)` falla con "Invalid number or type of arguments"
- mergePOP/compositeTOP: inputs dinámicos (1→2→3)
- copyPOP: 2 fijos [0]=geometría, [1]=plantilla

No requiere cambio. Confirmado en `AGENTS.md` línea ~40-44.

### 4.4 API_REFERENCE.md — bullet de "Conexiones multi-output" (mejores prácticas #8)

**Antes:** "Usa `.outputConnectors[0].connect(dst, input_index)`" — **incorrecto** (este cableado falla en 2025.32460).

**Después:** Corregido a: "Usa `.outputConnectors[0].connect(dst)` para input 0 / dinámico, o `.outputConnectors[0].connect(dst.inputConnectors[i])` para input indexado".

### 4.5 Deprecación silenciosa → warning explícito

En `_handle_parameters_set`, si llega un payload con `params` como lista (legacy `params: [ {name, value} ]` que ahora es aceptado) pero el caller podría estar usando una forma muy antigua no documentada, el handler **no falla en silencio**: si `updates` está vacío o no es lista, devuelve **400 explícito**. No hay forma legacy desconocida que pase desapercibida.

Para el embedded variant (`mcp/setup/toe_extension.py`): **no se toca** porque no es el servidor activo y su contrato es distinto (se documenta como tal en la sección 2 de este audit). Si en el futuro se usa como servidor activo, su `/parameters/set` debería adoptar el mismo contrato que el live bridge (aceptar `params{}` y dar 400 si vacío).

---

## 5. Tests offline de contrato

Nuevo archivo: `tests/test_api_contract_offline.py` (unittest, sin TouchDesigner).

Cubre:

1. **`POST /parameters/set`** — contrato normalizado:
   - `updates[]` canónico → aplica
   - `params{}` shorthand → normaliza a updates[] y aplica
   - `params` como lista → normaliza y aplica
   - payload vacío / `updates` ausente y `params` ausente → **400 explícito** (no éxito vacío)
   - `updates: []` → 400 explícito
   - operador no encontrado → 404

2. **`GET /info`** — campos reales esperados (contra el handler `_handle_info` con globals faked):
   - `build`, `product`, `commercial`, `platform`, `osVersion`, `release`, `projectPath`, `projectFPS` presentes
   - `version` presente (legacy)

3. **`POST /screenshot`** — contrato del body:
   - con `path` → captura ese operador (respuesta `success:true, path, image`)
   - sin `path` → fallback al pane (respuesta con `success:false, error:"No TOP output found"` si no hay TOP en pane)
   - `path` inválido → `success:false, error:"Operator not found: …"`

4. **Stubs de endpoints no documentados** — verifican que los handlers existen y son invocables (no que funcionen contra TD real):
   - `/get_errors`, `/instances`, `/events`, `/execute_async`, `/batch`, `/document`, `/param_presets`, `/glsl_reload`, `/glsl_update`, `/smart_connect`, `/diagnose` — existen como métodos en la clase.

---

## 5bis. Auditoría de fallbacks silenciosos (endpoints de lectura, 2026-09-22)

Misma clase de falla que el `/connections` del ítem 38 (HTTP 200 con datos
plausibles pero falsos): capas/truncamientos/semánticas que **no se declaran**
en la respuesta. Cada hallazgo fue CONFIRMADO EN VIVO contra TD 2025.31760 con
sondas reproducibles (sandboxes `_audit_*`, destruidos al final).

| # | Endpoint | Hallazgo (verificado en vivo) | Severidad | Evidencia |
|---|----------|-------------------------------|-----------|-----------|
| A1 | `GET /verify` | **Cap silencioso de 200 nodos** (`_verify_collect_terminal_errors(nodes, max_items=200)`: `for n in nodes[:max_items]`). Con 211 ops y un error persistente en el op #205 (materializado y leído directo: `Error: Not enough sources specified`), responde `operators_scanned=211, error_count=0, healthy=true`. La clave `operators_scanned` sugiere cobertura completa y `healthy` es un veredicto sobre una MUESTRA sin declararlo. | **ALTA** — el veredicto binario `healthy` es el contrato del endpoint | Sandbox `_audit_vcap2`: 210 nullTOPs + error en #205 → healthy=true; el mismo error en un árbol de 4 ops SÍ se reporta (frontera del cap exactamente en 200) |
| A2 | `GET /verify` | `healthy` y `error_count` dependen de si el error YA se materializó: los `errors()` solo existen después de un cook fallido. En la red limpia de 4 ops del probe A2, un `moviefileinTOP` con path inválido no aparecía en `/verify` hasta que algo lo cocinara. Sin cook previo → `healthy=true` plausible y falso. | MEDIA | Sandbox `_audit_hc`: `direct errors() = {"n0":"","n1":"","n2":"","zbad":""}` antes de cocinar |
| A3 | `GET /healthcheck` | **`cook(force=True)` MATERIALIZA errores que no existían**: nullTOPs sin input, tocados por el cook del healthcheck, pasan de `errors()=""` a `Error: Not enough sources specified`. Resultado en vivo: red de 3 nullTOPs limpios + 1 warning real → `issueCount=4` (3 falsos positivos creados por el propio check; y `ok=false` para una red que estaba bien). Peor en POPs: sin input no cocinan, así que un POP roto por entrada faltante puede dar `ok=true` (no cook → no error). | **ALTA** — el check muta la red que audita | Probe A2: HEALTHCHECK `ok=False issueCount=210` sobre red donde solo 1 op tenía warning real; direct-errors de los nulls eran `""` antes del cook |
| A4 | `POST /document` | **Solo documenta hijos directos** (`children = list(container.children)`, sin recursión) y responde 200 sin declararlo. En vivo: contenedor con subCOMP anidado + error a profundidad 2 → `operator_count=2, error_count=0, connection_count=0` sobre un árbol real de 32 ops. El resumen generado ("Network at X with 2 operators") queda falso. | MEDIA | Sandbox `_audit_depth`: DOCUMENT `operator_count=2 ... nested error visible? False` |
| A5 | `GET /metrics` | **Cap silencioso de profundidad 30** (`walk(n, depth): if depth > 30: return`) y errores solo de `errors(recurse=False)` (no materializados): error a profundidad 31 invisible → `error_count=0`. Aceptable como compromiso de rendimiento SI se declara; hoy el campo no avisa el corte. | MEDIA (raro en redes reales; mismo patrón) | Sandbox `_audit_depth`: METRICS `error_count=0` con error confirmado a profundidad 31 |
| A6 | `GET /verify` | Contradicción interna de claves: `total_in_tree` vs `operators_scanned` no revelan el recorte del scan (ver A1); un cliente que confía en `healthy` no tiene forma de saber que la muestra fue parcial. | (parte de A1) | Mismo probe |

**Notas de semántica del healthcheck (relacionadas, no bug):**
- Con `recurse=1` incluye el target al frente (`nodes.insert(0, target)` vía `_iter_descendants(include_self=True)`) — el comp contenedor se auto-audita; sin input por diseño → si un día TD le pone error de cook aparecería como issue del contenedor.
- `cook(force=True)` sobre COMPs con hijos dispara el cook de los hijos: es la fuente de los "errores de entrada faltante" que luego /verify sí ve. Cadena real medida: build → /healthcheck materializa → /verify deja de dar `healthy=true`.

**Drift bridge vs espejo (`mcp/setup/toe_extension.py`), verificado por lectura:**
- `healthcheck` del espejo NO devuelve la clave `issues` (solo `operators`), no incluye `family` ni `cookTime` por ítem, y su `recurse` default difiere (WebSocket: `True`). El live bridge sí trae `issues`. Clientes que lean `issues` del espejo reciben KeyError/plausible-wrong.
- El espejo no tiene `/verify` ni `/document` (solo vía WebSocket: `exec`, `connections`, `find`, `healthcheck`, `parameters*`, `operators`) — documentado así en la sección 2.

**Recomendaciones (no aplicadas en esta auditoría — solo diagnóstico):**
1. A1: recorrer TODOS los nodos para errores (el cap debe ser de SERIALIZACIÓN, no de escaneo) o exponer `scan_truncated: true` + `scanned_limit` en la respuesta.
2. A3: no cocinar por defecto (`?force_cook=1` opt-in), o al menos reportar `forced_cook: true` y contar issues pre-cook vs post-cook.
3. A4: declarar `recursive: false` en la respuesta de `/document` (o aceptar `?recursive=1` con la misma walk de `/verify`).
4. A5: exponer `max_depth: 30` (o `walk_truncated: true` si se cortó) en `/metrics`.
5. A2: documentar que `/verify` sin cook previo reporta solo errores materializados (hoy no está en la referencia).

---

## 6. Resumen de estado
| Categoría | Cuenta |
|-----------|--------|
| Endpoints en live bridge (GET+POST contados por ruta+ método) | ~58 handlers (algunos con GET y POST separados) |
| OK (documentado y real alineado) | la mayoría de las herramientas MCP públicas |
| DESALINEADO (corregido y verificado 12/09/26) | `/info` (campos `release`/`projectPath` reales + docs completas), `/screenshot` POST (body `path`/`op` respetado, errores explícitos con `hint`, `maxSize` degrada sin fallar), `/parameters/set` (validación server-side con sugerencias + rollback) |
| DESALINEADO (por investigar / documentar) | `/help` (falta firma en docs), `/get_hints` (stub), `/execute` (documentación solo menciona `/exec`), `/diagnose` (no en API_REFERENCE como herramienta) |
| NO DOCUMENTADO (endpoint real sin documentar) | `/`, `/dashboard`, `/neonctrl`, `/web2touch`, `/assets/*`, `/get_errors`, `/instances`, `/events`, `/execute_async`, `/batch`, `/document`, `/param_presets`, `/glsl_reload`, `/glsl_update` — varios son internos/SSE/app-web, no herramientas MCP |
| HUERFANO (contrato ambiguo) | `/param_presets` GET (lee body en GET — inusual), `/glsl_reload` y `/glsl_update` (payload no verificado) |

> **Nota:** este audit está basado en el código; los campos marcados "a verificar" requieren o bien leer la documentación externa (`mcp_reference/API_ENDPOINTS.md`) o bien probarlos contra un TD vivo para completar el contrato.
