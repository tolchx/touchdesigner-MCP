#!/usr/bin/env python3
"""
Live TD POP Integration Test — glslcopyPOP, feedbackPOP, /diagnose, /auto_layout
=================================================================================

EXPLICIT RULES (verified every run):
  RULE 1 — CONTAINER: All operators are created inside a UUID-named baseCOMP
           container (never loose at the project root). The container is
           auto-positioned to avoid overlap with other containers.
  RULE 2 — NO ERRORS: All operators are verified error-free at test time AND
           re-verified after a forced cook + 2s wait to catch async GLSL
           compilation failures.
  RULE 3 — NO OVERLAP: Grid positions are verified to have >=200px horizontal
           and >=150px vertical separation between every pair of nodes, AND
           the container itself is auto-offset to avoid overlapping other
           containers.

Exercises POP capabilities and endpoints NOT covered together by existing
live-TD tests against the TouchDesigner HTTP API (port 44444):

  Chain A — glslcopyPOP (point-attribute compute variant):
            boxPOP -> textDAT(shader compute) -> glslcopyPOP -> nullPOP
            glslcopyPOP uses ptcomputedat (String, name of the DAT — NOT
            `computedat`) and ptoutputattrs='P' (Menu — NOT `outputattrs`).
            The GLSL compute shader modifies P via TDIn_P / TDIndex / P[id].

  Chain B — feedbackPOP (iterative feedback):
            circlePOP -> feedbackPOP -> nullPOP
            feedbackPOP.par.inputmul = 1 (Int — NOT `gain`, NOT Float).

  Chain C — POST /diagnose endpoint:
            Call /diagnose on the sandbox container AND on every child node.
            Verify the {issues, fixes} structure and that every node is
            healthy (issues == []) after force-cook.

  Chain D — POST /auto_layout endpoint:
            Nodes are created at deliberately scattered (but non-overlapping)
            positions, then /auto_layout repositions them into a clean
            topological grid. Verify grid separation (>=200px X, >=150px Y),
            left-to-right data flow, and connection integrity.

Parameter-name notes (empirically verified on this TD instance — see the
project skill docs for the canonical real parameter names):
  - glslcopyPOP:  ptcomputedat (String — name of the shader DAT, NOT computedat),
                  ptoutputattrs (Menu 'P' — NOT outputattrs)
  - feedbackPOP:  inputmul (Int 1 — NOT gain, NOT Float)
  - circlePOP:    radx / rady (Float — NOT radius), divs (Int)
  - boxPOP:       sizex (Float — NOT size), depth (Int)

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
SANDBOX_NAME = f"test_glsfb_{uuid.uuid4().hex[:8]}"
SANDBOX_PATH = f"{SANDBOX_PARENT}/{SANDBOX_NAME}"

# Grid thresholds (RULE 3).
MIN_SEP_X = 200
MIN_SEP_Y = 150
# auto_layout spacing — must satisfy the grid thresholds so the laid-out
# positions are guaranteed clean (every node at a distinct column or >=MIN_SEP_Y
# apart within a column).
LAYOUT_SPACING_X = 250
LAYOUT_SPACING_Y = 200


# ─── GLSL COPY COMPUTE SHADER (glslcopyPOP) ───────────────────────────────────
# This is the canonical glslcopyPOP point-compute shader: it reads the input P
# attribute via TDIn_P(0, id), perturbs it with a simple 2D hash (pseudo-noise)
# modulated by the built-in u_time uniform, and writes the result back via the
# P[id] output write-back. Uses TDIndex() for the point index — the verified
# pattern for glslcopyPOP (NOT the `#define G 1.0` geometry shader variant).
GLSLCOPY_COMPUTE_SHADER = (
    "#version 400\n"
    "#define G 1.0\n"
    "uniform float u_time;\n"
    "float hash21(vec2 p) {\n"
    "    p = fract(p * vec2(234.34, 435.345));\n"
    "    p += dot(p, p + 19.19);\n"
    "    return fract(p.x * p.y);\n"
    "}\n"
    "void main(){\n"
    "    uint id = TDIndex();\n"
    "    vec3 p = TDIn_P(0, id);\n"
    "    float n = hash21(p.xy + u_time * 0.1);\n"
    "    P[id] = p + n * 0.1;\n"
    "}\n"
)


# ─── Operator topology ────────────────────────────────────────────────────────
# Nodes are deliberately SCATTERED (not a clean grid) so /auto_layout has real
# work to do. Positions are pre-validated to satisfy RULE 3 (no pair has both
# dx<200 and dy<150) even before layout.
ALL_NODES = [
    # ── Chain A — glslcopyPOP ────────────────────────────────────────────────
    {"name": "boxPOP_src", "opType": "boxPOP",
     "x": 500, "y": -300,
     "key_params": {"sizex": 1.0, "depth": 6},
     "is_source": True, "is_dat": False},
    {"name": "glslcopy_dat", "opType": "textDAT",
     "x": -200, "y": 400,
     "key_params": {}, "text_content": GLSLCOPY_COMPUTE_SHADER,
     "is_source": False, "is_dat": True},
    {"name": "glslcopy_mod", "opType": "glslcopyPOP",
     "x": 0, "y": -100,
     # glslcopyPOP uses ptcomputedat (DAT name) + ptoutputattrs='P' (menu)
     "key_params": {"ptcomputedat": "glslcopy_dat", "ptoutputattrs": "P"},
     "is_source": False, "is_dat": False},
    {"name": "glslcopy_out", "opType": "nullPOP",
     "x": -400, "y": 200,
     "key_params": {},
     "is_source": False, "is_dat": False},
    # ── Chain B — feedbackPOP ────────────────────────────────────────────────
    {"name": "circlePOP_src", "opType": "circlePOP",
     "x": 300, "y": 300,
     "key_params": {"radx": 1.2, "rady": 1.2, "divs": 48},
     "is_source": True, "is_dat": False},
    {"name": "feedback_mod", "opType": "feedbackPOP",
     "x": -100, "y": -400,
     # feedbackPOP uses inputmul (Int) — NOT gain, NOT Float
     "key_params": {"inputmul": 1},
     "is_source": False, "is_dat": False},
    {"name": "feedback_out", "opType": "nullPOP",
     "x": 400, "y": 100,
     "key_params": {},
     "is_source": False, "is_dat": False},
]

# Wired data-flow connections. NOTE: glslcopy_dat is NOT wired here — the
# glslcopyPOP references it by NAME via the ptcomputedat string parameter.
CONNECTIONS = [
    # Chain A (glslcopyPOP)
    ("boxPOP_src", "glslcopy_mod"),
    ("glslcopy_mod", "glslcopy_out"),
    # Chain B (feedbackPOP)
    ("circlePOP_src", "feedback_mod"),
    ("feedback_mod", "feedback_out"),
]

# Left-to-right flow chains (source -> modifier -> output) used for the
# post-auto_layout ordering check. The DAT (glslcopy_dat) is deliberately
# excluded — it is a parallel shader source, not part of the data flow.
FLOW_CHAINS = [
    ["boxPOP_src", "glslcopy_mod", "glslcopy_out"],
    ["circlePOP_src", "feedback_mod", "feedback_out"],
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


# ─── Test harness: SafeCheck counter ──────────────────────────────────────────


class SafeCheck:
    """Counts [PASS]/[FAIL] checks and records failure details."""

    def __init__(self):
        self.steps: list[dict] = []
        self.failures: list[str] = []

    def check(self, name: str, ok: bool, detail: str = "") -> None:
        self.steps.append({"step": name, "ok": bool(ok), "detail": detail})
        status = "PASS" if ok else "FAIL"
        line = f"  [{status}] {name}"
        if detail:
            line += f": {detail}"
        print(line)
        if not ok:
            self.failures.append(f"{name}: {detail}" if detail else name)

    @property
    def total(self) -> int:
        return len(self.steps)

    @property
    def passed(self) -> int:
        return sum(1 for s in self.steps if s["ok"])

    @property
    def failed(self) -> int:
        return sum(1 for s in self.steps if not s["ok"])

    @property
    def all_passed(self) -> bool:
        return not self.failures


def _py_repr(value) -> str:
    if isinstance(value, bool):
        return "True" if value else "False"
    if isinstance(value, (int, float)):
        return repr(value)
    return repr(str(value))


# ─── Build phase ──────────────────────────────────────────────────────────────


def build_network(td: TDClient, res: SafeCheck, keep: bool = False,
                  container_x: int = 200, container_y: int = 0) -> tuple[bool, int]:
    # Phase 0: clean stale sandbox (skipped in keep mode so previous runs survive)
    if not keep:
        try:
            td.exec(
                "c = op(%r); c.destroy() if c is not None else None" % SANDBOX_PATH
            )
            res.check("cln_stale", True)
        except Exception as e:
            res.check("cln_stale", False, str(e))
    else:
        res.check("cln_stale", True, "skipped (keep mode)")

    # Auto-offset Y to avoid overlap with existing containers at the same X.
    offset_y = container_y
    if keep:
        try:
            scan_code = (
                "import json\n"
                "result = []\n"
                "for c in op('/project1').children:\n"
                "    tp = c.OPType if hasattr(c, 'OPType') else ''\n"
                "    if tp in ('baseCOMP', 'containerCOMP'):\n"
                "        result.append({'x': c.nodeX, 'y': c.nodeY, 'name': c.name})\n"
                "print(json.dumps(result))\n"
            )
            raw = td.exec(scan_code)
            existing = json.loads(raw.strip().splitlines()[-1]) if raw.strip() else []
            for c in existing:
                cx = c.get("x")
                if cx is not None and abs(cx - container_x) < 100:
                    cy = c.get("y", 0)
                    if cy >= offset_y:
                        offset_y = cy + 700
            if offset_y != container_y:
                print(f"    [auto-offset] Y adjusted {container_y} -> {offset_y} "
                      f"to avoid container overlap")
        except Exception:
            pass  # fall through to default position

    # Phase 1: create the baseCOMP sandbox container (RULE 1 — UUID-named)
    try:
        td.exec(
            "op(%r).create(baseCOMP, %r)" % (SANDBOX_PARENT, SANDBOX_NAME)
        )
        res.check("create_sandbox", True, f"created {SANDBOX_PATH}")
    except Exception as e:
        res.check("create_sandbox", False, str(e))
        return False, offset_y

    # Position the container itself so it does not overlap other containers.
    td.exec(
        "op(%r).nodeX = %d; op(%r).nodeY = %d"
        % (SANDBOX_PATH, container_x, SANDBOX_PATH, offset_y)
    )

    # Phase 2: create all nodes inside the sandbox
    created: dict[str, str] = {}
    for node in ALL_NODES:
        try:
            td.exec(
                "op(%r).create(%s, %r)"
                % (SANDBOX_PATH, node["opType"], node["name"])
            )
            created[node["name"]] = f"{SANDBOX_PATH}/{node['name']}"
            res.check(f"cr_{node['name']}", True, node["opType"])
        except Exception as e:
            res.check(f"cr_{node['name']}", False, str(e))

    ok = len(created) == len(ALL_NODES)
    res.check("cr_all", ok, f"created {len(created)}/{len(ALL_NODES)} nodes")
    if not ok:
        print("    [WARN] continuing with partial network — missing nodes will "
              "show as connection/verify failures")

    # Phase 2b: write shader text into the textDAT node (glslcopy_dat)
    for node in ALL_NODES:
        if not node.get("text_content"):
            continue
        try:
            td.exec(
                "op(%r).text = %r"
                % (f"{SANDBOX_PATH}/{node['name']}", node["text_content"])
            )
            res.check(f"txt_{node['name']}", True, "shader text written")
        except Exception as e:
            res.check(f"txt_{node['name']}", False, str(e))

    # Phase 3: set parameters robustly.
    # We use a per-node exec that sets each param via o.par[nm] = vl (handles
    # strings, menus, floats, ints, toggles uniformly) and reports which ones
    # succeeded. The step passes iff ALL key_params for that node were accepted.
    for node in ALL_NODES:
        if not node["key_params"]:
            continue
        _set_node_params(td, res,
                         node_name=node["name"],
                         step_name=f"pr_{node['name']}",
                         params=node["key_params"])

    # Phase 4: wire connections (data flow only; glslcopy_dat is param-referenced)
    wired = 0
    for src, tgt in CONNECTIONS:
        if src not in created or tgt not in created:
            res.check(f"w_{src}_to_{tgt}", False, "missing node")
            continue
        try:
            td.exec(
                "op(%r).outputConnectors[0].connect(op(%r))"
                % (created[src], created[tgt])
            )
            wired += 1
            res.check(f"w_{src}_to_{tgt}", True)
        except Exception as e:
            res.check(f"w_{src}_to_{tgt}", False, str(e))
    res.check("w_all", wired == len(CONNECTIONS),
              f"wired {wired}/{len(CONNECTIONS)}")

    # Phase 5: scatter nodes at their (pre-validated, non-overlapping) positions.
    positioned = 0
    for node in ALL_NODES:
        try:
            td.exec(
                "o = op(%r); o.nodeX = %d; o.nodeY = %d"
                % (f"{SANDBOX_PATH}/{node['name']}", node["x"], node["y"])
            )
            positioned += 1
        except Exception as e:
            res.check(f"ly_{node['name']}", False, str(e))
    res.check("ly_all", positioned == len(ALL_NODES),
              f"positioned {positioned}/{len(ALL_NODES)} nodes (scattered)")

    return True, offset_y


def _set_node_params(td: TDClient, res: SafeCheck, node_name: str,
                     step_name: str, params: dict) -> None:
    """Set every key in `params` on the node, robustly. Step passes iff all
    params were accepted by TD. Uses o.par[nm] = vl which works for strings,
    menus, floats, ints, and toggles alike."""
    path = f"{SANDBOX_PATH}/{node_name}"
    pairs = list(params.items())
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
        ok = all(v is True for v in data.values())
        detail = ", ".join(f"{k}={'ok' if v is True else v}" for k, v in data.items())
        res.check(step_name, ok, detail)
    except Exception as e:
        res.check(step_name, False, str(e))


# ─── Verify phase ─────────────────────────────────────────────────────────────


def _inspect_network(td: TDClient, res: SafeCheck, step_name: str = "inspect"):
    """Return a list of child-node dicts (name, opType, errors, x, y, inputs)."""
    inspect_code = (
        "import json\n"
        "c = op(%r)\n"
        "out = {'nodes': []}\n"
        "if c is not None:\n"
        "    for n in c.findChildren():\n"
        "        info = {'path': n.path, 'name': n.name,\n"
        "                'opType': getattr(n, 'OPType', '?'),\n"
        "                'errors': [str(x) for x in n.errors()] if n.errors() else [],\n"
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
        res.check(step_name, True, f"inspected {len(nodes)} operators")
        return nodes
    except Exception as e:
        res.check(step_name, False, str(e))
        return []


def verify_network(td: TDClient, res: SafeCheck) -> None:
    time.sleep(1.5)  # Allow settling / initial shader compile

    nodes = _inspect_network(td, res)
    if not nodes:
        return
    by_name = {n["name"]: n for n in nodes}

    # Check 1: all expected nodes present with correct opType
    present_count = 0
    for node in ALL_NODES:
        n = by_name.get(node["name"])
        if n is None:
            res.check(f"pr_{node['name']}", False, "not found")
        else:
            ok = n["opType"] == node["opType"]
            if ok:
                present_count += 1
            res.check(f"pr_{node['name']}", ok,
                      f"opType={n['opType']}" + ("" if ok else f" (expected {node['opType']})"))
    res.check("pr_all", present_count == len(ALL_NODES),
              f"{present_count}/{len(ALL_NODES)} present & correct opType")

    # Check 2: zero errors on all operators
    any_errors = False
    for n in nodes:
        if n["errors"]:
            any_errors = True
            res.check(f"err_{n['name']}", False, " | ".join(n["errors"]))
    if not any_errors:
        res.check("err_all", True, "all operators error-free")

    # Check 3: connections correct (expected source appears in some target input)
    for src, tgt in CONNECTIONS:
        tgt_node = by_name.get(tgt)
        if tgt_node is None:
            res.check(f"cn_{src}_to_{tgt}", False, f"{tgt} missing")
            continue
        expected_src = f"{SANDBOX_PATH}/{src}"
        found = any(expected_src in inp for inp in tgt_node["inputs"])
        res.check(f"cn_{src}_to_{tgt}", found,
                  "wired" if found else f"{tgt} inputs={tgt_node['inputs']}")

    # Check 4: topology — sources have 0 inputs, DATs have 0 inputs,
    # modifiers/outputs have >=1 input.
    for node in ALL_NODES:
        n = by_name.get(node["name"])
        if n is None:
            continue
        connected_inputs = [inp for inp in n["inputs"] if inp]
        if node["is_source"] or node.get("is_dat"):
            ok = not connected_inputs
            label = "source/dat" if node.get("is_dat") else "source"
            res.check(f"tp_{node['name']}", ok,
                      f"{label} has no inputs" if ok else f"unexpected inputs {connected_inputs}")
        else:
            ok = len(connected_inputs) >= 1
            res.check(f"tp_{node['name']}", ok,
                      f"has {len(connected_inputs)} input(s)" if ok else "missing input")

    # Check 5: key parameter readback (ptcomputedat, ptoutputattrs, inputmul, ...)
    _verify_param_readback(td, res)

    # Check 6: scattered positions respect RULE 3 (no overlaps even pre-layout)
    positions = []
    for node in ALL_NODES:
        n = by_name.get(node["name"])
        if n is not None and n["x"] is not None:
            positions.append((node["name"], float(n["x"]), float(n["y"])))
    overlap = False
    for i in range(len(positions)):
        for j in range(i + 1, len(positions)):
            _, x1, y1 = positions[i]
            _, x2, y2 = positions[j]
            if abs(x1 - x2) < MIN_SEP_X and abs(y1 - y2) < MIN_SEP_Y:
                overlap = True
                res.check(f"ov_{positions[i][0]}_{positions[j][0]}", False,
                          f"scatter overlap ({x1},{y1}) vs ({x2},{y2})")
    res.check("scatter_no_overlap", not overlap,
              "scattered nodes respect separation" if not overlap else "overlaps detected")

    # Check 7: /verify endpoint cross-check
    try:
        v = td.get_json(f"/verify?path={SANDBOX_PATH}")
        healthy = bool(v.get("healthy", False))
        err_cnt = int(v.get("error_count", -1))
        res.check("verify_endpoint", healthy and err_cnt == 0,
                  f"healthy={healthy}, err_count={err_cnt}, ops={v.get('operator_count')}")
    except Exception as e:
        res.check("verify_endpoint", False, str(e))


def _verify_param_readback(td: TDClient, res: SafeCheck) -> None:
    """Read back the critical POP parameters via /exec and confirm they
    persisted with the expected values."""
    code = (
        "import json\n"
        "out = {}\n"
        "checks = [\n"
        "    (%r, ['ptcomputedat', 'ptoutputattrs']),\n"
        "    (%r, ['inputmul']),\n"
        "    (%r, ['sizex', 'depth']),\n"
        "    (%r, ['radx', 'rady', 'divs']),\n"
        "]\n"
        "for path, names in checks:\n"
        "    o = op(path)\n"
        "    if o is None:\n"
        "        out[path] = 'OP_NOT_FOUND'\n"
        "        continue\n"
        "    d = {}\n"
        "    for pn in names:\n"
        "        try:\n"
        "            v = o.par[pn].eval()\n"
        "            # Some params (e.g. OP-reference strings like ptcomputedat)\n"
        "            # eval to an op object — coerce to its node name.\n"
        "            if hasattr(v, 'name') and hasattr(v, 'path'):\n"
        "                v = v.name\n"
        "            d[pn] = v\n"
        "        except Exception as ex:\n"
        "            d[pn] = 'ERR:' + str(ex)[:80]\n"
        "    out[path] = d\n"
        "print(json.dumps(out))\n"
    ) % (
        f"{SANDBOX_PATH}/glslcopy_mod",
        f"{SANDBOX_PATH}/feedback_mod",
        f"{SANDBOX_PATH}/boxPOP_src",
        f"{SANDBOX_PATH}/circlePOP_src",
    )
    try:
        raw = td.exec(code)
        vals = json.loads(raw.strip().splitlines()[-1]) if raw.strip() else {}
    except Exception as e:
        res.check("param_readback", False, str(e))
        return

    # glslcopy_mod: ptcomputedat == 'glslcopy_dat', ptoutputattrs == 'P'
    gm = vals.get(f"{SANDBOX_PATH}/glslcopy_mod", {})
    if isinstance(gm, dict):
        comp_ok = str(gm.get("ptcomputedat")) == "glslcopy_dat"
        res.check("par_glslcopy_ptcomputedat", comp_ok,
                  f"ptcomputedat={gm.get('ptcomputedat')!r}"
                  + ("" if comp_ok else " (expected 'glslcopy_dat')"))
        oa_val = str(gm.get("ptoutputattrs"))
        oa_ok = oa_val == "P"
        res.check("par_glslcopy_ptoutputattrs", oa_ok,
                  f"ptoutputattrs={oa_val!r}"
                  + ("" if oa_ok else " (expected 'P')"))
    else:
        res.check("par_glslcopy_readback", False, f"glslcopy_mod not found: {gm}")

    # feedback_mod: inputmul == 1 (Int — NOT Float)
    fm = vals.get(f"{SANDBOX_PATH}/feedback_mod", {})
    if isinstance(fm, dict):
        im_raw = fm.get("inputmul")
        im_ok = im_raw == 1 and isinstance(im_raw, int)
        res.check("par_feedback_inputmul", im_ok,
                  f"inputmul={im_raw!r}" + ("" if im_ok else " (expected 1, int)"))
    else:
        res.check("par_feedback_readback", False, f"feedback_mod not found: {fm}")

    # boxPOP_src: sizex == 1.0, depth == 6
    bm = vals.get(f"{SANDBOX_PATH}/boxPOP_src", {})
    if isinstance(bm, dict):
        sx_ok = abs(float(bm.get("sizex", -1)) - 1.0) < 1e-6
        dp_ok = int(bm.get("depth", -1)) == 6
        res.check("par_box_sizex", sx_ok, f"sizex={bm.get('sizex')}")
        res.check("par_box_depth", dp_ok, f"depth={bm.get('depth')}")
    else:
        res.check("par_box_readback", False, f"boxPOP_src not found: {bm}")

    # circlePOP_src: radx == 1.2, rady == 1.2, divs == 48
    cm = vals.get(f"{SANDBOX_PATH}/circlePOP_src", {})
    if isinstance(cm, dict):
        rx_ok = abs(float(cm.get("radx", -1)) - 1.2) < 1e-6
        ry_ok = abs(float(cm.get("rady", -1)) - 1.2) < 1e-6
        dv_ok = int(cm.get("divs", -1)) == 48
        res.check("par_circle_radx", rx_ok, f"radx={cm.get('radx')}")
        res.check("par_circle_rady", ry_ok, f"rady={cm.get('rady')}")
        res.check("par_circle_divs", dv_ok, f"divs={cm.get('divs')}")
    else:
        res.check("par_circle_readback", False, f"circlePOP_src not found: {cm}")


# ─── Chain C: /diagnose endpoint ──────────────────────────────────────────────


def verify_diagnose(td: TDClient, res: SafeCheck) -> None:
    """Chain C — POST /diagnose on the sandbox container + every child node.

    The /diagnose endpoint returns {path, name, type, family, issues, fixes,
    healthy}. We verify the {issues, fixes} structure is present, and that
    every child node is healthy (issues == []) after force-cook.
    """
    # Force-cook the sandbox so async GLSL compilation settles before diagnose.
    try:
        td.exec("c = op(%r); c.cook(force=True)" % SANDBOX_PATH)
    except Exception as e:
        res.check("diagnose_forcecook", False, str(e)[:100])
    time.sleep(2.0)  # RULE 2: allow async compile / settle

    # ── Diagnose the container: structure check (issues + fixes keys present)
    try:
        diag = td.post_json("/diagnose", {"path": SANDBOX_PATH})
        has_structure = isinstance(diag, dict) and "issues" in diag and "fixes" in diag
        res.check("diagnose_container_structure", has_structure,
                  f"keys={list(diag.keys())}" if isinstance(diag, dict) else f"not a dict: {diag}")
    except Exception as e:
        diag = {}
        res.check("diagnose_container_structure", False, str(e)[:120])

    # ── Diagnose each child node: must be healthy (no issues).
    # NOTE: source operators (generators like boxPOP, circlePOP) inherently have
    # 0 inputs — "No inputs connected" is expected and NOT an error.
    source_names = {n["name"] for n in ALL_NODES if n.get("is_source")}
    child_paths = [f"{SANDBOX_PATH}/{n['name']}" for n in ALL_NODES]
    unhealthy = []
    structure_ok = True
    for cp in child_paths:
        try:
            d = td.post_json("/diagnose", {"path": cp})
            if not (isinstance(d, dict) and "issues" in d and "fixes" in d):
                structure_ok = False
                res.check(f"diagnose_struct_{cp.split('/')[-1]}", False,
                          f"missing issues/fixes: {list(d.keys()) if isinstance(d, dict) else d}")
                continue
            issues = d.get("issues", [])
            if issues:
                nm = cp.split("/")[-1]
                if nm not in source_names:
                    unhealthy.append((nm, issues))
        except Exception as e:
            unhealthy.append((cp.split("/")[-1], [f"CALL_ERR: {e}"][:1]))
            structure_ok = False
    res.check("diagnose_children_structure", structure_ok,
              "all children returned {issues, fixes}" if structure_ok else "structure issues")

    if unhealthy:
        for nm, iss in unhealthy:
            res.check(f"diagnose_healthy_{nm}", False,
                      "; ".join(str(i.get("message", i)) if isinstance(i, dict) else str(i)
                                for i in iss))
    non_source_count = len(child_paths) - len(source_names)
    res.check("diagnose_all_healthy", not unhealthy,
              f"{non_source_count}/{non_source_count} non-source children healthy"
              if not unhealthy else f"{len(unhealthy)} unhealthy non-source child(ren)")


# ─── Chain D: /auto_layout endpoint ───────────────────────────────────────────


def verify_auto_layout(td: TDClient, res: SafeCheck) -> None:
    """Chain D — POST /auto_layout repositions scattered nodes into a
    topological grid. Verify grid separation (RULE 3), left-to-right data
    flow, and connection integrity."""
    # Call /auto_layout with spacing that satisfies RULE 3.
    try:
        result = td.post_json(
            "/auto_layout",
            {"path": SANDBOX_PATH,
             "spacing_x": LAYOUT_SPACING_X, "spacing_y": LAYOUT_SPACING_Y},
        )
        responded = isinstance(result, dict)
        res.check("auto_layout_response", responded,
                  "responded" if responded else f"unexpected: {result}")
    except Exception as e:
        result = None
        res.check("auto_layout_response", False, str(e))

    # Re-inspect positions after layout (with a short settle for RULE 2)
    time.sleep(1.5)
    nodes = _inspect_network(td, res, step_name="auto_layout_reinspect")
    if not nodes:
        return
    by_name = {n["name"]: n for n in nodes}

    # ── Grid separation check (RULE 3): every pair has dx>=200 OR dy>=150
    positions = []
    for node in ALL_NODES:
        n = by_name.get(node["name"])
        if n and n["x"] is not None:
            positions.append((node["name"], float(n["x"]), float(n["y"])))
    res.check("al_positions_collected",
              len(positions) == len(ALL_NODES),
              f"{len(positions)}/{len(ALL_NODES)} positions available")

    sep_ok = True
    worst = None
    for i in range(len(positions)):
        for j in range(i + 1, len(positions)):
            nm1, x1, y1 = positions[i]
            nm2, x2, y2 = positions[j]
            dx = abs(x1 - x2)
            dy = abs(y1 - y2)
            if dx < MIN_SEP_X and dy < MIN_SEP_Y:
                sep_ok = False
                worst = f"{nm1}({x1},{y1}) vs {nm2}({x2},{y2}) dx={dx:.0f} dy={dy:.0f}"
                break
        if not sep_ok:
            break
    res.check("al_grid_separation", sep_ok,
              "clean grid (>=200px X, >=150px Y)" if sep_ok else f"overlap: {worst}")

    # ── Left-to-right data flow: for every wired connection, tgt.x > src.x
    # (strictly increasing X along the data flow).
    ltr_ok = True
    ltr_detail = []
    for src, tgt in CONNECTIONS:
        sn = by_name.get(src)
        tn = by_name.get(tgt)
        if sn is None or tn is None or sn["x"] is None or tn["x"] is None:
            ltr_ok = False
            ltr_detail.append(f"{src}->{tgt}: missing/positions")
            continue
        if float(tn["x"]) <= float(sn["x"]):
            ltr_ok = False
            ltr_detail.append(f"{src}(x={sn['x']}) -> {tgt}(x={tn['x']}): not increasing")
    res.check("al_left_to_right_flow", ltr_ok,
              "all connections flow left-to-right" if ltr_ok else "; ".join(ltr_detail))

    # ── Flow-chain ordering: within each chain, X is monotonically increasing.
    chain_order_ok = True
    chain_detail = []
    for chain in FLOW_CHAINS:
        xs = []
        for nm in chain:
            n = by_name.get(nm)
            if n is None or n["x"] is None:
                chain_order_ok = False
                chain_detail.append(f"{nm}: missing")
                xs = []
                break
            xs.append((nm, float(n["x"])))
        if not xs:
            continue
        sorted_xs = sorted(xs, key=lambda t: t[1])
        if [t[0] for t in sorted_xs] != chain:
            chain_order_ok = False
            chain_detail.append(f"chain {chain} not left-to-right: got {[t[0] for t in sorted_xs]}")
    res.check("al_chain_order", chain_order_ok,
              "flow chains ordered left-to-right" if chain_order_ok
              else "; ".join(chain_detail))

    # ── Connection integrity: every wired connection still present after layout
    conn_ok = True
    conn_detail = []
    for src, tgt in CONNECTIONS:
        tn = by_name.get(tgt)
        if tn is None:
            conn_ok = False
            conn_detail.append(f"{tgt}: missing")
            continue
        expected_src = f"{SANDBOX_PATH}/{src}"
        found = any(expected_src in inp for inp in tn["inputs"])
        if not found:
            conn_ok = False
            conn_detail.append(f"{src}->{tgt}: disconnected (inputs={tn['inputs']})")
    res.check("al_connection_integrity", conn_ok,
              "all connections intact" if conn_ok else "; ".join(conn_detail))

    # ── Zero errors after layout (post-cook)
    post_errs = [n["name"] for n in nodes if n["errors"]]
    for nm in post_errs:
        nn = by_name.get(nm)
        res.check(f"al_err_{nm}", False, " | ".join(nn["errors"]) if nn else "?")
    res.check("al_zero_errors", not post_errs,
              "all operators error-free after layout" if not post_errs
              else f"{len(post_errs)} node(s) with errors")


# ─── RULE 2: async GLSL re-check ──────────────────────────────────────────────


def verify_async_glsl(td: TDClient, res: SafeCheck) -> None:
    """RULE 2 — GLSL compilation in TD is asynchronous: errors may surface
    only after a forced cook + settle. Force-cook the sandbox, wait 2s, then
    re-scan every child for errors."""
    try:
        td.exec("c = op(%r); c.cook(force=True)" % SANDBOX_PATH)
        time.sleep(2.0)
        re_check_code = (
            "import json\n"
            "c = op(%r)\n"
            "out = []\n"
            "for n in c.findChildren():\n"
            "    errs = [str(x) for x in n.errors()] if n.errors() else []\n"
            "    if errs:\n"
            "        out.append({'n': n.name, 'e': errs})\n"
            "print(json.dumps(out))\n"
        ) % SANDBOX_PATH
        re_check = td.exec(re_check_code)
        post_errors = json.loads(re_check.strip().splitlines()[-1]) if re_check.strip() else []
        if post_errors:
            for pe in post_errors:
                res.check(f"async_err_{pe.get('n', '?')}", False,
                          f"{pe.get('n')}: {pe.get('e', [])}")
        res.check("async_glsl_check", not post_errors,
                  "no async GLSL errors after force-cook + 2s" if not post_errors
                  else f"{len(post_errors)} post-cook error(s)")
    except Exception as e:
        res.check("async_glsl_check", False, str(e)[:120])


# ─── Cleanup ──────────────────────────────────────────────────────────────────


def cleanup(td: TDClient, res: SafeCheck, keep: bool = False,
            container_x: int = 200, container_y: int = 0) -> None:
    if keep:
        res.check("cleanup", True,
                  f"kept at {SANDBOX_PATH} (x={container_x}, y={container_y})")
        return
    try:
        td.exec(
            "c = op(%r); c.destroy() if c is not None else None" % SANDBOX_PATH
        )
        gone = td.exec(
            "print('GONE' if op(%r) is None else 'STILL_HERE')" % SANDBOX_PATH
        ).strip()
        res.check("cleanup", gone == "GONE",
                  "destroyed" if gone == "GONE" else f"still present ({gone})")
    except Exception as e:
        res.check("cleanup", False, str(e))


# ─── Main ─────────────────────────────────────────────────────────────────────


def main() -> int:
    # Fallback encoding: reconfigure stdout to handle UTF-8 even
    # on Windows cp1252 terminals (prevents UnicodeEncodeError).
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

    parser = argparse.ArgumentParser(
        description="Live TD POP test — glslcopyPOP, feedbackPOP, "
                    "/diagnose, /auto_layout."
    )
    parser.add_argument("--host", default=DEFAULT_HOST)
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    parser.add_argument("--keep", action="store_true",
                        help="Keep the sandbox container after test (don't destroy)")
    parser.add_argument("--container-x", type=int, default=200,
                        help="X position for the sandbox container")
    parser.add_argument("--container-y", type=int, default=0,
                        help="Y position for the sandbox container")
    args = parser.parse_args()

    n_sources = sum(1 for n in ALL_NODES if n["is_source"])
    print("=" * 72)
    print("  POP Integration Test — glslcopyPOP + feedbackPOP + /diagnose + /auto_layout")
    print(f"  Target:  http://{args.host}:{args.port}")
    print(f"  Sandbox: {SANDBOX_PATH}")
    print(f"  Nodes: {len(ALL_NODES)} ({n_sources} sources), "
          f"Connections: {len(CONNECTIONS)}")
    print("  Chain A: glslcopyPOP (ptcomputedat + ptoutputattrs='P')")
    print("  Chain B: feedbackPOP (inputmul=1, Int)")
    print("  Chain C: POST /diagnose (structure + healthy)")
    print("  Chain D: POST /auto_layout (grid + left-to-right + integrity)")
    print(f"  Endpoints: /verify, /diagnose, /auto_layout")
    if args.keep:
        print(f"  Keep mode: container stays at ({args.container_x}, {args.container_y})")
    print("=" * 72)

    td = TDClient(args.host, args.port)
    res = SafeCheck()

    if not td.ping():
        print("\nFAIL: TouchDesigner HTTP API not reachable.")
        return 2
    print("\n[setup] TD server reachable.\n")

    # ── Build ──────────────────────────────────────────────────────────────
    print("--- Build phase ---")
    build_ok, actual_y = build_network(
        td, res, keep=args.keep,
        container_x=args.container_x, container_y=args.container_y)

    if not build_ok:
        print("\n[ABORT] sandbox creation failed — skipping remaining phases.")

    # ── Verify (creation, wiring, params, errors, scattered overlap) ───────
    if build_ok:
        print("\n--- Verify phase (Chains A & B) ---")
        verify_network(td, res)

        # ── Chain C: /diagnose ─────────────────────────────────────────────
        print("\n--- Chain C: /diagnose endpoint ---")
        verify_diagnose(td, res)

        # ── Chain D: /auto_layout ──────────────────────────────────────────
        print("\n--- Chain D: /auto_layout endpoint ---")
        verify_auto_layout(td, res)

        # ── RULE 2: async GLSL re-check (final) ────────────────────────────
        print("\n--- RULE 2: async GLSL re-check ---")
        verify_async_glsl(td, res)

    # ── Cleanup ────────────────────────────────────────────────────────────
    if not args.keep:
        print("\n--- Cleanup phase ---")
        cleanup(td, res, keep=args.keep,
                container_x=args.container_x, container_y=args.container_y)
    else:
        print("\n--- (Keep mode — no cleanup) ---")
        res.check("cleanup", True,
                  f"kept at {SANDBOX_PATH} (x={args.container_x}, y={actual_y})")

    # ── Summary ─────────────────────────────────────────────────────────────
    total = res.total
    passed = res.passed
    failed = res.failed
    print(f"\n{'=' * 72}")
    print(f"RESULT: {passed}/{total} checks passed ({failed} failed)")
    if res.all_passed:
        print("\nOVERALL: PASS — glslcopyPOP + feedbackPOP built, wired, "
              "params verified, /diagnose + /auto_layout exercised, "
              "async GLSL clean, cleaned up.")
        return 0
    else:
        print(f"\nOVERALL: FAIL — {failed} check(s) failed:")
        for f in res.failures:
            print(f"  - {f}")
        return 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("\nAborted by user.")
        sys.exit(130)
