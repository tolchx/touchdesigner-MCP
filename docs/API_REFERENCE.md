# TouchDesigner MCP — API Reference (bridge HTTP)

Fuente de verdad: `toe/src/TouchDesignerAPI.py` (corre dentro de TD en `http://127.0.0.1:44444`).
Copia espejo para el `.tox` standalone: `mcp/setup/toe_extension.py` (misma lógica, sin drift).
Tests offline del contrato: `tests/test_api_contract_offline.py` (67) y `tests/test_td_api_offline.py` (49).

Este documento detalla `GET /metrics` campo por campo y el historial de cambios
(`/undo`, `/redo`, `/history`). Los demás endpoints están documentados en
`docs/API_CONTRACT_AUDIT.md` (contrato HTTP: paginación, caché, semántica de
`/operators`, `/find`, `/connections`).

---

## GET /metrics

Métricas del proyecto TD + del propio bridge en **una sola respuesta**, en un solo
recorrido del árbol de operadores. **Nunca se cachea** (es dinámica por definición):
no incluye la clave `"cache"`, no entra al read-cache, y su llamada tampoco lo
invalida (solo las escrituras lo hacen).

### Contrato

- Clave fija (el set completo es estable; nuevas claves serán siempre aditivas):

```json
{
  "fps": 60.0,
  "td_build": "2025.31760",
  "total_ops": 33473,
  "ops_by_family": {"COMP": 6276, "TOP": 2009, "CHOP": 2890, "SOP": 49, "POP": 1050, "DAT": 21173, "MAT": 26},
  "other_ops": 0,
  "cooking_count": null,
  "error_count": 145,
  "warning_count": 44,
  "pop_stats": {
    "pop_total": 1050,
    "pop_errors": 122,
    "pop_slowest": {"path": "/project1/.../particle_mod_a", "cookTime_ms": 385.441}
  },
  "readCache": {"hits": 0, "misses": 0, "entries": 0},
  "endpoint_times": {"/info": {"n": 1, "median_ms": 0.098, "max_ms": 0.098}}
}
```

### Campos

| Campo | Tipo | Semántica |
|---|---|---|
| `fps` | float \| null | `project.cookRate` redondeado a 2 decimales. `null` si la señal no está disponible en esa build. |
| `td_build` | string \| null | Build de TD (misma normalización que `/info`). |
| `total_ops` | int | Total de operadores contados por un walk recursivo desde `/` (máx. profundidad 30). Incluye el root y todos los COMP intermedios. |
| `ops_by_family` | dict | Conteo por familia TD: `COMP, TOP, CHOP, SOP, POP, DAT, MAT` (las 7 siempre presentes, en 0 si no hay). |
| `other_ops` | int | Operadores fuera de esas 7 familias (en TD real suele ser 0; en el harness fake puede ser > 0). |
| `cooking_count` | int \| null | Best-effort: cantidad de ops cuyo atributo `cooking` es verdadero **solo si al menos una op expone ese atributo**. En TD 2025.31760 los POPs no lo exponen → `null` (nunca un número inventado). |
| `error_count` | int | Ops con errores, mismos criterios que `/verify`: `errors(recurse=False)` por op (string no vacío = 1; lista = cantidad de entradas no vacías). |
| `warning_count` | int | Ídem con `warnings(recurse=False)`. |
| `pop_stats.pop_total` | int | Cantidad de POPs encontrados en el walk. |
| `pop_stats.pop_errors` | int | POPs con errores. |
| `pop_stats.pop_slowest` | object \| null | El POP más lento visto: `{path, cookTime_ms}` (redondeado a 3 decimales); `null` si ningún POP reporta `cookTime`. |
| `readCache` | object | Contadores del read-cache del bridge: `{hits, misses, entries}` (mismo lazy-init que `/info`). |
| `endpoint_times` | dict | Latencias **server-side** por ruta (clave sin query string): `n` = muestras retenidas, `median_ms`, `max_ms` (mediana sobre el buffer, redondeo a 3 decimales). |

### `endpoint_times` — detalles que importan

- **Buffer por ruta**: `deque(maxlen=20)` — se retienen las últimas 20 latencias de cada ruta (memoria acotada).
- **Se auto-mide**: todo request ruteado por el dispatcher registra su latencia, incluido `/metrics` y las rutas de escritura.
- **Lag de un request (inherente)**: la latencia del request actual se registra en el `finally` del dispatcher, **después** de serializar su payload → la primera llamada a `/metrics` no puede incluirse a sí misma en `endpoint_times`; toda llamada posterior sí la ve. Los tests cubren este contrato.
- **No es tiempo de red**: mide el procesamiento dentro del bridge (routing + handler), no el round-trip del cliente.

### Método de medición del walk

Un único recorrido (`walk(op('/'))`) recolecta familias, errores, warnings,
`cooking` (best-effort) y `cookTime` de POPs — no hay tres recorridos. Cada
acceso a nodo está protegido individualmente: un operador que lanza al preguntar
`errors()` no aborta la métrica (cuenta lo que pueda y sigue). Profundidad
máxima 30.

### Notas del harness offline

En `tests/test_api_contract_offline.py` el fake tree cablea `/` → `/project1`
(exacto como TD real), por eso los conteos incluyen root + project1. Los fakes
no exponen `cooking` → `cooking_count` es `null` (el test lo fija como contrato).

---

## Historial de cambios: POST /undo · POST /redo · GET /history

Registro de escrituras del **propio bridge** con capacidad de revertirlas
(backlog ítem 09). Alcance y límites, en una línea cada uno:

