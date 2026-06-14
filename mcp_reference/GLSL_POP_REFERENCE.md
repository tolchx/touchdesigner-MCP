# GLSL POP en TouchDesigner — Investigación Completa

## ¿Qué son los POPs?
**POPs** (Point Operators) son una familia de operadores GPU-based para crear/modificar datos 3D.
- Reemplazan a los SOPs tradicionales en cálculos masivos con GPU
- Ideales para: sistemas de partículas, point clouds, deformaciones, simulaciones
- Se renderizan con Render TOP o se envían a dispositivos LED/láser

## GLSL POP: Tipos de Shaders

### GLSL POP (glsl1) — Vertex Shader
Procesa CADA punto/vertex individualmente. No tiene acceso a otros puntos.
```glsl
void main(){
    // P = posición del punto (vec3)
    // N = normal (vec3)
    // Cd = color (vec4)
    // uv = coordenadas de textura (vec4[])
    gl_Position = TDWorldToProj(TDDeform(P));
}
```

### GLSL Advanced POP (glsl2) — Vertex + Pixel Shader
Vertex shader + pixel shader para determinar color por píxel.

### GLSL Copy POP (glsl3) — Compute Shader
Acceso a TODOS los puntos del POP de entrada. Corre N veces (N = puntos de entrada).
```glsl
void main(){
    // P[0] = punto 0 del input, P[1] = punto 1, etc.
    // Cada invocación escribe a un punto de salida
}
```

## Atributos por Defecto

| Atributo | Tipo | Descripción |
|----------|------|-------------|
| P | vec3 | Posición |
| N | vec3 | Normal |
| Cd | vec4 | Color (RGBA) |
| uv | vec4[] | Coordenadas UV |
| v | vec3 | Velocidad |
| life | float | Vida restante |
| age | float | Edad actual |
| id | int | ID único del punto |

## Uniforms GLSL Clave en TD

```glsl
uniform float u_time;              // Tiempo en segundos
uniform float u_delta;             // Delta time
uniform vec2  u_resolution;        // Resolución del viewport
uniform int   u_numPoints;         // Número de puntos del POP
uniform sampler2D sTD2DInputs[4];  // Texturas de entrada
uniform float uTD2DInfos[4];       // Info de texturas (res, etc.)
```

## Funciones TD Incorporadas

```glsl
TDDeform(P)           // Transforma punto a world space
TDWorldToProj(pos)    // World space → projection space
TDSimplexNoise(pos)   // Noise 3D/4D
TDPerlinNoise(pos)    // Perlin noise
TDOutputSwizzle(color)// Swizzle correcto para output
```

## Patrón Básico — Vertex Shader (GLSL1)

```glsl
// Mover puntos con noise
uniform float u_time;
uniform float amp = 0.5;
uniform float freq = 1.0;

void main() {
    vec3 pos = P;
    float n = TDSimplexNoise(vec4(pos * freq, u_time));
    pos += N * n * amp;
    gl_Position = TDWorldToProj(TDDeform(pos));
}
```

## Patrón Básico — Copy Shader (GLSL3)

```glsl
// Atraer puntos hacia un target
uniform float u_time;
uniform vec3 target = vec3(0, 0, 0);
uniform float attract = 0.01;

void main() {
    vec3 dir = target - P[0];
    P[0] += dir * attract;
    if(length(P[0]) > 10) P[0] = vec3(0);
}
```

## Fuentes
- Derivative TD Academy: GLSL for POPs series
- Lake Heckaman / WaterShed: "GLSL for POPs" Patreon course
- Interactive Immersive HQ: POPs FAQ & GPU Particles tutorial
- Matthew Ragan: GLSL Cheat Sheet
- GitHub: td-shadertoy (matthewwachter)
- GitHub: Introduction-to-touchdesigner (interactiveimmersivehq)
