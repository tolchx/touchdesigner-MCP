# TouchDesigner Network Patterns

## TOP Chains (Image Processing)

### Basic generator → filter → output
```
noiseTOP → blurTOP → compositeTOP → nullTOP
```
Create: `noiseTOP`, `blurTOP`, `compositeTOP`, `nullTOP`
Wire: noise out → blur in, blur out → composite in1, composite out → null in

### Webcam → effects → output
```
webcamTOP → displaceTOP → levelTOP → outTOP
```

### Feedback loop
```
constantTOP → feedbackTOP → levelTOP → nullTOP
```
Create: `constantTOP`, `feedbackTOP`, `levelTOP`, `nullTOP`
parameters: feedbackTOP.Feedback → levelTOP out

## CHOP Chains (Signal Processing)

### Audio reactive
```
audiofileinCHOP → mathCHOP → audioBandEQ → nullCHOP
```

### LFO → parameters
```
lfoCHOP → nullCHOP
```
Then bind lfoCHOP channel to a TOP parameter via export.

## SOP Chains (3D)

### Geometry pipeline
```
sphereSOP → transformSOP → blendSOP → renderTOP
```

## POP Chains (Particle Operators)

### Basic POP pipeline
```
boxPOP → noisePOP → particlePOP → nullPOP
```
Create: `boxPOP`, `noisePOP`, `particlePOP`, `nullPOP`
Wire: box out → noise in, noise out → particle in, particle out → null in
Position: nodes at 300px spacing (nodeX: -300, 0, 300, 600; nodeY: 0 for all)

### Empirically Verified POP Parameter Names
Discovered via live TD HTTP API integration tests — documented names differ from actual par names:

| Documented | Actual Par | Operator | Notes |
|---|---|---|---|
| size | sizex | boxPOP | `boxPOP.par.size` fails, `sizex` works |
| divsx/res | depth | boxPOP | Subdivisions on X axis |
| freq0 | noisesize | noisePOP | Noise frequency/scale |
| rough | harmon | noisePOP | Noise roughness/harmonics |
| lifeexpect | life | particlePOP | Particle lifetime in seconds |
| lifetime | life | particlePOP | Same par, different docs |
| rate | birthrate | particlePOP | Particles born per second |
| maxCount | maxparticles | particlePOP | Maximum particle count |
| gravity | *(not found)* | particlePOP | Does NOT exist. Use `initvelocityx/y/z` or `damping` for physics |
| turbulence | *(not found)* | particlePOP | Does NOT exist as a parameter |
| radius | radx/rady | circlePOP | `circlePOP.par.radius` fails. Use `radx`/`rady` |
| divisions | divs | circlePOP | Circle subdivision count |
| count | createp | pointPOP | `pointPOP.par.count` fails. `createp` is a toggle |
| outputattrs | ptoutputattrs | glslcopyPOP | glslPOP uses `outputattrs`, glslcopyPOP uses `ptoutputattrs` |
| computedat | ptcomputedat | glslcopyPOP | glslPOP uses `computedat`, glslcopyPOP uses `ptcomputedat` |
| gain | inputmul | feedbackPOP | `feedbackPOP.par.gain` fails. Use `inputmul` |
| feedback | *(not found)* | feedbackPOP | Does NOT exist as a parameter toggle |

### Cross-Family Connection Limitations
- POP→CHOP direct connections fail: `particlePOP.outputConnectors[0].connect(noiseCHOP)` → "Invalid number or type of arguments"
- POP→TOP and CHOP→TOP same issue
- Cross-family bridging requires `toCHOP`/`toTOP` bridge operators which may not be accessible as `td.PascalCase` constants
- `noisePOP` has only ONE input connector — connecting multiple sources overwrites previous connections
- `glslcopyPOP` requires `ptcomputedat` + `ptoutputattrs` set AFTER creation (not in creation params)

## Common Patterns

### Row of generators feeding a single filter
```
noise1 ─┐
noise2 ─┤
noise3 ─┤  composite
        │
        ├→ compositeTOP → nullTOP
        │
blur ───┤
```

### Chain with branching
```
noise → blur → composite → level → null
                ↓
           brightness → null
```

## Parameter Tips
- `noiseTOP`: `amp` (amplitude), `freq` (frequency), `phase`
- `blurTOP`: `radius` (blur amount)
- `levelTOP`: `low`, `high`, `gamma`
- `compositeTOP`: `operation` (0=over, 1=max, 2=multiply, etc.)
- `lfoCHOP`: `rate`, `amplitude`, `offset`
- `mathCHOP`: `op` (0=add, 1=subtract, 2=multiply, etc.), `value`

## Error Checking
After building any network:
1. Verify all connections with `/connections`
2. Check for errors: `print([n.error for n in op('/project1').findChildren(tds.TDERROR)])`
3. Check cook times: `print([(n, n.cookTime) for n in op('/project1').findChildren()])`
