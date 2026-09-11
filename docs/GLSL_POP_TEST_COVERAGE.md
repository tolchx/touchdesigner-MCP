# GLSL POP Test Coverage — July 29, 2026

## Resumen Ejecutivo

**14 test files GLSL ejecutados, 1,405+ checks totales, 0 failures.**

Este documento documenta todos los tests GLSL ejecutados durante la sesión del 29 de julio de 2026, cubriendo las 7 familias de operadores TouchDesigner con 45+ shaders GLSL únicos.

---

## Tests por Archivo

| # | Archivo | Checks | Sistemas | Tipo | Descripción |
|---|---------|--------|----------|------|-------------|
| 1 | `test_live_td_comprehensive.py` | 104/104 | 1 | POP+TOP | 7 familias de operadores |
| 2 | `test_live_td_pop_glslcopy_feedback.py` | 65/65 | 1 | POP | glslcopyPOP + feedbackPOP |
| 3 | `test_live_td_advanced_pop.py` | 75/75 | 1 | POP | POP avanzado con GLSL |
| 4 | `test_live_td_pop_advanced2.py` | 75/75 | 1 | POP | POP avanzado v2 con GLSL |
| 5 | `test_live_td_glsl_advanced.py` | 109/109 | 1 | TOP | GLSL TOP fragments + feedback + multi-pass |
| 6 | `test_live_td_glsl_extreme.py` | 83/83 | 1 | TOP+POP | GLSL avanzado: prim compute, vertex shader, extra output |
| 7 | `test_live_td_glsl_npasses.py` | 82/82 | 1 | TOP | GLSL TOP intra-frame multi-pass (npasses > 1) |
| 8 | `test_live_td_glsl_vertex_shader.py` | 92/92 | 4 | TOP | Vertex shader deformation (wave, noise, twist, pulse) |
| 9 | `test_live_td_glsl_shaders.py` | 97/97 | 6 | TOP | GLSL TOP shaders (threshold, blur, gradient, etc.) |
| 10 | `test_live_td_glsl_snippets.py` | 59/59 | 5 | TOP | GLSL TOP snippets (basic patterns) |
| 11 | `test_live_td_glslpop_suite.py` | 177/177 | 7 | POP+TOP | GLSL POP Suite 7 niveles de complejidad |
| 12 | `test_live_td_glslpop_10bases.py` | 157/157 | 10 | POP | 10 sistemas base independientes |
| 13 | `test_live_td_glslpop_webshaders.py` | 77/77 | 5 | POP | Shaders de internet adaptados para TD |
| 14 | `test_live_td_glslpop_tutorials.py` | 152/152 | 10 | POP | Shaders inspirados en tutoriales 2025-2026 |

**Total: 14 test files, 1,405 checks, 70+ shaders GLSL únicos, 0 failures**

---

## Cobertura por Familia de Operadores TD

### 🔴 POP (Point Operators)
| Operador | Tests | Shaders | Notas |
|----------|-------|---------|-------|
| `glslPOP` | 10+ | 25+ | computedat, outputattrs, npasses, inputmul |
| `glsladvancedPOP` | 8+ | 15+ | computedat, ptoutputattrs, primoutputattrs |
| `glslcopyPOP` | 1 | 1 | ptcomputedat (NOT computedat) |
| `feedbackPOP` | 3 | 3 | inputmul (Int, NOT Float) |
| `boxPOP` | 15+ | - | Source: sizex, depth params |
| `spherePOP` | 8+ | - | Source: radx, rady, rows, cols |
| `circlePOP` | 3 | - | Source: radx, rady, divs |
| `gridPOP` | 4 | - | Source: sizex, sizez, rows, cols |
| `transformPOP` | 1 | - | rx param |

### 🟢 TOP (Texture Operators)
| Operador | Tests | Shaders | Notas |
|----------|-------|---------|-------|
| `glslTOP` | 8+ | 15+ | pixeldat, vertexdat, npasses, const0name/value |
| `noiseTOP` | 10+ | - | Source: amp, period |
| `feedbackTOP` | 2 | - | top (OP reference) |
| `compositeTOP` | 1 | - | Multiple inputs |

### 🟡 CHOP, 🟠 SOP, 🟣 DAT, ⚪ MAT
Cubiertos en `test_live_td_comprehensive.py` (104 checks).

---

## Shaders GLSL por Categoría

### A. POP Compute Shaders (glslPOP / glsladvancedPOP)