- **Se registran**: `POST /parameters/set`, `POST /create` (`/create_operator`),
  `POST /delete_operator`, `POST /connect_nodes` (`/connect`) y
  `POST /disconnect` — una entrada por request, revertible como UNA operación.
- **NO se registran**: `POST /exec` (código arbitrario: no se puede capturar
  estado previo de forma fiable), `/write_dat`, `/glsl_*`, `/batch`, etc. Para
  revertir trabajo hecho vía `/exec` usá `POST /project_lifecycle` con
  `action=undo` (el undo nativo de TD) o guardá el `.toe` antes.
- **Profundidad**: 50 entradas (`maxDepth`), descarte FIFO de la MÁS VIEJA.
  Nunca crece sin límite.
- **Redo estándar**: una escritura nueva descarta la rama de redo completa.
- **Caché**: toda escritura ya invalida el read-cache (regla 15 de AGENTS.md);
  `/undo` y `/redo` son POST, así que también lo invalidan.
- **Quirk medido en vivo (TD 2025.32460)**: un POST **sin body** (curl sin `-d`)
  a `/undo` o `/redo` aplica el cambio pero la respuesta HTTP nunca llega (el
  webserverDAT cuelga la entrega del response). Enviá siempre un body JSON,
  aunque sea `{}`.

### POST /undo

Revierte la operación registrada más reciente.

Respuesta 200:

```json
{
  "success": true,
  "undone": "parameters.set on /project1/noise1 (amp)",
  "kind": "parameters",
  "applied": 1,
  "errors": [],
  "depth": 0,
  "canUndo": false,
  "canRedo": true
}
```

| Campo | Tipo | Semántica |
|---|---|---|
| `success` | bool | Siempre presente; `true` solo si la reversión se aplicó. |
| `undone` | string | Descripción de UNA línea de la operación revertida (misma que `GET /history`). |
| `kind` | string | `"parameters"` \| `"ops"` \| `"wiring"` — tipo de operación revertida. |
| `applied` | int | Cantidad de ítems restaurados (parámetros, ops recreadas/destruidas, o conexiones rehechas). |
| `errors` | array | Errores por ítem durante la reversión (p. ej. operador ya borrado a mano). Vacío = reversión limpia. |
| `depth` | int | Entradas undoables restantes tras este undo. |
| `canUndo` | bool | `depth > 0`. |
| `canRedo` | bool | Siempre `true` tras un undo exitoso. |

Respuesta 400 (historial vacío — nunca silencio):

```json
{
  "success": false,
  "error": "Nothing to undo: the history is empty",
  "hint": "Only bridge write requests (/parameters/set, /create, /delete, /connect, /disconnect) are recorded; run one first or check GET /history"
}
```

### POST /redo

Re-aplica la última operación deshecha. Misma forma de respuesta que `/undo`
(con `redone` en lugar de `undone`). Una escritura nueva la invalida:

```json
{
  "success": false,
  "error": "Nothing to redo: no undone operation pending",
  "hint": "Redo is only available right after an /undo; a new write clears it. See GET /history"
}
```

### GET /history

Lista las entradas disponibles, una línea cada una:

```json
{
  "maxDepth": 50,
  "canUndo": true,
  "canRedo": false,
  "undo": [{"id": "0baa170c", "description": "create /project1/newop", "kind": "ops"}],
  "redo": []
}
```

| Campo | Tipo | Semántica |
|---|---|---|
| `maxDepth` | int | Cap de profundidad (50). |
| `canUndo` / `canRedo` | bool | Atajos para UI. |
| `undo[]` | array | Entradas undoables, de la más reciente a la más vieja. |
| `redo[]` | array | Entradas redoables (deshacen deshaceres), de la más reciente a la más vieja. |
| `undo[]/id` | string | Identificador corto estable de la entrada. |
| `undo[]/description` | string | Una línea, apta para humans: `"parameters.set on <path> (<pars>)"`, `"create <path>"`, `"delete <path>"`, `"connect <src> -> <dst>[<i>]"`, `"disconnect <dst>[<i>]"`. |
| `undo[]/kind` | string | `"parameters"` \| `"ops"` \| `"wiring"`. |

### Qué guarda cada tipo de entrada (contrato interno)

- `parameters`: el estado previo de cada parámetro tocado (valor, expresión y
  modo) + el estado post-cambio capturado al momento del undo para el redo.
- `ops`: snapshot mínimo por operador (`path`, `opType`, `name`, `nodeX/Y`,
  `exists`). Undo de una creación destruye; undo de un borrado recrea por tipo.
- `wiring`: el input afectado (`path`, `index`) y las rutas fuente conectadas
  ANTES del cambio; undo reconecta exactamente eso.

Nota: la recreación de operadores restaura tipo/posición, NO todo el estado de
parámetros del nodo borrado. Es una reversión estructural, no un snapshot binario.

---

## Historial

- **2026-09-21** — `/undo`, `/redo`, `/history` agregados (backlog ítem 09):
  implementación en `toe/src/TouchDesignerAPI.py` + espejo en
  `mcp/setup/toe_extension.py`, captura previa en los 5 handlers de escritura
  con drop si la ejecución falla, tests offline en la suite de contrato.
- **2026-09-17** — `/metrics` agregado (backlog ítem 06): implementación en
  `toe/src/TouchDesignerAPI.py` + espejo en `mcp/setup/toe_extension.py`, tests
  offline en ambas suites, verificación en vivo contra TD 2025.31760.
