# loop-run-log.md — historial append-only de corridas del loop

> Una linea (o un bloque) por corrida. Sin editar lo viejo. Es la memoria del loop que no vive
> en la cabeza de nadie ni en una conversacion.

Formato: `fecha | loop | nivel | que encontro | que hizo | resultado | evidencia`

## 2026-09-24
- 2026-09-24 | discovery (manual, antes de existir el script) | L1 | auditoria del Discord de TWOZERO: 486 msgs, 7 hallazgos | se abrieron items 43-50 + briefs | items 43-47 cerrados, 48/49/52 encolados | `docs/discord-twozero/ANALISIS-TWOZERO-para-TD-MCP.md`
- 2026-09-24 | ejecucion | L3 | brief 47 (`td_measure`) | implementado + 2 bugs reales encontrados midiendo contra TD y 2 mas encontrados por el fake fiel | cerrado, commit `d8031d1`, `f264266` | `docs/discord-twozero/evidence/twozero_measure_live.json`
- 2026-09-24 | gate | — | creacion del loop: `LOOP.md`, `loop-constraints.md`, `loop-budget.md`, `gate.yaml`, `loop_triage.py`, `loop_gate.py` | pendiente de revision de Tolch | —
- 2026-09-24T08:41:08+00:00 | gate | — | commit sobre 2 archivo(s) | ALLOW | gate.yaml
- 2026-09-24T08:41:08+00:00 | gate | — | commit sobre 1 archivo(s) | BLOCK: 'toe/TouchDesignerAPI.toe' está en la denylist (patrón 'toe/*.toe'): requiere revisión humana explícita | gate.yaml
- 2026-09-24T08:41:09+00:00 | gate | — | auto-merge sobre 1 archivo(s) | BLOCK: 'mcp/src/tools/measure.ts' no está en el allowlist de auto-merge | gate.yaml
- 2026-09-24T08:41:09+00:00 | gate | — | commit sobre 2 archivo(s) | BLOCK: 'toe/develop.toe' está en la denylist (patrón 'toe/*.toe'): requiere revisión humana explícita | gate.yaml
- 2026-09-24T08:43:13+00:00 | gate | — | commit sobre 10 archivo(s) | ALLOW | gate.yaml
- 2026-09-24T08:43:48+00:00 | gate | — | commit sobre 11 archivo(s) | ALLOW | gate.yaml
- 2026-09-24 | promocion | L1 | prueba del promovendor con candidato sintético | item 54 + brief escrito y luego revertido (prueba) | OK: camino accionable y camino 'decisión humana' (exit 5) verificados | loop-candidates.json
- 2026-09-24 | enganche | — | FASE 1.5 agregada al ciclo diario (triage → promote → reconcile) | prompt del cron 4fc977b6a811 de 11629 a 13733 chars, verificado tras 20s | cron/jobs.json
- 2026-09-24T08:50:08+00:00 | gate | — | commit sobre 3 archivo(s) | ALLOW | gate.yaml
- 2026-09-24T08:56:16+00:00 | gate | — | commit sobre 6 archivo(s) | BLOCK: las suites no están verdes (ver detalle) | gate.yaml
- 2026-09-24T08:56:44+00:00 | gate | — | commit sobre 6 archivo(s) | ALLOW | gate.yaml
- 2026-09-24T08:57:32+00:00 | gate | — | commit sobre 3 archivo(s) | ALLOW | gate.yaml
- 2026-09-24T18:33:47+00:00 | gate | — | commit sobre 2 archivo(s) | ALLOW | gate.yaml

## 2026-09-24 16:28 — testeos en vivo con TD abierto (manual)
- cadena `twozero_chain_live.mjs`: ALL_OK (veredicto OK, 4/4 checks)
- http `twozero_http_live.py`: **flake medido** — 1ra pasada ALL_OK=False (bridge recién despierto, corrida inmediatamente después de otros dos scripts), 2da pasada ALL_OK=True (5/5). Hipótesis: primer cook del WebServer DAT. NO se parcheó nada: primero hay que caracterizar QUÉ check falla con el bridge frío (el script no persiste la evidencia de la pasada fallida porque la reescribe la pasada buena → ese es el arreglo real: no sobrescribir evidencia en rojo).
- measure `twozero_measure_live.mjs`: ALL_OK (cross-check vs TD dentro de tolerancia)
- brief 55 enviado a Freebuff (25 Freebuffs, hora nueva activa) → a `sent/`

