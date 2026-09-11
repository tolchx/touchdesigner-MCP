# Guía Completa: GLSL Shaders Adaptados para TouchDesigner GLSL POP

Fuente: [fullscreencode.com/ejemplosshaders/](https://fullscreencode.com/ejemplosshaders/)
Adaptación: TouchDesigner GLSL POP (Point Operator)

---

## 📋 Índice

1. [Introducción a GLSL POP](#1-introducción-a-glsl-pop)
2. [Diferencias Fragment vs Compute Shader](#2-diferencias-fragment-vs-compute-shader)
3. [Built-ins de TouchDesigner](#3-built-ins-de-touchdesigner)
4. [Capítulo 2: Osciladores (Sin Waves)](#4-capítulo-2-osciladores)
5. [Capítulo 3: Mezcla de Colores (HSB/RGB)](#5-capítulo-3-mezcla-de-colores)
6. [Capítulo 4: Formas (Círculos/Polygons)](#6-capítulo-4-formas)
7. [Capítulo 5: Transformaciones (TRS)](#7-capítulo-5-transformaciones)
8. [Capítulo 6: Subdivisión del Espacio](#8-capítulo-6-subdivisión-del-espacio)
9. [Capítulo 7: Iteración y Loops](#9-capítulo-7-iteración-y-loops)
10. [Capítulo 10: Patrones Generativos](#10-capítulo-10-patrones-generativos)
11. [Capítulo 11: Fractales](#11-capítulo-11-fractales)
12. [Capítulo 12-13: Raymarching](#12-capítulo-12-13-raymarching)
13. [Plantilla Base GLSL POP](#13-plantilla-base-glsl-pop)
14. [Reglas de Conexión POP→POP](#14-reglas-de-conexión-poppop)
15. [Parámetros Sequence (Pulse/Button)](#15-parámetros-sequence-tipo-pulsebutton)
16. [Reglas de Conexión Cross-Family](#16-reglas-de-conexión-cross-family)
17. [glslTOP npasses — Multi-Pass](#17-glsltop-npasses--multi-pass-intra-frame-rendering)
18. [BUILD ORDER — Wire BEFORE Computedat](#18-build-order--wire-before-computedat)
19. [Parámetros const (Uniforms via TD)](#19-parámetros-const-uniforms-via-td)

---

## 1. Introducción a GLSL POP

### ¿Qué es un GLSL POP?

El GLSL POP es un operador de TouchDesigner que ejecuta **compute shaders** GLSL sobre puntos (particles). A diferencia de un fragment shader que procesa píxeles, un compute shader procesa **cada punto** de una red POP.

### Flujo de datos

```
┌─────────────┐    ┌──────────────┐    ┌─────────────┐
│  boxPOP     │───▶│  glslPOP     │───▶│  nullPOP    │
│  (fuente)   │    │  (compute)   │    │  (salida)   │
└─────────────┘    └──────────────┘    └─────────────┘
                   Lee: P, Cd, N
                   Escribe: P, Cd, N
```

### ⚡ Quick Start (Paso a Paso)

**Paso 1: Crear la red base**
```
/project1
  ├── boxPOP (nombre: "src")
  ├── textDAT (nombre: "shader_code") → pegar el GLSL
  ├── glslPOP (nombre: "my_shader")
  └── nullPOP (nombre: "output")
```

**Paso 2: Conectar**
```
boxPOP → glslPOP → nullPOP
```

**Paso 3: Configurar glslPOP**
- Seleccionar el `glslPOP`
- En Parámetros:
  - `Compute DAT` → seleccionar el `textDAT` con el shader
  - `Output Attributes` → escribir `'P Cd'` (o solo `'P'` si solo modificas posición)

**Paso 4: Custom Uniforms (parámetros personalizados)**
Los shaders declaran uniforms como `u_amplitude`, `u_speed`, etc. **Estos deben crearse como parámetros en el glslPOP:**
1. Seleccionar el `glslPOP`
2. Ir a la pestaña "Parameters" → "Custom" 
3. Agregar parámetros con los mismos nombres que los uniforms:
   - Nombre: `amplitude`, Tipo: Float, Valor: `0.5`
   - Nombre: `speed`, Tipo: Float, Valor: `1.0`
   - Nombre: `frequency`, Tipo: Float, Valor: `10.0`
4. En el shader, los uniforms se mapean automáticamente:
   - `uniform float u_amplitude;` ← lee del parámetro `amplitude`
   - `uniform float u_speed;` ← lee del parámetro `speed`

**Paso 5: Probar**
1. Crear un `boxPOP` con `1000` puntos
2. Conectar `boxPOP` → `glslPOP`
3. Conectar `glslPOP` → `nullPOP`
4. Ver el resultado en el Geometry Viewer del `nullPOP`
5. Ajustar parámetros en tiempo real

### Configuración manual (referencia)

1. Crear un `boxPOP` como fuente de puntos
2. Crear un `textDAT` con el código GLSL
3. Crear un `glslPOP` con:
   - `par.computedat` → nombre del textDAT
   - `par.outputattrs` → atributos a escribir (ej: `'P'`, `'P Cd'`)
4. Conectar: boxPOP → glslPOP → nullPOP
5. Agregar parámetros custom en el glslPOP para cada uniform

---

## 2. Diferencias Fragment vs Compute Shader

### Fragment Shader (original del sitio)

```glsl
// Fragment shader - procesa PÍXELES
// Salida: color del píxel (vec4)
void main() {
    vec2 uv = gl_FragCoord.xy / iResolution.xy;
    vec3 color = /* ... */;
    gl_FragColor = vec4(color, 1.0);
}
```

### Compute Shader (adaptado para TD GLSL POP)

```glsl
// Compute shader - procesa PUNTOS
// Salida: modifica atributos del punto (P, Cd, N, etc.)
void main() {
    uint id = TDIndex();
    if (id >= uNumPoints) return;
    
    vec3 pos = TDIn_P(0, id);
    // ... modificar pos ...
    P[id] = pos;
}
```

### Tabla de conversión

| Fragment Shader | Compute Shader (TD GLSL POP) |
|----------------|------------------------------|
| `gl_FragCoord.xy` | `TDIndex()` (índice del punto) |
| `iResolution.xy` | `uNumPoints` (total de puntos) |
| `iTime` | `u_time` |
| `gl_FragColor = vec4(c, 1.0)` | `Cd[id] = vec4(c, 1.0)` |
| `uv = gl_FragCoord.xy / iResolution.xy` | `uv = vec2(fract(float(id) / uNumPoints), 0.0)` |
| `texture2D(iChannel0, uv)` | `TDIn_P(0, id)` o `TDIn_Cd(0, id)` |

---

## 3. Built-ins de TouchDesigner

### Uniforms automáticos

```glsl
uniform float u_time;        // Tiempo en segundos
uniform int uNumPoints;      // Total de puntos
```

### Funciones de acceso

```glsl
// Leer posición del input 0
vec3 TDIn_P(int inputIndex, uint pointIndex);

// Leer color del input 0
vec4 TDIn_Cd(int inputIndex, uint pointIndex);

// Leer normal del input 0
vec3 TDIn_N(int inputIndex, uint pointIndex);

// Índice del punto actual
uint TDIndex();
```

### Atributos de escritura

```glsl
// Declarar en el shader:
vec3 P[];      // Posición (vec3 o vec4)
vec4 Cd[];     // Color RGBA
vec3 N[];      // Normal
vec2 uv[];     // Coordenadas UV
```

### Includes disponibles

```glsl
#include "util_noise.glsl"    // Simplex, Perlin, Curl noise
#include "util.glsl"          // Utilidades generales
```

---

## 4. Capítulo 2: Osciladores (Sin Waves)

### Original (Fragment Shader)

```glsl
// Onda sinusoidal básica
void main() {
    vec2 uv = gl_FragCoord.xy / iResolution.xy;
    float wave = sin(uv.x * 10.0 + iTime);
    vec3 color = vec3(wave);
    gl_FragColor = vec4(color, 1.0);
}
```

### Adaptado (TD GLSL POP)

```glsl
// Onda sinusoidal sobre posición Y de puntos
// Archivo: glsl_files/sin_wave.glsl

uniform float u_time;

void main() {
    uint id = TDIndex();
    if (id >= uNumPoints) return;
    
    vec3 pos = TDIn_P(0, id);
    
    // Mapear índice a coordenada X normalizada [0, 1]
    float t = float(id) / float(uNumPoints - 1);
    
    // Onda sinusoidal
    float wave = sin(t * 10.0 + u_time) * 0.5;
    
    // Aplicar al eje Y
    pos.y = wave;
    
    P[id] = pos;
}
```

### Variaciones

```glsl
// Ondas anidadas (Cap 2.5)
float wave = sin(t * 10.0 + u_time) * 0.3;
wave += sin(t * 20.0 - u_time * 1.5) * 0.15;
wave += sin(t * 5.0 + u_time * 0.7) * 0.2;

// Frecuencia controlada (Cap 2.3)
float freq = 10.0 + sin(u_time * 0.5) * 5.0;
float wave = sin(t * freq + u_time);
```

---

## 5. Capítulo 3: Mezcla de Colores (HSB/RGB)

### Función HSB a RGB

```glsl
// Conversión HSB a RGB (Cap 3.2)
vec3 hsb2rgb(vec3 c) {
    vec3 rgb = clamp(abs(mod(c.x * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
    rgb = rgb * rgb * (3.0 - 2.0 * rgb);
    return c.z * mix(vec3(1.0), rgb, c.y);
}
```

### Adaptado (TD GLSL POP)

```glsl
// Gradiente arcoíris sobre los puntos
// Archivo: glsl_files/rainbow_gradient.glsl

uniform float u_time;

vec3 hsb2rgb(vec3 c) {
    vec3 rgb = clamp(abs(mod(c.x * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
    rgb = rgb * rgb * (3.0 - 2.0 * rgb);
    return c.z * mix(vec3(1.0), rgb, c.y);
}

void main() {
    uint id = TDIndex();
    if (id >= uNumPoints) return;
    
    float t = float(id) / float(uNumPoints - 1);
    
    // Hue varía con el tiempo y la posición
    float hue = fract(t + u_time * 0.1);
    float saturation = 0.8;
    float brightness = 0.9;
    
    vec3 color = hsb2rgb(vec3(hue, saturation, brightness));
    Cd[id] = vec4(color, 1.0);
}
```

### Animación con mix (Cap 3.1)

```glsl
// Mezcla de dos colores animada
vec3 color1 = vec3(1.0, 0.0, 0.5);  // Rosa
vec3 color2 = vec3(0.0, 0.5, 1.0);  // Azul
float mixFactor = sin(u_time + t * 3.14159) * 0.5 + 0.5;
vec3 color = mix(color1, color2, mixFactor);
Cd[id] = vec4(color, 1.0);
```

---

## 6. Capítulo 4: Formas (Círculos/Polygons)

### Círculo con smoothstep (Cap 4.4)

```glsl
// Fragment shader original
void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * iResolution.xy) / iResolution.y;
    float d = length(uv);
    float circle = smoothstep(0.3, 0.29, d);
    vec3 color = vec3(circle);
    gl_FragColor = vec4(color, 1.0);
}
```

### Adaptado (TD GLSL POP) - Movimiento de puntos en círculo

```glsl
// Puntos distribuidos en círculo
// Archivo: glsl_files/circle_distribution.glsl

uniform float u_time;

#define PI 3.14159265359

void main() {
    uint id = TDIndex();
    if (id >= uNumPoints) return;
    
    float t = float(id) / float(uNumPoints - 1);
    
    // Ángulo base + rotación temporal
    float angle = t * 2.0 * PI + u_time * 0.5;
    
    // Radio con variación
    float radius = 1.0 + sin(t * 20.0 + u_time * 2.0) * 0.2;
    
    // Posición en círculo
    vec3 pos;
    pos.x = cos(angle) * radius;
    pos.y = sin(angle) * radius;
    pos.z = 0.0;
    
    P[id] = pos;
    
    // Color basado en posición angular
    vec3 color = hsb2rgb(vec3(t, 0.8, 0.9));
    Cd[id] = vec4(color, 1.0);
}
```

### Polígono regular (Cap 4.6)

```glsl
// Función para distancia a polígono
float sdPolygon(vec2 p, float r, int n) {
    float an = PI / float(n);
    float en = PI / float(n);
    vec2 acs = vec2(cos(an), sin(an));
    vec2 ecs = vec2(cos(en), sin(en));
    float bn = mod(atan(p.x, p.y), 2.0 * an) - an;
    p = length(p) * vec2(cos(bn), abs(sin(bn)));
    p -= r * acs;
    p += ecs * clamp(-dot(p, ecs), 0.0, r * acs.y / ecs.y);
    return length(p) * sign(p.x);
}
```

---

## 7. Capítulo 5: Transformaciones (TRS)

### Translate, Rotate, Scale (Cap 5.3)

```glsl
// Matrices de transformación 2D
mat2 rotate2d(float angle) {
    float s = sin(angle);
    float c = cos(angle);
    return mat2(c, -s, s, c);
}

mat2 scale(float sx, float sy) {
    return mat2(sx, 0.0, 0.0, sy);
}
```

### Adaptado (TD GLSL POP)

```glsl
// Transformaciones completas sobre puntos
// Archivo: glsl_files/transformations.glsl

uniform float u_time;

mat2 rotate2d(float angle) {
    float s = sin(angle);
    float c = cos(angle);
    return mat2(c, -s, s, c);
}

void main() {
    uint id = TDIndex();
    if (id >= uNumPoints) return;
    
    vec3 pos = TDIn_P(0, id);
    
    // Aplicar rotación en eje Z
    float angle = u_time * 0.5;
    pos.xy = rotate2d(angle) * pos.xy;
    
    // Aplicar escala pulsante
    float scale = 1.0 + sin(u_time * 2.0) * 0.3;
    pos *= scale;
    
    // Aplicar traslación sinusoidal
    pos.x += sin(u_time) * 0.5;
    pos.y += cos(u_time) * 0.5;
    
    P[id] = pos;
}
```

---

## 8. Capítulo 6: Subdivisión del Espacio

### Fract para repetición (Cap 6.1)

```glsl
// Fragment shader original
void main() {
    vec2 uv = gl_FragCoord.xy / iResolution.xy;
    uv *= 10.0;  // Subdividir en 10x10 celdas
    uv = fract(uv);
    vec3 color = vec3(uv, 0.0);
    gl_FragColor = vec4(color, 1.0);
}
```

### Adaptado (TD GLSL POP) - Patrón de grilla

```glsl
// Puntos distribuidos en grilla con patrón
// Archivo: glsl_files/grid_pattern.glsl

uniform float u_time;

void main() {
    uint id = TDIndex();
    if (id >= uNumPoints) return;
    
    // Convertir índice a posición 2D en grilla
    float gridSize = ceil(sqrt(float(uNumPoints)));
    float x = mod(float(id), gridSize);
    float y = floor(float(id) / gridSize);
    
    // Normalizar a [-1, 1]
    vec2 uv = vec2(x, y) / (gridSize - 1.0) * 2.0 - 1.0;
    
    // Patrón basado en distancia al centro
    float d = length(uv);
    float pattern = smoothstep(0.8, 0.2, d);
    
    // Animación
    uv += sin(u_time + d * 3.0) * 0.1;
    
    vec3 pos = vec3(uv, 0.0);
    P[id] = pos;
    
    vec3 color = vec3(pattern, uv.x * 0.5 + 0.5, uv.y * 0.5 + 0.5);
    Cd[id] = vec4(color, 1.0);
}
```

---

## 9. Capítulo 7: Iteración y Loops

### Círculos radiales (Cap 7.1)

```glsl
// Fragment shader original
void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * iResolution.xy) / iResolution.y;
    vec3 color = vec3(0.0);
    for (int i = 0; i < 10; i++) {
        float angle = float(i) / 10.0 * 6.28318;
        vec2 center = vec2(cos(angle), sin(angle)) * 0.3;
        float d = length(uv - center);
        color += smoothstep(0.1, 0.09, d);
    }
    gl_FragColor = vec4(color, 1.0);
}
```

### Adaptado (TD GLSL POP) - Espiral de puntos

```glsl
// Puntos en espiral con iteración
// Archivo: glsl_files/spiral_points.glsl

#define PI 3.14159265359
#define TAU 6.28318530718

uniform float u_time;

void main() {
    uint id = TDIndex();
    if (id >= uNumPoints) return;
    
    float t = float(id) / float(uNumPoints - 1);
    
    // Espiral: ángulo crece con el índice
    float turns = 5.0;
    float angle = t * turns * TAU + u_time;
    
    // Radio creciente
    float radius = t * 2.0;
    
    // Agregar variación orgánica
    radius += sin(t * 30.0 + u_time * 2.0) * 0.1;
    
    vec3 pos;
    pos.x = cos(angle) * radius;
    pos.y = sin(angle) * radius;
    pos.z = t * 2.0 - 1.0;  // Altura creciente
    
    P[id] = pos;
    
    // Color por iteración
    vec3 color = hsb2rgb(vec3(t, 0.7, 0.9));
    Cd[id] = vec4(color, 1.0);
}
```

---

## 10. Capítulo 10: Patrones Generativos

### Ruido para generación orgánica

```glsl
// Patrón generativo con ruido
// Archivo: glsl_files/generative_pattern.glsl

#include "util_noise.glsl"

uniform float u_time;

void main() {
    uint id = TDIndex();
    if (id >= uNumPoints) return;
    
    vec3 pos = TDIn_P(0, id);
    
    // Coordenadas para ruido
    vec3 noisePos = pos * 2.0 + u_time * 0.3;
    
    // Múltiples capas de ruido (fractal noise)
    float n = 0.0;
    n += snoise(noisePos * 1.0) * 0.5;
    n += snoise(noisePos * 2.0) * 0.25;
    n += snoise(noisePos * 4.0) * 0.125;
    
    // Aplicar desplazamiento
    pos += vec3(n * 0.3, snoise(noisePos + 100.0) * 0.3, 0.0);
    
    P[id] = pos;
    
    // Color basado en ruido
    vec3 color = vec3(n * 0.5 + 0.5);
    Cd[id] = vec4(color, 1.0);
}
```

---

## 11. Capítulo 11: Fractales

### Mandelbrot/Julia adaptado

```glsl
// Fractal simplificado para GLSL POP
// Archivo: glsl_files/fractal_displacement.glsl

uniform float u_time;

vec2 cmul(vec2 a, vec2 b) {
    return vec2(a.x*b.x - a.y*b.y, a.x*b.y + a.y*b.x);
}

void main() {
    uint id = TDIndex();
    if (id >= uNumPoints) return;
    
    vec3 pos = TDIn_P(0, id);
    
    // Mapear posición a plano complejo
    vec2 c = pos.xy * 1.5;
    vec2 z = vec2(0.0);
    
    // Parámetro Julia
    vec2 juliaC = vec2(
        -0.7 + sin(u_time * 0.2) * 0.1,
        0.27015 + cos(u_time * 0.3) * 0.1
    );
    
    // Iteraciones
    float iter = 0.0;
    for (int i = 0; i < 20; i++) {
        z = cmul(z, z) + juliaC;
        if (dot(z, z) > 4.0) break;
        iter += 1.0;
    }
    
    // Color basado en iteraciones
    float t = iter / 20.0;
    vec3 color = hsb2rgb(vec3(t + u_time * 0.1, 0.8, 0.9));
    
    // Desplazar puntos según fractal
    pos.z += t * 2.0 - 1.0;
    
    P[id] = pos;
    Cd[id] = vec4(color, 1.0);
}
```

---

## 12. Capítulo 12-13: Raymarching

### SDF (Signed Distance Function) para GLSL POP

```glsl
// Raymarching simplificado para partículas
// Archivo: glsl_files/raymarching_pop.glsl

uniform float u_time;

// SDF de esfera
float sdSphere(vec3 p, float r) {
    return length(p) - r;
}

// SDF de caja
float sdBox(vec3 p, vec3 b) {
    vec3 q = abs(p) - b;
    return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

// Unión de SDFs
float opUnion(float d1, float d2) {
    return min(d1, d2);
}

void main() {
    uint id = TDIndex();
    if (id >= uNumPoints) return;
    
    vec3 pos = TDIn_P(0, id);
    
    // Escena con múltiples objetos
    float d1 = sdSphere(pos - vec3(sin(u_time) * 2.0, 0.0, 0.0), 0.5);
    float d2 = sdBox(pos - vec3(0.0, cos(u_time) * 2.0, 0.0), vec3(0.3));
    float d = opUnion(d1, d2);
    
    // Desplazar puntos según distancia
    vec3 normal = normalize(pos);
    pos += normal * d * 0.5;
    
    P[id] = pos;
    
    // Color por distancia
    vec3 color = vec3(smoothstep(0.0, 1.0, d));
    Cd[id] = vec4(color, 1.0);
}
```

---

## 13. Plantilla Base GLSL POP

```glsl
// ============================================
// PLANTILLA BASE - GLSL POP para TouchDesigner
// ============================================
// Copia este archivo y modifica según necesites

uniform float u_time;        // Tiempo en segundos
// uniform float u_speed;    // Custom uniform (agregar en parámetros)
// uniform float u_amplitude; // Custom uniform

void main() {
    // Obtener índice del punto actual
    uint id = TDIndex();
    
    // Guarda de seguridad
    if (id >= uNumPoints) return;
    
    // Leer posición del input 0
    vec3 pos = TDIn_P(0, id);
    
    // Leer color del input 0 (opcional)
    // vec4 col = TDIn_Cd(0, id);
    
    // ============================================
    // TU CÓDIGO AQUÍ
    // ============================================
    
    // Ejemplo: movimiento sinusoidal
    float t = float(id) / float(uNumPoints - 1);
    pos.y += sin(t * 10.0 + u_time) * 0.5;
    
    // ============================================
    // ESCRIBIR RESULTADOS
    // ============================================
    
    // Escribir posición modificada
    P[id] = pos;
    
    // Escribir color (opcional)
    // Cd[id] = vec4(1.0, 0.5, 0.0, 1.0);
    
    // Escribir normal (opcional)
    // N[id] = vec3(0.0, 0.0, 1.0);
}
```

### Parámetros TD necesarios

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `computedat` | String | Nombre del textDAT con el shader |
| `outputattrs` | String | Atributos a escribir (ej: `'P'`, `'P Cd'`) |
| `inputsmooth` | Int | Suavizado de input (0-10) |

### Custom Uniforms

Para agregar uniforms personalizados, crear parámetros en el glslPOP:

```python
# En TouchDesigner, en el glslPOP:
op('/project1/my_glslop').par.speed = 1.0
op('/project1/my_glslop').par.amplitude = 0.5
```

Y en el shader:

```glsl
uniform float u_speed;
uniform float u_amplitude;

void main() {
    // ...
    pos.y += sin(t * 10.0 + u_time * u_speed) * u_amplitude;
    // ...
}
```

---

## 14. Reglas de Conexión POP→POP

### Regla fundamental: misma familia

En TouchDesigner, los operadores **solo pueden conectarse dentro de la misma familia**. Usar `outputConnectors[0].connect()` entre familias diferentes produce un error:

```
td.tdError: Invalid number or type of arguments.
```

### Tabla de conexiones válidas

| Origen | Destino | ¿Válida? | Método |
|--------|---------|----------|--------|
| `glslPOP` | `nullPOP` | ✅ | `outputConnectors[0].connect(op('nullPOP'))` |
| `glsladvancedPOP` | `nullPOP` | ✅ | `outputConnectors[0].connect(op('nullPOP'))` |
| `boxPOP` | `glslPOP` | ✅ | `outputConnectors[0].connect(op('glslPOP'))` |
| `feedbackPOP` | `glslPOP` | ✅ | `outputConnectors[0].connect(op('glslPOP'))` |
| `glslPOP` | `nullTOP` | ❌ | Cross-family — no funciona |
| `glsladvancedPOP` | `nullTOP` | ❌ | Cross-family — no funciona |
| `boxPOP` | `glslTOP` | ❌ | Cross-family — no funciona |
| `noiseTOP` | `glslPOP` | ❌ | Cross-family — no funciona |

### Las 7 familias de operadores

```
🔵 COMP (baseCOMP, geometryCOMP, containerCOMP)
🟢 TOP  (glslTOP, nullTOP, noiseTOP, feedbackTOP, compositeTOP)
🟡 CHOP (noiseCHOP, lfoCHOP, mathCHOP)
🟠 SOP  (sphereSOP, boxSOP)
🔴 POP  (boxPOP, glslPOP, glsladvancedPOP, nullPOP, feedbackPOP, particlePOP)
🟣 DAT  (textDAT, nullDAT)
⚪ MAT  (phongMAT, pbrMAT, glslMAT)
```

### Conexiones correctas para GLSL POP

```python
# ✅ POP → POP (correcto)
src.outputConnectors[0].connect(op('/project1/my_glslop'))
glslop.outputConnectors[0].connect(op('/project1/output'))

# ❌ POP → TOP (INCORRECTO — produce td.tdError)
# src.outputConnectors[0].connect(op('/project1/my_nulltop'))  # NO FUNCIONA

# Para bridgear POP → TOP, usar un Geometry COMP intermedio
# o un toPOP/toTOP operator (si están disponibles)
```

### Patrón correcto: glslPOP → nullPOP

```python
# Crear y conectar glslPOP → nullPOP
glslop = op('/project1').create(td.glslPOP, 'my_shader')
null_out = op('/project1').create(td.nullPOP, 'output')

# Conectar (ambos son POP)
src.outputConnectors[0].connect(glslop)
glslop.outputConnectors[0].connect(null_out)
```

---

## 15. Parámetros Sequence (Tipo Pulse/Button)

### ¿Qué es un parámetro Sequence?

Algunos parámetros en TouchDesigner son de tipo **Sequence** (pulso/botón). Cuando se les asigna un valor, ejecutan una acción y **reinician su valor a 0 inmediatamente**. No mantienen estado persistente.

### Ejemplo: `extraout` en glsladvancedPOP

El parámetro `extraout` de `glsladvancedPOP` es un Sequence param:

```python
# ❌ Esto NO persiste — extraout vuelve a 0 después del pulse
o.par.extraout = 1
print(o.par.extraout.eval())  # → 0 (no 1!)

# ✅ Para verificar que el parámetro existe:
o.par.extraout  # Accessor funciona
hasattr(o.par, 'extraout')  # → True

# Los parámetros ASOCIADOS sí persisten:
o.par.extraout0name = 'myVelocity'
print(o.par.extraout0name.eval())  # → 'myVelocity' ✅
```

### Tabla de parámetros Sequence conocidos

| Operador | Parámetro | Tipo | Comportamiento |
|----------|-----------|------|----------------|
| `glsladvancedPOP` | `extraout` | Sequence | Pulse → resetea a 0 |
| `glslTOP` | `loaduniformnames` | Sequence | Pulse → recarga uniforms |
| `feedbackTOP` | `reset` | Sequence | Pulse → resetea buffer |
| `noiseTOP` | `resync` | Sequence | Pulse → resync ruido |

### Cómo verificar parámetros Sequence correctamente

```python
# Verificar que un Sequence param está configurado:
def verify_sequence_param(op_node, param_name, associated_params):
    """Sequence params se resetean, así que verificamos los parámetros
    asociados que sí persisten."""
    # 1. Verificar que el param existe
    if not hasattr(op_node.par, param_name):
        return False, f'{param_name} not found'
    
    # 2. Verificar que los parámetros asociados están seteados
    for ap in associated_params:
        if not hasattr(op_node.par, ap):
            return False, f'{ap} not found'
    
    return True, 'configured'

# Ejemplo: verificar extraout en glsladvancedPOP
ok, msg = verify_sequence_param(
    op('/project1/glslop'),
    'extraout',  # Sequence param (se resetea)
    ['extraout0name', 'extraout0ptattrs']  # Asociados (persisten)
)
```

### Cómo setear uniforms via `const0name`/`const0value`

El parámetro `const` es un **Sequence de parámetros** (múltiples entradas) disponible en `glslTOP`:

```python
# glslTOP tiene la página "Constants" con:
#   const0name (String) — nombre del uniform en el shader
#   const0value (Float) — valor del uniform
#   const1name, const1value, etc. para uniforms adicionales

o = op('/project1/my_glsltop')
o.par.const0name = 'u_feed'
o.par.const0value = 0.055
o.par.const1name = 'u_kill'
o.par.const1value = 0.062

# Verificar:
print(o.par.const0name.eval())  # → 'u_feed'
print(o.par.const0value.eval())  # → 0.055
```

⚠️ **Nota (actualizado Julio 2026)**: `const0name`/`const0value` existen en `glslTOP`, `glslPOP`, y `glsladvancedPOP`. En `glslcopyPOP`, los uniforms se controlan a través de parámetros custom.

---

## 16. Reglas de Conexión Cross-Family

### Bridging entre familias

Cuando necesitas pasar datos entre familias diferentes, existen opciones limitadas:

| Desde | Hacia | Bridge Operator |
|-------|-------|------------------|
| POP | TOP | `toTOP` (no disponible como `td.toTOP`) |
| TOP | POP | `toPOP` (no disponible como `td.toPOP`) |
| POP | CHOP | `popToChop` |
| CHOP | TOP | `CHOP To` |
| SOP | TOP | `SOP To` |

### Limitaciones conocidas del Python API

```python
# ❌ toPOP y toTOP NO están disponibles como constantes td:
td.toPOP  # AttributeError
td.toTOP  # AttributeError

# ✅ Alternativas:
# 1. Usar create() con string type:
op('/project1').create('toPOP', 'bridge')  # ← no funciona

# 2. Usar Geometry COMP que renderiza POP → TOP automáticamente

# 3. Usar un DAT + exec para inspeccionar POP data sin bridge visual
result = td.exec("""import json
o = op('/project1/my_pop')
print(json.dumps({'pointCount': len(o.points)}))
""")
```

---

## 17. glslTOP npasses — Multi-Pass Intra-Frame Rendering

### ¿Qué es npasses?

El parámetro `npasses` de `glslTOP` permite ejecutar el shader **múltiples veces dentro de un solo frame**. Cada pasada (pass) puede realizar una operación diferente, acumulando resultados progresivamente.

### Configuración

```python
# Establecer npasses en glslTOP
glsltop = op('/project1/my_glsltop')
glsltop.par.npasses = 4  # Ejecutar 4 pasadas por frame
```

### Built-in: uTDPass

Dentro del shader, la variable `uTDPass` indica el **índice del pasada actual** (0-based):

```glsl
// uTDPass es un Int que va de 0 a npasses-1
// Ejemplo: si npasses=4, uTDPass será 0, 1, 2, 3
```

### Patrón 1: Progressive Blur (4 pasadas)

Cada pasada aplica un blur 3x3, suavizando progresivamente:

```glsl
// 4-pass progressive blur
// Pasada 0: passthrough
// Pasadas 1-3: blur incremental
out vec4 fragColor;
void main() {
    vec2 texel = 1.0 / uTDOutputInfo.res;
    vec4 color = texture(sTD2DInputs[0], vUV.st);
    
    if (uTDPass > 0) {
        // Aplicar blur 3x3 en pasadas > 0
        vec4 sum = vec4(0.0);
        for (int x = -1; x <= 1; x++) {
            for (int y = -1; y <= 1; y++) {
                vec2 offset = vec2(float(x), float(y)) * texel;
                sum += texture(sTD2DInputs[0], vUV.st + offset);
            }
        }
        color = sum / 9.0;
    }
    
    fragColor = TDOutputSwizzle(color);
}
```

### Patrón 2: Edge Detect + Glow (3 pasadas)

Cada pasada realiza una operación diferente:

```glsl
// Pasada 0: Sobel edge detection
// Pasada 1: Blur de los bordes
// Pasada 2: Compositar original + bordes difusos
out vec4 fragColor;
void main() {
    vec2 texel = 1.0 / uTDOutputInfo.res;
    vec2 uv = vUV.st;
    vec4 color = texture(sTD2DInputs[0], uv);
    
    if (uTDPass == 0) {
        // Edge detect: Sobel (8 neighbors)
        vec4 tl = texture(sTD2DInputs[0], uv + vec2(-texel.x, -texel.y));
        vec4 tc = texture(sTD2DInputs[0], uv + vec2(0.0, -texel.y));
        vec4 tr = texture(sTD2DInputs[0], uv + vec2(texel.x, -texel.y));
        vec4 ml = texture(sTD2DInputs[0], uv + vec2(-texel.x, 0.0));
        vec4 mr = texture(sTD2DInputs[0], uv + vec2(texel.x, 0.0));
        vec4 bl = texture(sTD2DInputs[0], uv + vec2(-texel.x, texel.y));
        vec4 bc = texture(sTD2DInputs[0], uv + vec2(0.0, texel.y));
        vec4 br = texture(sTD2DInputs[0], uv + vec2(texel.x, texel.y));
        vec3 sx = -tl.rgb - 2.0*ml.rgb - bl.rgb + tr.rgb + 2.0*mr.rgb + br.rgb;
        vec3 sy = -tl.rgb - 2.0*tc.rgb - tr.rgb + bl.rgb + 2.0*bc.rgb + br.rgb;
        float edge = length(sx) + length(sy);
        color = vec4(vec3(edge), 1.0);
    } else if (uTDPass == 1) {
        // Blur de bordes
        vec4 sum = vec4(0.0);
        for (int x = -1; x <= 1; x++) {
            for (int y = -1; y <= 1; y++) {
                sum += texture(sTD2DInputs[0], uv + vec2(float(x), float(y)) * texel);
            }
        }
        color = sum / 9.0;
    } else {
        // Compositar: glow = bordes difusos
        vec4 edges = texture(sTD2DInputs[0], uv);
        color = edges * vec4(0.3, 1.0, 0.5, 1.0);
    }
    
    fragColor = TDOutputSwizzle(color);
}
```

### Patrón 3: Color Grading (2 pasadas)

```glsl
// Pasada 0: Lift/Gamma/Gain
// Pasada 1: Vignette
out vec4 fragColor;
void main() {
    vec2 uv = vUV.st;
    vec4 color = texture(sTD2DInputs[0], uv);
    
    if (uTDPass == 0) {
        // Color correction
        vec3 lift = vec3(0.05, 0.02, 0.08);
        vec3 gamma = vec3(1.2, 1.0, 0.9);
        vec3 gain = vec3(1.1, 1.05, 1.0);
        vec3 graded = pow(color.rgb + lift, 1.0 / gamma) * gain;
        color = vec4(clamp(graded, 0.0, 1.0), color.a);
    } else {
        // Vignette
        vec2 center = uv - vec2(0.5);
        float dist = length(center);
        float vignette = 1.0 - smoothstep(0.3, 0.8, dist);
        color.rgb *= vignette;
    }
    
    fragColor = TDOutputSwizzle(color);
}
```

### npasses vs Multi-Operator Pipeline

| Característica | npasses (glslTOP) | Multi-Operator Pipeline |
|----------------|-------------------|-------------------------|
| **Velocidad** | Más rápido (GPU interna) | Más lento (múltiples cook) |
| **Memoria** | Compartida entre pasadas | Cada operador tiene buffer propio |
| **Flexibilidad** | Limitado a una textura de input | Múltiples inputs posibles |
| **Complejidad** | Un solo archivo GLSL | Múltiples archivos DAT |
| **Uso ideal** | Efectos secuenciales simples | Efectos complejos con branching |

### Configuración desde Python

```python
import json

def setup_multipass(container_path, glsl_name, npasses_val):
    """Configurar glslTOP con multi-pass."""
    glsl_path = f'{container_path}/{glsl_name}'
    
    # Establecer pixeldat (el textDAT con el shader)
    op(glsl_path).par.pixeldat = f'{glsl_name}_code'
    
    # Establecer npasses
    op(glsl_path).par.npasses = npasses_val
    
    # Verificar configuración
    result = {
        'pixeldat': str(op(glsl_path).par.pixeldat.eval()),
        'npasses': int(op(glsl_path).par.npasses.eval())
    }
    print(json.dumps(result))
    return result

# Uso:
setup_multipass('/project1/my_system', 'my_glsltop', 4)
```

### Verificación de npasses

```python
import json

def verify_multipass(container_path, glsl_name, expected_npasses):
    """Verificar que npasses está configurado correctamente."""
    glsl_path = f'{container_path}/{glsl_name}'
    
    raw = td.exec(
        "import json\n"
        "o = op('%s')\n"
        "np = o.par.npasses.eval() if hasattr(o.par, 'npasses') else -1\n"
        "print(json.dumps({'npasses': np}))\n" % glsl_path
    )
    params = json.loads(raw.strip().splitlines()[-1]) if raw.strip() else {}
    np = params.get('npasses', -1)
    
    ok = np == expected_npasses
    print(f"npasses={np} (expected {expected_npasses}): {'OK' if ok else 'FAIL'}")
    return ok

# Uso:
verify_multipass('/project1/my_system', 'my_glsltop', 4)
```

### Errores comunes con npasses

| Error | Causa | Solución |
|-------|-------|----------|
| Shader solo ejecuta 1 pasada | `npasses` no está seteado | `glsltop.par.npasses = N` |
| `uTDPass` siempre es 0 | Usando `glslPOP` en vez de `glslTOP` | `uTDPass` solo existe en `glslTOP` |
| Artefactos en pasadas > 0 | Shader lee de input equivocado | En multi-pass, `sTD2DInputs[0]` es el output de la pasada anterior |
| Performance degradada | Demasiadas pasadas | Usar 2-4 pasadas máximo para efectos en tiempo real |

### Casos de uso

1. **Progressive Blur** — 4 pasadas, cada una suaviza más
2. **Edge Detect + Glow** — 3 pasadas: detectar → difuminar → compositar
3. **Color Grading** — 2 pasadas: corrección de color + vignette
4. **Iterative Reaction-Diffusion** — múltiples pasadas de ecuaciones RD
5. **Temporal Accumulation** — acumular datos entre pasadas

---

## 18. BUILD ORDER — Wire BEFORE Computedat

### ⚠️ Regla crítica: el orden de construcción importa

Cuando se crea una red GLSL POP programáticamente (vía MCP o Python), el **orden en que se conectan los operadores y se establece `computedat`** determina si el shader compila correctamente.

### El problema: `TDIn_P` falla sin input conectado

Si se establece `computedat` **antes** de conectar el source POP al glslPOP, el shader se compila cuando aún no hay input disponible. La función `TDIn_P(0, id)` falla con:

```
ERROR: 'TDIn_P' : no matching overloaded function found
```

Esto afecta **especialmente a `glsladvancedPOP`**, que es más estricto en la compilación que `glslPOP`.

### Orden correcto ✅

```python
# 1. Crear todos los operadores
src = op(container).create(td.boxPOP, 'src')
dat = op(container).create(td.textDAT, 'shader_code')
glsl = op(container).create(td.glslPOP, 'my_shader')
out = op(container).create(td.nullPOP, 'output')

# 2. Escribir el shader en el DAT
dat.text = shader_code

# 3. CONECTAR primero (source → glsl → out)
src.outputConnectors[0].connect(glsl)
glsl.outputConnectors[0].connect(out)

# 4. AHORA sí, establecer computedat (el shader compila con input disponible)
glsl.par.computedat = 'shader_code'
glsl.par.outputattrs = 'P'
```

### Orden incorrecto ❌

```python
# ❌ Esto produce 'TDIn_P : no matching overloaded function found'
src.outputConnectors[0].connect(glsl)  # ← conexión después
glsl.par.computedat = 'shader_code'    # ← shader compila SIN input
```

### Resumen visual

```
❌ INCORRECTO:                    ✅ CORRECTO:
1. Create operators              1. Create operators
2. Write DAT text                2. Write DAT text
3. Set computedat ← FALLO        3. Wire connections
4. Wire connections               4. Set computedat ← OK
                                  5. Set output attrs
```

### Por qué ocurre

TouchDesigner compila el shader GLSL cuando se establece `computedat`. En ese momento:
- Si el source POP ya está conectado → `TDIn_P(0, id)` puede leer posiciones ✅
- Si el source POP NO está conectado → `TDIn_P(0, id)` no tiene input → error ❌

`glslPOP` puede ser más tolerante (algunas versiones devuelven zeros), pero `glsladvancedPOP` siempre falla.

### Regla de oro

> **Siempre conectar los operadores ANTES de establecer `computedat`.**
> Esto garantiza que `TDIn_P()` encuentre un input válido durante la compilación.

---

## 19. Parámetros const (Uniforms via TD)

### ¿Qué son los parámetros const?

Los parámetros `const0name`/`const0value` permiten pasar uniforms personalizados a un shader GLSL desde los parámetros de TD, sin necesidad de crear parámetros custom manualmente.

### Disponibilidad

| Operador | ¿Soporta const? | Método de seteo |
|----------|-----------------|------------------|
| `glslTOP` | ✅ | `const0name`, `const0value` en página Constants |
| `glslPOP` | ✅ | `const0name`, `const0value` en página Constants |
| `glsladvancedPOP` | ✅ | `const0name`, `const0value` en página Constants |
| `glslcopyPOP` | ❌ | Usar parámetros custom |

### Ejemplo: setear const desde Python

```python
# Uniform 'u_strength' con valor 0.5
glsl = op('/project1/my_shader')
glsl.par.const0name = 'u_strength'
glsl.par.const0value = 0.5

# Uniform adicional 'u_color_scale'
glsl.par.const1name = 'u_color_scale'
glsl.par.const1value = 2.0

# Verificar:
print(glsl.par.const0name.eval())   # → 'u_strength'
print(glsl.par.const0value.eval())  # → 0.5
```

### En el shader GLSL

```glsl
// Los uniforms se declaran normalmente
uniform float u_time;       // Built-in (auto)
uniform float u_strength;   // Seteado via const0name/const0value
uniform float u_color_scale; // Seteado via const1name/const1value

void main() {
    uint id = TDIndex();
    vec3 pos = TDIn_P(0, id);
    
    // u_strength tendrá el valor 0.5 en runtime
    float force = u_strength / (length(pos) + 0.5);
    pos += normalize(pos) * force * 0.1;
    
    P[id] = pos;
}
```

### ⚠️ Errores comunes con uniforms

| Error | Causa | Solución |
|-------|-------|----------|
| `uniform float u_x = 0.5;` genera warning | Initializers no soportados en TD GLSL | Declarar sin valor: `uniform float u_x;` y setear via const |
| Uniform siempre es 0.0 | No se seteó const param | `glsl.par.const0name = 'u_x'; glsl.par.const0value = 1.0` |
| `Ignoring initializer for uniform` | Mismo que fila 1 | Quitar `= 0.5` de la declaración |

---

## 📚 Referencias

- **Sitio original**: [fullscreencode.com/ejemplosshaders/](https://fullscreencode.com/ejemplosshaders/)
- **TouchDesigner GLSL POP**: [derivative.ca/Wiki/GLSL_POP](https://derivative.ca/Wiki/GLSL_POP)
- **Shadertoy**: [shadertoy.com](https://www.shadertoy.com)
- **The Book of Shaders**: [thebookofshaders.com](https://thebookofshaders.com)
- **TD GLSL TOP npasses**: Test suite en `toe/src/test_live_td_glsl_npasses.py`
- **BUILD ORDER test**: Ver `toe/src/test_live_td_glslpop_10bases.py` (orden: wire → computedat)

---

*Documentado por Buffy | Freebuff MCP Server*
*Última actualización: Julio 2026*
