---
title: "Sistema Multi-Fuerza con Disolución de Partículas"
category: "pops"
difficulty: "expert"
keywords: ["particles", "multi-force", "curl", "spring", "streaks", "dissolve", "pops", "complex"]
duration: "50 min"
requires_td: true
---

# Sistema Multi-Fuerza con Disolución de Partículas

Construye un sistema complejo de partículas con múltiples fuerzas independientes: disolución, curl noise, springs, flat forces, streaks y curva de seguimiento. Cada sub-sistema opera en un baseCOMP separado con salida combinada.

Basado en el patrón particlePopBananaDisolver.

## Requisitos

- TouchDesigner (cualquier licencia con POPs)
- GPU con soporte POPs (6 GB+ VRAM)
- Conocimientos avanzados de POPs y arquitectura de red

## Arquitectura del sistema

```
┌─────────────────────────────────────────────────┐
│                  baseCOMP principal              │
│                                                  │
│  project_disolver ──→ merge_all ──→ renderTOP    │
│  project_curl ──────→     ↑                      │
│  project_spring ────→     ↑                      │
│  project_streaks ───→     ↑                      │
│  project_forces ────→     ↑                      │
│  project_followCurve ─→   ↑                      │
│                                                  │
│  local / time / master_beat (infraestructura)    │
└─────────────────────────────────────────────────┘
```

## Paso 1: Infraestructura base

1. Crea un **baseCOMP** principal (nómbralo `particle_system`)
2. Dentro, crea las bases de infraestructura:
   - `local` — variables del sistema
   - `time` — control de tiempo (locked a 60fps)
   - `master_beat` — CHOP de tempo global (beat CHOP)
   - `variables` — table DAT con parámetros globales

## Paso 2: Sub-sistema de disolución

1. Crea un **baseCOMP** (`project_disolver`)
2. Dentro:
   - **sprinkle POP** (`source1`): Emisor de 500 puntos
   - **particle POP** (`particle1`): Solver con emisión continua
   - **delete POP** (`delete1`): Elimina partículas viejas
     - Condition: `@age > @life * 0.8`
   - **noise POP** (`noise1`): Ruido de disolución
     - Amplitude: `0.3`
     - Period: `2`
   - **transform POP** (`transform1`): Mover puntos hacia abajo
     - `ty`: `@ty - absTime.delta * 0.5`
   - **null POP** (`null_disolver`): Salida del sub-sistema

3. Conexión:
```
source1 → particle1 → delete1 → noise1 → transform1 → null_disolver
```

## Paso 3: Sub-sistema de curl noise

1. Crea un **baseCOMP** (`project_curl`)
2. Dentro:
   - **sphere POP** (`source2`): 300 puntos en esfera
   - **attribute POP** (`attrib_vel`): Definir `Vel` = `(0, 0, 0)`
   - **GLSL POP** (`curl_noise`) con compute:
     ```glsl
     // Curl noise para movimiento orgánico
     uniform float uTime;
     uniform float uStrength;

     layout(location = 0) in vec3 P;
     layout(location = 1) in vec3 Vel;

     layout(location = 0) out vec3 outP;
     layout(location = 1) out vec3 outVel;

     // Simple curl noise approximation
     vec3 curlNoise(vec3 p)
     {
         float e = 0.1;
         float n1, n2;
         vec3 curl;

         // dN/dy - dN/dz
         n1 = sin(p.y * 3.0 + uTime) * cos(p.z * 2.0 + uTime);
         n2 = sin((p.y + e) * 3.0 + uTime) * cos(p.z * 2.0 + uTime);
         curl.x = (n2 - n1) / e;

         // dN/dz - dN/dx
         n1 = cos(p.z * 2.0 + uTime) * sin(p.x * 3.0 + uTime);
         n2 = cos((p.z + e) * 2.0 + uTime) * sin(p.x * 3.0 + uTime);
         curl.y = (n2 - n1) / e;

         // dN/dx - dN/dy
         n1 = sin(p.x * 3.0 + uTime) * cos(p.y * 2.0 + uTime);
         n2 = sin((p.x + e) * 3.0 + uTime) * cos(p.y * 2.0 + uTime);
         curl.z = (n2 - n1) / e;

         return curl;
     }

     void main()
     {
         vec3 force = curlNoise(P) * uStrength;
         vec3 newVel = (Vel + force) * 0.98;
         vec3 newP = P + newVel * 0.016;
         outP = newP;
         outVel = newVel;
     }
     ```
   - **feedback POP**: Feedback loop
   - **null POP** (`null_curl`): Salida

