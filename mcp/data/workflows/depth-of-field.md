---
title: "Desenfoque de Profundidad (Depth of Field)"
category: "blur"
difficulty: "intermediate"
keywords: ["depth", "field", "bokeh", "z-depth", "focus", "blur"]
duration: "10 min"
requires_td: false
---

# Desenfoque de Profundidad (Depth of Field)

Simula el desenfoque de profundidad de cámara usando un mapa de profundidad Z.

## Network Setup

```
[3D Render TOP] ──→ [Blur TOP (Radial)] ──→ [Composite TOP] ──→ [Output]
       │                    ↑                       ↑
       │                    │                       │
       └── [Z-Depth Map] ──┘                       │
              (del Render)                          │
       [Same Render (no blur)] ─────────────────────┘
```

## Parámetros

**Render TOP (configuración):**
- Habilita `Z-Depth Output` en el Render
- Conecta la salida Z-Depth a un segundo output

**Blur TOP:**
- Type: `Radial`
- Radius: basado en profundidad
- Map: usa el Z-Depth como máscara (o un **Displace TOP**)

## Alternativa sin mapa Z

```
[Source TOP] → [Displace TOP] → [Composite TOP] → [Output TOP]
                    ↑                ↑
            [Ramp TOP]          Source
            (máscara)
```

**Displace TOP:**
- Displace X: `0`
- Displace Y: `0.02`
- Map: Ramp TOP (blanco/negro)

## Tips
- Rampa vertical = degradado de desenfoque
- Rampa circular = enfoque central
- Combina con **Blur TOP** de diferentes radios para capas
- Usa **Lookup TOP** para controlar la curva de desenfoque por profundidad
