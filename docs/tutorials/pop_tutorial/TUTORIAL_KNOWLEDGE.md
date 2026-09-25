# GLSL for POPs — tutorial knowledge applied to this repo

Source: playlist "GLSL for POPs in TouchDesigner" (Luke Heckmann), 8 videos, 6 available,
transcribed in this folder (`INDEX.md`). This file distills what the tutorial teaches that is
NEW or CORRECTIVE for our MCP knowledge base, cross-checked against the live TD build
2025.32460 on 2026-09-25.

## Authoritative GLSL-POP builtins (from official docs + live compile tests)

| builtin | scope | notes |
|---|---|---|
| `TDIndex()` | glslPOP, glsladvancedPOP | 1d thread index; undefined in manual 3d dispatch |
| `TDNumElements()` | glslPOP | number of REQUESTED threads — takes NO input index (compile error if given one) |
| `TDInputNumPoints(inputIndex)` | glslPOP | number of points of a given input; also `TDInputNumPrims/Verts`; **this is what you loop over for another input** |
| `TDInputNumElements()` | glslPOP only | wrapper for NumPoints/Prims/Verts per selected attribute class |
| `TDIn_Attrib(input, elem)` | glslPOP | read any attribute of any input, e.g. `TDIn_P(0u, id)`, `TDIn_Cd(1u, w)` |
| `TDInPoint_/TDInVert_/TDInPrim_Attrib(...)` | glslPOP/advanced | read a different attribute CLASS than the selected one |
| `TDNumPoints()` | glslcopyPOP point shader | output point count; NOT `TDNumElements` |
| `TDInputNumPoints()` | glslcopyPOP | source-geo point count (no arg) |
| `TDCopyIndex()` | glslcopyPOP | current copy number |
| `TDTemplate_Attrib(elem)` | glslcopyPOP | read template input (input 2) |
| `oTDPoint_Attrib[id]` | glsladvancedPOP | output arrays carry class prefix (`oTDPoint_P`, ...) |
| `TDInputNumPoints_OutputName()` | glsladvanced extra outputs | per-output element counts |

Verified live today: shaders bodies must be inside `void main() { ... }` (bare global code
compiles to "global const initializers must be constant"); `ID` custom attribute created via
Create Attributes (`attr0name='Custom'`, `attr0customname='ID'`, `attr0numcomps=1`) is a
FLOAT attribute — `ID[id] = uint(id)` compiles but stores float semantics; write
`ID[id] = float(id)`.

## Per-lesson takeaways (transcripts in this folder)

- **Lesson 0 (29:04, fully free on YouTube)**: attributes are THE concept; POPS are
  "SOPs living on the GPU, each POP is a compute shader"; Create Attributes vs Output
  Attributes (write needs declaration; read needs nothing); uniforms declared in
  parameter pages, NOT in code; `TDIn_P(inputIndex, elementIndex)` to read any element
  of any input; texture lookups via samplers (`s_texture` + `texelFetch`, size via
  `textureSize(s_texture, 0)` — avoid hardcoded resolutions; author prefers manual
  id→UV mapping over lookupattributePOP for animated point clouds).
- **Lesson 2 teaser (1:21)**: particle systems from scratch — full video is Patreon-only;
  nothing actionable beyond confirmation of approach.
- **Lesson 3 teaser (5:43)**: interference patterns via multi-input GLSL: one POP holds
  wave specs (N points = N waves with period/amp/phase/pos attributes), another POP's
  shader loops `for w in 0..TDInputNumPoints(1)` computing
  `sum(amp * sin(2π·d/period + phase))`. **We implemented and verified this network
  numerically today** (see below).
- **Lesson 4 teaser (7:06)**: GLSL copy POP + phyllotaxis: 3 params (element index i,
  spread constant c, golden angle 137.507°): `r = c·√i`, `θ = i·φ`, polar→cartesian.
  **Implemented and verified: disc radius matches 0.12·√9999 ≈ 12.0, flat in Z.**
- **Lesson 5 teaser (3:50)**: glslcopyPOP input 2 = template geometry (placement per copy);
  "hairy banana" example (credit: Roy & Tim Garrettson, POP beta demos).
- **Lesson 7 (12:54, longest free video)**: GLSL advanced POP extra outputs: a template
  POP declares GPU allocation (units + attributes), the advanced POP writes via
  `oTDPoint_<OutputName>_<Attr>[idx]`, and a `glslselectPOP` selects the output by name.
  Voronoi fracture writes per-primitive crack lines into an extra buffer using
  `TDPrimIndex()*2` line-point indexing.

## Cross-check vs our repo rules (AGENTS.md / docs/GLSL_POP_RULES.md)

- Our rules 1–6 (write/input separation, canonical guard, Create Attributes, readwrite,
  infoDAT for real errors, numPoints() being a method) all MATCH the tutorial and docs. ✔
- **Correction needed**: our docs never mention `TDInputNumPoints(inputIndex)`; the
  knowledge base implied `TDNumElements` was the only size function. For multi-input
  networks the loop bound MUST be `TDInputNumPoints(inputIndex)` (verified: passing an
  input index to `TDNumElements` is a compile error).
- **Correction needed**: glslcopyPOP point shaders use `TDNumPoints()`/`TDInputNumPoints()`
  (no `TDNumElements()`/`TDIndex()` at all — copy POP has its own function set, and its
  code param is `ptcomputedat`/`ptoutputattrs`, not `computedat`/`outputattrs`).
- New API facts to add to the cheatsheet: geometryCOMP has no output connectors; renderTOP
  binds camera/geometry via `camera`/`geometry` string parameters; POP attributes are
  CPU-readable via `op.points('Attr')[i]` (built-ins like P) but custom attributes created
  by a GLSL POP may refuse CPU readback ("AttribList has not been initialized") unless the
  POP cooks to CPU — sample builtins instead.
