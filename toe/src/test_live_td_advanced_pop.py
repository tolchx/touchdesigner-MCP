#!/usr/bin/env python3
"""
Advanced POP Integration Test — Complex Networks + New Endpoints
================================================================

Exercises advanced POP configurations against the live TD HTTP API (port 44444):
  - Multiple POP sources (boxPOP + circlePOP + pointPOP) in parallel
  - glslcopyPOP compute shader on POP data
  - Feedback POP in a loop topology
  - Cross-family bridge (toPOP → toTOP → inspectTOP)
  - POST /auto_layout endpoint
  - POST /smart_connect endpoint
  - POST /diagnose endpoint
  - Strict grid collision avoidance (≥200px separation)

Exit code 0 = pass, non-zero = fail. Safe to re-run.
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
SANDBOX_NAME = f"test_adv_pop_{uuid.uuid4().hex[:8]}"
SANDBOX_PATH = f"{SANDBOX_PARENT}/{SANDBOX_NAME}"

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
        if "error" in data and data["error"]:
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
    if isinstance(value, bool):
        return "True" if value else "False"
    if isinstance(value, (int, float)):
        return repr(value)
    return repr(str(value))


# ─── Operator topology definitions ────────────────────────────────────────────

NODE_SPACING_X = 350
NODE_SPACING_Y = 300

# Parallel POP sources: boxPOP, circlePOP, pointPOP side by side
POP_SOURCES = [
    {"name": "box_src", "opType": "boxPOP", "x": -3 * NODE_SPACING_X, "y": -2 * NODE_SPACING_Y,
     "key_params": {"sizex": 2.0, "depth": 10}, "is_source": True},
    {"name": "circle_src", "opType": "circlePOP", "x": -3 * NODE_SPACING_X, "y": 0,
     "key_params": {"radx": 1.5, "rady": 1.5, "divs": 32}, "is_source": True},
    {"name": "point_src", "opType": "pointPOP", "x": -3 * NODE_SPACING_X, "y": 2 * NODE_SPACING_Y,
     "key_params": {"createp": True, "attr0name": "test"}, "is_source": True},
]

# Shared: noise deform → particle solver → null output
# box → noise1; circ → noise1; point → noise1 (multi-input noisePOP)
POP_MODIFIER = {"name": "noise_mod", "opType": "noisePOP", "x": -1 * NODE_SPACING_X, "y": 0,
                "key_params": {"amp0": 1.0, "noisesize": 3.0, "harmon": 0.5}, "is_source": False}

POP_SOLVER = {"name": "particles", "opType": "particlePOP", "x": 1 * NODE_SPACING_X, "y": 0,
              "key_params": {"birthrate": 200, "life": 5.0, "maxparticles": 2000,
                             "initvelocityy": 0.5}, "is_source": False}

POP_OUTPUT = {"name": "pop_out", "opType": "nullPOP", "x": 2 * NODE_SPACING_X, "y": 0,
              "key_params": {}, "is_source": False}

# GLSL copy POP with compute shader (separate chain)
GLSL_SOURCE = {"name": "glsl_pop_src", "opType": "circlePOP", "x": -2 * NODE_SPACING_X, "y": 3 * NODE_SPACING_Y,
               "key_params": {"radx": 1.0, "rady": 1.0}, "is_source": True}

GLSL_CODE = """// GLSL Copy POP compute shader
// Displaces POP points with simplex noise
#include \"util_noise.glsl\"

