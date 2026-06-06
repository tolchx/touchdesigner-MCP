---
title: "Corner Pin"
category: "transform"
difficulty: "intermediate"
keywords: ["corner", "pin", "perspective", "warp", "top", "transform"]
duration: "6 min"
requires_td: false
---

# Corner Pin

Distorsiona una imagen ajustando independientemente cada esquina para perspectiva personalizada.

## Network Setup

```
[Source TOP] → [Transform TOP] → [Output TOP]
```

## Parámetros

**Transform TOP (modo Corner Pin):**
- Transform Order: `Pin Corner`
- Corner TL: `(0.0, 0.0)` — arriba izquierda
- Corner TR: `(1.0, 0.0)` — arriba derecha
- Corner BL: `(0.0, 1.0)` — abajo izquierda
- Corner BR: `(1.0, 1.0)` — abajo derecha (valores por defecto = sin distorsión)

**Ejemplo de perspectiva:**
- Corner TR: `(0.85, -0.1)` — esquina superior derecha inclinada
- Corner BR: `(0.85, 1.1)` — esquina inferior derecha inclinada
- Esto crea un efecto de pared lateral

## Variantes
- Anima las esquinas con LFO para warp dinámico
- **Audio reactivo**: cada esquina controlada por una banda de audio diferente
- Corner Pin + **Composite TOP** para simular múltiples pantallas
- Usa **CHOP To** para mover esquinas con datos externos
