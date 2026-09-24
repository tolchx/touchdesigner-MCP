# loop-constraints.md — reglas VINCULANTES del loop del TD-MCP

> Todo agente que corra un loop sobre este repo lee este archivo ANTES de tocar nada.
> Lo de aca NO se negocia: si una regla impide terminar una tarea, se escala, no se ignora.
> El gemelo mecanico es `gate.yaml` (lo aplica `scripts/loop_gate.py`).

## Alcance
- El loop SOLO toca este repo (`C:/Users/Tolch/Documents/AI_Code/Touchdesigner_MCP/Main`).
- Un item por corrida. Nada de "de paso arreglo esto otro": eso es otro item.
- Prohibido tocar los `.toe` de Tolch, `Config/System` de TouchDesigner, y la UI global de TD.
  Si una tarea lo requiere, se escala con el diff exacto propuesto.

## Verdad
- Prohibido simular una verificacion en vivo. Si TD esta DOWN, se dice "pendiente por entorno"
  y el item NO se cierra. Nunca se escribe "verificado" sobre algo que no se corrio.
- Ninguna tool nueva se cierra sin un test que EJECUTE lo que genera (no string-matching).
- Toda cifra que se publique sale de correr el comando, no de la memoria del agente.

## Codigo
- Antes de proponer un fix: `npm run build`, `npm run typecheck`, `npm run ci`, la suite Node
  completa y las suites Python offline. Se pegan los conteos reales.
- Prohibido deshabilitar, saltear o "arreglar" un test para que CI de verde. Un test en rojo
  es un hallazgo, no un obstaculo.
- Un fix por corrida. Refactor no relacionado = rechazo.
- Maximo 3 intentos por item. Al cuarto, se escala con el historial de intentos
  (se registran en `loop-run-log.md`).
- Nada de `raise SystemExit` ni efectos de import en codigo que corre DENTRO de TD
  (mata el script del server y el llamador recibe "sin respuesta" en vez del error).

## Secretos y datos de Tolch
- Nunca commitear tokens, claves, rutas absolutas de la maquina de Tolch en codigo que se
  entrega a terceros, ni datos personales.
- La evidencia cruda (`.freebuff_tasks/evidence/`) y los `.toe` NO se versionan; lo que se
  versiona es el resumen en `docs/`.

## Comunicacion
- Se le dice a Tolch que se va a hacer antes de hacerlo, y que se hizo despues (con la evidencia).
- `push` solo despues del gate y con el visto bueno del juez externo. Los commits locales
  son libres; el push a `main` no.
- Nunca cerrar un item sin evidencia pegada (comando + salida).

## Presupuesto
- Limites en `loop-budget.md`. Al 80% del cupo diario, el loop pasa a modo SOLO REPORTE.
- Si existe el archivo `loop-pause-all` en la raiz (o `STATE.md` dice `loop: paused`), el loop
  sale inmediatamente sin hacer nada.
