# Toe_Expand Continuous Analysis Framework

## Overview

The Toe_Expand directory contains decompressed .toe TouchDesigner projects. This framework defines how to continuously analyze and extract knowledge from these projects.

## Directory Structure

```
Toe_Expand/
├── 20250823_TDSW/           # TDSW workshop project
│   └── 20250823_TDSW.toe.dir/
│       ├── local/           # System-level nodes
│       └── project1/        # Main project content
│           ├── 00_Basic/    # Basic operators
│           ├── 01_TOPtoPOP/ # TOP to POP conversion
│           ├── 02_Banana/   # Thematic project
│           ├── 03_Earth/    # Thematic project
│           └── 04_ScanLine/ # Thematic project
├── AccurateColoring_v/      # Color accuracy project
├── AttribManip/             # Attribute manipulation
├── Analisis_Maestro/        # Master analysis reports
│   └── reportes/
│       └── index_maestro.md # Index of 96 analyzed projects
└── [other projects]/
```

## Analysis Pipeline

### Step 1: Project Discovery
```bash
find Toe_Expand -name '*.toe.dir' -type d
```

### Step 2: Node Extraction
For each project, extract:
- `.n` files → Node configurations (type, position, flags, connections)
- `.parm` files → Parameter values and expressions
- `.network` files → Component input mappings
- `.gnode` files → Geometry transformation matrices

### Step 3: Pattern Recognition
Identify recurring patterns:
1. **Operator Chains**: Common sequences (Source → Process → Output)
2. **Parameter Defaults**: Standard parameter values for each operator type
3. **Connection Patterns**: How operators connect across families
4. **GLSL Shaders**: Custom shader code in GLSL TOPs/DATs
5. **Python Scripts**: Automation scripts in Script DATs
6. **Layout Patterns**: How nodes are organized visually

### Step 4: Knowledge Base Update
Export extracted patterns to:
- `touchdesigner/toe/templates/*.md` - Template documentation
- `Docs/` - Technical documentation
- `data/templates/` - Machine-readable templates

## Extraction Script

```python
# extract_patterns.py - Run from mcp_td_v3 root
import os
import json
import glob

def extract_from_toe_dir(toe_dir):
    """Extract patterns from a decompressed .toe directory."""
    patterns = {
        'nodes': [],
        'connections': [],
        'parameters': [],
        'glsl_shaders': [],
        'python_scripts': []
    }
    
    # Walk through all .n files
    for n_file in glob.glob(os.path.join(toe_dir, '**', '*.n'), recursive=True):
        with open(n_file, 'r') as f:
            content = f.read()
            # Extract node type, position, connections
            patterns['nodes'].append(parse_node_file(n_file, content))
    
    # Walk through all .parm files
    for parm_file in glob.glob(os.path.join(toe_dir, '**', '*.parm'), recursive=True):
        with open(parm_file, 'r') as f:
            content = f.read()
            patterns['parameters'].append(parse_parm_file(parm_file, content))
    
    return patterns

def parse_node_file(path, content):
    """Parse a .n file to extract node configuration."""
    lines = content.strip().split('\n')
    node_type = lines[0] if lines else 'unknown'
    
    # Extract tile (position)
    tile = None
    for line in lines:
        if line.startswith('tile'):
            parts = line.split()
            if len(parts) >= 5:
                tile = {'x': int(parts[1]), 'y': int(parts[2]), 
                        'w': int(parts[3]), 'h': int(parts[4])}
    
    # Extract inputs
    inputs = []
    in_inputs = False
    for line in lines:
        if line.strip() == 'inputs':
            in_inputs = True
            continue
        if in_inputs:
            if line.strip() == '}':
                in_inputs = False
            else:
                inputs.append(line.strip())
    
    return {
        'file': os.path.basename(path),
        'type': node_type,
        'tile': tile,
        'inputs': inputs
    }

# Run extraction
if __name__ == '__main__':
    toe_expand_dir = 'Toe_Expand'
    all_patterns = []
    
    for toe_dir in glob.glob(os.path.join(toe_expand_dir, '*.toe.dir')):
        print(f'Analyzing: {toe_dir}')
        patterns = extract_from_toe_dir(toe_dir)
        all_patterns.append({
            'project': os.path.basename(toe_dir),
            'patterns': patterns
        })
    
    # Save results
    with open('toe_expand_patterns.json', 'w') as f:
        json.dump(all_patterns, f, indent=2)
    
    print(f'Extracted patterns from {len(all_patterns)} projects')
```

## Known Patterns (from 96 analyzed projects)

### Most Common Operators
| Operator | Count | Family |
|----------|-------|--------|
| text | 3532 | DAT |
| null | 2407 | TOP/CHOP/SOP |
| base | 1408 | COMP |
| annotate | 1218 | COMP |
| table | 1183 | DAT |
| parexec | 1164 | DAT |
| filein | 972 | DAT |
| select | 929 | DAT |
| container | 908 | COMP |
| out | 861 | COMP |

### Common Chains
1. **Video Pipeline**: moviefileinTOP → noiseTOP → blurTOP → nullTOP
2. **Particle System**: spherePOP → noisePOP → particlePOP → renderPOP
3. **Audio Reactive**: audioCHOP → mathCHOP → choptoPOP → noisePOP
4. **Data Flow**: tableDAT → selectDAT → mergeDAT → textDAT

## Continuous Update Process

1. **Weekly**: Scan Toe_Expand for new .toe.dir folders
2. **Extract**: Run extraction script on new projects
3. **Analyze**: Identify new patterns not in existing knowledge base
4. **Document**: Create markdown templates for new patterns
5. **Index**: Update templatesDb.js to include new templates
6. **Verify**: Run td_templates_query to confirm discoverability
