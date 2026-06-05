---
name: "td-project-architecture"
description: "Arquitectura de proyectos complejos en TouchDesigner: separación por subsistemas, IO estándar, reutilización, y contratos de red."
---

# td-project-architecture

## Objetivo

Diseñar proyectos grandes como un conjunto de subsistemas con contratos claros:

- inputs (CHOP/TOP/SOP/POP)
- procesamiento (stages)
- outputs (render/instancing/export)

## Reglas

- Cada subsistema vive en un COMP con `in*`/`out*`.
- Evitar dependencias implícitas por paths globales.
- Exponer parámetros clave al nivel superior.

