# POP Parameter Mapping (Empirically Verified)

This file documents the actual TD parameter names for POP operators, verified against live TD on port 44444. Parameter names listed as "doc says" refer to common TouchDesigner documentation or community knowledge.

## boxPOP

| Doc name | Actual TD name | Type | Notes |
|----------|---------------|------|-------|
| size | sizex | XYZW | The XYZW type accepts 3 floats |
| divsx | depth | Int | Controls subdivision depth |

## noisePOP

| Doc name | Actual TD name | Type | Notes |
|----------|---------------|------|-------|
| freq0 | noisesize | **Menu** | NOT a float! Value is a menu index string ('3', '2', etc.) |
| (no doc name) | period | Float | The actual float noise-size control. Default ~3.0 |
| rough | harmon | **Int** | NOT a float! Truncates float values. Default 1 |

**Key finding (2026-06-17):** `noisesize` is a Menu parameter, not a float. Attempting `par.noisesize = 2.0` will set a menu index, not a noise size. Use `period` for float noise-size control. `harmon` is an Int — setting `harmon = 0.3` truncates to 0.

## particlePOP

| Doc name | Actual TD name | Type | Notes |
|----------|---------------|------|-------|
| rate | birthrate | Float | Particle birth rate per second |
| lifeexpect / lifetime | life | Float | Particle lifespan in seconds |
| maxCount | maxparticles | Int | Maximum particle count |
| gravity | **does NOT exist** | — | No gravity parameter! Use initvelocityy and damping instead |

**Key finding:** `gravity` parameter does NOT exist on particlePOP. Use `initvelocityy` (Y-axis initial velocity, XYZW type) and `damping` (Float) for gravity-like effects.

## circlePOP

| Doc name | Actual TD name | Type | Notes |
|----------|---------------|------|-------|
| radius | radx / rady | Float | radx=radius X, rady=radius Y |
| divs | divs | Int | Number of segments |

## pointPOP

| Doc name | Actual TD name | Type | Notes |
|----------|---------------|------|-------|
| count | createp | Toggle | No count param; createp toggles point creation |

## glslPOP / glslcopyPOP

| Parameter | glslPOP (td.glslPOP) | glslcopyPOP (td.glslcopyPOP) |
|-----------|---------------------|------------------------------|
| compute shader DAT | computedat | **ptcomputedat** |
| output attributes | outputattrs | **ptoutputattrs** |

**Key finding:** glslcopyPOP uses `pt`-prefixed parameter names, NOT the same as glslPOP!

## feedbackPOP

| Doc name | Actual TD name | Type | Notes |
|----------|---------------|------|-------|
| gain | inputmul | **Int** | NOT Float! Default=1, range 0-1 (but stored as Int). Setting 0.8 truncates — only integer values work. Verified via live TD parameter read-back. |
| (other params) | preroll | Float | 0.0 default |
| (other params) | bypass | Toggle | Bypass the feedback loop |

## Full parameter list sources

To inspect all parameters on any operator:
```python
# Via TD exec:
[p.name for p in op('/project1/container/opname').pars()]

# As dict:
{p.name: op.par[p.name].val for p in op('/project1/container/opname').pars()}
```

## spherePOP (Empirically verified 2026-06-17)

| Doc name | Actual TD name | Type | Notes |
|----------|---------------|------|-------|
| Type | type | Menu | Geodesic/Grid/Tetrahedron/Shared Points at Poles |
| Orientation | orient | Menu | X Axis/Y Axis/Z Axis |
| Radius X | radx | Float | Default 1.0 |
| Radius Y | rady | Float | Default 1.0 |
| Radius Z | radz | Float | Default 1.0 |
| Frequency | freq | Int | Geodesic subdivision level. Default 3 |
| Fuse | fuse | Toggle | Default True |
| Columns | cols | Int | Grid mode longitude. Default 12 |
| Rows | rows | Int | Grid mode latitude. Default 8 |
| Normal | normal | Menu | None/Point/Vertex |
| Texture | texture | Menu | None/Point/Vertex |

## transformPOP (Empirically verified 2026-06-17)

| Doc name | Actual TD name | Type | Notes |
|----------|---------------|------|-------|
| Mode | mode | Menu | Transform Geometry/Attribute/Attribute Scope as Position/Attribute Scope as Vector |
| Transform Order | xord | Menu | SRT/STR/RST/RTS/TSR/TRS |
| Rotate Order | rord | Menu | XYZ/XZY/YXZ/YZX/ZXY/ZYX |
| Translate X | tx | Float | Default 0 |
| Translate Y | ty | Float | Default 0 |
| Translate Z | tz | Float | Default 0 |
| Rotate X | rx | Float | Default 0 |
| Rotate Y | ry | Float | Default 0 |
| Rotate Z | rz | Float | Default 0 |
| Scale X | sx | Float | Default 1 |
| Scale Y | sy | Float | Default 1 |
| Scale Z | sz | Float | Default 1 |
| Uniform Scale | scale | Float | Default 1 |

## trailPOP (Empirically verified 2026-06-17)

| Doc name | Actual TD name | Type | Notes |
|----------|---------------|------|-------|
| Active | active | Toggle | Default True |
| Always Cook | alwayscook | Toggle | Default False |
| Length | length | Int | Trail history length. Default 30 |
| Increment | inc | Float | Default 0.01 |
| Surface Type | surftype | Menu | Options vary |
| Closed | closed | Toggle | Default False |
| Translate X | tx | Float | Default 0 |
| Translate Y | ty | Float | Default 0 |
| Translate Z | tz | Float | Default 0 |
| Rotate X | rx | Float | Default 0 |
| Rotate Y | ry | Float | Default 0 |
| Rotate Z | rz | Float | Default 0 |
| Scale X | sx | Float | Default 1 |
| Scale Y | sy | Float | Default 1 |
| Scale Z | sz | Float | Default 1 |
