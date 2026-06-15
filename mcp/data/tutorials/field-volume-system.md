---
title: "Sistema de Campos Volumétricos con POPs"
category: "pops"
difficulty: "advanced"
keywords: ["field", "volumetric", "force", "torus", "mathcombine", "mathmix", "pops", "simulation"]
duration: "35 min"
requires_td: true
---

# Sistema de Campos Volumétricos con POPs

Crea campos de fuerza volumétricos usando el operador `field POP` para generar zonas de influencia espacial con formas geométricas (toro, esfera, caja), combinándolos con `mathcombine` y `mathmix` para afectar geometría en tiempo real.

Basado en el patrón fieldPOPtorus.

## Requisitos

- TouchDesigner (cualquier licencia con POPs)
- Conocimientos básicos de POPs y atributos

## Arquitectura del sistema

```
gridPOP → subdividePOP → normalPOP
    → field1 (torus) ─┐
    → field2 (torus) ─┼→ mathcombine1 (sum weights) → mathmix1 (apply to P)
    → field3 (torus) ─┘                                         ↓
                                                   transformPOP → renderTOP
```

## Paso 1: Generar geometría base

1. Crea un **grid SOP** (nómbralo `grid1`)
   - Size: `(10, 10)`
   - Rows: `50`
   - Columns: `50`
2. Crea un **subdivide SOP** (nómbralo `subdivide1`)
   - Conecta `grid1`
   - Level: `1`
3. Crea un **normal SOP** (nómbralo `normal1`)
   - Conecta `subdivide1`

## Paso 2: Crear campos de fuerza

1. Crea un **field POP** (nómbralo `field1`)
   - Conecta `normal1`
   - Mode: **`Torus`**
   - RadX: `3` (radio mayor)
   - RadY: `1` (radio menor)
   - Falloff: `0.5`
   - Output: `Weight` (atributo de peso)

2. Crea otro **field POP** (`field2`)
   - Mode: **`Torus`**
   - RadX: `2`
   - RadY: `0.8`
   - Posición: `(2, 0, 1)` (desplazado)
   - Output: `Weight1`

3. Crea un tercer **field POP** (`field3`)
   - Mode: **`Torus`**
   - RadX: `4`
   - RadY: `1.5`
   - Posición: `(-1, 1, 0)`
   - Output: `Weight2`

## Paso 3: Combinar pesos de campo

1. Crea un **mathcombine POP** (nómbralo `mathcombine1`)
   - Conecta las salidas de los campos
   - Operation: **`A + B + C`** (suma de pesos)
   - Esto suma los pesos de los 3 campos en un atributo `Weight`

## Paso 4: Aplicar fuerza a la geometría

1. Crea un **mathmix POP** (nómbralo `mathmix1`)
   - Conecta `mathcombine1`
   - Operation: **Multiply** (multiplicar posición por peso)
   - A: `P` (posición)
   - B: `Weight` (peso del campo)
   - Esto desplaza los puntos proporcionalmente al peso del campo

## Paso 5: Animar los campos

1. En `field1`, usa expresiones para animar radio:
   - `RadX`: `3 + sin(absTime.seconds * 0.5) * 0.5`
   - `RadY`: `1 + cos(absTime.seconds * 0.3) * 0.3`
2. En `field2`, anima posición:
   - `tx`: `2 + sin(absTime.seconds * 0.7) * 1`
   - `ty`: `cos(absTime.seconds * 0.4) * 1.5`
3. En `field3`, anima radio:
   - `RadX`: `4 + sin(absTime.seconds * 0.2) * 1`

## Paso 6: Renderizar

1. Crea un **Geometry COMP** (nómbralo `geo1`)
   - Conecta `mathmix1` como input
2. Crea un **render TOP** (nómbralo `render1`)
   - Resolution: `1280x720`
3. Crea un **phong MAT** (nómbralo `phong1`)
   - Color: `(0.3, 0.6, 0.9)`
   - Specular: `0.5`
   - Aplica a `geo1`

## Modos del field POP

| Modo | Forma | Parámetros clave |
|------|-------|------------------|
| `Sphere` | Esfera | `Radius`, `Falloff` |
| `Box` | Caja | `Size X/Y/Z`, `Falloff` |
| `Torus` | Toro | `RadX`, `RadY`, `Falloff` |
| `Cylinder` | Cilindro | `Radius`, `Height`, `Falloff` |
| `Line` | Línea | `Direction`, `Falloff` |

## Variante: Múltiples formas mixtas

1. Mezcla field modes diferentes:
   - `field1`: Sphere (atracción central)
   - `field2`: Box (zona de repulsión)
   - `field3`: Cylinder (columna de fuerza)
2. Usa **negate** en mathcombine para repulsión:
   - `field2` output: `-Weight` (peso negativo = repulsión)

## Variante: Campos 3D para LED volumétrico

1. Crea un **grid SOP** 3D (con componente Z):
   - Size: `(10, 10, 10)`
   - Rows: `20`, Columns: `20`, Depth: `20`
2. Los campos volumétricos afectarán cada punto en 3D
3. Ideal para matrices LED 3D

## Solución de problemas

- **Geometría no se deforma**: Verifica que `mathcombine` reciba los 3 inputs
- **Pesos en 0**: Revisa que los field POPs estén conectados correctamente
- **Performance lenta**: Reduce resolución del grid (menos rows/columns)
- **Campos no visibles**: Aumenta `Falloff` o `Weight` output

## Consejos

- Los campos son ideales para crear "zonas de interacción" en escenas
- Combina con **audio CHOP** para campos reactivos a sonido
- Usa **ramp CHOP** para controlar la curva de falloff
- Los campos pueden afectar atributos diferentes: `P`, `N`, `Cd`, `pscale`
- Para performance, usa campos con `Falloff` bajo (más suave, menos cálculo)
