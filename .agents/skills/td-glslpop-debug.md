# TD GLSL POP Debug

Specialized skill for debugging GLSL compilation errors and operator issues in TouchDesigner.

## When to Use
- User reports GLSL compilation errors
- User asks why GLSL POP/TOP shows errors
- User needs to diagnose operator connection issues

## Quick Diagnostic Steps

### Step 1: Check Operator Errors
```python
# via POST /exec
import json
o = op('/project1/my_system/my_glslpop')
errs = list(o.errors()) if o.errors() else []
print(json.dumps({'errors': [str(x) for x in errs]}))
```

### Step 2: Check GLSL Code in DAT
```python
o = op('/project1/my_system/my_shader_dat')
print(o.text)  # Print the GLSL code
```

### Step 3: Verify Parameters
```python
import json
o = op('/project1/my_system/my_glslpop')
params = {}
for p in o.pars():
    try:
        val = p.eval()
        if val is not None and val != '':
            params[p.name] = str(val)
    except:
        pass
print(json.dumps(params))
```

## Common Errors & Fixes

### Error: "compiled with errors"
**Cause:** GLSL syntax error in shader code
**Fix:** Check for:
- Missing semicolons `;`
- Unclosed braces `{` `}`
- Wrong function signatures
- Using `float` instead of `int` for loop counters

### Error: "attribute not found"
**Cause:** Writing to attribute not in outputattrs
**Fix:**
```python
# For P displacement:
glsl.par.outputattrs = 'P'
# For P + Cd:
glsl.par.outputattrs = 'P Cd'
# For glsladvancedPOP:
glsl.par.ptoutputattrs = 'P'
```

### Error: "computedat not set"
**Cause:** glslPOP has no shader DAT assigned
**Fix:**
```python
glsl.par.computedat = 'my_shader_dat'
```

### Error: "'td.ParCollection' has no attribute 'top'"
**Cause:** Using `feedbackTOP` params on `feedbackPOP`
**Fix:** `feedbackPOP` has NO `top` param — it reads from input history. Only `feedbackTOP` has `top`.

### Error: "inputmul must be Int"
**Cause:** Setting feedbackPOP.inputmul to float
**Fix:**
```python
# Correct: Int value
feedback.par.inputmul = 1
# Wrong: Float value
feedback.par.inputmul = 1.0  # ← WRONG
```

### Error: Cross-family connection failed
**Cause:** Trying to connect POP → TOP or TOP → POP
**Fix:** POPs connect to POPs, TOPs connect to TOPs. Use `toPOP`/`toTOP` operators for bridging.

### Error: "ptcomputedat" instead of "computedat"
**Cause:** Using wrong param name for glslcopyPOP
**Fix:**
```python
# glslcopyPOP uses ptcomputedat, NOT computedat
glslcopy.par.ptcomputedat = 'my_shader_dat'
```

## Parameter Reference (Quick)

| Operator | Correct Param | Wrong Param |
|----------|--------------|-------------|
| glslPOP | `computedat` | ~~vertcomputedat~~ |
| glslPOP | `outputattrs` | ~~ptoutputattrs~~ |
| glsladvancedPOP | `computedat` | ~~vertcomputedat~~ |
| glsladvancedPOP | `ptoutputattrs` | ~~outputattrs~~ |
| glslcopyPOP | `ptcomputedat` | ~~computedat~~ |
| feedbackPOP | `inputmul` (Int) | ~~gain~~, ~~top~~ |
| feedbackTOP | `top` (OP ref) | — |
| glslTOP | `pixeldat` | ~~computedat~~ (for pixel shaders) |
| glslTOP | `vertexdat` | — (only on glslTOP) |
| glslTOP | `const0name/value` | — (only on glslTOP) |

