#!/usr/bin/env python3
"""
POP Integration Test — Live TouchDesigner HTTP API
==================================================

Exercises the live TouchDesigner HTTP API (port 44444) to create, wire,
verify, and clean up a POP operator network inside an isolated sandbox
container. It NEVER touches existing /project1 operators.

Network built (single-source linear POP chain):
    boxPOP  ->  noisePOP  ->  particlePOP  ->  nullPOP

Phases:
  1. Create sandbox container at /project1/test_pop_integration
  2. Create the four POP operators (topological order: source first)
  3. Set key parameters on each (birthrate, amp, lifeexpect, ...)
  4. Wire connections source -> target (topological order)
  5. Position nodes with uniform spacing (no overlap)
  6. Verify: every node has zero TD runtime errors
  7. Report results (pass/fail with per-operator details)
  8. ALWAYS clean up (destroy the sandbox container), even on failure

Exit code 0 = pass, non-zero = fail. Safe to re-run: any stale sandbox
container is destroyed up-front.

Usage:
    python toe/src/test_pop_integration.py
    python toe/src/test_pop_integration.py --host 127.0.0.1 --port 44444
"""

from __future__ import annotations

import argparse
import sys
import time

from td_test_harness import (
    TDClient, TestResult, _py_repr, DEFAULT_HOST, DEFAULT_PORT,
    create_sandbox, cleanup_sandbox, inspect_nodes,
    create_operators, set_params, wire_connections, position_nodes,
    check_overlap, verify_endpoint, verify_connections, verify_no_errors,
)

# ─── Configuration ──────────────────────────────────────────────────────────

SANDBOX_PARENT = "/project1"
SANDBOX_NAME = "test_pop_integration"
SANDBOX_PATH = f"{SANDBOX_PARENT}/{SANDBOX_NAME}"

NODE_SPACING_X = 300
NODE_Y = 0

NETWORK = [
    {
        "name": "box1",
        "opType": "boxPOP",
        "label": "Box Source",
        "x": -1 * NODE_SPACING_X,
        "y": NODE_Y,
        "key_params": {"sizex": 1.5, "depth": 8},
        "is_source": True,
    },
    {
        "name": "noise1",
        "opType": "noisePOP",
        "label": "Noise Deform",
        "x": 0,
        "y": NODE_Y,
        "key_params": {"amp0": 0.5, "noisesize": 2.0, "harmon": 0.6},
        "is_source": False,
    },
    {
        "name": "particles1",
        "opType": "particlePOP",
        "label": "Particle Solver",
        "x": 1 * NODE_SPACING_X,
        "y": NODE_Y,
        "key_params": {"birthrate": 100, "life": 3.0, "maxparticles": 500},
        "is_source": False,
    },
    {
        "name": "out1",
        "opType": "nullPOP",
        "label": "Output Null",
        "x": 2 * NODE_SPACING_X,
        "y": NODE_Y,
        "key_params": {},
        "is_source": False,
    },
]

CONNECTIONS = [
    ("box1", "noise1"),
    ("noise1", "particles1"),
    ("particles1", "out1"),
]


def build_network(td: TDClient, res: TestResult) -> None:
    """Phases 1-5: create container, nodes, params, wiring, layout."""
    if not create_sandbox(td, SANDBOX_PATH, res):
        return

    created = create_operators(td, SANDBOX_PATH, NETWORK, res=res)
    if len(created) != len(NETWORK):
        return

    set_params(td, SANDBOX_PATH, NETWORK, res=res)
    wire_connections(td, CONNECTIONS, created, res=res)
    position_nodes(td, SANDBOX_PATH, NETWORK, res=res)


def verify_network(td: TDClient, res: TestResult) -> None:
    """Phase 6: verify no TD runtime errors and correct topology."""
    nodes = inspect_nodes(td, SANDBOX_PATH, res)
    by_name = {n["name"]: n for n in nodes}

    for node in NETWORK:
        n = by_name.get(node["name"])
        if n is None:
            res.step(f"present_{node['name']}", False, "operator not found")
        else:
            ok = n["opType"] == node["opType"]
            res.step(
                f"present_{node['name']}",
                ok,
                f"opType={n['opType']}" + ("" if ok else f" (expected {node['opType']})"),
            )

    verify_no_errors(nodes, res=res)
    verify_connections(CONNECTIONS, by_name, SANDBOX_PATH, res=res)

    for node in NETWORK:
        n = by_name.get(node["name"])
        if n is None:
            continue
        connected_inputs = [inp for inp in n["inputs"] if inp]
        if node["is_source"]:
            ok = not connected_inputs
            res.step(
                f"topo_{node['name']}",
                ok,
                "source has no inputs" if ok else f"source unexpectedly has inputs {connected_inputs}",
            )
        else:
            ok = len(connected_inputs) >= 1
            res.step(
                f"topo_{node['name']}",
                ok,
                f"has {len(connected_inputs)} input connection(s)" if ok else "missing input connection",
            )

    check_overlap(nodes, min_dx=200, min_dy=150, res=res)
    verify_endpoint(td, SANDBOX_PATH, res=res)


# ─── Main ────────────────────────────────────────────────────────────────────

def main() -> int:
    parser = argparse.ArgumentParser(description="POP integration test against live TouchDesigner.")
    parser.add_argument("--host", default=DEFAULT_HOST)
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    args = parser.parse_args()

    print("=" * 72)
    print("POP Integration Test — TouchDesigner HTTP API")
    print(f"Target: http://{args.host}:{args.port}")
    print(f"Sandbox: {SANDBOX_PATH}")
    print(f"Network: {' -> '.join(c[0] for c in CONNECTIONS)} -> nullPOP")
    print("=" * 72)

    td = TDClient(args.host, args.port)
    res = TestResult()

    if not td.ping():
        print("FAIL: TouchDesigner HTTP API not reachable.")
        return 2

    print("\n[setup] TD server reachable.")

    try:
        print("\n--- Build phase ---")
        build_network(td, res)

        print("\n--- Verify phase ---")
        verify_network(td, res)
    finally:
        print("\n--- Cleanup phase (always runs) ---")
        cleanup_sandbox(td, SANDBOX_PATH, res)

    print("\n" + "=" * 72)
    passed, total = res.summary()
    print(f"RESULT: {passed}/{total} checks passed")
    if res.failures:
        print("FAILURES:")
        for f in res.failures:
            print(f"  - {f}")
        print("\nOVERALL: FAIL")
        return 1
    print("\nOVERALL: PASS — POP network built, wired, verified, cleaned up.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