## Paso 4: Sub-sistema de springs

1. Crea un **baseCOMP** (`project_spring`)
2. Dentro:
   - **circle POP** (`source3`): 200 puntos
   - **attribute POP** (`attrib_spring`): `Target` = posición original
   - **GLSL POP** (`spring_compute`): Ver tutorial spring-feedback-glsl
   - **feedback POP**: Loop de springs
   - **null POP** (`null_spring`): Salida

3. Configuración de springs:
   - Stiffness: `2.0`
   - Damping: `0.95`
   - Targets: Posiciones fijas en círculo

## Paso 5: Sub-sistema de streaks

1. Crea un **baseCOMP** (`project_streaks`)
2. Dentro:
   - **sprinkle POP** (`source4`): 100 puntos
   - **particle POP** (`particle4`): Movimiento con velocidad alta
   - **trail POP** (`trail1`): Genera estelas
     - Length: `20` frames
   - **primitive POP** (`prim1`): Mode = `Line Strip`
   - **null POP** (`null_streaks`): Salida

## Paso 6: Sub-sistema de fuerzas planas

1. Crea un **baseCOMP** (`project_flatForces`)
2. Dentro:
   - **grid POP** (`grid1`): 10x10, 100 puntos
   - **noise POP** (`noise_flat`): Movimiento 2D
   - **transform POP**: Restringir a plano Y=0
   - **null POP** (`null_flat`): Salida

## Paso 7: Seguimiento de curva

1. Crea un **baseCOMP** (`project_followCurve`)
2. Dentro:
   - **line POP** (`line1`): Curva base
   - **attribute POP**: Definir dirección de curva
   - **particle POP**: Partículas siguen la curva
   - **null POP** (`null_curve`): Salida

## Paso 8: Merge y render

1. Crea un **merge POP** (`merge_all`)
   - Inputs: todos los `null_*` de cada sub-sistema
2. Crea un **Geometry COMP** (`geo1`)
   - Conecta `merge_all`
3. Crea un **render TOP** (`render1`)
   - Resolution: `1280x720`
4. Crea un **line MAT** (`line1`)
   - Line Width: `1.5`
   - Aplica a `geo1`

## Paso 9: Control global

Crea custom parameters en el baseCOMP principal:

| Parámetro | Tipo | Default | Controla |
|-----------|------|---------|----------|
| `DissolveWeight` | Float | 1.0 | Intensidad de disolución |
| `CurlStrength` | Float | 0.5 | Fuerza del curl noise |
| `SpringStiffness` | Float | 2.0 | Rigidez de resortes |
| `StreakLength` | Float | 20 | Longitud de estelas |
| `FlatForceWeight` | Float | 0.3 | Fuerzas planas |
| `CurveFollowSpeed` | Float | 0.5 | Velocidad de seguimiento |
| `GlobalTimeScale` | Float | 1.0 | Escala de tiempo global |

## Tabla de sub-sistemas

| Sub-sistema | Tipo | Partículas | Fuerza principal | Output |
|-------------|------|------------|------------------|--------|
| Disolución | particle POP | 500 | Noise + gravedad | Points |
| Curl | GLSL compute | 300 | Curl noise | Points |
| Springs | GLSL compute | 200 | Spring force | Points |
| Streaks | particle POP | 100 | Velocidad alta | Line Strip |
| Flat | grid POP | 100 | Noise 2D | Points |
| Curve | particle POP | 50 | Follow path | Points |

## Solución de problemas

- **Un sub-sistema domina el render**: Ajusta el número de partículas de cada uno
- **Performance baja**: Reduce partículas o desactiva sub-sistemas menos importantes
- **Merge no funciona**: Verifica que todos los null_* tengan el mismo tipo de output (POP)
- **Curl noise no compila**: Revisa la sintaxis GLSL y los uniformes

## Consejos

- Cada sub-sistema en su propio baseCOMP facilita debugging
- Usa **null POP** nombrado al final de cada cadena para referencia clara
- El merge POP acepta múltiples inputs sin problema
- Combina con **audio CHOP** para que cada sub-sistema reaccione a diferentes frecuencias
- Usa **level TOP** o **HSV Adjust TOP** para dar color diferente a cada sub-sistema
- Para performance, prioriza: curl > springs > streaks > disolución > flat > curve
