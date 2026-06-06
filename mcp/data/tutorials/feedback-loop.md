---
title: "Feedback Psicodélico"
category: "feedback"
difficulty: "intermediate"
keywords: ["feedback", "delay", "psychedelic", "glitch", "feedback_top", "composite"]
duration: "20 min"
requires_td: false
---

# Feedback Psicodélico

Los loops de feedback crean patrones hipnóticos y psicodélicos al realimentar la salida de un TOP a su propia entrada. Es una de las técnicas más características del TouchDesigner.

## Cómo funciona

Un **Feedback TOP** realimenta su salida con un delay de 1 frame, permitiendo que los efectos se acumulen y transformen con el tiempo.

## Paso 1: Configuración básica

1. Crea un **Feedback TOP** (nómbralo `feedback`)
2. Crea una fuente de entrada, ej: **Ramp TOP** o **Circle TOP** (nómbrala `source`)
3. Conecta `source` al primer input del Feedback TOP
4. Conecta la salida del Feedback TOP a su propio segundo input (esto cierra el loop)

## Paso 2: Transformaciones en el loop

1. Inserta un **Transform TOP** entre la salida del Feedback y su segundo input
2. Configura:
   - Rotate: `1.5` (grados por frame)
   - Scale: `0.98` (ligero escalado)
   - Translate X: `0.005`
   - Translate Y: `0.005`
3. Esto crea una espiral que rota lentamente

## Paso 3: Color shifting

1. Inserta un **HSV Adjust TOP** después del Transform
2. Configura:
   - Hue Shift: `0.02` (cambio de tono por frame)
   - Saturation Scale: `1.2`
   - Value Scale: `0.95`
3. Esto crea el característico cambio de color psicodélico

## Paso 4: Displacement

1. Inserta un **Displace TOP** antes del segundo input del Feedback
2. Usa el mismo feedback o un **Noise TOP** como mapa de desplazamiento
3. Configura:
   - Displace X: `0.02`
   - Displace Y: `0.02`

## Paso 5: Composición con la fuente original

1. Usa un **Composite TOP** para mezclar el feedback con la fuente original
2. Method: `Add`
3. Opacity del feedback: `0.7`

## Controles de interacción

Crea interfaces para controlar en tiempo real:
- Velocidad de rotación
- Escala (zoom in/out)
- Hue shift rate
- Intensidad del feedback (opacity)

## Consejos avanzados

- **Resetear el feedback**: Conecta un **Switch TOP** para alternar entre la fuente y el feedback
- **Feedback multi-capa**: Usa múltiples Feedback TOPs con diferentes transformaciones
- **Audio-reactive feedback**: Usa un **Audio CHOP** para modular los parámetros de transformación
- **Feedback en SOPs**: La misma técnica funciona con **SOP Feedback** para geometría 3D en evolución

## Solución de problemas

- Si la imagen explota (se vuelve completamente blanca), reduce la opacidad del Composite o escala el feedback a < 1.0
- Si se vuelve muy oscura, aumenta el Scale > 1.0 o reduce el decay
