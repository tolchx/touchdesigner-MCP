# BACKLOG — TD-MCP (espejo versionado)

> **Fuente de verdad del estado**: `.freebuff_tasks/BACKLOG.md` (directorio de trabajo de
> Freebuff, deliberadamente **fuera de git** vía `.gitignore`). Este documento es un
> **espejo trackeado** para que el historial del repo preserve qué se completó, cómo y
> con qué evidencia, y para que los scopes cerrados de tareas encoladas sean citables.
>
> Última sincronización: **2026-09-22** (HEAD `e9649b7`; **09 cerrado** en el ciclo diario — `/undo`, `/redo` y `/history` en el bridge y su espejo, con tools MCP `td_undo`/`td_redo`/`td_history`; **pendiente la verificación en vivo** porque TD estaba caído esa corrida). Abiertos 33–40: triaje de `polygonizePOP`, `errors()` que devuelve `str` y no `tuple`, gate del baseline ciego a regresiones por tipo, test acoplado al working tree, evidencia GLSL que se ensucia por el timestamp del sandbox, **`GET /connections` que devuelve operadores en vez de cableado**, el censo de 207 nodos de la matriz POP y el mock desactualizado de `set_td_parameters`).
> Al cerrar cada ítem en el ciclo diario, actualizar acá la casilla correspondiente.

## Mejoras de API / bridge

