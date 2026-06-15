---
title: "Ray Marching con POPs"
category: "pops"
difficulty: "expert"
keywords: ["ray", "march", "pops", "physics", "reflection", "collision", "gpu", "simulation"]
duration: "45 min"
requires_td: true
---

# Ray Marching con POPs

Implementa un sistema de ray marching en GPU usando POPs: partículas que disparan rayos, detectan colisiones con geometría, reflejan y continúan su trayectoria. Incluye fuerzas de gravedad, drag y reflexión.

Basado en el patrón RayPOP.

## Requisitos

- TouchDesigner (cualquier licencia con POPs)
- GPU con soporte POPs
- Conocimientos avanzados de POPs y atributos

## Arquitectura del sistema

```
pointgenPOP (1000 rays) → spherePOP (escena)
    → attributePOP (velocity, drag)
    → mathcombinePOP (sum forces: gravity + drag)
    → mathcombinePOP (integrate P + v)
    → rayPOP (raytrace + reflect) → mathcombinePOP (conditional)
    → cachePOP → attributePOP (rename) → nullPOP
    → geoCOMP → renderTOP
```

## Paso 1: Generar rayos

1. Crea un **pointgen POP** (nómbralo `pointgen1`)
   - Total: `1000`
   - Type: `Random`
   - Domain: Box, Size `(5, 5, 5)`
2. Crea un **sphere POP** (nómbralo `sphere2`) como objeto de escena
   - Radius: `2`
   - Type: `Polygon`
   - Divisions: `16`

## Paso 2: Definir atributos de rayo

1. Crea un **attribute POP** (nómbralo `attribute1`)
   - `v` (Vector): `(0, -1, 0)` — dirección del rayo (hacia abajo)
   - `prevV` (Vector): `(0, -1, 0)` — velocidad previa
   - `RayReflect` (Integer): `0` — contador de reflexiones
   - `RayInside` (Integer): `0` —是否 dentro del objeto

## Paso 3: Fuerzas físicas

1. Crea un **mathcombine POP** (`F_drag`)
   - Operation: `A * B`
   - A: `v` (velocidad actual)
   - B: `-0.02` (constante de drag)
   - Output: `F_drag`
2. Crea un **mathcombine POP** (`F_gravity`)
   - Operation: `A + B`
   - A: `F_drag`
   - B: `(0, -0.01, 0)` (gravedad constante)
   - Output: `sum_forces`

## Paso 4: Integración temporal

1. Crea un **mathcombine POP** (`P_update`)
   - Operation: `A + B * dt`
   - A: `P` (posición actual)
   - B: `sum_forces` (fuerza acumulada)
   - `dt`: `0.016` (paso de tiempo)
   - Output: `P` (nueva posición)
2. Crea un **mathcombine POP** (`v_update`)
   - Operation: `A + B * dt`
   - A: `v`
   - B: `sum_forces`
   - Output: `v` (nueva velocidad)

## Paso 5: Ray tracing con collision POP

1. Crea un **ray POP** (nómbralo `ray1`)
   - Conecta `v_update` como input 0
   - Conecta `sphere2` como input 1 (geometry de colisión)
   - Operation: **`Hittest`**
   - Detect Reflected Ray: **`On`**
   - Detect Inside/Outside: **`On`**
   - Esto genera atributos: `RayPosition`, `RayNormal`, `RayReflect`, `RayInside`

## Paso 6: Manejo condicional de reflejos

1. Crea un **mathcombine POP** (`conditional`)
   - Si `RayReflect == 1` (hubo colisión):
     - Usar `RayPosition` como nueva posición
     - Reflejar velocidad: `v = reflect(v, RayNormal)`
   - Si `RayInside == 1` (dentro del objeto):
     - Reducir velocidad: `v = v * 0.5`
   - Si no hubo colisión:
     - Mantener posición y velocidad actuales
2. Usa **delete POP** o **attribute POP** con expresiones condicionales

## Paso 7: Cache y salida

1. Crea un **cache POP** (nómbralo `cache1`)
   - Cache Length: `120` frames
   - Esto almacena el historial de posiciones
2. Crea un **attribute POP** (`attribute5`)
   - Rename: `v` → `prevV` (guardar velocidad previa)
3. Crea un **null POP** (`null_out`)

## Paso 8: Feedback loop

1. Crea un **feedback POP** (`feedback1`)
2. Conecta `null_out` al segundo input
3. Apunta el feedback al `null_out`
4. Esto permite que las partículas persistan entre frames

## Paso 9: Renderizar

1. Crea un **Geometry COMP** (`geo1`)
   - Conecta `null_out`
2. Crea un **copy POP** (`copy2`)
   - Input 0: una **sphere POP** pequeña (template)
   - Input 1: `null_out` (instancias)
3. Conecta a **render TOP** (`render1`)

## Diagrama completo

```
pointgen1 → attribute1 → F_drag → F_gravity → P_update → v_update
                                    ↓
                                ray1 (hittest con sphere2)
                                    ↓
                                conditional (reflejar/no reflejar)
                                    ↓
                                cache1 → attribute5 → null_out
                                    ↑                    ↓
                                feedback1 ←───── geo1 → render1
```

## Parámetros de simulación

| Parámetro | Efecto | Rango típico |
|-----------|--------|--------------|
| `dt` | Paso de tiempo | 0.001 - 0.05 |
| Drag | Resistencia del aire | 0.01 - 0.1 |
| Gravity | Fuerza gravitacional | 0.001 - 0.1 |
| Max Reflections | Límite de rebotes | 1 - 10 |
| Sphere Radius | Tamaño del objeto | 0.5 - 5.0 |

## Variante: Múltiples objetos de colisión

1. Crea varios **sphere POP** con diferentes posiciones y radios
2. Usa **merge POP** para combinarlos como input 1 del ray POP
3. Los rayos colisionarán con cualquier objeto del merge

## Variante: Rayos con color por reflejos

1. Mapea `RayReflect` a color:
   - `Cd.r = 1.0 - RayReflect / maxReflections`
   - `Cd.b = RayReflect / maxReflections`
2. Los rayos recién disparados son rojos, los que rebotaron mucho son azules

## Solución de problemas

- **Rayos no colisionan**: Verifica que `sphere2` tenga geometría y esté como input 1
- **Partículas desaparecen**: Revisa el feedback loop y que `P` se actualice correctamente
- **Reflejos incorrectos**: Verifica que `reflect()` reciba vector normal correcto
- **Performance**: Reduce total de rayos o usa cache más corto

## Consejos

- El ray POP es más eficiente que ray marching manual en GLSL
- Usa **cache POP** para trails visuales de las trayectorias
- Combina con **audio CHOP** para rayos reactivos a sonido
- Para escenas complejas, usa **merge POP** con múltiples geometrías
- El parámetro `Max Reflections` en el ray POP controla la profundidad máxima
