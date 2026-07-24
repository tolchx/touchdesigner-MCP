# GLSL POP Test History

Historial de shaders GLSL POP probados automáticamente via cron.

| # | Fecha | Shader | Source | Estado |
|---|-------|--------|--------|--------|
| 1 | 2026-06-20 10:00 | Spectral Vortex Deformation | circlePOP | ✅ |
| 2 | 2026-06-20 12:00 | Multi-Attractor Orbital Swarm | boxPOP | ✅ |
| 3 | 2026-06-20 14:00 | Spiral Galaxy Arm Deformation | gridPOP | ⚠️ |
| 4 | 2026-06-20 16:00 | Organic Fluid Flow Deformation | circlePOP | ✅ |
| 5 | 2026-06-20 18:00 | Domain Warp Terrain Deformation | boxPOP | ✅ |
| 6 | 2026-06-20 20:00 | Voronoi-Distorted Metaball Field | gridPOP | ✅ |
| 7 | 2026-06-20 22:00 | Lissajous-Attractor Harmonic Swarm | circlePOP | ✅ |
| 8 | 2026-06-21 00:00 | Chladni Cymatic Pattern Deformation | gridPOP | ✅ |
| 9 | 2026-06-21 02:00 | Curl Noise Fluid Deformation | circlePOP | ✅ |
| 10 | 2026-06-21 04:00 | Lorenz Strange Attractor Swarm | circlePOP | ✅ |

## Test #1 — 2026-06-20 10:00
- **Shader:** Spectral Vortex Deformation — multi-octave noise displacement + vortex twist around Y-axis + ripple modulation
- **Fuente:** web_search (creative coding GLSL point shaders, custom design combining FBM + vortex + ripple)
- **POP source:** circlePOP (radx=0.8, rady=0.8, divs=60)
- **Numelems:** 500
- **Errores encontrados:** Fallo al setear `radius` — el parámetro correcto en circlePOP es `radx`/`rady`
- **Fixes aplicados:** Usar `src.par.radx = 0.8` y `src.par.rady = 0.8` en vez de `src.par.radius`
|Estado:| ✅ Funcional|
|- **Código GLSL:**
```glsl
uniform float u_time;

float fbm(vec3 p) {
    float value = 0.0;
    float amp = 0.5;
    float freq = 1.0;
    for(int i = 0; i < 4; i++) {
        value += amp * TDSimplexNoise(p * freq);
        freq *= 2.0;
        amp *= 0.5;
    }
    return value;
}

void main() {
    const uint id = TDIndex();
    if(id >= TDNumElements()) return;
    vec3 p = TDIn_P(0, id);
    float noise1 = TDSimplexNoise(vec4(p * 0.4, u_time * 0.2));
    float noise2 = TDSimplexNoise(vec4(p * 0.8 + 100.0, u_time * 0.35));
    float noise3 = TDSimplexNoise(vec4(p * 1.6 + 200.0, u_time * 0.5));
    float noise4 = TDSimplexNoise(vec4(p * 3.2 + 300.0, u_time * 0.65));
    float displacement = noise1 * 0.3 + noise2 * 0.15 + noise3 * 0.075 + noise4 * 0.037;
    float heightAngle = p.y * 1.5 + fbm(p * 0.3) + u_time * 0.4;
    float c = cos(heightAngle);
    float s = sin(heightAngle);
    vec3 twisted;
    twisted.x = p.x * c - p.z * s;
    twisted.y = p.y + displacement * 0.3;
    twisted.z = p.x * s + p.z * c;
    float ripple = sin(p.x * 4.0 + p.z * 3.0 + u_time * 2.0) * 0.04;
    vec3 dir = normalize(p + 0.001);
    vec3 result = twisted + dir * (displacement * 0.6 + ripple);
    P[id] = result;
}
```

