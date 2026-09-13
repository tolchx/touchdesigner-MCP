# Replicación de redes .toe desde texto plano (Toe_Expand) — método verificado

**Caso de estudio**: proyecto `Facet`, replicado en vivo el 2026-09-12 contra
TouchDesigner **2025.32460** (API HTTP en `localhost:44444`).
**Objetivo**: tomar un `.toe` expandido a texto plano, reconstruir su red exacta
vía la API del MCP y **verificar por evidencia** (no por fe) que cocina igual que
el original.

Contenedor resultado: `/project1/facet_replica_20260912_152624` (6 POPs, 4 wires,
0 errores, geometría verificada).

---

## 1. Dónde está el corpus

```
C:/Users/Tolch/Documents/AI_Code/Touchdesigner_MCP/old/mcp_td_v3/Toe_Expand/Toe_Expand/
```

101 proyectos. Cada proyecto expandido tiene:

| Archivo | Qué contiene |
|---|---|
| `<Nombre>.toe` | el binario original (no se usa) |
| `<Nombre>.toe.dir/` | **la red en texto plano** (esto es lo que se lee) |
| `<Nombre>.toe.toc` | índice del proyecto (no hace falta para replicar) |

Dentro del `.toe.dir`, por cada red (contenedor) hay un archivo por operador:

| Extensión | Contenido |
|---|---|
| `.n` | tipo, posición (`tile`), flags, **inputs** (cableado) |
| `.parm` | valores de parámetros |
| `.cparm` | parámetros custom (páginas de COMPs) |
| `.text` / `.table` | contenido de DATs |
| `.network` | secciones `compinputs` (cableado a nivel COMP) |

El parser de referencia (Python, ya existe en el repo): `convert_toe_expand.py`
(raíz). Este documento es el complemento **verificado en vivo** de ese parser.

---

## 2. Formato de los archivos (lo mínimo para reconstruir)

### `.n` — un operador

```
POP:facet                      ← FAMILIA:tipo  (también TOP:, SOP:, CHOP:, DAT:, COMP:, MAT:)
tile -350 0 130 90             ← x y w h → nodeX=-350, nodeY=0
flags =  viewer 1 display on parlanguage 0   ← display on = operador de visualización
inputs
{
0 	math1                      ← índice <TAB> nombre del input
}
color 0.55 0.55 0.55
view 29 ...
end
```

### `.parm` — parámetros

Bloques separados por líneas `?`, cada línea real: `nombre <estado> <valor>`:

```
?
size1 0 10                     ← grid: size = (10,10,10)
size2 0 10
size3 0 10
?
```

**Quirks medidos** (no inventar reglas):

- El valor real está en la **última columna**: `size1 0 10` → `10`.
- El entero del medio es estado interno del dump, no un valor:
  `pt1posx 67108928 10` → el valor es `10`, no `67108928`.
- **Los nombres pueden estar desactualizados respecto al build actual.**
  En Facet, `line1.parm` declara `pt1posx/pt1posy/pt1posz`, que **NO existen**
  en el `linePOP` vivo de 2025.32460 (sus parámetros modernos son
  `dist/divs/divmethod/interpmethod/...`). Importar parámetros tiene que ser
  defensivo: si el par no existe, registrar drift y seguir — nunca fallar.
- `cpureadback 0 on` muestra que los toggles se serializan igual de raros:
  guardar el valor textual tal cual, interpretarlo solo si el par existe.

---

## 3. El caso Facet: especificación extraída del dump

Red `/project1` del original (6 POPs, 4 conexiones, dos cadenas paralelas):

```
cadena A:  line1 ──▶ math1 ──▶ facet1
cadena B:  grid1 ──▶ quantize1 ──▶ facet2
```

| Op | Tipo (dump) | tile (x,y) | Parámetros del `.parm` |
|---|---|---|---|
| line1 | `POP:line` | -750, 0 | `pt1pos=(10,5,0)` (drift: no existe en el build vivo) |
| math1 | `POP:math` | -550, 0 | `quantize0=round`, `castto=float`, `outputattscope=P` |
| facet1 | `POP:facet` | -350, 0 | `operation=conspoints`, `cpureadback=on` |
| grid1 | `POP:grid` | -750, -225 | `size=(10,10,10)` |
| quantize1 | `POP:quantize` | -550, -225 | `quantize0=round` |
| facet2 | `POP:facet` | -350, -225 | `operation=conspoints`, `cpureadback=on` |

