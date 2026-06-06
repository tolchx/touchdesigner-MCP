---
title: "Corrección de Color con Level + Lookup"
category: "color"
difficulty: "beginner"
keywords: ["color", "correction", "level", "lookup", "lut", "grade"]
duration: "5 min"
requires_td: false
---

# Corrección de Color con Level + Lookup

Ajusta el rango dinámico y aplica curvas de color personalizadas.

## Network Setup

```
[Movie In TOP] → [Level TOP] → [Lookup TOP] → [Output TOP]
```

## Parámetros

**Level TOP:**
- Pre: `0.05` (recortar negros)
- Post: `0.95` (recortar blancos)
- Gain: `1.2` (contraste extra)

**Lookup TOP:**
- Load un archivo .cube (LUT) o usa los presets incorporados
- Intensity: `0.8`

## Variantes
- Reemplaza Level con **HSV Adjust TOP** para cambios de tono
- Usa **Math TOP** con operación `Gamma` para ajuste fino
- Cadena completa: Level → HSV Adjust → Lookup → Grade TOP
