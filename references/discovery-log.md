# Discovery Log

Log of discoveries and lessons learned during development.

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

### Known Issues (not fixed in this tick)

1. **`/document` connection detection broken**: Despite connections existing in TD (verified by direct `/exec` probe), `/document` reports 0 connections and marks wired operators as "source" instead of "processor". The handler iterates `container.children` and checks `inputConnectors[i].op` — this may not traverse connection state correctly within `/exec` context. Needs investigation.

2. **`/verify` returns HTTP 500 on individual operator paths**: The `/verify` endpoint is designed for container paths. Passing `/project1/.../glsl_top` returns 500. Workaround: use `/exec` to call `op(path).errors()` directly.

3. **GLSL POP force-recompile fails ("Point Shader Compile failed")**: When `/glsl_reload` toggles `bypass` on a `glslcopyPOP`, the bypass toggle doesn't preserve the POP's shader compilation context. The DAT IS found and the code IS read correctly, but the recompile step fails. Workaround: use `/exec` to manually set the DAT text and call `t.cook(force=True)` instead.

4. **GLSL compilation in TD is async**: `/glsl_update` writes new code and force-cooks, but `t.errors()` may not detect compile errors immediately because TD compiles shaders asynchronously. Even 1 second sleep is insufficient. Workaround: poll `t.errors()` with retries.

### New test files
- `toe/src/test_live_td_glsl_endpoints.py` — 30 checks: GLSL TOP/POP reload, update, document endpoint, POP integration, cleanup

### Total test count
- 803+ offline unit tests (19 test files) + 4 live TD test files (~245 checks) = ~1048 total checks
