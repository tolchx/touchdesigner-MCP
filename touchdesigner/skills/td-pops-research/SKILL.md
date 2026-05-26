---
name: "td-pops-research"
description: "Advanced research topics for POPs in TouchDesigner — flocking, fluids, fractals, machine learning, big data, neural networks, biomimetics, quantum, time/memory"
version: "1.0.0"
author: "TD Edu Master"
tags: ["touchdesigner", "pops", "research", "flocking", "fluids", "fractals", "ml", "big-data", "neural-nets", "biomimetics", "quantum", "time-memory", "gpu-compute", "generative"]
---

# td-pops-research

## Overview

This skill covers 9 advanced research topics for POP (Point Operator) systems in TouchDesigner. Each topic explores how GPU-accelerated point processing enables novel creative and computational techniques. The content bridges theoretical concepts with practical POP network implementations, providing a framework for artists, researchers, and technical directors working at the frontier of real-time generative art.

**Core principle:** POPs transform abstract mathematical and scientific concepts into tangible visual experiences by leveraging GPU parallelism on millions of points. Each research topic demonstrates how point-level computation maps to complex emergent behavior.

---

## 1. Flocking Systems (Boids)

### Concept

Flocking simulates the coordinated movement of groups (birds, fish, crowds) using three simple local rules per agent — separation, alignment, and cohesion. In POPs, each point is a boid agent, and its velocity `v` is updated per frame based on neighbor calculations.

### POP Implementation

**Network architecture:**
```
[Point Generator] → [Particle POP] → [Attribute POP: Flocking Forces] → [Trail POP] → [Render]
```

**Key parameters for Particle POP:**
- **Emission Rate:** 50–500 particles/sec
- **Lifespan:** 10–30 seconds
- **Velocity:** (0, 0, 0) — initial stillness, flocking drives movement
- **Max Particles:** 1000–10000

**Flocking forces via Attribute POP (expressions modifying `v`):**
- **Separation:** Steer away from neighbors within a small radius
  ```
  separation = (P - neighbor_P) * (1 - distance / separation_radius)
  ```
- **Alignment:** Match average velocity of neighbors
  ```
  alignment = (avg_neighbor_v - v) * alignment_strength
  ```
- **Cohesion:** Steer toward the center of mass of neighbors
  ```
  cohesion = (center_of_mass - P) * cohesion_strength
  ```

**Neighbor detection considerations:**
- True spatial neighbor queries require GLSL POP for GPU-parallel neighbor search
- Simplified approach: use Field POP spheres as attractor/repulsor zones
- Grid-based spatial hashing in GLSL for large flocks (5000+ boids)

### Visual variations
- **Predator-prey:** Two flocks with different rules, one chasing the other
- **Path following:** Add attraction force along a curve or spline
- **Obstacle avoidance:** Field POP repulsors that boids steer around
- **Leader-based:** One boid with different parameters leads the swarm

### Performance notes
- Boid count ≤ 2000: Attribute POP expressions are sufficient
- Boid count 2000–10000: Use GLSL POP for neighbor searches
- Boid count > 10000: Implement spatial hashing in compute shaders

### Source: `05_Investigacion_01.md`, `pop_research_01.md`

---

## 2. Fluid Simulation

### Concept

Fluid simulation in POPs approximates Navier-Stokes equations using particle-based methods. The most practical approach is Smoothed Particle Hydrodynamics (SPH), where each point carries density, pressure, and velocity properties that influence neighbors.

### POP Implementation

**Network architecture:**
```
[Sphere POP (emitter)] → [Particle POP] → [Attribute POP: SPH Forces] → [SOP to Geometry] → [Render]
```

**SPH attributes per point:**
- `v` (vec3): Current velocity
- `density` (float): Calculated from neighbor distances
- `pressure` (float): Derived from density
- `mass` (float): Particle mass (typically 1.0)

**SPH force calculation (Attribute POP on `v`):**
```
// Density calculation
density = sum of (kernel_function(distance)) for all neighbors within smoothing radius

// Pressure force
pressure = stiffness * (density - rest_density)
pressure_force = -gradient(pressure) / density

// Viscosity force
viscosity_force = viscosity * laplacian(v) / density

// External forces
gravity = (0, -9.8, 0)
boundary_force = repulsion from box boundaries

// Total force applied to velocity
v += (pressure_force + viscosity_force + gravity + boundary_force) * dt
```

**Key parameters:**
- **Smoothing Radius:** 0.5–2.0 units (controls neighbor range)
- **Rest Density:** 1.0 (target density for incompressibility)
- **Stiffness:** 50–500 (higher = more incompressible)
- **Viscosity:** 0.01–0.1 (higher = thicker fluid)
- **Particle Count:** 1000–50000 (for interactive performance)

