# TD GLSL POP Create

Specialized skill for creating GLSL POP operator networks in TouchDesigner via the MCP server (localhost:44444).

## When to Use
- User asks to create GLSL POP, glsladvancedPOP, or glslcopyPOP operators
- User asks to build particle systems with GLSL shaders
- User asks to wire GLSL operators in TouchDesigner

## Quick Reference — Operator Types

| Family | Operator | Purpose |
|--------|----------|---------|
| POP | `glslPOP` | Basic GLSL compute shader (P, Cd, N attributes) |
| POP | `glsladvancedPOP` | Advanced GLSL (prim, vert, extra outputs) |
| POP | `glslcopyPOP` | GLSL copy with template input |
| TOP | `glslTOP` | GLSL pixel/vertex/compute shader |

## Step-by-Step: Create a glslPOP Network

### 1. Create source POP + textDAT + glslPOP + nullPOP
```python
# via POST /exec endpoint
code = """
import json
R = '/project1/my_system'

# Create source
src = op('/project1').create(td.boxPOP, 'source')
src.par.sizex = 1.5
src.par.depth = 10
src.nodeX = 0; src.nodeY = 0

# Create shader DAT
dat = op('/project1').create(td.textDAT, 'shader_code')
dat.text = '''uniform float u_time;
void main() {
    uint id = TDIndex();
    vec3 pos = TDIn_P(0, id);
    float wave = sin(pos.x * 3.0 + u_time) * 0.15;
    P[id] = pos + vec3(0.0, wave, 0.0);
}'''
dat.nodeX = 0; dat.nodeY = 300

# Create glslPOP
glsl = op('/project1').create(td.glslPOP, 'glsl_pop')
glsl.par.computedat = 'shader_code'
glsl.par.outputattrs = 'P'
glsl.nodeX = 400; glsl.nodeY = 0

# Create output
out = op('/project1').create(td.nullPOP, 'output')
out.nodeX = 800; out.nodeY = 0

# Wire: source → glsl → output
src.outputConnectors[0].connect(glsl)
glsl.outputConnectors[0].connect(out)
"""
```

### 2. Critical Parameter Names (Empirically Verified)

| Operator | Param | Type | Notes |
|----------|-------|------|-------|
| `glslPOP` | `computedat` | String | Name of textDAT with shader |
| `glslPOP` | `outputattrs` | Menu | `'P'`, `'P Cd'` |
| `glslPOP` | `npasses` | Int | Multi-pass count |
| `glsladvancedPOP` | `computedat` | String | Same as glslPOP |
| `glsladvancedPOP` | `ptoutputattrs` | Menu | `'P'`, `'*'` |
| `glsladvancedPOP` | `extraout` | Toggle | Enable extra output |
| `glsladvancedPOP` | `extraout0name` | String | Name of extra attribute |
| `glslcopyPOP` | `ptcomputedat` | String | NOT `computedat` |
| `feedbackPOP` | `inputmul` | Int | NOT Float, NOT gain |
| `feedbackTOP` | `top` | OP ref | Downstream nullTOP |

### 3. Connection Rules
- `outputConnectors[0].connect()` works **within same family only**
- Cross-family (POP→TOP) fails with `td.tdError`
- `feedbackPOP` has NO `top` param — reads from input history automatically
- `feedbackTOP` HAS `top` param — must set to downstream nullTOP

### 4. GLSL Shader Boilerplate (glslPOP)
```glsl
// glslPOP compute shader
uniform float u_time;

void main() {
    const uint id = TDIndex();
    if (id >= TDNumElements()) return;
    
    vec3 pos = TDIn_P(0, id);
    
    // Your displacement logic here
    P[id] = pos;
    
    // Optional: write color
    // Cd[id] = vec4(1.0, 0.0, 0.0, 1.0);
}
```

### 5. GLSL Shader Boilerplate (glslTOP pixel)
```glsl
// glslTOP pixel shader
out vec4 fragColor;
uniform float u_time;

void main() {
    vec2 uv = vUV.st;
    vec4 color = texture(sTD2DInputs[0], uv);
    fragColor = TDOutputSwizzle(color);
}
```

### 6. GLSL Shader Boilerplate (glslTOP vertex)
```glsl
// glslTOP vertex shader
uniform float u_time;

void main() {
    vec3 pos = P;
    // Deform vertices
    pos.y += sin(pos.x * 3.0 + u_time) * 0.2;
    gl_Position = TDWorldToProj(TDModelToWorld(pos));
    uv = uvable;
    color = CD;
}
```

## Common Patterns

### Feedback Loop
```python
# glslPOP + feedbackPOP
src → glslPOP → feedbackPOP → nullPOP
# feedbackPOP.inputmul = 1 (keeps 100% of previous frame)
```

### Multi-Pass
```python
# glslPOP with npasses
glsl.par.npasses = 4
# In shader: use uTDPass to branch per-pass behavior
```

### Const Uniforms (glslTOP, glslPOP, glsladvancedPOP)

Use `const0name`/`const0value` to pass custom uniforms to shaders without creating custom parameters:

```python
# Set uniform 'u_strength' = 0.5
op('/project1/my_shader').par.const0name = 'u_strength'
op('/project1/my_shader').par.const0value = 0.5

# Set uniform 'u_color_scale' = 2.0
op('/project1/my_shader').par.const1name = 'u_color_scale'
op('/project1/my_shader').par.const1value = 2.0

# Verify:
print(op('/project1/my_shader').par.const0name.eval())  # 'u_strength'
print(op('/project1/my_shader').par.const0value.eval()) # 0.5
```

In the GLSL shader:
```glsl
uniform float u_time;        // Built-in (auto)
uniform float u_strength;    // Set via const0name/const0value
uniform float u_color_scale; // Set via const1name/const1value

void main() {
    uint id = TDIndex();
    vec3 pos = TDIn_P(0, id);
    float force = u_strength / (length(pos) + 0.5);
    pos += normalize(pos) * force * u_color_scale * 0.1;
    P[id] = pos;
}
```

**⚠️ IMPORTANT: uniform initializers are NOT supported in TD GLSL:**
```glsl
// ❌ WRONG — generates warning 'Ignoring initializer for uniform'
uniform float u_strength = 0.5;

// ✅ CORRECT — declare without value, set via const params
uniform float u_strength;
```

**Note:** `glslcopyPOP` does NOT support const params — use custom parameters instead.

## Verification
After creating operators, always run:
```
GET /verify?path=/project1/my_system
```
Check for `healthy: true` and `error_count: 0`.
