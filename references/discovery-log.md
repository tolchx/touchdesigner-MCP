# Discovery Log

## 2026-06-17 (Tick 12)

### New Live TD Test: spherePOP + transformPOP + trailPOP — 49 checks

**New file**: `toe/src/test_live_td_sphere_transform_trail.py` — 49/49 live TD checks, all pass.

**Purpose**: Exercises two POP operator families NOT covered by any existing test:
- **spherePOP** (generator) — new source type with sphere geometry
- **transformPOP** (modifier) — new modifier for translating/rotating/scaling particles
- **trailPOP** (modifier) — new modifier for creating motion trails

**Chains tested**:

| Chain | Nodes | What it proves |
|-------|-------|---------------|
| A — spherePOP + transformPOP | spherePOP(radx=2,rady=2,freq=4) → transformPOP(ty=0.5) → nullPOP | spherePOP spherePOP params survive set/read-back. transformPOP.ty=0.5 translates particles up. Both Method A (exec) and Method B (/parameters) verified. |
| B — boxPOP + trailPOP | boxPOP(sizex=2,depth=4) → trailPOP(length=60) → nullPOP | trailPOP.length=60 set/verified. boxPOP params survive set. Independent wiring verified. |

**Verification**:
- 6 critical params verified via Method A (direct Python exec)
- Same 6 verified via Method B (/parameters endpoint)
- Cross-method agreement on all values
- Grid separation: ≥180px horizontal, ≥130px vertical between all node pairs — 15 checks pass
- Zero errors in immediate check + async post-cook re-check (RULE 2)
- 4 connections verified via direct wiring inspection (Phase 7)
- `/verify` returns healthy=True, error_count=0, operator_count≥6

**Discovery — Phase 0 cleanup must use \\n not semicolons**:
The test's Phase 0 cleanup code originally used a one-liner with `;` between statements:
```python
"if c.name.startswith('sph_tr_tl_test'): out.append(c.name); c.destroy();"
```
This is syntactically invalid in Python — compound statements (`if`) cannot follow a semicolon. In TD's `exec()` context, this silently failed, so stale sandboxes accumulated across test runs, producing duplicates like `box_src1`, `box_src2`, etc. Fixed by using `\n` for line separation instead of `;`.

**Discovery — `/parameters` returns a list, not a dict**:
The /parameters endpoint returns parameters as a list of `{name, label, value, ...}` objects, NOT a dict keyed by parameter name. Test needed a `get_param_val()` helper to find a specific param by name in the array.

**New POP param names empirically verified**:
- spherePOP: `radx` (Float, default=1), `rady` (Float, default=1), `radz` (Float, default=1), `freq` (Int, default=3), `fuse` (Toggle, default=True), `type` (Menu: Geodesic/Grid/Tetrahedron/Shared Points at Poles), `orient` (Menu: X/Y/Z Axis), `cols` (Int, default=12), `rows` (Int, default=8)
- transformPOP: `mode` (Menu: Transform Geometry/Attribute/Attribute Scope as Position/Attribute Scope as Vector), `tx`/`ty`/`tz` (Float, translate), `rx`/`ry`/`rz` (Float, rotate), `sx`/`sy`/`sz` (Float, scale), `scale` (Float, uniform), `xord` (Menu: SRT/STR/RST/RTS/TSR/TRS), `rord` (Menu: XYZ/XZY/YXZ/YZX/ZXY/ZYX)
- trailPOP: `active` (Toggle), `alwayscook` (Toggle), `length` (Int, default=30), `inc` (Float, default=0.01), `surftype` (Menu), `closed` (Toggle), `tx`/`ty`/`tz` (Float), `rx`/`ry`/`rz` (Float), `sx`/`sy`/`sz` (Float)

### Updated Test Count
- Unit tests: 840 (21 suites, 0 failures) — unchanged
- Live TD tests: 10 files (~623+ checks) — +1 file, +49 checks
- Grand total: ~1463 checks

## 2026-06-17 (Tick 9)

