---
title: "Estelas de Línea con Replicator"
category: "pops"
difficulty: "intermediate"
keywords: ["line", "strip", "trail", "replicator", "pop", "feedback", "linestrip"]
duration: "30 min"
requires_td: true
---

# Estelas de Línea con Replicator

Crea estelas de líneas animadas usando POPs, primitive mode `linestrip` y un replicador para generar múltiples trails con comportamientos independientes.

Basado en el patrón LineStripFeedback.

## Requisitos

- TouchDesigner (cualquier licencia con POPs)
- Conocimientos básicos de POPs y replicadores

## Arquitectura del sistema

```
circlePOP (puntos base) → linedividePOP → primitivePOP (linestrip)
    → transformPOP → sortPOP → nullPOP
    → replicator1 (basado en tabla) → feedback → renderTOP
```

## Paso 1: Generar puntos base

1. Crea un **circle POP** (nómbralo `circle1`)
   - Type: `NGon`
   - Divisions: `50` (puntos por línea)
2. Crea otro **circle POP** (nómbralo `circle2`)
   - Type: `NGon`
   - Divisions: `100` (más puntos para trails más suaves)
   - Radius: `(2, 2, 0)`

## Paso 2: Convertir a Line Strip

1. Crea un **linedivide SOP** (nómbralo `linedivide1`)
   - Conecta `circle1` (POP → SOP via toSOP)
   - Add Control Point Attribute: `On`
2. Crea un **primitive SOP** (nómbralo `primitive1`)
   - **Primitive Type: `Line Strip`** ← ¡Clave!
   - Esto conecta los puntos secuencialmente como una línea
3. Crea otro **linedivide SOP** (`linedivide2`)
   - Conecta `primitive1`
   - Add Control Point Attribute: `On`

## Paso 3: Transformar y ordenar

1. Crea un **transform SOP** (nómbralo `transform1`)
   - Scale: `(0.5, 0.5, 0.5)`
2. Crea un **group SOP** (nómbralo `group1`)
   - Group Type: `Points`
   - Operation: `By Range`
   - Range: `0-10` (primeros puntos)
3. Crea otro **transform SOP** (`transform2`)
   - Conecta `group1`
   - Translate: `(0, 0, 0)` — estos puntos se moverán
4. Crea un **sort SOP** (nómbralo `sort1`)
   - Sort By: `Seed`
   - Esto randomiza el orden de los puntos

## Paso 4: Configurar el replicador

1. Crea un **table DAT** (nómbralo `trail_config`)
   - Columnas: `id`, `count`, `radius`, `speed`
   - Filas de ejemplo:
     - `trail_0`, `50`, `1.0`, `0.5`
     - `trail_1`, `75`, `1.5`, `0.3`
     - `trail_2`, `100`, `2.0`, `0.7`
     - `trail_3`, `30`, `0.8`, `1.0`

2. Crea un **select DAT** (nómbralo `select2`)
   - Conecta `trail_config`

3. Crea un **replicator COMP** (nómbralo `replicator1`)
   - Template: `select2`
   - Operator Prefix: `id` (usa columna `id` como nombre)
   - Callbacks DAT: crea un **text DAT** (`replicator1_callbacks`)

4. En `replicator1_callbacks`, pega:
```python
def onReplicate(comp, template, index, replicateTable):
    # Configurar cada trail replicado
    row = replicateTable.row(index)
    name = row['id']

    # Leer config
    count = int(replicateTable['count', index])
    radius = float(replicateTable['radius', index])

    # Aplicar al template
    template.par.divisions = count
    template.par.radiusx = radius
    template.par.radiusy = radius
```

## Paso 5: Feedback loop para estelas

1. Crea un **feedback POP** (nómbralo `feedback1`)
2. Conecta la salida del replicador al **segundo input** de `feedback1`
3. Crea un **null POP** (nómbralo `null_out`)
4. Conecta `feedback1` → `null_out`
5. Selecciona los POPs del template del replicador y apunta el feedback a `null_out`

## Paso 6: Renderizar

1. Crea un **Geometry COMP** (nómbralo `geo1`)
   - Conecta `null_out` como input
2. Crea un **render TOP** (nómbralo `render1`)
   - Resolution: `1280x720`
3. Crea un **line MAT** (nómbralo `line1`)
   - Line Width: `2`
   - Smooth: `On`
4. Aplica `line1` a `geo1`

## Paso 7: Animar los trails

1. En el **transform2** del template, usa expresiones:
   - `tx`: `sin(absTime.seconds * speed + id * 0.5) * radius`
   - `ty`: `cos(absTime.seconds * speed * 0.7 + id * 0.3) * radius * 0.5`
2. O usa un **noise CHOP** exportado al transform para movimiento orgánico

## Parámetros por trail

| Parámetro | Trail 0 | Trail 1 | Trail 2 | Trail 3 |
|-----------|---------|---------|---------|---------|
| Divisions | 50 | 75 | 100 | 30 |
| Radius | 1.0 | 1.5 | 2.0 | 0.8 |
| Speed | 0.5 | 0.3 | 0.7 | 1.0 |
| Color | Rojo | Verde | Azul | Amarillo |

## Variante: Trails con color por atributo

1. Añade un **attribute POP** después del sort:
   - `Cd`: `(rand(@id), rand(@id + 100), rand(@id + 200))`
2. O usa **ramp CHOP** para mapear `@id` a colores:
   - Crea un **ramp CHOP** con gradientes de color
   - Conecta `@id` como input U
   - Exporta a `Cd`

## Solución de problemas

- **Líneas no aparecen**: Verifica que `primitive POP` esté en modo `Line Strip`
- **Replicador no genera nada**: Revisa que la table tenga columnas correctas y el template apunte al select correcto
- **Feedback infinito (blanco)**: Reduce la opacidad o añade fade
- **Líneas disconectadas**: Aumenta divisions o verifica el sort

## Consejos

- Usa `Line Strip` en primitive POP, no `Polygon` — es más eficiente para trails
- El replicador permite tener N trails con comportamientos diferentes
- Combina con **audio CHOP** para trails reactivos a sonido
- Usa **ramp TOP** en el material para degradados a lo largo de la línea
- Para trails 3D, añade componente Z en el transform
