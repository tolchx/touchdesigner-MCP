---
title: "Caleidoscopio Avanzado"
category: "transform"
difficulty: "intermediate"
keywords: ["kaleidoscope", "mirror", "symmetry", "pattern", "complex", "top"]
duration: "7 min"
requires_td: false
---

# Caleidoscopio Avanzado

Patrones de caleidoscopio avanzados con múltiples etapas y modulación de audio.

## Network Setup

```
[Source TOP] → [Kaleidoscope TOP] → [Mirror TOP] → [Composite TOP] → [Output TOP]
                                                    ↑
                         [Kaleidoscope TOP (2)] ─────┘
```

## Parámetros

**Kaleidoscope TOP (principal):**
- Sides: `6`
- Angle: animado con LFO (0.1 Hz)
- Center: `(0.5, 0.5)`
- Zoom: `1.0`

**Mirror TOP:**
- Mirror Type: `Both` (duplica el caleidoscopio)

**Kaleidoscope TOP (secundario):**
- Sides: `8`
- Angle: `45` (offset fijo)
- Center: `(0.3, 0.3)` (desplazado para superposición)

**Composite TOP:**
- Operation: `Screen`

## Variantes
- **HSV Adjust TOP** entre stages para cambios de color
- Audio-reactivo: Sides controlado por audio_bass
- **Displace TOP** después para glitch kaleidoscópico
- **Level TOP** post para contraste extremo
