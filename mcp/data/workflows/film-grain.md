---
title: "Grano de Película"
category: "effects"
difficulty: "beginner"
keywords: ["film", "grain", "noise", "texture", "top", "analog"]
duration: "5 min"
requires_td: false
---

# Grano de Película

Añade grano de película analógica a cualquier imagen o video para textura cinematográfica.

## Network Setup

```
[Source TOP] → [Composite TOP] → [Output TOP]
                    ↑
          [Noise TOP (grain)]
```

## Parámetros

**Noise TOP:**
- Type: `Gaussian`
- Amplitude: `0.05`
- Resolution: igual que el source
- Seed: animado con Time CHOP para grano variable

**Composite TOP:**
- Operation: `Overlay` o `Add`
- Source A: video original
- Source B: noise/grain
- Opacity: `0.3`

## Variantes
- Grano de color: activa colores en Noise TOP, usa Screen mode
- Grano direccional: combina con **Blur TOP (Directional)** para grano estirado
- **Level TOP** en el noise para controlar contraste del grano
- Anima Amplitude con audio para grano reactivo
