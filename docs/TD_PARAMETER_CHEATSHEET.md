# TouchDesigner Parameter Cheat-Sheet

Quick reference for all operator parameters by family. Empirically verified via MCP server.

---

## 🔴 POP (Point Operators)

### glslPOP
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `computedat` | String | — | Name of textDAT with GLSL compute shader |
| `outputattrs` | Menu | `'P'` | Output attributes (`'P'`, `'P Cd'`, `'P N'`) |
| `npasses` | Int | 1 | Multi-pass count (1-10) |
| `inputsmooth` | Int | 0 | Input smoothing (0-10) |
| `numelems` | Int | 100 | Number of elements to generate |
| `simplexnoise` | Toggle | 0 | Enable simplex noise in shader |

### glsladvancedPOP
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `computedat` | String | — | Name of textDAT with GLSL compute shader |
| `ptoutputattrs` | Menu | `'P'` | Point output attributes (`'P'`, `'*'`) |
| `primoutputattrs` | Menu | — | Primitive output attributes |
| `vertoutputattrs` | Menu | — | Vertex output attributes |
| `npasses` | Int | 1 | Multi-pass count |
| `extraout` | Toggle | 0 | Enable extra output attribute |
| `extraout0name` | String | — | Name of extra output attribute |
| `extraout0ptattrs` | Menu | — | Extra output point attributes |
| `maxpoints` | Int | 10000 | Max points for topology modification |
| `maxtriangles` | Int | 10000 | Max triangles |

### glslcopyPOP
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `ptcomputedat` | String | — | Point compute shader DAT (**NOT** `computedat`) |
| `ptoutputattrs` | Menu | `'P'` | Point output attributes |
| `vertcomputedat` | String | — | Vertex compute shader DAT |
| `primcomputedat` | String | — | Primitive compute shader DAT |
| `dimension` | Menu | 3 | Point dimension (2D/3D) |
| `ncy` | Int | 1 | Copy count Y |

### boxPOP
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `sizex` | Float | 1.0 | Size X |
| `sizey` | Float | 1.0 | Size Y |
| `sizez` | Float | 1.0 | Size Z |
| `depth` | Int | 5 | Subdivision depth |

### spherePOP
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `radx` | Float | 1.0 | Radius X |
| `rady` | Float | 1.0 | Radius Y |
| `radz` | Float | 1.0 | Radius Z |
| `rows` | Int | 10 | Row divisions |
| `cols` | Int | 10 | Column divisions |

### circlePOP
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `radx` | Float | 1.0 | Radius X |
| `rady` | Float | 1.0 | Radius Y |
| `divs` | Int | 60 | Divisions |

### gridPOP
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `sizex` | Float | 1.0 | Size X |
| `sizey` | Float | 1.0 | Size Y |
| `sizez` | Float | 1.0 | Size Z |
| `rows` | Int | 10 | Row divisions |
| `cols` | Int | 10 | Column divisions |
| `planex` | Toggle | 0 | Orient to X plane |
| `planey` | Toggle | 1 | Orient to Y plane |
| `planez` | Toggle | 0 | Orient to Z plane |

### feedbackPOP
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `inputmul` | **Int** | 1 | Feedback multiplier (**NOT** Float, **NOT** gain) |
| `target` | OP | — | Target operator (auto-set) |

⚠️ **feedbackPOP has NO `top` parameter** — only `feedbackTOP` has `top`.

### transformPOP
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `tx` | Float | 0 | Translate X |
| `ty` | Float | 0 | Translate Y |
| `tz` | Float | 0 | Translate Z |
| `rx` | Float | 0 | Rotate X |
| `ry` | Float | 0 | Rotate Y |
| `rz` | Float | 0 | Rotate Z |
| `sx` | Float | 1 | Scale X |
| `sy` | Float | 1 | Scale Y |
| `sz` | Float | 1 | Scale Z |

### nullPOP
No user-configurable parameters. Used as output terminator.

---

## 🟢 TOP (Texture Operators)

### glslTOP
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `pixeldat` | String | — | Pixel/fragment shader DAT |
| `vertexdat` | String | — | Vertex shader DAT |
| `computedat` | String | — | Compute shader DAT |
| `npasses` | Int | 1 | Intra-frame multi-pass (1-10) |
| `mode` | Menu | — | Execution mode |
| `const0name` | String | — | Uniform 0 name (Sequence param) |
| `const0value` | Float | 0 | Uniform 0 value |
| `const1name` | String | — | Uniform 1 name |
| `const1value` | Float | 0 | Uniform 1 value |
| `const2name` | String | — | Uniform 2 name |
| `const2value` | Float | 0 | Uniform 2 value |

⚠️ **`const0name/value` are Sequence params** — they reset to 0 immediately after being set. Use `/exec` to set them atomically.

### noiseTOP
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `amp` | Float | 1.0 | Amplitude |
| `period` | Float | 1.0 | Period |
| `offset` | Float | 0 | Offset |
| `monochrome` | Toggle | 0 | Monochrome output |
| `resolutionw` | Int | 256 | Resolution width |
| `resolutionh` | Int | 256 | Resolution height |

### feedbackTOP
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `top` | OP ref | — | Downstream nullTOP to capture from |
| `target` | OP | — | Target operator |

