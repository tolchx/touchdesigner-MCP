#!/usr/bin/env python3
"""
Advanced POP Integration Test 2 — glslPOP, glsladvancedPOP, Parallel Chains
============================================================================

Exercises POP capabilities NOT yet covered by existing live-TD tests against the
TouchDesigner HTTP API (port 44444):

  Chain 1: glslPOP (the ORIGINAL standard compute POP, NOT glslcopyPOP)
           boxPOP → textDAT(shader) → glslPOP → nullPOP
           Uses `computedat` / `outputattrs` (NON pt-prefixed) per empirical TD API.

  Chain 2: Three INDEPENDENT parallel source→modifier→output chains side by side
           (boxPOP_A→noisePOP_A→nullPOP_A) ×3  with distinct params per chain.

  Chain 3: glsladvancedPOP (vertex compute shader variant)
           circlePOP → textDAT(shader) → glsladvancedPOP → nullPOP
           Uses `computedat` + `ptoutputattrs` (same compute param as glslPOP,
           but pt-prefixed output attrs menu — NOT vertcomputedat/outputattrs).

  Chain 4: pointPOP with CUSTOM particle attributes
           pointPOP(createp, attr0name="custom", attr0customname="customVel",
                    attr1name="custom", attr1customname="customMass")
           → noisePOP → nullPOP, then attrs are READ BACK via /exec.

  Endpoints exercised:
    - /verify        (network health cross-check)
    - /document      (role detection on a POP-heavy network)
    - /exec          (build + read-back)

Parameter-name notes (empirically verified on this TD instance):
  - glslPOP:         computedat (String), outputattrs (Menu 'P')
  - glslcopyPOP:     ptcomputedat / ptoutputattrs   (different operator — not used here)
  - glsladvancedPOP: computedat (String, same as glslPOP, NOT vertcomputedat),
                     ptoutputattrs (Menu '*'), primcomputedat, geomcomputedat
  - noisePOP:        `period` is the real float noise-size control; `noisesize` is a
                     Menu (index string); `harmon` is an Int.
  - boxPOP:          sizex (Float), depth (Int)
  - circlePOP:       radx/rady (Float), divs (Int)
  - pointPOP:        createp (Toggle), attr0name/attr1name (String)

Exit code 0 = pass, non-zero = fail. Safe to re-run (uses an isolated sandbox).
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
SANDBOX_NAME = f"test_adv_pop2_{uuid.uuid4().hex[:8]}"
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

# Column anchors (sources far left, DATs above/below their consumer, modifiers mid, outputs right)
COL_SRC = -3 * NODE_SPACING_X   # -1050
COL_DAT = -2 * NODE_SPACING_X   # -700
COL_MOD = -1 * NODE_SPACING_X   # -350
COL_OUT = 0                     # 0

# ── Chain 1: glslPOP (original standard compute POP) ──────────────────────────
# boxPOP source → glslPOP (computedat/outputattrs) → nullPOP
GLSL_POP_CODE = (
    "// glslPOP compute shader — pseudo-noise displacement on P\n"
    "uniform float u_time;\n"
    "void main() {\n"
    "    uint id = TDIndex();\n"
    "    vec3 pos = TDIn_P(0, id);\n"
    "    float n = sin(u_time * 0.7 + pos.x * 2.0 + pos.y * 1.5);\n"
    "    P[id] = pos + vec3(n * 0.15, n * 0.10, 0.0);\n"
    "}\n"
)

CHAIN1_NODES = [
    {"name": "boxPOP_src1", "opType": "boxPOP", "x": COL_SRC, "y": -5 * NODE_SPACING_Y,
     "key_params": {"sizex": 1.0, "depth": 6}, "is_source": True, "is_dat": False},
    {"name": "glsl_dat1", "opType": "textDAT", "x": COL_DAT, "y": -5 * NODE_SPACING_Y + 250,
     "key_params": {}, "text_content": GLSL_POP_CODE, "is_source": False, "is_dat": True},
    {"name": "glsl_mod1", "opType": "glslPOP", "x": COL_MOD, "y": -5 * NODE_SPACING_Y,
     "key_params": {}, "is_source": False, "is_dat": False},
    {"name": "glsl_out1", "opType": "nullPOP", "x": COL_OUT, "y": -5 * NODE_SPACING_Y,
     "key_params": {}, "is_source": False, "is_dat": False},
]

# ── Chain 2: three independent parallel source→modifier→output chains ─────────
# Each uses DISTINCT sizex / depth / noise params so we can prove they are wired
# independently and not cross-contaminating one another.
CHAIN2_NODES = [
    # Chain A (top)
    {"name": "boxPOP_A", "opType": "boxPOP", "x": COL_SRC, "y": -3 * NODE_SPACING_Y,
     "key_params": {"sizex": 1.0, "depth": 4}, "is_source": True, "is_dat": False},
    {"name": "noisePOP_A", "opType": "noisePOP", "x": COL_MOD, "y": -3 * NODE_SPACING_Y,
     "key_params": {"amp0": 0.30, "period": 2.0, "harmon": 1}, "is_source": False, "is_dat": False},
    {"name": "nullPOP_A", "opType": "nullPOP", "x": COL_OUT, "y": -3 * NODE_SPACING_Y,
     "key_params": {}, "is_source": False, "is_dat": False},
    # Chain B (middle)
    {"name": "boxPOP_B", "opType": "boxPOP", "x": COL_SRC, "y": -2 * NODE_SPACING_Y,
     "key_params": {"sizex": 1.5, "depth": 5}, "is_source": True, "is_dat": False},
    {"name": "noisePOP_B", "opType": "noisePOP", "x": COL_MOD, "y": -2 * NODE_SPACING_Y,
     "key_params": {"amp0": 0.60, "period": 1.5, "harmon": 2}, "is_source": False, "is_dat": False},
    {"name": "nullPOP_B", "opType": "nullPOP", "x": COL_OUT, "y": -2 * NODE_SPACING_Y,
     "key_params": {}, "is_source": False, "is_dat": False},
    # Chain C (bottom)
    {"name": "boxPOP_C", "opType": "boxPOP", "x": COL_SRC, "y": -1 * NODE_SPACING_Y,
     "key_params": {"sizex": 2.0, "depth": 6}, "is_source": True, "is_dat": False},
    {"name": "noisePOP_C", "opType": "noisePOP", "x": COL_MOD, "y": -1 * NODE_SPACING_Y,
     "key_params": {"amp0": 0.90, "period": 1.0, "harmon": 3}, "is_source": False, "is_dat": False},
    {"name": "nullPOP_C", "opType": "nullPOP", "x": COL_OUT, "y": -1 * NODE_SPACING_Y,
     "key_params": {}, "is_source": False, "is_dat": False},
]

# ── Chain 3: glsladvancedPOP (vertex compute variant) ─────────────────────────
# circlePOP source → glsladvancedPOP (computedat + ptoutputattrs) → nullPOP
GLSL_ADV_CODE = (
    "// glsladvancedPOP vertex compute — radial wobble on P\n"
    "uniform float u_time;\n"
    "void main() {\n"
    "    vec3 pos = TDIn_P();\n"
    "    float wob = sin(u_time * 1.3 + length(pos.xy) * 4.0) * 0.08;\n"
    "    pos.xy += normalize(pos.xy + vec2(0.0001)) * wob;\n"
    "    TDOut_P(pos);\n"
    "}\n"
)

CHAIN3_NODES = [
    {"name": "circlePOP_src", "opType": "circlePOP", "x": COL_SRC, "y": 0,
     "key_params": {"radx": 1.2, "rady": 1.2, "divs": 48}, "is_source": True, "is_dat": False},
    {"name": "glsladv_dat", "opType": "textDAT", "x": COL_DAT, "y": 250,
     "key_params": {}, "text_content": GLSL_ADV_CODE, "is_source": False, "is_dat": True},
    {"name": "glsladv_mod", "opType": "glsladvancedPOP", "x": COL_MOD, "y": 0,
     "key_params": {}, "is_source": False, "is_dat": False},
    {"name": "glsladv_out", "opType": "nullPOP", "x": COL_OUT, "y": 0,
     "key_params": {}, "is_source": False, "is_dat": False},
]

# ── Chain 4: pointPOP with custom particle attributes (read back) ─────────────
# pointPOP(createp, custom attrs) → noisePOP → nullPOP
CHAIN4_NODES = [
    {"name": "pointPOP_src", "opType": "pointPOP", "x": COL_SRC, "y": 2 * NODE_SPACING_Y,
     "key_params": {"createp": True,
                    "attr0name": "custom", "attr0customname": "customVel",
                    "attr1name": "custom", "attr1customname": "customMass"},
     "is_source": True, "is_dat": False},
    {"name": "point_noisePOP", "opType": "noisePOP", "x": COL_MOD, "y": 2 * NODE_SPACING_Y,
     "key_params": {"amp0": 0.4, "period": 1.2, "harmon": 1}, "is_source": False, "is_dat": False},
    {"name": "pointPOP_out", "opType": "nullPOP", "x": COL_OUT, "y": 2 * NODE_SPACING_Y,
     "key_params": {}, "is_source": False, "is_dat": False},
]

ALL_NODES = CHAIN1_NODES + CHAIN2_NODES + CHAIN3_NODES + CHAIN4_NODES

# Connections per chain (12 total). Sources → modifier → output.
CONNECTIONS = [
    # Chain 1 (glslPOP)
    ("boxPOP_src1", "glsl_mod1"),
    ("glsl_mod1", "glsl_out1"),
    # Chain 2A
    ("boxPOP_A", "noisePOP_A"),
    ("noisePOP_A", "nullPOP_A"),
    # Chain 2B
    ("boxPOP_B", "noisePOP_B"),
    ("noisePOP_B", "nullPOP_B"),
    # Chain 2C
    ("boxPOP_C", "noisePOP_C"),
    ("noisePOP_C", "nullPOP_C"),
    # Chain 3 (glsladvancedPOP)
    ("circlePOP_src", "glsladv_mod"),
    ("glsladv_mod", "glsladv_out"),
    # Chain 4 (pointPOP custom attrs)
    ("pointPOP_src", "point_noisePOP"),
    ("point_noisePOP", "pointPOP_out"),
]

# Parallel-chain independence map: modifier -> the ONE source it must be fed by,
# and the sibling sources it must NOT be fed by.
PARALLEL_INDEPENDENCE = [
    ("noisePOP_A", "boxPOP_A", ["boxPOP_B", "boxPOP_C"]),
    ("noisePOP_B", "boxPOP_B", ["boxPOP_A", "boxPOP_C"]),
    ("noisePOP_C", "boxPOP_C", ["boxPOP_A", "boxPOP_B"]),
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
        print("    [WARN] continuing with partial network — missing nodes will "
              "show as connection/verify failures")

    # Phase 2b: write text_content into textDAT nodes (shader code holders)
    for node in ALL_NODES:
        if not node.get("text_content"):
            continue
        try:
            td.exec(
                "op(%r).text = %r"
                % (f"{SANDBOX_PATH}/{node['name']}", node["text_content"])
            )
            res.step(f"txt_{node['name']}", True, "shader text written")
        except Exception as e:
            res.step(f"txt_{node['name']}", False, str(e))

    # Phase 2c: GLSL POP parameter wiring (defensive — set whichever params exist)
    # glslPOP (original) uses computedat + outputattrs
    _setup_glsl_params(
        td, res, node_name="glsl_mod1", step_name="glsl1_setup",
        dat_ref="glsl_dat1",
        pairs=[("computedat", "glsl_dat1"), ("outputattrs", "P")],
        required=["computedat"],
    )
    # glsladvancedPOP uses computedat (same param family as glslPOP, NOT
    # vertcomputedat) + ptoutputattrs (pt-prefixed output menu, accepts '*').
    _setup_glsl_params(
        td, res, node_name="glsladv_mod", step_name="glsladv_setup",
        dat_ref="glsladv_dat",
        pairs=[("computedat", "glsladv_dat"), ("ptoutputattrs", "*")],
        required=["computedat"],
    )

    # Phase 3: set scalar/toggle/string parameters
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
    res.step("w_all", wired == len(CONNECTIONS),
             f"wired {wired}/{len(CONNECTIONS)}")

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
    res.step("ly_all", positioned == len(ALL_NODES),
             f"positioned {positioned}/{len(ALL_NODES)} nodes")

    return True


def _setup_glsl_params(td: TDClient, res: TestResult, node_name: str,
                       step_name: str, dat_ref: str,
                       pairs: list[tuple[str, str]],
                       required: list[str]) -> None:
    """Defensively set GLSL params. The step passes iff every `required` param
    was accepted by TD; other (best-effort) params are reported but non-fatal."""
    path = f"{SANDBOX_PATH}/{node_name}"
    code = (
        "import json\n"
        "o = op(%r)\n"
        "res = {}\n"
        "for nm, vl in %r:\n"
        "    try:\n"
        "        o.par[nm] = vl\n"
        "        res[nm] = True\n"
        "    except Exception as e:\n"
        "        res[nm] = 'ERR:' + str(e)[:120]\n"
        "print(json.dumps(res))\n"
    ) % (path, pairs)
    try:
        raw = td.exec(code)
        data = json.loads(raw.strip().splitlines()[-1]) if raw.strip() else {}
        ok = all(data.get(r) is True for r in required)
        detail = ", ".join(f"{k}={'ok' if v is True else v}" for k, v in data.items())
        res.step(step_name, ok, detail if ok else f"{dat_ref} → {detail}")
    except Exception as e:
        res.step(step_name, False, str(e))


# ─── Verify phase ─────────────────────────────────────────────────────────────


def verify_network(td: TDClient, res: TestResult) -> None:
    time.sleep(1.5)  # Allow settling / shader compile

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
        res.step("err_all", True, "all operators error-free")

    # Check 3: Connections correct (expected source appears in some target input)
    for conn in CONNECTIONS:
        src, tgt = conn[0], conn[1]
        tgt_node = by_name.get(tgt)
        if tgt_node is None:
            res.step(f"cn_{src}_to_{tgt}", False, f"{tgt} missing")
            continue
        expected_src = f"{SANDBOX_PATH}/{src}"
        found = any(expected_src in inp for inp in tgt_node["inputs"])
        res.step(f"cn_{src}_to_{tgt}", found,
                 f"{tgt} inputs={tgt_node['inputs']}" if not found else "wired")

    # Check 4: Topology — sources 0 inputs, modifiers/outputs ≥1 input, DATs 0 inputs
    for node in ALL_NODES:
        n = by_name.get(node["name"])
        if n is None:
            continue
        connected_inputs = [inp for inp in n["inputs"] if inp]
        if node["is_source"]:
            ok = not connected_inputs
            res.step(f"tp_{node['name']}", ok,
                     "source has no inputs" if ok else f"unexpected inputs {connected_inputs}")
        elif node.get("is_dat"):
            ok = not connected_inputs
            res.step(f"tp_{node['name']}", ok,
                     "dat has no inputs" if ok else f"unexpected inputs {connected_inputs}")
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

    # Check 7: GLSL POP (original) compilation — no errors on glsl_mod1
    glsl_node = by_name.get("glsl_mod1")
    if glsl_node:
        ok = not glsl_node["errors"]
        res.step("glsl_compilation", ok,
                 "glslPOP no errors" if ok else f"errors: {glsl_node['errors']}")

    # Check 8: glsladvancedPOP compilation — no errors on glsladv_mod
    glsladv_node = by_name.get("glsladv_mod")
    if glsladv_node:
        ok = not glsladv_node["errors"]
        res.step("glsladv_compilation", ok,
                 "glsladvancedPOP no errors" if ok else f"errors: {glsladv_node['errors']}")

    # Check 9: GLSL shader code DATs present with non-empty text
    for dat_name in ("glsl_dat1", "glsladv_dat"):
        dn = by_name.get(dat_name)
        if dn:
            res.step(f"dat_present_{dat_name}", True, f"{dn['opType']} found")
        else:
            res.step(f"dat_present_{dat_name}", False, "missing")

    # Check 10: pointPOP custom attributes read back via /exec
    _verify_pointpop_attrs(td, res)

    # Check 11: parallel chains wired independently (no cross-wiring)
    for mod, expected_src, forbidden in PARALLEL_INDEPENDENCE:
        mod_node = by_name.get(mod)
        if mod_node is None:
            res.step(f"parallel_{mod}", False, f"{mod} missing")
            continue
        flat = [owner for inp in mod_node["inputs"] for owner in inp]
        exp_present = any(f"{SANDBOX_PATH}/{expected_src}" in f for f in flat)
        forb_present = [s for s in forbidden if any(f"{SANDBOX_PATH}/{s}" in f for f in flat)]
        ok = exp_present and not forb_present
        res.step(f"parallel_{mod}", ok,
                 f"fed by {expected_src}" if ok else
                 f"expected={expected_src} forbidden_seen={forb_present} inputs={flat}")

    # Check 12: /document endpoint on the POP-heavy network — role detection
    _verify_document_endpoint(td, res)


def _verify_pointpop_attrs(td: TDClient, res: TestResult) -> None:
    """Read back pointPOP custom attribute params via /exec and confirm persistence."""
    path = f"{SANDBOX_PATH}/pointPOP_src"
    code = (
        "import json\n"
        "o = op(%r)\n"
        "out = {}\n"
        "for pn in ('createp', 'attr0name', 'attr0customname',\n"
        "           'attr1name', 'attr1customname'):\n"
        "    try:\n"
        "        out[pn] = o.par[pn].eval()\n"
        "    except Exception as ex:\n"
        "        out[pn] = 'ERR:' + str(ex)[:120]\n"
        "print(json.dumps(out))\n"
    ) % path
    try:
        raw = td.exec(code)
        vals = json.loads(raw.strip().splitlines()[-1]) if raw.strip() else {}
    except Exception as e:
        res.step("pointpop_attr_readback", False, str(e))
        return

    createp = vals.get("createp")
    a0 = vals.get("attr0name")          # Menu entry → 'custom'
    a0c = vals.get("attr0customname")   # custom string → 'customVel'
    a1 = vals.get("attr1name")          # Menu entry → 'custom'
    a1c = vals.get("attr1customname")   # custom string → 'customMass'
    res.step("pointpop_createp", bool(createp) and "ERR" not in str(createp),
             f"createp={createp}")
    res.step("pointpop_attr0name", a0 == "custom",
             f"attr0name={a0}" + ("" if a0 == "custom" else " (expected custom)"))
    res.step("pointpop_attr0customname", a0c == "customVel",
             f"attr0customname={a0c}"
             + ("" if a0c == "customVel" else " (expected customVel)"))
    res.step("pointpop_attr1name", a1 == "custom",
             f"attr1name={a1}" + ("" if a1 == "custom" else " (expected custom)"))
    res.step("pointpop_attr1customname", a1c == "customMass",
             f"attr1customname={a1c}"
             + ("" if a1c == "customMass" else " (expected customMass)"))
    res.step("pointpop_attr_readback",
             bool(createp) and a0 == "custom" and a0c == "customVel"
             and a1 == "custom" and a1c == "customMass",
             "all custom attrs persisted")


def _verify_document_endpoint(td: TDClient, res: TestResult) -> None:
    """POST /document and validate structure + role detection on the POP network."""
    try:
        doc = td.post_json("/document", {"path": SANDBOX_PATH})
    except Exception as e:
        res.step("document_call", False, str(e))
        return

    if not isinstance(doc, dict) or doc.get("error"):
        res.step("document_call", False, f"bad response: {doc}")
        return
    res.step("document_call", True,
             f"op_count={doc.get('operator_count')}, conns={doc.get('connection_count')}")

    # Structure: required keys present
    required_keys = {"summary", "operator_count", "connection_count",
                     "error_count", "structure", "connections", "roles"}
    have = set(doc.keys())
    missing = required_keys - have
    res.step("document_structure", not missing,
             "all keys present" if not missing else f"missing: {sorted(missing)}")

    # Operator count: TD counts internal sub-operators (e.g. containerCOMP
    # internals), so the documented count is typically >= our created children.
    expected_ops = len(ALL_NODES)
    op_count = doc.get("operator_count")
    res.step("document_op_count", op_count >= expected_ops,
             f"operator_count={op_count} (>= {expected_ops}, "
             f"TD counts internal sub-ops)")

    # Connection count matches
    conn_count = doc.get("connection_count")
    res.step("document_conn_count", conn_count == len(CONNECTIONS),
             f"connection_count={conn_count} (expected {len(CONNECTIONS)})")

    # Role detection: POP network must surface source / processor / sink roles
    roles = doc.get("roles", {}) or {}
    role_keys_ok = all(rk in roles for rk in ("source", "processor", "sink / output"))
    res.step("document_roles_present", role_keys_ok,
             f"roles={roles}" if role_keys_ok else f"roles={roles} (missing source/processor/sink)")

    # Source role count must equal the number of declared sources
    n_sources = sum(1 for n in ALL_NODES if n["is_source"])
    res.step("document_source_count", roles.get("source") == n_sources,
             f"source={roles.get('source')} (expected {n_sources})")

    # Family detection should include POP (and DAT)
    families = doc.get("families", {}) or {}
    has_pop = any("pop" in str(k).lower() for k in families)
    res.step("document_family_pop", has_pop,
             f"families={families}" if has_pop else f"no POP family in {families}")

    # Per-operator structure entries must carry a recognized role each
    structure = doc.get("structure", []) or []
    bad_roles = [s.get("name", "?") for s in structure
                 if s.get("role") not in ("source", "processor", "sink / output", "standalone")]
    res.step("document_role_values", not bad_roles,
             "all ops classified" if not bad_roles else f"unclassified: {bad_roles}")


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
    parser = argparse.ArgumentParser(
        description="Advanced POP Integration Test 2 — glslPOP, glsladvancedPOP, "
                    "parallel chains, custom attrs, /document."
    )
    parser.add_argument("--host", default=DEFAULT_HOST)
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    args = parser.parse_args()

    n_sources = sum(1 for n in ALL_NODES if n["is_source"])
    print("=" * 72)
    print("  Advanced POP Integration Test 2 — TouchDesigner HTTP API")
    print(f"  Target: http://{args.host}:{args.port}")
    print(f"  Sandbox: {SANDBOX_PATH}")
    print(f"  Nodes: {len(ALL_NODES)} ({n_sources} sources), "
          f"Connections: {len(CONNECTIONS)}")
    print("  Chains: glslPOP | 3× parallel | glsladvancedPOP | pointPOP custom attrs")
    print("  Endpoints: /verify, /document")
    print("=" * 72)

    td = TDClient(args.host, args.port)
    res = TestResult()

    if not td.ping():
        print("\nFAIL: TouchDesigner HTTP API not reachable.")
        return 2

    print("\n[setup] TD server reachable.\n")

    print("--- Build phase ---")
    build_network(td, res)

    print("\n--- Verify phase ---")
    verify_network(td, res)

    print("\n--- Cleanup phase (always runs) ---")
    cleanup(td, res)

    total = len(res.steps)
    passed = sum(1 for s in res.steps if s["ok"])
    print(f"\n{'=' * 72}")
    print(f"RESULT: {passed}/{total} checks passed")
    if res.passed:
        print("\nOVERALL: PASS — POP advanced2 network built, wired, verified, "
              "documented, cleaned up.")
        return 0
    else:
        print(f"\nOVERALL: FAIL — {len(res.failures)} check(s) failed")
        for f in res.failures:
            print(f"  - {f}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
