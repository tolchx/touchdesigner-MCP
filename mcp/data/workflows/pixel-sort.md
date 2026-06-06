---
title: "Pixel Sorting Glitch Effect"
category: "effects"
difficulty: "advanced"
keywords: ["pixel", "sort", "glitch", "glitch", "top", "sorting"]
duration: "12 min"
requires_td: false
---

# Pixel Sorting Glitch Effect

Crea el popular efecto glitch de pixel sorting usando GLSL TOP y técnicas de procesamiento de imágenes.

## Network Setup

```
[Source TOP] → [GLSL TOP] → [Output TOP]
```

## Parámetros

**GLSL TOP (pixel sort shader):**
- Uniform `u_direction`: `0` (horizontal), `1` (vertical)
- Uniform `u_threshold_low`: `0.1` (píxeles más oscuros que esto se ordenan)
- Uniform `u_threshold_high`: `0.9` (píxeles más brillantes que esto se ordenan)
- Uniform `u_sort_mode`: `0` (luminancia), `1` (rojo), `2` (verde), `3` (azul)

## Variantes
- Combina con **Displace TOP** para glitch adicional
- Anima el threshold con LFO para efecto pulsante
- Alterna entre horizontal y vertical frame a frame
- Aplica solo a regiones específicas con una máscara
