# GLSL POP Error-Solving Mechanisms — Documentation

## Table of Contents

1. [Overview](#overview)
2. [Critical Fix: outputattrs](#critical-fix-outputattrs)
3. [Error Detection System](#error-detection-system)
4. [Common GLSL POP Errors](#common-glsl-pop-errors)
5. [Auto-Fix Mechanisms](#auto-fix-mechanisms)
6. [DAT Info Verification](#dat-info-verification)
7. [Project Architecture](#project-architecture)
8. [Troubleshooting Guide](#troubleshooting-guide)

---

## Overview

The GLSL POP Error-Solving System provides automatic detection, classification, and repair of errors in TouchDesigner GLSL POP networks. It uses a multi-layered approach:

1. **outputattrs Configuration** — Set `outputattrs='P'` (or `'P Cd'`) BEFORE writing GLSL
2. **DAT Info Operators** — Read `{name}_info` sibling DATs to detect compilation errors
3. **Healthcheck API** — Use TD's built-in healthcheck to detect operator errors/warnings
4. **Auto-Fix Engine** — Automatically fix common errors (missing inputs, bad GLSL code)
5. **Verification Loop** — Re-check after fixes until clean

---

## Critical Fix: outputattrs

**The #1 cause of GLSL POP compilation errors is missing `outputattrs` configuration.**

When you create a `glslPOP`, the `outputattrs` parameter is EMPTY by default. This means `P[id]`, `Cd[id]`, and other output writes are UNDECLARED in the GLSL shader, causing compilation failures like:
- `'P' : undeclared identifier`
- `'Cd' : undeclared identifier`

**Fix: Set `outputattrs` BEFORE writing GLSL code:**

```python
# For position-only shaders:
g.par.outputattrs = 'P'

# For position + color shaders:
g.par.outputattrs = 'P Cd'

# For position + color + normal:
g.par.outputattrs = 'P Cd N'
```

**Why this happens:**
- The `glslPOP` treats attributes as SSBOs (Shader Storage Buffer Objects)
- TD only binds output buffers for attributes listed in `outputattrs`
- Without binding, `P[id] = ...` fails with "undeclared identifier"

**Reference:** https://docs.derivative.ca/Write_a_GLSL_POP

---

## Error Detection System

### Layer 1: Operator Errors (Primary)

The most reliable way to check GLSL compilation is via `child.errors()`:

```python
for child in op('/project1/glsl_projects').findChildren():
    errs = str(child.errors()) if hasattr(child, 'errors') else ''
    if errs and errs != 'None':
        print(f"Error in {child.name}: {errs[:200]}")
```

### Layer 2: Info DAT Verification (Sibling)

TD creates a `{name}_info` textDAT as a SIBLING of the glslPOP (not a child!).

```python
# Reading info DAT (sibling, not child!)
info = op('/project1/glsl_projects/project1/noise_deform_info')
if info and hasattr(info, 'text') and info.text:
    if 'Compiled Successfully' in info.text:
        print("Shader compiled OK")
    elif 'Error' in info.text:
        print("Shader error:", info.text[:300])
```

### Layer 3: Error Classification

| Category | Pattern | Auto-Fixable |
|----------|---------|--------------|
| `glsl_error` | "Compile failed", "GLSL error" | ✅ Fix outputattrs + rewrite shader |
| `expression_error` | "AttributeError", "NameError" | ✅ Add `math.` prefix |
| `missing_input` | "No input POP" | ✅ Connect source |
| `cook_loop` | "Cook dependency loop" | ⚠️ Manual review |
| `missing_file` | "File not found" | ✅ Fix path |

---

## Common GLSL POP Errors

### Error 1: "No input POP"

**Cause:** GLSL POP has no input geometry connected.

**Detection:**
```python
errors = glsl_op.errors()
if 'No input' in str(errors):
    print("Missing input POP!")
```

**Auto-Fix:**
```python
# Create a source POP and connect it
src = parent.create(boxPOP, 'src_' + glsl_name)
src.outputConnectors[0].connect(glsl_op)
```

**Manual Fix:**
1. Create a geometry source (boxPOP, spherePOP, gridPOP, etc.)
2. Connect the source's output to the GLSL POP's input 0
3. Force cook the GLSL POP

### Error 2: GLSL Compilation Error

**Cause:** Invalid GLSL syntax, wrong uniforms, or type mismatches.

**Detection:**
```python
info = op(glsl_op.path + '/glsl1_info')
if 'Error' in info.text:
    print("GLSL compilation failed:", info.text[:300])
```

**Auto-Fix (rewrite with safe defaults):**
```python
# Replace compute DAT with known-good GLSL
compute_dat.text = '''void main() {
    const uint id = TDIndex();
    if(id >= TDNumElements()) return;
    P[id] = TDIn_P(0, id);
}'''
glsl_op.par.computedat = compute_dat.name
glsl_op.cook(force=True)
```

**Common GLSL Errors:**

| Error | Cause | Fix |
|-------|-------|-----|
| `undefined variable 'P'` | Missing `P[id] =` assignment | Add `P[id] = ...` |
| `expected constructor` | Wrong type (e.g., `vec3` where `float` expected) | Fix type cast |
| `no matching function` | Wrong TD function signature | Check TD GLSL docs |
| `redefinition of 'main'` | Duplicate `void main()` | Remove duplicate |

### Error 3: Missing Compute DAT

**Cause:** GLSL POP references a compute DAT that doesn't exist.

**Detection:**
```python
compute_name = glsl_op.par.computedat.eval()
if op(parent.path + '/' + compute_name) is None:
    print("Compute DAT missing!")
```

**Auto-Fix:**
```python
compute = parent.create(textDAT, glsl_name + '_compute')
compute.text = safe_glsl_code
glsl_op.par.computedat = compute.name
```

### Error 4: Expression Errors (Python)

**Cause:** Bare math functions in parameter expressions (e.g., `sin(x)` instead of `math.sin(x)`).

**Detection:**
```python
for par in op(path).pars():
    if par.expr and 'sin(' in par.expr and 'math.sin' not in par.expr:
        print("Bare sin() in", par.name)
```

**Auto-Fix:**
```python
import re
pattern = re.compile(r'(?<!\.)(?<!\w)(sin|cos|tan|sqrt|log)(?=\s*\()')
for par in node.pars():
    if par.expr:
        new = pattern.sub(lambda m: 'math.' + m.group(1), par.expr)
        if new != par.expr:
            par.expr = new
```

---

## Auto-Fix Mechanisms

### The Fix Loop

```
┌─────────────────────────────────────────────────────────────┐
│                    GLSL POP Fix Loop                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. CREATE operators (source, compute DAT, GLSL POP)       │
│         ↓                                                   │
│  2. CONNECT source → GLSL POP                               │
│         ↓                                                   │
│  3. FORCE COOK the GLSL POP                                 │
│         ↓                                                   │
│  4. READ glsl1_info DAT                                     │
│         ↓                                                   │
│  5. CHECK for errors                                        │
│         ↓                                                   │
│  ┌─── Has errors? ───┐                                     │
│  │                    │                                     │
│  YES                  NO                                    │
│  │                    │                                     │
│  ↓                    ↓                                     │
│  6. CLASSIFY error   ✅ DONE                               │
│  │                                                        │
│  ↓                                                        │
│  7. APPLY auto-fix                                          │
│  │                                                        │
│  ↓                                                        │
│  8. FORCE COOK again                                        │
│  │                                                        │
│  ↓                                                        │
│  9. RE-CHECK glsl1_info                                     │
│  │                                                        │
│  ↓                                                        │
│  10. Loop back to step 5 (max 3 attempts)                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Fix Strategies (Ordered by Priority)

1. **Connect missing input** — Create a source POP and wire it
2. **Rewrite GLSL code** — Replace with known-good shader
3. **Fix expression syntax** — Add `math.` prefix to bare functions
4. **Fix compute DAT reference** — Create missing DAT and link it
5. **Report manual fix needed** — Log the error for human review

---

## DAT Info Verification

### How glsl1_info Works

When a `glslPOP` is created in TouchDesigner, it automatically creates:
- `glsl1_info` — Contains compilation status text
- `glsl1_compute` — The default compute shader DAT (if not overridden)

### Reading glsl1_info Programmatically

```python
def check_glsl_compilation(glsl_path):
    """Check if a GLSL POP's shader compiled successfully."""
    info = op(glsl_path + '/glsl1_info')
    
    if info is None:
        return {'status': 'no_info_dat', 'error': None}
    
    text = info.text.strip() if hasattr(info, 'text') else ''
    
    if 'Compiled Successfully' in text:
        return {'status': 'compiled', 'error': None}
    elif 'Error' in text or 'error' in text:
        return {'status': 'error', 'error': text[:500]}
    elif not text:
        return {'status': 'empty', 'error': None}
    else:
        return {'status': 'unknown', 'error': text[:200]}


def check_all_glsl_pops(container_path):
    """Check compilation status of all GLSL POPs in a container."""
    results = []
    parent = op(container_path)
    
    if parent is None:
        return results
    
    for child in parent.findChildren():
        if hasattr(child, 'OPType') and child.OPType in ('glslPOP', 'gLSLPOP'):
            # Force cook to ensure fresh compilation
            try:
                child.cook(force=True)
            except:
                pass
            
            status = check_glsl_compilation(child.path)
            results.append({
                'path': child.path,
                'name': child.name,
                **status
            })
    
    return results
```

### Verifying Multiple Projects

```python
import json

def verify_all_projects(root_path):
    """Verify all GLSL POP projects and return a report."""
    report = {}
    parent = op(root_path)
    
    for proj in parent.children:
        proj_errors = []
        proj_glsl_status = 'unknown'
        
        for child in proj.findChildren():
            # Check operator errors
            try:
                errs = str(child.errors()) if hasattr(child, 'errors') else ''
                if errs:
                    proj_errors.append({'name': child.name, 'error': errs[:200]})
            except:
                pass
            
            # Check GLSL compilation
            if hasattr(child, 'OPType') and child.OPType in ('glslPOP', 'gLSLPOP'):
                try:
                    child.cook(force=True)
                except:
                    pass
                
                info = op(child.path + '/glsl1_info')
                if info and hasattr(info, 'text') and info.text:
                    if 'Compiled Successfully' in info.text:
                        proj_glsl_status = 'compiled'
                    elif 'Error' in info.text:
                        proj_glsl_status = 'error'
        
        report[proj.name] = {
            'errors': proj_errors,
            'glsl_status': proj_glsl_status,
            'clean': len(proj_errors) == 0 and proj_glsl_status != 'error'
        }
    
    return report
```

---

## Project Architecture

### Directory Structure

```
glsl_pop_projects/
├── build_5_glsl_projects.py    # Main builder with auto-fix
├── verify_glsl_projects.py     # Standalone verifier
├── GLSL_ERROR_SOLUTIONS.md     # This documentation
└── shaders/                    # GLSL shader files (backup)
    ├── noise.glsl
    ├── color.glsl
    ├── wave.glsl
    ├── fountain.glsl
    └── spring.glsl
```

### TD Network Structure (per project)

```
/project1/glsl_projects/
├── project1_noise_deform/
│   ├── src_noisedeform    (boxPOP)      → Geometry source
│   ├── noise_compute      (textDAT)     → GLSL shader code
│   ├── noisedeform        (glslPOP)     → GLSL processing
│   └── out_noisedeform    (nullPOP)     → Output inspection
├── project2_color_by_pos/
│   ├── src_colorbypos     (spherePOP)   → Geometry source
│   ├── color_compute      (textDAT)     → GLSL shader code
│   ├── colorbypos         (glslPOP)     → GLSL processing
│   └── out_colorbypos     (nullPOP)     → Output inspection
├── project3_wave_deform/
│   ├── src_wavedeform     (gridPOP)     → Geometry source
│   ├── wave_compute       (textDAT)     → GLSL shader code
│   ├── wavedeform         (glslPOP)     → GLSL processing
│   └── out_wavedeform     (nullPOP)     → Output inspection
├── project4_particle_fountain/
│   ├── src_particlefountain (circlePOP)  → Geometry source
│   ├── fountain_compute   (textDAT)     → GLSL shader code
│   ├── particlefountain   (glslPOP)     → GLSL processing
│   └── out_particlefountain (nullPOP)    → Output inspection
└── project5_spring_forces/
    ├── src_springforces   (boxPOP)      → Geometry source
    ├── spring_compute     (textDAT)     → GLSL shader code
    ├── springforces       (glslPOP)     → GLSL processing
    └── out_springforces   (nullPOP)     → Output inspection
```

### Data Flow

```
Source POP (geometry) 
    → GLSL POP (reads P, N, Cd, etc.)
        → reads from compute DAT (GLSL code)
        → writes to glsl1_info (compilation status)
    → nullPOP (output for inspection/rendering)
```

---

## Troubleshooting Guide

### Issue: "GLSL POP not compiling"

1. Check `glsl1_info` DAT text for error details
2. Verify the compute DAT exists and has valid GLSL
3. Ensure the GLSL POP has an input connected
4. Force cook: `op('path/to/glslPOP').cook(force=True)`

### Issue: "No input POP error"

1. Create a source POP (boxPOP, spherePOP, gridPOP)
2. Connect: `source.outputConnectors[0].connect(glslPOP)`
3. The source geometry provides the P, N, Cd attributes

### Issue: "Compute DAT not found"

1. Create a textDAT with the GLSL code
2. Set: `glslPOP.par.computedat = 'dat_name'`
3. The DAT name is relative to the GLSL POP's parent

### Issue: "Expression errors in parameters"

1. Check parameter expressions for bare math functions
2. Fix: `sin(x)` → `math.sin(x)`
3. Use the auto-fix tool: `td_validate` with `auto_fix=true`

### Issue: "GLSL attribute not found"

1. Ensure you're using the correct attribute accessor:
   - `TDIn_P(0, id)` for position from input 0
   - `TDIn_N(0, id)` for normal from input 0
   - `P[id] = ...` to write position output
   - `Cd[id] = ...` to write color output

### Issue: "Uniform not declared"

1. TD GLSL uniforms are declared with `uniform` keyword
2. Common uniforms: `u_time`, `u_delta`, `u_resolution`
3. Custom uniforms: `uniform float myParam;` → bind via the Vectors page API (see below)

---

## Uniform Binding: The Vectors Page API

### How GLSL POP Uniforms Work

**Critical:** GLSL POP custom uniforms (`uniform float u_time`, `uniform vec3 myColor`, etc.) are **NOT exposed as operator parameters**. You cannot set them via `par.expr` or `par.val` — those parameter names don't exist.

Instead, uniforms are bound through the **Vectors page** of the GLSL POP's parameter dialog.

### Vectors Page Parameters

| Parameter | Description | Example Value |
|-----------|-------------|---------------|
| `vec0name` | Uniform name (matches GLSL declaration) | `'u_time'` |
| `vec0type` | Data type (`float`, `vec2`, `vec3`, `vec4`, `int`, etc.) | `'float'` |
| `vec0valuex` | X component value (Python expression or literal) | `absTime.seconds` |
| `vec0valuey` | Y component value (vec2/vec3/vec4 only) | `0.0` |
| `vec0valuez` | Z component value (vec3/vec4 only) | `0.0` |
| `vec0valuew` | W component value (vec4 only) | `0.0` |

For multiple uniforms, increment the index: `vec1name`, `vec1valuex`, etc.

### Python API for Binding Uniforms

```python
def configure_vectors(glsl_path):
    """Bind uniforms via the GLSL POP Vectors page."""
    g = op(glsl_path)
    
    # Ensure the GLSL is written and compiled first
    if g is None or not hasattr(g, 'par'):
        return {'ok': False, 'error': 'glslPOP not found'}
    
    try:
        # Set uniform name
        g.par.vec0name.val = 'u_time'
        # Set data type (must match GLSL declaration)
        g.par.vec0type.val = 'float'
        # Bind value via Python expression
        g.par.vec0valuex.expr = 'absTime.seconds'
        return {'ok': True, 'expr': g.par.vec0valuex.expr, 'val': g.par.vec0valuex.eval()}
    except Exception as e:
        return {'ok': False, 'error': str(e)}
```

### Binding Multiple Uniforms

```python
def configure_multiple_uniforms(glsl_path):
    g = op(glsl_path)
    
    # vec0: u_time
    g.par.vec0name.val = 'u_time'
    g.par.vec0type.val = 'float'
    g.par.vec0valuex.expr = 'absTime.seconds'
    
    # vec1: u_resolution (vec2)
    g.par.vec1name.val = 'u_resolution'
    g.par.vec1type.val = 'vec2'
    g.par.vec1valuex.expr = 'absTime.resolutionw'
    g.par.vec1valuey.expr = 'absTime.resolutionh'
    
    # vec2: myCustomColor (vec3, literal values)
    g.par.vec2name.val = 'myCustomColor'
    g.par.vec2type.val = 'vec3'
    g.par.vec2valuex.val = 1.0
    g.par.vec2valuey.val = 0.5
    g.par.vec2valuez.val = 0.0
```

### GLSL Declaration ↔ Vectors Page Mapping

```glsl
// In your GLSL compute shader:
uniform float u_time;        →  vec0name='u_time', vec0type='float', vec0valuex.expr='absTime.seconds'
uniform float u_delta;       →  vec0name='u_delta', vec0type='float', vec0valuex.expr='absTime.seconds'
uniform vec2 u_resolution;   →  vec0name='u_resolution', vec0type='vec2', vec0valuex=width, vec0valuey=height
uniform vec3 lightPos;       →  vec0name='lightPos', vec0type='vec3', vec0valuex=x, vec0valuey=y, vec0valuez=z
uniform int maxIter;          →  vec0name='maxIter', vec0type='int', vec0valuex=100
```

### Verification

```python
# After binding, verify the uniform is connected:
g = op('/path/to/glslPOP')
print(f"Name: {g.par.vec0name.val}")   # 'u_time'
print(f"Type: {g.par.vec0type.val}")   # 'float'
print(f"Expr: {g.par.vec0valuex.expr}")  # 'absTime.seconds'
print(f"Value: {g.par.vec0valuex.eval()}")  # 108609.05 (actual seconds)
```

### Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| `par.u_time.expr = 'absTime.seconds'` | No such parameter exists | Use `par.vec0name.val = 'u_time'` + `par.vec0valuex.expr = 'absTime.seconds'` |
| Setting vectors BEFORE writing GLSL | Vectors page may reset | Write GLSL → cook → then set vectors |
| Wrong `vec0type` | Type mismatch error | Match GLSL: `float`/`vec2`/`vec3`/`vec4` |
| Forgetting to force cook | Changes not reflected | Call `g.cook(force=True)` after setting |

### Recommended Build Order

1. Create source POP (boxPOP, spherePOP, etc.)
2. Create textDAT with GLSL code
3. Create glslPOP and set `computedat`
4. Set `outputattrs` (e.g., `'P'`)
5. **Force cook** (triggers compilation)
6. **Then** set Vectors page parameters (`vec0name`, `vec0valuex`)
7. Force cook again
8. Read `glsl1_info` to verify compilation

---

## GLSL POP Cheat Sheet

### Input Accessors (GLSL Copy/Compute)

```glsl
vec3 pos = TDIn_P(inputIndex, pointId);    // Position
vec3 norm = TDIn_N(inputIndex, pointId);   // Normal
vec3 vel = TDIn_V(inputIndex, pointId);    // Velocity
float life = TDIn_Life(inputIndex, pointId); // Life
float age = TDIn_Age(inputIndex, pointId);   // Age
```

### Output Writers

```glsl
P[id] = vec3(x, y, z);     // Set position
Cd[id] = vec4(r, g, b, a);  // Set color
N[id] = vec3(nx, ny, nz);   // Set normal
```

### Built-in Functions

```glsl
TDSimplexNoise(vec4(pos, time))  // 4D simplex noise
TDPerlinNoise(vec4(pos, time))   // 4D perlin noise
TDIndex()                         // Current point index
TDNumElements()                   // Total point count
```

### Uniforms

```glsl
uniform float u_time;        // Time in seconds
uniform float u_delta;       // Delta time
uniform vec2 u_resolution;   // Viewport resolution
uniform int u_numPoints;     // Number of points
```

---

*Generated by GLSL POP Error-Solving System*
*Last updated: 2026-06-14*