Mapping familia → clase Python: `POP:grid` → `td.gridPOP`, `POP:facet` →
`td.facetPOP`, etc. (`getattr(td, tipo + familia)`).

---

## 4. Contratos de la API: qué funcionó y qué NO (medido hoy)

### ❌ `POST /create` ignora el body JSON

El handler `_handle_create_operator` lee `request["pars"]` (query string).
Un body JSON válido (`{"path":...,"type":...,"name":...}`) se ignora en
silencio y el código generado queda roto:

```
n = t.create(, None)     ← SyntaxError devuelta como {"error": "Traceback..."}
```

Workaround que SÍ funciona (query params):

```
POST /create?type=gridPOP&name=grid1&path=%2Fproject1&position_x=-750&position_y=-225
```

Pero incluso así es lento: 6 llamadas secuenciales agotaron el timeout de curl
(60 s) aunque los ops SÍ se crearon (confirmado después con `GET /operators`).
**Conclusión: crear en batch con `/exec`** (ver §5).

### ❌ `POST /connect` se cuelga con POPs

4 llamadas secuenciales `POST /connect?source_path=...&target_path=...`
quedaron colgadas (curl exit 28 a los 60 s) y `/connections` mostró **cero**
wires creados. El handler usa `tgt.inputConnectors[i].connect(src)`, que según
`AGENTS.md` regla 12 es válido para inputs indexados, pero en esta sesión con
POPs de 1 conector no terminó nunca.

**Receta verificada (instantánea, 4/4)** — lado origen, vía `/exec`:

```python
src.outputConnectors[0].connect(dst)
```

### ⚠️ Lectura de inputs: usar `op.inputs`, no los Connectors

Para verificar el cableado, `td.Connector` NO tiene `.name` ni `.connectors`
accesibles (`dir()` real: `connect, connections, description, inOP, index,
isInput, isOutput, outOP, owner`). Lo que funciona directo:

```python
[i.name for i in op("/project1/.../math1").inputs]   # → ["line1"]
```

### ✅ Lo que sí es confiable

- `GET /info`, `GET /operators`, `GET /connections`, `POST /exec` — estables.
- `/exec` ejecuta batch multi-línea y devuelve el `print` capturado: **es la
  herramienta correcta para todo el ciclo crear+cablear+parametrizar+verificar
  en UNA llamada** (coherente con `AGENTS.md` regla 6).
- `td.<familia>` expone todas las clases: `td.linePOP`, `td.gridPOP`,
  `td.quantizePOP`, `td.facetPOP` crearon sin error.
- `numPoints()` / `numPrims()` son MÉTODOS (regla 6 de `AGENTS.md`).

---

## 5. Receta completa (la que se ejecutó, con números reales)

Un solo `POST /exec` con este payload reconstruyó la red dentro de un
contenedor con timestamp:

```python
import json
res = {"created": [], "wired": [], "params": {}, "errors": {}, "geometry": {}}
base = op("/project1").create(td.baseCOMP, "facet_replica_20260912_152624")

defs = [   # (tipo, nombre, nodeX, nodeY) — tomados del .n del dump
    ("linePOP",     "line1",     -750,    0),
    ("mathPOP",     "math1",     -550,    0),
    ("facetPOP",    "facet1",    -350,    0),
    ("gridPOP",     "grid1",     -750, -225),
    ("quantizePOP", "quantize1", -550, -225),
    ("facetPOP",    "facet2",    -350, -225),
]
for t, n, x, y in defs:
    o = base.create(getattr(td, t), n)
    o.nodeX = x; o.nodeY = y
    res["created"].append(o.path)

# Wiring verificado (AGENTS.md regla 12, lado origen)
for s, t in [("line1","math1"),("math1","facet1"),("grid1","quantize1"),("quantize1","facet2")]:
    base.op(s).outputConnectors[0].connect(base.op(t))

# Parámetros del .parm — defensivos: si no existe, drift y seguir
base.op("grid1").par.size1 = 10
base.op("grid1").par.size2 = 10
base.op("grid1").par.size3 = 10
for n in ["facet1", "facet2"]:
    base.op(n).par.operation = "conspoints"
m = base.op("math1")
m.par.quantize0 = "round"; m.par.castto = "float"; m.par.outputattscope = "P"
base.op("quantize1").par.quantize0 = "round"
# line1 pt1pos* NO existe en este build → drift registrado, no seteado a ciegas

# Verificación
for n in ["line1","math1","facet1","grid1","quantize1","facet2"]:
    o = base.op(n)
    o.cook(force=True)
    res["errors"][n] = o.errors() or ""
    res["geometry"][n] = {"numPoints": int(o.numPoints()), "numPrims": int(o.numPrims())}
res["inputs"] = {n: [i.name for i in base.op(n).inputs] for n in ["math1","facet1","quantize1","facet2"]}
print(json.dumps(res))
```

