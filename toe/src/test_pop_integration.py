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
import json
import sys
import time
import urllib.error
import urllib.request

# ─── Configuration ──────────────────────────────────────────────────────────

DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 44444
DEFAULT_TIMEOUT = 20  # seconds per HTTP call

SANDBOX_PARENT = "/project1"
SANDBOX_NAME = "test_pop_integration"
SANDBOX_PATH = f"{SANDBOX_PARENT}/{SANDBOX_NAME}"

# The POP network to build. Order matters: sources must be created/wired first
# (topological order). Parameters are per-operator; each (name, value) pair is
# applied via op().par.<name> = <value>. They are expected to succeed; failures
# are reported but non-key params do not abort the run.
NODE_SPACING_X = 300  # horizontal spacing between nodes (px)
NODE_Y = 0

NETWORK = [
    {
        "name": "box1",
        "opType": "boxPOP",
        "label": "Box Source",
        "x": -1 * NODE_SPACING_X,
        "y": NODE_Y,
        "key_params": {
            # boxPOP: source that scatters points on a box primitive.
            # Real par names discovered from TD (see test_pop_network_params).
            "sizex": 1.5,       # box size along X (also sizey/sizez exist)
            "depth": 8,         # subdivision depth -> denser point cloud
        },
        "is_source": True,
    },
    {
        "name": "noise1",
        "opType": "noisePOP",
        "label": "Noise Deform",
        "x": 0,
        "y": NODE_Y,
        "key_params": {
            "amp0": 0.5,        # displacement amplitude
            "noisesize": 2.0,   # noise size (spatial frequency)
            "harmon": 0.6,      # harmonics (noise roughness/detail)
        },
        "is_source": False,
    },
    {
        "name": "particles1",
        "opType": "particlePOP",
        "label": "Particle Solver",
        "x": 1 * NODE_SPACING_X,
        "y": NODE_Y,
        "key_params": {
            "birthrate": 100,   # particles spawned per second
            "life": 3.0,        # life expectancy (seconds)
            "maxparticles": 500,
        },
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

# Connections, in topological order (source-first). Each entry wires
#   source.outputConnectors[0].connect(target)
CONNECTIONS = [
    ("box1", "noise1"),
    ("noise1", "particles1"),
    ("particles1", "out1"),
]


# ─── HTTP helper ─────────────────────────────────────────────────────────────


class TDClient:
    """Minimal urllib-based client for the TouchDesigner HTTP API."""

    def __init__(self, host: str, port: int, timeout: int = DEFAULT_TIMEOUT):
        self.base = f"http://{host}:{port}"
        self.timeout = timeout

    def exec(self, code: str) -> str:
        """POST code to /exec. Returns stdout output string. Raises on error."""
        payload = json.dumps({"code": code}).encode("utf-8")
        req = urllib.request.Request(
            f"{self.base}/exec",
            data=payload,
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=self.timeout) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        if "error" in data and data["error"]:
            raise RuntimeError(f"TD exec error: {data['error']}")
        return data.get("output", "")

    def get_json(self, path: str) -> dict:
        """GET a JSON endpoint (e.g. /verify?path=...)."""
        url = f"{self.base}{path}"
        with urllib.request.urlopen(url, timeout=self.timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))

    def ping(self) -> bool:
        """Return True if the TD server responds to /info."""
        try:
            self.get_json("/info")
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


def _py_repr(value) -> str:
    """Render a Python value for embedding in generated TD code."""
    if isinstance(value, bool):
        return "True" if value else "False"
    if isinstance(value, (int, float)):
        return repr(value)
    # string fallback
    return repr(str(value))


def build_network(td: TDClient, res: TestResult) -> None:
    """Phases 1-5: create container, nodes, params, wiring, layout."""

    # ── Phase 0: clean any stale sandbox (idempotent re-runs) ──
    try:
        td.exec(
            "c = op(%r); c.destroy() if c is not None else None" % SANDBOX_PATH
        )
        res.step("cleanup_stale", True, "removed pre-existing sandbox if any")
    except Exception as e:  # noqa: BLE001
        res.step("cleanup_stale", False, str(e))

    # ── Phase 1: create sandbox container ──
    try:
        td.exec(
            "op(%r).create(baseCOMP, %r)" % (SANDBOX_PARENT, SANDBOX_NAME)
        )
        res.step("create_container", True, f"created {SANDBOX_PATH}")
    except Exception as e:  # noqa: BLE001
        res.step("create_container", False, str(e))
        return  # nothing else can run without a container

    # ── Phase 2: create operators (topological order) ──
    created: dict[str, dict] = {}
    for node in NETWORK:
        path = f"{SANDBOX_PATH}/{node['name']}"
        try:
            td.exec(
                "op(%r).create(%s, %r)"
                % (SANDBOX_PATH, node["opType"], node["name"])
            )
            created[node["name"]] = {**node, "path": path}
            res.step(
                f"create_{node['name']}",
                True,
                f"{node['opType']} @ {path}",
            )
        except Exception as e:  # noqa: BLE001
            res.step(f"create_{node['name']}", False, str(e))

    if len(created) != len(NETWORK):
        res.step(
            "create_all_nodes",
            False,
            f"only created {len(created)}/{len(NETWORK)} operators",
        )
        return

    res.step("create_all_nodes", True, f"created {len(created)} operators")

    # ── Phase 3: set key parameters ──
    for node in NETWORK:
        if not node["key_params"]:
            continue
        failures = []
        for pname, pval in node["key_params"].items():
            try:
                td.exec(
                    "op(%r).par.%s = %s"
                    % (f"{SANDBOX_PATH}/{node['name']}", pname, _py_repr(pval))
                )
            except Exception as e:  # noqa: BLE001
                failures.append(f"{pname}: {e}")
        if failures:
            res.step(
                f"params_{node['name']}",
                False,
                "; ".join(failures),
            )
        else:
            res.step(
                f"params_{node['name']}",
                True,
                f"set {len(node['key_params'])} param(s)",
            )

    # ── Phase 4: wire connections (topological order) ──
    wired = 0
    for src_name, tgt_name in CONNECTIONS:
        if src_name not in created or tgt_name not in created:
            res.step(
                f"wire_{src_name}_to_{tgt_name}",
                False,
                "source or target not created",
            )
            continue
        src_path = created[src_name]["path"]
        tgt_path = created[tgt_name]["path"]
        try:
            td.exec(
                "op(%r).outputConnectors[0].connect(op(%r))"
                % (src_path, tgt_path)
            )
            wired += 1
            res.step(
                f"wire_{src_name}_to_{tgt_name}",
                True,
                f"{src_path} -> {tgt_path}",
            )
        except Exception as e:  # noqa: BLE001
            res.step(
                f"wire_{src_name}_to_{tgt_name}",
                False,
                str(e),
            )
    res.step(
        "wire_all",
        wired == len(CONNECTIONS),
        f"wired {wired}/{len(CONNECTIONS)} connections",
    )

    # ── Phase 5: position nodes (no overlap, uniform spacing) ──
    positioned = 0
    for node in NETWORK:
        try:
            td.exec(
                "o = op(%r); o.nodeX = %d; o.nodeY = %d"
                % (f"{SANDBOX_PATH}/{node['name']}", node["x"], node["y"])
            )
            positioned += 1
        except Exception as e:  # noqa: BLE001
            res.step(f"layout_{node['name']}", False, str(e))
    res.step(
        "layout_all",
        positioned == len(NETWORK),
        f"positioned {positioned}/{len(NETWORK)} nodes",
    )


def verify_network(td: TDClient, res: TestResult) -> None:
    """Phase 6: verify no TD runtime errors and correct topology."""

    # Allow the network one frame to settle before checking errors.
    time.sleep(1.0)

    # ── Inspect every node: path, opType, errors, inputs, position ──
    inspect_code = (
        "import json\n"
        "c = op(%r)\n"
        "out = {'nodes': []}\n"
        "if c is not None:\n"
        "    for n in c.findChildren():\n"
        "        info = {'path': n.path, 'name': n.name,\n"
        "                'opType': getattr(n, 'OPType', '?'),\n"
        "                'errors': list(n.errors()) if n.errors() else [],\n"
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
        data = json.loads(raw.strip().splitlines()[-1]) if raw.strip() else {"nodes": []}
    except Exception as e:  # noqa: BLE001
        res.step("inspect_network", False, f"failed to parse inspection: {e}")
        return

    nodes = data.get("nodes", [])
    res.step("inspect_network", True, f"inspected {len(nodes)} operator(s)")

    by_name = {n["name"]: n for n in nodes}

    # ── Check 1: all four operators present with correct opType ──
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

    # ── Check 2: zero TD runtime errors on every operator ──
    any_errors = False
    for n in nodes:
        if n["errors"]:
            any_errors = True
            res.step(
                f"errors_{n['name']}",
                False,
                f"{n['path']}: {' | '.join(n['errors'])}",
            )
        else:
            res.step(f"errors_{n['name']}", True, "no errors")
    res.step("errors_none", not any_errors, "all operators error-free" if not any_errors else "operator errors detected")

    # ── Check 3: connections wired correctly (source feeds target input 0) ──
    for src_name, tgt_name in CONNECTIONS:
        tgt = by_name.get(tgt_name)
        if tgt is None:
            res.step(f"conn_{src_name}_to_{tgt_name}", False, f"{tgt_name} missing")
            continue
        expected_path = f"{SANDBOX_PATH}/{src_name}"
        # inputs[i] is the list of source paths connected to input connector i
        input_zero = tgt["inputs"][0] if tgt["inputs"] else []
        ok = expected_path in input_zero
        res.step(
            f"conn_{src_name}_to_{tgt_name}",
            ok,
            f"{tgt_name} input[0] sources = {input_zero}",
        )

    # ── Check 4: source node (box1) has no input, others have exactly one ──
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

    # ── Check 5: no overlapping positions ──
    positions = []
    for node in NETWORK:
        n = by_name.get(node["name"])
        if n is not None and n["x"] is not None:
            positions.append((node["name"], n["x"], n["y"]))
    overlap = False
    for i in range(len(positions)):
        for j in range(i + 1, len(positions)):
            _, x1, y1 = positions[i]
            _, x2, y2 = positions[j]
            if abs(x1 - x2) < 200 and abs(y1 - y2) < 150:
                overlap = True
                res.step(
                    f"layout_overlap_{positions[i][0]}_{positions[j][0]}",
                    False,
                    f"overlap at ({x1},{y1}) vs ({x2},{y2})",
                )
    res.step("layout_no_overlap", not overlap, "no overlapping nodes" if not overlap else "overlaps detected")

    # ── Secondary cross-check via /verify endpoint ──
    try:
        verify = td.get_json(f"/verify?path={SANDBOX_PATH}")
        healthy = bool(verify.get("healthy", False))
        err_count = int(verify.get("error_count", -1))
        res.step(
            "verify_endpoint",
            healthy and err_count == 0,
            f"healthy={healthy}, error_count={err_count}, op_count={verify.get('operator_count')}",
        )
    except Exception as e:  # noqa: BLE001
        res.step("verify_endpoint", False, f"/verify call failed: {e}")


def cleanup(td: TDClient, res: TestResult) -> None:
    """Phase 8: ALWAYS destroy the sandbox container."""
    try:
        td.exec(
            "c = op(%r); c.destroy() if c is not None else None" % SANDBOX_PATH
        )
        # Confirm it's gone.
        gone = td.exec(
            "print('GONE' if op(%r) is None else 'STILL_HERE')" % SANDBOX_PATH
        ).strip()
        res.step(
            "cleanup",
            gone == "GONE",
            "sandbox container destroyed" if gone == "GONE" else f"container still present ({gone})",
        )
    except Exception as e:  # noqa: BLE001
        res.step("cleanup", False, str(e))


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

    # Pre-flight: is the server up?
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
        cleanup(td, res)

    # ── Final report ──
    print("\n" + "=" * 72)
    total = len(res.steps)
    passed = sum(1 for s in res.steps if s["ok"])
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
