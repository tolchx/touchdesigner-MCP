---
title: "Diferencia y Exclusión"
category: "composite"
difficulty: "intermediate"
keywords: ["difference", "exclusion", "blend", "invert", "glitch", "top"]
duration: "6 min"
requires_td: false
---

# Diferencia y Exclusión

Modos de mezcla Difference y Exclusion para crear efectos de inversión, glitch y detección de cambios.

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
| `Difference` | \|A - B\| | Inversión, detección de movimiento |
| `Exclusion` | A + B - 2AB | Similar pero más suave |

**Difference (ejemplo):**
- Layer A: video actual
- Layer B: frame anterior (vía Feedback TOP)
- Resultado: solo las áreas que cambiaron son visibles
- Efecto: detección de movimiento estilizada

**Exclusion (ejemplo):**
- Layer A: imagen base
- Layer B: patrón de ruido animado
- Resultado: glitch psicodélico

## Variantes
- Difference para efecto "predator" (movimiento resaltado)
- Exclusion + **Blur TOP** para glow de diferencia
- Anima Layer B con **Transform TOP** para glitch en movimiento
- Difference con **Displace TOP** después para warps de movimiento
