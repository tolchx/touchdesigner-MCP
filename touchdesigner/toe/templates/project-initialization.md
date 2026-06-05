# Project Initialization Template

## Pre-Generation Planning Flow

Every TouchDesigner project MUST follow this initialization flow:

### Step 1: Create Root Container
```
td_create_operator(type: "baseCOMP", name: "project_root", path: "/")
```

### Step 2: Create In/Out Ports
```
td_create_operator(type: "inPOP", name: "in1", path: "/project_root")
td_create_operator(type: "outPOP", name: "out1", path: "/project_root")
```

### Step 3: Plan Layout
Use the LayoutEngine to calculate positions:
```python
from layout_engine import LayoutEngine, LayoutConfig

config = LayoutConfig(
    horizontal_spacing=300,
    vertical_spacing=250,
    node_width=130,
    node_height=90
)

engine = LayoutEngine(config)
```

### Step 4: Create Source Nodes (Blue)
```
td_create_operator(type: "<source>", name: "source1", path: "/project_root", position_x: 0, position_y: 0)
```

### Step 5: Create Processing Nodes (Green)
```
td_create_operator(type: "<process>", name: "process1", path: "/project_root", position_x: 300, position_y: 0)
```

### Step 6: Create Output Nodes (Orange)
```
td_create_operator(type: "nullTOP", name: "output", path: "/project_root", position_x: 600, position_y: 0)
```

### Step 7: Connect All Nodes
```
td_connect_nodes(source: "/project_root/source1", target: "/project_root/process1")
td_connect_nodes(source: "/project_root/process1", target: "/project_root/output")
```

### Step 8: Verify
```
td_healthcheck(path: "/project_root")
td_get_errors(path: "/project_root")
```

## Layout Rules

- **Horizontal spacing**: 300px between nodes in same chain
- **Vertical spacing**: 250px between parallel chains
- **Flow direction**: Left-to-right (inputs left, outputs right)
- **Anti-collision**: AABB intersection test before placing each node
- **Color coding**: Blue=source, Green=process, Orange=output, Purple=control

## Geometry COMP Pattern (3D Projects)

```
1. td_create_operator(type: "geometryCOMP", name: "geo1", path: "/project_root")
2. td_create_operator(type: "cameraCOMP", name: "cam1", path: "/project_root", position_x: -200, position_y: -100)
3. td_create_operator(type: "renderTOP", name: "render1", path: "/project_root", position_x: 300, position_y: 0)
4. td_create_operator(type: "nullTOP", name: "output", path: "/project_root", position_x: 600, position_y: 0)
```

Inside Geometry COMP:
```
1. td_create_operator(type: "inPOP", name: "in1", path: "/project_root/geo1")
2. // Processing nodes
3. td_create_operator(type: "outPOP", name: "out1", path: "/project_root/geo1")
```
