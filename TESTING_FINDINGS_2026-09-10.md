# Reporte de testing en vivo — MCP ↔ TouchDesigner (10/09/2026)

> Generado por Hermes durante una sesión de verificación de conexión y pruebas de creación de nodos.
> Entorno: **TouchDesigner 2025.32460** con `toe/TouchDesignerAPI.toe` · API HTTP en `http://localhost:44444`
> Extensión cargada en TD: `toe/src/TouchDesignerAPI.py` (mtime 29/07/2026)

## ✅ Verificado OK

| Test | Resultado |
|---|---|
| Conexión API | `GET /info` responde (FPS 60) |
| Raíz | `GET /operators?path=/` → ui, sys, local, perform, **project1**, TouchDesignerAPI |
| Red | `GET /verify?path=/project1` → **1222 operadores · 410 conexiones · 0 errores · healthy: true** |
| Creación de nodos | sandbox `baseCOMP` + `noiseTOP → levelTOP → nullTOP` creados dentro del sandbox |
| Cableado | `outputConnectors[0].connect(dst)` → 2 conexiones confirmadas por `/connections` |
| Verificación del sandbox | `operator_count: 3`, `errors: []`, `healthy: true` |
| Otras familias | `mathCHOP` creado OK dentro del sandbox |
| Lectura de parámetros | `GET /parameters` devuelve nombre/label/style/mode/value/expr/default |

## 🐞 BUG 1 (crítico — falla silenciosa) — `/parameters/set` no aplica con el payload documentado

**El payload documentado no hace nada y NO devuelve error.**

- Documentado en `AGENTS.md` (línea ~26) y en `API_REFERENCE.md`:
  `POST /parameters/set {"path": ..., "params": {"amp": 0.5}}`
- También es el payload que envía `mcp_server_stdio.py:261`:
  `_http_post("/parameters/set", {"path": path, "params": params})`

**Reproducción (verificada contra TD en vivo):**

```bash
curl -X POST http://localhost:44444/parameters/set -H "Content-Type: application/json" \
  -d '{"path":"/project1/hermes_test_c603a4bf/noise1","params":{"amp":0.35}}'
# → {"path": "...", "updated": [], "missing": [], "transactional": true}   ← NO aplica nada
```

**El payload que SÍ funciona** (y que usa `mcp/src/applyNetwork.ts:52`):

```bash
curl -X POST http://localhost:44444/parameters/set -H "Content-Type: application/json" \
  -d '{"path":"/project1/hermes_test_c603a4bf/noise1","updates":[{"name":"amp","value":0.35}]}'
# → {"updated":[{"name":"amp","value":0.35,...}], ...}
# read-back: amp 0.35 | period 2.5   ✅
```

**Causa:** `_handle_parameters_set` (`toe/src/TouchDesignerAPI.py:3085`) lee `payload.get("updates", [])`
— una **lista** de `{name, value}` — mientras que la doc y el cliente stdio mandan `params` como **dict**.
El iterador no itera nada → `updated: []`, `missing: []`, sin excepción.

**Acciones sugeridas:**
1. Corregir `AGENTS.md` y `API_REFERENCE.md` (usar `updates: [{name, value}]`).
2. Corregir `mcp_server_stdio.py` para enviar `updates` (o migrarlo al servidor TS).
3. *(Opcional, defensivo)* En `_handle_parameters_set`, aceptar también `params` como dict:
   `updates = payload.get("updates") or [{"name": k, "value": v} for k, v in (payload.get("params") or {}).items()]`
   y devolver un `warning` cuando se use la forma legacy — así ningún cliente viejo falla en silencio.
4. **Test de regresión** que cubra AMBOS payloads y falle si `updated` queda vacío con parámetros válidos.

## 🐞 BUG 2 (menor) — `/screenshot` no resuelve un TOP válido

```bash
curl -X POST http://localhost:44444/screenshot -H "Content-Type: application/json" \
  -d '{"path":"/project1/hermes_test_c603a4bf/out1"}'
# → {"success": false, "error": "No TOP output found",
#    "note": "Select a TOP operator or create one to capture a screenshot"}
```

`out1` es un `nullTOP` (familia TOP) que existe y cocina sin errores. Parece que el handler de
screenshot no resuelve el path/op recibido (¿espera otro campo, o el op seleccionado en el editor?).
A confirmar leyendo el handler y probando variantes (`op`, `operator`, path del viewer).

## 🐞 BUG 3 (menor) — `/info` devuelve metadatos en null

```bash
curl http://localhost:44444/info
# → {"build": null, "version": null, "commercial": null, "platform": null,
#    "release": null, "projectPath": null, "projectFPS": 60.0}
```

Sólo `projectFPS` tiene valor: el endpoint responde pero no está leyendo la versión/build de TD
ni el path del proyecto (`app.version`, `app.build`, `project.folder`). Útil para diagnósticos
y para que un agente sepa contra qué build está hablando.

## Notas de contexto

- El sandbox de prueba quedó en `/project1/hermes_test_c603a4bf` (visible en el editor, 4 ops).
- Recordatorio de las reglas del proyecto: todo test en vivo crea su propio **baseCOMP sandbox**
  (nunca nodos sueltos en `/project1`), con nombres únicos y `--keep` para dejarlos visibles.
- Sugerencia: agregar los dos casos de arriba al `TESTS` de `toe/src/test_orchestrator_massive.py`.
