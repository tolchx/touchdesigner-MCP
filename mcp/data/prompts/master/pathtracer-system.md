---
id: "pathtracer-system"
title: "Sistema Pathtracer GLSL con multi-material"
project_type: "rendering"
complexity: "experto"
application: "produccion_visual"
touchdesigner_min_version: "2024"
hardware: "GPU NVIDIA/AMD con ray tracing (RTX/RDNA2+), VRAM mínima: 8 GB"
performance: "30-60 fps objetivo, presupuesto por frame: 16-33ms"
validation:
  - "GLSL POP compilado sin errores"
  - "Inputs 0-3 conectados correctamente"
  - "Materiales con atributos PBR válidos"
  - "merge1 con todos los materiales conectados"
  - "Healthcheck sin errores en Pathtracer"
---

# Prompt maestro: {{title}}

## Objetivo
Construir en `/project1` un sistema de path tracing en GPU completo con pipeline multi-pass, materiales PBR, denoising temporal/espacial, y soporte multi-material.

## Componentes del sistema

### 1) Pathtracer (baseCOMP)
GLSL POP compute shader con:
- Pass 0: raytracing (trazado de rayos con NEE + MIS)
- Pass 1: temporal reprojection
- Pass 2+: A-Trous spatial filtering

Inputs:
- 0: Partículas (UV positions)
- 1: Geometría (merge de materiales)
- 2: Cámaras (matrices)
- 3: Luces emisivas (CDF precomputado)

### 2) Materiales (PT_MATx)
Cada material es un baseCOMP con:
- attribute2: vertex attributes (color, emit, roughness, metallic, etc.)
- attribute1: primitive attributes (MaterialId, TextureIds)
- glsl1: compute shader para texture IDs
- out1: salida al merge

### 3) Geometría
- animated_torus: geometría procedural animada
- Otras geometrías conectadas a materiales

### 4) Cámara
- Camera COMP con feedback loops para movimiento
- Matrices de view + projection

### 5) Iluminación
- Environment map (sampler2D)
- Triángulos emisivos con CDF precomputado

## Requisitos técnicos

### Pipeline multi-pass
GLSL POP configurado con `uTDPass` para alternar entre passes.

### Materiales PBR
Cada material debe tener:
- Color (albedo)
- Roughness (0-1)
- Metallic (0-1)
- ClearCoat (0-1)
- IOR (1-3)
- Transparency (0-1)
- Emit (0-∞)

### Denoising
- Temporal: motion vectors + neighborhood clamping
- Spatial: A-Trous con edge-stopping (luma, normal, depth)

### Performance
- uIterations configurable (16 default)
- Russian Roulette para terminación de paths
- Firefly clamping

## Validación
- GLSL compila sin errores (glsl1_info)
- Healthcheck del Pathtracer sin errores
- merge1 con todos los materiales conectados
- Render output visible en out1

## Salida esperada
Script Python listo para `td_execute` con `from_op="/project1"`.
