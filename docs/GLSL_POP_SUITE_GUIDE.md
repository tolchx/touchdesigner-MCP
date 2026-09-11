# GLSL POP Comprehensive Test Suite — Guide

## Overview

This suite tests GLSL POP systems with **6 complexity levels**, verifying that every shader DAT compiles without errors and all connections are valid. It exercises the full range of TD GLSL POP features.

**Test file:** `toe/src/test_live_td_glslpop_suite.py`
**Last run:** 135/135 PASS (0 failures)

---

## Complexity Levels

### Level 1 — Basic glslPOP Displacement (4 nodes)
```
boxPOP → textDAT(shader) → glslPOP → nullPOP
```
- **Shader:** Simple sin-wave displacement on `P`
- **Tests:** Basic `glslPOP` with `computedat` + `outputattrs='P'`
- **Key params:** `boxPOP.sizex=1.5`, `boxPOP.depth=8`

### Level 2 — glsladvancedPOP with Color Output (4 nodes)
```
spherePOP → textDAT(shader) → glsladvancedPOP → nullPOP
```
- **Shader:** P displacement + `Cd[id]` color output (height-based)
- **Tests:** `glsladvancedPOP` with `ptoutputattrs='P'`
- **Key params:** `spherePOP.radx=1.0`, `spherePOP.rows=12`

### Level 3 — Multi-Attribute Spiral Displacement (4 nodes)
```
boxPOP → textDAT(shader) → glsladvancedPOP → nullPOP
```
- **Shader:** Spiral displacement on P + color by distance
- **Tests:** Advanced GLSL math (atan, length, trigonometry)
- **Key params:** `boxPOP.sizex=2.0`, `boxPOP.depth=10`

### Level 4 — Feedback Loop Temporal Accumulation (5 nodes)
```
boxPOP → textDAT(shader) → glslPOP → feedbackPOP → nullPOP
```
- **Shader:** Organic drift that accumulates each frame
- **Tests:** `feedbackPOP.inputmul=1` (Int param, NOT Float)
- **Key params:** `feedbackPOP.inputmul=1`, `boxPOP.sizex=1.0`

### Level 5 — Multi-Pass glslPOP (5 nodes)
```
circlePOP → textDAT(shader) → glslPOP(npasses=3) → transformPOP → nullPOP
```
- **Shader:** Iterative displacement applied 3 times per frame
- **Tests:** `glslPOP.npasses=3` (intra-frame multi-pass)
- **Key params:** `glslPOP.npasses=3`, `circlePOP.divs=48`

### Level 6 — Dual Parallel Chains (7 nodes)
```
Chain A: boxPOP → glslPOP(swirl) → nullPOP
Chain B: spherePOP → glsladvancedPOP(color) → nullPOP
```
- **Shaders:** Swirl displacement (A) + color by position (B)
- **Tests:** Two independent GLSL POP chains in parallel
- **Key params:** `boxPOP.sizex=1.5`, `spherePOP.radx=1.2`

---

## Parameter Reference (Empirically Verified)

| Operator | Parameter | Type | Description |
|----------|-----------|------|-------------|
| `glslPOP` | `computedat` | String | Name of shader DAT |
| `glslPOP` | `outputattrs` | Menu | Output attributes (e.g. `'P'`) |
| `glslPOP` | `npasses` | Int | Multi-pass count |
| `glsladvancedPOP` | `computedat` | String | Name of shader DAT |
| `glsladvancedPOP` | `ptoutputattrs` | Menu | Point output attrs (e.g. `'P'`, `'*'`) |
| `feedbackPOP` | `inputmul` | Int | Feedback multiplier (NOT Float!) |

---

## GLSL Shader Patterns

### Basic P Displacement (Level 1)
```glsl
uniform float u_time;
void main() {
    uint id = TDIndex();
    vec3 pos = TDIn_P(0, id);
    float wave = sin(u_time * 0.8 + pos.x * 3.0 + pos.y * 2.0) * 0.15;
    P[id] = pos + vec3(wave, wave * 0.5, 0.0);
}
```

