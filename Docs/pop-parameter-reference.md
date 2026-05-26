# Parameter Experiments — POP Systems Log

## Discovered Parameter Names (verified against live TD)

### noisePOP
- `amp0` — Amplitude (Float, default 0.1)
- `period` — Noise period (Float, default 1.0)
- `seed` — Random seed (Float, default 1.0)
- `type` — Noise type (Menu: simplex4d, perlin4d, sparse, alligator, random...)
- `harmon` — Harmonics (Int, default 2)
- `gain` — Harmonic gain (Float, default 0.7)

### mathPOP
- `inputattrscope` — Target attribute (StrMenu, default "P")
- `preoper` — Pre-operation (Menu: none, mult, add, min, max...)
- `mult0` — Multiply value (Float, default 1.0)
- `postadd0` — Post-add value (Float, default 0.0)
- `postoper` — Post-operation (Menu)

### limitPOP
- `inputattrscope` — Target attribute (StrMenu, default "P")
- `mintype0` — Min type (Menu: off, Range)
- `maxtype0` — Max type (Menu: off, Range)
- `min0` — Min value (Float, default -1.0)
- `max0` — Max value (Float, default 1.0)

### deletePOP
- `invert` — Delete mode (Menu: delete, keep)
- `entity` — Entity type (Menu: point, prim, vert)
- `attr0inattr` — Attribute to test (StrMenu, default "")
- `attr0func` — Comparison (Menu: lt, gt, eq, neq...)
- `attr0value` — Threshold value (Float, default 0.0)

### attributePOP
- `attr0name` — Attribute name (Menu: custom, P, N, Cd, uv...)
- `attr0customname` — Custom name (Str, default "")
- `attr0type` — Type (Menu: float, vector, color, int)
- `attr0value0` — Default value (Float, default 0.0)

### copyPOP
- `ncy` — Number of copies on Y (Int, default 1)
- `tx`, `ty`, `tz` — Translate per copy (Float, default 0.0)
- `sx`, `sy`, `sz` — Scale per copy (Float, default 1.0)
- NOTE: `ncx` does NOT exist. Use `ncy` + `tx` for X copies.

### blendPOP
- `blendtype` — Blend mode (Menu: off, add, mult, max, min, average...)
- `input0weight` — Input weight (Float, default 1.0)
- `pointattrscope` — Point attrs to blend (StrMenu, default "*")

### feedbackPOP
- `play` — Play toggle (Toggle, default True)
- `preroll` — Preroll frames (Float, default 0.0)
- `inputmul` — Input multiplier (Int, default 1)

### cachePOP
- `cachesize` — Cache size in frames (Int, default 32)
- `active` — Active toggle (Toggle, default True)
- `step` — Step size (Float, default 1.0)

## Errors Found and Fixed

| Error | Cause | Fix |
|-------|-------|------|
| `Too many input components` | deletePOP can't handle large point counts | Remove deletePOP from chain OR reduce copy count |
| `'td.ParCollection' has no attribute 'ncx'` | copyPOP parameter name is `ncy` only | Use `ncy` + `tx` for X copies |
| `mintype0 stays "off"` | limitPOP menu values are enum strings | Use `"Range"` not `"const"` |

## Working Parameter Combinations

### Noise Displacement (visual deformation)
```
noisePOP: amp0=0.5, period=2.0, seed=42
→ spherePOP → noisePOP → nullPOP
```

### Math Scale + Offset (point cloud expansion)
```
mathPOP: preoper=mult, mult0=2.0, postadd0=0.5
→ spherePOP → mathPOP → nullPOP
```

### Copy + Translate + Limit (grid array)
```
copyPOP: ncy=3, ty=1.5
limitPOP: mintype0=Range, maxtype0=Range, min0=-1, max0=1
→ spherePOP → copyPOP → limitPOP → nullPOP
```

### Attribute + Math + Blend (custom attribute manipulation)
```
attributePOP: attr0name=custom, attr0customname=mysize, attr0value0=0.3
mathPOP: mult0=3.0
blendPOP: blendtype=add
→ gridPOP → noisePOP → copyPOP → attributePOP → mathPOP → blendPOP → limitPOP → nullPOP
```

### Feedback + Blend Loop (trail effect)
```
feedbackPOP: preroll=1, inputmul=2
blendPOP: blendtype=add, input0weight=0.7
noisePOP: amp0=0.8, period=0.5
→ spherePOP → noisePOP → feedbackPOP → blendPOP → nullPOP
```
