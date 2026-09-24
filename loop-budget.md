# loop-budget.md — presupuesto y limites del loop del TD-MCP

> El agente lee este archivo al empezar cada corrida y escribe su consumo al terminar
> (en `loop-run-log.md`). Sin esto, un loop es una cuenta abierta.

## Limites diarios

| Loop | Cada | Max corridas/dia | Max briefs o items/run | Intento max/item |
|------|------|------------------|-------------------------|------------------|
| Ciclo diario MCP (Freebuff + commit + push) | 20 min (con gate de ventana limpia) | 1 corrida real/dia | 1 brief | 3 |
| Triage de descubrimiento (script) | 4 h | 6 | — (no consume LLM) | — |
| Canario en vivo TD | 30 min (script) | 48 | — | — |
| Campana de testeo (soak) | 15 min (script) | 96 | — | — |
| Relay de Freebuff | pausado | 0 | — | — |

## Costo
- El costo dominante son las horas de Freebuff (Freebuffs) y los tokens del agente que audita.
  Regla practica: **1 brief grande por dia**, no cinco chicos; el contexto de la cola se paga
  una vez.
- Los loops de script (triage, canario, campana) son casi gratis: no usan LLM. Por eso el
  descubrimiento va en script y el juicio va en agente.

## Al exceder el presupuesto
1. Pausar el ciclo diario (`cronjob pause 4fc977b6a811`).
2. Anotar el evento en `loop-run-log.md`.
3. Reportarle a Tolch con el gasto y la causa.

## Kill switch
- Crear el archivo `loop-pause-all` en la raiz del repo, o poner `loop: paused` en `STATE.md`.
- Los scripts (`loop_triage.py`, `loop_gate.py`) lo respetan y salen con codigo 4.
- Para reanudar: borrar el archivo (o la linea) y anotarlo en `loop-run-log.md`.
