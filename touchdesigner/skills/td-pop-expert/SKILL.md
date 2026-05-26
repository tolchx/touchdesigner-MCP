---
name: td-pop-expert
description: "Use when working with POPs (Point Operators) in TouchDesigner. Expert knowledge base: 33+ modules, 50+ operators, GPU particle systems, forces, fields, GLSL shaders, SPH fluids, Ray POP, hair systems, and advanced simulation techniques."
version: 1.0.0
author: Tolch
license: MIT
metadata:
  hermes:
    tags: [touchdesigner, pops, particles, gpu, simulation, glsl]
    related_skills: [td-core-discipline, td-pops-advanced, td-build-2025]
---

# TD POP Expert — Complete Reference

## Overview

Point Operators (POPs) are TouchDesigner's GPU-native geometry processing operators. Unlike SOPs (CPU), POPs process points directly on the GPU, enabling:
- **Massive simulations**: Millions of particles at real-time framerates
- **Per-point processing**: Every point has attributes (position, color, velocity, custom data)
- **GPU acceleration**: Forces, fields, math, noise all run on GPU
- **Geometry pipeline**: POPs → SOPs → TOPs for rendering

## Operator Catalog by Category

### Generators (Sources)
| Operator | Description | Key Params |
|----------|-------------|------------|
| `pointGeneratorPOP` | Creates new points from scratch | numPoints, rate, life, initialVelocity |
| `spherePOP` | Points distributed on/inside sphere | radius, density, distribution (surface/volume) |
| `boxPOP` | Points on/inside box | size, uniform |
| `circlePOP` | Points on circle/ring | radius, arc, orient |
| `tubePOP` | Points on tube surface | radius, height, caps |
| `curvePOP` | Points along a curve | curve, resample, spacing |
| `spritePOP` | Billboard sprites from texture | texture, size, orientation |
| `gridPOP` | Grid of points | rows, cols, spacing |
| `scatterPOP` | Scatter points on geometry surface | source, density |
| `pointFileInPOP` | Load points from file (Alembic, CSV) | file, format |
| `alembicInPOP` | Alembic geometry import | file, sequence |

### Solvers (Simulation)
| Operator | Description | Key Params |
|----------|-------------|------------|
| `particlePOP` | Main particle solver | birthRate, life, maxParticles, updateMode |
| `feedbackPOP` | Feedback loop for iterative simulations | iterations, blend |
| `cachePOP` | Cache point data for playback | frames, mode |
| `cacheBlendPOP` | Blend between cached states | blend, cacheA, cacheB |
| `cacheSelectPOP` | Select cache frame | index, interpolate |

### Forces
| Operator | Description | Key Params |
|----------|-------------|------------|
| `forcePOP` | Generic force (direction + magnitude) | direction, magnitude, falloff |
| `forceRadialPOP` | Radial force (attract/repel from center) | center, strength, radius, falloff |
| `dragPOP` | Damping/air resistance | amount, perAxis |
| `noisePOP` | Noise-based force field | amplitude, frequency, type, seed |
| `windPOP` | Wind simulation | speed, direction, turbulence, gust |
| `vortexPOP` | Vortex/turbulence force | axis, strength, radius |
| `springPOP` | Spring constraint force | stiffness, damping, restLength |
| `POPfield` | Field-based force from 3D texture | field, intensity, channel |

### Modifiers
| Operator | Description | Key Params |
|----------|-------------|------------|
| `mathPOP` | Per-point math operations | operation, channel, value |
| `limitPOP` | Clamp/constrain point attributes | min, max, attribute, wrap |
| `colorPOP` | Color points by attribute/value | color, ramp, attribute |
| `attributePOP` | Create/manipulate custom attributes | name, type, size, default |
| `attributeCombinePOP` | Combine attributes from two inputs | operation, attribA, attribB |
| `attributeConvertPOP` | Convert attribute types | from, to, precision |
| `deletePOP` | Delete points by condition | condition, channel, threshold |
| `normalizePOP` | Normalize vector attributes | attribute, magnitude |
| `sortPOP` | Sort points by attribute | attrib, order |
| `blendPOP` | Blend point data from two inputs | blend, attribs |

