---
title: "Sistema de Partículas Básico"
category: "particles"
difficulty: "intermediate"
keywords: ["particles", "pop", "sop", "geometry", "instancing", "particle"]
duration: "35 min"
requires_td: true
---

# Sistema de Partículas Básico

Crea un sistema de partículas completo usando POPs (Particle Operators) en TouchDesigner.

## Requisitos

- TouchDesigner (cualquier licencia)
- Conocimientos básicos de SOPs y COMPs

## Paso 1: Configurar el POP Network

1. Crea un **POP Network COMP** (nómbralo `particle_net`)
2. Dentro del POP Network (doble click), crea:
   - **POP Source** - Emisor de partículas (nómbralo `source`)
   - **POP Solver** - Solver de simulación (nómbralo `solver`)
   - **POP Render** - Renderizador (nómbralo `render`)

## Paso 2: Configurar el emisor

1. Selecciona `source` (POP Source)
2. Configura:
   - Source Type: `Box` o `Point`
   - Rate: `100` (partículas por segundo)
   - Life: `3.0` (segundos de vida)
   - Init Velocity: `(0, 5, 0)` (velocidad inicial hacia arriba)
   - Init Velocity Spread: `(2, 0.5, 2)`

## Paso 3: Agregar fuerzas

1. Dentro del POP Network, crea un **POP Force**
2. Conéctalo entre `source` y `solver`
3. Configura:
   - Gravity: `(0, -2, 0)` (gravedad hacia abajo)
   - Wind: `(2, 0, 0)` (viento lateral)
4. Crea un **POP Drag** y conéctalo:
   - Drag: `0.05` (resistencia del aire)

## Paso 4: Configurar el solver

1. Selecciona `solver` (POP Solver)
2. Asegúrate de que `Re-simulate` esté activado
3. Sub-steps: `2` (para mayor precisión)

## Paso 5: Renderizar partículas

1. Selecciona `render` (POP Render)
2. Configure:
   - Render Type: `Sprites`
   - Sprite Size: `0.2`
   - Color Type: `Particle Age` o `Custom`
3. Conecta un **Phong MAT** al render para mejor apariencia

## Paso 6: Agregar visualización

1. Crea un **Geometry COMP** en la red principal
2. En sus parámetros, apunta a `particle_net`
3. Conecta la salida a un **Render TOP**

## Efectos adicionales

### Color por velocidad
En el POP Render, usa expresiones en el color:
- R: `@speed * 0.5`
- G: `@age / @life`
- B: `1 - @age / @life`

### Turbulencia
Agrega un **POP Wind** con turbulencia:
- Turbulence: `(0.5, 0.5, 0.5)`
- Frequency: `0.1`

### Atracción
Agrega un **POP Attractor**:
- Position: `(0, 0, 0)`
- Strength: `0.5`
- Radius: `5`

## Optimización

- Usa **POP Cache** para partículas persistentes
- Limita el Rate para performance en móvil
- Sprite Size pequeño para mejor rendimiento
- Usa instancing con **Geometry COMP** para partículas 3D complejas
