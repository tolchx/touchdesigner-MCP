---
name: "td-pops-glsl"
description: "GLSL programming for POPs in TouchDesigner — GPU compute shaders, vertex/fragment shaders, GLSL POP family, GPU vs CPU optimization, math and noise functions"
version: "1.0.0"
author: "TD Edu Master"
tags: ["touchdesigner", "pops", "glsl", "gpu-compute", "vertex-shader", "fragment-shader", "math", "noise", "optimization", "compute-shader"]
---

# td-pops-glsl

## Overview

This skill covers GLSL (OpenGL Shading Language) programming within the POP ecosystem of TouchDesigner. It covers the GLSL POP family (GLSL POP, GLSL Create POP, GLSL Copy POP, GLSL Select POP), GPU vs CPU optimization strategies, and mathematical/noise functions for procedural point generation. GLSL enables custom GPU shaders that operate directly on point data, unlocking techniques impossible with native operators alone.

---

## Part 1: GLSL Programming for POPs

### The GLSL POP Family

TouchDesigner provides four specialized GLSL POP operators:

| Operator | Purpose | Use Case |
|----------|---------|----------|
| **GLSL POP** | Modify existing point attributes | Displacement, color, deformation |
| **GLSL Create POP** | Generate new points from shader | Mathematical surfaces, fractals, L-systems |
| **GLSL Copy POP** | Duplicate points with variation | Instancing with per-copy variation |
| **GLSL Select POP** | Filter points by condition | Spatial queries, conditional deletion |

### Why GLSL in POPs

**Performance:** A single well-written GLSL shader can replace dozens of chained native POPs, eliminating intermediate data transfer overhead.

**Expressivity:** Custom noise functions, reaction-diffusion, flocking, and complex physics require GLSL.

**Portability:** GLSL skills transfer to game engines, WebGL, and other shader-based systems.

**Control:** Per-vertex, per-pixel precision over every aspect of point processing.

### When to use GLSL POP vs built-in operators

| Scenario | Use Built-in | Use GLSL POP |
|----------|-------------|--------------|
| Simple transforms (translate, rotate, scale) | Transform POP | Only when combining with custom logic |
| Noise displacement | Noise POP | Custom noise functions not available in native |
| Attribute math | Math POP | Complex multi-attribute formulas |
| Particle physics (gravity, drag, turbulence) | Particle POP | Custom force fields, swarm behaviors |
| Point selection/filtering | Select POP | Spatial queries, neighbor-aware selection |
| Procedural generation | Generators | Mathematical surfaces, fractals, L-systems |
| Reaction-diffusion | — | GLSL required |
| Custom flocking/boids | — | GLSL required |
| Neural network viz | — | GLSL required |

**Teaching principle:** Always solve with built-in operators first. Use GLSL only when native tools cannot achieve the desired result.

### GLSL Execution Model in POPs

GLSL shaders execute on the GPU in massively parallel fashion:
- **One thread per point:** Each point is processed by an independent GPU thread
- **No inter-thread communication:** Threads cannot directly share data or synchronize
- **Deterministic output:** Same input + same shader = same output (no randomness without seeds)
- **SIMD execution:** All threads execute the same instructions on different data

### Essential GLSL Data Types for POPs

| Type | Description | POP Use Case |
|------|-------------|--------------|
| `float` | Single-precision decimal | Scalar attributes (pscale, age, mass) |
| `int` | Integer | IDs, indices, discrete states |
| `vec2` | 2D vector | UV coordinates, 2D positions |
| `vec3` | 3D vector | Position (P), normal (N), velocity (v), color (Cd.rgb) |
| `vec4` | 4D vector | Color (Cd = RGBA), quaternions |
| `mat3` | 3×3 matrix | Rotation matrices, normal transforms |
| `mat4` | 4×4 matrix | Full transformation matrices |
| `sampler2D` | 2D texture sampler | Reading TOP data in GLSL |
| `sampler3D` | 3D texture sampler | Reading 3D textures, volume data |

