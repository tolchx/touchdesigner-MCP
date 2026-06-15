---
title: "POP Ray Scene con Instancing"
category: "pops"
difficulty: "expert"
keywords: ["ray", "scene", "instancing", "pops", "rendering", "phong", "bloom", "procedural", "gpu"]
duration: "50 min"
requires_td: true
---

# POP Ray Scene con Instancing

Escena procedural completa: ray casting multi-hit, instancing con POPs, materials con rimlight, bloom post-processing, y campos de fuerza. Basado en el patrón `POP_Ray_Scene`.

## Requisitos

- TouchDesigner (cualquier licencia con POPs)
- GPU con soporte instancing
- Conocimientos de POPs, materials y rendering

## Arquitectura del sistema

```
spherePOP (escena) → attributePOP (Cd, instance data)
    → mathcombinePOP (force fields)
    → rayPOP (multi-hit raycasting)
    → mathcombinePOP (modulo RayNumHits → inside mask)
    → lookuptexPOP (color mapping)
    → nullPOP (to instance)
    → geoCOMP (instancing enabled) → renderTOP
    → phongMAT (rimlight) → bloomTOP → output
```

## Paso 1: Generar geometría de escena

1. Crea un **sphere POP** (nómbralo `sphere1`)
   - Radius: `2`
   - Type: `Polygon`
   - Divisions: `32`
   - Esto es el objeto principal de la escena
2. Crea un **box POP** (nómbralo `box1`)
   - Size: `(1, 1, 1)`
   - Position: `(3, 0, 0)` — objeto secundario
3. Crea un **merge POP** (nómbralo `merge1`)
   - Conecta `sphere1` y `box1`
   - Esto combina ambos como superficie de colisión

## Paso 2: Generar rayos con instancing

1. Crea un **pointgen POP** (nómbralo `pointgen1`)
   - Total: `2000`
   - Type: `Random`
   - Domain: Box, Size `(8, 8, 8)`
   - Estos son los puntos que dispararán rayos
2. Crea un **attribute POP** (nómbralo `attribute1`)
   - Crear: `Cd` (Vector) → `(1.0, 1.0, 1.0)` — color base
   - Crear: `rayDir` (Vector) → `(0, -1, 0)` — dirección del rayo
   - Crear: `Scale` (Vector) → `(0.01, 0.01, 0.01)` — tamaño de instancia

## Paso 3: Campos de fuerza procedurales

1. Crea un **field POP** (nómbralo `field1`)
   - Type: `Noise`
   - Resolution: `(32, 32, 32)`
   - Amplitude: `0.5`
2. Crea un **field POP** (`field2`)
   - Type: `Sphere`
   - Center: `(0, 0, 0)`
   - Radius: `3`
3. Crea un **mathCombine POP** (`mathcombine_field`)
   - Operation: `A * B`
   - A: `field1`
   - B: `field2`
   - Output: `FieldWeight`
   - Esto crea un campo de influencia esférica con ruido
4. Crea un **mathCombine POP** (`mathcombine_apply_field`)
   - Conecta `attribute1` y `mathcombine_field`
   - Operation: `A + B * 0.3`
   - A: `Cd`
   - B: `FieldWeight`
   - Output: `Cd`
   - Esto aplica el campo como variación de color — puntos dentro del radio esférico se tiñen con el ruido

## Paso 4: Ray casting multi-hit

1. Crea un **ray POP** (nómbralo `ray1`)
   - Conecta `attribute1` como input 0
   - Conecta `merge1` como input 1 (geometría de colisión)
   - Operation: **`Hittest`**
   - Num Hits: **`3`** — permite múltiples rebotes
   - Detect Inside/Outside: **`On`**
   - Esto genera: `RayPosition`, `RayNormal`, `RayNumHits`, `RayInside`
2. Crea un **transform POP** (`transform1`)
   - Conecta `ray1`
   - Applies noise para variación: `(noise(time) * 0.1)`

## Paso 5: Máscara de inside/outside con módulo

