---
title: "Transparencia y Alpha"
category: "composite"
difficulty: "beginner"
keywords: ["alpha", "transparency", "composite", "over", "top", "opacity"]
duration: "5 min"
requires_td: false
---

# Transparencia y Alpha

Controla la transparencia de capas usando el canal alpha y el Composite TOP.

## Network Setup

```
[Foreground TOP] → [Composite TOP] → [Output TOP]
                        ↑
              [Background TOP] ─────┘
```

## Parámetros

**Foreground TOP (con alpha):**
- Asegúrate de que tenga canal alpha (RGBA)
- Usa **Alpha TOP** si necesitas crear o modificar alpha:
  - Alpha Source: `Constant` o `Luma` o `Red Channel`
  - Constant Alpha: `0.5` (50% opacidad)

**Composite TOP:**
- Operation: `Over` (respeta alpha del foreground)
- Opacity: `1.0` (o menos para semitransparencia global)

## Variantes
- Anima Alpha Constant con LFO para fade in/out
- **Level TOP (Alpha)** para ajustar opacidad con curvas
- **HSV Adjust TOP** afecta alpha si "Preserve Alpha" está desactivado
- Múltiples capas semitransparentes apiladas