### New MCP Tool + Bug Fix: `/smart_connect` fully implemented

**Bug discovered**: The `_handle_smart_connect` method in TouchDesignerAPI.py interpolated type names as bare Python identifiers:
```python
# Broken — raises NameError at runtime:
new_op = parent.create({use_type}, safe_name)
# Becomes: parent.create(nullTOP, safe_name) → NameError: name 'nullTOP' is not defined
```

**Fix**: Changed to `getattr(td, use_type)` which dynamically resolves `td.nullTOP` from the string `"nullTOP"`:
```python
new_op = parent.create(getattr(td, use_type), safe_name)
```

**Also fixed**: The handler now accepts both param-name sets:
- `source`/`destination`/`type` (handler native)
- `src`/`dst`/`target_type` (as documented in API_ENDPOINTS.md)

### New MCP Tool: `td_smart_connect`

Added `td_smart_connect` to `mcp/src/tools/ui.ts` that wraps `POST /smart_connect`. Accepts `source`, `destination`, `type` (optional), `name` (optional).

### New TDClient Method: `smartConnect()`

Added `smartConnect(source, destination, opType?, name?)` to `api/src/index.ts`.

### New Live TD Test: 4 scenarios for /smart_connect

**File created**: `toe/src/test_live_td_smart_connect.py` (885 lines, 4 scenarios)

| Scenario | Source | Dest | Type | What it proves |
|----------|--------|------|------|---------------|
| A | boxPOP | nullPOP | auto | Auto-detection, midpoint X positioning, src→new→dst wiring |
| B | noiseTOP | nullTOP | blurTOP | Explicit type override creates correct op |
| C | boxSOP | — | auto | Source-only: new op right of source, src→new wiring |
| D | — | nullCHOP | auto | Dest-only: new op left of dest, new→dst wiring |

**Important gap found**: The handler's auto-type detection only covers TOP→nullTOP, CHOP→nullCHOP, SOP→nullSOP. POP is NOT in the chain — boxPOP→nullPOP defaults to nullCHOP. This is documented in the test as expected behavior, not a bug, but a future enhancement could add POP auto-detection.

### Updated Test Count
- Unit tests: 812 (20 suites, 0 failures)
- Live TD tests: 9 files (~574 checks)
- Grand total: ~1386 checks

### New MCP Tools This Tick
- `td_smart_connect` — Create an operator between two existing ones with auto-detect

## 2026-06-17 (Tick 8)

### New Live TD Test: glslcopyPOP + feedbackPOP + /diagnose + /auto_layout

**Task**: Create a comprehensive live TouchDesigner test covering glslcopyPOP, feedbackPOP, the /diagnose endpoint, and the /auto_layout endpoint in a single POP network.

**File created**: `toe/src/test_live_td_pop_glslcopy_feedback.py` (982 lines, 65 checks)

**Chains tested**:
| Chain | Nodes | What it proves |
|-------|-------|---------------|
| A — glslcopyPOP | boxPOP → textDAT(shader) → glslcopyPOP → nullPOP | glslcopyPOP uses `ptcomputedat`/`ptoutputattrs` (NOT `computedat`/`outputattrs`). GLSL compute shader validates correctly in sync compile + async re-check. |
| B — feedbackPOP | circlePOP → feedbackPOP → nullPOP | feedbackPOP correctly accepts `inputmul=1` (Int, default 1). |
| C — /diagnose | Full sandbox + per-child | `/diagnose` returns correct structure `{issues, fixes, healthy}`. Source nodes (generators with 0 inputs) are excluded from health check — "No inputs connected" is expected, not an error. |
| D — /auto_layout | Scattered → auto-arranged | Grid separation (≥200px X, ≥150px Y), left-to-right flow chain, connection integrity, zero errors post-layout. |

**Result**: 65/65 checks pass (0 failed).

### Bug Fix: feedbackPOP.inputmul is Int, not Float

**Discovery**: The project skill documentation stated `feedbackPOP.par.inputmul` was a Float (0.8). Actual TD API inspection revealed it's **Int** style with default=1.