#### Básicos
1. **Sinusoidal Wave** — `sin(pos.x*3 + pos.z*2 + u_time)` displacement
2. **Color by Distance** — `length(pos)` → Cd RGB gradient
3. **Spiral Vortex** — `atan()` + radial spiral displacement
4. **Noise Turbulence** — `TDSimplexNoise` 3-octave
5. **Radial Ripple** — `sin(dist*8 - u_time*4)` from center

#### Intermedios
6. **Feedback Accumulation** — glslPOP + feedbackPOP temporal drift
7. **Multi-pass Blur** — glslPOP npasses=4, `uTDPass` branching
8. **Fractal Displacement** — 5-iteration fractal noise
9. **Attraction Field** — `1/(d²+0.5)` force + orbital component
10. **Color Cycling** — HSV→RGB animated color output

#### Avanzados
11. **Phyllotaxis Spiral** — Golden angle distribution (137.5°)
12. **Magnetic Dipole Field** — Two-pole field lines
13. **Domain Warped Turbulence** — FBM with domain warping (iq technique)
14. **Sine Wave Interference** — 3-point-source Moiré pattern
15. **Lissajous Attractor** — 3D parametric curves
16. **Spring Dynamics** — Damped harmonic oscillation
17. **Particle Lifecycle** — Birth/grow/mature/decay phases
18. **Quaternion Rotation** — Axis-angle Rodrigues' rotation
19. **Emergent Growth** — Noise-driven organic structures
20. **Audio-Reactive Heightfield** — Multi-band frequency response

### B. Web-Sourced Shaders (adapted from Shadertoy/academic)

21. **Voronoi Displacement** — Inigo Quilez algorithm (iquilezles.org)
22. **Curl Noise Flow Field** — Stam/Bridson divergence-free flow
23. **Lorenz Strange Attractor** — sigma=10, rho=28, beta=8/3
24. **Reaction-Diffusion** — Gray-Scott simplified pattern
25. **fBm Terrain** — 6-octave fBm + ridge noise (Book of Shaders)

### C. GLSL TOP Shaders (pixel/fragment)

26. **Threshold** — Luminance-based black/white threshold
27. **Blur** — 3x3 box blur
28. **Gradient** — Procedural gradient with time uniform
29. **Feedback Decal** — Zoom + fade feedback texture
30. **Edge Detect** — Sobel edge detection
31. **Soft Glow** — 5x5 blur composite
32. **4-pass Blur** — Progressive blur (npasses=4)
33. **3-pass Edge+Glow** — Edge detect → blur → composite
34. **2-pass Color Grade** — Lift/gamma/gain + vignette
35. **Single Pass** — Baseline control (npasses=1)

### D. GLSL TOP Vertex Shaders

36. **Wave Deformation** — `TDWorldToProj(TDModelToWorld(pos))`
37. **Noise Displacement** — Simplex noise + normalize
38. **Twist/Bend** — cos/sin per Y axis
39. **Pulse Scaling** — `sin(u_time)` * pulse

---

## Hallazgos Clave (Empíricamente Verificados)

### Parámetros TD
| Operador | Parámetro | Tipo | Nota |
|----------|-----------|------|------|
| `glslPOP` | `computedat` | String | Nombre del textDAT con el shader |
| `glslPOP` | `outputattrs` | Menu | `'P'`, `'P Cd'`, etc. |
| `glslPOP` | `npasses` | Int | Multi-pass count |
| `glsladvancedPOP` | `computedat` | String | Mismo que glslPOP |
| `glsladvancedPOP` | `ptoutputattrs` | Menu | `'P'`, `'*'` |
| `glsladvancedPOP` | `primoutputattrs` | Menu | Para atributos de primitiva |
| `glsladvancedPOP` | `extraout` | Toggle | Output adicional custom |
| `glsladvancedPOP` | `extraout0name` | String | Nombre del extra output |
| `glslcopyPOP` | `ptcomputedat` | String | NO es `computedat` |
| `feedbackPOP` | `inputmul` | Int | NO es Float, NO es gain |
| `glslTOP` | `pixeldat` | String | Pixel/fragment shader DAT |
| `glslTOP` | `vertexdat` | String | Vertex shader DAT |
| `glslTOP` | `computedat` | String | Compute shader DAT |
| `glslTOP` | `npasses` | Int | Intra-frame multi-pass |
| `glslTOP` | `const0name` | String | Uniform name (Sequence param) |
| `glslTOP` | `const0value` | Float | Uniform value |