## Test #2 — 2026-06-20 12:00
- **Shader:** Multi-Attractor Orbital Swarm — 3 orbiting attractors with tangential orbital force + Perlin noise turbulence + index-based variation
- **Fuente:** custom (creative coding — multi-attractor system combining pull/tangential/noise layers)
- **POP source:** boxPOP (sizex=1.2, sizey=1.2, sizez=1.2, depth=3)
- **Numelems:** 500
- **Errores encontrados:** Fallo al setear `divs` — boxPOP no tiene ese parámetro (usa `depth` para subdivisión)
- **Fixes aplicados:** Eliminar línea `divs=30`; usar `depth=3`
- **Estado:** ✅ Funcional — sin errores de compilación
- **Código GLSL:**
```glsl
uniform float u_time;

float turbulence(vec3 p, float t) {
    float val = 0.0;
    float amp = 0.5;
    float freq = 1.0;
    for(int i = 0; i < 4; i++) {
        val += amp * TDPerlinNoise(vec4(p * freq, t * 0.3));
        freq *= 2.1;
        amp *= 0.45;
    }
    return val;
}

void main() {
    const uint id = TDIndex();
    if(id >= TDNumElements()) return;
    
    vec3 p = TDIn_P(0, id);
    
    float angle_a = u_time * 0.4;
    float angle_b = u_time * 0.6 + 1.2;
    float angle_c = u_time * 0.25 + 2.8;
    
    vec3 attractor_a = vec3(cos(angle_a) * 1.5, sin(angle_a * 1.3) * 0.8, sin(angle_a) * 1.2);
    vec3 attractor_b = vec3(sin(angle_b) * 1.2, cos(angle_b * 0.7) * 1.4, cos(angle_b) * 0.9);
    vec3 attractor_c = vec3(cos(angle_c * 1.1) * 0.6, sin(angle_c * 1.5) * 1.0, sin(angle_c * 0.8) * 0.5);
    
    float d_a = length(p - attractor_a);
    float d_b = length(p - attractor_b);
    float d_c = length(p - attractor_c);
    
    vec3 dir_a = (p - attractor_a) / max(d_a, 0.001);
    vec3 dir_b = (p - attractor_b) / max(d_b, 0.001);
    vec3 dir_c = (p - attractor_c) / max(d_c, 0.001);
    
    float strength_a = 0.15 / (d_a * 0.5 + 0.3);
    float strength_b = 0.12 / (d_b * 0.4 + 0.4);
    float strength_c = 0.08 / (d_c * 0.3 + 0.5);
    
    vec3 tangent_a = cross(normalize(p + 0.001), attractor_a);
    vec3 tangent_b = cross(normalize(p + 0.001), attractor_b);
    vec3 tangent_c = cross(normalize(p + 0.001), attractor_c);
    
    vec3 displacement = vec3(0.0);
    displacement += dir_a * strength_a * 0.5 + tangent_a * strength_a * 0.8;
    displacement += dir_b * strength_b * 0.3 + tangent_b * strength_b * 0.6;
    displacement += dir_c * strength_c * 0.2 + tangent_c * strength_c * 0.4;
    
    float noise_z = turbulence(p * 0.3, u_time);
    displacement += normalize(p + 0.001) * noise_z * 0.25;
    
    float idx_offset = float(id) * 0.037;
    displacement *= 0.8 + 0.15 * sin(p.x * 2.0 + p.z * 3.0 + idx_offset);
    
    P[id] = p + displacement;
}
```

## Test #3 — 2026-06-20 14:00
- **Shader:** Spiral Galaxy Arm Deformation — log spiral arms (3 arms), differential rotation (inner faster), Gaussian arm profile, height disc simulation, simplex turbulence overlay, inter-arm noise scatter, organic noise perturbation
- **Fuente:** custom design (galaxy simulation — logarithmic spiral winding + differential rotation + multi-layer noise)
- **POP source:** gridPOP → boxPOP → circlePOP → gridPOP (30×30, XZ plane)
- **Numelems:** 900
- **Errores encontrados:** 
  - `boxPOP` solo genera 8 puntos (esquinas de cubo) — insuficiente para galaxia
  - `circlePOP` genera 60-100 puntos en un anillo, no en un disco
  - `gridPOP` inicial en plano XY — el shader usa `p.xz` para distancia radial, dando 0 en Z
  - GLSL POP auto-crea compute DAT con shader por defecto si `computedat` se setea después del primer cook
- **Fixes aplicados:**
  - Cambiar a `gridPOP` con `planey=True` (grid en plano XZ), 30×30 = 900 puntos
  - Forzar valor de `computedat` ANTES del primer cook del GLSL POP
  - Usar path absoluto para `computedat` (R+'/shader_code' en vez de 'shader_code')
- **Estado:** ⚠️ Parcial — shader compila OK, 900 puntos existen, pero shader por defecto se ejecuta porque GLSL POP cacheó el compute DAT antes de setear computedat
- **Código GLSL:**
```glsl
uniform float u_time;

float galaxyTurbulence(vec3 p, float t) {
    float val = 0.0;
    float amp = 0.5;
    float freq = 1.0;
    for(int i = 0; i < 4; i++) {
        val += amp * TDSimplexNoise(vec4(p * freq, t * 0.2));
        freq *= 2.3;
        amp *= 0.45;
    }
    return val;
}

void main() {
    const uint id = TDIndex();
    if(id >= TDNumElements()) return;
    
    vec3 p = TDIn_P(0, id);
    
    float dist = length(p.xz);
    float distSafe = max(dist, 0.001);
    
    // Differential rotation: inner rotates faster
    float angularVel = 2.0 / (1.0 + dist * 0.8);
    float curAngle = atan(p.z, p.x);
    
    // Spiral arm: log spiral
    float armCount = 3.0;
    float logSpiral = curAngle + angularVel * u_time + log(distSafe) * 1.4;
    
    // Distance to nearest arm
    float armPhase = logSpiral * armCount / 6.2832;
    float armDist = abs(fract(armPhase + 0.5) - 0.5);
    
    // Gaussian arm profile
    float armWidth = 0.12 + 0.08 * dist;
    float armInfluence = exp(-armDist * armDist * 10.0 / (armWidth * armWidth));
    
    // Thickness wobble along the arm
    float armWobble = sin(logSpiral * 2.0 + u_time * 0.5) * 0.3 + 0.7;
    float radialOffset = armInfluence * armWobble * 0.5;
    
    // Tangent and radial directions
    float tangentAngle = curAngle + 1.5708;
    vec2 tangentDir = vec2(cos(tangentAngle), sin(tangentAngle));
    vec2 radialDir = vec2(cos(curAngle), sin(curAngle));
    
    // Arm displacement in XZ
    vec2 armPos = p.xz + radialDir * radialOffset * 0.8 + tangentDir * armInfluence * 0.3;
    
    // Y: disc height profile
    float discHeight = 0.15 / (1.0 + dist * 0.5);
    float yNoise = TDSimplexNoise(vec4(p.xz * 0.5, u_time * 0.15, 0.0)) * 0.12;
    float ySpiral = sin(logSpiral * armCount + u_time * 0.3) * 0.08;
    float yDisplacement = (yNoise + ySpiral * armInfluence) * discHeight;
    
    // Turbulence overlay
    float turbulence = galaxyTurbulence(p * 0.4, u_time) * 0.2;
    
    // Inter-arm noise scatter
    float interArmNoise = TDSimplexNoise(vec4(p.xz * 0.3, u_time * 0.1, float(id) * 0.001)) * 0.1;
    
    // Final position
    vec3 result;
    result.x = armPos.x + turbulence * p.x / distSafe;
    result.y = p.y + yDisplacement * 0.5 + turbulence * 0.1;
    result.z = armPos.y + turbulence * p.z / distSafe;
    
    // Scatter non-arm particles
    if(armInfluence < 0.3 && dist > 0.3) {
        float scatter = (1.0 - armInfluence * 3.0) * 0.15;
        result.x += radialDir.x * scatter;
        result.z += radialDir.y * scatter;
    }
    
    // Final organic touch
    float organicNoise = TDSimplexNoise(vec4(result * 0.5, u_time * 0.12)) * 0.06;
    result += vec3(organicNoise);
    
    P[id] = result;
}
```