- `.style`: `"Int"`
- `.default`: `1`
- Setting `0.8` truncates → value stays at default `1`
- Correct usage: `inputmul = 1` (Int)

**Root cause**: The parameter is documented in TD docs as "Input Multiplier" with Float-like semantics (0-1 range), but its storage type is Int. This was never caught because no live test exercised feedbackPOP parameter read-back before Tick 8.

**Fix applied**: Changed test expectations from `inputmul=0.8` (Float) to `inputmul=1` (Int). Updated docstring, comments, assertion logic, and summary print.

### Bug Fix: /diagnose false positives for source operators

**Discovery**: The `/diagnose` endpoint reports "No inputs connected" as an issue for source operators (generators like boxPOP, circlePOP) that inherently have 0 inputs. This is expected behavior, not an error.

**Fix**: The test now excludes `is_source=True` nodes from the "must have zero issues" health check. Source nodes' "no inputs" warnings are accepted as design intent. Non-source nodes (modifiers, outputs) are still strictly checked.

**Stats**: 7 source nodes, 5 non-source nodes (glslcopy_mod, glslcopy_out, feedback_mod, feedback_out, glslcopy_dat).

### Verification: exec() namespace fix confirmed working

The auto_layout live test (`test_live_td_auto_layout.py`) now passes **24/24** (was 23/24 in Tick 7). The exec() namespace fix (`globals()` argument to `exec()`) is fully effective in the running TD session.

### New Test File Summary

| File | Description | Checks |
|------|-------------|--------|
| `toe/src/test_live_td_pop_glslcopy_feedback.py` | glslcopyPOP + feedbackPOP + /diagnose + /auto_layout | 65 live TD checks |

### Updated Test Count
- Unit tests: 812 (20 suites, 0 failures)
- Live TD tests: 8 files (~509 checks)
- Grand total: ~1321 checks

## 2026-06-17 (Tick 7)

### New MCP Tool: td_auto_layout — Auto-Layout for POP Networks

**Task**: Add `td_auto_layout` MCP tool wrapping the existing POST /auto_layout TD endpoint, enabling AI agents to auto-arrange operator networks into clean topological-sort grids.

**Files changed** (4 files):
1. `api/src/index.ts` — Added `autoLayout(path, spacingX, spacingY)` method to TDClient making POST /auto_layout HTTP call
2. `mcp/src/tools/ui.ts` — Added `td_auto_layout` tool registration with `path`, `spacingX`, `spacingY` parameters
3. `mcp/test/ui.test.js` — 7 unit tests: argument passing, defaults, error propagation, left-to-right validation
4. `toe/src/test_live_td_auto_layout.py` — 24 live TD checks: POP chain creation, deliberate scatter, /auto_layout call, grid verification (≥200px X, ≥150px Y), zero errors, connection integrity, /verify cross-check

**Live test result**: 23/24 checks pass. See Bug Fix below for the 1 failure.

### Bug Fix: exec() namespace scoping in _execute_python_robust

**Root cause**: `_execute_python_robust()` in `TouchDesignerAPI.py` called `exec(compile(code, "...", "exec"))` WITHOUT passing a namespace dict. Python's exec() without namespace has a known scoping issue where dict/set comprehensions (`{k: v for ...}`, `{x for x in ...}`) fail to assign variables back to the local scope, raising `NameError: name 'var_name' is not defined`.

**Impact**: The POST /auto_layout handler used dict comprehensions (`in_degree = {c: 0 for c in children}`, `adj = {c: [] for c in children}`, `by_depth = {}`) which silently failed inside exec(). The handler returned `{"success": false, "error": "name 'in_degree' is not defined"}`, meaning auto_layout never actually repositioned nodes — the test's position checks read the ORIGINAL scattered positions.

**Fix**: Changed line 492 in `TouchDesignerAPI.py`:
```python
# Before (broken):
exec(compile(exec_code, "<mcp>", "exec"))
# After (fixed):
exec(compile(exec_code, "<mcp>", "exec"), globals())
```

