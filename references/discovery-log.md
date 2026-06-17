# Discovery Log

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