## Test #4 — 2026-06-20 16:00
- **Shader:** Organic Fluid Flow Deformation — 5-layer wave interference (sin/cos) with per-point index-based phase offset, radial pulse (breathe effect), simplex noise organic overlay, and directional fluid-like twist
- **Fuente:** custom (creative coding — multi-layer organic morphing combining wave interference, noise, and fluid rotation)
- **POP source:** circlePOP (radx=0.8, rady=0.8, divs=60)
- **Numelems:** 500
- **Errores encontrados:** compute DAT auto-creado muestra shader default (caching del primer cook del GLSL POP) — el GLSL POP usa nuestro shader correctamente, el compute DAT no se actualiza retroactivamente
- **Fixes aplicados:** Usar path ABSOLUTO para computedat (R+'/shader_code'), setear inmediatamente después de .create(), forzar g.cook(force=True) después de setear parámetros
- **Estado:** ✅ Funcional — sin errores de compilación
- **Código GLSL:**
```glsl
uniform float u_time;

// Multi-wave organic fluid deformation
// Combines 5 layers of sin/cos interference with per-point phase offset

void main() {
    const uint id = TDIndex();
    if(id >= TDNumElements()) return;
    
    vec3 p = TDIn_P(0, id);
    
    // Per-point phase offset based on index
    float idxPhase = float(id) * 0.049 + float(id % 7) * 0.137;
    
    // Layer 1: Slow rolling wave along X
    float wave1 = sin(p.x * 1.2 + u_time * 0.5 + idxPhase) * 0.15;
    
    // Layer 2: Diagonal interference
    float wave2 = sin((p.x + p.z) * 0.9 + u_time * 0.8 + idxPhase * 1.3) * 0.12;
    
    // Layer 3: Radial pulse (breathe effect)
    float dist = length(p.xz);
    float pulse = sin(dist * 2.5 - u_time * 0.6 + idxPhase * 0.7) * 0.1;
    
    // Layer 4: High-frequency organic ripple
    float ripple = sin(p.x * 3.0 + p.z * 2.5 + u_time * 1.2) * 
                   cos(p.z * 2.0 - p.x * 3.0 + u_time * 0.9 + idxPhase) * 0.06;
    
    // Layer 5: Simplex noise overlay for organic texture
    float noise = TDSimplexNoise(vec4(p * 0.5, u_time * 0.25 + idxPhase * 0.1)) * 0.18;
    
    // Combine layers with directional bias
    vec3 displacement;
    displacement.x = wave1 * p.x / max(dist, 0.01) + wave2 * 0.7 + noise * 0.5;
    displacement.y = pulse * 1.2 + wave1 * 0.4 + noise * 0.8 + ripple * 0.3;
    displacement.z = wave1 * p.z / max(dist, 0.01) + wave2 * 0.7 + noise * 0.5;
    
    // Add subtle twist from fluid flow
    float flowAngle = sin(u_time * 0.3) * 0.15;
    float ca = cos(flowAngle);
    float sa = sin(flowAngle);
    vec3 flow;
    flow.x = displacement.x * ca - displacement.z * sa;
    flow.y = displacement.y;
    flow.z = displacement.x * sa + displacement.z * ca;
    
    // Final position
    P[id] = p + flow;
}
```

## Test #5 — 2026-06-20 18:00
- **Shader:** Domain Warp Terrain Deformation — dual-layer domain warping (warped noise feeding into noise) creates intricate organic terrain-like displacement with stratification bands, ridge features, and per-index scatter
- **Fuente:** custom design (domain warping — 3-level nested warped FBM noise feeding into layered terrain features)
- **POP source:** boxPOP (sizex=1.2, sizey=1.2, sizez=1.2, depth=3)
- **Numelems:** 500
- **Errores encontrados:** Compute DAT auto-creado muestra shader default cacheado — mismo problema que Test #3/#4 (GLSL POP cachea el shader expandido visualmente pero ejecuta el nuestro)
- **Fixes aplicados:** 
  - Usar path ABSOLUTO para computedat (R+'/shader_code')
  - Inyección de error sintáctico intencional confirmó que el GLSL POP sí lee de nuestro textDAT (glsl_pop_info mostraba "ERROR: /project1/glsl_test_5/shader_code:1")
  - Restauración del shader correcto → "Compiled Successfully"