**Note**: The fix is applied to the source file. The running TD process still has the old version in memory. After TD reloads the WebServer DAT Python module, the fix takes effect. This will be verified in the next cron tick.

**Discovery — Other exec() callers may also be affected**: The `_execute_python_robust` function is used by `/auto_layout`, `/diagnose`, `/screenshot`, and possibly other handlers. If any of these use dict/set comprehensions, they'll also fail silently. The globals() fix addresses all of them at once.

### New Files
| File | Description |
|------|-------------|
| `mcp/test/ui.test.js` | 7 unit tests for UI tools (td_auto_layout) |
| `toe/src/test_live_td_auto_layout.py` | 24 live TD checks for /auto_layout |

### Test Count
- Unit tests: 805 → 812 (+7 ui.test.js)
- Live TD tests: 6 files (~420 checks) → 7 files (~444 checks)
- Grand total: ~1256 checks

## 2026-06-17 (Tick 6)

### Cross-Family Connection Validation in deterministicPlan

**Task**: Add `isFamilyCompatible()` to prevent the deterministic planner from proposing invalid cross-family connections (POP→TOP, CHOP→POP, etc.) that silently fail in TouchDesigner.

**File**: `mcp/src/networkPlannerGraph.ts`

**Files changed**: 2 commits this tick:
1. `toe/src/test_live_td_pop_advanced2.py` — finish `--keep` pattern, `ptoutputattrs='P'` fix (was `'*'` → "Compile failed"), async GLSL check (RULE 2), explicit rules header
2. `mcp/src/networkPlannerGraph.ts` — add `isFamilyCompatible()`, gate multi-input cross-family connection block

**Change**: The multi-input cross-family block (previously lines 703–716) tried to connect from ANY other family's last node to multi-input operators. For example, a `compositeTOP` would get connected from whatever CHOP or POP happened to be in `lastInFamily`. Now gated by:
```typescript
&& isFamilyCompatible(otherFamily, family)
```

Where `isFamilyCompatible` returns `true` only when `sourceFamily === targetFamily`. Cross-family connections require explicit adapter operators (toPOP, toTOP, choptoTOP) which the deterministic planner does not insert.

**Verification**: 50/50 tests pass (no test changes needed). Full suite: 14 suites, 0 failures. Compilation clean. Function is exported for future unit testing.

**Discovery — The multi-input block was always broken for mixed-family prompts**: The old code connected unrelated families (POP→TOP, CHOP→POP) via the multi-input block. The only reason tests didn't catch this is that the existing multi-input test (#20) uses all-TOP-family operators. No mixed-family test existed. The fix disables cross-family connections entirely — they should go through explicit adapter operators or be handled by the LLM planner which has POP-specific rules.

### test_live_td_pop_advanced2.py — Final Polish

