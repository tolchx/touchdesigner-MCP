---
title: "Partículas que Siguen Curvas (Follow Curve)"
category: "pops"
difficulty: "advanced"
keywords: ["particles", "follow", "curve", "linestrip", "neighbor", "attraction", "pops", "gpu"]
duration: "35 min"
requires_td: true
---

# Partículas que Siguen Curvas (Follow Curve)

Sistema donde partículas se adhieren y siguen estructuras de línea (linestrips) usando detección de vecinos y atracción por distancia. Incluye control de dirección, ruido procedural, y disolución por ciclo de vida.

Basado en el patrón `particlePopBananaDisolver/followCurve`.

## Requisitos

- TouchDesigner (cualquier licencia con POPs)
- Conocimientos de POPs, atributos y neighbor search

## Arquitectura del sistema

```
textSOP (curva base) → soptoPOP → linedividePOP → primitivePOP (linestrip)
    → pointgenPOP (partículas) → particlePOP (emisión)
    → neighborPOP (closest, maxdistance)
    → mathmixPOP (Dest, GoToNext)
    → linemetricsPOP (distnext, dirnext)
    → mathcombinePOP (fuerza de atracción)
    → attributePOP (Cd alpha fadeout)
    → deletePOP (age limit)
    → nullPOP (output)
    → geoCOMP → renderTOP
```

## Paso 1: Crear curva base

1. Crea un **text SOP** (nómbralo `text1`)
   - Text: `"~"` — un símbolo tilde como curva suave
   - Font Size: `2`
   - Conecta a un **sopto POP** (`sopto1`)
2. Crea un **linedivide POP** (nómbralo `linedivide1`)
   - Conecta `sopto1`
   - Divisions: `50` — subdividir curva en 50 puntos
3. Crea un **primitive POP** (nómbralo `primitive1`)
   - Conecta `linedivide1`
   - Primitive Type: `Linestrip`
   - Esto convierte la geometría en una curva continua

## Paso 2: Generar partículas

1. Crea un **pointgen POP** (nómbralo `pointgen1`)
   - Total: `500`
   - Type: `Random`
   - Domain: Box, Size `(4, 4, 4)`
   - Estas partículas se adhieren a la curva
2. Crea un **particle POP** (nómbralo `particle1`)
   - Conecta `pointgen1` como input 0
   - Conecta `primitive1` como input 1 (curva objetivo)
   - Particles Per Frame: `5`
   - Life Expect: `120`

## Paso 3: Detección de vecinos en la curva

1. Crea un **neighbor POP** (nómbralo `neighbor1`)
   - Conecta `primitive1` (curva)
   - Operation: `Closest`
   - Max Distance: `2`
   - Max Neighbors: `1`
   - Output: `NebrDistNext`, `NebrId`, `NebrPos`
2. Crea un **linemetrics POP** (nómbralo `linemetrics1`)
   - Conecta `primitive1`
   - Output: `DistNext`, `DirNext` — distancia y dirección al siguiente punto

## Paso 4: Cálculo de atracción

1. Crea un **mathmix POP** (`mathmix_dest`)
   - Operation: `B - A`
   - A: `P` (posición actual de la partícula)
   - B: `NebrPos` (posición del vecino más cercano en curva)
   - Output: `Dest` — vector de destino
2. Crea un **mathmix POP** (`mathmix_goto`)
   - Operation: `length(Dest) < Mindist ? 1 : 0`
   - Output: `GoToNext` — flag: ¿moverse al siguiente punto?
3. Crea un **mathmix POP** (`mathmix_attraction`)
   - Operation: `normalize(Dest) * Followattraction`
   - Parámetros:
     - `Mindist`: `2` — distancia mínima para activar atracción
     - `Followattraction`: `0.2` — intensidad de seguimiento
   - Output: `AttractionForce`

## Paso 5: Ruido procedural

1. Crea un **noise POP** (nómbralo `noise1`)
   - Conecta `mathmix_attraction`
   - Type: `Perlin`
   - Amplitude: `0.1`
   - Period: `0.5`
