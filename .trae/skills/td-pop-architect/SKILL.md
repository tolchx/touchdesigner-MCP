---
name: "td-pop-architect"
description: "Architects and generates TouchDesigner POP (Point Operator) particle systems. Invoke when user wants to create, simulate, or design particle systems using POPs."
---

# TouchDesigner POP Architect (td-pop-architect)

This skill specializes in designing and generating code for TouchDesigner POP (Point Operator) systems. It applies best practices for architecture, encapsulation, and node layout.

## When to Use
- The user asks to create a particle system.
- The user mentions POPs (Point Operators), point generation, forces, or particle simulations.
- The user needs an automated script to build a complex POP network in TouchDesigner.

## Architectural Principles
1. **Encapsulation**: Wrap POP networks inside a `baseCOMP` or `geoCOMP` to keep the main network clean.
2. **I/O Standard**: Always include an `inPOP` (if receiving external points) and a `nullPOP` named `out_pop1` or similar at the end of the chain.
3. **Node Layout**: Use `nodeX` and `nodeY` to logically arrange nodes from left-to-right or top-to-bottom.
4. **Naming Conventions**: Name nodes descriptively based on their function (e.g., `pg_source`, `pop_particles`, `force_wind`).
5. **Parameterization**: Expose key simulation parameters (birth rate, life, forces) to the parent COMP when possible, or explicitly set them in the creation script.

## Core POP Components
A standard POP particle system consists of:
- **Source/Generator**: `pointgeneratorPOP`, `spherePOP`, `boxPOP`, etc.
- **Solver**: `particlePOP` (handles the integration of velocity and life).
- **Forces**: `forceradialPOP`, `dragPOP`, `noisePOP`, `windPOP`.
- **Modifiers**: `limitPOP`, `interactPOP`, `colorPOP`, `mathPOP`.
- **Output**: `nullPOP`.

## Code Generation Template (Python)
When generating a POP system for the user, use the `td_execute` format or the `--py` flag format for the Claude-TouchDesigner MCP.

```python
# 1. Define parent container
p = op('/project1')
if not p: raise Exception('Missing parent')

# 2. Create/Retrieve Nodes
pg = op('pg_source') or p.create(pointgeneratorPOP, 'pg_source')
particles = op('pop_particles') or p.create(particlePOP, 'pop_particles')
force = op('force_noise') or p.create(noisePOP, 'force_noise')
out = op('out_pop') or p.create(nullPOP, 'out_pop')

# 3. Connect Nodes
particles.inputConnectors[0].connect(pg)
force.inputConnectors[0].connect(particles)
out.inputConnectors[0].connect(force)

# 4. Set Parameters
pg.par.numpoints = 1000
particles.par.birthrate = 500
particles.par.life = 3
force.par.amp = 0.5

# 5. Layout Nodes
nodes = [pg, particles, force, out]
for i, n in enumerate(nodes):
    n.nodeX = i * 200
    n.nodeY = -200

print('POP System Generated successfully.')
```

## Workflow
1. **Understand Requirements**: Ask the user about the desired particle behavior (e.g., "Do you want them to emit from a geometry? Are there specific forces like gravity or noise?").
2. **Draft the Architecture**: Plan the node chain.
3. **Generate Python Script**: Write the script using the standard template.
4. **Execute**: Propose running the script via the `RunCommand` tool using the `chat.js --py` interface or directly via `td_execute` if using the MCP.