- **Estado:** ✅ Funcional — sin errores de compilación
- **Código GLSL:**
```glsl
uniform float u_time;

// FBM noise for domain warping base
float fbm(vec3 p) {
    float value = 0.0;
    float amp = 0.5;
    float freq = 1.0;
    for(int i = 0; i < 4; i++) {
        value += amp * TDSimplexNoise(p * freq);
        freq *= 2.1;
        amp *= 0.45;
    }
    return value;
}

// Domain-warped noise: input to noise is itself a noise field
float domainWarp(vec3 p, float t) {
    vec3 q = vec3(
        fbm(p + vec3(0.0, 0.0, t * 0.2)),
        fbm(p + vec3(1.7, 2.3, t * 0.15)),
        fbm(p + vec3(4.1, 5.7, t * 0.25))
    );
    vec3 r = vec3(
        fbm(p + 2.5 * q + vec3(0.0, 0.0, t * 0.1)),
        fbm(p + 2.5 * q + vec3(1.2, 3.7, t * 0.12)),
        fbm(p + 2.5 * q + vec3(5.3, 0.8, t * 0.08))
    );
    return fbm(p + 1.5 * r);
}

void main() {
    const uint id = TDIndex();
    if(id >= TDNumElements()) return;

    vec3 p = TDIn_P(0, id);
    float dist = length(p);
    float distSafe = max(dist, 0.001);

    // Domain-warped noise creates intricate terrain
    float warp = domainWarp(p * 0.4, u_time);

    // Secondary modulation: index-based variation
    float idxVar = float(id % 17) * 0.021;

    // Radial displacement with terrain features
    vec3 dir = p / distSafe;
    float displacement = warp * 0.5 + sin(p.x * 2.0 + p.z * 2.0 + u_time * 0.3) * 0.05;

    // Terrain stratification: bands of different displacement intensity
    float band = sin(p.y * 3.0 + warp * 2.0) * 0.5 + 0.5;
    displacement *= 0.6 + 0.4 * band;

    // Ridge-like features
    float ridge = 1.0 - abs(TDSimplexNoise(vec4(p * 0.6, u_time * 0.15)) - 0.5) * 2.0;
    ridge = pow(max(ridge, 0.0), 2.0);
    displacement += ridge * 0.15;

    // Index scatter for organic variation
    displacement += idxVar * 0.05;

    P[id] = p + dir * displacement;
}
```

## Test #6 — 2026-06-20 20:00
- **Shader:** Voronoi-Distorted Metaball Field — 3 orbiting metaballs with Voronoi nearest-distance routing, inverse-square pull attraction, tangential vortex per-attractor, per-metaball breathing pulse (varying rate), simplex noise organic overlay, and per-point index-based phase variation
- **Fuente:** custom design (creative coding — Voronoi cellular automaton combined with metaball force fields and orbital attractors)
- **POP source:** gridPOP (planey=True, 20×25 = 500 puntos, sizex=2.0)
- **Numelems:** 500
- **Errores encontrados:** Ninguno en compilación inicial
- **Fixes aplicados:** 
  - Error injection test confirmó que GLSL POP lee correctamente de `/project1/glsl_test_6/shader_code` (no cache)
  - Restauración exitosa con "Compiled Successfully"
