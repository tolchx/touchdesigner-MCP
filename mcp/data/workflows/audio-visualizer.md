---
title: "Visualizador de Audio con AudioSpectrum"
category: "audio"
difficulty: "intermediate"
keywords: ["audio", "spectrum", "visualizer", "bars", "reactive"]
duration: "10 min"
requires_td: false
---

# Visualizador de Audio con AudioSpectrum

Crea un visualizador de barras de espectro de audio en tiempo real.

## Network Setup

```
[Audio In CHOP] → [Audio Spectrum CHOP] → [Math CHOP] → [CHOP to TOP] → [Output]

                                              ↓
                                    [OP Viewer TOP]
```

## Parámetros

**Audio File In CHOP / Audio Device In CHOP:**
- Source: archivo o dispositivo

**Audio Spectrum CHOP:**
- Scope: `0-100` (rango de frecuencias)
- Gain: `10`
- Output: `Magnitude`

**Math CHOP:**
- Operation: `Range`
- From Range: `0.0 - 1.0`
- To Range: `0.0 - 1.0`

**CHOP to TOP:**
- Resolution: `1024 x 512`
- Row/Column Mode
- Channel Swap: según preferencia

## Variantes
- Usa **Audio Band EQ CHOP** para menos bandas (4-8)
- Conecta bandas individuales a **Transform TOP** para animaciones específicas
- Usa **Trail CHOP** para suavizar la respuesta
- Render con **Geometry COMP** para barras 3D
