---
id: "particles-experto-feedback-sim"
title: "Sistema de partículas POP con feedback loop"
project_type: "particulas"
complexity: "experto"
application: "instalaciones"
touchdesigner_min_version: "2025"
hardware: "GPU NVIDIA/AMD (compute shader), VRAM mínima: 6 GB"
performance: "60 fps objetivo, presupuesto por frame: 16ms"
validation:
  - "Existencia de baseCOMP contenedor"
  - "POPs principales creados"
  - "Feedback loop target no vacío"
  - "infoCHOP para medir cook time"
---

# Prompt maestro: {{title}}

## Objetivo
Construir en `/project1` un sistema POP encapsulado en un `baseCOMP` llamado `pop_particles_sys` que cubra source, simulación, fuerzas, constraints y output con feedback loop correcto.

## Etapas del sistema

### 1) Source
Genera puntos emisores (nube o grid) parametrizable.

### 2) Simulación
`particlePOP` con emisión continua y límite de partículas (presupuesto explícito).

### 3) Forces
- Fuerza de ruido (atributo y parámetros mapeables)
- Fuerza radial para atraer a un objetivo

### 4) Constraints
- Límite espacial (caja)
- Muerte opcional por atributo

### 5) Output
- `nullPOP` final
- `geoCOMP` para render con instancing básico

## Requisitos técnicos

### Feedback loop correcto
`particlePOP` con Target Feedback Loop POP apuntando al `nullPOP` final.

### Validación Python
Bloque de validación que confirme:
- Existencia de `pop_particles_sys`
- Existencia de los POPs principales
- Que el target del feedback no está vacío

### Rendimiento
- `maxparticles` y birthrate configurados para {{target_fps}}fps
- Un `infoCHOP` conectado al `particlePOP` para medir cook time

## Salida esperada
Script Python listo para `td_execute` con `from_op="/project1"`.
