---
title: "Aberración Cromática"
category: "effects"
difficulty: "beginner"
keywords: ["chromatic", "aberration", "rgb", "split", "glitch", "top", "displace"]
duration: "5 min"
requires_td: false
---

# Aberración Cromática

Simula el efecto de lente conocido como aberración cromática separando los canales RGB.

## Network Setup

```
[Source TOP] → [RGB Split TOP] → [Composite TOP] → [Output TOP]
```

## Parámetros

**RGB Split TOP:**
- Red Offset X: `0.01`
- Red Offset Y: `0`
- Green Offset X: `0`
- Green Offset Y: `0`
- Blue Offset X: `-0.01`
- Blue Offset Y: `0`

**Composite TOP (opcional post):**
- Operation: `Over`
- Para mezclar con original si el split es muy fuerte

## Variantes
- Anima los offsets con LFO para efecto vibrante
- **RGB Split → Displace TOP** para aberración con distorsión
- Usa solo Red y Blue para efecto anáglifo 3D
- Combina con **Blur TOP** para aberración con desenfoque cromático