### Convert/Import
| Operator | Description | Key Params |
|----------|-------------|------------|
| `CHOPtoPOP` | Create points from CHOP data | channels, format |
| `DATtoPOP` | Create points from DAT table | columns, format |
| `TOPtoPOP` | Create points from TOP pixels | resolution, RGBA mapping |
| `SOPtoPOP` | Convert SOP geometry to POP | divide, attributes |

### Output
| Operator | Description | Key Params |
|----------|-------------|------------|
| `nullPOP` | Inspection endpoint for POP chain | - |
| `outPOP` | Output POP data to parent COMP | label, icon |
| `alembicOutPOP` | Export to Alembic | file, frameRange |
| `fileOutPOP` | Write points to file | file, format, everyFrame |

## Module-by-Module Content

### 🌱 Básico (8 modules)

**b1 - Generadores y Geometría**: Fundamentals of point generation. Use `pointGeneratorPOP` for particles, `spherePOP`/`boxPOP` for volume fills, `circlePOP` for ring effects. GPU does all computation — the key insight is that points are just data (position + attributes), geometry comes from how you connect them (SOP chains after POP).

**b2 - Partículas Básicas**: `particlePOP` is the central solver. Parameters: birthRate (particles/sec), life (seconds), maxParticles (pool). The solver handles integration: position += velocity * dt. Connect `pointGeneratorPOP` → `particlePOP` → `nullPOP`. Particles auto-expire based on life.

**b3 - Tipos de Generadores**: Comparison of generator types:
- `pointGeneratorPOP`: Best for emission effects, controllable rate
- `spherePOP`/`boxPOP`: Static fills, one-shot
- `curvePOP`: Path-based, great for trails
- `gridPOP`: Structured layouts

**b4 - Atributos y Datos Básicos**: POP attributes are per-point data:
- **Reserved**: P (position), N (normal), Cd (color), uv, v (velocity), life, age
- **Custom**: Any name, any type (float, vector, color, int)
- Attributes persist through the chain; created via `attributePOP`

**b5 - Transformaciones Básicas**: Scale, rotate, translate using `mathPOP` on P attribute. Transform order matters: scale → rotate → translate is standard.

**b6 - Renderizado Básico**: POPs render through `SOPtoPOP` → `geometryCOMP` → `renderTOP`. Key: set `render=True` and `display=True` on the SOP. Point size via `pointSOP.par.pointsize`.

**b7 - Workflows Básicos**: Standard chains:
- Point cloud: `spherePOP` → `nullPOP` → `SOPtoPOP` → `renderTOP`
- Particles: `pointGeneratorPOP` → `particlePOP` → `dragPOP` → `nullPOP`
- Colored: `spherePOP` → `colorPOP` → `nullPOP`

### ⚡ Intermedio (12 modules)

**i1 - Deformaciones Avanzadas**: Use `mathPOP` with expressions on P. Patterns: sine wave deformation (`P.y += sin(P.x * freq + time) * amp`), twist, bend, taper. `noisePOP` for organic deformation.

**i2 - Manipulación de Atributos**: Advanced attribute workflows: copy attributes between POPs, combine multiple attributes, use `attributeCombinePOP` for blending. Channels in `CHOPtoPOP` map to POP attributes by name.

**i3 - Introducción a GLSL**: POP GLSL runs per-point in `glslPOP`. Access attributes as `P`, `v`, `Cd`, custom via `attribute()`. Standard GLSL TOP/glslMAT knowledge applies.