- 2026-09-24T19:31:20+00:00 | gate | — | commit sobre 4 archivo(s) | ALLOW | gate.yaml
- 2026-09-24T19:31:48+00:00 | gate | — | commit sobre 2 archivo(s) | ALLOW | gate.yaml
- 2026-09-24T19:32:31+00:00 | gate | — | commit sobre 3 archivo(s) | ALLOW | gate.yaml
- 2026-09-24T21:07:48+00:00 | gate | — | commit sobre 6 archivo(s) | ALLOW | gate.yaml
- 2026-09-24T23:48:33+00:00 | gate | — | commit sobre 1 archivo(s) | ALLOW | gate.yaml
- 2026-09-24T23:49:00+00:00 | gate | — | commit sobre 1 archivo(s) | ALLOW | gate.yaml
- 2026-09-24T23:49:40+00:00 | gate | — | auto-merge sobre 1 archivo(s) | ALLOW | gate.yaml
- 2026-09-24T23:50:03+00:00 | gate | — | commit sobre 1 archivo(s) | ALLOW | gate.yaml
- 2026-09-24T23:50:52+00:00 | gate | — | commit sobre 1 archivo(s) | BLOCK: 'mcp/_tool_list.json' está en la denylist (patrón 'mcp/_tool_list.json'): requiere revisión humana explícita | gate.yaml
- 2026-09-24T23:51:49+00:00 | gate | — | commit sobre 1 archivo(s) | ALLOW | gate.yaml
- 2026-09-25T00:01:01+00:00 | gate | — | commit sobre 1 archivo(s) | ALLOW | gate.yaml
- 2026-09-25T00:16:15+00:00 | gate | — | commit sobre 7 archivo(s) | ALLOW | gate.yaml
- 2026-09-25T00:55:25+00:00 | gate | — | commit sobre 9 archivo(s) | ALLOW | gate.yaml
- 2026-09-25T06:02:44+00:00 | gate | — | commit sobre 9 archivo(s) | ALLOW | gate.yaml
- 2026-09-25T06:03:12+00:00 | gate | — | commit sobre 5 archivo(s) | ALLOW | gate.yaml
- 2026-09-25T06:26:02+00:00 | gate | — | commit sobre 4 archivo(s) | ALLOW | gate.yaml

## 2026-09-25 03:27 — ciclo diario TD-MCP (intento 2)
- **Fase 1 · obra**: el arbol no tenia codigo de Freebuff sin commitear; los 7 commits locales `d46d88d..20d8479` (briefs 12/55/56 + fixes del loop) estaban **sin pushear**. Chequeo de obra: en cada commit el diff corresponde al brief, los archivos estan en alcance, 0 `.skip/.only` nuevos y ningun timeout inflado (`join(timeout=3)`/`server_close()` son el fix del poisoning, no un parche).
- **Verificacion offline real**: `cd mcp && node --test` → **1351/1351, 0 fallos** (1347 en README); `npm run build` (tsc desde mcp/) limpio; `python -m unittest discover tests` → **532 tests OK** (14.3 s).
- **Verificacion en vivo** (TD LIVE build 2025.32460): canario GLSL veredicto PASS `checks 48/48 · casos 14/14`; **matriz POP omitida por cadencia** (ultima corrida completa 21/09, cadencia 7d) → el gate del baseline no corrio. No se forzo con `--force`.
- **Juez externo (5 corridas, `jev_audit_diff.py`, modelo typesafe/jev-1.13)**: (a) diff del brief 55 (`bae3623`, worktree temporal) → **VERDE** debilita 0.09 / corresponde 0.69; (b) `bf467dc` vs brief 56 → **VERDE** 0.04 / 0.88; (c) `b6bb359` vs brief 12 → **VERDE** 0.07 / 0.72; (d) `9b7d456` y (e) `1de53c3` sin brief → **VERDE** 0.06. La invocacion literal del prompt (arbol + brief 55) devolvio **ROJO `no_corresponde_al_brief=0.19`**: es artefacto de juzgar un diff de bookkeeping (README/BACKLOG/gitignore/ledger) contra un brief de tests — sin brief, el mismo arbol da VERDE (debilita 0.11, trabajo_real 0.69).
- **Descartado (falso positivo del triage)**: candidato `arbol-sucio`. Los archivos sucios son los `.toe`/`.tox` del usuario (rotacion de backups, intocables por regla) + `tmp/` (scratch de probes en vivo, ahora ignorado). Se agrego `*.tox` a la lista EVIDENCIA de `jev_audit_diff.py` (mismo criterio que `*.toe`: artefacto del usuario, no obra), asi el juez deja de levantarlos.
- **Cierres**: items 40 y 42 (arreglados por `bae3623`, verificados hoy con las suites) + sincronizacion del espejo para 12/55/56. `reconcile --check` detecto drift (brief 56 encolado con item cerrado) → `--apply` lo movio a `stale/` (nada borrado, STATE.md reescrito).
- 2026-09-25T06:27:57+00:00 | gate | — | commit sobre 8 archivo(s) | ALLOW | gate.yaml
- 2026-09-25T06:28:11+00:00 | gate | — | commit sobre 6 archivo(s) | ALLOW | gate.yaml
- 2026-09-25T06:28:19+00:00 | gate | — | commit sobre 1 archivo(s) | ALLOW | gate.yaml
- 2026-09-25T06:28:28+00:00 | gate | — | commit sobre 1 archivo(s) | ALLOW | gate.yaml
- 2026-09-25T06:28:36+00:00 | gate | — | commit sobre 9 archivo(s) | ALLOW | gate.yaml
- 2026-09-25T06:28:45+00:00 | gate | — | commit sobre 9 archivo(s) | ALLOW | gate.yaml
- 2026-09-25T06:28:54+00:00 | gate | — | commit sobre 5 archivo(s) | ALLOW | gate.yaml
- 2026-09-25T06:29:40+00:00 | promocion | L1 | cola-larga (peso 2) | item sin brief (decide Tolch) | item 66 | loop-candidates.json


- 2026-09-25T03:29:58-03:00 | triage | L1 | candidato `arbol-sucio` (1 archivo modificado: `toe/TouchDesignerAPI.tox`) | DESCARTADO — no promovido | es el `.tox` del usuario (rotacion de backups de TD, intocable por loop-constraints); se agregaron `.toe`/`.tox` a los ignorados de `loop_triage.py` para que no vuelva a consumir el candidato del dia | loop-candidates.json
- 2026-09-25T06:30:25+00:00 | gate | — | commit sobre 4 archivo(s) | ALLOW | gate.yaml
