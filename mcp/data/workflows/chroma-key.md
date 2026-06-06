---
title: "Chroma Key con Keying TOP"
category: "keying"
difficulty: "intermediate"
keywords: ["chroma", "key", "greenscreen", "keying", "composite"]
duration: "10 min"
requires_td: false
---

# Chroma Key con Keying TOP

Recorta un fondo de color sólido (green screen / blue screen).

## Network Setup

```
[Source TOP] ──→ [Keying TOP] ──→ [Composite TOP] ──→ [Output TOP]
                      ↑                    ↑
[Background TOP] ─────┘                    │
[New Background TOP] ──────────────────────┘
```

## Parámetros

**Keying TOP:**
- Key Color: `(0, 1, 0)` (verde chroma)
- Tolerance: `0.15`
- Softness: `0.05`
- Edge Thinning: `0.3`
- Spill Suppression: `0.5`
- Output: `Matte` (para ver la máscara) o `Premultiplied`

**Composite TOP:**
- Method: `Over`
- Conecta el Keying (premultiplied) al input 1
- Conecta el nuevo fondo al input 0

## Ajustes
- Aumenta Tolerance si queda borde verde
- Edge Thinning > 0.5 para pelos/cabello
- Spill Suppression quita el reflejo verde de los bordes
- Usa **Level TOP** en la máscara para recortar bordes duros
