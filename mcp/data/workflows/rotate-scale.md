---
title: "Rotación y Escala Animada"
category: "transform"
difficulty: "beginner"
keywords: ["rotate", "scale", "animation", "transform", "top", "lfo"]
duration: "5 min"
requires_td: false
---

# Rotación y Escala Animada

Anima rotación y escala de cualquier imagen con control preciso usando LFOs y expresiones.

## Network Setup

```
[Source TOP] → [Transform TOP] → [Output TOP]
                    ↑
              [LFO CHOP] (controls)
```

## Parámetros

**Transform TOP (animado):**
- Rotate: enlazado a LFO_CHOP
- Scale X: enlazado a segundo LFO_CHOP
- Scale Y: enlazado al mismo LFO que Scale X (o independiente)
- Center: `(0.5, 0.5)`
- Pix Blur: `0` (desactivado, o `1` para blur al rotar)

**LFO CHOP (rotación):**
- Type: `Sine`
- Frequency: `0.5` Hz
- Amplitude: `360` (rotación completa)

**LFO CHOP (escala):**
- Type: `Triangle`
- Frequency: `0.3` Hz
- Amplitude: `0.5`
- Offset: `1.0` (escala base)

## Variantes
- **Count CHOP** para rotación incremental continua
- Diferentes centros de rotación para órbitas
- **Composite TOP** con múltiples capas rotando a diferentes velocidades
- Audio-reactivo: frecuencia sincronizada con BPM
