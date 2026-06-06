---
title: "Warp y Distorsión"
category: "transform"
difficulty: "intermediate"
keywords: ["warp", "distortion", "deform", "top", "displace", "mesh"]
duration: "7 min"
requires_td: false
---

# Warp y Distorsión

Deforma imágenes usando técnicas de warp con Displace TOP y Ramp TOP para distorsiones personalizadas.

## Network Setup

```
[Source TOP] → [Displace TOP] → [Output TOP]
                    ↑
          [Ramp TOP (warp map)]
```

## Parámetros

**Ramp TOP (mapa de warp):**
- Type: `Linear` o `Radial`
- Start Color: `(0.5, 0.5, 0)` (neutro)
- End Color: `(1.0, 0.0, 0)` (rojo = desplazamiento X)
- Crea canal verde separado para desplazamiento Y

**Displace TOP:**
- Displace Type: `UV`
- Displace X: canal rojo del Ramp
- Displace Y: canal verde del Ramp
- Amount: `0.1`

## Variantes
- **Noise TOP** como mapa para distorsión orgánica
- **Video** como mapa para warp animado
- Múltiples **Displace TOP** en serie para warps complejos
- Anima Amount con audio para warp reactivo
