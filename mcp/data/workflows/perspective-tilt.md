---
title: "Perspectiva y Tilt-Shift"
category: "transform"
difficulty: "intermediate"
keywords: ["perspective", "tilt", "shift", "depth", "blur", "top", "transform"]
duration: "8 min"
requires_td: false
---

# Perspectiva y Tilt-Shift

Crea el efecto tilt-shift (maqueta en miniatura) combinando perspectiva y desenfoque gradual.

## Network Setup

```
[Source TOP] → [Transform TOP] → [Composite TOP] → [Output TOP]
                    ↑                  ↑
           [Blur TOP (gradient)] ──────┘
```

## Parámetros

**Transform TOP (perspectiva):**
- Rotate X: `-30` (inclinación de plano)
- Rotate Y: `0`
- Rotate Z: `0`
- Scale: `1.2`
- Center: `(0.5, 0.5)`

**Blur TOP (gradient mask):**
- Type: `Gaussian`
- Radius: `0.03`
- Enmascarado con **Ramp TOP** lineal (vertical)
  - Ramp TOP: Start=blanco (centro), End=negro (arriba y abajo)

**Composite TOP:**
- Operation: `Over`
- Mezcla la versión con blur (bordes) y sin blur (centro)

## Variantes
- Invierte la máscara para blur en el centro, nítido en bordes
- Usa **Level TOP** para aumentar contraste del tilt-shift
- Perspectiva extrema para efectos psicodélicos
