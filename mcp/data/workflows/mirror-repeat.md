---
title: "Espejo y Repetición"
category: "transform"
difficulty: "beginner"
keywords: ["mirror", "repeat", "symmetry", "pattern", "top", "transform", "tile"]
duration: "5 min"
requires_td: false
---

# Espejo y Repetición

Crea patrones de espejo y repetición a partir de cualquier imagen o video.

## Network Setup

```
[Source TOP] → [Mirror TOP] → [Transform TOP] → [Output TOP]
```

## Parámetros

**Mirror TOP:**
- Mirror Type: `Horizontal` (espejo izquierda-derecha)
- o `Vertical` (espejo arriba-abajo)
- o `Both` (cuádruple espejo)

**Transform TOP (opcional):**
- Scale: `0.5`
- Center: `(0.5, 0.5)`

## Variantes
- **Mirror + Kaleidoscope TOP** para patrones complejos
- Múltiples Mirror TOP en cadena para repetición infinita
- **Displace TOP** entre mirrors para patrones orgánicos
- **Composite TOP** con diferentes blend modes entre capas espejadas