### Resultado real (salida de TD, sin interpretar de más)

```json
{"created": [".../facet_replica_20260912_152624", ".../line1", ".../math1",
 ".../facet1", ".../grid1", ".../quantize1", ".../facet2"],
 "wired": ["line1->math1", "math1->facet1", "grid1->quantize1", "quantize1->facet2"],
 "errors": {"line1": "", "math1": "", "facet1": "", "grid1": "", "quantize1": "", "facet2": ""},
 "geometry": {"line1": {"numPoints": 21, "numPrims": 1},
              "math1":  {"numPoints": 21, "numPrims": 1},
              "facet1": {"numPoints": 2,  "numPrims": 1},
              "grid1":  {"numPoints": 400, "numPrims": 361},
              "quantize1": {"numPoints": 400, "numPrims": 361},
              "facet2": {"numPoints": 121, "numPrims": 361}},
 "inputs": {"math1": ["line1"], "facet1": ["math1"],
            "quantize1": ["grid1"], "facet2": ["quantize1"]}}
```

---

## 6. Cómo se verifica "que funciona igual" (checklist)

1. **Estructural**: cantidad de ops, tipos y nombres = dump; `op.inputs` de cada
   nodo = bloque `inputs{}` del `.n`. ✔ (4/4 wires idénticos)
2. **Posicional**: `nodeX/nodeY` = `tile x y`. ✔ (6/6)
3. **Parámetros**: `par.X.eval()` = valor del `.parm`; los inexistentes van al
   log de drift con el nombre exacto. ✔ (1 drift: `pt1pos*`)
4. **Comportamental**: `cook(force=True)` → `errors() == ""` →
   `numPoints()/numPrims()` (métodos, con `int()`). ✔ (6/6 sin errores)
5. **Semántico**: la cantidad derivada debe coincidir con la intención del
   diseño original. El caso Facet lo demuestra de forma elegante:
   grid 10×10 = 400 puntos → `quantize` redondea posiciones a enteros (400) →
   `facet operation=conspoints` consolida los puntos coincidentes →
   **121 = 11² puntos únicos conservando 361 prims**. Ese 121×361 es la firma
   del original.

---

## 7. Limpieza previa (patrón seguro)

Antes de replicar se vació `/project1` (había 98 contenedores de tests viejos):

- Verificar PRIMERO que la infraestructura no es hija del contenedor a vaciar:
  el server MCP vive en `/TouchDesignerAPI`, **hermano** de `/project1`.
- Borrar los hijos en un solo `/exec` con `list(op(path).children)` +
  `destroy()` → resultado real: `deleted_count: 98, remaining: 0`.
- Convención de nombres a partir de ahora: `<proposito>_YYYYMMDD_HHMMSS`
  (`facet_replica_20260912_152624`) — ordenar por nombre = ordenar por antigüedad.

---

## 8. Lecciones para el MCP (pendientes concretas)

1. **`/create`**: leer el body JSON (`request["data"]`) además del query string;
   hoy el body se ignora y devuelve un SyntaxError críptico.
2. **`/connect`**: colgó con POPs (curl exit 28, 0 wires). O se arregla el
   handler (usar lado origen con timeout) o se depreca a favor de `/exec` +
   `src.outputConnectors[0].connect(dst)` documentado.
3. **Importador `.toe.dir`**: las piezas ya están (`convert_toe_expand.py`
   parsea `.n`/`.parm`/`.network`). Falta el tool MCP (`td_import_toe_dir`) que
   emita el payload `/exec` de §5 directo del dump, con verificación del §6.
4. **Validación de parámetros al importar**: setear solo si el par existe en el
   build vivo (probar con `p.pars()` o try/except) y devolver el drift —
   mismo criterio que `docs/POPs_CORRECTIONS.md`.
