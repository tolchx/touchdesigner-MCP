# Node Connection Reference

## Family Connection Rules

### POP → POP
- **Valid:** Direct connection
- **Example:** Noise POP → Particle POP

### TOP → POP
- **Required Bridge:** TOP to POP
- **Example:** Movie File In TOP → TOP to POP → Noise POP

### SOP → POP
- **Required Bridge:** SOP to POP
- **Example:** Sphere SOP → SOP to POP → Noise POP

### CHOP → POP
- **Required Bridge:** CHOP to POP
- **Example:** Audio CHOP → CHOP to POP → Noise POP

### POP → TOP
- **Required Bridge:** POP to TOP
- **Example:** Particle POP → POP to TOP → Render TOP

### POP → SOP
- **Required Bridge:** POP to SOP
- **Example:** Particle POP → POP to SOP → Geometry COMP

### COMP → POP
- **Required:** Use inPOP/outPOP inside COMP
- **Example:** Geometry COMP with inPOP → [internal] → outPOP

### POP ≠ SOP
- **NEVER** connect POP directly to SOP
- Always use bridge operators

### Render POP
- **Requires:** Camera in same Geometry COMP
- **Example:** Geometry COMP (Camera + Render POP) → Render TOP

## Common Chains

### Basic Particle System
```
Sphere POP → Noise POP → Particle POP → Render POP
```

### Advanced Particle System
```
Sphere POP → Random POP → Noise POP → Particle POP → Trail POP → Render POP
```

### Audio-Reactive
```
Audio CHOP → Math CHOP → CHOP to POP → Noise POP → Particle POP → Render POP
```

### Interactive Camera
```
Movie File In TOP → TOP to POP → Attribute POP → Noise POP → Particle POP → Render POP
```

### Feedback Loop
```
Feedback POP → Noise POP → Particle POP → Feedback POP (blend=0.95)
                                 ↓
                            Render POP
```

### Multi-Layer
```
[Layer 1: Sphere POP → Noise → Particle]
[Layer 2: Grid POP → Random → Particle]
         ↓ Merge POP → Render POP
```

### Data Visualization
```
Table DAT → CHOP → CHOP to POP → Attribute POP → Render POP
```

## Bridge Operator Parameters

### TOP to POP
- resolution: matching source
- use: RGB/height/luminance

### SOP to POP
- keep: P/N/Cd/uv/pscale

### CHOP to POP
- channel: source channel name
- attribute: target POP attribute

## Geometry COMP Pattern
```
Geometry COMP [
  Camera (optional)
  inPOP → [internal processing] → outPOP
  Material (Point MAT / Phong MAT)
]
→ Render TOP
```

## Layout Rules
1. Left-to-right flow
2. 200px spacing between operators
3. Color coding:
   - Blue: Sources (Movie, Noise, Grid)
   - Green: Processing (Math, Attribute)
   - Orange: Output (Render, Null)
   - Purple: Control (CHOP, DAT)
4. Null TOP as final output
5. Annotate for sections