- [x] 01. `/info` completo — `release` y `projectPath` ya devuelven valores reales (`app.release`→`app.releaseType`→`app.build`, `project.filePath`→`project.folder`+`project.name`), con degradación a `null` si el build no expone el atributo. Verificado en vivo el 12/09/26 (`/info` → `release: "2025.32460"`, `projectPath: ".../TouchDesignerAPI.1.toe"`) + test offline del shape (`toe/src/TouchDesignerAPI.py`, `tests/test_td_api_offline.py`)
- [x] 02. `/screenshot` robusto — el `path`/`op` del body se respeta (captura exacta), errores explícitos con `hint` para operador inexistente / no-TOP / sin TOP, y `maxSize` degrada a la captura sin redimensionar en vez de fallar. Verificado en vivo el 12/09/26 (`/project1/probe_top/a` → `success:true`; COMP → `Not a TOP`; ruta falsa → `Operator not found`) + tests offline
- [x] 03. Validación de parámetros también en el bridge Python — `_handle_parameters_set` lee `target.pars()` y devuelve `invalid[{name, reason, suggestions, note}]` con sugerencias por similitud; `transactional:true` aborta con 400 + rollback y `transactional:false` aplica lo válido (`applied_with_missing_param[]`). Verificado en vivo el 12/09/26 + tests offline
- [x] 04. Paginación en `/operators`, `/find` y `/connections` — `?limit=N&offset=N` con default seguro (`limit=500`, techo `5000`); la respuesta conserva sus claves y suma `total`/`returned`/`limit`/`offset`/`truncated`; `limit`/`offset` no numéricos o negativos → `400` + `hint`; `offset` > total → lista vacía + `total` real. Misma lógica en el `.tox` standalone (`mcp/setup/toe_extension.py`) y documentada en `docs/API_CONTRACT_AUDIT.md`. Suites del 14/09/26: Node **1208/0**, contrato bridge **39 OK**, bridge **34 OK**, GLSL **19 OK**, gate POP **14 OK**. Commits `376a02d` + `84906be` + `2f2cfbc`. Pendiente: verificación en vivo contra TD (bridge no disponible en esta corrida)
- [x] 05. Caché con invalidación en `/operators` y `/verify` — medir con la red real de 1222 ops y documentar antes/después en `docs/PERFORMANCE.md`
- [x] 06. `/metrics` — métricas en JSON: fps (`project.cookRate`), conteo total y por familia, errores/warnings con los criterios de `/verify`, `pop_stats` (POP más lento), `readCache` y latencias server-side por ruta (`endpoint_times`, buffer 20). Un solo walk, nunca cacheado, `null` explícito si la señal no existe. Implementado en `toe/src/TouchDesignerAPI.py` + espejo en `mcp/setup/toe_extension.py`; verificado en vivo (TD 2025.31760, 33473 ops). Contrato campo por campo en `docs/API_REFERENCE.md`. Suites 17/09/26: Node **1208/0**, contrato **56 OK**, bridge **49 OK**, GLSL **19 OK**, gate **19 OK**. Commits `4bdcff1` + `b70c6c8` + `8e5bc55`.
- [ ] 07. `/diff` — comparar dos estados de red (o la red actual contra un `.toe` de referencia) y devolver diferencias legibles — **scope cerrado, ver [Cola](#cola-de-ejecución-queue)**
- [ ] 08. Modo dry-run — flag `?dry_run=1` en los POST de escritura que devuelve qué haría sin aplicarlo
- [x] 31. GLSL TOP tooling — analizador TOP (`analyzeGlslTopShader`/`preValidateTopShader` en `glslValidate.ts`) + 7 recipes BoS en `glslTopRecipes.ts` + **tools MCP `td_glsl_top_analyze` y `td_glsl_top_recipe`** (`glslTopApply.ts`, registradas en `server.ts`). Hallazgos en vivo: const0 NO bindea scripteado (→ familia vec0), auto-recreación v1.1 en el builder. Evidencia: aceptación de las 5 recipes estáticas vía tool con píxeles (círculo 1.0/0.0), `scripts/live/uniform_cross.py`, Node **1235/0**. Commits 17/09/26.
- [x] 32. Currículo GLSL (BoS + td-edu) — `scripts/ingest_glsl_curriculum.py` (determinista con `--check`) extrae los 7 shaders de `glslTopRecipes.ts` a `glsl_files/recipe_t*.glsl` (fuente única, sin duplicar código) y genera `mcp/data/glsl_curriculum.json` (15 entradas TOP/POP con `fuente_citada` obligatoria: capítulos BoS citados, lecciones td-edu, corpus local 14/14). Tool MCP **`td_glsl_curriculum`** (list/get/path) offline en `glslCurriculum.ts`. Tests **13 nuevos** (anti-plagio, shaders pasan el analizador real, tool), Node **1248/0**. Vivo: shader del currículo compilado en TD con píxeles verificados (círculo centro 1.0/corner 0.0/anillo 23px). Commits 17/09/26.
- [x] 09. Undo/redo en el bridge — `POST /undo`, `POST /redo` y `GET /history` en `toe/src/TouchDesignerAPI.py` (+443) y su espejo `mcp/setup/toe_extension.py` (+378): historial acotado a 50 entradas con descarte FIFO, respuesta explícita `success:false` + `hint` cuando no hay nada que deshacer/rehacer, y un undo revierte UNA operación completa del request. Tools MCP `td_undo`/`td_redo`/`td_history` (`mcp/src/tools/bridgeHistory.ts`, registradas en `server.ts` y re-exportadas por `api/src/index.ts`). Contrato campo por campo en `docs/API_REFERENCE.md`. Verificado en el ciclo diario del 22/09/26: `npm run build` limpio, Node **1255/0**, Python offline 68 + 49 + 19 OK, gate del baseline OK, sin tests borrados ni `.skip`/`.only`/timeouts inflados y sin archivos fuera del alcance del brief. Pendiente: verificación en vivo con el bridge TD (TD caído; script listo en `scripts/live/td_tools_undo_live.py`). Commits `bfe0bbf`…`e9649b7`

## Tests y calidad

- [ ] 10. Tests POP en vivo al orquestador — integrar `test_pop_matrix.py` y `test_pop_networks.py` a `toe/src/test_orchestrator_massive.py` con documentación de contenedores
- [ ] 11. Tests de contrato bridge Python ↔ cliente TS — suite que detecte drift entre lo que envía el cliente y lo que espera el handler (evita otro caso como `/parameters/set`)
- [ ] 12. Coverage con umbral mínimo — reportar cobertura y fallar por debajo del umbral en `npm run ci`
- [ ] 13. Tests de red POP de punta a punta — build → set params validados → verify sin errores, para al menos 10 tipos POP distintos
- [ ] 14. Healthcheck accionable — `/healthcheck` con severidad por issue y sugerencia de fix por cada tipo de error

## Conocimiento y documentación

- [ ] 15. `docs/POP_OPERATORS_REFERENCE.md` — referencia navegable por operador POP generada desde `mcp/data/pops/knowledge/pop_operators.json` (con marca de drift)
- [ ] 16. `docs/POP_NETWORK_PATTERNS.md` — patrones y cadenas POP más frecuentes del corpus, con diagramas de texto y nota de empírico
- [x] 17. `docs/PERFORMANCE.md` — tiempos medidos de los endpoints en la red grande (1222 ops / 410 conexiones)
- [ ] 18. `docs/TROUBLESHOOTING.md` — los errores clásicos ya vistos (payload de `/parameters/set`, cableado multi-input, inputs dinámicos de `mergePOP`/`compositeTOP`, POPs ausentes en el build) con síntoma → causa → fix
- [ ] 19. Re-indexado automático del knowledge brain — comando que re-ingesta la base POP al FTS5 y verifica con una búsqueda (`mcp/data/knowledge_brain.db`)
- [ ] 20. Endpoint `/help` ampliado — servir también los docs markdown del repo por HTTP para consultarlos desde el MCP
- [ ] 21. README: sección de arquitectura actualizada — diagrama de flujo cliente → MCP → bridge → TD con los endpoints nuevos
- [ ] 22. Tutorial/ejemplo: armar una red POP completa desde lenguaje natural — usar la base validada como caso de uso documentado

## Mantenimiento

- [ ] 23. Verificar drift de la wiki — re-correr `toe/src/verify_pop_knowledge.py --refresh-wiki` y reportar si los 296 params de drift cambiaron
- [ ] 24. Actualizar el conteo de tests en README/AGENTS.md automáticamente tras cada ciclo (script `npm run docs:sync`)

## Fiabilidad verificada (tareas ad-hoc, no numeradas en el backlog original)

- [x] 25. `/verify` recursivo — antes devolvía `healthy:true` en redes con POPs rotos porque no bajaba a los hijos del COMP. Ahora recursa por defecto, atribuye errores/warnings por operador y agrega `pop_stats`; `?recurse=false` mantiene el modo legacy. Verificado en vivo el 11/09/26 + 5 tests offline (`toe/src/TouchDesignerAPI.py`, `tests/test_api_contract_offline.py`, `AGENTS.md`, `API_REFERENCE.md`)
- [x] 26. Matriz POP con validación estricta — `toe/src/test_pop_matrix.py` ya no cuenta "creado sin excepción" como OK: fuerza `cook(force=True)`, lee `errors()`/`warnings()` post-cook y cuenta geometría real con `numPoints()`/`numPrims()` (métodos, no propiedades). Resultado real: 16/101 con geometría, ~55 fixables con input, ~13 no aplicables. Documentado en `docs/POPs_VALIDATION.md` + `docs/pop_matrix.json` regenerado
- [x] 27. Matriz POP con fuente por input — `toe/src/test_pop_matrix.py` ahora alimenta cada tipo POP con `boxPOP` (2×2×2) en todos sus input connectors y clasifica en 4 categorías excluyentes con cook forzado + `errors()` + `numPoints()`/`numPrims()`. Resultado real 12/09/26: 101 tipos, 100 creados, **80 ok_con_input**, 8 error_con_input, 12 sin geometría, 1 no creable. Publicado en `docs/POPs_VALIDATION.md` + `docs/pop_matrix.json`
- [x] 28. Replicación de redes `.toe` reales — tool `td_import_toe_dir` (parser + codegen `/exec` + verificación por nodo) sobre el corpus Toe_Expand; evidencia por proyecto en `docs/toe_replication_evidence.json` + `docs/toe_evidence_log.txt` y método/limitaciones en `docs/TOE_REPLICATION.md`
- [x] 29. Checker GLSL POP como red de seguridad del MCP — `td_glsl_analyze` (estático, sin TD) y `td_glsl_apply` (pre-valida, crea atributos, `outputaccess='readwrite'` automático y devuelve el log del infoDAT si falla) en `mcp/src/tools/glslValidate.ts` + `glslApply.ts`, con routing de templates/recetas (`glslRouting.test.js`) y regla 10g en `AGENTS.md`
- [x] 30. Gating por evidencia de la matriz POP en el MCP + gate nocturno del baseline — `pop_operators.json` lleva `validation_category`/`recommended_for_networks` por tipo (80 `ok_con_input` / 101, derivado de `docs/pop_matrix.json`); `popKnowledge.ts` expone `listOkPopTypes`/`isRecommendedForNetworks`/`networkRecommendationWarning`, el planner penaliza y `inferOpTopology` advierte sobre los 21 tipos no-ok salvo pedido explícito; `scripts/check_pop_matrix_baseline.py` + `.github/workflows/td-nightly.yml` fallan CI si la evidencia regresa (14 tests offline del checker). Verificado 13/09/26: `npm run build` limpio, **1208 tests Node 0 fallos**, 22+23+19+14 Python verdes, 6 commits pusheados (49f7055…2369f13). Pendiente: re-corrida v6 de la matriz en vivo (bridge TD caído, `TD_UNREACHABLE`)

- [ ] 33. Triaje de la regresión de `polygonizePOP` en TD 2025.32460 — la matriz lo daba `ok_con_input` en 2025.31760 y `error_con_input` en 2025.32460. Corrida real del 21/09/26 (matriz v7, 2025.32460): `polygonizePOP` tiene 1 input connector **más un param `top` (style TOP)**, y el harness lo alimentó con un `noiseTOP` 2D por ese param → `Error: Only 3D TOPs are supported, use Trace POP for 2D TOPs.` (`numPoints=0`), con el cableado POP a `inputConnectors[0]` fallando (`wire_exception: Invalid number or type of arguments`; solo 2 de 101 tipos lo tienen). Su par `tracePOP` (nuevo en este build) devuelve el mensaje simétrico: `Input POP needs to have 2 dimensions, use Polygonize POP for POPs with 3 dimensions.` → la pareja trace↔polygonize convierte 3D↔2D y la categoría actual es probablemente un artefacto de la fuente que elige el harness, no necesariamente una regresión del build. Verificar con un TOP realmente 3D antes de adoptar el baseline de 91/101. Evidencia local (fuera de git): `.freebuff_tasks/evidence/pop_matrix_2025.32460_regression.json`, `pop_matrix_diff_2026-09-21.txt`, `polygonizePOP_2026-09-21.txt`
- [ ] 34. `errors()`/`warnings()` devuelven `str`, no `tuple`, en TD 2025.32460 — `for e in op.errors()` itera caracteres y `len(op.errors())` cuenta letras, así que el conteo de errores sale basura en cuanto hay un error. Normalizar los consumidores en `mcp/src/` y `toe/src/`/`mcp/setup/` (aceptar str o secuencia), avisar en `AGENTS.md` regla 5 y agregar test offline del normalizador
- [ ] 35. El gate del baseline no detecta regresiones **por tipo** cuando el conteo agregado sube — `scripts/check_pop_matrix_baseline.py` solo falla si `ok_con_input` baja, si un tipo antes ok deja de crear o si un tipo desaparece. El 21/09/26 `polygonizePOP` regresó y el gate igual imprimió **PASS (91 vs 89)** porque el build nuevo sumó 3 tipos ok (`alembicoutPOP`, `textPOP`, `triangulatePOP`). Fix: comparar los conjuntos por tipo y fallar/avisar aunque el total suba, con test offline de fixture (1 tipo regresa + 2 nuevos)
- [ ] 36. `mcp/test/popRecommendation.test.js` acopla la KB al `docs/pop_matrix.json` del **working tree** — con la evidencia nueva sin commitear (a propósito, ítem 33) la suite quedó en **1248 tests / 1 fail** (`category ok_con_input: KB vs matrix mismatch — 89 !== 91`) sin que hubiera código roto; con el archivo revertido a HEAD volvió a **1248/0**. Fix posible: leer el baseline desde git (`git show HEAD:docs/pop_matrix.json`) o desde un fixture versionado
- [ ] 37. La evidencia GLSL versionada se ensucia en CADA corrida en vivo por el timestamp del sandbox — `toe/src/test_glsl_pops.py` escribe `docs/glsl_pops_reference.json` con `suite_root` y `timestamp` de un sandbox timestamped (`/project1/glsl_ref_<YYYYMMDD_HHMMSS>`) y ese path queda embebido en cada check. Verificado el 21/09/26 y **reconfirmado el 22/09/26**: normalizando esas dos cosas el archivo es byte-idéntico al de HEAD, o sea que el único cambio real es el reloj — pero deja el árbol sucio en cada ciclo (el 22/09 el diff era solo `timestamp` + `suite_root` + los paths dentro de `detail`). Contraste: la matriz POP usa un nombre ESTABLE (`pop_matrix_live5`). Fix: escribir la evidencia a `.freebuff_tasks/evidence/`, o normalizar el path del sandbox a un placeholder estable, o usar un nombre de sandbox estable
- [ ] 38. **BLOCKER — `GET /connections` NO devuelve el cableado: devuelve la lista de operadores.** `toe/src/TouchDesignerAPI.py::_handle_connections` (~3929) es un copy-paste de `_handle_operators`: itera descendientes, los serializa como operadores y devuelve `{"operators": page}` con `total` = cuenta de operadores; nunca lee un connector aunque su docstring diga "connection graph". Verificado en vivo el 21/09/26 con `boxPOP→noisePOP→nullPOP`: `total: 4` y ninguna clave `connections` (el cableado real se lee por `/exec`). **HTTP 200 con un número plausible y falso**: en `/project1/pop_matrix_live5` contestó `total: 208` cuando hay 90 aristas, dato que `/verify` (`total_connections: 90`) y `POST /document` sí dan bien. Alcance: el tool `td_connections` (`mcp/src/tools/inspection.ts:117`) le miente al agente, el espejo `mcp/setup/toe_extension.py:743` tiene el mismo bug, lo consume `api/src/index.ts:798` y los tests que lo cubren solo testean paginación (falso verde). Fix: extraer a helper la construcción de aristas de `_handle_document` (~3039-3064), arreglar bridge + espejo y hacer que `total` signifique aristas
- [ ] 39. El sandbox de la matriz POP no es una red: es un censo de 207 nodos — medido el 21/09/26 en `/project1/pop_matrix_live5`: 207 hijos (POP 195, DAT 11, CHOP 1), roles `source: 89 · sink: 82 · **processor: 1** · standalone: 35`, 87 instancias de boxPOP, 196 posiciones únicas para 207 nodos (apilados), 90 aristas y solo 3 con separación >400px. `processor: 1` es la clave: no hay flujo de datos, son ~90 pares aislados `fuente → tipo` en una grilla — por eso el usuario lo abrió y dijo "es un caos, nada tiene sentido". Fix: separar el CENSO de tipos (medición que deja evidencia JSON) de unas POCAS redes de ejemplo reales y legibles (layout por topología con `auto_layout`, agrupadas, UNA fuente compartida) y agregar un check de "nodos apilados = 0"
- [ ] 40. `tests/test_mcp_server_integration_comprehensive.py::test_set_td_parameters_valid` en rojo por un mock DESACTUALIZADO (drift del 11/09/26, `33ef477`) — `mcp_server_stdio.py` convierte el dict `params` del tool a `{"path", "updates": [{"name","value"}]}` y postea eso, pero el mock del test (`MockTDAPI.do_POST`, ~134) arma `changed` con `body.get("params", {})` → responde `{"success": true, "changed": []}`, el `_assert_success` pasa y el assert de contenido falla (`'amp' not found`). **Pre-existente**: `33ef477` es ancestro del trabajo de undo/redo y ni el archivo del test ni `mcp/src/` están en el diff del ciclo, así que no lo causa el ítem 09. Consecuencia: `python -m unittest discover tests` (documentado en `README.md:442`) no da 0 fallos → el criterio "python tests verdes" de los briefs no es alcanzable hoy. Fix: que el mock acepte `updates` (y siga aceptando `params` legacy) y que el assert valide el eco de `updates`. Aparte, `tests/test_mcp_server_stdio_integration.py` se CUELGA en Windows (23 dots + 2 F y nunca imprime `Ran N tests`): hay que acotarlo con timeout

---

## Cola de ejecución (queue)

Estado de `.freebuff_tasks/queue/` a la sincronización (el contenido íntegro vive fuera
de git; los scopes cerrados que deban citarse se copian acá):

| Archivo en cola | Ítem | Estado |
|---|---|---|
| `20_metrics_json.txt` | 06 `/metrics` | **ejecutado** el 17/09/26 (commits `4bdcff1`+`b70c6c8`+`8e5bc55`) — candidato a limpieza |
| `21_diff_red.txt` | 07 `/diff` | **scope cerrado** 17/09/26, listo para correr (contenido íntegro abajo) |
| `22_dry_run.txt` | 08 dry-run | encolado, scope pendiente de refinar |

### Scope cerrado — `21_diff_red.txt` (ítem 07, `/diff`)

Trabajá en este repo (servidor MCP de TouchDesigner).

TAREA (ítem 07 del BACKLOG): td_diff_network — comparar estados de red y devolver
diferencias legibles. SCOPE CERRADO el 17/09/26 con evidencia del repo (no re-descubrir).

**ARQUITECTURA DECIDIDA (sigue el patrón toeImport, NO duplicar en el bridge)**
Nuevo módulo TS puro `mcp/src/tools/toeDiff.ts` + tool MCP `td_diff_network`
(registrada como toeImport.ts hace con registerToeImportTools). Razones: (a) el
dump vive en disco del lado Node, no dentro de TD; (b) los parsers de
toeImport.ts son ya puros y testeables (parseNFile/parseParmFile/parseToeDirScope);
(c) el bridge no necesita aprender nada nuevo — la captura del lado vivo es un solo
POST /exec con JSON por stdout (mismo idiom que buildImportCode ya usa y que está
verificado en vivo).

**REUSO EXACTO de toeImport.ts (no copiar código: importar)**
- parseToeDirScope / ToeDump / ToeNode / dumpTypeToPyClass: import directo de
  `mcp/src/tools/toeImport.ts` (ya exportados). El dump de referencia es el MISMO
  ToeDump que importa el importador — diff e importación comparten modelo.
- verifyAgainstDump NO sirve como diff (solo itera nodos del dump → nunca ve nodos
  sobrantes, y no compara parámetros). Escribir `diffAgainstDump(dump, snapshot)`
  nuevo en toeDiff.ts como función PURA (testeable offline). Forma de salida
  (claves estables, todo serializable a JSON):

```json
{
  "summary": {"missing": 0, "extra": 0, "type_mismatch": 0, "param_diffs": 0,
              "wire_missing": 0, "wire_extra": 0, "identical": true},
  "missing":       [{"name": "...", "expected_type": "..."}],
  "extra":         [{"name": "...", "actual_type": "..."}],
  "type_mismatch": [{"name": "...", "expected": "...", "actual": "..."}],
  "param_diffs":   [{"name": "...", "param": "...", "expected": "...", "actual": "..."}],
  "wires": {
    "missing": [{"src": "...", "dst": "...", "input_index": 0}],
    "extra":   [{"src": "...", "dst": "..."}]
  }
}
```

- Nodos presentes en ambos: comparar tipo (OPType vs dumpTypeToPyClass normalizado,
  ej. dump "POP:grid" → "gridPOP" — decidir UNA normalización y testearla), inputs
  ordenados (índice de input, mismo criterio que verifyAgainstDump: expectedInputs
  filtrados a los que existen en el dump), y parámetros del .parm contra valores actuales.
- Normalización de valores de parámetros: comparar como string recortado; números
  con tolerancia 1e-6 (el dump redondea); menús/strings tal cual.

**CAPTURA DEL LADO VIVO (un solo /exec, mismo patrón de buildImportCode)**
`buildSnapshotCode(parentPath)` genera Python 3.9 (sin `X | None`) que recorre
parent.children (1 nivel, la red importada es plana) y por nodo imprime:
{path, name, OPType (verificado: `'type': n.OPType` ya se usa en el bridge),
nodeX, nodeY, inputs=[i.name for i in o.inputs], params={p.name: str(p.eval())
SOLO para pars no-default: p.mode == ParMode.CONSTANT y p.isDefault==False si
existe ese atributo — verificar en vivo con /parameters ANTES de confiar; si
isDefault no existe en esta build, caer a comparar contra p.defaultVal},
cook ok (o.errors() vacío)}. print(json.dumps(...)) al final. Regla 1 de
AGENTS.md: nunca adivinar nombres de parámetros.

**CONTRATO DE LA TOOL td_diff_network**
Input: {toe_dir: str (path al .toe.dir), scope: str="project1",
parent_path: str (donde está la réplica viva), diff_params: bool=true,
diff_positions: bool=false}. Pasa el dump por parseToeDirScope, captura snapshot
vivo con un /exec, corre diffAgainstDump puro y devuelve el objeto de arriba +
next_steps. Diff vacío (identical=true) == réplica fiel. NO implementar snapshots
antes/después de ediciones en esta pasada (extensión natural futura:
td_export_network_snapshot, NO en esta tarea).

**ESTADO DEL CORPUS (verificado 17/09/26 — rutas NUEVAS)**
El corpus ya NO está en `old/mcp_td_v3/Toe_Expand/Toe_Expand/` ni en
`.../POPs/TD POPs/Forum/Facet` (ese directorio quedó VACÍO). Ahora:
`old/mcp_td_v3/Toe_Expand/<Proyecto>/<Proyecto>.toe.dir/` — p.ej. Facet:
`old/mcp_td_v3/Toe_Expand/Facet/Facet.toe.dir/` con `project1/` (facet1, facet2,
grid1, line1, math1, quantize1... con .n y .parm por nodo). La tool recibe toe_dir
y arma el path del scope con path.join — no hardcodear la vieja ruta.
La réplica Facet previa YA NO está en TD: la prueba en vivo debe re-importar
Facet con td_import_toe_dir → correr td_diff_network contra el mismo dump →
diff vacío (identical=true) → pegar salida real en el resumen. Si por params hay
diffs legítimos (defaults vs dump), documentarlos como hallazgo, no forzar identical.

**TESTS OFFLINE (mcp/test/toeDiff.test.js, estilo toeImport.test.js)**
1) diffAgainstDump: red vacía → todo missing; dump vacío → todo extra.
2) Tipo mismatch detectado y reportado con expected/actual.
3) Param diff numérico con tolerancia (1.0 vs 1.0000001 → no diff; 1.0 vs 2.0 → diff)
   y de string (menu/expr) distinto → diff con valores como string.
