---
title: "Sistema de partículas POP con feedback loop, colisiones simples y control de presupuesto de rendimiento"
category: "particles"
difficulty: "advanced"
keywords: ["pop", "feedback", "particles", "collisions", "performance", "gpu", "expert"]
duration: "45 min"
requires_td: true
---

# Tutorial: Sistema de partículas POP con Feedback Loop

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
- `particlePOP` con Target Feedback Loop POP apuntando al `nullPOP` final.

### Validación Python
Bloque de validación que confirme:
- Existencia de `pop_particles_sys`
- Existencia de los POPs principales
- Que el target del feedback no está vacío

### Rendimiento
- `maxparticles` y birthrate configurados para 60fps
- Un `infoCHOP` conectado al `particlePOP` para medir cook time

## Compatibilidad

- TouchDesigner 2025+
- POPs (GPU)
- GPU: NVIDIA/AMD (compute shader), VRAM mínima: 6 GB

## Salida esperada

Script Python listo para `td_execute` con `from_op="/project1"`.
