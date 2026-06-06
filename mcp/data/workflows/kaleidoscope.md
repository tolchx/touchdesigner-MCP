---
title: "Efecto Caleidoscopio"
category: "transform"
difficulty: "beginner"
keywords: ["kaleidoscope", "mirror", "symmetry", "pattern", "top"]
duration: "5 min"
requires_td: false
---

# Efecto Caleidoscopio

Transforma cualquier imagen en patrones simétricos de caleidoscopio.

## Network Setup

```
[Source TOP] → [Kaleidoscope TOP] → [Output TOP]
```

## Parámetros

**Kaleidoscope TOP:**
- Sides: `8` (número de segmentos)
- Angle: `0` (rotación inicial)
- Center X: `0.5` (centro del caleidoscopio)
- Center Y: `0.5`
- Mirror: `On` (alternar reflejo)
- Zoom: `1.0` (acercamiento)

## Controles interactivos
- Sides: 3-12 para diferentes patrones
- Angle animado con **LFO CHOP** para rotación continua
- Center X/Y animados para movimiento fluido
- Zoom > 1 para detalles ampliados

## Variantes
- **Pre-procesa** con **Level TOP** para variar brillo
- **Post-procesa** con **HSV Adjust TOP** para colores cambiantes
- **Multi-capa**: dos Kaleidoscope mezclados con Composite