1. Crea un **mathCombine POP** (`mathcombine_pair_odd`)
   - Operation: `A % B`
   - A: `RayNumHits`
   - B: `2`
   - Output: `InsideMask`
   - `RayNumHits % 2 == 1` → punto dentro de la geometría
2. Crea un **mathCombine POP** (`mathcombine_pair_odd2`)
   - Operation: `A % B`
   - A: `RayNumHits`
   - B: `2`
   - Output: `OutsideMask`
   - `RayNumHits % 2 == 0` → punto fuera de la geometría

## Paso 6: Color por hits

1. Crea un **lookupTex POP** (nómbralo `lookuptex1`)
   - Conecta `mathcombine_pair_odd`
   - Coordinate Type: `UV`
   - U Channel: `RayNumHits / 5.0` — normalizar hits
   - V Channel: `0.5`
   - Texture: un **ramp TOP** (`ramp1`) con degradado de color
2. Crea un **attribute POP** (`attribute_Cd`)
   - Rename: `Cd` → `Cd`
   - Aplica color mapeado desde lookupTex

## Paso 7: Instancing y rendering

1. Crea un **Geometry COMP** (`geo1`)
   - Instancing: **`On`**
   - Instance CHOP: `null_to_instance`
   - Instance Scale: `Scale`
   - Instance Rotate: `Rotation` (si existe)
2. Crea un **null POP** (`null_to_instance`)
   - Conecta después de `attribute_Cd`
   - Esto alimenta los datos de instancia al geoCOMP
3. Crea un **phong MAT** (`phong1`)
   - Apply to: `geo1`
   - Rim Light: **`On`**
   - Rim Light Intensity: `0.5`
   - Specular: `0.3`

## Paso 8: Render y post-processing

1. Crea un **render TOP** (`render1`)
   - Camera: `cam1`
   - Resolution: `1920x1080`
   - Conecta `geo1`
2. Crea un **bloom TOP** (`bloom1`)
   - Conecta `render1`
   - Intensity: `0.5`
   - Radius: `0.3`
   - Brightness: `1.2`
3. Conecta `bloom1` al output final

## Diagrama completo

```
sphere1 + box1 → merge1
                    ↑
pointgen1 → attribute1 → ray1 (multi-hit)
                          ↓
              mathcombine_pair_odd (InsideMask)
                          ↓
                lookuptex1 → attribute_Cd
                          ↓
                  null_to_instance → geo1 (instancing)
                                      ↓
                              phong1 → render1
                                      ↓
                                  bloom1 → output
```

## Parámetros de la escena

| Parámetro | Efecto | Rango típico |
|-----------|--------|--------------|
| `Num Hits` (ray) | Profundidad de rebotes | 1 - 10 |
| `Ray Direction` | Dirección de disparo | `(0,-1,0)`, `(1,0,0)`, random |
| `Instance Scale` | Tamaño de puntos | 0.001 - 0.1 |
| `Bloom Intensity` | Intensidad del glow | 0.1 - 2.0 |
| `Rim Light` | Borde iluminado | 0.0 - 1.0 |

## Variante: Escena con archivo externo

1. Crea un **filein COMP** o importa un **Alembic**
2. Conecta como input 1 del ray POP
3. Los rayos colisionarán con la geometría importada

## Variante: Campo de color por posición

1. Agrega un **noise TOP** (`noise1`)
2. Usa **lookupTex POP** con Position como UV
3. Mapea a color para texturización procedural

## Solución de problemas

- **Rayos no colisionan**: Verifica que `merge1` tenga geometría como input 1
- **Instancing no muestra puntos**: Revisa que `geo1` tenga instancing enabled
- **Color uniforme**: Verifica que `lookuptex1` tenga el ramp TOP conectado
- **Performance**: Reduce número de rayos o resolución de campos

## Consejos

- El parámetro `Num Hits` es clave para escenas con geometría compleja
- Usa **field POPs** para crear variación procedural en colores y fuerzas
- El **bloom TOP** agrega profundidad visual sin costo significativo
- Para performance, reduce la resolución de campos a 16x16x16
- Combina con **LFO CHOP** para animación procedural de campos
