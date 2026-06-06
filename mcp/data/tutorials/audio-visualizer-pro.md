---
title: "Visualizador de Audio Profesional"
category: "audio"
difficulty: "advanced"
keywords: ["audio", "visualizer", "professional", "spectrum", "reactive", "chop", "top"]
duration: "55 min"
requires_td: true
---

# Visualizador de Audio Profesional

Crea un visualizador de audio de nivel profesional combinando Audio CHOPs, geometría 3D, partículas y shaders GLSL en TouchDesigner.

## Requisitos

- TouchDesigner Pro (licencia Comercial o EDU)
- Conocimientos de CHOPs y TOPs
- Archivo de audio o entrada de micrófono

## Paso 1: Cadena de análisis de audio

1. Crea un **Audio File In CHOP** (nómbralo `audio_source`)
2. Conecta la siguiente cadena de análisis:

```
[Audio File In] → [Audio Band EQ] → [Math (Range)] → [Filter] → [Datos]
                → [Audio Spectrum] → [Math (Range)] → [Filter] → [Datos]
                → [Audio Analysis] → [Dat Fork] → [Datos BPM/tempo]
```

3. Configura Audio Band EQ:
   - 4-8 bandas distribuidas logarítmicamente
   - Frecuencias: 60Hz, 250Hz, 1kHz, 4kHz, 12kHz
4. Configura Audio Spectrum:
   - Resolution: `512` o `1024`
   - Gain: `15`
   - Output: `Magnitude`

## Paso 2: Procesamiento avanzado de datos

1. Conecta un **Math CHOP** con operación `Range`:
   - From Range: `0.0` a `1.0`
   - To Range: `0.0` a `1.0`
2. Conecta un **Filter CHOP** para suavizar:
   - Type: `Smooth`
   - Filter Width: `10` (frames)
3. Conecta un **Limit CHOP**:
   - Limit Min: `0.02`
   - Limit Max: `1.0`

### Detección de BPM
1. Conecta un **Audio Analysis CHOP** a `audio_source`
2. Parámetros:
   - Volume: activar
   - Rate: `60`
   - Tempo: activar
3. Usa un **Dat Fork** para extraer BPM y beats

## Paso 3: Visualizador 3D de barras

1. Crea un **Geometry COMP** (nómbralo `bars_3d`)
2. Dentro, crea múltiples **Rectangle SOP** (uno por banda)
3. Para cada rectángulo:
   - Size X: `0.1`
   - Size Y: dinámico desde CHOP
4. Usa expresiones en Translate Y:
   ```
   op('audio_eq')[0,'val1'] * 5
   ```

### Técnica de instancing para barras
1. Crea un solo **Grid SOP** como template
2. Usa **Copy SOP** con instancing
3. En un **Attribute Create SOP**:
   - Name: `scale`
   - Value: del Audio Spectrum
4. En el Geometry COMP, activa `Instancing`
5. Apunta `scale` al atributo personalizado

## Paso 4: Visualizador de espectro circular

1. Crea un **Circle SOP** con subdivisiones:
   - Radius: `2`
   - Segments: `64` (uno por cada bin del spectrum)
2. Usa expresiones para desplazar cada punto radialmente:
   - En un **Point SOP**, usa:
   - `tx *= 1 + op('audio_spectrum')[me.id, 'chan1'] * 2`
3. Conecta a un **Geometry COMP** con material Phong
4. Añade un **Ribbon SOP** para conectar los puntos

## Paso 5: Partículas reactivas

1. Crea un **POP Network COMP**
2. Configura POP Source:
   - Rate: `op('audio_analysis')[0,'volume'] * 500 + 50`
   - Life: `op('audio_analysis')[0,'tempo'] * 0.1 + 2`
   - Init Velocity: `(0, op('audio_eq')[0,'val1'] * 10, 0)`
3. Conecta un **POP Force** con:
   - Gravity: `(0, -5, 0)`
4. POP Render:
   - Render Type: `Sprites`
   - Sprite Size: `op('audio_spectrum')[0,'peak'] * 0.5 + 0.1`

## Paso 6: Waveform visual con GLSL

1. Crea un **GLSL TOP** para renderizar waveform personalizado
2. Usa este código en el pixel shader:

```glsl
uniform float u_spectrum[512];
uniform vec2 u_resolution;

out vec4 fragColor;

void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution;
    float bin = u_spectrum[int(uv.x * 512)];
    float wave = smoothstep(bin - 0.02, bin, uv.y);
    fragColor = vec4(mix(vec3(0.0), vec3(uv.x, 1.0 - uv.x, 1.0), wave), 1.0);
}
```

3. Conecta los datos del spectrum como uniform inputs

## Paso 7: Composición final

1. Combina todas las capas visuales:

```
Layer 1: [Barras 3D] ─┐
Layer 2: [Espectro circular] ─┤→ [Composite TOP] → [Blur] → [Output]
Layer 3: [Partículas] ────────┘
Layer 4: [Waveform GLSL] ─────┘ (opcional)
```

2. Usa **Composite TOP** con diferentes blend modes:
   - Barras con `Screen` (base)
   - Partículas con `Add` (destellos)
   - Waveform con `Over` (overlay)

## Consejos profesionales

- **Previsualización**: Usa **Audio Monitor CHOP** para monitorear niveles
- **Sincronía**: Ajusta filtros para que coincidan con el género musical
- **Performance**: Renderiza capas a menor resolución si es necesario
- **MIDI**: Combina con **MIDI In CHOP** para triggers manuales durante el live
- **Presets**: Guarda configuraciones de filtros para diferentes géneros
- **Export**: Empaqueta como tox para usar en Arena o producción