### Simplified alternative
For interactive installations, use Noise POP with turbulence to approximate fluid motion:
```
[Grid POP] → [Noise POP: Time-Animated Simplex] → [Math POP: Displace P] → [Render as Sprites]
```

### Source: `06_Investigacion_02.md`

---

## 3. Fractals

### Concept

Fractals are self-similar patterns that repeat at different scales. POPs implement fractals by iterating mathematical functions per point, creating geometries like Mandelbrot sets, Julia sets, Sierpinski triangles, and L-systems.

### POP Implementation

**Network architecture:**
```
[Grid POP (2D sampling domain)] → [GLSL POP: Fractal Iterator] → [Attribute POP: Color by Iteration] → [Render]
```

**Mandelbrot set (GLSL POP vertex shader):**
```glsl
// For each point at position P (mapped to complex plane)
vec2 z = vec2(0.0, 0.0);
vec2 c = P.xy;
int max_iter = 100;
int iter = 0;

for (int i = 0; i < max_iter; i++) {
    if (length(z) > 2.0) break;
    z = vec2(z.x*z.x - z.y*z.y + c.x, 2.0*z.x*z.y + c.y);
    iter++;
}

// Use iteration count for color and height
float normalized_iter = float(iter) / float(max_iter);
P.z = normalized_iter * amplitude;
Cd.rgb = vec3(normalized_iter, normalized_iter * 0.5, 1.0 - normalized_iter);
```

**Fractal types implementable in POPs:**
- **Mandelbrot/Julia:** Complex plane iteration (Grid POP + GLSL POP)
- **Sierpinski Triangle:** Point chaos game (Random POP + iterative transforms)
- **Fractal Noise:** Layered noise with increasing frequency (Fractal Noise mode in Noise POP)
- **L-Systems:** String rewriting → geometry generation (DAT + POP pipeline)
- **IFS (Iterated Function Systems):** Random affine transforms (Copy POPs with random scaling)

### Performance considerations
- Grid POP resolution: 256×256–1024×1024 points
- Max iterations: 50–200 (higher = more detail, slower)
- Use GLSL POP for iteration-heavy fractals; avoid Attribute POP expressions for loops

### Source: `07_Investigacion_03.md`

---

## 4. Machine Learning Integration

### Concept

Machine learning models can drive POP behavior in real-time. Three primary integration strategies: (1) using pre-trained models via ONNX/TensorFlow, (2) t-SNE/PCA dimensionality reduction for visualization, (3) reinforcement learning agents controlling POP parameters.

### POP Implementation

**Strategy 1: Model inference via Python + CHOP → POP**
```
[Camera TOP] → [ONNX SOP/Python SOP: Run Model] → [CHOP to POP] → [POP Modifiers]
```

- Capture camera input → run pose estimation (OpenPose, MediaPipe) → output joint positions as CHOP channels → CHOP to POP converts to point cloud
- Use Analyze CHOP on model outputs to extract features → drive POP parameters via export

**Strategy 2: Dimensionality reduction visualization**
```
[DAT (data table)] → [Python SOP: t-SNE/PCA] → [SOP to POP] → [Attribute POP: Color by Class] → [Render]
```

- High-dimensional data (e.g., 50 features) → reduced to 2D or 3D → each data point becomes a POP point
- Color by cluster/class using Attribute POP

**Strategy 3: Neural network parameter control**
```
[Audio Device In CHOP] → [Python Script: Inference] → [CHOP Export] → [Noise POP Amplitude] → [Transform POP]
```

- Real-time audio features → small neural network → control POP parameters (amplitude, frequency, rotation)
- Network runs in Python SOP or external process → outputs fed as CHOP channels

### Key parameters and workflow
- **Model format:** ONNX (recommended for cross-platform), TensorFlow SavedModel, or PyTorch JIT
- **Inference frequency:** 10–60 Hz (every frame or every N frames)
- **Latency budget:** < 50ms for interactive response
- **Feature extraction:** Use TOPs for image features, CHOPs for audio/sensor features

### Source: `08_Investigacion_04.md`

---

## 5. Big Data Visualization

### Concept

POPs render massive datasets (millions of points) by keeping data on GPU. Techniques include progressive loading, LOD (level-of-detail), spatial binning, and attribute-driven filtering.

### POP Implementation

**Network architecture:**
```
[DAT (CSV/JSON)] → [CHOP Execute/DAT to CHOP] → [CHOP to POP] → [Attribute POP: Normalize] → [Render as Sprites]
```