**i4 - Fuerzas y Física**: Force chain: `forcePOP` (gravity) → `dragPOP` (damping) → `noisePOP` (turbulence). `forceRadialPOP` for attractors/repellers. Use multiple forces summed.

**i5 - Matemáticas y Ruido**: `noisePOP` parameters: type (perlin, simplex, sparse, alligator, random), amplitude, frequency, seed, roughness, harmonics 4D support with derivatives.

**i6 - Operadores de Utilidad**: `limitPOP` clamps attributes (P within bounds). `sortPOP` reorders by any attribute. `deletePOP` removes points by threshold. `normalizePOP` normalizes vectors.

**i7 - Interactividad Básica**: Connect CHOP data to POP attributes. `CHOPtoPOP` reads channels as point attributes. Use `mouseCHOP`, `lfoCHOP`, or `audioAnalysisCHOP` as drivers.

**i8 - Arquitectura Procedural**: Building modular POP systems inside `baseCOMP`. Standard I/O: `inPOP` at entry, `nullPOP` at exit. Encapsulation with custom parameters exposed to parent.

**i9 - Salida DMX**: `DMXFixturePOP` maps points to DMX fixtures. Each point = one fixture. `DMXOutPOP` sends Art-Net/sACN. `panTiltCHOP` converts direction to pan/tilt angles.

**i10 - Sensores y Tracking**: Connect sensor data to POPs: `kinectCHOP` → `CHOPtoPOP` for body tracking points. `blobTrackCHOP` for 2D tracking. ZED camera integration.

**i11 - CHOPs en Tiempo Real**: Audio-reactive POPs: `audioAnalysisCHOP` → `CHOPtoPOP` drives particle properties. Use audio spectrum to control birth rate, life, forces, color.

**i12 - Sistemas Audio-Reactive**: Advanced audio pipelines. FFT analysis mapped to multiple POP attributes. Bass drives birth rate, mids drive forces, highs drive color.

### 🔥 Avanzado (13 modules)

**a1 - Programación GLSL Avanzada**: Writing custom GLSL for `glslPOP`. Access all attributes as `layout(location=N)`. Use `dFdx`/`dFdy` for derivatives. compute shader patterns for POP processing.

**a2 - Optimización GPU vs CPU**: Profile with `cookTime` and `numPoints`. GPU bottlenecks: overdraw, memory bandwidth. CPU bottlenecks: `td_execute` calls, parameter evaluation. Use `cachePOP` for pre-computed simulations.

**a3 - Kinect, Leap y Cámaras**: Full body tracking → POP particles pipeline. Kinect depth → TOP → `TOPtoPOP` for point clouds. Leap Motion for hand tracking → POP particle attractors.

**a4 - Instalaciones y Performances**: Production-ready POP systems. Error handling with `nullPOP` for debugging, `OPViewer` for inspection. Project structure: one `baseCOMP` per system.

**a5 - Flocking**: Boids algorithm in POPs. Three forces: separation (avoid neighbors), alignment (match velocity), cohesion (move to center). Implement each as separate `forcePOP` or custom GLSL.

**a6 - Fluidos**: SPH (Smoothed Particle Hydrodynamics) in POPs. Density computation via neighbor search, pressure force, viscosity. Use `sphPOP` or custom GLSL compute.

**a7 - Fractales**: Iterative function systems in POPs. Use `feedbackPOP` for iteration, `mathPOP` for affine transformations. Sierpinski, Mandelbrot sets via point accumulation.

**a8 - Machine Learning**: TensorFlow/PyTorch integration via `scriptCHOP`/`scriptTOP`. Export POP data as training data. Use ML for particle control (style transfer on point positions).

**a9 - Datos Masivos**: Handling millions of points. Use GPU instancing, `cachePOP` for playback, level-of-detail with `deletePOP` based on camera distance.

**a10 - Redes Neuronales Visuales**: Neural network-driven POPs. Real-time inference on point attributes. Use ONNX runtime in TD for model inference on particle data.

