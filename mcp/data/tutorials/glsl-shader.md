---
title: "Integración de Shaders GLSL"
category: "shader"
difficulty: "advanced"
keywords: ["glsl", "shader", "glsl_top", "gpu", "programming", "pixel"]
duration: "40 min"
requires_td: false
---

# Integración de Shaders GLSL

Aprende a escribir y usar shaders GLSL personalizados en TouchDesigner mediante el **GLSL TOP** y **GLSL MAT**.

## Prerrequisitos

- Conocimiento básico de GLSL/HLSL
- TouchDesigner (cualquier licencia)

## Paso 1: GLSL TOP - Shader de píxeles

1. Crea un **GLSL TOP** (nómbralo `my_shader`)
2. Por defecto, el GLSL TOP tiene 3 pestañas: Common, GLSL1, GLSL2, GLSL3
3. En la pestaña **GLSL1** (Pixel Shader), escribe:

```glsl
// TouchDesigner GLSL TOP - Pixel Shader
out vec4 fragColor;

void main()
{
    // Obtener coordenadas UV
    vec2 uv = vUV.st;
    
    // Degradado de rojo
    vec3 color = vec3(uv.x, uv.y, 1.0 - uv.x);
    
    // Círculo
    float d = distance(uv, vec2(0.5));
    float circle = smoothstep(0.4, 0.39, d);
    color = mix(color, vec3(1.0, 0.5, 0.0), circle);
    
    fragColor = TDOutputOJ(color, 1.0);
}
```

## Paso 2: Uniforms y entradas

1. Agrega un **Constant TOP** como entrada (conectado al input 0 del GLSL TOP)
2. En el shader, accede a la entrada:
```glsl
uniform sampler2D sTD2DInputs[1];
// ...
vec4 inputColor = texture(sTD2DInputs[0], vUV.st);
```

3. Agrega uniformes personalizados (aparecen automáticamente en la UI):
```glsl
uniform float uIntensity;
uniform vec3 uColor;
```

4. En parámetros del GLSL TOP, crea:
   - `uIntensity` → Float: 1.0
   - `uColor` → Color: (1, 0, 0)

## Paso 3: Shader con tiempo

```glsl
uniform float uSpeed;

out vec4 fragColor;

void main()
{
    vec2 uv = vUV.st;
    
    // Onda sinusoidal animada
    float wave = sin(uv.x * 20.0 + uSpeed * TIME) * 0.1;
    uv.y += wave;
    
    // Degradado animado en el eje Y modificado
    vec3 color = vec3(uv.y, uv.x * uv.y, 1.0 - uv.y);
    
    fragColor = TDOutputOJ(color, 1.0);
}
```

## Paso 4: GLSL MAT - Shaders en 3D

1. Crea un **GLSL MAT**
2. Tiene pestañas para Vertex, Pixel y Geometry shaders
3. Vertex shader básico:
```glsl
void main()
{
    // Transformación estándar
    vec4 worldPos = TDWorldMat * vec4(P, 1.0);
    vec4 camPos = TDViewMat * worldPos;
    gl_Position = TDProjMat * camPos;
    
    // Pasar UVs al pixel shader
    vUV = vec2(uv[0], uv[1]);
}
```

4. Pixel shader:
```glsl
out vec4 fragColor;

void main()
{
    vec2 uv = vUV.st;
    vec3 color = vec3(uv.x, uv.y, 0.5 + 0.5 * sin(TIME));
    fragColor = TDOutputOJ(color, 1.0);
}
```

## Paso 5: Múltiples pases (GLSL Multì-pass)

1. GLSL TOP soporta múltiples pases de shader
2. Pasa 1: blur horizontal
3. Pasa 2: blur vertical
4. Usa `sTD2DInputs[0]` para la salida del paso anterior

## Referencia rápida de uniformes disponibles

| Uniforme | Tipo | Descripción |
|---|---|---|
| `TIME` | float | Tiempo en segundos |
| `vUV` | vec2 | Coordenadas UV del píxel |
| `uTD2DInfos[0]` | vec4 | Info de la entrada (res, etc.) |
| `sTD2DInputs[0]` | sampler2D | Textura de entrada |
| `TDProjMat` | mat4 | Matriz de proyección |
| `TDViewMat` | mat4 | Matriz de vista |
| `TDWorldMat` | mat4 | Matriz del mundo |
| `P` | vec3 | Posición del vértice (en vertex shader) |
| `N` | vec3 | Normal del vértice (en vertex shader) |

## Consejos

- Para depurar, escribe `fragColor = vec4(vUV, 0.0, 1.0);` - verás las UVs
- Usa **Info CHOP** para exportar valores a uniformes
- Los errores de compilación aparecen en el diálogo del GLSL TOP
- Para shaders complejos, considera usar **ISF (Interactive Shader Format)**