### Built-in GLSL Functions for POP Work

```glsl
// Vector math
length(v)           // Magnitude of vector
normalize(v)        // Unit vector in same direction
dot(a, b)           // Dot product (cosine of angle)
cross(a, b)         // Cross product (perpendicular vector)
distance(a, b)      // Distance between two points

// Interpolation
mix(a, b, t)        // Linear interpolation (lerp)
smoothstep(e0, e1, v)  // Hermite interpolation
step(edge, v)       // Step function (binary threshold)

// Clamping and mapping
clamp(v, min, max)  // Constrain to range
fract(x)            // Fractional part
floor(x) / ceil(x)  // Round down/up

// Trigonometric
sin(x), cos(x), tan(x)  // Standard trig (radians)
asin(x), acos(x), atan(y, x)  // Inverse trig

// Exponential
pow(x, y)           // x raised to y
exp(x)              // e raised to x
log(x)              // Natural logarithm
sqrt(x)             // Square root

// Random (pseudo)
float random(vec2 st) {
    return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453);
}
```

### GLSL POP: Vertex Shader Fundamentals

In a GLSL POP, the vertex shader runs for each point. Key inputs and outputs:

**Input attributes (read from current point):**
```glsl
in vec3 P;          // Position
in vec3 N;          // Normal
in vec4 Cd;         // Color
in vec3 uv;         // Texture coordinates
in float pscale;    // Point scale
// Custom attributes also available
```

**Output attributes (write to modified point):**
```glsl
out vec3 P;         // Modified position
out vec4 Cd;        // Modified color
// Any attribute can be modified
```

**Uniforms provided by TouchDesigner:**
```glsl
uniform float time;          // Current time in seconds
uniform vec2 resolution;     // Viewport resolution
uniform int frame;           // Current frame number
uniform mat4 tdWorld;        // World transform matrix
uniform mat4 tdView;         // View matrix
uniform mat4 tdProject;      // Projection matrix
```

### GLSL Create POP: Procedural Point Generation

The GLSL Create POP generates points from scratch using a shader. It doesn't read input points — it creates them.

**Key parameters:**
- **Count:** Number of points to generate
- **Point Order:** How points are indexed (linear, 2D grid, 3D grid)
- **GLSL Top/Custom:** Shader code for point generation

**Example — spiral of points:**
```glsl
// For each point index i, compute position
float angle = float(i) * 0.1;
float radius = float(i) * 0.01;
P.x = cos(angle) * radius;
P.y = sin(angle) * radius;
P.z = float(i) * 0.005;

// Color by position
Cd.rgb = vec3(0.5 + 0.5 * sin(angle), 0.5 + 0.5 * cos(angle), 1.0);
```

### GLSL Copy POP: Parallel Point Duplication

The GLSL Copy POP duplicates input points with per-copy variation. It takes two inputs:
- **Input 0:** Geometry to copy (the template)
- **Input 1:** Points to copy onto (the targets)

**Use cases:**
- Distribute objects across a surface with random variation
- Create arrays with per-instance color/scale/rotation
- Build complex structures from simple templates

### GLSL Select POP: Conditional Filtering

The GLSL Select POP filters points based on a shader condition. Points that pass the condition are kept; others are removed.

**Example — select points within a spherical region:**
```glsl
vec3 center = vec3(0.0, 0.0, 0.0);
float radius = 5.0;
float dist = distance(P, center);
if (dist > radius) {
    // Remove this point
    removePoint();
}
```

### Custom Noise Functions for GLSL POPs

**Simplex noise (3D):**
```glsl
// Implementation requires ~80 lines of GLSL
// Key: gradient noise with skewing for simplex grid
float snoise(vec3 v) {
    // Standard simplex noise implementation
    // (included in TouchDesigner's GLSL snippets)
}
```

