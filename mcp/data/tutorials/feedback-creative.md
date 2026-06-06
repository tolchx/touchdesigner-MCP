---
title: "Feedback Creativo Avanzado"
category: "feedback"
difficulty: "expert"
keywords: ["feedback", "loop", "recursive", "delay", "composite", "transform", "glsl"]
duration: "60 min"
requires_td: true
---

# Feedback Creativo Avanzado

Técnicas profesionales de feedback visual usando Feedback TOP, Delay COMP, transformaciones recursivas y shaders GLSL para crear bucles infinitos y orgánicos.

## Requisitos

- TouchDesigner (cualquier licencia)
- Comprensión básica de bucles de feedback
- Creatividad para experimentar

## Paso 1: Feedback loop fundamental

1. Crea un **Constant TOP** con un círculo blanco sobre fondo negro
2. Nómbralo `source`
3. Crea la estructura base de feedback:

```
[Source] → [Composite TOP] → [Transform TOP] → [Output]
                ↑                              │
                └────── [Feedback TOP] ←───────┘
```

4. Configura **Feedback TOP**:
   - Opacity: `0.9`
   - Composite: `Add`
5. Configura **Transform TOP**:
   - Rotate: `0.5` (grados por frame)
   - Scale: `0.99` (ligera reducción)
   - Translate X: `0.001`

### Estabilización del loop
Si el feedback se vuelve blanco muy rápido:
- Reduce Opacity a `0.85`
- Cambia Composite a `Multiply`
- Añade un **Level TOP** en el loop para recortar valores

## Paso 2: Feedback con transformaciones múltiples

1. Crea un loop con transformaciones en cadena:

```
[Source] → [Composite] → [Blur TOP] → [Transform (scale)] → [Transform (rotate)] → [Output]
    ↑                                                                               │
    └─────────────────────── [Feedback TOP] ←───────────────────────────────────────┘
```

2. Configura el Blur TOP:
   - Type: `Gaussian`
   - Radius: `0.005` (feedback suave y difuso)
3. Segundo Transform:
   - Rotate: `-0.3`
   - Translate: `(0.002, 0.0)`

### Técnica: feedback en espiral
1. Transform principal: Rotate `0.5`, Scale `0.98`, Translate `(0.003, 0)`
2. Después de varios segundos, se forma una espiral
3. Cambia la dirección de rotación para efectos de respiración

## Paso 3: Feedback con color shifting

1. Inserta un **HSV Adjust TOP** dentro del loop:

```
[Source] → [Composite] → [HSV Adjust] → [Transform] → [Output]
    ↑                                                        │
    └───────────────── [Feedback TOP] ←──────────────────────┘
```

2. Configura HSV Adjust:
   - Hue Shift: `0.005` (cambio gradual por frame)
   - Saturation: `1.2`
   - Value: `0.95`
3. El color cambiará lentamente en cada iteración del loop

## Paso 4: Feedback orgánico con Displace TOP

1. Añade **Displace TOP** al loop:

```
[Source] → [Composite] → [Displace TOP] → [Blur] → [Transform] → [Output]
    ↑                                                                  │
    └───────────── [Feedback TOP] ←────────────────────────────────────┘
```

2. Configura Displace TOP:
   - Displace Type: `Directional`
   - Amount: `0.02`
   - Angle: animado con LFO
3. Resultado: formas orgánicas que fluyen como líquido

### Feedback reactivo al contenido
1. Usa el output del feedback como source del displace
2. Configura Displace Type: `Source`
3. Resultado: auto-distorsión que se intensifica con cada iteración

## Paso 5: Multi-feedback layers

1. Crea dos bucles de feedback independientes:

**Loop A (fondo):**
```
[Circle] → [Composite A] → [Blur (heavy)] → [Transform A] → [Output A]
    ↑                                                          │
    └──────────────── [Feedback A] ←───────────────────────────┘
```

**Loop B (foreground):**
```
[Source] → [Composite B] → [Kaleidoscope] → [Transform B] → [Output B]
    ↑                                                                │
    └─────────────── [Feedback B] ←──────────────────────────────────┘
```

2. Mezcla ambos outputs con un tercer **Composite TOP**:
   - Operation: `Screen` (para capas brillantes)
   - Operation: `Add` (para colores intensos)

## Paso 6: Feedback con GLSL shader

1. Crea un **GLSL TOP** dentro del loop de feedback:

```glsl
uniform float u_time;
uniform sampler2D u_feedback;

out vec4 fragColor;

void main() {
    vec2 uv = vUV.st;
    
    // Desplazamiento basado en el propio feedback
    vec4 fb = texture(sTD2DInputs[0], uv);
    vec2 offset = fb.rg * 0.02 - 0.01;
    
    vec2 distorted = uv + offset;
    vec4 color = texture(sTD2DInputs[0], distorted);
    
    // Rotación en el shader
    float angle = u_time * 0.1;
    mat2 rot = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
    vec2 rotated = rot * (distorted - 0.5) + 0.5;
    
    vec4 fb2 = texture(sTD2DInputs[0], rotated);
    
    // Mezcla reactiva
    fragColor = mix(color, fb2, 0.3) * 0.95;
}
```

2. Conecta este shader como el elemento transformador del feedback
3. El resultado es auto-organización visual generativa

## Paso 7: Audio-reactive feedback

1. Conecta un **Audio Spectrum CHOP**
2. Úsalo para modular parámetros del feedback:

- **Opacity del Feedback**: `audio_peak * 0.3 + 0.7`
- **Scale del Transform**: `1.0 - audio_bass * 0.05`
- **Hue Shift**: `audio_mid * 0.02`
- **Blur Radius**: `audio_treble * 0.01`

## Cadena completa avanzada

```
[Circle] → [Composite] → [GLSL TOP] → [Blur TOP] → [Displace TOP] → [HSV] → [Transform] → [Output]
    ↑                                                                                            │
    └─────────────────────────────────── [Feedback TOP] ←─────────────────────────────────────────┘
```

## Consejos profesionales

- **Reset del feedback**: Conecta un **Switch TOP** con un pulso para resetear el loop
- **Opacity sweet spot**: 0.85-0.95 para la mayoría de efectos; menor valor = loop más corto
- **Scale**: 0.98-0.995; valores cercanos a 1.0 crean loops más largos
- **Feedback TOP composite**: `Add` para brillo, `Multiply` para oscuridad, `Screen` para medios
- **Rendimiento**: El feedback acumula memoria GPU — añade un **Resolution TOP** para limitar
- **Glitch**: Añade un **Displace TOP** con valores extremos para glitch momentáneo
- **Color accumulation**: Con Composite `Add`, los colores se saturan y eventualmente blanquean — usa Level TOP para re-circunscribir
