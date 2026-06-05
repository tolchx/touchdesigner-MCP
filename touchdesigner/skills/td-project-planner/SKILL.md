# td-project-planner

Professional pre-generation planning system for TouchDesigner projects.

## MANDATORY: Pre-Generation Planning Flow

Before creating ANY content in TouchDesigner via MCP:

### Step 1: Create Root Container
1. td_create_operator(type: "baseCOMP", name: "project_root", path: "/")
2. td_create_operator(type: "inPOP", name: "in1", path: "/project_root")
3. td_create_operator(type: "outPOP", name: "out1", path: "/project_root")

### Step 2: Anti-Collision Layout
- Calculate position: (chain * 250, index * 250)
- Create AABB bounds for new node
- Test intersection with ALL placed nodes
- If collision: shift right by 250px until clear
- Place node and record bounds

### Step 3: Role-Based Ordering
1. Source (Blue): inputs, generators
2. Bridge (Green): family converters
3. Modifier (Green): attribute changes
4. Solver (Green): physics/simulation
5. Output (Orange): render/display
6. Control (Purple): logic/selects

See td-core-discipline for color coding, spacing, and layout rules.

### Step 4: Verification
- Root COMP created, all nodes inside
- Left-to-right flow, no overlaps
- td_healthcheck passed
