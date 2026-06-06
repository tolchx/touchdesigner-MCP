---
title: "Motion Blur con TimeBlur TOP"
category: "blur"
difficulty: "beginner"
keywords: ["motion", "blur", "timeblur", "movement", "trails"]
duration: "5 min"
requires_td: false
---

# Motion Blur con TimeBlur TOP

Agrega desenfoque de movimiento a contenido animado.

## Network Setup

```
[Animating Source TOP] → [TimeBlur TOP] → [Output TOP]
```

## Parámetros

**TimeBlur TOP:**
- Time Slice: `0.5` (cuánto tiempo atrás mirar)
- Interval: `3` (frames entre muestras)
- Blur Type: `Gaussian`
- Op Mode: `Maximum` (para estelas) o `Average` (para blur suave)
- Shutter: `0.5`

## Tips
- Más Interval = estelas más definidas pero menos suaves
- Time Slice > 1.0 = colas más largas
- Combina con **Transform TOP** animado para mejor efecto
- Usa **LFO CHOP** para modular el shutter
