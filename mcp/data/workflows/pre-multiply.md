---
title: "Pre-Multiply Alpha"
category: "composite"
difficulty: "advanced"
keywords: ["pre-multiply", "alpha", "premult", "composite", "edge", "top"]
duration: "8 min"
requires_td: false
---

# Pre-Multiply Alpha

Entiende y aplica pre-multiplicación de alpha para bordes limpios en composiciones.

## Network Setup

```
[Source TOP (RGBA)] → [Pre-Multiply TOP] → [Composite TOP] → [Output TOP]
                                                ↑
                                  [Background TOP] ──────────┘
```

## Parámetros

**Pre-Multiply TOP:**
- Operation: `Pre-Multiply` (multiplica RGB por Alpha)
- O `Un-Multiply` (divide RGB por Alpha, para restaurar)

**Por qué pre-multiply:**
- Elimina bordes oscuros/brillantes alrededor de objetos recortados
- Mejora la mezcla con fondos brillantes
- Esencial para partículas y sprites

**Composite TOP:**
- Operation: `Over`
- Pre-Multiply: activado (porque el source ya está pre-multiplicado)

## Flujo típico

```
[Render TOP] → [Pre-Multiply TOP] → [Composite TOP] → Output
                                          ↑
                                [Background TOP]
```

## Variantes
- **Un-Multiply** para restaurar colores originales antes de aplicar LUTs
- **Matte TOP** después de Pre-Multiply para refinar bordes
- Pre-Multiply es necesario cuando trabajas con renders 3D o shaders GLSL