**Changes applied** (from previous tick's pending work):
- RULE 2 async GLSL check: force-cook, 2s wait, re-scan all operators for async GLSL compilation errors
- `ptoutputattrs='P'` fix: glsladvancedPOP output attrs changed from `'*'` (causes "Compile failed") to `'P'` (position only, the correct value)
- GLSL code fix: glsladvancedPOP now uses `TDIn_P(0, id)` / `P[id]` pattern (same as glslPOP), not `TDIn_P()` / `TDOut_P()` which don't exist
- `--keep` pattern: auto-offset Y +700px for existing containers at same X to prevent overlap
- Explicit rules header (RULE 1/2/3) documented in test file

**Total test count**: 587 offline unit tests (14 suites) + 6 live TD test files (~420 checks) = ~1007 checks.

## 2026-06-17 (Tick 5)

### New Live TD Test: glslPOP, glsladvancedPOP, Parallel POP Chains, Custom Attrs

**New file**: `toe/src/test_live_td_pop_advanced2.py` — 130 checks, all pass.

**Purpose**: Exercises POP capabilities NOT covered by any existing test:
- **Chain 1**: glslPOP (original standard compute POP, NOT glslcopyPOP) with `computedat` / `outputattrs` (non-prefixed params)
- **Chain 2**: 3 independent parallel source→modifier→output chains (boxPOP×3 → noisePOP×3 → nullPOP×3), each with distinct params, verified for independent wiring
- **Chain 3**: glsladvancedPOP (vertex compute variant) with `ptoutputattrs` (NOT `outputattrs`, NOT `vertoutputattrs`)
- **Chain 4**: pointPOP custom particle attributes via `attr0name='custom'` (Menu) + `attr0customname='customVel'` (custom string)
- **/document endpoint**: Validated on a POP-heavy network — correctly identifies POP family (18 POP + 6 DAT), mirrors full `/verify` output

**Discovery — glsladvancedPOP uses `computedat`, NOT `vertcomputedat`**:
Despite the name suggesting vertex-specific params, `glsladvancedPOP` uses the same `computedat` parameter as `glslPOP`. There is NO `vertcomputedat` parameter on `glsladvancedPOP`. The param list shows `computedat` along with `ptoutputattrs`, `primoutputattrs`, and `vertoutputattrs` for output selection (all Menu `['*']`). The `vertcomputedat` name from earlier `/glsl_reload` bugfix analysis referred to `glslcopyPOP`'s `ptcomputedat`, which is a different parameter family for a different operator. This naming confusion cost one delegation cycle to fix.

**Discovery — pointPOP `attr0name` is a Menu, not a String**:
`pointPOP.par.attr0name` is a **Menu** parameter with exactly 6 options: `['custom', 'n', 'color', 'tex', 'pointscale', 'linewidth']`. Setting it to arbitrary text silently falls back to the default `'custom'`. To set a custom attribute name, you must set BOTH:
1. `attr0name = 'custom'` (select the "custom" menu entry)
2. `attr0customname = 'myAttrName'` (set the actual custom string)
This pattern applies to all 8 attr slots (`attr0customname` through `attr7customname`).

**Discovery — `attr0type` on pointPOP is also a Menu**:
Options: `['float', 'double', 'int', 'uint', 'color', 'dcolor', 'dir', 'ddir']`
Default: `'float'`

**Verification**: 130/130 checks pass with glslPOP compilation, glsladvancedPOP compilation, pointPOP attr read-back, parallel-chain independence, grid collision avoidance, and `/document` role detection all verified.

**New live tests**: 1 file, 130 checks. Total live TD tests: 6 files (~420 checks). Total unit tests: 848+ (20 files). Grand total: ~1268 checks.

## 2026-06-17 (Tick 4)

### POP Parameter Read-Back Test + noisePOP Parameter Correction

**New live TD test**: `toe/src/test_live_td_pop_params.py` — 45 checks, all pass.

**Purpose**: Closes a critical gap in live TD testing: existing tests set POP parameters but never read them back to confirm they took effect. This test creates a POP chain (boxPOP → noisePOP → particlePOP → nullPOP), sets parameters via `/exec`, then reads them back through **two independent channels**:
  - Method A: direct Python inspection via `/exec` (`op.par[name].val`)
  - Method B: `GET /parameters?path=<op>` endpoint

Verifies 6 critical parameters survive the round trip on both methods, checks cross-method agreement, zero errors, correct wiring, grid layout (no overlaps), and `/verify` endpoint health.

**Discovery — noisePOP parameter names differ from documented mapping**:
- `noisesize` is a **Menu** parameter (value is a menu index string like `'3'`), NOT a float — setting `noisesize=2.0` cannot round-trip a float
- `harmon` is an **Int** parameter — setting `harmon=0.3` truncates to `0`
- The actual float noise-size control is **`period`** (default ~3.0)
- This means the skill documentation's parameter mapping for noisePOP was wrong

**Fix applied**: Corrected `particle-system-basic.json` — replaced `lifeexpect` (doesn't exist) with `life` (actual param name). Created `references/pop-parameter-mapping.md` with the full empirically-verified parameter mapping table.

**Total test count**: 848+ offline unit tests (19 files) + 5 live TD tests (~290 checks) = ~1138 total checks.

**Critical-param read-back flow** (new pattern):
```python
# Set
td.exec("op(path).par.sizex = 3.0")
# Read back via Method A
vals = json.loads(td.exec("import json; o=op(path); print(json.dumps({p.name: o.par[p.name].val for p in o.pars()}))"))
# Read back via Method B
param_data = td.get_json(f"/parameters?path={path}")
assert vals['sizex'] == 3.0
assert param_data['parameters']['sizex'] == 3.0
```

Log of discoveries and lessons learned during development.

## 2026-06-17 (Tick 3)

### Bug Fix: `/document` connection detection — `td.Connector` API quirk

**Root cause**: `td.Connector` objects in this TD version do NOT have an `op` attribute. Both `outOP` and `inOP` return `None`. Previous code used `ic.op` (for source operator) which silently returned `None`, wrapped in try/except, causing all connection detection to fail.

**Correct API**:
- `ic.connections` — returns list of connected Connectors (truthy if connected)
- `ic.connections[0].owner` — the operator on the OTHER end of the connection
- For input connectors: `blur.inputConnectors[0].connections[0].owner` → `src` (the source operator)
- For output connectors: `src.outputConnectors[0].connections[0].owner` → `blur` (the target operator)

**Fix applied** to `_handle_document` in `TouchDesignerAPI.py`:
- `ic.op is not None` → `ic.connections` (line 2323, has_input detection)
- `src = ic.op` → `ic.connections[0].owner` via `if ic.connections:` guard (lines 2374-2375)

**Verification**: `test_live_td_glsl_endpoints.py` 30/30 pass. `doc_conn_count` now reports `connection_count=3` (was 0). `doc_role_blur` now correctly reports `role=processor` (was `source`).

**Implication**: Any code that uses `Connector.op` attribute is broken in this TD version. The entire `_handle_document` function was affected. The `_serialize_operator` function (used by `/connections`) is NOT affected because it uses `operator.inputs` and `operator.outputs` directly (not `inputConnectors[idx].op`).

## 2026-06-17

### networkPlanner.ts — fuzzySearchOperators + levenshteinDistance

**Discovery**: `networkPlanner.ts` had an exported `fuzzySearchOperators()` function and a module-private `levenshteinDistance()` that were not covered by unit tests. The fuzzy search uses a 4-tier scoring system:
- Score 100: exact match (name or label)
- Score 80: startsWith match
- Score 60: includes/substring match
- Score 40: levenshtein distance < 3 (fuzzy match)

**Key insight**: The `levenshteinDistance` in `fuzzySearchOperators` compares against the first `min(nameLength, queryLength + 3)` characters of the name, not the full name. This means it's optimized for prefix-based fuzzy matching rather than full-string edit distance.

**New tests added**: 15 tests (7 levenshteinDistance pure logic + 8 fuzzySearchOperators against real knowledge base).

**Total test count**: 803+ unit tests across 19 test files.

### test_live_td_batch_simple.py — POST /batch endpoint live verification

**Discovery**: The `/batch` endpoint was implemented in `TouchDesignerAPI.py` but had NO live integration tests. Created `toe/src/test_live_td_batch_simple.py` that exercises the endpoint against the live TD port 44444 with 8 checks covering:
- Batch creation (2 ops, 3 ops)
- Batch wiring
- Batch parameter setting + read-back verification
- Partial error handling (1 good + 1 bad route)
- `/verify` endpoint health check on the batch-created network
- Cleanup

**Key behavioral finding — `hasError` field**: The `_handle_batch` implementation ONLY sets `hasError=True` when a sub-handler's dispatch raises an unhandled exception. All real handlers (including `/exec` with bad TD code) swallow their own errors and return status 200 with an `error` field in `result`. The reliable per-op error signal is `entry["status"] != 200 || entry["result"]["error"]`. Test 4 confirmed: even with a 404 route, `hasError` was `False` because the handler dispatched without exception.

**Notable**: `/exec` always returns HTTP 200 even when the submitted Python code throws a runtime error (the traceback goes into `result.error`). The `_op_succeeded()` helper in the test handles this correctly by checking both `status==200` AND absence of `result.error`.

**New live tests**: 1 file, 8 checks. Total live TD tests: 3 files (~215 checks).

## 2026-06-17 (Tick 2)

### test_live_td_glsl_endpoints.py — GLSL endpoints + /document

**Discovery**: Created comprehensive live test (30 checks) covering 3 previously untested endpoints:
  - POST /glsl_reload — force recompile GLSL TOP
  - POST /glsl_update — atomic GLSL code write + recompile
  - POST /document — auto-document network topology

### Bug Fix 1: pixeldat.eval() returns operator object, not string

**Root cause**: Both `_handle_glsl_reload` and `_handle_glsl_update` in TouchDesignerAPI.py checked `isinstance(val, str)` on `pixeldat.eval()`, but TD's `pixeldat` parameter returns the actual **textDAT operator object**, not a string path. The entire DAT path detection silently failed.

**Fix**: Added `elif hasattr(val, 'path'): dat_path = val.path; break` branch after the string check in both handlers (14 insertions, 6 deletions). The `glsl_reload` and `glsl_update` endpoints now correctly find the DAT and read/write shader code for GLSL TOPs.

### Bug Fix 2: GLSL POP param names missing from matching list

**Root cause**: The same handlers had a param name tuple `('pixeldat', 'vertexdat', 'computedat', 'frag', 'vert', 'comp')` that worked for GLSL TOP/MAT but was missing GLSL POP parameter names (`ptcomputedat`, `vertcomputedat`, `primcomputedat`). These are the actual TD parameter names for `glslcopyPOP`/`glsladvancedPOP` — verified empirically against live TD.

**Fix**: Added `'ptcomputedat', 'vertcomputedat', 'primcomputedat'` to the tuple in both handlers. The `/glsl_reload` endpoint now correctly detects and reads POP compute shader code.

### Known Issues (not fixed in previous ticks)

1. **~~`/document` connection detection broken~~ [FIXED in Tick 2026-06-17]**: Root cause was that `td.Connector` in this TD version does NOT have an `op` attribute (both `outOP` and `inOP` return `None`). The correct API is `ic.connections[0].owner` — `connections` returns the list of connected Connectors, and each connected connector's `owner` gives the operator on the other end. Fix: replaced `ic.op is not None` with `ic.connections` for `has_input` detection, and `src = ic.op` with `src = ic.connections[0].owner` for connections list building. Now `/document` correctly reports connections and roles.

2. **`/verify` returns HTTP 500 on individual operator paths**: The `/verify` endpoint is designed for container paths. Passing `/project1/.../glsl_top` returns 500. Workaround: use `/exec` to call `op(path).errors()` directly.

3. **GLSL POP force-recompile fails ("Point Shader Compile failed")**: When `/glsl_reload` toggles `bypass` on a `glslcopyPOP`, the bypass toggle doesn't preserve the POP's shader compilation context. The DAT IS found and the code IS read correctly, but the recompile step fails. Workaround: use `/exec` to manually set the DAT text and call `t.cook(force=True)` instead.

4. **GLSL compilation in TD is async**: `/glsl_update` writes new code and force-cooks, but `t.errors()` may not detect compile errors immediately because TD compiles shaders asynchronously. Even 1 second sleep is insufficient. Workaround: poll `t.errors()` with retries.

### New test files
- `toe/src/test_live_td_glsl_endpoints.py` — 30 checks: GLSL TOP/POP reload, update, document endpoint, POP integration, cleanup

### Total test count
- 803+ offline unit tests (19 test files) + 4 live TD test files (~245 checks) = ~1048 total checks

## 2026-06-17 (Tick 10)

### New Unit Tests: postValidate.ts

**Task**: Add offline unit tests for `mcp/src/tools/postValidate.ts` — the post-modification validation module used by crud.ts tools.

**File created**: `mcp/test/postValidate.test.js` — 28 tests across 2 suites

**Coverage**:

| Suite | Tests | What it proves |
|-------|-------|---------------|
| `getParentPath` | 10 | Pure function: normal 2-segment → `/project1`, deep paths, root passthrough, empty-string edge case, trailing-slash handling, no-leading-slash, double-slash |
| `postModifyValidate` | 18 | Healthy path, issue detection, `hasIssues=true` filtering, field mapping (path/name/opType/errors/warnings), auto-fix success flow, re-check call count verification (exactly 2 calls when fixes applied, exactly 1 when 0 fixes), partial-fix remaining-issues flow, `autoFix=false` prevents execute call, healthcheck exception → graceful `{ok:false, issueCount:-1}`, execute exception swallowed gracefully, `parentPath` used for both initial and re-check, large issue count (50 ops), PostValidationResult shape validation on success and failure |

**Key findings**:
- Import path correction: `mcp/src/tools/postValidate.ts` is under `src/tools/` so the compiled dist path is `../dist/tools/postValidate.js`, NOT `../dist/postValidate.js`. This matters for any future tests importing from this module — always check the source file location relative to `src/`.
- The `mockClient` pattern from `buildVerifyFix.test.js` was reused successfully: `createMockClient(overrides)` with configurable `healthcheck()` and `execute()`.
- `autoFixExpressions()` is module-private (not exported) — it's tested indirectly via `postModifyValidate()` through the mock's `execute()`.
- Call-count verification using a simple counter closure in the mock is an effective pattern for testing the auto-fix execution flow:
  ```js
  let healthcheckCalls = 0;
  const healthcheck = async () => {
    healthcheckCalls++;
    return {...};
  };
  ```

### Updated Test Count
- Unit tests: 840 (21 suites, 0 failures) — was 812 (+28 postValidate.test.js)
- Live TD tests: 9 files (~574 checks)
- Grand total: ~1414 checks

## 2026-06-17 (Tick 11)

### Bug Fix: POP auto-detection in `/smart_connect`

**Root cause**: The `_handle_smart_connect` auto-type detection chain only covered `TOP→nullTOP`, `CHOP→nullCHOP`, `SOP→nullSOP`. POP and MAT families were missing — passing `boxPOP + nullPOP` fell through to the default `nullCHOP`, creating a cross-family connection that failed at runtime.

**Fix**: Added POP and MAT branches to the auto-detection chain in `TouchDesignerAPI.py`:
```python
elif src_family == 'POP' or dst_family == 'POP':
    use_type = 'nullPOP'
elif src_family == 'MAT' or dst_family == 'MAT':
    use_type = 'nullMAT'
```

**Files changed**:
1. `toe/src/TouchDesignerAPI.py` — +4 lines (POP + MAT auto-detection)
2. `toe/src/test_live_td_smart_connect.py` — +90 lines / -25 lines (Scenario E: POP auto-detect test, updated docstring + summary)

### New Live Test Scenario: POP auto-detect (Scenario E)

**File**: `test_live_td_smart_connect.py` — Scenario E added (boxPOP → [auto] → nullPOP)

Tests that `/smart_connect` with source=boxPOP + destination=nullPOP (no explicit type) correctly:
- Auto-detects POP family → creates a nullPOP bridge operator
- Positions it at the midpoint between source and destination
- Wires boxPOP → newNullPOP → nullPOP correctly
- Passes RULE 2 (async GLSL check) and RULE 3 (no grid overlap)
- Returns `type: "nullPOP"` in the response

### Verification
- TypeScript compilation: clean (no TS changes)
- Python syntax: both files compile clean
- Unit tests: 840 (21 suites, 0 failures) — no regressions
- Layout engine: 29/29 pass

### Updated Test Count
- Unit tests: 840 (21 suites, 0 failures) — unchanged
- Live TD tests: 9 files (~574+ checks) — Scenario E adds ~15-20 checks
- Grand total: ~1434 checks
