---
name: "td-performance"
description: "Optimización de rendimiento en TouchDesigner: presupuestos, profiling, cook cost, GPU/VRAM, y estrategias de escalado."
---

# td-performance

## Objetivo

Mantener estabilidad a 60fps con presupuestos explícitos y validación repetible.

## Validaciones recomendadas

- `Info CHOP` en operadores críticos (POP/TOP/COMP) y lectura de `cook_time`.
- Límites explícitos: partículas, resolución, recook, feedback.
- Estrategias de degradación: LOD por distancia, downscale TOP, reducción de spawn.

