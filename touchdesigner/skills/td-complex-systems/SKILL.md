# td-complex-systems

Skill for generating complex TouchDesigner node systems from natural language prompts.

## System Templates

### Particle System (Basic)
```
Sphere POP → Noise POP → Particle POP → Render POP
```
- Sphere POP: emitter source
- Noise POP: organic motion
- Particle POP: physics solver
- Render POP: visualization

### Particle System (Advanced)
```
Sphere POP → Random POP → Noise POP → Particle POP → Trail POP → Render POP
```
- Random POP: variance in initial conditions
- Trail POP: motion trails

### Audio-Reactive
```
Audio CHOP → Math CHOP → CHOP to POP → Noise POP → Particle POP → Render POP
```
- Audio CHOP: sound input
- Math CHOP: normalize signal (0-1)
- CHOP to POP: bridge to POP domain
- Noise POP amplitude driven by audio

### Interactive Camera
```
Movie File In TOP → TOP to POP → Attribute POP → Noise POP → Particle POP → Render POP
```
- Camera captures video
- TOP to POP: pixel → point conversion
- Attribute POP: extract color/brightness

### Flocking/Boids
```
Sphere POP → Random POP → Noise POP (curl) → Particle POP → Render POP
```
- GLSL POP for boids forces (cohesion, alignment, separation)
- Particle POP with zero gravity, low drag

### Fluid (Curl Noise)
```
Grid POP → Noise POP (curl) → Particle POP → Trail POP → Render POP
```
- Grid POP: dense point field
- Curl noise: divergence-free flow
- Trail POP: visualize flow lines

### Feedback Loop
```
Feedback POP → Noise POP → Particle POP → Feedback POP
```
- Blend < 1.0 for decay
- Creates persistent simulations

### Fractal Geometry
```
Table DAT → Script DAT → SOP to POP → Copy POP → Noise POP → Render POP
```
- L-system rules in Table DAT
- Script generates geometry
- Copy POP instances at points

### Data Visualization
```
Table DAT → CHOP (select) → CHOP to POP → Attribute POP → Render POP
```
- Data from CSV/JSON/API
- CHOP extracts signals
- POP maps to visual attributes

### Multi-Layer
```
[Layer 1: Sphere POP → Noise → Particle]
[Layer 2: Grid POP → Random → Particle]
[Layer 3: Box POP → Noise → Particle]
         ↓ Merge POP → Render POP
```

## Connection Rules

1. POP → POP: Direct
2. TOP → POP: Use TOP to POP bridge
3. SOP → POP: Use SOP to POP bridge
4. CHOP → POP: Use CHOP to POP bridge
5. POP → TOP: Use POP to TOP bridge
6. COMP → POP: Use inPOP/outPOP inside COMP
7. POP ≠ SOP: Never connect directly
8. Render POP needs Camera in Geometry COMP

## Layout Rules

- Left-to-right flow
- Color: Blue=source, Green=process, Orange=output, Purple=control
- 200px spacing between operators
- Use Null TOP as final output
- Use Annotate for sections

## Parameter Defaults

| Operator | Key Defaults |
|----------|-------------|
| Sphere POP | type=point, radius=1 |
| Grid POP | rows=10, cols=10, size=10 |
| Noise POP | amplitude=1, frequency=1, speed=1 |
| Particle POP | rate=100, life=3, drag=0.1 |
| Random POP | seed=random, min=0, max=1 |
| Trail POP | length=10 |
| Copy POP | target=geometry |
| Render POP | requires camera |
| Point MAT | pointsize=10 |
