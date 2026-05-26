# MCP TouchDesigner — Arquitectura (Node + TouchDesigner)

## Componentes

- **Servidor MCP (stdio)**: `touchdesigner/mcp/src/index.ts`
  Expone **24 herramientas** para ejecutar Python, consultar estado del editor, crear/conectar/eliminar operadores, inspeccionar POPs, hacer snapshot, lifecycle de proyectos, y consultar bases de conocimiento.

- **Cliente TD (HTTP)**: `touchdesigner/api/src/index.ts`
  Llama al servidor HTTP levantado dentro de TouchDesigner por el TOX. Clase `TDClient` con métodos para cada endpoint.

- **Servidor TD (Python/TOX)**: `touchdesigner/toe/src/TouchDesignerAPI.py`
  Expone 11 endpoints HTTP:
  - `POST /execute` — ejecutar Python
  - `POST /execute_async` — ejecución asíncrona
  - `GET /task_status` — estado de tareas
  - `GET /editor/pane` — estado del Network Editor
  - `GET /editor/selection` — selección actual
  - `GET /operators?path=` — lista de operadores
  - `GET /parameters?path=&names=` — leer parámetros
  - `POST /parameters/set` — establecer parámetros
  - `GET /connections?path=&recurse=` — conexiones
  - `GET /find?path=&query=&...` — búsqueda
  - `GET /healthcheck?path=&recurse=` — validación

## Tools MCP Completas (24)

### Tools originales (4)
- `td_execute`: ejecuta Python en TD.
- `td_pane`: estado del Network Editor.
- `td_selection`: selección actual.
- `td_operators`: lista hijos en un path.

### Tools expandidas v1 (10)
- `td_pops_query`: consulta la base local de POPs.
- `td_ops_query`: consulta base de operadores (TOP/CHOP/SOP/DAT).
- `td_pars_get`: leer parámetros de un operador.
- `td_pars_set`: establecer parámetros con rollback transaccional.
- `td_connections`: inspeccionar conexiones entrada/salida.
- `td_find`: buscar operadores por query/name/family/type.
- `td_templates_query`: buscar templates en documentación Toe_Expand.
- `td_alias_resolve`: mapear vocabulario de prompts a parámetros TD.
- `td_network_plan`: planificar o aplicar redes desde lenguaje natural.
- `td_healthcheck`: forzar cook y validar operadores/redes.

### Tools nuevas v2.0 (10)
- `td_create_operator`: crear operador por tipo con nombre/posición opcional.
- `td_delete_operator`: eliminar operador por path.
- `td_connect_nodes`: conectar dos operadores (salida→entrada).
- `td_get_errors`: obtener errores/warnings por operador.
- `td_screenshot`: capturar output de operador como base64 PNG.
- `td_get_param_help`: consultar parámetros de cualquier tipo de operador.
- `td_set_operator_pars`: establecer parámetros con interfaz más limpia.
- `td_pop_inspect`: leer datos POP (puntos, primitivas, vértices, atributos).
- `td_snapshot_scene`: guardar estado de operador antes de cambios destructivos.
- `td_project_lifecycle`: lifecycle (save/load/undo/redo/bloques).

## Nuevos Skills v2.0

### td-core-discipline
Reglas obligatorias para toda operación en TD:
- STOP rules: no adivinar nombres de parámetros, usar paths relativos en callbacks
- Node layout: grid spacing (250px horizontal, 200px vertical), left-to-right flow
- Color coding: blue=generators, green=processing, orange=outputs, purple=control, red=debug
- Error checking: siempre después de cada modificación
- Expresssions: absolute paths para op(), .mode = ParMode.EXPRESSION después de .expr
- Render pipeline pitfalls: geometryCOMP defaults to POP torus, reference params need OP refs, feedbackTOP canonical wiring, viewer flag on test COMPs

### td-build-2025
Documentación del build TD 2025.32820+ (Mayo 2026):
- **Trace POP**: reemplaza Polygonize POP (modo 2D)
- **Triangulate POP**: líneas cerradas a triángulos
- **Alembic Out POP / File Out POP / Point File In POP**: pipeline I/O de POPs
- **DMX Fixture POP + DMX Out POP**: lighting/rig workflow con Art-Net/sACN
- **Layer Mix TOP**: reemplaza pilas de Composite TOPs
- **Render Simple TOP**: render sin Camera/Light COMP
- **NVIDIA RTX Video TOP**: AI super-resolution + SDR-to-HDR
- **ST2110 In/Out TOP**: broadcast media-over-IP
- **Noise TOP 4D derivatives**, 3D textures/2D arrays nativos
- **Color management**: ACEScg, DCI-P3, Rec.2020, HDR
- **Pattern matching unificado**: bracket syntax, sets, boolean operators

## Bases de Conocimiento

- `data/ops/index.json`: 630+ operadores TOP/CHOP/SOP/DAT
- `data/ops/operators/<Family>/<PageSlug>.json`: detalles por operador
- `data/pops/index.json`: 99 operadores POP indexados
- `data/pops/operators/<PageSlug>.json`: 99 POPs con análisis multi-fuente

## Skills (13 total)

- `td-guide`, `td-fundamentals`, `td-pops-advanced`
- `td-core-discipline` (nuevo v2.0)
- `td-build-2025` (nuevo v2.0)
- `td-integration`, `td-performance`, `td-project-architecture`
- `td-robust-systems`
- `.trae/td-pop-architect`, `.trae/tdsw-pop-techniques`
- `.trae/td-project-analyzer`, `.trae/twozero`

## Flujo de extremo a extremo

1. Host MCP arranca `node touchdesigner/mcp/dist/index.js`.
2. El MCP recibe requests de tools via stdio.
3. Para acciones en TD: el MCP llama a métodos del `TDClient`.
4. `TDClient` hace fetch a `http://localhost:${TDAPI_PORT}` (default 44444).
5. TouchDesigner ejecuta Python y devuelve JSON.
6. Para queries de base de conocimiento: el MCP lee los archivos JSON locales directamente (sin tocar TD).

## Novedades v2.0

- 10 nuevas tools (total: 24)
- 2 nuevos skills (core-discipline, build-2025)
- Nuevo sistema de snapshot y POP inspection
- Project lifecycle tools (save/load/undo/redo)
- Screenshot de operadores como base64
- Documentación expandida: 13 skills, 630+ operadores, 99 POPs
