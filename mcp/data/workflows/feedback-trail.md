---
title: "Estela de Feedback con Delay COMP"
category: "feedback"
difficulty: "intermediate"
keywords: ["feedback", "delay", "trail", "comp", "loop"]
duration: "8 min"
requires_td: false
---

# Estela de Feedback con Delay COMP

Crea estelas visuales suaves usando un container con Delay COMP.

## Network Setup

```
[Source TOP] → [Feedback TOP] ─→ [Composite TOP] ─→ [Output TOP]
                     ↑                ↑
                     └── [Delay COMP] ─┘
                         (1 frame delay)
```

## Parámetros

**Feedback TOP:**
- Opacity: `0.85` (persistencia de la estela)
- Composite: `Add` o `Screen`

**Delay COMP:**
- Delay: `1` (frames)
- Esto es un container que envuelve un **Cache TOP**

## Variante avanzada
```
Source → Feedback → [Transform TOP] → [HSV Adjust TOP] → Composite → Output
                        ↑                                       ↑
                        └──────────── Delay COMP ────────────────┘
```

## Tips
- Opacity 0.7-0.9 para estelas largas
- Combina con Transform animado para espirales
- Resetea el feedback con un **Switch TOP** y un pulso