2. Crea otro **noise POP** (`noise2`)
   - Type: `Turbulence`
   - Amplitude: `0.05`
3. Crea un **transform POP** (`transform1`)
   - Conecta `noise2`
   - Applies time-based animation: `(noise(time) * 0.01)`

## Paso 6: Mezclar fuerzas

1. Crea un **mathCombine POP** (`mathcombine_forces`)
   - Operation: `A + B`
   - A: `AttractionForce`
   - B: `noise1`
   - Output: `TotalForce`
2. Crea un **mathCombine POP** (`mathcombine_position`)
   - Operation: `A + B * dt`
   - A: `P`
   - B: `TotalForce`
   - `dt`: `0.016`
   - Output: `P`

## Paso 7: Disolución por ciclo de vida

1. Crea un **mathCombine POP** (`mathcombine_fadeout`)
   - Operation: `1.0 - (Age / LifeExpect)`
   - Output: `Alpha` — factor de transparencia
2. Crea un **attribute POP** (`attribute_alpha`)
   - Crear: `Cd.a` → `Alpha`
   - Esto hace que las partículas se desvanezcan al morir
3. Crea un **limit POP** (`limit_clampAlpha`)
   - Clamp Alpha: `0.0` to `1.0`

## Paso 8: Cache y salida

1. Crea un **cache POP** (nómbralo `cache1`)
   - Cache Length: `60` frames
   - Almacena historial de posiciones
2. Crea un **null POP** (`null_out`)
3. Crea un **Geometry COMP** (`geo1`)
   - Conecta `null_out`
4. Crea un **render TOP** (`render1`)
   - Camera: `cam1`
   - Resolution: `1920x1080`

## Diagrama completo

```
text1 → sopto1 → linedivide1 → primitive1 (linestrip)
                                   ↑
pointgen1 → particle1 → neighbor1 → mathmix_dest → mathmix_goto
                                    ↓
                            mathmix_attraction → noise1 + noise2
                                    ↓
                        mathcombine_forces → mathcombine_position
                                    ↓
                        mathcombine_fadeout → attribute_alpha
                                    ↓
                        cache1 → null_out → geo1 → render1
```

## Parámetros de simulación

| Parámetro | Efecto | Rango típico |
|-----------|--------|--------------|
| `Mindist` | Distancia mínima para atracción | 0.5 - 5.0 |
| `Followattraction` | Intensidad de seguimiento | 0.05 - 0.5 |
| `Max Distance` (neighbor) | Radio de búsqueda | 0.1 - 5.0 |
| `Noise Amplitude` | Variación de trayectoria | 0.01 - 0.3 |
| `Life Expect` | Duración de partículas | 30 - 300 |

## Variante: Curva inversa

1. Agrega un **switch POP** (`switch1`)
   - Input 0: `DirNext` (dirección normal)
   - Input 1: `-DirNext` (dirección inversa)
   - Switch: `Inversedirection` parameter
2. Las partículas pueden seguir la curva en cualquier dirección

## Variante: Múltiples curvas

1. Crea varios **text SOP** con diferentes textos
2. Usa **merge POP** para combinar las curvas
3. Conecta el merge como input 1 del particle POP
4. Las partículas se distribuirán entre todas las curvas

## Solución de problemas

- **Partículas no se adhieren**: Aumenta `Max Distance` en neighbor POP
- **Trayectoria muy recta**: Reduce `Followattraction` o aumenta `Noise Amplitude`
- **Partículas desaparecen rápido**: Aumenta `Life Expect` en particle POP
- **Curva no visible**: Verifica que `primitive1` esté en modo Linestrip

## Consejos

- El **linemetrics POP** es clave para saber la dirección del siguiente punto
- Usa **noise POPs** con diferentes escalas para variación natural
- El **cache POP** permite trails visuales sin recálculo
- Combina con **audio CHOP** para que la atracción reaccione al sonido
- Para performance, reduce el número de puntos en la curva base