### P + Cd Color Output (Level 2)
```glsl
uniform float u_time;
void main() {
    uint id = TDIndex();
    vec3 pos = TDIn_P(0, id);
    float n = sin(u_time + pos.x * 2.0 + pos.y * 1.5) * 0.1;
    P[id] = pos + vec3(n * 0.5, n, 0.0);
    Cd[id] = vec4(pos.y * 0.3 + 0.5, 0.6, 1.0 - pos.y * 0.3, 1.0);
}
```

### Spiral Displacement (Level 3)
```glsl
uniform float u_time;
void main() {
    uint id = TDIndex();
    vec3 pos = TDIn_P(0, id);
    float angle = atan(pos.z, pos.x) + u_time * 0.5;
    float rad = length(pos.xz);
    pos.x = cos(angle) * rad;
    pos.z = sin(angle) * rad;
    pos.y += sin(u_time + id * 0.01) * 0.15;
    P[id] = pos;
    float d = length(pos);
    Cd[id] = vec4(d * 0.2, 0.8 - d * 0.1, 0.5 + d * 0.1, 1.0);
}
```

### Feedback-Aware Shader (Level 4)
```glsl
// feedbackPOP.inputmul controls temporal accumulation
uniform float u_time;
void main() {
    uint id = TDIndex();
    vec3 pos = TDIn_P(0, id);
    float drift = sin(u_time * 0.3 + pos.x * 1.5 + pos.z * 2.0) * 0.08;
    pos.x += drift;
    pos.z += cos(u_time * 0.4 + pos.y * 1.8) * 0.06;
    pos.y += sin(u_time * 0.2 + id * 0.005) * 0.04;
    P[id] = pos;
}
```

### Multi-Pass Shader (Level 5)
```glsl
uniform float u_time;
void main() {
    uint id = TDIndex();
    vec3 pos = TDIn_P(0, id);
    float wave = sin(pos.x * 3.0 + pos.z * 2.1 + u_time) * 0.1;
    pos.y += wave;
    P[id] = pos;
}
```

---

## Test Structure

Each level follows the same pattern:
1. **Create** source POP → textDAT(shader) → glslPOP/glsladvancedPOP → output POP
2. **Write** GLSL shader text to the DAT
3. **Set** computedat + output attributes
4. **Wire** connections via `outputConnectors[0].connect()`
5. **Verify** zero errors on ALL operators (immediate + async RULE 2)

---

## Common Pitfalls

| Issue | Fix |
|-------|-----|
| `feedbackPOP.inputmul` not persisting | Use Int (e.g. `1`), NOT Float (`0.85`) |
| `glsladvancedPOP` needs `ptoutputattrs` | Use `ptoutputattrs='P'` (NOT `outputattrs`) |
| Cross-family connections fail | POP→TOP doesn't work; use nullPOP not nullTOP |
| `const0name`/`const0value` only on glslTOP | Not available on glslPOP |
| `torusPOP` has no `radx2` param | Use `radx2r` or omit |

---

## Running

```bash
# Standalone
cd toe/src && python test_live_td_glslpop_suite.py

# Via orchestrator (all 15 tests)
cd toe/src && python test_orchestrator_massive.py --skip-unknown
```

---

## Related Tests

| Test | Focus | Nodes |
|------|-------|-------|
| `test_live_td_pop_advanced2.py` | glslPOP + glsladvancedPOP + parallel chains | 17 |
| `test_live_td_glsl_extreme.py` | glsladvancedPOP prim + npasses + vertex + extraout | 18 |
| `test_live_td_glsl_advanced.py` | GLSL TOP fragments + feedback loops | 24 |
| `test_live_td_pingpong_feedback.py` | Gray-Scott RD + ping-pong blur | 14 |
| `test_live_td_glsl_npasses.py` | Intra-frame multi-pass GLSL TOP | 16 |