⚠️ **feedbackTOP HAS `top` parameter** — must set to downstream nullTOP to close the loop.

### compositeTOP
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `operation` | Menu | `add` | Composite operation |

Inputs: `[0]=topA, [1]=topB, [2]=topC` — use `connect(dst, input_index)`.

### nullTOP
No user-configurable parameters. Used as output terminator.

---

## 🟡 CHOP (Channel Operators)

### noiseCHOP
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `amp` | Float | 1.0 | Amplitude |
| `period` | Float | 1.0 | Period |
| `offset` | Float | 0 | Offset |

### lfoCHOP
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `frequency` | Float | 1.0 | Frequency (Hz) |
| `amplitude` | Float | 1.0 | Amplitude |
| `offset` | Float | 0 | Offset |
| `type` | Menu | `sine` | Waveform type |

### timerCHOP
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `duration` | Float | 1.0 | Duration (seconds) |

### constantCHOP
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `value` | Float | 0 | Constant value |

---

## 🟠 SOP (Surface Operators)

### boxSOP
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `sizex` | Float | 1.0 | Size X |
| `sizey` | Float | 1.0 | Size Y |
| `sizez` | Float | 1.0 | Size Z |

### sphereSOP
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `radx` | Float | 1.0 | Radius X |
| `rady` | Float | 1.0 | Radius Y |
| `radz` | Float | 1.0 | Radius Z |

---

## 🟣 DAT (Data Operators)

### textDAT
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `text` | String | — | Text content (set via `.text` property) |

⚠️ **Set text via `op.path.text = "..."` not via `/parameters/set`**.

### tableDAT
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| — | — | — | Data stored in rows/columns |

---

## ⚪ MAT (Material Operators)

### phongMAT
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `diffuse_r` | Float | 0.8 | Diffuse red |
| `diffuse_g` | Float | 0.8 | Diffuse green |
| `diffuse_b` | Float | 0.8 | Diffuse blue |
| `specular_r` | Float | 1.0 | Specular red |
| `specular_g` | Float | 1.0 | Specular green |
| `specular_b` | Float | 1.0 | Specular blue |
| `shininess` | Float | 40 | Shininess |

### pbrMAT
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `basecolor_r` | Float | 0.8 | Base color red |
| `basecolor_g` | Float | 0.8 | Base color green |
| `basecolor_b` | Float | 0.8 | Base color blue |
| `metallic` | Float | 0 | Metallic |
| `roughness` | Float | 0.5 | Roughness |

### glslMAT
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `vs` | String | — | Vertex shader DAT |
| `ps` | String | — | Pixel shader DAT |

---

## 🔵 COMP (Component Operators)

### baseCOMP
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| — | — | — | Container for operators |

### geometryCOMP
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `material` | OP | — | Material assignment |

---

## Connection Rules

| From | To | Valid? | Method |
|------|----|--------|--------|
| POP | POP | ✅ | `outputConnectors[0].connect(dst)` |
| TOP | TOP | ✅ | `outputConnectors[0].connect(dst)` |
| CHOP | CHOP | ✅ | `outputConnectors[0].connect(dst)` |
| SOP | SOP | ✅ | `outputConnectors[0].connect(dst)` |
| POP | TOP | ❌ | Use bridging operators |
| TOP | POP | ❌ | Use bridging operators |

## Cross-Family Bridging

| From | To | Bridge Operator |
|------|----|-----------------|
| POP → TOP | `geometryCOMP` renders POP to TOP |
| TOP → POP | `audioDeviceInCHOP` → CHOP → POP |
| CHOP → TOP | `CHOP to TOP` |
| TOP → CHOP | `TOP to CHOP` |

## GLSL Shader Quick Reference

### glslPOP Boilerplate
```glsl
uniform float u_time;
void main() {
    const uint id = TDIndex();
    if (id >= TDNumElements()) return;
    vec3 pos = TDIn_P(0, id);
    P[id] = pos; // Your displacement here
}
```

### glslTOP Pixel Shader
```glsl
out vec4 fragColor;
uniform float u_time;
void main() {
    vec4 color = texture(sTD2DInputs[0], vUV.st);
    fragColor = TDOutputSwizzle(color);
}
```

### glslTOP Vertex Shader
```glsl
uniform float u_time;
void main() {
    vec3 pos = P;
    pos.y += sin(pos.x * 3.0 + u_time) * 0.2;
    gl_Position = TDWorldToProj(TDModelToWorld(pos));
    uv = uvable;
    color = CD;
}
```

### TD Built-in Functions
| Function | Description |
|----------|-------------|
| `TDIndex()` | Current thread/point ID |
| `TDNumElements()` | Total point count |
| `TDIn_P(0, id)` | Read position from input 0 |
| `TDSimplexNoise(vec4(pos, time))` | 3D+time simplex noise |
| `TDOutputSwizzle(vec4)` | Correct output swizzle (glslTOP) |
| `uTDPass` | Current pass index (glslTOP multi-pass) |
| `uTDOutputInfo.res` | Output resolution (glslTOP) |
| `sTD2DInputs[0]` | Input texture (glslTOP) |
| `TDWorldToProj(vec3)` | World to projection (vertex shader) |
| `TDModelToWorld(vec3)` | Model to world (vertex shader) |

---

*Last updated: July 29, 2026*
*Source: Empirically verified via MCP server tests*
