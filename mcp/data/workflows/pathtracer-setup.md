---
title: "Setup de Pathtracer con Multi-Material"
category: "pathtracer"
difficulty: "expert"
keywords: ["pathtracer", "materials", "glsl", "pbr", "setup", "multi-material"]
duration: "15 min"
requires_td: true
---

# Setup de Pathtracer con Multi-Material

Workflow para configurar y extender un pathtracer GLSL con múltiples materiales en TouchDesigner.

## Network Setup

```
animated_torus ──→ PT_MAT1 ──┐
                              ├──→ merge1 ──→ Pathtracer ──→ out1
PT_MAT2 (esfera) ────────────┤
PT_MAT3 (custom) ────────────┤
PT_MAT4 (nuevo) ─────────────┘
```

## Crear un nuevo material

### 1. Copiar material existente

```python
import json
src = op('/project1/PT_MAT1')
parent_comp = src.parent()
copied = parent_comp.copy(src)
copied.name = 'PT_MAT5'
```

### 2. Configurar atributos vertex (attribute2)

```python
mat = op('/project1/PT_MAT5/attribute2')

# Color base
mat.par.attr0value0 = 0.9   # R
mat.par.attr0value1 = 0.1   # G
mat.par.attr0value2 = 0.1   # B

# Propiedades de material
mat.par.attr1value0 = 0.0    # Emit (0=sin emisión)
mat.par.attr2value0 = 0.3    # Roughness (0=brillante, 1=mate)
mat.par.attr3value0 = 0.0    # Transparency (0=opaco)
mat.par.attr4value0 = 1.5    # IOR
mat.par.attr5value0 = 0.8    # Metallic (0=dielectric, 1=metal)
mat.par.attr6value0 = 0.5    # ClearCoat
mat.par.attr7value0 = 0.1    # ClearCoatRoughness
mat.par.attr8value0 = 1.0    # ClearCoatTint R
mat.par.attr8value1 = 1.0    # ClearCoatTint G
mat.par.attr8value2 = 1.0    # ClearCoatTint B
```

### 3. Conectar al merge

```python
merge = op('/project1/merge1')
mat_out = op('/project1/PT_MAT5/out1')
merge.inputConnectors[0].connect(mat_out)
```

### 4. Verificar

```python
# Healthcheck
t = op('/project1/PT_MAT5')
t.cook(force=True)
print(t.errors())
```

## Recetas de materiales

### Vidrio transparente
```python
mat.par.attr0value0 = 0.95  # Color blanco
mat.par.attr0value1 = 0.95
mat.par.attr0value2 = 0.95
mat.par.attr3value0 = 0.9    # Transparency alta
mat.par.attr4value0 = 1.5    # IOR vidrio
mat.par.attr5value0 = 0.0    # No metálico
mat.par.attr2value0 = 0.0    # Perfectamente liso
```

### Oro metálico
```python
mat.par.attr0value0 = 1.0    # Color dorado
mat.par.attr0value1 = 0.76
mat.par.attr0value2 = 0.33
mat.par.attr5value0 = 1.0    # Totalmente metálico
mat.par.attr2value0 = 0.2    # Rugosidad baja
mat.par.attr6value0 = 0.0    # Sin clearcoat
```

### Plástico brillante con clearcoat
```python
mat.par.attr0value0 = 0.1    # Azul oscuro
mat.par.attr0value1 = 0.2
mat.par.attr0value2 = 0.8
mat.par.attr5value0 = 0.0    # No metálico
mat.par.attr2value0 = 0.3    # Rugosidad media
mat.par.attr6value0 = 0.9    # Clearcoat fuerte
mat.par.attr7value0 = 0.02   # Clearcoat muy liso
```

### Material emisivo (luz)
```python
mat.par.attr0value0 = 1.0
mat.par.attr0value1 = 0.9
mat.par.attr0value2 = 0.7
mat.par.attr1value0 = 5.0    # Emisión alta
mat.par.attr5value0 = 0.0
mat.par.attr2value0 = 0.5
```

## Parámetros del pathtracer

| Parámetro | Efecto |
|-----------|--------|
| `uIterations` ↑ | Menos ruido, más lento |
| `uAperture` ↑ | DoF más pronunciado |
| `uEnvDimmer` ↑ | Escena más brillante |
| `uQueryIterations` ↑ | Más rebotes (vidrio/reflexión) |
| `uFireflyClamp` ↓ | Menos fireflies |