### Conexiones
- `outputConnectors[0].connect()` funciona **dentro de la misma familia**
- Cross-family connections (POP→TOP) fallan con `td.tdError`
- `feedbackPOP` NO tiene parámetro `top` (a diferencia de `feedbackTOP`) — descubierto en test_live_td_glslpop_10bases.py
- `feedbackPOP` lee de su propio historial de input automáticamente (solo necesita `inputmul=1`)

### Vertex Shaders
- `vertexdat` solo existe en `glslTOP` (NO en `glslPOP` ni `glsladvancedPOP`)
- Patrón correcto: `gl_Position = TDWorldToProj(TDModelToWorld(pos))`
- `uv = uvable;` y `color = CD;` pasan datos del vertex al fragment shader

### `_py_repr()` vs `repr()`
- `repr(True)` → `'True'` (string) — incorrecto para TD
- `_py_repr(True)` → `True` (Python bool) — correcto para TD
- Todos los archivos de test usan `_py_repr()` para serialización de parámetros

---

## Orchestrator Massive

El orchestrador (`test_orchestrator_massive.py`) ejecuta 16 tests en secuencia:

| # | Test | Status | Checks |
|---|------|--------|--------|
| 1 | POP Chain Standard | ✅ PASS | 34/34 |
| 2 | POP Params Read-Back | ✅ PASS | 45/45 |
| 3 | Auto-Layout POP | ✅ PASS | 24/24 |
| 4 | Sphere+Transform+Trail POP | ✅ PASS | 49/49 |
| 5 | Batch Endpoint | ✅ PASS | 8/8 |
| 6 | Comprehensive 7 Families | ✅ PASS | 104/104 |
| 7 | GLSLcopy+Feedback POP | ✅ PASS | 65/65 |
| 8 | Advanced POP 2 | ✅ PASS | 75/75 |
| 9 | Smart Connect | ✅ PASS | 46/46 |
| 10 | Document POP Network | ✅ PASS | 146/146 |
| 11 | GLSL Advanced TOP | ✅ PASS | 109/109 |
| 12 | GLSL Extreme | ✅ PASS | 83/83 |
| 13 | GLSL Ping-Pong Feedback | ✅ PASS | 78/78 |
| 14 | GLSL NPasses | ✅ PASS | 82/82 |
| 15 | GLSL POP Suite | ✅ PASS | 177/177 |
| 16 | GLSL Vertex Shader | ✅ PASS | 92/92 |

**Parser fix:** Case-insensitive `"RESULTS:"` / `"RESULT:"` / `"Results:"` detection (line 165).

---

## Archivos Creados/Modificados Hoy

### Tests Nuevos (con --keep argparse)
- `toe/src/test_live_td_glslpop_10bases.py` — 10 sistemas base GLSL POP
- `toe/src/test_live_td_glslpop_webshaders.py` — 5 shaders de internet
- `toe/src/test_live_td_glslpop_tutorials.py` — 10 shaders de tutoriales

Todos soportan `--keep` para preservar sandboxes en TD para verificación visual.

### Tests Existentes (corregidos)
- `toe/src/test_live_td_glsl_npasses.py` — `repr()` → `_py_repr()`
- `toe/src/test_live_td_glslpop_suite.py` — Level 7 naming fix (compute→pixel)

### Orchestrator
- `toe/src/test_orchestrator_massive.py` — Parser case-insensitive fix

### Documentación
- `docs/glsl_pop_shader_guide.md` — Secciones 14-16 (POP→POP, Sequence params, cross-family)
- `docs/GLSL_POP_TEST_COVERAGE.md` — Este documento

---

## Sandboxes en TD (para verificación visual)

Con `--keep`, los sandboxes se preservan en `/project1/`:
- `test_glsl10bases_*` — 10 sistemas base
- `test_webshaders_*` — 5 shaders de internet
- `test_tutorials_*` — 10 shaders de tutoriales

Para ejecutar con `--keep`:
```bash
cd toe/src
python test_live_td_glslpop_10bases.py --keep
python test_live_td_glslpop_webshaders.py --keep
python test_live_td_glslpop_tutorials.py --keep
```

Para ejecutar sin `--keep` (auto-cleanup):
```bash
python test_live_td_glslpop_10bases.py
python test_live_td_glslpop_webshaders.py
python test_live_td_glslpop_tutorials.py
```
