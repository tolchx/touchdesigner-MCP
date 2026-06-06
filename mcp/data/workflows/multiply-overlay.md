---
title: "Multiply y Overlay"
category: "composite"
difficulty: "beginner"
keywords: ["multiply", "overlay", "blend", "composite", "contrast", "top"]
duration: "5 min"
requires_td: false
---

# Multiply y Overlay

Usa los modos de mezcla Multiply y Overlay para añadir textura y contraste a tus composiciones.

## Network Setup

```
[Base TOP] → [Composite TOP] → [Output TOP]
                  ↑
[Texture TOP] ────┘
```

## Parámetros

**Base TOP:**
- Video, imagen o gráfico principal

**Texture TOP (overlay/multiply):**
- Textura, ruido, grano o patrón

**Composite TOP:**

| Modo | Operación | Efecto |
|------|-----------|--------|
| `Multiply` | A × B | Oscurece con la textura |
| `Overlay` | A × (A + 2B × (1-A)) | Contraste, respeta tonos medios |

**Ejemplo con Overlay:**
- Texture: **Noise TOP** (Gaussian, Amplitude 0.3)
- Resultado: textura de grano con contraste preservado

**Ejemplo con Multiply:**
- Texture: **Ramp TOP** (radial, blanco-centro a negro-bordes)
- Resultado: viñeta natural

## Variantes
- **Level TOP** antes del Composite para controlar intensidad
- **HSV Adjust TOP** en la textura para overlay de color
- Anima Opacity del Composite para fade del efecto
