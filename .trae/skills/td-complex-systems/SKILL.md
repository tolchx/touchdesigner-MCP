# td-complex-systems

Generates complex TouchDesigner node systems from natural language.

## Capabilities
- Particle systems (basic to advanced)
- Audio-reactive installations
- Interactive camera systems
- Flocking/boids simulation
- Fluid dynamics (curl noise)
- Feedback loop simulations
- Fractal L-systems
- Data visualization
- Multi-layer compositions
- Projection mapping setups

## System Templates

### Particle Basic
Sphere POP → Noise POP → Particle POP → Render POP

### Particle Advanced
Sphere POP → Random POP → Noise POP → Particle POP → Trail POP → Render POP

### Audio-Reactive
Audio CHOP → Math CHOP → CHOP to POP → Noise POP → Particle POP → Render POP

### Interactive Camera
Movie File In TOP → TOP to POP → Attribute POP → Noise POP → Particle POP → Render POP

### Flocking
Sphere POP → Random POP → Noise POP (curl) → Particle POP (zero gravity) → Render POP

### Fluid
Grid POP → Noise POP (curl) → Particle POP → Trail POP → Render POP

### Feedback Loop
Feedback POP → Noise POP → Particle POP → Feedback POP (blend=0.95)

### Fractal
Table DAT → Script DAT → SOP to POP → Copy POP → Noise POP → Render POP

## Connection Rules
- POP→POP: Direct
- TOP→POP: TOP to POP bridge
- SOP→POP: SOP to POP bridge
- CHOP→POP: CHOP to POP bridge
- POP≠SOP: Never direct
- Render POP needs Camera in Geometry COMP

## Layout
- Left-to-right flow
- 200px spacing
- Color: Blue=source, Green=process, Orange=output, Purple=control
- Null TOP as final output
- Annotate for sections

## When to Use
- User asks to create a visual system
- User describes a particle/effect/animation
- User wants an interactive installation
- User needs audio-reactive visuals
- User describes flocking, fluid, or fractal behavior
