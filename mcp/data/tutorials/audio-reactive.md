---
title: "Sistema Audio-Reactivo Básico"
category: "audio"
difficulty: "intermediate"
keywords: ["audio", "reactive", "music", "visuals", "spectrum", "chop"]
duration: "30 min"
requires_td: true
---

# Sistema Audio-Reactivo Básico

Aprende a crear un sistema visual que reacciona al audio en tiempo real usando AudioCHOP y Geometry COMP.

## Requisitos

- TouchDesigner Pro (licencia Comercial o EDU) con capacidad de audio
- Archivo de audio o entrada de micrófono

## Paso 1: Configurar la entrada de audio

1. Crea un **Audio File In CHOP** (o **Audio Device In CHOP** si usas micrófono)
2. Nómbralo `audio_in`
3. Conecta un **Audio Band EQ CHOP** a `audio_in`
4. Nómbralo `audio_eq`
5. En sus parámetros, configura 4 bandas:
   - Banda 1: 60-250 Hz (bajos)
   - Banda 2: 250-2000 Hz (medios)
   - Banda 3: 2000-8000 Hz (agudos)
   - Banda 4: 8000-20000 Hz (altos)

## Paso 2: Extraer el espectro

1. Conecta un **Audio Spectrum CHOP** a `audio_in`
2. Nómbralo `audio_spectrum`
3. Conecta un **Math CHOP** al spectrum con operación `Range` (0-1)
4. Conecta un **Limit CHOP** para recortar valores

## Paso 3: Crear los visuales

1. Crea un **Circle SOP** como geometría base (nómbralo `circle`)
2. Crea un **Geometry COMP** que referencie el circle
3. En el Geometry COMP:
   - Conecta un **Transform SOP** después del circle
   - En tx (translate X), usa: `op('audio_eq')[0,'val1'] * 2`
   - En ty, usa: `op('audio_eq')[0,'val3'] * 2`
   - En sz (scale), usa: `op('audio_spectrum')[0,'mean'] * 3 + 0.5`

## Paso 4: Agregar color

1. Crea un **Phong MAT**
2. Conéctalo al material del Geometry COMP
3. En el color difuso, usa expresiones que lean del espectro:
   - R: `op('audio_eq')[0,'val1']` (bajos → rojo)
   - G: `op('audio_eq')[0,'val2']` (medios → verde)
   - B: `op('audio_eq')[0,'val3']` (agudos → azul)

## Paso 5: Partículas reactivas

1. Crea un **Particle SOP** dentro del Geometry COMP
2. Configura:
   - Count: 500
   - Life: `op('audio_spectrum')[0,'mean'] * 3 + 1`
   - Velocity: usa `op('audio_spectrum')[0,'peak']` para escalar
3. Conecta la salida a un **Render TOP**

## Resultado Final

Tendrás un sistema visual completo que reacciona al audio con:
- Movimiento basado en frecuencia
- Color dinámico por bandas
- Partículas con vida y velocidad variables

## Consejos

- Usa **Filter CHOP** para suavizar los valores de audio
- Combina con **Feedback TOP** para estelas psicodélicas
- Exporta como tox para reutilizar en otros proyectos
