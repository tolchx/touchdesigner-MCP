---
title: "Glow y Bloom Avanzado"
category: "effects"
difficulty: "intermediate"
keywords: ["glow", "bloom", "light", "top", "composite", "blur"]
duration: "8 min"
requires_td: false
---

# Glow y Bloom Avanzado

Crea efectos de glow y bloom cinematográficos combinando blur, level y modos de mezcla.

## Network Setup

```
[Source TOP] → [Level TOP] → [Blur TOP] → [Composite TOP] → [Output TOP]
                                              ↑
                   [Source TOP (original)] ───┘
```

## Parámetros

**Level TOP (high-pass):**
- Pre: `0.6` (solo las áreas más brillantes pasan)
- Post: `1.0`

**Blur TOP (glow):**
- Type: `Gaussian`
- Radius: `0.03` (tamaño del glow)
- Combine: `RGBA`

**Composite TOP:**
- Operation: `Add` o `Screen`
- Source A: glow
- Source B: original
- Opacity: `0.6`

## Variantes
- Multi-capa: 2-3 blurs con diferentes radios para glow realista
- **HSV Adjust TOP** antes del blur para glow de colores
- Anima Level Pre con LFO para glow pulsante
- Usa **Displace TOP** en el glow para efecto neón orgánico
