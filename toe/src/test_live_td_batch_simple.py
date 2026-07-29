#!/usr/bin/env python3
"""
Simple Live TD /batch Endpoint Test
====================================

Exercises the TouchDesigner HTTP API `POST /batch` endpoint (port 44444) by
issuing a sequence of batched operations inside an isolated, uuid-named sandbox
container and validating the returned summary structure.

Batch response contract (from toe/src/TouchDesignerAPI.py `_handle_batch`):
    {
      "total":     <int>   # number of operations submitted,
      "completed": <int>   # number of result entries (always == total),
      "hasError":  <bool>  # True ONLY when a sub-handler raises an exception
                           # (handlers swallow their own errors, so this is
                           #  rarely True; the reliable per-op error signal is
                           #  the per-entry `status` field + `result.error`),
      "results": [
        {"index": <int>, "method": <str>, "path": <str>,
         "result": <dict>, "status": <int>, ["error": <str>]}
      ]
    }

Per-op status codes observed on this server:
    200 = sub-handler ran (check result.error for code-level failure),
    404 = unknown route (unknown `path`),
    500 = sub-handler internal error.

POP parameter names used here are the REAL TD names (the public docs are wrong):
    boxPOP:      sizex        particlePOP: birthrate
    noisePOP:    amp0

Tests:
    1. POST /batch — 2 ops: create sandbox container + create boxPOP
    2. POST /batch — 3 ops: create noisePOP, particlePOP, nullPOP
    3. POST /batch — 3 ops: set boxPOP.sizex=2.0, noisePOP.amp0=0.5,
                            particlePOP.birthrate=100 (read sizex back)
    4. POST /batch — partial error: 1 good op (GET /info) + 1 bad op (404 route)
    5. GET /verify — endpoint health check on the wired sandbox
    6. Cleanup — destroy sandbox, confirm gone

Exit code 0 = pass, non-zero = fail. Safe to re-run (uuid sandbox + destroy).

Usage:
    python toe/src/test_live_td_batch_simple.py
    python toe/src/test_live_td_batch_simple.py --host 127.0.0.1 --port 44444
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request
import uuid

# ─── Configuration ──────────────────────────────────────────────────────────

DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 44444
DEFAULT_TIMEOUT = 30  # seconds per HTTP call

SANDBOX_PARENT = "/project1"
# Unique per run -> safe to re-run without name collisions.
SANDBOX_NAME = f"test_batch_{uuid.uuid4().hex[:8]}"
SANDBOX_PATH = f"{SANDBOX_PARENT}/{SANDBOX_NAME}"


# ─── HTTP client (urllib-based, same style as sibling tests) ─────────────────


class TDClient:
    """Minimal urllib client for the TD HTTP API, with a /batch helper."""

    def __init__(self, host: str, port: int, timeout: int = DEFAULT_TIMEOUT):
        self.base = f"http://{host}:{port}"
        self.timeout = timeout

    def _request(self, method: str, path: str, body: dict | None = None) -> dict:
        data = json.dumps(body).encode("utf-8") if body is not None else None
        headers = {"Content-Type": "application/json"} if data is not None else {}
        req = urllib.request.Request(
            f"{self.base}{path}", data=data, headers=headers, method=method
        )
        with urllib.request.urlopen(req, timeout=self.timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))

    def exec(self, code: str) -> str:
        """POST /exec. Returns the captured stdout. Raises on TD-level error."""
        data = self._request("POST", "/exec", {"code": code})
        if data.get("error"):
            raise RuntimeError(f"TD exec error: {data['error']}")
        return data.get("output", "")

    def get_json(self, path: str) -> dict:
        """GET a JSON endpoint (e.g. /verify?path=...)."""
        return self._request("GET", path, None)

    def batch(self, operations: list[dict]) -> dict:
        """POST /batch with a list of operation specs. Returns summary dict."""
        return self._request("POST", "/batch", {"operations": operations})

    def ping(self) -> bool:
        try:
            self._request("GET", "/info", None)
            return True
        except Exception:
            return False


# ─── Test harness ────────────────────────────────────────────────────────────


class TestResult:
    def __init__(self):
        self.steps: list[dict] = []
        self.failures: list[str] = []

    def step(self, name: str, ok: bool, detail: str = "") -> None:
        self.steps.append({"step": name, "ok": ok, "detail": detail})
        status = "PASS" if ok else "FAIL"
        line = f"  [{status}] {name}"
        if detail:
            line += f": {detail}"
        print(line)
        if not ok:
            self.failures.append(f"{name}: {detail}")

    @property
    def passed(self) -> bool:
        return not self.failures


# ─── Helpers ─────────────────────────────────────────────────────────────────


def _exec_op(code: str) -> dict:
    """Build a POST /exec operation spec for a batch."""
    return {"method": "POST", "path": "/exec", "body": {"code": code}}


def _op_succeeded(entry: dict) -> bool:
    """An op is considered successful iff status==200 AND result has no error.

    /exec always returns status 200 even on Python errors, so we must also
    inspect the nested `result.error` field to catch code-level failures.
    """
    if entry.get("status", 500) != 200:
        return False
    result = entry.get("result")
    if isinstance(result, dict) and result.get("error"):
        return False
    return True


def _connect_op(src_path: str, tgt_path: str) -> dict:
    """Build a /exec op that wires src.output -> tgt.input[0]."""
    code = (
        "op(%r).outputConnectors[0].connect(op(%r))"
        % (src_path, tgt_path)
    )
    return _exec_op(code)


# ─── Test 1: POST /batch with 2 operations (container + boxPOP) ──────────────


def test_1_create_container_and_box(td: TDClient, res: TestResult) -> None:
    print("\n--- Test 1: /batch — 2 ops (create container + create boxPOP) ---")
    operations = [
        _exec_op(
            "op(%r).create(baseCOMP, %r)" % (SANDBOX_PARENT, SANDBOX_NAME)
        ),
        _exec_op(
            "op(%r).create(boxPOP, 'box')" % SANDBOX_PATH
        ),
    ]
    try:
        summary = td.batch(operations)
    except Exception as e:
        res.step("t1_batch", False, f"HTTP call failed: {e}")
        return

    results = summary.get("results", [])
    total_ok = summary.get("total") == 2 and summary.get("completed") == 2
    both_ok = len(results) == 2 and all(_op_succeeded(r) for r in results)
    res.step(
        "t1_batch",
        total_ok and both_ok,
        f"total={summary.get('total')}, completed={summary.get('completed')}, "
        f"statuses={[r.get('status') for r in results]}",
    )


# ─── Test 2: POST /batch with 3 operations (noise, particle, null) ───────────


def test_2_create_three_pops(td: TDClient, res: TestResult) -> None:
    print("\n--- Test 2: /batch — 3 ops (create noisePOP, particlePOP, nullPOP) ---")
    operations = [
        _exec_op("op(%r).create(noisePOP, 'noise')" % SANDBOX_PATH),
        _exec_op("op(%r).create(particlePOP, 'particles')" % SANDBOX_PATH),
        _exec_op("op(%r).create(nullPOP, 'null')" % SANDBOX_PATH),
    ]
    try:
        summary = td.batch(operations)
    except Exception as e:
        res.step("t2_batch", False, f"HTTP call failed: {e}")
        return

    results = summary.get("results", [])
    total_ok = summary.get("total") == 3 and summary.get("completed") == 3
    all_ok = len(results) == 3 and all(_op_succeeded(r) for r in results)
    res.step(
        "t2_batch",
        total_ok and all_ok,
        f"total={summary.get('total')}, completed={summary.get('completed')}, "
        f"statuses={[r.get('status') for r in results]}",
    )


# ─── Setup: wire the chain so /verify reports a healthy network ──────────────


def setup_wire_chain(td: TDClient, res: TestResult) -> None:
    """Wire box -> noise -> particles -> null in a single batch.

    This also implicitly proves all 4 nodes exist: outputConnectors[0].connect()
    raises (surfaced as result.error) if either endpoint is missing.
    """
    print("\n--- Setup: /batch — 3 ops (wire box -> noise -> particles -> null) ---")
    sp = SANDBOX_PATH
    operations = [
        _connect_op(f"{sp}/box", f"{sp}/noise"),
        _connect_op(f"{sp}/noise", f"{sp}/particles"),
        _connect_op(f"{sp}/particles", f"{sp}/null"),
    ]
    try:
        summary = td.batch(operations)
    except Exception as e:
        res.step("setup_wire", False, f"HTTP call failed: {e}")
        return

    results = summary.get("results", [])
    all_ok = len(results) == 3 and all(_op_succeeded(r) for r in results)
    res.step(
        "setup_wire",
        all_ok,
        f"connected {sum(_op_succeeded(r) for r in results)}/3, "
        f"statuses={[r.get('status') for r in results]}",
    )


# ─── Test 3: POST /batch with set params + read-back ─────────────────────────


def test_3_set_params(td: TDClient, res: TestResult) -> None:
    print("\n--- Test 3: /batch — 3 ops (set boxPOP.sizex, noisePOP.amp0, "
          "particlePOP.birthrate) ---")
    sp = SANDBOX_PATH
    operations = [
        _exec_op("op(%r).par.sizex = 2.0" % f"{sp}/box"),
        _exec_op("op(%r).par.amp0 = 0.5" % f"{sp}/noise"),
        _exec_op("op(%r).par.birthrate = 100" % f"{sp}/particles"),
    ]
    try:
        summary = td.batch(operations)
    except Exception as e:
        res.step("t3_batch", False, f"HTTP call failed: {e}")
        return

    results = summary.get("results", [])
    all_ok = len(results) == 3 and all(_op_succeeded(r) for r in results)
    res.step(
        "t3_batch",
        all_ok,
        f"total={summary.get('total')}, "
        f"statuses={[r.get('status') for r in results]}",
    )

    # Verify sizex actually persisted by reading it back via /exec.
    try:
        raw = td.exec("print(op(%r).par.sizex.eval())" % f"{sp}/box")
        value = float(raw.strip().splitlines()[-1])
        res.step("t3_verify_sizex", value == 2.0, f"sizex={value}")
    except Exception as e:
        res.step("t3_verify_sizex", False, f"read-back failed: {e}")


# ─── Test 4: POST /batch with partial error (1 good + 1 bad route) ───────────


def test_4_partial_error(td: TDClient, res: TestResult) -> None:
    print("\n--- Test 4: /batch — partial error (1 good GET /info + 1 bad 404 route) ---")
    operations = [
        {"method": "GET", "path": "/info", "body": {}},
        {"method": "GET", "path": "/__nonexistent_batch_route__", "body": {}},
    ]
    try:
        summary = td.batch(operations)
    except Exception as e:
        res.step("t4_batch", False, f"HTTP call failed: {e}")
        return

    results = summary.get("results", [])
    if len(results) != 2:
        res.step("t4_batch", False, f"expected 2 results, got {len(results)}")
        return

    good_status = results[0].get("status")
    bad_status = results[1].get("status")
    # Wrapper must still complete both; the per-op status distinguishes them.
    completed_ok = summary.get("completed") == 2
    good_ok = good_status == 200
    bad_ok = isinstance(bad_status, int) and bad_status >= 400  # 404 expected
    res.step(
        "t4_batch",
        completed_ok and good_ok and bad_ok,
        f"good.status={good_status}, bad.status={bad_status}, "
        f"hasError={summary.get('hasError')}, completed={summary.get('completed')}",
    )


# ─── Test 5: GET /verify endpoint check ──────────────────────────────────────


def test_5_verify_endpoint(td: TDClient, res: TestResult) -> None:
    print("\n--- Test 5: GET /verify on sandbox ---")
    try:
        v = td.get_json(f"/verify?path={SANDBOX_PATH}")
    except Exception as e:
        res.step("t5_verify", False, f"HTTP call failed: {e}")
        return

    healthy = bool(v.get("healthy", False))
    op_count = int(v.get("operator_count", -1))
    err_count = int(v.get("error_count", -1))
    # We created exactly 4 POP nodes (box, noise, particles, null).
    ok = healthy and op_count >= 4
    res.step(
        "t5_verify",
        ok,
        f"healthy={healthy}, operator_count={op_count}, error_count={err_count}",
    )


# ─── Test 6: Cleanup sandbox ─────────────────────────────────────────────────


def test_6_cleanup(td: TDClient, res: TestResult) -> None:
    print("\n--- Test 6: cleanup sandbox ---")
    try:
        td.exec(
            "c = op(%r); c.destroy() if c is not None else None" % SANDBOX_PATH
        )
        gone = td.exec(
            "print('GONE' if op(%r) is None else 'STILL_HERE')" % SANDBOX_PATH
        ).strip()
        res.step(
            "t6_cleanup",
            gone == "GONE",
            "destroyed" if gone == "GONE" else f"still present ({gone})",
        )
    except Exception as e:
        res.step("t6_cleanup", False, str(e))


# ─── Main ────────────────────────────────────────────────────────────────────


def main() -> int:
    # Fallback encoding: reconfigure stdout to handle UTF-8 even
    # on Windows cp1252 terminals (prevents UnicodeEncodeError).
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

    parser = argparse.ArgumentParser(
        description="Simple live TouchDesigner POST /batch endpoint test."
    )
    parser.add_argument("--host", default=DEFAULT_HOST)
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    args = parser.parse_args()

    print("=" * 72)
    print("  Simple /batch Endpoint Test — TouchDesigner HTTP API")
    print(f"  Target:  http://{args.host}:{args.port}")
    print(f"  Sandbox: {SANDBOX_PATH}")
    print("=" * 72)

    td = TDClient(args.host, args.port)
    res = TestResult()

    if not td.ping():
        print("\nFAIL: TouchDesigner HTTP API not reachable "
              f"(http://{args.host}:{args.port}/info).")
        return 2

    print("\n[setup] TD server reachable.")

    # Run the 6 tests + 1 wiring setup. Cleanup always runs last.
    test_1_create_container_and_box(td, res)
    test_2_create_three_pops(td, res)
    setup_wire_chain(td, res)
    test_3_set_params(td, res)
    test_4_partial_error(td, res)
    test_5_verify_endpoint(td, res)
    test_6_cleanup(td, res)

    total = len(res.steps)
    passed = sum(1 for s in res.steps if s["ok"])
    print(f"\n{'=' * 72}")
    print(f"RESULT: {passed}/{total} checks passed")
    if res.passed:
        print("\nOVERALL: PASS — /batch endpoint works as expected "
              "(create, multi-op, set params, partial error, verify, cleanup).")
        return 0
    else:
        print(f"\nOVERALL: FAIL — {len(res.failures)} check(s) failed:")
        for f in res.failures:
            print(f"  - {f}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
