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
