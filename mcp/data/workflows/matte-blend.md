---
title: "Matte Blending"
category: "composite"
difficulty: "advanced"
keywords: ["matte", "blend", "alpha", "edge", "composite", "key", "top"]
duration: "10 min"
requires_td: false
---

# Matte Blending

Técnicas avanzadas de blending usando mattes y canales alpha para composiciones profesionales.

## Network Setup

```
[Foreground TOP] → [Composite TOP] → [Output TOP]
                        ↑              ↑
[Background TOP] ───────┤       [Matte Refine]
                        ↑
                [Matte Source TOP] ────┘
```

## Parámetros

**Matte Source (creación de matte):**
- **Key TOP** para chroma/luma key
- **Ramp TOP** para gradientes
- **Circle/Rectangle TOP** para formas

**Composite TOP (matte blending):**
- Operation: `Over`
- Mask: conectado al matte refinado
- Pre-Multiply: activado si el foreground está pre-multiplicado

**Matte Refine (con Matte TOP):**
- Erode/Dilate: `1` (expandir/shrink matte)
- Blur: `2` (suavizar bordes)
- Gamma: `0.8` (endurecer transición)

## Técnicas avanzadas
- **Edge Light Wrap**: usa el matte + Blur para crear halo alrededor del sujeto
- **Matte invertido**: combina con Level (Invert) para capa complementaria
- **Multiple mattes**: combínalos con Composite (Multiply) para máscaras complejas
