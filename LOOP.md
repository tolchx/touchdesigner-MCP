# LOOP.md — los loops que mantienen el MCP de TouchDesigner

Este archivo documenta **cómo se opera este repositorio** con loop engineering: qué loops
corren, con qué cadencia, en qué nivel de autonomía, qué estado escriben y cuándo le pasan
la pelota a Tolch. Es documentación y es la semilla de los loops que mantienen el MCP.

Inspirado en el método de [cobusgreyling/loop-engineering](https://github.com/cobusgreyling/loop-engineering)
(5 bloques + memoria; reportar → asistir → desatender). No se instaló su CLI: el loop de este
repo es nativo de Hermes y específico del MCP. Lo que sí se copió es la disciplina de artefactos
(`loop-constraints.md`, `loop-budget.md`, `loop-run-log.md`, `gate.yaml`).

## Los cinco bloques, mapeados a lo que ya tenemos

| Bloque | En este repo |
|---|---|
| Automatización / scheduling | crons de Hermes: **ciclo diario MCP** (`4fc977b6a811`, c/20 min con gate de ventana limpia), **canario en vivo TD** (`2070d33e1350`, c/30 min, script-only), **campaña de testeo soak** (`9b14aa6fd344`, c/15 min, script-only) |
| Worktrees | ❌ no se usan: Freebuff trabaja sobre el árbol principal. Mitigación actual: gate + juez externo sobre el diff. Pendiente decidir si conviene aislar |
| Skills | ✅ `touchdesigner-mcp`, `touchdesigner-mcp-development`, `loop-engineering` (este método) + references (pitfalls, contratos) |
| Conectores (MCP) | ✅ bridge de TD en `127.0.0.1:44444`, juez externo `jev`, `mnemosyne` |
| Sub-agentes maker/checker | ✅ **Freebuff** = implementer; **juez externo (`jev_audit_diff.py`) + "chequeo de obra"** = verifier; el verifier NO puede marcar su propio trabajo como hecho |
| Memoria / estado | ✅ `STATE.md` (generado por `scripts/reconcile_backlog_queue.py`), `docs/BACKLOG.md`, `.freebuff_tasks/BACKLOG.md`, `mcp_daily_done.txt`, `loop-run-log.md`, vault + Mnemosyne |

## Loops activos

### 1. Descubrimiento (triage) — L1, script, sin LLM
- Cadencia: cada 4 h (cron `TD-MCP · loop triage`)
- Comando: `python scripts/loop_triage.py`
- Qué hace: lee señales **reales** del repo (árbol sucio, drift de la cola, suites en rojo,
  evidencia en vivo fallando, tipos de error del log del cliente, items cerrados sin verificación
  en vivo, briefs rancios) y escribe **candidatos a item** con su evidencia en
  `loop-candidates.json`. Solo reporta los NUEVOS (dedupe por huella).
- Promoción: `scripts/loop_promote.py` convierte el candidato de mayor peso **no promovido** en
  item real (ambos BACKLOG) + brief en la cola si es accionable; si necesita criterio humano queda
  como item sin brief y sale con exit 5. Dedupe por huella: un candidato se promueve una sola vez.
- Enganche: la **FASE 1.5 del ciclo diario** (`4fc977b6a811`) corre triage → promote → reconcile,
  un candidato por corrida. El agente del ciclo no improvisa: la promoción es mecánica.
- **Esto es lo que hace que el MCP se auto-mejore**: sin descubrimiento, el loop solo ejecuta
  la cola que alguien escribió a mano.

### 2. Ejecución — L2/L3, agente
- Cadencia: 1 corrida real por día (`4fc977b6a811`, con `mcp_daily_gate.py` esperando ventana limpia)
- Flujo: auditar lo que dejó Freebuff → correr las suites → chequeo de obra → juez externo →
  publicar (commit + push) → anotar en `loop-run-log.md`
- Estado: `STATE.md`, `mcp_daily_done.txt`, `docs/BACKLOG.md`
- Handoff: diffs fuera del brief, decisiones de diseño, cualquier cosa que toque los `.toe` de Tolch

### 3. Verificación en vivo — L1, script
- Cadencia: cada 30 min (`2070d33e1350`, `td_mcp_verify.py`)
- Qué hace: canario contra TD real; deja evidencia y avisa solo si algo cambió
- Complemento: `scripts/live/twozero_chain_live.mjs` y `twozero_measure_live.mjs` para
  aceptación end-to-end cuando TD está arriba (los corre el ciclo diario o Tolch a mano)

### 4. Campaña de testeo (soak) — L1/L2, script reanudable
- Cadencia: cada 15 min (`9b14aa6fd344`, `td_mcp_campaign.py`)
- Qué hace: avanza pasos de una batería larga sin comerse el contexto de nadie

## Prioridad cuando dos loops chocan

Verificación en vivo → Ejecución (ciclo diario) → Descubrimiento → Campaña soak.
Si el ciclo diario está publicando, el descubrimiento NO abre items nuevos hasta que termine,
para que el árbol no quede con dos escritores.

## Gates y seguridad

- **Antes de publicar**: `python scripts/loop_gate.py --action commit --paths <archivos>`.
  Aplica `gate.yaml`: denylist (`.toe` de Tolch, evidencia, secretos), `maxFiles`, `maxLines`,
  allowlist de auto-merge y la exigencia de suites verdes.
- **Juez externo**: el diff se audita con `jev` (trabajo real / corresponde al brief / debilita).
- **Humano**: push a `main` solo después de gate + juez. Commits locales libres.
- **Kill switch**: archivo `loop-pause-all` en la raíz o `loop: paused` en `STATE.md`.

## Nivel actual y qué falta para L3 pleno

- Hoy: **L2 sólido** (reporta, ejecuta, verifica con juez, publica con gate humano).
- Para L3 pleno falta: (a) verificación de comportamiento en vivo dentro del propio loop
  (hoy la corre un humano o el canario, no el ciclo que cierra el item) — es el **item 52**,
  la suite de comprensión de TD; (b) cap de intentos con ledger; (c) aislamiento por worktree
  si Freebuff empieza a ensuciar el árbol.

## Cómo correrlo a mano

```bash
python scripts/loop_triage.py            # descubrimiento (solo reporta lo nuevo)
python scripts/loop_triage.py --audit    # puntaje de preparación del loop (0-100) + gaps
python scripts/loop_triage.py --full     # descubrimiento + corre las suites
python scripts/loop_promote.py --list    # candidatos y si son accionables o decisión humana
python scripts/loop_promote.py           # promueve el de mayor peso (item + brief)
python scripts/loop_gate.py --action commit --paths docs/BACKLOG.md
```

---
*Este archivo es documentación y a la vez la semilla de los loops que mantienen el MCP.*
