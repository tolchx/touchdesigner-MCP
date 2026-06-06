---
title: "Mapa de Desplazamiento"
category: "effects"
difficulty: "intermediate"
keywords: ["displace", "displacement", "map", "distortion", "top", "normal"]
duration: "7 min"
requires_td: false
---

# Mapa de Desplazamiento

Usa mapas de desplazamiento (displacement maps) para distorsionar imágenes basándose en texturas o ruido.

## Network Setup

```
[Source TOP] → [Displace TOP] → [Output TOP]
                    ↑
          [Displacement Map TOP]
```

## Parámetros

**Displacement Map TOP:**
- Crea un **Noise TOP** como mapa:
  - Type: `Perlin`
  - Resolution: `1920 x 1080`

**Displace TOP:**
- Displace Type: `Directional`
- Amount: `0.05`
- Angle: `0`

## Variantes
- Usa un video como mapa de desplazamiento para distorsión animada
- **Audio Spectrum CHOP** → CHOP To TOP → Displace Amount
- **Ramp TOP** como mapa para efecto de vidrio esmerilado
- Múltiples Displace TOP en serie para distorsiones complejas
