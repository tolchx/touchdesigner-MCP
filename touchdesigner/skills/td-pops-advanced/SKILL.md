---
name: "td-pops-advanced"
description: "Diseño y generación avanzada de sistemas POP (GPU). Consulta documentación técnica, define arquitectura robusta y genera scripts Python idempotentes."
---

# td-pops-advanced

## Objetivo

Generar redes POP avanzadas y estables en TouchDesigner (2025+) usando patrones reproducibles:

- feedback loops correctos
- atributos reservados coherentes
- encapsulación por COMP
- control explícito de rendimiento (puntos, buffers, cook cost)

## Herramientas disponibles

- `td_pops_query` para consultar documentación estructurada de POPs antes de escribir scripts.
- `td_pane`, `td_selection`, `td_operators` para inspección.
- `td_execute` para ejecutar Python y construir/actualizar redes.

## Reglas de operación

  - Consultar `td_pops_query` cuando el prompt menciona un POP específico o un atributo técnico.
  - Cargar `td-pop-expert` skill para acceso a la base de conocimiento completa de 33 módulos, operadores, y técnicas avanzadas.
  - Diseñar primero una arquitectura por etapas (source → sim → post → output).
3. Scripts Python idempotentes:
   - si el OP existe, reutilizarlo
   - si no existe, crearlo
   - reconectar inputs de forma determinística
4. Validar:
   - paths creados
   - conexiones críticas del feedback
   - atributos esperados (si aplica)

## Plantilla de respuesta (para el LLM)

- Arquitectura: lista de etapas y OPs por etapa
- Riesgos: cuellos de botella y mitigaciones
- Script: Python para `td_execute` con `from_op` explícito
- Validación: Python breve para confirmar estado