**a11 - Biomimética**: Nature-inspired algorithms: ant colony optimization, slime mold, reaction-diffusion, cellular automata — all implemented in POPs. Use `feedbackPOP` for iterative computation.

**a12 - Quantum**: Quantum-inspired computing metaphors in POPs. Probabilistic point distribution, superposition via multiple attribute states, entanglement via attribute correlation.

**a13 - Tiempo y Memoria**: Temporal effects: particle trails, motion blur, time warping. Use `cachePOP` for time-rewind. `feedbackPOP` for persistent memory effects.

## GLSL in POPs

`glslPOP` is the main GLSL operator for POPs. Key differences from GLSL TOP:

```glsl
// Standard uniforms available
uniform float uTime;
uniform int uFrame;

// Point attributes as input/output
layout(location = 0) in vec3 P;      // Position (read)
layout(location = 0) out vec3 outP;  // Write new position
layout(location = 1) inout vec3 v;   // Velocity (read/write)
layout(location = 2) inout vec4 Cd;  // Color (read/write)
layout(location = 3) in float life;
layout(location = 4) in float age;

// Custom attributes via location
layout(location = 5) in float myAttr;
layout(location = 5) out float outMyAttr;

void main() {
    outP = P + v * uTime;
}
```

## Flyers (Visual Summaries)

14 flyers covering: Fundamentos de POPs, Atributos y Color, Sistemas de Partículas, Campos de Fuerza, Matemáticas, Feedback y Simulación, Copy e Instancias, Noise y Organicismo, Líneas y Métricas, Importación 3D, Primeros Experimentos, Efectos Avanzados, Ray POP, Interactive y Sensores.

Each flyer is a single-page visual cheat sheet. Extended versions have deeper parameter coverage.

## NotebookLM Resources

50+ resources available in the TD Academy NotebookLM section covering:
- POP fundamentals through advanced GPU simulation
- Attribute architecture and data flow
- GLSL POP compute shaders
- GPU fluid simulation (SPH)
- Particle POP masterclass
- POP system architecture blueprints
- Precision POP pipelines
- Procedural data sculpting
- Topological blueprints

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Points not visible | SOPtoPOP → geometryCOMP missing | Check render/display flags, point size |
| Zero particles | life=0 or rate=0 | Set life>0, increase birthRate |
| Particles don't move | no forces connected | Add forcePOP, noisePOP, or velocity in generator |
| GPU crash | too many points | Reduce maxParticles, check VRAM |
| Attribute errors | attribute name mismatch | Verify spelling, check attributePOP scope |
| POP vs SOP confusion | wrong operator family | Use SOPtoPOP to convert, or use compat TOP |
| Simulation jitter | timestep too large | Reduce timestep, enable sub-stepping |
| Points explode | force too strong | Reduce force magnitude, add dragPOP |
| Feedback loop infinite | no exit condition | Add deletePOP or limitPOP in path |
| Cache not playing | frame range wrong | Set cachePOP to match project timeline |
| Expression not evaluating | .mode not set | Set par.mode = ParMode.EXPRESSION |
| Wrong attribute on output | nullPOP showing wrong data | Check which input is connected to nullPOP |

## Best Practices

1. **Always use `nullPOP`** at the end of a chain for debugging
2. **Encapsulate** in `baseCOMP` with `inPOP`/`outPOP` standard I/O
3. **Color code** chains: blue=generators, green=forces, orange=output
4. **Layout**: 250px horizontal, 200px vertical, left→right flow
5. **Check errors** via `.cookStatus` after every major change
6. **Use `cachePOP`** for pre-baked simulations to save GPU time
7. **Start small**: 1000 points for testing, scale up for final
8. **Prefer GPU forces** (noisePOP, forcePOP) over CPU (td_execute)
9. **Batch similar particles**: one POP chain > many small chains
10. **Document attributes**: what gets created/modified where
