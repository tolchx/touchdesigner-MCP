---
title: "Efecto Viñeta"
category: "effects"
difficulty: "beginner"
keywords: ["vignette", "darken", "edges", "top", "composite", "overlay"]
duration: "5 min"
requires_td: false
---

# Efecto Viñeta

Añade oscurecimiento en los bordes de la imagen para un look más cinematográfico.

## Network Setup

```
[Source TOP] → [Composite TOP] → [Output TOP]
                    ↑
          [Vignette Mask TOP]
```

## Parámetros

**Vignette Mask (creada con Ramp TOP + Circle TOP):**
1. Crea un **Ramp TOP**:
   - Type: `Radial`
   - Start Color: blanco (centro)
   - End Color: negro (bordes)
2. Conecta un **Level TOP** para ajustar:
   - Pre: `0.3` (quita gris del centro)
   - Post: `1.0`

**Composite TOP:**
- Operation: `Multiply`
- Source A: video original
- Source B: máscara de viñeta
- Opacity: `1.0`

## Variantes
- Viñeta de color: usa un **Constant TOP** de color en vez de negro
- Viñeta animada: modula el Level Pre con LFO para viñeta pulsante
- Viñeta rectangular: usa un **Rectangle TOP** con blur en vez de Ramp radial
