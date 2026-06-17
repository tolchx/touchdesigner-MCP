#!/usr/bin/env python3
"""
Live TouchDesigner integration test for the POST /auto_layout endpoint.

Creates a deliberately-scattered POP chain inside a sandboxed baseCOMP,
calls /auto_layout on the container, then verifies:

  1. The endpoint responds successfully.
  2. Nodes are repositioned into a clean left-to-right grid.
  3. There are zero errors after layout (post-cook).
  4. Connection integrity is preserved (sources feed downstream nodes).
  5. Grid separation holds: >=200px horizontal, >=150px vertical.

Three rules respected:
  - RULE 1: every op lives inside a UUID-named baseCOMP container.
  - RULE 2: verify at test time AND after a settle/cook delay.
  - RULE 3: grid separation (>=200px X, >=150px Y).

Requires TouchDesigner's HTTP API running on --host/--port (default
127.0.0.1:44444). Exit code 0 = pass, non-zero = fail. Safe to re-run.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.request
import uuid

DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 44444
DEFAULT_TIMEOUT = 30

SANDBOX_PARENT = "/project1"
SANDBOX_NAME = f"al_test_{uuid.uuid4().hex[:8]}"
SANDBOX_PATH = f"{SANDBOX_PARENT}/{SANDBOX_NAME}"

# Deliberately scattered, NOT overlapping, but not an organized grid.
# x positions are all distinct but not in chain order; y is jittered.
NODES = [
    {"name": "al_box",    "opType": "boxPOP",      "x":  900,  "y": -400, "is_source": True},
    {"name": "al_noise",  "opType": "noisePOP",    "x":  100,  "y":  350, "is_source": False},
    {"name": "al_part",   "opType": "particlePOP", "x": -600,  "y": -250, "is_source": False},
    {"name": "al_null",   "opType": "nullPOP",     "x":  450,  "y":  500, "is_source": False},
]

CONNECTIONS = [
    ("al_box", "al_noise"),
    ("al_noise", "al_part"),
    ("al_part", "al_null"),
]


# ─── HTTP client ──────────────────────────────────────────────────────────────


class TDClient:
    def __init__(self, host: str, port: int, timeout: int = DEFAULT_TIMEOUT):
        self.base = f"http://{host}:{port}"
        self.timeout = timeout

    def exec(self, code: str) -> str:
        payload = json.dumps({"code": code}).encode("utf-8")
        req = urllib.request.Request(
            f"{self.base}/exec",
            data=payload,
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=self.timeout) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        if data.get("error"):
            raise RuntimeError(f"TD exec error: {data['error']}")
        return data.get("output", "")

    def get_json(self, path: str) -> dict:
        url = f"{self.base}{path}"
        with urllib.request.urlopen(url, timeout=self.timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))

    def post_json(self, path: str, body: dict) -> dict:
        payload = json.dumps(body).encode("utf-8")
        req = urllib.request.Request(
            f"{self.base}{path}",
            data=payload,
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=self.timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))

    def ping(self) -> bool:
        try:
            self.get_json("/info")
            return True
        except Exception:
            return False


# ─── Test harness ─────────────────────────────────────────────────────────────


passed = 0
failed = 0
failures: list[str] = []


def check(name: str, condition: bool, detail: str = "") -> None:
    global passed, failed
    if condition:
        passed += 1
        print(f"  [PASS] {name}")
    else:
        failed += 1
        msg = f"{name}" + (f": {detail}" if detail else "")
        failures.append(msg)
        print(f"  [FAIL] {msg}")


# ─── Phases ───────────────────────────────────────────────────────────────────


def _py_repr(value) -> str:
    if isinstance(value, bool):
        return "True" if value else "False"
    if isinstance(value, (int, float)):
        return repr(value)
    return repr(str(value))


def cleanup(td: TDClient) -> None:
    print("\n--- Cleanup (always runs) ---")
    try:
        td.exec(
            "c = op(%r); c.destroy() if c is not None else None" % SANDBOX_PATH
        )
        gone = td.exec(
            "print('GONE' if op(%r) is None else 'STILL_HERE')" % SANDBOX_PATH
        ).strip()
        check("cleanup_destroyed", gone == "GONE",
              "destroyed" if gone == "GONE" else f"still present ({gone})")
    except Exception as e:
        check("cleanup_destroyed", False, str(e))


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Live TD integration test for POST /auto_layout."
    )
    parser.add_argument("--host", default=DEFAULT_HOST)
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    args = parser.parse_args()

    print("=" * 72)
    print("  Live TD Auto-Layout Integration Test")
    print(f"  Target:  http://{args.host}:{args.port}")
    print(f"  Sandbox: {SANDBOX_PATH}")
    print(f"  Nodes:   {[n['name'] for n in NODES]}")
    print(f"  Chain:   {' -> '.join(a for a, _ in CONNECTIONS)} -> {CONNECTIONS[-1][1]}")
    print("=" * 72)

    td = TDClient(args.host, args.port)

    if not td.ping():
        print("\nFAIL: TouchDesigner HTTP API not reachable.")
        return 2
    print("\n[setup] TD server reachable.\n")

    # ── Phase 0: cleanup any stale sandbox ──────────────────────────────────
    try:
        td.exec(
            "c = op(%r); c.destroy() if c is not None else None" % SANDBOX_PATH
        )
        check("p0_cleanup_stale", True)
    except Exception as e:
        check("p0_cleanup_stale", False, str(e))

    # ── Phase 1: create the baseCOMP container (RULE 1) ─────────────────────
    try:
        td.exec(
            "op(%r).create(baseCOMP, %r)" % (SANDBOX_PARENT, SANDBOX_NAME)
        )
        check("p1_create_sandbox", True, f"created {SANDBOX_PATH}")
    except Exception as e:
        check("p1_create_sandbox", False, str(e))
        cleanup(td)
        return 1

    # ── Phase 2: create the POP chain ───────────────────────────────────────
    created: dict[str, str] = {}
    for node in NODES:
        try:
            td.exec(
                "op(%r).create(%s, %r)"
                % (SANDBOX_PATH, node["opType"], node["name"])
            )
            created[node["name"]] = f"{SANDBOX_PATH}/{node['name']}"
            check(f"p2_create_{node['name']}", True, node["opType"])
        except Exception as e:
            check(f"p2_create_{node['name']}", False, str(e))
    check("p2_all_nodes",
          len(created) == len(NODES),
          f"{len(created)}/{len(NODES)} nodes created")

    # ── Phase 3: wire the chain (box -> noise -> particles -> null) ─────────
    wired = 0
    for src, tgt in CONNECTIONS:
        if src not in created or tgt not in created:
            check(f"p3_wire_{src}_to_{tgt}", False, "missing node")
            continue
        try:
            td.exec(
                "op(%r).outputConnectors[0].connect(op(%r))"
                % (created[src], created[tgt])
            )
            wired += 1
            check(f"p3_wire_{src}_to_{tgt}", True)
        except Exception as e:
            check(f"p3_wire_{src}_to_{tgt}", False, str(e))
    check("p3_all_wired", wired == len(CONNECTIONS),
          f"{wired}/{len(CONNECTIONS)} wired")

    # ── Phase 4: scatter nodes (deliberately un-organized) ──────────────────
    scattered = 0
    for node in NODES:
        try:
            td.exec(
                "o = op(%r); o.nodeX = %d; o.nodeY = %d"
                % (f"{SANDBOX_PATH}/{node['name']}", node["x"], node["y"])
            )
            scattered += 1
        except Exception as e:
            check(f"p4_scatter_{node['name']}", False, str(e))
    check("p4_scatter_all", scattered == len(NODES),
          f"scattered {scattered}/{len(NODES)} nodes")

    # ── Phase 5: call POST /auto_layout on the container ────────────────────
    try:
        result = td.post_json(
            "/auto_layout",
            {"path": SANDBOX_PATH, "spacing_x": 250, "spacing_y": 80},
        )
        ok = isinstance(result, dict)
        check("p5_auto_layout_response", ok,
              "responded" if ok else f"unexpected: {result}")
    except Exception as e:
        check("p5_auto_layout_response", False, str(e))
        result = None

    # ── Phase 6: verify layout positions (post-cook settle) ─────────────────
    time.sleep(1.5)  # RULE 2: allow cook/settle before re-inspecting

    inspect_code = (
        "import json\n"
        "c = op(%r)\n"
        "out = {'nodes': []}\n"
        "if c is not None:\n"
        "    for n in c.findChildren():\n"
        "        info = {'name': n.name, 'opType': getattr(n, 'OPType', '?'),\n"
        "                'errors': [str(e) for e in n.errors()] if n.errors() else [],\n"
        "                'x': getattr(n, 'nodeX', None),\n"
        "                'y': getattr(n, 'nodeY', None),\n"
        "                'inputs': []}\n"
        "        try:\n"
        "            for ic in n.inputConnectors:\n"
        "                info['inputs'].append([conn.owner.path for conn in ic.connections])\n"
        "        except Exception:\n"
        "            pass\n"
        "        out['nodes'].append(info)\n"
        "print(json.dumps(out))\n"
    ) % SANDBOX_PATH

    try:
        raw = td.exec(inspect_code)
        lines = raw.strip().splitlines()
        data = json.loads(lines[-1]) if lines else {"nodes": []}
        nodes = data.get("nodes", [])
        check("p6_inspect", True, f"inspected {len(nodes)} operators")
    except Exception as e:
        check("p6_inspect", False, str(e))
        cleanup(td)
        return 1

    by_name = {n["name"]: n for n in nodes}

    # ── Phase 6a: all expected nodes present ────────────────────────────────
    present = sum(1 for node in NODES if node["name"] in by_name)
    check("p6a_nodes_present", present == len(NODES),
          f"{present}/{len(NODES)} present")

    # ── Phase 6b: positions now form a clean left-to-right grid ─────────────
    positions = []
    for node in NODES:
        n = by_name.get(node["name"])
        if n and n["x"] is not None:
            positions.append((node["name"], float(n["x"]), float(n["y"])))

    check("p6b_positions_collected", len(positions) == len(NODES),
          f"{len(positions)}/{len(NODES)} positions available")

    if len(positions) == len(NODES):
        # Order nodes by x; chain order should match left-to-right.
        ordered = sorted(positions, key=lambda p: p[1])
        ordered_names = [p[0] for p in ordered]
        expected_order = [n["name"] for n in NODES]  # chain order
        check("p6b_left_to_right_chain",
              ordered_names == expected_order,
              f"got {ordered_names}, expected {expected_order}")

        # RULE 3: grid separation (>=200px X, >=150px Y) for every pair.
        sep_ok = True
        worst = None
        for i in range(len(positions)):
            for j in range(i + 1, len(positions)):
                _, x1, y1 = positions[i]
                _, x2, y2 = positions[j]
                dx = abs(x1 - x2)
                dy = abs(y1 - y2)
                if dx < 200 and dy < 150:
                    sep_ok = False
                    worst = f"{positions[i][0]}({x1},{y1}) vs {positions[j][0]}({x2},{y2})"
                    break
            if not sep_ok:
                break
        check("p6b_grid_separation", sep_ok,
              "clean grid" if sep_ok else f"overlap/under-separated: {worst}")

    # ── Phase 7: verify zero errors after layout (post-cook) ────────────────
    any_errors = False
    for n in nodes:
        if n["errors"]:
            any_errors = True
            check(f"p7_err_{n['name']}", False, " | ".join(n["errors"]))
    if not any_errors:
        check("p7_zero_errors", True, "all operators error-free after layout")

    # ── Phase 8: connection integrity preserved ─────────────────────────────
    for src, tgt in CONNECTIONS:
        tgt_node = by_name.get(tgt)
        if tgt_node is None:
            check(f"p8_conn_{src}_to_{tgt}", False, f"{tgt} missing")
            continue
        expected_src = f"{SANDBOX_PATH}/{src}"
        found = any(expected_src in inp for inp in tgt_node["inputs"])
        check(f"p8_conn_{src}_to_{tgt}", found,
              f"{tgt} inputs={tgt_node['inputs']}")

    # ── Phase 9: /verify endpoint cross-check ───────────────────────────────
    try:
        v = td.get_json(f"/verify?path={SANDBOX_PATH}")
        healthy = bool(v.get("healthy", False))
        err_cnt = int(v.get("error_count", -1))
        check("p9_verify_endpoint", healthy and err_cnt == 0,
              f"healthy={healthy}, err_count={err_cnt}")
    except Exception as e:
        check("p9_verify_endpoint", False, str(e))

    # ── Cleanup (RULE: always) ──────────────────────────────────────────────
    cleanup(td)

    # ── Summary ─────────────────────────────────────────────────────────────
    total = passed + failed
    print(f"\n{'=' * 72}")
    print(f"RESULT: {passed}/{total} checks passed")
    if failed == 0:
        print("\nOVERALL: PASS — auto_layout scattered POP chain, verified grid + zero errors, cleaned up.")
        return 0
    else:
        print(f"\nOVERALL: FAIL — {failed} check(s) failed")
        for f in failures:
            print(f"  - {f}")
        return 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("\nAborted by user.")
        sys.exit(130)