**Fractal Brownian Motion (fBm):**
```glsl
float fbm(vec3 p, int octaves) {
    float value = 0.0;
    float amplitude = 0.5;
    float frequency = 1.0;
    for (int i = 0; i < octaves; i++) {
        value += amplitude * snoise(p * frequency);
        frequency *= 2.0;
        amplitude *= 0.5;
    }
    return value;
}
```

**Voronoi noise:**
```glsl
// Cellular noise for organic cell-like patterns
// Returns distance to nearest cell center
float voronoi(vec3 p) {
    // Standard Voronoi implementation
}
```

### Debugging GLSL POPs

**Common errors and solutions:**
- **Compile failed:** Most common with GLSL POP. Usually means read-after-write conflict on `P[]`. `P[id]` is write-only once assigned — you cannot read `P[id].x` after writing to `P[id].x`.
- **"No output":** Missing `outputattrs="P"` parameter. Set on the glslPOP before cooking.
- **Generic errors:** Vector swizzle in function arguments (`sin(P[id].y)`) is not supported. Use `float(id)` for per-point variation.
- **Performance drop:** Reduce loop iterations, avoid `if` branching, use fewer textures

**Debug workflow:**
1. Test logic in GLSL TOP first (easier to visualize)
2. Use `discard` in fragment shader to identify problem areas
3. Output test values as color for visual debugging
4. Check TouchDesigner Textport for compilation errors
5. Use Info CHOP to verify point count at each stage

### Advanced GLSL POP Techniques

**Multiple passes with buffers:**
- Use GLSL TOP with Compute Shader to write to buffer textures
- Read buffers in GLSL POP for multi-pass algorithms
- Essential for: reaction-diffusion, fluid simulation, image processing

**Texture-based attribute storage:**
- Store per-point data as texture pixels
- Sample textures in GLSL POP for attribute lookup
- Enables: spatial queries, attribute blending, LUT-based effects

**Feedback loops with GLSL:**
- GLSL POP → Feedback POP → GLSL POP
- Creates: persistent trails, accumulating fields, temporal integration

---

## Part 2: GPU vs CPU Optimization

### The Three GPU Bottlenecks

#### 1. Compute Throughput (ALU-bound)
**Symptoms:** Performance degrades linearly with shader complexity; adding more points doesn't proportionally increase frame time.

**Common ALU-intensive operations in POPs:**
- Multiple nested noise functions (especially with high roughness/octaves)
- Trigonometric functions in per-point expressions
- Complex conditional logic in GLSL POPs
- `pow()` and `exp()` operations (computationally expensive)
- Matrix multiplications in custom deformation shaders

**Optimization strategies:**
- Precompute values in uniforms where possible
- Reduce loop iterations in noise functions
- Use simpler noise (Perlin vs Simplex vs value noise)
- Move constant calculations to CPU (Python) and pass as uniforms

#### 2. Memory Bandwidth (bandwidth-bound)
**Symptoms:** Performance degrades significantly when adding attributes; reducing attribute count or precision improves performance.

**Bandwidth-intensive patterns:**
- Storing many float4 attributes per point (position, color, normal, velocity, custom data)
- Long POP chains where each reads/writes complete point data
- Using 32-bit floats when 16-bit suffices
- Frequent texture sampling in GLSL POPs with large textures

**Optimization strategies:**
- Minimize attribute count — only generate what you need
- Use `float` for scalars instead of `vec4` where possible
- Share attributes via CHOP export instead of per-point storage
- Reduce texture resolution for attribute lookup

#### 3. Memory Capacity (capacity-bound)
**Symptoms:** Sudden severe performance drops at specific point counts; TouchDesigner becomes unresponsive or crashes.

**VRAM estimation for POP networks:**
```
Point data size = point_count × attribute_size
Attribute_size = sum of each attribute's bytes
- vec4 (P, Cd, etc.) = 16 bytes
- vec3 (N, v) = 12 bytes  
- float (pscale, age) = 4 bytes
- Typical particle: ~70 bytes (P+N+Cd+v+age+life+pscale)
- 1M particles: ~70MB VRAM
- 10M particles: ~700MB VRAM
```

