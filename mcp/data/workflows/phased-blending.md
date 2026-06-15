---
title: "Morfado de Geometría por Fases"
category: "pops"
difficulty: "advanced"
keywords: ["phaser", "blend", "morph", "instancing", "gpu", "shape", "interpolation", "phase", "geometry"]
duration: "40 min"
requires_td: true
---

# Morfado de Geometría por Fases (Phased Blending)

Sistema de morphing entre formas 3D usando un operador Phaser para distribuir fases y un Blend POP para interpolar entre geometrías, con instancing GPU.

## Concepto

Cada instancia tiene una fase (0-1) que determina en qué punto del ciclo de morph se encuentra. El sistema permite transiciones suaves y continuas entre múltiples formas geométricas sin necesidad de keyframes.

```
Template Geometries (Sphere, Torus, Box)
    ↓
Phaser POP (Phase per instance via TemplateID)
    ↓
LookupAtt POP (Phase → Blend weight)
    ↓
Blend POP (interpolate between shapes by Blend weight)
    ↓
Copy POP (GPU instance by positions)
    ↓
Render TOP
```

## Operadores Principales

| Operador | Tipo | Función |
|----------|------|---------|
| `phaser1` | Phaser POP | Distribuye fase por TemplateID |
| `blend1` | Blend POP | Interpola entre geometrías |
| `lookupatt1-3` | LookupAtt POP | Mapea Phase → Blend weight |
| `attribute1` | Attribute POP | Crea atributo Shape por instancia |
| `copy1-4` | Copy POP | GPU instancing por TemplateID |
| `random1` | Random POP | Asigna Shape aleatoria por instancia |

## Red de Operadores

```
sphere1 (template 0) ──┐
torus1  (template 1) ──┼── mergePOP → attribute1 (Shape)
box1    (template 2) ──┘
                            ↓
                      random1 (Shape = uniform discrete)
                            ↓
                      phaser1 (Phase = LFO driven, scope = TemplateID)
                            ↓
                      lookupatt1 (Phase → Blend index)
                            ↓
                      blend1 (blendtype = proportionalsmoothed)
                            ↓
                      copy1 (instance by TemplateID)
                            ↓
                      null_output → render
```

## Paso a Paso

### 1. Crear Formas Base

1. Crea un **spherePOP** (`sphere1`) — radio 0.3
2. Crea un **torusPOP** (`torus1`) — radio mayor 0.3, menor 0.1
3. Crea un **boxPOP** (`box1`) — tamaño (0.3, 0.3, 0.3)
4. Conecta todos a un **mergePOP** (`merge1`)

### 2. Asignar Shape por Instancia

1. Crea un **attributePOP** (`attribute1`)
   - Create new attribute: `Shape`
   - Num components: `2`
   - Esto crea un atributo `vec2 Shape` por instancia
2. Crea un **randomPOP** (`random1`)
   - Conecta a `attribute1`
   - Attribute: `Shape`
   - Type: `Uniform Discrete`
   - Range: `0-N` (donde N = número de formas)
3. Esto asigna a cada instancia una forma base

### 3. Distribuir Fase con Phaser

1. Crea un **phaserPOP** (`phaser1`)
   - Phase Attribute Scope: `TemplateID`
   - Phase: drive desde un LFO o `me.time.seconds * 0.1`
   - Esto da a cada instancia una fase diferente en el ciclo
2. El Phaser emite un atributo `Phase` (0-1) por instancia

### 4. Mapear Phase a Blend Weight

1. Crea un **lookupattPOP** (`lookupatt1`)
   - Source attribute: `Phase`
   - Index attribute: `TemplateID`
   - Esto mapea la fase al peso de blend correcto
2. El resultado es un atributo `Blend` que controla cuánto morph entre formas

### 5. Blend entre Formas

1. Crea un **blendPOP** (`blend1`)
   - Blend Type: `Proportional Smoothed`
   - Point Weight: drive desde atributo `Blend`
   - Point Attribute Scope: `!Shape` (blend todo excepto Shape)
   - Esto interpola suavemente entre las geometrías según el peso

### 6. GPU Instancing

1. Crea un **copyPOP** (`copy1`)
   - Template ID: `TemplateID`
   - Instance Forward: drive desde `posy` (o posición deseada)
   - Esto instancia la geometría blended a las posiciones deseadas
2. Conecta a **nullPOP** → **renderTOP**

## Parámetros Clave

| Parámetro | Valor | Descripción |
|-----------|-------|-------------|
| `phaser1/phase` | `me.time.seconds * 0.1` | Velocidad del ciclo de morph |
| `blend1/blendtype` | `proportionalSmoothed` | Tipo de interpolación |
| `blend1/pointweight` | `@Blend` | Peso de blend por instancia |
| `attribute1/components` | `2` | Dimensiones del atributo Shape |
| `random1/type` | `uniform discrete` | Distribución de formas |

## Variaciones

- **Morph manual**: reemplaza LFO por un CHOP custom para control manual
- **Morph por proximidad**: usa `distance()` al cursor para blend gradual
- **Multi-shape**: aumenta el rango de `random1` y añade más formas al merge
- **Easing**: usa `mathmixPOP` con curves custom para easing entre formas

## Notas

- El `phaser1` distribuye fases usando `TemplateID` como scope — cada instancia tiene su propia fase
- El `blend1` con `proportionalSmoothed` produce transiciones más naturales que lineales
- Para más formas, solo añade otro template geometry al merge y ajusta el rango de random
