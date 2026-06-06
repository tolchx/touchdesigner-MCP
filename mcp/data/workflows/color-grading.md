---
title: "Color Grading Profesional"
category: "effects"
difficulty: "intermediate"
keywords: ["color", "grading", "grade", "lut", "lookup", "cinematic", "top"]
duration: "8 min"
requires_td: false
---

# Color Grading Profesional

Cadena completa de color grading profesional usando Level, HSV, Lookup y Grade TOPs.

## Network Setup

```
[Source TOP] → [Level TOP] → [HSV Adjust TOP] → [Lookup TOP] → [Grade TOP] → [Output TOP]
```

## Parámetros

**Level TOP (corrección primaria):**
- Pre: `0.02` (recortar negros)
- Post: `0.98` (recortar blancos)
- Gamma: `1.0`

**HSV Adjust TOP (color creativo):**
- Hue Shift: `0` (o valor creativo)
- Saturation: `1.1`
- Value: `1.0`
- Contrast: `1.1`

**Lookup TOP (LUT):**
- Load archivo .cube o usa preset incorporado
- Intensity: `0.6`

**Grade TOP (gradación final):**
- Lift: `(0.02, 0.01, 0.03)` — tinte en sombras
- Gamma: `(1.0, 0.97, 1.03)` — corrección de medios
- Gain: `(1.0, 1.0, 1.0)` — balance de blancos

## Variantes
- Guarda configuración como preset para reutilizar
- Intercambia Lookup TOP por **Ramp TOP** para LUT personalizado
- Añade **Blur TOP** sutil antes del grading para look soft
