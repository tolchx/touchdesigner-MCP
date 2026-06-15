---
title: "Muestreo Volumétrico 3D LED con POPs"
category: "pops"
difficulty: "expert"
keywords: ["volumetric", "led", "3d", "dtx", "sampling", "pops", "glsl", "mapping"]
duration: "50 min"
requires_td: true
---

# Muestreo Volumétrico 3D LED con POPs

Crea un sistema de muestreo volumétrico para matrices LED 3D usando POPs, GLSL compute y salida DMX. Mapea posiciones 3D a canales de LED con control de intensidad y color.

Basado en el patrón Volumetric Sampling 3D LED POPs v0.1.

## Requisitos

- TouchDesigner (licencia con POPs)
- GPU con soporte GLSL
- Hardware DMX (opcional, para salida real)
- Conocimientos avanzados de POPs y mapeo 3D

## Arquitectura del sistema

```
volume_points (baseCOMP) → sprinklePOP (generar puntos 3D)
    → mathPOP (mapear posiciones) → limitPOP (restringir rango)
    → glsl1 (compute volumétrico) → attributePOP (asignar canales)
    → dmx_prepare (preparar DMX) → dmxout1 (salida DMX)
    → renderTOP (visualización)
```

## Paso 1: Generar puntos volumétricos

1. Crea un **baseCOMP** (nómbralo `volume_points`)
2. Dentro, crea un **sprinkle POP** (nómbralo `sprinkle1`)
   - Type: `Random`
   - Total: `1000` (número de LEDs)
   - Domain: Box, Size `(4, 4, 4)`
3. Crea un **math POP** (nómbralo `math1`)
   - Conecta `sprinkle1`
   - Operation: `Floor` (discretizar posiciones a grid)
   - Esto crea posiciones en una grilla regular 3D

## Paso 2: Limitar posiciones

1. Crea un **limit POP** (nómbralo `limit1`)
   - Conecta `math1`
   - Min: `(-2, -2, -2)`
   - Max: `(2, 2, 2)`
   - Esto asegura que todos los puntos estén dentro del volumen

## Paso 3: GLSL Compute volumétrico

1. Crea un **GLSL POP** (`glsl1`)
2. Crea un **text DAT** (`glsl1_compute`):

```glsl
// Muestreo volumétrico para LED 3D
uniform float uTime;
uniform float uIntensity;
uniform vec3 uLightPos;
uniform float uLightRadius;

layout(location = 0) in vec3 P;    // Posición del LED
layout(location = 1) in float Id;  // ID del LED

layout(location = 0) out float outIntensity;
layout(location = 1) out vec3 outColor;

void main()
{
    // Calcular intensidad basada en distancia a luz
    vec3 toLight = uLightPos - P;
    float dist = length(toLight);
    float att = 1.0 - smoothstep(0.0, uLightRadius, dist);

    // Efecto volumétrico: densidad del voxel
    float density = sin(P.x * 3.0 + uTime) * cos(P.y * 2.0 + uTime) * 0.5 + 0.5;
    density *= sin(P.z * 4.0 + uTime * 0.7) * 0.5 + 0.5;

    // Color por posición
    vec3 color = vec3(
        P.x * 0.25 + 0.5,
        P.y * 0.25 + 0.5,
        P.z * 0.25 + 0.5
    );

    outIntensity = att * density * uIntensity;
    outColor = color * outIntensity;
}
```

## Paso 4: Asignar canales DMX

1. Crea un **attribute POP** (`attribute1`)
   - Conecta `glsl1`
   - `channelR`: `outColor.r * 255` (canal Rojo, 0-255)
   - `channelG`: `outColor.g * 255` (canal Verde)
   - `channelB`: `outColor.b * 255` (canal Azul)
   - `dmxAddress`: `@ptnum * 3` (dirección DMX base)

## Paso 5: Preparar salida DMX

1. Crea un **baseCOMP** (`dmx_prepare`)
2. Dentro:
   - **select POP**: Extraer canales R, G, B
   - **math POP**: Convertir a rango 0-255
   - **evaluate DAT**: Calcular direcciones DMX

3. Crea un **table DAT** (`dmx_routing_table`)
   - Columnas: `channel`, `dmxAddress`, `universe`
   - Filas: una por cada LED (3 canales cada uno)

## Paso 6: Salida DMX

1. Crea un **dmxout CHOP** (`dmxout1`)
   - Conecta la salida de `dmx_prepare`
   - Universe: `1`
   - Protocol: `Art-Net` o `sACN`
2. Configura la dirección IP del receptor DMX

## Paso 7: Visualización

1. Crea un **render TOP** (`render1`)
   - Conecta `glsl1` → Geometry COMP
   - Resolución: `1280x720`
2. Crea un **level TOP** (`level1`)
   - Brightness: `1.5`
   - Gamma: `0.8`
3. Añade **bloom TOP** (`bloom1`)
   - Intensity: `0.3`

## Matriz de LEDs típica

| Configuración | Dimensiones | LEDs totales | Canales DMX |
|---------------|-------------|--------------|-------------|
| 8x8x8 cube | 512 | 512 | 1536 |
| 16x16x16 cube | 4096 | 4096 | 12288 |
| 4x4x4 mini | 64 | 64 | 192 |
| 10x10x10 dense | 1000 | 1000 | 3000 |

## Parámetros de control

| Parámetro | Tipo | Default | Efecto |
|-----------|------|---------|--------|
| `uIntensity` | Float | 1.0 | Brillo global |
| `uLightPos` | Vec3 | (0,0,0) | Posición de luz |
| `uLightRadius` | Float | 3.0 | Radio de influencia |
| `uTime` | Float | auto | Animación |

## Variante: Patrones predefinidos

1. Crea un **ramp CHOP** con patrones de color
2. Usa **lookupTex POP** para mapear posición a color
3. Patrones comunes:
   - Ola sinusoidal: `sin(P.y * 2 + time)`
   - Espiral: `atan(P.x, P.z) + time`
   - Lluvia: `step(fract(P.y * 2 - time), 0.1)`

## Solución de problemas

- **LEDs no aparecen**: Verifica que `sprinkle1` genere suficientes puntos
- **Color incorrecto**: Revisa el rango de canales (0-255 para DMX)
- **DMX no conecta**: Verifica IP del receptor y configuración de universe
- **Performance lenta**: Reduce número de LEDs o simplifica GLSL

## Consejos

- Usa **Info CHOP** para monitorear cook time
- El GLSL compute mantiene todo en GPU (sin CPU↔GPU bottleneck)
- Para hardware real, prueba con 4x4x4 primero
- Usa **feedback POP** para efectos de persistencia temporal
- Combina con **audio CHOP** para reactividad sonora
- El `dmx_routing_table` facilita la configuración de hardware