## Verification Workflow
1. Create operators via `/exec`
2. Set params via `/exec` (NOT `/parameters/set` for DAT text)
3. Wire connections via `/exec`
4. Run `GET /verify?path=/container` — check `error_count == 0`
5. Wait 2 seconds, run again (async re-check)
6. If errors persist, check `o.errors()` for details

---

## Advanced Debugging Techniques

### Error Injection Test
Deliberately inject a syntax error to confirm the GLSL POP reads your DAT:
```python
# Step 1: Save original shader
original = op('/project1/my_system/my_shader_dat').text

# Step 2: Inject error
op('/project1/my_system/my_shader_dat').text = 'INVALID SYNTAX HERE'

# Step 3: Force cook and check
op('/project1/my_system/my_glslpop').cook(force=True)
import time; time.sleep(0.5)
errs = list(op('/project1/my_system/my_glslpop').errors())
# Should see: "ERROR: /project1/my_system/my_shader_dat:1"
# This confirms the GLSL POP is reading YOUR DAT

# Step 4: Restore original
op('/project1/my_system/my_shader_dat').text = original
op('/project1/my_system/my_glslpop').cook(force=True)
```

### Full System Diagnostic Script
```python
import json
def diagnose_system(container_path):
    c = op(container_path)
    if c is None:
        print(f'Container not found: {container_path}')
        return
    
    report = {
        'container': container_path,
        'operators': [],
        'errors': [],
        'connections': [],
        'glsl_shaders': {}
    }
    
    for n in c.findChildren():
        # Basic info
        info = {
            'name': n.name,
            'type': getattr(n, 'OPType', '?'),
            'path': n.path,
            'errors': list(n.errors()) if n.errors() else []
        }
        
        # Check GLSL-specific params
        if hasattr(n.par, 'computedat'):
            info['computedat'] = str(n.par.computedat.eval()) if n.par.computedat.eval() else 'NOT SET'
        if hasattr(n.par, 'outputattrs'):
            info['outputattrs'] = str(n.par.outputattrs.eval())
        if hasattr(n.par, 'ptoutputattrs'):
            info['ptoutputattrs'] = str(n.par.ptoutputattrs.eval())
        if hasattr(n.par, 'pixeldat'):
            info['pixeldat'] = str(n.par.pixeldat.eval()) if n.par.pixeldat.eval() else 'NOT SET'
        if hasattr(n.par, 'vertexdat'):
            info['vertexdat'] = str(n.par.vertexdat.eval()) if n.par.vertexdat.eval() else 'NOT SET'
        if hasattr(n.par, 'npasses'):
            info['npasses'] = int(n.par.npasses.eval())
        
        # Check connections
        try:
            for ic in n.inputConnectors:
                for conn in ic.connections:
                    report['connections'].append({
                        'from': conn.owner.path,
                        'to': n.path
                    })
        except:
            pass
        
        # Collect errors
        if info['errors']:
            report['errors'].append({
                'operator': n.path,
                'errors': [str(e) for e in info['errors']]
            })
        
        report['operators'].append(info)
    
    print(json.dumps(report, indent=2))
    return report

# Usage
diagnose_system('/project1/my_system')
```

### GLSL Compilation Error Patterns

#### Pattern 1: Missing uniform declaration
```glsl
// WRONG: using u_time without declaring it
void main() {
    float t = u_time; // ERROR: undeclared identifier
}

// CORRECT: declare the uniform
uniform float u_time;
void main() {
    float t = u_time; // OK
}
```

#### Pattern 2: Wrong noise function signature
```glsl
// WRONG: TDSimplexNoise expects vec4
float n = TDSimplexNoise(pos); // ERROR: no matching overload

// CORRECT: pass vec4 with time
float n = TDSimplexNoise(vec4(pos, u_time));
```

#### Pattern 3: Writing to wrong attribute
```glsl
// WRONG: glslPOP can't write to Cd (use glsladvancedPOP)
void main() {
    uint id = TDIndex();
    P[id] = TDIn_P(0, id);
    Cd[id] = vec4(1.0); // ERROR: attribute not found
}

// CORRECT: use glsladvancedPOP for Cd output
// Or only write P in glslPOP
```

