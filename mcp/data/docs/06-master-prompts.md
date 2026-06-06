# Prompts maestros (catálogo)

Los prompts se almacenan como Markdown con frontmatter YAML en:

- `prompts/master/*.md`

## Campos mínimos recomendados

- `id`, `title`
- `project_type`: particulas | efectos_visuales | generativos | interactivos
- `complexity`: basico | intermedio | avanzado | experto
- `application`: instalaciones | performances | visualizacion_datos
- `touchdesigner_min_version`
- `hardware` (GPU/VRAM mínimo cuando aplique)
- `performance` (fps objetivo y presupuesto por frame)
- `validation[]` (criterios verificables)

## Convenciones de salida

Todo prompt maestro debe pedir explícitamente:

- Script Python para `td_execute` (idempotente).
- Validación Python posterior (existencia de OPs, conexiones críticas).
- Declaración de presupuesto de rendimiento (puntos, cooks críticos).