**Data pipeline:**
1. **Load:** DAT reads CSV/JSON/Parquet data files
2. **Convert:** DAT to CHOP maps columns to channels
3. **Transform:** CHOP to POP creates points from channel data (X, Y, Z from columns)
4. **Normalize:** ReRange POP or Math POP scales data to usable ranges
5. **Filter:** Select POP or Delete POP removes outliers or null values
6. **Color:** Attribute POP maps data dimensions to color, size, opacity

**Memory-efficient techniques:**
- **Streaming:** Load data in chunks via DAT Execute, feed incrementally
- **GPU buffer reuse:** Use Null POPs as data staging points; avoid SOP conversion
- **Precision control:** Use 16-bit floats when 32-bit precision isn't needed
- **Spatial indexing:** For interactive navigation, use Field POP for LOD selection

**Practical example — scatter plot matrix:**
```
[DAT: 1M rows, 10 columns] → [DAT to CHOP] → [CHOP to POP: 1M points] 
→ [Select POP: choose 3 columns as X/Y/Z] → [Attribute POP: Color by 4th column]
→ [Render: Point Sprite MAT, pscale = 1.0]
```

- 1M points rendered as sprites: ~2–5ms on modern GPU
- Add CHOP-based rotation for interactive orbital navigation

### Source: `09_Investigacion_05.md`

---

## 6. Neural Networks (Visual)

### Concept

Visual neural networks — not for inference, but as a visual representation of network architectures. Each point represents a neuron; edges connect layers. Can also implement neural-style transfer or generative models that output point positions.

### POP Implementation

**Network architecture visualization:**
```
[Line POP (layer connections)] → [Sphere POP (neurons)] → [Attribute POP (activation colors)] → [Render]
```

**Multi-layer perceptron visualization (Python + POP):**
```python
# In Python SOP or DAT Execute
layers = [784, 128, 64, 10]  # Neuron counts per layer
neuron_positions = []
for layer_idx, neuron_count in enumerate(layers):
    for neuron_idx in range(neuron_count):
        x = layer_idx * spacing
        y = (neuron_idx / neuron_count - 0.5) * layer_height
        neuron_positions.append((x, y, 0))
# Output to SOP → SOP to POP → render as spheres
```

**Live activation visualization:**
- Run actual inference in Python
- Output activation values as CHOP channels
- Attribute POP maps activations to color and size
- Connections (lines between layers) rendered via Line POP or Trail POP

**Generative neural POP:**
- Use latent vector from VAE/GAN as input to GLSL POP
- GLSL interprets latent as parameters for procedural generation
- Result: neural-network-controlled point cloud generation

### Source: `10_Investigacion_06.md`

---

## 7. Biomimetics

### Concept

Biomimetics applies biological principles to computational design: morphogenesis, reaction-diffusion, phyllotaxis, slime mold behavior, and evolutionary strategies. POPs excel here because biological systems naturally operate through parallel local interactions.

### POP Implementation

**Reaction-Diffusion (Gray-Scott model):**
```
[Grid POP: 512×512 points] → [GLSL POP: Reaction-Diffusion Solver] → [Attribute POP: Color by Concentration] → [Render]
```

```glsl
// Per-point reaction-diffusion update (GLSL POP)
float u = texture(u_texture, uv).r;  // Previous state from buffer
float v = texture(v_texture, uv).r;
float uvv = u * v * v;

float du = Du * laplacian_u - uvv + feed * (1.0 - u);
float dv = Dv * laplacian_v + uvv - (kill + feed) * v;

u += du * dt;
v += dv * dt;

// Output new state
FragColor = vec4(u, v, 0.0, 1.0);
```

**Phyllotaxis (plant growth patterns):**
```
[Point Generator] → [Attribute POP: Golden Ratio Spacing]
```
- Formula: angle = n * 137.5°, radius = c * sqrt(n)
- Each point represents a seed/floret
- Animate `c` over time to simulate growth

**Slime mold pathfinding:**
- Grid of points with agent trails
- Agents deposit "pheromone" trails as they move
- Trail POP with feedback loop creates emergent path networks
- Used for: organic network routing, city growth simulation

**Evolutionary strategies:**
- Multiple POP networks evaluated simultaneously
- Copy POP variations with different parameters
- Python DAT selects best performers based on fitness function
- Parameters evolve over generations

### Source: `11_Investigacion_07.md`

---

## 8. Quantum-Inspired Visuals

### Concept

Quantum mechanics provides rich metaphors and mathematics for generative art: superposition, wave functions, probability clouds, entanglement, and quantum tunneling. POPs render quantum wave functions as amplitude clouds.

### POP Implementation

**Wave function visualization:**
```
[Grid POP: 100×100×100] → [GLSL POP: Wave Function Evaluation] → [Attribute POP: Probability Density] → [Render]
```

