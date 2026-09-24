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
