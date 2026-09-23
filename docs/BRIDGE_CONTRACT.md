# Bridge Contract — cliente ↔ bridge (ítem 11 del BACKLOG)

Una suite que detecta **drift** entre lo que los clientes construyen y lo que los
handlers del bridge esperan. Motivación: el drift real de `/parameters/set`
(cliente manda `updates[]`, docs decían `params{}`, el handler fallaba en
silencio con `updated: []`).

## Cómo funciona

**Un solo lugar declarativo**: `tests/bridge_contract.json` declara, para cada
endpoint POST, el shape del body que envían los clientes (campos requeridos,
permitidos, tipos), el handler que lo procesa y el shape de respuesta esperado.
Es el pivote: dos suites lo consumen y fallan si algún lado se mueve solo.

| Suite | Cliente cubierto | Técnica |
|---|---|---|
| `tests/test_client_contract.py` (17 tests) | stdio Python (`mcp_server_stdio.py`) + routing del dispatcher | (a) los tools reales del cliente se ejecutan con `_http_post` interceptado — se capturan los bodies reales; (b) el dispatcher se parsea del source real; (c) handlers reales ejecutados contra los fakes offline |
| `mcp/test/bridgeContract.test.js` (8 tests) | TS TDClient (`api/src/index.ts`) | el TDClient **real** corre contra un stub HTTP en loopback (127.0.0.1, puerto efímero); cada POST se captura y se compara campo por campo con el contrato |

Cobertura de endpoints POST: `/exec`, `/execute_async`, `/parameters/set`,
`/auto_layout`, `/smart_connect`, `/undo`, `/redo`, `/screenshot`. Los métodos
TS que viajan por `/exec` con Python inline (`setParameters`, `createOperator`,
`deleteOperator`, `connectNodes`) se verifican decodificando el código generado
(p.ej. el payload base64 `updates[]` de `setParameters`). Los GET están
inventariados (sin body no hay drift de shape) en
`get_endpoints_inventory`; los POST sin cliente TS/stdio hoy están listados en
`bridge_only_post_endpoints` — un POST nuevo en el bridge sin declarar **falla**
el inventario (y viceversa).

Mensajes de drift: nombran **qué campo divergió y en qué lado**, p.ej.
`CONTRACT DRIFT on /parameters/set: stdio client sends unknown field 'params'`,
o `missing required field 'updates'`, o `ROUTING SHADOW: route '/execute'
(checked first) is a prefix of contract endpoint '/execute_async'`.

## Qué NO cubre (limitaciones honestas)

- **No valida semántica de valores**: declara tipos de campo, no rangos ni
  significado (`value: "perlin"` sobre un par que espera número no se detecta).
- **El cliente TS live no ejecuta Python inline real**: el stub responde JSON
  exitoso canónico; los handlers no se ejecutan del lado Node (eso lo cubren
  los tests offline Python con fakes y las suites live existentes).
- **Response shapes solo behavioral donde hay fakes**: `/parameters/set`,
  `/exec`, `/execute_async` (501 offline), `/undo`, `/redo`, `/history`. El
  resto de respuestas son declaradas, no ejecutadas.
- **Los GETs no tienen contrato de query params** acá (solo inventario): su
  shape ya está auditado en `docs/API_CONTRACT_AUDIT.md` y las suites de
  paginación/cache.
- **No sustituye la verificación en vivo**: los dos clientes contra un bridge
  real de una build vieja pueden seguir divergiendo si el .toe no se actualiza
  — el gate nocturno de contrato (A1/A3) es quien protege esa capa.

## El drift real encontrado por la suite (2026-09-22)

Mientras se escribía, la suite detectó **un shadow de routing real** en el
dispatcher (`toe/src/TouchDesignerAPI.py::OnHTTPRequest`):

- `"/execute_async".startswith("/execute")` es `True`, y la ruta `/execute`
  se evaluaba **antes** que `/execute_async` → todo POST del cliente TS a
  `/execute_async` caía en `_handle_execute`, que trata el body como código
  Python crudo. El envelope JSON `{"code": ..., "fromOp": ...}` del cliente se
  "ejecutaba" como expresión (silencioso: no imprimía nada) y **el cliente
  nunca recibía `taskId`** — `executeAsync`/`waitForTask` quedaban inutilizables.
- Evidencia en vivo contra el TD corriendo (bridge viejo, TD 2025.32460):
  `POST /execute_async {"code": "print('hello')"} → 200 {success, stdout: '',
  stderr: '', from_op: '/'}` — el shape de `_handle_execute`, no el
  `{taskId, status}` de `_handle_execute_async`.
- **Fix**: reordenar `/execute_async` antes de `/execute` y aceptar el envelope
  JSON en `_handle_execute_async` (con fallback a código crudo para
  compatibilidad). Tests de regesión: `TestRoutingShadows` (ambos).

