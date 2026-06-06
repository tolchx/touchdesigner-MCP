---
title: "Efecto Glitch Digital"
category: "effects"
difficulty: "intermediate"
keywords: ["glitch", "digital", "error", "corruption", "top", "displace", "shift"]
duration: "10 min"
requires_td: false
---

# Efecto Glitch Digital

Crea efectos de glitch digital combinando desplazamiento de canales, corrupción de datos y ruido.

## Network Setup

```
[Source TOP] → [RGB Split TOP] → [Displace TOP] → [Composite TOP] → [Output TOP]
                                                      ↑
                              [Noise TOP (glitch)] ───┘
```

## Parámetros

**RGB Split TOP:**
- Red Offset: `(0.005, 0)` animado aleatoriamente
- Blue Offset: `(-0.005, 0)` animado aleatoriamente

**Displace TOP:**
- Displace Type: `Directional`
- Amount: animado con **Square CHOP** (pulsos de glitch)

**Noise TOP (glitch lines):**
- Type: `Gaussian`
- Amplitude: `0.3`
- Anima con **LFO CHOP** para líneas de glitch intermitentes

**Composite TOP:**
- Operation: `Overlay`
- Opacity: `0.4`

## Variantes
- **Switch TOP** para alternar entre señal limpia y glitch con un pulso
- **Displace TOP** con Amount controlado por audio para glitch reactivo
- Añade **Trail TOP** para estela de glitch
- **GLSL TOP** para patrones de corrupción de datos personalizados
