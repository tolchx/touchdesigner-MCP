---
title: "Zoom Blur Cinemático"
category: "transform"
difficulty: "intermediate"
keywords: ["zoom", "blur", "cinematic", "radial", "top", "transform"]
duration: "7 min"
requires_td: false
---

# Zoom Blur Cinemático

Crea un efecto de zoom blur que simula el movimiento rápido del lente hacia el centro de la imagen.

## Network Setup

```
[Source TOP] → [Transform TOP] → [Composite TOP] → [Blur TOP (Radial)] → [Output TOP]
                                     ↑
           [Source TOP (original)] ───┘
```

## Parámetros

**Transform TOP (capa zoom):**
- Scale X/Y: `1.3` (escala mayor para crear desenfoque)
- Center: `(0.5, 0.5)`

**Blur TOP (Radial):**
- Type: `Radial`
- Radius: `0.05`
- Center: `(0.5, 0.5)`

**Composite TOP:**
- Operation: `Screen` o `Over`
- Source A: original
- Source B: zoom + blur
- Opacity: `0.7`

## Variantes
- Anima Scale con un pulso (trigger) para impacto dramático
- **Audio reactivo**: audio_peak controla Scale
- Mueve el center dinámicamente para zoom hacia un punto específico
- Combina con **Level TOP** para variar brillo durante el zoom
