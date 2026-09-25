# MCP real cases — friction found while building real POP systems (2026-09-25)

Session: mission "mejorar el MCP con casos reales" — 3 POP systems built and verified in
live TD 2025.32460 through the HTTP bridge (`TouchDesignerAPI_v1.toe`). Every friction below
was actually hit (not hypothetical), with the workaround used. Ordered by impact.

## F1. `POST /screenshot` cannot capture POPs — only TOPs

- Hit while trying to produce visual evidence of the generated POPs.
- Bridge answer: `{'success': False, 'error': 'Not a TOP: /project1/glsl_interf', 'hint': ...}`.
  Empty-body fallbacks also fail with `No TOP output found` (they look for a TOP in the pane
  / under /project1; the fresh .toe has none).
- TD 2025 has no POP→TOP rasterizer operator at all (probed: `popToTOP`, `rasterPOP`,
  `renderPOP`, `pointrenderPOP`, `texturePOP`, `viewPOP`, `render2dPOP` — none exist;
  `convertPOP` only converts topology / CPU readback, not to image).
- The only working path to a real TOP image of a POP network: `geometryCOMP` containing a
  POP + `cameraCOMP` + `renderTOP` with `camera` / `geometry` STRING PARAMETERS (renderTOP
  has no geometry input, and geometryCOMP has no output connectors — wiring COMP→TOP is
  rejected: `Invalid number or type of arguments`).
- **MCP improvement**: a `td_screenshot` pre-flight that, given a POP path, auto-builds the
  render pipeline (or at least returns the renderTOP recipe instead of just "Not a TOP");
  plus `td_glsl_pipeline` helper. Small camera at distance ~30 of a 12-unit disc still gave
  a near-black 1280x720 render (sub-pixel points) — the helper should also set point-size /
  camera framing from POP bounds.

## F2. GLSL Copy POP has a different parameter surface and different builtin set

- `computedat` / `outputattrs` DO NOT EXIST on glslcopyPOP → tdAttributeError. Real names:
  `ptcomputedat` / `ptoutputattrs` (and `vert*` / `prim*` variants). Nothing in our docs
  distinguishes glslPOP from glslcopyPOP parameter surfaces.
- Its shader builtins are a different family: `TDNumPoints()` / `TDInputNumPoints()` /
  `TDCopyIndex()` / `TDTemplate_Attrib()`; there is NO `TDIndex()` / `TDNumElements()`.
  Our canonical guard (rule 2) does not apply to copy POPs; a copy-POP shader using
  `TDNumElements()` fails to compile.
- **MCP improvement**: `td_glsl_apply` should accept `pop_kind: glsl|copy|advanced` and
  inject the correct builtin set + param names; `td_glsl_analyze` should warn when a
  copy-POP shader uses glslPOP-only builtins.

## F3. Custom GLSL attributes are not CPU-readable by default

- `op.points('period')` on a glslPOP that CREATES the attribute throws
  `This AttribList has not been initialized to access the attribute data on the CPU.`
  Reading built-in attributes (`P`) works fine from Python.
- Consequence: `/exec`-based numeric verification of GLSL-created attributes is not
  straightforward; we verified via bounds()/numPoints() and input-side attributes instead.
- **MCP improvement**: `/verify` could expose which attributes are CPU-readable per op, and
  `td_glsl_apply` could set whatever cook/readback flag makes custom attrs host-visible
  (there may be a convertPOP `cpureadback` mode worth chaining for verification).

## F4. `TDNumElements(inputIndex)` is a compile error — loop bound for other inputs is different

- Multi-input GLSL: must use `TDInputNumPoints(1u)` to iterate another input's elements.
  Tried `TDNumElements(1)`, `TDNumElements(1u)`, `TDNumInputElements`, `TDInNumElements` —
  all fail with `no matching overloaded function found` (real cause only visible in the
  `<name>_info` DAT, rule 10e).
- Also verified: `TDIn_pos/amp/period/phase(1u, w)` reads any input's custom attribute by
  name — matches the tutorial's claim ("input attributes from all inputs are readable").
- **MCP improvement**: add the multi-input builtin table (from
  `docs/tutorials/pop_tutorial/TUTORIAL_KNOWLEDGE.md`) to `td_glsl_analyze` checks; the
  analyzer should flag `TDNumElements(k)` with args immediately (static check, no TD).

## F5. Op creation must use string types; `td.<class>` is incomplete inside /exec

- `td.pointgenPOP` does not exist (class name is `pointgeneratorPOP`; `td.glslcopyPOP`
  also missing from the td module as attribute) while string form `root.create("glslcopyPOP", ...)`
  works. `rootCOMP` doesn't exist at all; the bare builtin `baseCOMP` does.
- Also `/exec` scripts run with bare builtins (no `td.` needed for baseCOMP), which differs
  from the AGENTS.md example that uses `td.boxPOP`.
- **MCP improvement**: a `td_create` shape that takes opType strings and validates against
  `mcp/data/pops/pop_inventory.json` BEFORE hitting the bridge (fail fast with suggestion,
  like `_validate_operator_type` in stdio but server-side too).

## F6. Build scripts are fragile without idempotent teardown

- First pass created `/project1` COMP successfully but later failures left half-built
  networks; re-running scripts with `create` failed on existing names.
- Workaround used: every `mk()` destroys a same-name op before creating; all scripts are
  idempotent and safe to re-run.
- **MCP improvement**: `td_glsl_apply` already does some of this; a generic
  `replace=true` flag on `/create` would remove the boilerplate from every batch script.

## What worked flawlessly (worth keeping / amplifying)

- `/exec` with urllib (Content-Length set) — zero hangs, ~all scripts returned structured
  JSON with per-op errors and point counts.
- Read cache: `/operators` after writes always fresh (`cache: "miss"` then hits).
- `scripts/live/post_build_wiring_check.py` against expected edge-set: caught the exact
  wiring (7 edges incl. the multi-input slot 1) — `WIRING OK` in one shot.
- `points('P')[i]` numeric readback + `bounds()` min/max — enough to verify generated
  geometry numerically (ID == index; phyllotaxis disc radius; interference plane sizes).