## Experimento de detección (prueba de que la suite sirve)

1. **Contract drift** (`/parameters/set`): se parchó el cliente stdio para que
   mandara el shape documentado-pero-viejo `{"path", "params": {...}}` sin
   `updates[]`. Resultado: `FAIL test_set_td_parameters_sends_updates_array —
   AssertionError: 'updates' not found in {'path': ..., 'params': ...} : client
   POST /parameters/set missing required field 'updates'`. Revertido.
   (Nota: el handler actual también acepta `params{}` como shorthand
   normalizado — el contrato fija el shape canónico `updates[]` para que la
   suite encienda si **cualquier** lado se mueve solo; además el test
   behavioral `test_parameters_set_updates_array_canonical` verifica que el
   shape canónico aplica de verdad contra el handler real con fakes.)
2. **Routing shadow** (`/execute` vs `/execute_async`): se reordenó el
   dispatcher al estado roto original. Resultado: **2 tests fallan** nombrando
   el patrón (`ROUTING SHADOW: '/execute_async' must be dispatched BEFORE
   '/execute' ... the client's {code, fromOp} JSON is never parsed`), y la
   prueba live de arriba mostró el fallo behavioral real contra TD. Revertido
   (fix restaurado, suite 17/17 OK).

Ambos experimentos están documentados acá y sus tests quedan como regresión
permanente.

## Contratos y quirks verificados EN VIVO (2026-09-23, TD 2025.31760, develop.3.toe)

Suite reproducible: `python scripts/live/contract_live_checks.py` → **18/18 PASS**
(sandbox `boxPOP → noisePOP → nullPOP`, autogestionado). Cobre: grafo real de
`/connections` (ítem 38), claves aditivas A1/A3/A4/A5, `/parameters/set`+`/undo`+`/redo`
completos, `/create`+`/undo` (delete)+`/redo` (recreate), expectativa de wiring.

Hallazgos que el agente/cliente debe conocer (ninguno rompe a los clientes actuales,
pero todos costaron tiempo de debugging):

1. **POST sin `Content-Length` cuelga el WebServer DAT** (capa de TD, ANTES del bridge
   Python). Medido con socket crudo: POST + `Content-Length: 0` → 404/200 en ~13 ms;
   el MISMO POST sin el header → timeout sin respuesta. No es específico de ningún
   endpoint (`/undo`, `/redo`, `/parameters/set` idénticos). Los clientes del repo no
   lo pisan: el TDClient TS ya manda `"{}"` por diseño (ver comentario en
   `api/src/index.ts`, `async undo`), y urllib/requests/fetch siempre setean
   Content-Length al enviar body. clients externos con curl `-X POST` pelado sí
   quedan colgados.
2. **`/exec` NO es undoable por diseño** (código arbitrario). Solo se registran en el
   historial: `/parameters/set`, `/create` (create_operator), `/delete`, `/connect`,
   `/disconnect` — el `hint` de `/undo` lo dice. Un test live que crea por `/exec` y
   espera que `/undo` borre el nodo falla con razón (`STILL_THERE`).
3. **Shapes reales medidos**: `GET /parameters` devuelve una **LISTA** de objetos
   (clave `value`, no `val`); el par Amplitude de noisePOP se llama `amp0` (`amp`
   resuelve igual). `POST /parameters/set` responde `updated` como lista de
   **objetos de parámetro completos** (con `value` aplicado), no nombres.
4. **`/create` envuelve el JSON interno en `{"output": "<json>"}`** y el codegen
   agregaba líneas `SyntaxWarning` que ensuciaban el output — **arreglado** en
   `toe/src/TouchDesignerAPI.py` (solo emite la línea de posición si hay posición);
   el TD corriendo sigue con el código viejo hasta recargar el .toe.
5. **TD en segundo plano throttlea**: el worker async es frame-driven, las tareas
   `/execute_async` pueden quedar en `Processing...` hasta que TD tenga un tick
   (medido: >60 s sin foco), y el bridge entero puede tardar ~60 s en responder
   tras un período sin requests (keep-alive del WebServer se pierde). Polling
   con tolerancia o TD en primer plano para pruebas async.
6. **Contadores del read cache se resetean en cada invalidación**
   (`readCache: {hits, misses, entries}` es por-generación, no acumulativo de la
   sesión): después de cualquier escritura, `hits:0`. El contrato semántico se
   verificó en vivo: `miss → hit (payload idéntico) → miss con no_cache=1 →
   miss tras escritura`.
7. **`/task_status` de tareas terminadas responde 404** (registro in-memory) —
   no confiar en poller de larga vida sin re-crear la tarea.