#### Pattern 4: Missing TDIndex guard
```glsl
// WRONG: no bounds check
void main() {
    vec3 pos = TDIn_P(0, TDIndex()); // May read out of bounds
}

// CORRECT: guard against overflow
void main() {
    const uint id = TDIndex();
    if (id >= TDNumElements()) return;
    vec3 pos = TDIn_P(0, id);
}
```

#### Pattern 5: Wrong output swizzle (glslTOP)
```glsl
// WRONG: returning raw color
void main() {
    fragColor = texture(sTD2DInputs[0], vUV.st);
}

// CORRECT: use TDOutputSwizzle
void main() {
    fragColor = TDOutputSwizzle(texture(sTD2DInputs[0], vUV.st));
}
```

#### Pattern 6: Array index out of bounds
```glsl
// WRONG: accessing non-existent input
vec4 col = texture(sTD2DInputs[3], vUV.st); // ERROR if < 4 inputs

// CORRECT: check input count or use sTD2DInputs[0]
vec4 col = texture(sTD2DInputs[0], vUV.st);
```

#### Pattern 7: Integer vs Float in GLSL
```glsl
// WRONG: implicit float conversion
float x = 1; // May cause warning

// CORRECT: explicit float
float x = 1.0;
```

### Async Error Detection (RULE 2)
Errors may appear after the first cook. Always re-check:
```python
import json, time

# Force cook the entire container
op('/project1/my_system').cook(force=True)
time.sleep(2.0)  # Wait for async processing

# Re-check all operators
c = op('/project1/my_system')
errors = []
for n in c.findChildren():
    e = list(n.errors()) if n.errors() else []
    if e:
        errors.append({'name': n.name, 'errors': [str(x) for x in e]})

if errors:
    print(f'Async errors found: {len(errors)}')
    for err in errors:
        print(f"  {err['name']}: {err['errors']}")
else:
    print('All operators clean after async re-check')
```

### Visual Debug: Error Injection Script
```python
import json
def inject_and_verify(container_path, glsl_name, dat_name, bad_code):
    """Inject bad GLSL code, verify error appears, restore original."""
    dat_path = f'{container_path}/{dat_name}'
    glsl_path = f'{container_path}/{glsl_name}'
    
    # Save original
    original = op(dat_path).text
    
    # Inject error
    op(dat_path).text = bad_code
    op(glsl_path).cook(force=True)
    import time; time.sleep(0.5)
    
    # Check error
    errs = list(op(glsl_path).errors())
    has_error = len(errs) > 0
    error_msg = str(errs[0]) if errs else 'none'
    
    # Restore
    op(dat_path).text = original
    op(glsl_path).cook(force=True)
    
    return {'injected_error_detected': has_error, 'error_message': error_msg}

# Usage
result = inject_and_verify(
    '/project1/my_system',
    'my_glslpop',
    'my_shader_dat',
    'THIS IS INVALID GLSL CODE'
)
print(json.dumps(result))
# Expected: {"injected_error_detected": true, "error_message": "ERROR: ..."}
```

### Debugging Checklist
- [ ] Verify `computedat` points to correct textDAT name
- [ ] Verify textDAT contains valid GLSL code
- [ ] Verify `outputattrs` includes attributes written in shader
- [ ] Verify all uniforms are declared (`uniform float u_time;`)
- [ ] Verify `TDIndex()` is used correctly
- [ ] Verify `TDSimplexNoise()` receives `vec4` (not `vec3`)
- [ ] Force cook and wait 2 seconds for async errors
- [ ] Check `o.errors()` for specific error messages
- [ ] If writing Cd, ensure using `glsladvancedPOP` (not `glslPOP`)
- [ ] For glslTOP, use `TDOutputSwizzle()` in fragment shader
