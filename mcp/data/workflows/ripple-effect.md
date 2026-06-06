---
title: "Efecto Ripple / Ondas"
category: "transform"
difficulty: "beginner"
keywords: ["ripple", "wave", "water", "distortion", "top", "displace"]
duration: "5 min"
requires_td: false
---

# Efecto Ripple / Ondas

Simula ondas y ripples de agua en cualquier imagen o video.

## Network Setup

```
[Source TOP] → [Displace TOP] → [Output TOP]
                    ↑
          [Ramp TOP (radial ripple)]
```

## Parámetros

**Ramp TOP (mapa de ripple):**
- Type: `Radial`
- Start Color: `(0.5, 0.5, 0)` (neutro en centro)
- End Color: `(1.0, 1.0, 0)` (desplazamiento en bordes)
- Conéctalo a un **Displace TOP** primario para animación

**Displace TOP:**
- Displace Type: `UV`
- Amount: animado con **LFO CHOP** (onda sinusoidal)
- Frecuencia del LFO: `2` Hz (velocidad de onda)

## Variantes
- Múltiples ripples con diferentes centros
- **Audio reactivo**: Amount controlado por audio_peak
- **Composite TOP** con Over para mezclar original + ripple
- **Blur TOP** después para suavizar ondas
