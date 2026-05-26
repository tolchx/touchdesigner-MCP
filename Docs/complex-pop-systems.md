# Complex POP Systems — Verified Patterns

## Systems Built and Tested (all 0 errors)

### 1. Particle System with Forces
`spherePOP → noisePOP → limitPOP → nullPOP`
- Noise acts as a force field on points
- LimitPOP constrains point positions
- 4 operators, 3 connections

### 2. Feedback Loop  
`spherePOP → feedbackPOP → cachePOP → blendPOP → nullPOP`
- FeedbackPOP creates persistent trails
- CachePOP stores frames for playback/replay
- BlendPOP blends between cached states
- 5 operators, 4 connections

### 3. Grid Deformation Chain
`gridPOP → noisePOP → copyPOP → deletePOP → blendPOP → nullPOP`
- GridPOP generates structured point grid
- NoisePOP displaces points organically
- CopyPOP duplicates with variation
- DeletePOP filters points
- BlendPOP blends multiple inputs
- 6 operators, 5 connections

### 4. Attributes + Math
`spherePOP → attributePOP → mathPOP → limitPOP → nullPOP`
- AttributePOP creates/manipulates custom point attributes
- MathPOP applies per-point math operations
- LimitPOP constrains attribute ranges
- 5 operators, 4 connections

### 5. Multi-Chain with GLSL
`spherePOP → noisePOP → glslPOP → limitPOP → nullPOP`
- NoisePOP provides initial force displacement
- glslPOP applies custom compute shader with inline noise function
- LimitPOP constrains final point positions
- 5 operators, 4 connections

## Key Discoveries from ToE_Expand Analysis

### New POP Operators Discovered (not in our KB)
From POPsGuide.0.0 (797 POP nodes) and JPOPsDev (836 POP nodes):
- `POP:pointgen` — Point generator
- `POP:sprinkle` — Sprinkle points on surface  
- `POP:subdivide` — Subdivide geometry
- `POP:texturemap` — Map texture to points
- `POP:trig` — Trigonometric operations
- `POP:twist` — Twist deformation
- `POP:merge` — Merge point streams
- `POP:pattern` — Pattern generation
- `POP:mathmix` — Math mix/blend
- `POP:mathcombine` — Math combine
- `POP:rerange` — Re-range values
- `POP:attcombine` — Attribute combine
- `POP:popto` — POP to CHOP/DAT conversion
- `POP:lookupchan` — CHOP lookup from points
- `POP:select` — Point selection/filtering
- `POP:switch` — Switch between inputs
- `POP:line` — Line generation
- `POP:trail` — Particle trails
- `POP:group` — Point grouping
- `POP:facet` — Facet/bevel
- `POP:normal` — Normal calculation
- `POP:transform` — Transform points
- `POP:point` — Point accessor

### Architecture Patterns from Real Projects

POPsGuide uses a consistent architecture:
1. **Render pipeline**: PostFX → ACES → Render → Viewport
2. **World container**: All POP networks under /World/
3. **UI layer**: Explanation panels, Operator buttons, Parameters
4. **Core**: Render setup, Post-processing
5. **Each POP example**: Isolated in its own sub-COMP with:
   - Annotate nodes for documentation
   - info DAT for explanations
   - geo COMPs for rendering with PBR materials
   - CHOP controllers (LFO, math, count) for animation

## Best Practices for Complex POP Networks

1. **Encapsulate** each system in a `baseCOMP`
2. **Standard inputs/outputs**: `inPOP` at entry, `nullPOP` at exit
3. **Color code** by function: blue=generators, green=processing, orange=outputs
4. **Horizontal layout**: 250px spacing, left-to-right flow
5. **Validate after every connection**: healthcheck with recurse=true
6. **Use attributePOP early** in chains for custom data
7. **GLSL POP at end** of chains for final processing (after native ops)
8. **limitPOP as safety** at chain end to constrain point positions
