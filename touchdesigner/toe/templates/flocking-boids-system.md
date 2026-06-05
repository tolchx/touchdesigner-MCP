# Flocking/Boids System

## Pattern: Collective Behavior Simulation

## Operators
- Sphere POP (emitter, 500 particles)
- Random POP (variance in velocity)
- Noise POP (curl type, organic turbulence)
- Particle POP (solver, zero gravity, low drag)
- GLSL POP (boids forces: cohesion, alignment, separation)
- Render POP → Point MAT

## Connections
1. Sphere POP → Random POP
2. Random POP → Noise POP
3. Noise POP → Particle POP
4. Particle POP → GLSL POP (boids compute)
5. GLSL POP → Render POP

## Parameters
- Sphere POP: rate=500, radius=2, type=point
- Random POP: seed=42, min=-0.5, max=0.5 (velocity variation)
- Noise POP: type=curl, amplitude=0.3, frequency=0.2, speed=0.5
- Particle POP: life=5, drag=0.1, gravity=0

## GLSL Boids Forces
```glsl
// Core boids algorithm
vec3 cohesion = vec3(0), alignment = vec3(0), separation = vec3(0);
int neighbors = 0;
for (int i = 0; i < numPoints; i++) {
    if (i == id) continue;
    float dist = distance(pos, TDIn_P(i));
    if (dist < neighborhoodRadius) {
        cohesion += TDIn_P(i);
        alignment += TDIn_Vel(i);
        if (dist < separationRadius)
            separation -= normalize(TDIn_P(i) - pos) / dist;
        neighbors++;
    }
}
if (neighbors > 0) {
    cohesion = normalize(cohesion/neighbors - pos) * 0.01;
    alignment = normalize(alignment/neighbors) * 0.05;
    separation *= 0.1;
}
vel += (cohesion + alignment + separation) * uDT;
```

## Notes
- Zero gravity allows free-flight movement
- Low drag preserves momentum
- Curl noise adds natural turbulence
- Neighborhood radius controls flock cohesion
TMPEOF && cat > /mnt/c/Users/Tolch/Documents/AI_Code/Touchdesigner_MCP/mcp_td_v3/touchdesigner/toe/templates/fluid-curl-noise.md << 'TMPEOF'
# Fluid Dynamics (Curl Noise)

## Pattern: Divergence-Free Flow Simulation

## Operators
- Grid POP (dense point field, 50x50)
- Noise POP (curl type, incompressible flow)
- Particle POP (solver, low drag)
- Trail POP (flow visualization)
- Render POP → Point MAT

## Connections
1. Grid POP → Noise POP
2. Noise POP → Particle POP
3. Particle POP → Trail POP
4. Trail POP → Render POP

## Parameters
- Grid POP: rows=50, cols=50, size=10, type=point
- Noise POP: type=curl, amplitude=1.0, frequency=0.2, speed=0.5
- Particle POP: life=3, drag=0.05, gravity=0
- Trail POP: length=10, method=add

## Notes
- Curl noise produces incompressible flow (divergence-free)
- Ideal for smoke, water, fire effects
- Trail POP visualizes flow lines
- Low drag allows particles to follow flow naturally
TMPEOF && cat > /mnt/c/Users/Tolch/Documents/AI_Code/Touchdesigner_MCP/mcp_td_v3/touchdesigner/toe/templates/fractal-lsystem.md << 'TMPEOF'
# Fractal L-System

## Pattern: Recursive Geometry Generation

## Operators
- Table DAT (L-system rules)
- Script DAT (geometry generation)
- SOP to POP (bridge)
- Copy POP (instance at points)
- Noise POP (organic variation)
- Render POP → Point MAT

## Connections
1. Table DAT → Script DAT
2. Script DAT → SOP to POP
3. SOP to POP → Copy POP
4. Copy POP → Noise POP
5. Noise POP → Render POP

## L-System Rules (Table DAT)
| Axiom | Rule | Angle | Iterations |
|-------|------|-------|------------|
| F | F+F-F | 60 | 4 |
| F | F[+F]F[-F]F | 25.7 | 5 |
| A | AB | - | 6 |
| B | A[-B]+B | - | 5 |

## Notes
- Table DAT stores production rules
- Script DAT interprets rules into geometry
- SOP to POP converts SOP geometry to points
- Copy POP instances small geometry at each point
- Noise POP adds organic variation
TMPEOF && cat > /mnt/c/Users/Tolch/Documents/AI_Code/Touchdesigner_MCP/mcp_td_v3/touchdesigner/toe/templates/data-visualization.md << 'TMPEOF'
# Data Visualization System

## Pattern: Data-Driven Visual Output

## Operators
- Table DAT (data source: CSV/JSON/API)
- Select DAT (extract specific data)
- CHOP (signal extraction)
- CHOP to POP (bridge)
- Attribute POP (map data to visual attributes)
- Render POP → Point MAT

## Connections
1. Table DAT → Select DAT
2. Select DAT → CHOP
3. CHOP → CHOP to POP
4. CHOP to POP → Attribute POP
5. Attribute POP → Render POP

## Parameters
- Table DAT: file=data.csv or script=data source
- Select DAT: select rows/columns
- CHOP: channel=column names
- CHOP to POP: map channels to attributes
- Attribute POP: attribute=Cd, pscale, N based on data

## Notes
- Data can come from CSV, JSON, API, WebSocket
- CHOP normalizes data for visual mapping
- Map data ranges to visual ranges (color, size, position)
- Use for dashboards, generative art, scientific visualization
