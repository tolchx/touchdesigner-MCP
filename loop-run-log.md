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
