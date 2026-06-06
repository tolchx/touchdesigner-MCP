---
title: "Modos de Mezcla Avanzados"
category: "composite"
difficulty: "intermediate"
keywords: ["blend", "modes", "composite", "mix", "layers", "top"]
duration: "10 min"
requires_td: false
---

# Modos de Mezcla Avanzados

Explora y combina múltiples modos de mezcla del Composite TOP para crear looks únicos.

## Network Setup

```
[Layer A TOP] → [Composite TOP] → [Composite TOP] → [Output TOP]
                     ↑                  ↑
[Layer B TOP] ───────┘     [Composite TOP (3)] ───┘
                                  ↑
                        [Layer C TOP] ──────────────┘
```

## Parámetros

**Composite TOP (A+B):**
- Operation: `Over` (base)

**Composite TOP (result + C):**
- Operation: `Screen` (aumenta brillo)

**Variantes de mezcla por capa:**

| Capa | Modo | Efecto |
|------|------|--------|
| A+B | Multiply | Oscurece con B |
| A+B | Screen | Ilumina con B |
| A+B | Overlay | Contraste aumentado |
| A+B | Difference | Inversión de color |
| A+B | Add | Suma de brillos |

## Variantes
- Usa **Level TOP** en cada capa antes de mezclar
- Anima el blend mode con un **Select CHOP**
- Máscara en el Composite para mezcla selectiva
- 4+ capas con diferentes modos para looks complejos