**Optimization strategies:**
- Use ReRange POP to compress value ranges
- Delete unnecessary attributes with Attribute POP
- Use fixed point counts (don't let particles accumulate indefinitely)
- Implement kill zones with Delete POP for out-of-bounds particles

### CPU-GPU Boundary Cost

Every data crossing between CPU and GPU incurs PCIe bus transfer cost:
- **SOP → POP:** CPU RAM → GPU VRAM transfer
- **POP → CHOP:** GPU VRAM → CPU RAM transfer
- **Golden rule:** Minimize crossings. Batch conversions. Avoid ping-pong POP→SOP→POP→SOP.

**Approximate costs (RTX 4090, PCIe 4.0):**
- 1M points CPU→GPU: ~0.5ms
- 1M points GPU→CPU: ~1–2ms
- Texture (1920×1080) GPU→CPU: ~2ms

### POP Network Optimization Checklist

| Optimization | Implementation | Impact |
|-------------|----------------|--------|
| Reduce point count | Select POP or fewer generator divisions | Linear performance gain |
| Remove unused attributes | Attribute POP: Delete unnecessary channels | Bandwidth improvement |
| Merge POP chains | Combine parallel chains into one | Reduces memory pressure |
| Use Null POPs as staging | Prevent unnecessary recooking | Stabilizes frame rate |
| Limit particle lifespan | Particle POP: shorter lifespan | Prevents population explosion |
| Use 16-bit where possible | Attribute POP: half-float precision | Cuts bandwidth in half |
| Precompute in Python | Python DATs for setup, not per-frame | Reduces per-frame work |
| Batch CPU-to-GPU transfers | Convert all at once, not incrementally | Reduces PCIe overhead |

---

## Part 3: Math and Noise Functions

### Math POP Parameter Reference

| Parameter | Options | Description |
|-----------|---------|-------------|
| **Attribute** | P, N, Cd, uv, custom | Which attribute to modify |
| **Component** | All, X/Y/Z, R/G/B/A | Which component(s) of the attribute |
| **Operation** | Add, Subtract, Multiply, Divide, Power, Sin, Cos, Tan, Log, Exp, Abs, Floor, Ceil, Modulo, Min, Max | The mathematical operation |
| **Operand** | float, expression, attribute | The value or expression to operate with |
| **Output Attribute** | (optional) | Where to store result (defaults to input attribute) |

### Math POP Operation Categories

**Arithmetic:** Add, Subtract, Multiply, Divide, Modulo, Power, Absolute, Negate, Reciprocal, Sign

**Trigonometric:** Sin, Cos, Tan, ArcSin, ArcCos, ArcTan, ArcTan2

**Exponential/Log:** Power, Exponential (e^x), Log, Log2, Log10, Square Root

**Vector:** Normalize, Length, Cross Product, Dot Product, Reflect, Refract

**Comparison:** Min, Max, Clamp, Compare, If

### Noise POP Parameter Reference

| Parameter | Options | Description |
|-----------|---------|-------------|
| **Noise Type** | Perlin, Simplex, Alligator, Sparse Convolution, Cellular, Value, Worley | The noise algorithm |
| **Amplitude** | float | Strength of noise displacement |
| **Frequency** | vec3 (X, Y, Z) | Spacing/frequency of noise features |
| **Offset** | vec3 (X, Y, Z) | Phase offset (useful for animation) |
| **Roughness** | float | Fractal detail level (0=none, 1=max) |
| **Attenuation** | float | How higher frequencies are dampened |
| **Attribute** | P, N, Cd, custom | Which attribute receives noise |
| **Time-Dependent** | bool | Animate noise over time |

### Noise Types and Their Visual Character

| Type | Character | Best For |
|------|-----------|----------|
| **Perlin** | Smooth, curvy, continuous | Terrain, organic surfaces |
| **Simplex** | Smoother than Perlin, less grid artifact | Fluid motion, natural animation |
| **Alligator** | Sharp ridges, scale-like | Reptilian textures, crystalline |
| **Cellular** | Cell boundaries visible | Voronoi, cracked earth, cells |
| **Worley** | Distance to nearest feature point | Organic spots, stars, moss |
| **Value** | Blobby, less directional | Cloud shapes, soft organic forms |
| **Sparse Convolution** | Sharp detail at high frequencies | Cracks, lightning, veins |

### Random POP Parameter Reference

| Parameter | Description |
|-----------|-------------|
| **Randomize** | Which attribute(s) to randomize (P, Cd, N, custom) |
| **Distribution** | Uniform, Gaussian/Perlin, Poisson disc |
| **Min/Max** | Range for randomization |
| **Seed** | Random seed value |
| **Per-Component** | Randomize each component independently |
| **Jitter** | Strength of randomization (0=none, 1=full range) |

### Common Math/Noise Patterns for POP Work

**Sine wave displacement:**
```
Attribute: P | Component: Y | Operation: Add | Operand: sin(P.x * 2.0) * 0.5
```

**Radial gradient (distance from center):**
```
Attribute: Cd | Component: All | Operation: Set | Operand: length(P)
```

**Circular motion:**
```
Attribute: P | Component: X | Operation: Add | Operand: sin(time + P.z) * amplitude
Attribute: P | Component: Z | Operation: Add | Operand: cos(time + P.z) * amplitude
```

**Fractal noise terrain:**
- Noise POP 1: Simplex, Amplitude=2.0, Frequency=0.2, Roughness=0.5
- Noise POP 2: Simplex, Amplitude=0.5, Frequency=0.8, Roughness=0.3

**Color by height:**
```
Attribute: Cd | Component: All | Operation: Set | Operand: ramp(P.y, -1, 1, 0, 1)
```

**Pulsing scale with audio:**
```
Attribute: pscale | Operation: Multiply | Operand: chop("analyze1")['rms']
```

### Math Combine POP

The Math Combine POP is the most powerful math operator — it combines multiple input attributes using complex expressions:

**Key difference from Math POP:** Math Combine can read any attribute from any input, enabling multi-input operations.

**Example — blend two noise sources:**
```
Input 0: P from noise1  |  Input 1: P from noise2
Operation: Mix
Mix factor: 0.5  (or driven by CHOP)
Output: Blended position
```

### Normalize, ReRange, Quantize, Histogram POPs

**Normalize POP:** Scales attribute values to a 0–1 range (or -1 to 1)
- **Mode:** Min-Max, Standard Deviation, Robust
- **Per Component** or **Global**

**ReRange POP:** Remaps values from one range to another
- **Source Range:** Incoming min/max
- **Target Range:** Desired min/max
- **Method:** Linear, Logarithmic, Exponential, Bezier

**Quantize POP:** Reduces attribute to discrete steps
- **Steps:** Number of discrete levels
- **Creates:** Posterization, banding effects, stylized looks

**Analyze POP:** Computes statistics on attributes
- **Functions:** Min, Max, Average, Median, Standard Deviation, Histogram
- **Output:** CHOP channels or modified attributes

---

## References

### Source files (TD_Edu_Master/content/)
- `lecciones/_library/02_Programacion_Tecnica/pop_glsl_programming.md` — GLSL POP programming guide (37KB)
- `lecciones/_library/02_Programacion_Tecnica/pop_gpu_vs_cpu.md` — GPU vs CPU optimization (37KB)
- `lecciones/_library/02_Programacion_Tecnica/pop_math_noise.md` — Math and noise functions (29KB)
- `lecciones/03_avanzado/01_Programacion_GLSL_Avanzada.md` — Advanced GLSL programming (37KB)
- `lecciones/_library/01_Fundamentos/05_POP_GLSL_Programacion.md` — GLSL programming fundamentals

### Related skills
- `td-pops-research` — Advanced research topics using GLSL (fractals, flocking, fluids)
- `td-pops-advanced` — POP network architecture and optimization
- `td-pops-utility` — Rendering, DMX, interactivity workflows
