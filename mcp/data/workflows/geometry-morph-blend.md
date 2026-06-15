---
title: "Morphing de Geometría con Phase Blending"
category: "pops"
difficulty: "advanced"
keywords: ["morph", "blend", "phase", "instancing", "copy", "attribute", "pops", "gpu"]
duration: "35 min"
requires_td: true
---

# Morphing de Geometría con Phase Blending

Crea un sistema de morphing entre geometrías usando GPU instancing, atributos de fase y blend proporcionales. Los puntos interpolan suavemente entre formas (box → sphere → torus) basado en un atributo `Phase` controlado por LFO.

Basado en el patrón PhasedBlending.

## Requisitos

- TouchDesigner (cualquier licencia con POPs)
- Conocimientos básicos de POPs, copy POP y atributos

## Arquitectura del sistema

```
sprinklePOP (puntos) → attributePOP (Shape, Phase)
    → phaserPOP (LFO → Phase)
    → lookupAttPOP1 (TemplateId → Phase)
    → lookupAttPOP2 (Phase → Blend)
    → sortPOP → copyPOP1 (box) ─┐
    → sortPOP → copyPOP2 (sphere)┤→ blendPOP → nullPOP
    → sortPOP → copyPOP3 (torus)─┘         ↓
                                     renderTOP
```

## Paso 1: Generar puntos de instancing

1. Crea un **sprinkle POP** (nómbralo `sprinkle1`)
   - Type: `Random`
   - Total: `200` (número de instancias)
   - Domain: Box, Size `(8, 8, 8)`
   - Si sprinkle POP no está disponible, usa **sphere SOP** con `Force Total = 200`

## Paso 2: Definir atributos de forma

1. Crea un **attribute POP** (nómbralo `attribute1`)
   - Conecta `sprinkle1`
   - Define atributo `Shape` (Integer):
     - `Shape = floor(rand(@id) * 3)` — asigna 0, 1 o 2 aleatoriamente
   - Define atributo `TemplateId` (Integer):
     - `TemplateId = @ptnum`

## Paso 3: Crear fuentes de geometría

1. Crea un **box POP** (nómbralo `box1`)
   - Size: `(0.5, 0.5, 0.5)`
2. Crea un **sphere POP** (nómbralo `sphere1`)
   - Radius: `0.3`
   - Type: `Polygon`
   - Divisions: `8`
3. Crea un **torus POP** (nómbralo `torus1`)
   - Radius: `0.3`
   - Radial Divisions: `8`

## Paso 4: Configurar copias por forma

1. Crea un **sort POP** (nómbralo `sort1`)
   - Conecta `attribute1`
   - Sort By: `Shape` (ordena por forma)
2. Crea un **copy POP** (nómbralo `copy1`)
   - Input 0: `box1` (template)
   - Input 1: `sort1` (positions)
   - Instance: `Points`
3. Crea otro **sort POP** (`sort2`)
   - Conecta `attribute1`
   - Sort By: `Shape` (misma ordenación)
4. Crea **copy POP** (`copy2`)
   - Input 0: `sphere1`
   - Input 1: `sort2`
5. Crea **sort POP** (`sort3`) y **copy POP** (`copy3`)
   - Para `torus1`

## Paso 5: Phase-based blending

1. Crea un **lfo CHOP** (nómbralo `lfo1`)
   - Type: `Triangle`
   - Frequency: `0.25`
   - Amplitude: `1`
2. Crea un **phaser POP** (nómbralo `phaser1`)
   - Conecta `lfo1`
   - Esto genera un atributo `Phase` que oscila entre 0 y 1
3. Crea un **lookupAtt POP** (nómbralo `lookupatt1`)
   - Lookup Attribute: `TemplateId`
   - Output Attribute: `Phase`
   - Mapea `TemplateId` a valores de `Phase`
4. Crea otro **lookupAtt POP** (`lookupatt2`)
   - Lookup Attribute: `Phase`
   - Output Attribute: `Blend`
   - Mapea `Phase` a peso de blend

## Paso 6: Mezclar geometrías

1. Crea un **blend POP** (nómbralo `blend1`)
   - Mode: **`Proportional Smoothed`**
   - Input 0: `copy1` (boxes)
   - Input 1: `copy2` (spheres)
   - Input 2: `copy3` (torus)
   - Blend Attribute: `Blend`
   - Esto interpola suavemente entre las 3 formas

## Paso 7: Renderizar

1. Crea un **Geometry COMP** (`geo1`)
   - Conecta `blend1`
2. Crea un **render TOP** (`render1`)
   - Resolution: `1280x720`
3. Crea un **phong MAT** (`phong1`)
   - Color: `(0.8, 0.3, 0.6)`

## Diagrama de flujo completo

```
sprinkle1 → attribute1 → sort1 → copy1 (box)    ─┐
              │          sort2 → copy2 (sphere)  ─┼→ blend1 → geo1 → render1
              │          sort3 → copy3 (torus)   ─┘
              │
              └→ phaser1 ← lfo1
                    ↓
              lookupatt1 (TemplateId → Phase)
                    ↓
              lookupatt2 (Phase → Blend)
```

## Parámetros de animación

| Parámetro | Efecto | Rango |
|-----------|--------|-------|
| `lfo1.Frequency` | Velocidad del morph | 0.05 - 2.0 |
| `lfo1.Type` | Forma de onda | Triangle, Sine, Ramp |
| `blend1.Mode` | Tipo de interpolación | Proportional, Linear |
| `sprinkle1.Total` | Número de instancias | 50 - 1000 |

## Variante: Morph por distancia

1. En lugar de LFO, usa la distancia al centro como driver:
   - `Phase = length(@P) / 5.0`
2. Los puntos cercanos al centro muestran forma 0, los lejanos forma 2
3. Crea un efecto de "onda de morph" que se expande

## Variante: Morph por color

1. Mapea `Cd.r` a `Phase` usando lookupAtt
2. Puntos rojos = box, verdes = sphere, azules = torus
3. Cambia el color del source para cambiar las formas

## Solución de problemas

- **Blend no funciona**: Verifica que los 3 copy POPs tengan el mismo número de puntos
- **Formas no aparecen**: Revisa que `Shape` attribute esté definido correctamente
- **Phase no oscila**: Verifica que `lfo1` esté activo y `phaser1` reciba input
- **Performance**: Reduce total de instancias o simplifica geometrías template

## Consejos

- El **blend POP** con `Proportional Smoothed` da los resultados más suaves
- Usa **sort POP** para asegurar que los puntos coincidan entre formas
- Combina con **audio CHOP** para morph reactivo a sonido
- Añade **noise POP** al Phase para variación orgánica
- Para 4+ formas, añade más copy+sort chains y extiende el blend
