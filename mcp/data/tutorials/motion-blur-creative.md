---
title: "Motion Blur Creativo"
category: "blur"
difficulty: "intermediate"
keywords: ["motion blur", "blur", "movement", "velocity", "direction", "top"]
duration: "40 min"
requires_td: true
---

# Motion Blur Creativo

Aprende a crear efectos de motion blur artísticos y cinemáticos combinando múltiples técnicas en TouchDesigner.

## Requisitos

- TouchDesigner (cualquier licencia)
- Fuente de video o animación en movimiento

## Paso 1: Motion Blur básico con Blur TOP

1. Crea un **Movie File In TOP** o **Constant TOP** con formas animadas
2. Conecta un **Blur TOP** y nómbralo `blur_basico`
3. Configura:
   - Type: `Gaussian` (mejor calidad) o `Box` (más rápido)
   - Horizontal Radius: `0.02`
   - Vertical Radius: `0.0`

### Animación del blur
1. Conecta un **LFO CHOP** configurado en `Triangle`
2. Enlázalo al Horizontal Radius
3. Rango: `0.0` a `0.05`
4. Frecuencia: sincronizada con el BPM de tu audio

## Paso 2: Directional motion blur

1. Conecta un **Blur TOP** con Type: `Directional`
2. Nómbralo `blur_direccional`
3. Configura:
   - Length: `0.08`
   - Angle: `45` (grados)
   - Quality: `16` (más pasos = mejor calidad)

### Técnica: blur radial
1. Crea un **Circle** con **Ramp TOP** para crear dirección circular
2. Usa un **Displace TOP** para curvar el blur
3. Parámetros:
   - Displace Type: `Radial`
   - Amount: `0.05`
   - Center: `(0.5, 0.5)`

## Paso 3: Velocity-based motion blur

1. Conecta un **Trail TOP** antes del Blur TOP
2. Nómbralo `trail_velocidad`
3. Configura:
   - Trail Length: `5` (frames)
   - Accumulation: `Add`
   - Opacity: `0.8`
4. Conecta el trail al Blur TOP con direction basado en movimiento real

### Extraer velocidad con CHOPs
1. Conecta un **CHOP To** desde la geometría animada
2. Usa un **Math CHOP** con operación `Derivative` para detectar cambio
3. Mapea el derivative al Length del Blur TOP

## Paso 4: Ghost trail con feedback

1. Crea un loop de feedback con **Feedback TOP**:
   ```
   [Source] → [Feedback TOP] → [Composite TOP] → [Blur TOP] → [Output]
       ↑                                            │
       └──────────── [Delay COMP] ←─────────────────┘
   ```
2. Configura Feedback TOP:
   - Opacity: `0.7`
   - Composite: `Add`
3. Configura Blur TOP:
   - Type: `Gaussian`
   - Radius: `0.01` (sutil)

## Paso 5: Motion blur estilizado (streaks)

1. Crea streaks de movimiento:
   ```
   [Source TOP] → [Transform TOP (animado)] → [Trail TOP] → [Composite TOP]
                                                              ↑
   [Source TOP] → [Transform TOP (animado-2)] ────────────────┘
   ```
2. Configura Trail TOP:
   - Length: `30` (frames largos)
   - Mode: `Maximum`
3. Añade un **HSV Adjust TOP** al final para colorizar

## Paso 6: Blur por capas con máscara

1. Separa el foreground del background
2. Aplica blur fuerte al background
3. Mantén el foreground nítido
4. Técnica:
   ```
   [Source] → [Key/Mask TOP] → [Blur (bg)] → [Composite] → [Output]
                                                  ↑
                          [Source] → [Blur (fg)] ─┘
   ```

## Cadena completa de ejemplo

```
[Source TOP] → [Transform TOP] → [Trail TOP] → [Blur TOP (Directional)] → [Blur TOP (Gaussian)] → [Output]
                   (animado)       (30 frames)    (angle=45, length=0.05)   (radius=0.005)
```

## Consejos

- **Velocidad vs calidad**: Directional con más Quality pasos da mejor resultado pero es más pesado
- **Feedback delay**: Usa Delay COMP con `1-3` frames para ghost trails suaves
- **Combinación de blurs**: Apila múltiples Blur TOPs para efectos complejos
- **Performance**: Reduce resolución interna con un **Resolution TOP** antes de blurs pesados
- **Audio reactivo**: Enlaza el Length del blur a amplitud de audio para impacto musical