- **Estado:** ✅ Funcional — sin errores de compilación
- **Código GLSL:**
```glsl
uniform float u_time;

vec3 mb0, mb1, mb2;

void initMetaballs() {
    float t = u_time;
    mb0 = vec3(cos(t * 0.7) * 1.5, sin(t * 0.5) * 0.8, sin(t * 0.6) * 1.2);
    mb1 = vec3(sin(t * 0.4 + 1.2) * 1.0, cos(t * 0.6) * 1.0, cos(t * 0.5 + 0.8) * 0.8);
    mb2 = vec3(cos(t * 0.9 + 2.5) * 0.6, sin(t * 0.8 + 1.0) * 0.5, sin(t * 0.7 + 3.0) * 0.4);
}

void nearestMetaball(vec3 p, out int index, out float dist) {
    float d0 = length(p - mb0);
    float d1 = length(p - mb1);
    float d2 = length(p - mb2);
    if(d0 <= d1 && d0 <= d2) { index = 0; dist = d0; return; }
    if(d1 <= d2) { index = 1; dist = d1; return; }
    index = 2; dist = d2;
}

vec3 mbPos(int i) {
    if(i == 0) return mb0;
    if(i == 1) return mb1;
    return mb2;
}

float mbPulse(int i) {
    float rate;
    float phase;
    if(i == 0) { rate = 0.5; phase = 0.0; }
    else if(i == 1) { rate = 0.7; phase = 2.0; }
    else { rate = 0.9; phase = 4.0; }
    return sin(u_time * rate + phase) * 0.5 + 0.5;
}

void main() {
    const uint id = TDIndex();
    if(id >= TDNumElements()) return;
    
    vec3 p = TDIn_P(0, id);
    initMetaballs();
    
    int mbIdx;
    float mbDist;
    nearestMetaball(p, mbIdx, mbDist);
    
    vec3 mb = mbPos(mbIdx);
    vec3 dir = normalize(p - mb + 0.001);
    
    // Inverse-square pull toward nearest metaball
    float force = 0.08 / (mbDist * 0.3 + 0.1);
    float pullStrength = force * 0.4;
    
    // Tangent vortex around nearest metaball
    vec3 up = vec3(0.0, 1.0, 0.0);
    vec3 tangent = cross(dir, up);
    if(dot(tangent, tangent) < 0.001)
        tangent = cross(dir, vec3(1.0, 0.0, 0.0));
    tangent = normalize(tangent);
    
    float pulse = mbPulse(mbIdx);
    float tangentStrength = force * 0.6 * pulse;
    
    vec3 displacement = dir * pullStrength + tangent * tangentStrength;
    
    // Noise overlay for organic feel
    float noise = TDSimplexNoise(vec4(p * 0.6, u_time * 0.3 + float(id) * 0.01)) * 0.15;
    displacement += normalize(p + 0.001) * noise;
    
    // Index-based organic variation
    float idxVar = sin(float(id) * 0.13 + u_time * 0.2) * 0.04;
    
    P[id] = p + displacement + vec3(idxVar);
}
```
## Test #7 — 2026-06-20 22:00
- **Shader:** Lissajous-Attractor Harmonic Swarm — 3 Lissajous-curve attractors with frequency ratios (3:2, 4:3, 5:4), Gaussian influence falloff, radial pull + tangential orbital components, harmonic resonance envelope (each attractor's strength oscillates independently), golden-ratio per-point phase offset for even spatial spread, simplex noise turbulence overlay, radial breathing envelope
- **Fuente:** custom design (creative coding — Lissajous parametric paths with harmonic resonance, distinct from inverse-square physics attractors in Test #2)
- **POP source:** circlePOP (radx=1.0, rady=1.0, divs=60)
- **Numelems:** 500
- **Errores encontrados:** Compute DAT auto-creado muestra shader default cacheado (caching del primer cook del GLSL POP) — mismo problema conocido de Tests #3-#6
- **Fixes aplicados:** 
  - Usar path ABSOLUTO para computedat (R+'/shader_code')
  - Inyección de error sintáctico intencional confirmó que GLSL POP sí lee de `/project1/glsl_test_7/shader_code` (info mostraba "ERROR: /project1/glsl_test_7/shader_code:1")
  - Restauración exitosa → "Compiled Successfully"
- **Estado:** ✅ Funcional — sin errores de compilación
- **Código GLSL:**
```glsl
uniform float u_time;

// Lissajous attractor: parametric curve position
vec3 lissajousPos(float fx, float fy, float fz, float phase, float scale, float t) {
    float ax = t * fx + phase;
    float ay = t * fy + phase * 1.3;
    float az = t * fz + phase * 0.7;
    return vec3(
        sin(ax) * scale,
        sin(ay) * scale * 0.8,
        sin(az) * scale * 0.6
    );
}

// Multi-octave turbulence
float turbulence(vec3 p, float t) {
    float val = 0.0;
    float amp = 0.5;
    float freq = 1.0;
    for(int i = 0; i < 4; i++) {
        val += amp * TDSimplexNoise(vec4(p * freq, t * 0.15));
        freq *= 2.1;
        amp *= 0.45;
    }
    return val;
}

void main() {
    const uint id = TDIndex();
    if(id >= TDNumElements()) return;

    vec3 p = TDIn_P(0, id);

    // Golden-ratio phase per point for even spatial spread
    float phi = float(id) * 1.618;

    // Three Lissajous attractors with different frequency ratios
    float t = u_time * 0.3;
    vec3 a0 = lissajousPos(1.0, 1.5, 0.8, phi, 1.5, t);
    vec3 a1 = lissajousPos(1.33, 1.0, 1.2, phi * 1.7 + 2.0, 1.2, t * 0.8);
    vec3 a2 = lissajousPos(0.8, 1.25, 1.0, phi * 0.5 + 4.0, 0.9, t * 1.2);

    // Distance to each attractor
    float d0 = length(p - a0);
    float d1 = length(p - a1);
    float d2 = length(p - a2);

    // Gaussian influence falloff
    float inf0 = exp(-d0 * d0 * 0.5);
    float inf1 = exp(-d1 * d1 * 0.8);
    float inf2 = exp(-d2 * d2 * 0.6);

    // Direction toward each attractor
    vec3 dir0 = (a0 - p) / max(d0, 0.001);
    vec3 dir1 = (a1 - p) / max(d1, 0.001);
    vec3 dir2 = (a2 - p) / max(d2, 0.001);

    // Harmonic resonance envelope: each attractor's strength oscillates
    float res0 = 0.5 + 0.5 * sin(u_time * 0.4 + phi * 0.3);
    float res1 = 0.5 + 0.5 * sin(u_time * 0.6 + phi * 0.5 + 1.5);
    float res2 = 0.5 + 0.5 * sin(u_time * 0.5 + phi * 0.7 + 3.0);

    // Radial pull toward attractors
    vec3 pull = vec3(0.0);
    pull += dir0 * inf0 * 0.6 * res0;
    pull += dir1 * inf1 * 0.4 * res1;
    pull += dir2 * inf2 * 0.3 * res2;

    // Tangential orbital component around attractors
    vec3 tan0 = cross(normalize(p + 0.001), normalize(a0 + 0.001));
    vec3 tan1 = cross(normalize(p + 0.001), normalize(a1 + 0.001));
    vec3 tan2 = cross(normalize(p + 0.001), normalize(a2 + 0.001));
    pull += tan0 * inf0 * 0.4 * res0;
    pull += tan1 * inf1 * 0.3 * res1;
    pull += tan2 * inf2 * 0.2 * res2;

    // Simplex noise turbulence for organic drift
    float noise = turbulence(p * 0.5, u_time);
    pull += normalize(p + 0.001) * noise * 0.15;

    // Radial breathing envelope
    float dist = length(p);
    float breathe = 1.0 + 0.1 * sin(u_time * 0.3 + dist * 0.5);

    P[id] = p + pull * breathe;
}

## Test #8 — 2026-06-21 00:00
- **Shader:** Chladni Cymatic Pattern Deformation — multi-modal standing wave interference (4 evolving modes: 2→3, 4→1, 1→5, 3→3) with time-varying mode weights, gradient-based tangential surface displacement, 3-octave simplex noise texture overlay, radial breathing envelope, and per-point index-based spatial phase jitter
- **Fuente:** web_search (Chladni plate equation — pure mathematical standing wave superposition, distinct from noise-based/attractor-based previous tests)
- **POP source:** gridPOP (planey=True, 20×25 = 500 pts, sizex=2.0, XZ plane)
- **Numelems:** 500
- **Errores encontrados:** Ninguno — compiled successfully first try
- **Fixes aplicados:** Error injection test confirmó que GLSL POP lee de `/project1/glsl_test_8/shader_code` con path absoluto (info mostraba "ERROR: /project1/glsl_test_8/shader_code:1") — restauración exitosa con "Compiled Successfully"
- **Estado:** ✅ Funcional — sin errores de compilación
- **Código GLSL:**
```glsl
uniform float u_time;

float chladniMode(vec2 pos, float L, float n, float m) {
    float x = pos.x;
    float y = pos.y;
    float PI = 3.14159265;
    float nx = n * PI * x / L;
    float mx = m * PI * x / L;
    float ny = n * PI * y / L;
    float my = m * PI * y / L;
    return cos(nx) * cos(my) - cos(mx) * cos(ny);
}

float turbulence(vec3 p, float t) {
    float val = 0.0;
    float amp = 0.5;
    float freq = 1.0;
    for(int i = 0; i < 3; i++) {
        val += amp * TDSimplexNoise(vec4(p * freq, t * 0.15));
        freq *= 2.3;
        amp *= 0.45;
    }
    return val;
}

vec2 chladniGrad(vec2 pos, float L, float n, float m) {
    float eps = 0.01;
    float dx = chladniMode(pos + vec2(eps, 0.0), L, n, m) - chladniMode(pos - vec2(eps, 0.0), L, n, m);
    float dy = chladniMode(pos + vec2(0.0, eps), L, n, m) - chladniMode(pos - vec2(0.0, eps), L, n, m);
    return vec2(dx, dy) / (2.0 * eps);
}

void main() {
    const uint id = TDIndex();
    if(id >= TDNumElements()) return;
    
    vec3 p = TDIn_P(0, id);
    vec2 pos = p.xz;
    float L = 2.0;
    float t = u_time;
    
    // Layer 1: 4 evolving Chladni modes
    float n1 = 2.0 + 0.3 * sin(t * 0.12);
    float m1 = 3.0 + 0.3 * cos(t * 0.09);
    float w1 = 0.6 + 0.4 * sin(t * 0.07);
    float c1 = chladniMode(pos, L, n1, m1);
    
    float n2 = 4.0 + 0.4 * sin(t * 0.15 + 1.2);
    float m2 = 1.0 + 0.2 * cos(t * 0.11 + 0.8);
    float w2 = 0.4 + 0.3 * sin(t * 0.13 + 2.5);
    float c2 = chladniMode(pos, L, n2, m2);
    
    float n3 = 1.0 + 0.2 * sin(t * 0.18 + 3.0);
    float m3 = 5.0 + 0.5 * cos(t * 0.14 + 1.5);
    float w3 = 0.3 + 0.2 * sin(t * 0.10 + 0.3);
    float c3 = chladniMode(pos, L, n3, m3);
    
    float n4 = 3.0 + 0.25 * sin(t * 0.06 + 0.5);
    float m4 = 3.0 + 0.25 * cos(t * 0.08 + 2.0);
    float w4 = 0.5 + 0.3 * sin(t * 0.11 + 1.0);
    float c4 = chladniMode(pos, L, n4, m4);
    
    // Layer 2: Vertical displacement
    float combined = w1 * c1 + w2 * c2 + w3 * c3 + w4 * c4;
    float yDisp = combined * 0.3;
    
    // Layer 3: Tangential gradient displacement
    vec2 grad = chladniGrad(pos, L, n1, m1) * w1 * 0.08;
    grad += chladniGrad(pos, L, n2, m2) * w2 * 0.06;
    grad += chladniGrad(pos, L, n3, m3) * w3 * 0.04;
    
    // Layer 4: Noise overlay
    float noise = turbulence(p * 0.6, t) * 0.04;
    
    // Layer 5: Radial breathing
    float dist = length(pos);
    float breathe = 1.0 - 0.2 * dist * dist;
    
    // Layer 6: Per-point jitter
    float idxPhase = float(id) * 0.033;
    float spatialJitter = sin(pos.x * 8.0 + pos.y * 6.0 + idxPhase + t * 0.5) * 0.02;
    
    vec3 result;
    result.x = p.x + grad.x + noise * pos.x * 0.5 + spatialJitter;
    result.y = p.y + yDisp * breathe + noise * 0.3;
    result.z = p.z + grad.y + noise * pos.y * 0.5 + spatialJitter;
    
    P[id] = result;
}
```
## Test #9 — 2026-06-21 02:00
- **Shader:** Curl Noise Fluid Deformation — divergence-free curl noise vector field (gradient of simplex noise potential) with 4-octave FBM, fine-scale micro-turbulence layer, radial breathing envelope, vertical height stratification, per-point index-based jitter, and tangential swirl rotation proportional to curl magnitude
- **Fuente:** web_search (curl noise for TouchDesigner instances — adapted from mir-lab/touchdesigner-instancing-examples, divergence-free vector field concept distinct from scalar noise displacement)
- **POP source:** circlePOP (radx=1.0, rady=1.0, divs=60)
- **Numelems:** 500
- **Errores encontrados:** Ninguno — compiled successfully first try (path absoluto R+'/shader_code', seteo inmediato de computedat antes del primer cook)
- **Fixes aplicados:** Error injection test confirmó que GLSL POP lee de `/project1/glsl_test_9/shader_code` (info mostraba "ERROR: /project1/glsl_test_9/shader_code:1") — restauración exitosa con "Compiled Successfully"
- **Estado:** ✅ Funcional — sin errores de compilación
- **Código GLSL:**
```glsl
uniform float u_time;

// Curl noise: divergence-free vector field from simplex noise gradient
// Creates fluid-like swirling motion distinct from scalar noise displacement

// 3D simplex noise gradient (finite difference approximation)
vec3 noiseGrad(vec3 p) {
    float eps = 0.01;
    float v0 = TDSimplexNoise(p);
    float vx = TDSimplexNoise(p + vec3(eps, 0.0, 0.0));
    float vy = TDSimplexNoise(p + vec3(0.0, eps, 0.0));
    float vz = TDSimplexNoise(p + vec3(0.0, 0.0, eps));
    return (vec3(vx, vy, vz) - v0) / eps;
}

// Curl of a scalar field: curl(F) where F = scalarPotential * [1,1,1]
// curl(F) = (dF_z/dy - dF_y/dz, dF_x/dz - dF_z/dx, dF_y/dx - dF_x/dy)
vec3 curlNoise(vec3 p) {
    vec3 g = noiseGrad(p);
    // For scalar potential field, curl is the gradient cross with axis
    // Simplified: take cross product of noise gradient with direction
    vec3 curl;
    curl.x = g.y * 0.5 - g.z * 0.5;
    curl.y = g.z * 0.5 - g.x * 0.5;
    curl.z = g.x * 0.5 - g.y * 0.5;
    return curl;
}

// Multi-octave curl noise — FBM of curl fields
vec3 curlFbm(vec3 p, float t) {
    vec3 total = vec3(0.0);
    float amp = 1.0;
    float freq = 1.0;
    for(int i = 0; i < 4; i++) {
        vec3 q = p * freq + vec3(t * 0.15 * float(i+1));
        total += curlNoise(q) * amp;
        freq *= 2.1;
        amp *= 0.45;
    }
    return total;
}

void main() {
    const uint id = TDIndex();
    if(id >= TDNumElements()) return;

    vec3 p = TDIn_P(0, id);
    float dist = length(p);
    float distSafe = max(dist, 0.001);

    // Per-point phase offset for spatial variety
    float idxPhase = float(id) * 0.073 + float(id % 11) * 0.041;

    // Layer 1: Primary curl noise displacement (divergence-free fluid flow)
    vec3 curl = curlFbm(p * 0.5 + vec3(0.0, 0.0, u_time * 0.08), u_time);

    // Layer 2: Secondary curl at different scale for micro-turbulence
    vec3 curlFine = curlFbm(p * 1.2 + vec3(1.7, 3.2, u_time * 0.12), u_time * 0.7);

    // Layer 3: Radial breathing envelope
    float breathe = 0.6 + 0.4 * sin(u_time * 0.3 + dist * 0.8 + idxPhase);

    // Layer 4: Vertical stratification — stronger displacement near equator
    float heightFactor = 1.0 - abs(p.y) * 0.3 / max(distSafe, 0.1);
    heightFactor = max(heightFactor, 0.2);

    // Layer 5: Index-based jitter for organic variation
    float jitter = sin(float(id) * 0.19 + u_time * 0.4 + p.x * 2.0) * 0.03;

    // Combine layers
    vec3 displacement = curl * 0.35 * breathe * heightFactor
                      + curlFine * 0.12 * breathe
                      + normalize(p + 0.001) * jitter * 0.5;

    // Layer 6: Tangential swirl — rotate displacement around Y axis by curl magnitude
    float swirlAngle = length(curl) * 0.5 + u_time * 0.05;
    float ca = cos(swirlAngle);
    float sa = sin(swirlAngle);
    vec3 swirled;
    swirled.x = displacement.x * ca - displacement.z * sa;
    swirled.y = displacement.y;
    swirled.z = displacement.x * sa + displacement.z * ca;

    P[id] = p + swirled;
}
```
## Test #10 — 2026-06-21 04:00
- **Shader:** Lorenz Strange Attractor Swarm — chaotic Lorenz system (sigma=10, rho=28, beta=8/3) used as multi-trajectory vector displacement field. 3 trajectory branches (direct position mapping, time-shifted branch, inverted butterfly wing) blended with time-varying weights, radial breathing envelope, tangent-plane noise turbulence overlay, Lorenz Y-height bias, and per-point golden-ratio phase offset for diverse trajectories
- **Fuente:** custom design (chaotic systems — Lorenz strange attractor divergence-free flow field, distinct from curl noise, physical attractors, and Lissajous parametric paths in Tests #2/#6/#7/#9)
- **POP source:** circlePOP (radx=1.0, rady=1.0, divs=60)
- **Numelems:** 500
- **Errores encontrados:** Ninguno — compiled successfully first try (path absoluto R+'/shader_code', seteo inmediato de computedat antes del primer cook)
- **Fixes aplicados:** Error injection test confirmó que GLSL POP lee de `/project1/glsl_test_10/shader_code` (lorenz_pop_info mostraba "Compiled Successfully" tras restauración)
- **Estado:** ✅ Funcional — sin errores de compilación
- **Código GLSL:**
```glsl
uniform float u_time;

// Lorenz system: sigma, rho, beta
// Creates the iconic butterfly-shaped strange attractor
const float sigma = 10.0;
const float rho = 28.0;
const float beta = 8.0 / 3.0;

// Lorenz derivative
vec3 lorenz(vec3 p) {
    vec3 v;
    v.x = sigma * (p.y - p.x);
    v.y = p.x * (rho - p.z) - p.y;
    v.z = p.x * p.y - beta * p.z;
    return v;
}

// Multi-octave turbulence
float turbulence(vec3 p, float t) {
    float val = 0.0;
    float amp = 0.5;
    float freq = 1.0;
    for(int i = 0; i < 4; i++) {
        val += amp * TDSimplexNoise(vec4(p * freq, t * 0.15));
        freq *= 2.1;
        amp *= 0.45;
    }
    return val;
}

void main() {
    const uint id = TDIndex();
    if(id >= TDNumElements()) return;

    vec3 p = TDIn_P(0, id);
    float dist = length(p);
    float distSafe = max(dist, 0.001);

    // Per-point phase: golden ratio + index variation for diverse trajectories
    float phase = float(id) * 1.618 + float(id % 7) * 0.079;

    // Map point into Lorenz attractor space
    // Lorenz attractor operates at scale ~30, so we scale up
    vec3 lpos = p * 10.0 + vec3(0.0, 0.0, 25.0);

    // Layer 1: Primary Lorenz trajectory (direct position mapping)
    vec3 vel1 = lorenz(lpos + vec3(sin(phase), cos(phase * 1.3), 0.0));

    // Layer 2: Time-shifted trajectory branch
    vec3 lpos2 = lpos + vec3(2.0 * sin(u_time * 0.1 + phase), 0.0, 2.0 * cos(u_time * 0.1 + phase * 0.7));
    vec3 vel2 = lorenz(lpos2);

    // Layer 3: Inverted attractor branch (opposite wing of the butterfly)
    vec3 lpos3 = -lpos + vec3(0.0, 5.0 * sin(u_time * 0.08 + phase * 1.1), 5.0 * cos(u_time * 0.12));
    vec3 vel3 = lorenz(lpos3);

    // Blend the three trajectories with time-varying weights
    float w1 = 0.5 + 0.3 * sin(u_time * 0.15 + phase * 0.5);
    float w2 = 0.4 + 0.3 * sin(u_time * 0.2 + phase * 0.8 + 1.5);
    float w3 = 0.3 + 0.3 * cos(u_time * 0.18 + phase * 0.3 + 3.0);
    float wSum = w1 + w2 + w3;
    w1 /= wSum; w2 /= wSum; w3 /= wSum;

    vec3 displacement = (vel1 * w1 + vel2 * w2 + vel3 * w3) * 0.025;

    // Radial breathing envelope
    float breathe = 0.6 + 0.4 * sin(u_time * 0.3 + dist * 0.8 + phase * 0.2);
    displacement *= breathe;

    // Noise turbulence overlay
    float noise = turbulence(p * 0.5 + vec3(phase * 0.1), u_time);
    float noiseStrength = 0.06 + 0.02 * sin(u_time * 0.22 + phase);

    // Add noise in tangent plane
    vec3 dir = normalize(p + 0.001);
    vec3 up = abs(dir.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
    vec3 tangent = normalize(cross(dir, up));
    vec3 bitangent = normalize(cross(dir, tangent));
    displacement += tangent * noise * noiseStrength;
    displacement += bitangent * TDSimplexNoise(vec4(p * 0.7, u_time * 0.2 + phase * 0.3)) * noiseStrength;

    // Height modulation: points further from origin get Y bias from Lorenz
    float heightBias = vel1.y * 0.01 * breathe;
    displacement.y += heightBias;

    // Per-point micro-jitter for organic feel
    float jitter = sin(float(id) * 0.23 + u_time * 0.5 + p.x * 1.5) * 0.015;
    displacement += vec3(jitter);

    P[id] = p + displacement;
}
```