```glsl
// Hydrogen atom electron probability (simplified)
// P is the point position relative to nucleus
float r = length(P);
float theta = atan(P.y, P.x);
float phi = acos(P.z / r);

// Radial wave function (1s orbital, simplified)
float radial = exp(-r / a0);

// Angular component (spherical harmonic Y00 is constant)
float angular = 1.0 / sqrt(4.0 * PI);

// Probability density
float probability = radial * radial * angular * angular;

// Color by probability
Cd.rgb = vec3(probability * 10.0, probability * 5.0, probability * 2.0);
pointscale = probability * max_scale;
```

**Quantum visualization techniques:**
- **Probability clouds:** Points distributed by probability density function
- **Superposition:** Blend between multiple wave functions
- **Quantum tunneling:** Particles appearing beyond barriers (probability > 0 in classically forbidden regions)
- **Entanglement simulation:** Two point clouds with correlated random behavior
- **Quantum walks:** Random walks on grid structures with interference patterns

**Key parameters:**
- **n,l,m quantum numbers:** Control orbital shape (1s, 2p, 3d, etc.)
- **Superposition coefficient:** Blend ratio between states
- **Collapse animation:** Triggered "measurement" that collapses superposition to eigenstate

### Source: `12_Investigacion_08.md`

---

## 9. Time and Memory

### Concept

Time and memory in POP systems operate differently than traditional media. Techniques include: time-based particle accumulation, memory as attribute buffers, feedback loops for temporal dynamics, and phase-space visualization.

### POP Implementation

**Temporal accumulation (Trail POP):**
```
[Particle POP] → [Trail POP: Length = 60 frames] → [Attribute POP: Fade by Trail Age] → [Render]
```

- Particles leave trails that represent their history
- Trail POP captures position at each frame, creates line strips
- Control fade length for persistence effects
- Combine with Feedback POP for infinite persistence with decay

**Attribute memory buffers:**
```
[Point Generator] → [Attribute POP: Create 'history_0' to 'history_9'] → [Particle POP] → [Attribute POP: Shift History]
```

- Store previous N states as point attributes (e.g., `pos_t0`, `pos_t1`, ..., `pos_t9`)
- Each frame, shift values: `pos_t9 = pos_t8, pos_t8 = pos_t7, ... pos_t0 = P`
- Enables: motion blur, velocity estimation, trajectory prediction, temporal smoothing

**Feedback POP for temporal dynamics:**
```
[POP Chain A] → [Feedback POP] → [POP Chain B] → [Output]
                    ↑                       |
                    └───────────────────────┘
```
- Feedback POP feeds previous frame's output back as input
- Creates: persistent trails, reaction fields, echo effects
- Use with Math POP for decay factor (multiply by 0.95–0.99 for slow fade)

**Phase-space visualization:**
- Map position AND velocity to visual space
- X axis = position, Y axis = velocity (or momentum)
- Reveals hidden patterns: attractors, limit cycles, chaotic orbits
- Implement with: CHOP to POP mapping position→X, velocity→Y

### Key temporal parameters
- **Sleep/Time Scale:** CHOP control over simulation speed
- **Loop duration:** Wrap point age modulo a loop length
- **Framerate independence:** Use `me.time.delta` for consistent physics

### Source: `13_Investigacion_09.md`

---

## References

### Source files (TD_Edu_Master/content/)
- `lecciones/03_avanzado/05_Investigacion_01.md` — Flocking
- `lecciones/03_avanzado/06_Investigacion_02.md` — Fluids
- `lecciones/03_avanzado/07_Investigacion_03.md` — Fractals
- `lecciones/03_avanzado/08_Investigacion_04.md` — Machine Learning
- `lecciones/03_avanzado/09_Investigacion_05.md` — Big Data
- `lecciones/03_avanzado/10_Investigacion_06.md` — Neural Networks
- `lecciones/03_avanzado/11_Investigacion_07.md` — Biomimetics
- `lecciones/03_avanzado/12_Investigacion_08.md` — Quantum
- `lecciones/03_avanzado/13_Investigacion_09.md` — Time and Memory
- `lecciones/_library/07_Investigaciones/pop_research_01.md` through `pop_research_09.md`
- `data-estudio/POPs_Master_Analysis.md` — POP architecture analysis
- `data-estudio/POPs_Detailed_Analysis.md` — Component-level POP analysis

### Related skills
- `td-pops-glsl` — GLSL programming for POPs (custom shader implementation)
- `td-pops-advanced` — Advanced POP architecture and optimization
- `td-pop-expert` — Complete POP knowledge base (33 modules)
