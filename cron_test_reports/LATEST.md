# TD-MCP Cron Test — Latest Results

## Run: 2026-06-20 00:07 UTC

### Summary

| Check | Status |
|-------|--------|
| Server reachable | ✅ |
| Health (verify) | ✅ — 62 ops, 0 errors, 14 connections, 60 FPS |
| Dashboard | ✅ — HTTP 200 |
| Operator listing | ✅ — 30 ops in /project1 |
| **/exec operator creation** | **✅ FIXED — uses `{"code":"..."}` not `{"python":"..."}`** |
| **Parameter reading** | **✅ `/parameters?path=...` works** |
| **Parameter setting** | **⚠️ `/parameters/set` returns empty `updated: []`** |
| Cron test network | ✅ Created: noise→blur→nullTOP chain |

### Operators Created This Run
- `cron_test_noise` (noiseTOP) ✅
- `cron_test_blur` (blurTOP) ✅
- `cron_test_out` (nullTOP) ✅
- Connections: noise → blur → out ✅

### Issues Discovered

**1. `/exec` uses `{"code":"..."}` not `{"python":"..."}` (DOCUMENTATION GAP)**
- Initial attempts with `{"python":"..."}` consistently returned `(ok)` with no side effects
- Using `{"code":"..."}` correctly executes Python and captures stdout
- The AGENTS.md documents this correctly but the cron test script had the wrong key

**2. `/parameters/set` returns empty updates**
- `POST /parameters/set {"path":"/project1/cron_test_blur","params":{"size":3}}` returned `{"updated": []}`
- Parameter value was NOT changed — needs debugging

**3. Operator count mismatch persists**
- `/verify` reports 62 operators total
- `/project1` only lists 30
- ~32 ops live in other containers

**4. Parameter name mismatch**
- blurTOP uses `size` (Int), not `radius` — the AGENTS.md advice to always read params first is critical

### Patterns Over Time

*(First run with correct /exec usage — trend data begins now)*

### Notes
- Test network persisted after creation (operators found on re-verify)
- Previous report (report_20260620_0006.txt) had incorrect findings due to `{"python":"..."}` bug — report_20260620_0007.txt is the corrected version