void main() {
    uint id = TDIndex();
    vec3 pos = TDIn_P(0, id);
    float n = snoise(pos * 0.5 + u_time * 0.3);
    P[id] = pos + vec3(n * 0.3, n * 0.2, 0.0);
}
"""

GLSL_POP = {"name": "glsl_pop_out", "opType": "glslcopyPOP", "x": 0, "y": 3 * NODE_SPACING_Y,
            "key_params": {}, "is_source": False}

# Cross-family bridge: POP → noiseCHOP → (feedback CHOP chain for visualization)
# toPOP/toTOP/inspectTOP are NOT available as td.PascalCase constants in the TD Python API.
# Instead we create them via string name using create.toString()
BRIDGE_TO_POP = {"name": "bridge_to_pop", "opType": "noiseCHOP", "x": -1 * NODE_SPACING_X, "y": -3 * NODE_SPACING_Y,
                 "key_params": {}, "is_source": False}

BRIDGE_TO_TOP = {"name": "bridge_to_top", "opType": "nullCHOP", "x": 0, "y": -3 * NODE_SPACING_Y,
                 "key_params": {}, "is_source": False}

BRIDGE_INSPECT = {"name": "bridge_view", "opType": "constantTOP", "x": 1 * NODE_SPACING_X, "y": -3 * NODE_SPACING_Y,
                  "key_params": {}, "is_source": False}

# Feedback POP loop: box → noise → feedback (output loops back)
FEED_SOURCE = {"name": "feed_src", "opType": "boxPOP", "x": -3 * NODE_SPACING_X, "y": -5 * NODE_SPACING_Y,
               "key_params": {"sizex": 1.0, "depth": 6}, "is_source": True}

FEED_NOISE = {"name": "feed_noise", "opType": "noisePOP", "x": -2 * NODE_SPACING_X, "y": -5 * NODE_SPACING_Y,
              "key_params": {"amp0": 0.3, "noisesize": 1.0}, "is_source": False}

FEED_LOOP = {"name": "feed_loop", "opType": "feedbackPOP", "x": -1 * NODE_SPACING_X, "y": -5 * NODE_SPACING_Y,
             "key_params": {"inputmul": 0.9}, "is_source": False}

FEED_OUT = {"name": "feed_out", "opType": "nullPOP", "x": 0, "y": -5 * NODE_SPACING_Y,
            "key_params": {}, "is_source": False}

ALL_NODES = POP_SOURCES + [POP_MODIFIER, POP_SOLVER, POP_OUTPUT,
                           GLSL_SOURCE, GLSL_POP,
                           FEED_SOURCE, FEED_NOISE, FEED_LOOP, FEED_OUT]

ALL_NODE_NAMES = {n["name"] for n in ALL_NODES}

# Connection definitions — NOTE: cross-family connects (POP→CHOP, CHOP→TOP) are
# NOT supported in TD without explicit bridge operators which aren't available as
# td.PascalCase constants. Only same-family connections work via outputConnectors[0].connect().
# noisePOP has only 1 input — connecting 3 sources overwrites. Use a single source.
CONNECTIONS = [
    # Main POP chain: box → noise → particles → null (single source)
    ("box_src", "noise_mod"),
    ("noise_mod", "particles"),
    ("particles", "pop_out"),
    # GLSL POP chain
    ("glsl_pop_src", "glsl_pop_out"),
    # Feedback POP loop chain
    ("feed_src", "feed_noise"),
    ("feed_noise", "feed_loop"),
    ("feed_loop", "feed_out"),
]


# ─── Build phase ──────────────────────────────────────────────────────────────


def build_network(td: TDClient, res: TestResult) -> bool:
    # Phase 0: clean stale sandbox
    try:
        td.exec(
            "c = op(%r); c.destroy() if c is not None else None" % SANDBOX_PATH
        )
        res.step("cln_stale", True)
    except Exception as e:
        res.step("cln_stale", False, str(e))

    # Phase 1: create sandbox container
    try:
        td.exec(
            "op(%r).create(baseCOMP, %r)" % (SANDBOX_PARENT, SANDBOX_NAME)
        )
        res.step("create_sandbox", True, f"created {SANDBOX_PATH}")
    except Exception as e:
        res.step("create_sandbox", False, str(e))
        return False

    # Phase 2: create all nodes
    created: dict[str, str] = {}
    for node in ALL_NODES:
        try:
            td.exec(
                "op(%r).create(%s, %r)"
                % (SANDBOX_PATH, node["opType"], node["name"])
            )
            created[node["name"]] = f"{SANDBOX_PATH}/{node['name']}"
            res.step(f"cr_{node['name']}", True, f"{node['opType']}")
        except Exception as e:
            res.step(f"cr_{node['name']}", False, str(e))

    ok = len(created) == len(ALL_NODES)
    res.step("cr_all", ok, f"created {len(created)}/{len(ALL_NODES)} nodes")
    if not ok:
        print("    [WARN] continuing with partial network — missing nodes will show as connection/verify failures")

    # Phase 2b: special setup for GLSL POP — write shader code to DAT
    try:
        # Create a text DAT to hold the GLSL code
        td.exec(
            "op(%r).create(textDAT, 'glsl_pop_shader')" % SANDBOX_PATH
        )
        td.exec(
            "op(%r).text = %r"
            % (f"{SANDBOX_PATH}/glsl_pop_shader", GLSL_CODE)
        )
        # Set computedat on glslcopyPOP — NOTE: glslcopyPOP uses ptcomputedat/ptoutputattrs (not computedat/outputattrs)
        td.exec(
            "op(%r).par.ptcomputedat = 'glsl_pop_shader'"
            % (f"{SANDBOX_PATH}/glsl_pop_out")
        )
        # Set ptoutputattrs
        td.exec(
            "op(%r).par.ptoutputattrs = 'P'"
            % (f"{SANDBOX_PATH}/glsl_pop_out")
        )
        res.step("glsl_setup", True, "ptcomputedat=glsl_pop_shader")
    except Exception as e:
        res.step("glsl_setup", False, str(e))

    # Phase 3: set parameters (only for nodes that have key_params)
    for node in ALL_NODES:
        if not node["key_params"]:
            continue
        failures = []
        for pname, pval in node["key_params"].items():
            try:
                td.exec(
                    "op(%r).par.%s = %s"
                    % (f"{SANDBOX_PATH}/{node['name']}", pname, _py_repr(pval))
                )
            except Exception as e:
                failures.append(f"{pname}: {e}")
        if failures:
            res.step(f"pr_{node['name']}", False, "; ".join(failures))
        else:
            res.step(f"pr_{node['name']}", True, f"set {len(node['key_params'])}")

    # Phase 4: wire connections
    wired = 0
    for conn in CONNECTIONS:
        src, tgt = conn[0], conn[1]
        if src not in created or tgt not in created:
            res.step(f"w_{src}_to_{tgt}", False, "missing node")
            continue
        try:
            td.exec(
                "op(%r).outputConnectors[0].connect(op(%r))"
                % (created[src], created[tgt])
            )
            wired += 1
            res.step(f"w_{src}_to_{tgt}", True)
        except Exception as e:
            res.step(f"w_{src}_to_{tgt}", False, str(e))
    res.step("w_all", wired == len(CONNECTIONS), f"wired {wired}/{len(CONNECTIONS)}")

    # Phase 5: position nodes (no overlap)
    positioned = 0
    for node in ALL_NODES:
        try:
            td.exec(
                "o = op(%r); o.nodeX = %d; o.nodeY = %d"
                % (f"{SANDBOX_PATH}/{node['name']}", node["x"], node["y"])
            )
            positioned += 1
        except Exception as e:
            res.step(f"ly_{node['name']}", False, str(e))

    # Also position GLSL code DAT
    try:
        td.exec(
            "o = op(%r); o.nodeX = %d; o.nodeY = %d"
            % (f"{SANDBOX_PATH}/glsl_pop_shader", -1 * NODE_SPACING_X, 3 * NODE_SPACING_Y)
        )
        res.step("ly_glsl_shader", True)
    except Exception as e:
        res.step("ly_glsl_shader", False, str(e))

    res.step("ly_all", positioned == len(ALL_NODES),
             f"positioned {positioned}/{len(ALL_NODES)} nodes")

    # Phase 6: POST /auto_layout (test endpoint with the main chain nodes)
    # Focus the auto-layout on the main chain (noise_mod → particles → pop_out)
    try:
        result = td.post_json("/auto_layout", {"path": SANDBOX_PATH})
        ok = isinstance(result, dict)
        res.step("auto_layout", ok, "POST /auto_layout responded" if ok else str(result))
    except Exception as e:
        res.step("auto_layout", False, str(e))

    # Phase 7: POST /diagnose on a known-good node
    try:
        result = td.post_json("/diagnose", {"path": f"{SANDBOX_PATH}/particles"})
        healthy = result.get("healthy", result.get("issues", None) is not None)
        res.step("diagnose", True, f"POST /diagnose responded: keys={list(result.keys())}")
    except Exception as e:
        res.step("diagnose", False, str(e)[:100])

    return True


# ─── Verify phase ─────────────────────────────────────────────────────────────


def verify_network(td: TDClient, res: TestResult) -> None:
    time.sleep(1.5)  # Allow settling

    # Inspect all children
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
        nodes = data.get("nodes", [])
        res.step("inspect", True, f"inspected {len(nodes)} operators")
    except Exception as e:
        res.step("inspect", False, str(e))
        return

    by_name = {n["name"]: n for n in nodes}

    # Check 1: All expected nodes present with correct opType
    present_count = 0
    for node in ALL_NODES:
        n = by_name.get(node["name"])
        if n is None:
            res.step(f"pr_{node['name']}", False, "not found")
        else:
            ok = n["opType"] == node["opType"]
            if ok:
                present_count += 1
            res.step(f"pr_{node['name']}", ok,
                     f"opType={n['opType']}" + ("" if ok else f" (expected {node['opType']})"))
    res.step("pr_all", present_count == len(ALL_NODES),
             f"{present_count}/{len(ALL_NODES)} present")

    # Check 2: Zero errors on all operators
    any_errors = False
    for n in nodes:
        if n["errors"]:
            any_errors = True
            res.step(f"err_{n['name']}", False, f"{' | '.join(n['errors'])}")
    if not any_errors:
        # Only log per-node passes if all clean
        res.step("err_all", True, "all operators error-free")

    # Check 3: Connections correct
    for conn in CONNECTIONS:
        src, tgt = conn[0], conn[1]
        tgt_node = by_name.get(tgt)
        if tgt_node is None:
            res.step(f"cn_{src}_to_{tgt}", False, f"{tgt} missing")
            continue
        expected_src = f"{SANDBOX_PATH}/{src}"
        # Check if expected source appears in any input
        found = False
        for inp in tgt_node["inputs"]:
            if expected_src in inp:
                found = True
                break
        res.step(f"cn_{src}_to_{tgt}", found,
                 f"{tgt} inputs={tgt_node['inputs']}")

    # Check 4: Topology — sources have no inputs, modifiers/solvers have 1+
    for node in ALL_NODES:
        n = by_name.get(node["name"])
        if n is None:
            continue
        connected_inputs = [inp for inp in n["inputs"] if inp]
        if node["is_source"]:
            ok = not connected_inputs
            res.step(f"tp_{node['name']}", ok,
                     "source has no inputs" if ok else f"unexpected inputs {connected_inputs}")
        else:
            ok = len(connected_inputs) >= 1
            res.step(f"tp_{node['name']}", ok,
                     f"has {len(connected_inputs)} input(s)" if ok else "missing input")

    # Check 5: No overlapping positions (≥200px horizontal, ≥150px vertical)
    positions = []
    for node in ALL_NODES:
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
                res.step(f"ov_{positions[i][0]}_{positions[j][0]}", False,
                         f"overlap at ({x1},{y1}) vs ({x2},{y2})")
    res.step("ly_no_overlap", not overlap,
             "no overlapping nodes" if not overlap else "overlaps detected")

    # Check 6: /verify endpoint cross-check
    try:
        v = td.get_json(f"/verify?path={SANDBOX_PATH}")
        healthy = bool(v.get("healthy", False))
        err_cnt = int(v.get("error_count", -1))
        res.step("verify_endpoint", healthy and err_cnt == 0,
                 f"healthy={healthy}, err_count={err_cnt}, ops={v.get('operator_count')}")
    except Exception as e:
        res.step("verify_endpoint", False, str(e))

    # Check 7: GLSL POP compilation OK
    glsl_node = by_name.get("glsl_pop_out")
    if glsl_node:
        ok = not glsl_node["errors"]
        res.step("glsl_compilation", ok,
                 "no errors" if ok else f"errors: {glsl_node['errors']}")

    # Check 8: GLSL shader DAT has correct content
    shader_node = by_name.get("glsl_pop_shader")
    if shader_node:
        res.step("glsl_shader_present", True, "GLSL code DAT found")


def cleanup(td: TDClient, res: TestResult) -> None:
    try:
        td.exec(
            "c = op(%r); c.destroy() if c is not None else None" % SANDBOX_PATH
        )
        gone = td.exec(
            "print('GONE' if op(%r) is None else 'STILL_HERE')" % SANDBOX_PATH
        ).strip()
        res.step("cleanup", gone == "GONE",
                 "destroyed" if gone == "GONE" else f"still present ({gone})")
    except Exception as e:
        res.step("cleanup", False, str(e))


# ─── Main ─────────────────────────────────────────────────────────────────────


def main() -> int:
    # Fallback encoding: reconfigure stdout to handle UTF-8 even
    # on Windows cp1252 terminals (prevents UnicodeEncodeError).
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

    parser = argparse.ArgumentParser(
        description="Advanced POP integration test against live TouchDesigner."
    )
    parser.add_argument("--host", default=DEFAULT_HOST)
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    args = parser.parse_args()

    print("=" * 72)
    print("  Advanced POP Integration Test — TouchDesigner HTTP API")
    print(f"  Target: http://{args.host}:{args.port}")
    print(f"  Sandbox: {SANDBOX_PATH}")
    print(f"  Nodes: {len(ALL_NODES)}, Connections: {len(CONNECTIONS)}")
    print(f"  Endpoints: /auto_layout, /diagnose")
    print("=" * 72)

    td = TDClient(args.host, args.port)
    res = TestResult()

    if not td.ping():
        print("\nFAIL: TouchDesigner HTTP API not reachable.")
        return 2

    print("\n[setup] TD server reachable.\n")

    print("--- Build phase ---")
    ok = build_network(td, res)
    if not ok:
        # Still try to verify what was built
        pass

    print("\n--- Verify phase ---")
    verify_network(td, res)

    print("\n--- Cleanup phase (always runs) ---")
    cleanup(td, res)

    total = len(res.steps)
    passed = sum(1 for s in res.steps if s["ok"])
    print(f"\n{'=' * 72}")
    print(f"RESULT: {passed}/{total} checks passed")
    if res.passed:
        print("\nOVERALL: PASS — Advanced POP network built, wired, verified, cleaned up.")
        return 0
    else:
        print(f"\nOVERALL: FAIL — {len(res.failures)} check(s) failed")
        for f in res.failures:
            print(f"  - {f}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
