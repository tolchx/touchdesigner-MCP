---
title: "Máscaras y Layers"
category: "composite"
difficulty: "intermediate"
keywords: ["mask", "layer", "alpha", "composite", "matte", "top"]
duration: "8 min"
requires_td: false
---

# Máscaras y Layers

Usa máscaras para controlar la visibilidad de diferentes capas en una composición.

## Network Setup

```
[Layer A TOP] → [Composite TOP] → [Output TOP]
                    ↑
[Layer B TOP] ──────┤
                    ↑
              [Mask TOP] ──────────┘ (alpha channel)
```

## Parámetros

**Composite TOP:**
- Operation: `Over`
- Source A: Layer A (background)
- Source B: Layer B (foreground)
- Mask Channel: conectado a Mask TOP

**Mask TOP (fuente de máscara):**
Creada con:
- **Ramp TOP** (radial o linear) para transiciones suaves
- **Circle TOP** para máscaras geométricas
- **Key TOP** para máscaras por color/luma
- **Text TOP** para máscaras con texto

## Variantes
- Máscara animada con **Transform TOP** en la máscara
- Múltiples máscaras con **Composite TOP (Multiply)**
- Máscara con blur para bordes suaves
- Máscara invertida con **Level TOP (Invert)**