4) Wires: missing con input_index correcto; extra cuando la red tiene un cable que
   el dump no declara; input reordenado → reportado.
5) identical=true solo cuando TODO coincide (fixture mínimo 3 nodos + 2 wires).
6) buildSnapshotCode: el Python generado compila (ast.parse offline, como el
   harness de toeImport si lo hay) y contiene los campos exigidos.

**DOCS**
- docs/API_REFERENCE.md: sección de la tool (input/output, ejemplo real).
- docs/TOE_REPLICATION.md: sección nueva "Validación de réplicas con /diff"
  (flujo: importar → diffr → identical=true == fiel; qué hacer con param_diffs).

**VERIFICACIÓN OBLIGATORIA**
- cd mcp && npm run build && node --test → 1208 tests MÍNIMO, 0 fail (los nuevos
  suman arriba de 1208).
- Prueba en vivo contra TD 2025.31760 (:44444, vivo el 17/09): import Facet →
  diff → pegar salida REAL en el resumen. TD unreachable → avisar, no inventar.
- Sin drift: NO tocar toe/src/TouchDesignerAPI.py ni mcp/setup/toe_extension.py
  (esta tarea es 100% lado Node).

**REGLAS**
No commitear .freebuff/, .freebuff_tasks/ ni __pycache__. Commits temáticos en
inglés de una línea (feat(diff): ..., test(diff): ..., docs(diff): ...). No
force push. Credenciales ya en Git Credential Manager. Al terminar, marcar el
ítem 07 como [x] en .freebuff_tasks/BACKLOG.md con evidencia (como se hizo
con 04, 05 y 06).
