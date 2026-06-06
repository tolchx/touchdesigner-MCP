---
title: "Screen y Add"
category: "composite"
difficulty: "beginner"
keywords: ["screen", "add", "blend", "bright", "lighten", "top", "composite"]
duration: "5 min"
requires_td: false
---

# Screen y Add

Modos de mezcla Screen y Add para combinar capas iluminándolas o sumando su brillo.

## Network Setup

```
[Layer A TOP] → [Composite TOP] → [Output TOP]
                    ↑
[Layer B TOP] ──────┘
```

## Parámetros

**Composite TOP:**

| Modo | Operación | Efecto |
|------|-----------|--------|
| `Screen` | 1 - (1-A) × (1-B) | Ilumina, mezcla suave |
| `Add` | A + B | Suma directa de brillo |

**Screen (ejemplo):**
- Capas complementarias que se iluminan mutuamente
- Bueno para: flares de luz, partículas brillantes sobre fondo oscuro
- Opacity: `0.7`

**Add (ejemplo):**
- Capas se suman — puede llegar a blanco puro
- Bueno para: feedback loops, glows intensos
- Opacity: `0.5`

## Variantes
- Screen para combinar capas de video manteniendo brillo
- Add para partículas y destellos sobre cualquier fondo
- **Level TOP** pre-composite para controlar cuánto aporta cada capa
- Screen + Add combinados en composiciones multi-capa
