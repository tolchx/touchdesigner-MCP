---
title: "Instancing de Partículas"
category: "particles"
difficulty: "advanced"
keywords: ["instancing", "particles", "gpu", "geometry", "sop", "performance", "attribute"]
duration: "50 min"
requires_td: true
---

# Instancing de Partículas

Domina el instancing en TouchDesigner para crear sistemas de partículas masivos con alto rendimiento usando Geometry COMP y atributos SOP.

## Requisitos

- TouchDesigner Pro
- Conocimientos de SOPs y Geometry COMP
- GPU con soporte para instancing

## Paso 1: Conceptos de instancing

El instancing permite renderizar miles de copias de una geometría base (template) con una sola llamada de draw, modificando posición, rotación, escala y color por instancia mediante atributos.

**Ventajas:**
- Rendimiento masivo (10k-100k+ instancias)
- Mínimo overhead de CPU
- Geolocalización por atributos

## Paso 2: Configurar el template geometry

1. Crea un **Box SOP** (nómbralo `particle_template`)
2. Configura:
   - Size: `(0.1, 0.1, 0.1)`
   - DivX/DivY/DivZ: `1` (mínimo, es un template simple)

### Template con detalles
Para instancias más interesantes:
1. Crea un **Sphere SOP** o **Torus SOP**
2. Nómbralo `template_detalle`
3. Añade un **Subdivide SOP** si necesitas más vértices
4. Cuanto más complejo el template, menos instancias podrás tener

## Paso 3: Crear el sistema de instancias con Copy SOP

1. Crea un **Grid SOP** que definirá las posiciones:
   - Size: `(20, 20)`
   - Rows: `100`
   - Columns: `100` (10,000 puntos)
2. Nómbralo `position_grid`

### Usa Copy SOP
1. Crea un **Copy SOP**:
   - Source: `particle_template`
   - Input Points: `position_grid`
2. Esto crea 10,000 copias en las posiciones del grid

## Paso 4: Atributos por instancia

1. Crea un **Attribute Create SOP** antes del Copy:
   - Group: `Points`
   - Name: `pscale`
   - Value: `rand(me.id) * 0.5 + 0.2`
2. Crea otro atributo para color:
   - Name: `Cd`
   - Type: `Float`
   - Size: `3` (RGB)
   - Value: `(rand(me.id + 1), rand(me.id + 2), rand(me.id + 3))`
3. Crea atributo de rotación:
   - Name: `orient` (quaternion)
   - Type: `Float`
   - Size: `4`
   - Value: `(0, 0, 0, 1)`

## Paso 5: Sistema de partículas animadas

1. Crea un **Particle SOP** dentro de un **Geometry COMP**:
   - Count: `5000`
   - Life: `5`
   - Rate: `500`
2. Conecta la salida a un **Copy SOP** como position input

### Atributos de velocidad
En un **Attribute Create SOP** después del Particle SOP:
1. `pscale`: `@speed * 0.1 + 0.05` (tamaño basado en velocidad)
2. `Cd`: `(1 - @age / @life, @age / @life, 0.5)` (color por edad)
3. `orient`: cuaternión basado en dirección de velocidad

### Instancing con Geometry COMP
1. Crea un **Geometry COMP** (nómbralo `instancer`)
2. Configura:
   - Instance Object: `template_detalle` o un **Null SOP** apuntando al template
   - Point Source: `particle_system` (el SOP con los puntos)
3. Activa "Use Local Transform" en el Geometry COMP
4. Activa "Point Instancing"

## Paso 6: Control de atributos desde CHOPs

1. Crea un **Noise CHOP**:
   - Type: `Perlin`
   - Frequency: `0.1`
   - Amplitude: `2`
2. Conéctalo a un **CHOP To SOP**:
   - Nómbralo `noise_atributos`
   - Channel: `tx`
3. En el Attribute Create:
   - `tx`: `op('noise_atributos')[0,'chan1'] * 5`

### Técnica: audio-reactivo
1. Conecta un **Audio Spectrum CHOP**
2. Úsalo para escalar `pscale` globalmente:
   - `pscale = @pscale * (1 + audio_peak * 2)`
3. Úsalo para color:
   - `Cd = (audio_bass, audio_mid, audio_treble) * colores_base`

## Paso 7: Optimización avanzada

### Geometry LOD (Level of Detail)
1. Crea 3 templates: baja, media y alta resolución
2. Usa un **Switch SOP** para alternar según la distancia
3. Controla el switch con un CHOP de distancia

### Frustum culling
1. Activa "Frustum Culling" en el Geometry COMP
2. Configura el campo de visión para ocultar instancias fuera de pantalla

### Stream reduction
1. Usa un **Delete SOP** para eliminar partículas muertas:
   - Operation: `By Expression`
   - Expression: `@age >= @life`
2. Reduce el tráfico de datos entre CPU y GPU

## Cadena completa

```
[Particle SOP] → [Attribute Create] → [Delete SOP] → [Null SOP (points)]
    ^                 ^                    ^               |
    |           (pscale, Cd, orient)  (dead removal)       ↓
    +--[CHOP To] ← [Noise CHOP]              [Copy SOP] ←─+
                                                  |
                                                  ↓
                                       [Geometry COMP (instancing)]
                                                  |
                                                  ↓
                                             [Render TOP]
```

## Consejos profesionales

- **Template simple**: Usa geometrías de pocos polígonos para más instancias
- **pscale**: Siempre define pscale; sin él las instancias son invisibles
- **orient**: Usa cuaterniones para rotación suave y sin gimbal lock
- **Update frecuency**: No actualices atributos cada frame si no es necesario
- **GPU profiling**: Monitorea el frametime con **Performance Monitor TOP**
- **Texture arrays**: Usa **Texture 3D** para variar la apariencia de instancias
- **Billboarding**: Activa "Billboard" en materiales para que las instancias siempre miren a cámara
