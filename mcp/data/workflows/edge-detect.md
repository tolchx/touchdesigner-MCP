---
title: "Detección de Bordes (Edge Detect)"
category: "analyze"
difficulty: "beginner"
keywords: ["edge", "detection", "sobel", "contour", "border", "analyze"]
duration: "5 min"
requires_td: false
---

# Detección de Bordes (Edge Detect)

Extrae los contornos y bordes de una imagen para efectos estilizados o análisis.

## Network Setup

```
[Source TOP] → [Edge TOP] → [Level TOP] → [Output TOP]
```

## Parámetros

**Edge TOP:**
- Channel: `RGB` (o Luma para blanco y negro)
- Method: `Sobel` (mejor calidad) o `Prewitt` (más rápido)
- Direction: `Both` (horizontal y vertical)
- Threshold: `0.1` (sensibilidad)
- Invert: `Off`

**Level TOP (post-proceso):**
- Pre: `0.0`
- Post: `1.0`
- Gamma: `0.8` (para resaltar bordes tenues)

## Variantes

### Bordes de color
```
Source → Edge → [Composite TOP (Add)] → Output
                  ↑
              Source (original)
```

### Glow sobre bordes
```
Edge → [Blur TOP] → [Composite TOP (Screen)] → Output
                         ↑
                     Source
```

### Animado audio-reactivo
Usa un **Audio CHOP** para modular el Threshold del Edge TOP.
