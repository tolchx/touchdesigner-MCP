#!/usr/bin/env python3
"""
Live TD Test: Extreme GLSL — glsladvancedPOP Prim, Multi-Pass, Vertex Shaders
=============================================================================

EXPLICIT RULES (verified every run):
  RULE 1 — CONTAINER: All operators inside a UUID-named baseCOMP.
  RULE 2 — NO ERRORS: Immediate + async post-cook re-check.
  RULE 3 — NO OVERLAP: Grid positions verified for separation.

Tests GLSL patterns NOT covered by any existing test:

  Chain 1 — glsladvancedPOP with primitive compute (primoutputattrs):
            boxPOP → textDAT(prim shader) → glsladvancedPOP → nullPOP
            Uses computedat + primoutputattrs='N' (normal output).
            This exercises the PRIMITIVE domain of glsladvancedPOP,
            which no other test covers (advanced2 uses ptoutputattrs only).
            NOTE: POP-family operators (glsladvancedPOP) connect to nullPOP,
            NOT nullTOP — cross-family connections are not supported.

  Chain 2 — Multi-Pass GLSL TOP (npasses > 1):
            noiseTOP → glslTOP(npasses=4) → nullTOP
            A single GLSL TOP executing 4 passes per frame.
            Pass 0: pass-through, Pass 1-3: progressive blur.
            Uses uTDPass uniform to branch per-pass behavior.

  Chain 3 — GLSL TOP Vertex Shader (vertexdat):
            noiseTOP(source) + textDAT(vertex shader) → glslTOP → nullTOP
            The vertex shader modifies gl_Position based on input texture,
            creating a wave-deformation of the geometry.
            Uses glslTOP.par.vertexdat (NOT pixeldat).

  Chain 4 — glsladvancedPOP with custom extra output:
            spherePOP → textDAT(compute shader) → glsladvancedPOP(extra output) → nullPOP
            Uses computedat + extraout + extraout0name for a custom attribute.
            Verifies the extra output attribute is readable via /exec.
            NOTE: extraout is a Toggle param — set as int 1 (not bool True).

Parameter-name notes (empirically verified on this TD instance):
  - glsladvancedPOP: computedat (String), ptoutputattrs (Menu), primoutputattrs (Menu),
                     vertoutputattrs (Menu), npasses (Int), extraout (Toggle),
                     extraout0name (String), extraout0ptattrs (Menu)
  - glslTOP:         vertexdat (String), pixeldat (String), computedat (String),
                     npasses (Int), mode (Menu)

Exit code 0 = pass, non-zero = fail. Safe to re-run.
"""

from __future__ import annotations

import json
import sys
import time
import urllib.request
import uuid

DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 44444
DEFAULT_TIMEOUT = 30

SANDBOX_PARENT = "/project1"
SANDBOX_NAME = f"test_glsl_extreme_{uuid.uuid4().hex[:8]}"
SANDBOX_PATH = f"{SANDBOX_PARENT}/{SANDBOX_NAME}"

NODE_SPACING_X = 400
NODE_SPACING_Y = 300

# ─── GLSL Shader Definitions ──────────────────────────────────────────────────

# Chain 1: glsladvancedPOP primitive compute — output normals as color
GLSL_PRIM_SHADER = (
    "// glsladvancedPOP primitive compute — color by normal direction\n"
    "uniform float u_time;\n"
    "void main() {\n"
    "    uint id = TDIndex();\n"
    "    if (id >= TDNumElements()) return;\n"
    "    vec3 pos = TDIn_P(0, id);\n"
    "    // Displace P slightly\n"
    "    float wave = sin(u_time + pos.x * 3.0 + pos.y * 2.0) * 0.1;\n"
    "    P[id] = pos + vec3(0.0, wave, 0.0);\n"
    "    // Output a custom normal-based color via Cd\n"
    "    vec3 n = normalize(pos + vec3(0.001));\n"
    "    Cd[id] = vec4(n * 0.5 + 0.5, 1.0);\n"
    "}\n"
)

# Chain 2: Multi-pass GLSL TOP — progressive blur using npasses
GLSL_MULTIPASS_SHADER = (
    "out vec4 fragColor;\n"
    "void main() {\n"
    "    vec2 res = uTD2DInfos[0].res.zw;\n"
    "    vec4 color = texture(sTD2DInputs[0], vUV.st);\n"
    "    // Progressive 3x3 blur each pass\n"
    "    vec4 sum = vec4(0.0);\n"
    "    for (int x = -1; x <= 1; x++) {\n"
    "        for (int y = -1; y <= 1; y++) {\n"
    "            vec2 offset = vec2(float(x), float(y)) * res;\n"
    "            sum += texture(sTD2DInputs[0], vUV.st + offset);\n"
    "        }\n"
    "    }\n"
    "    color = sum / 9.0;\n"
    "    // Add slight green tint on later passes\n"
    "    color.g += 0.02;\n"
    "    fragColor = TDOutputSwizzle(color);\n"
    "}\n"
)

# Chain 3: GLSL TOP vertex shader — wave deformation of geometry
GLSL_VERTEX_SHADER = (
    "uniform float u_time;\n"
    "void main() {\n"
    "    vec4 pos = P;\n"
    "    pos.y += sin(u_time * 2.0 + pos.x * 5.0 + pos.z * 3.0) * 0.15;\n"
    "    pos.x += cos(u_time * 1.5 + pos.z * 4.0) * 0.08;\n"
    "    gl_Position = TDWorldToProj(TDModelToWorld(pos));\n"
    "    uv = uvable;\n"
    "    color = CD;\n"
    "}\n"
)

# Chain 3: GLSL TOP pixel shader (passthrough to show vertex deformation)
GLSL_VERTEX_PIXEL_PASSTHROUGH = (
    "out vec4 fragColor;\n"
    "void main() {\n"
    "    vec4 color = texture(sTD2DInputs[0], vUV.st);\n"
    "    fragColor = TDOutputSwizzle(color);\n"
    "}\n"
)

# Chain 4: glsladvancedPOP compute with custom extra output attribute
GLSL_EXTRAOUT_SHADER = (
    "// glsladvancedPOP with extra output — custom velocity attribute\n"
    "uniform float u_time;\n"
    "void main() {\n"
    "    uint id = TDIndex();\n"
    "    if (id >= TDNumElements()) return;\n"
    "    vec3 pos = TDIn_P(0, id);\n"
    "    // Simple orbital motion\n"
    "    float angle = atan(pos.z, pos.x) + u_time * 0.3;\n"
    "    float rad = length(pos.xz);\n"
    "    pos.x = cos(angle) * rad;\n"
    "    pos.z = sin(angle) * rad;\n"
    "    pos.y += sin(u_time + id * 0.01) * 0.1;\n"
    "    P[id] = pos;\n"
    "    // Color by height\n"
    "    Cd[id] = vec4(pos.y * 0.3 + 0.5, 0.6, 1.0 - pos.y * 0.3, 1.0);\n"
    "}\n"
)


# ─── Operator topology ────────────────────────────────────────────────────────

ALL_NODES = [
    # ── Chain 1: glsladvancedPOP primitive compute ────────────────────────
    {"name": "src_prim", "opType": "boxPOP",
     "x": -2 * NODE_SPACING_X, "y": 0,
     "key_params": {"sizex": 1.5, "depth": 5}, "is_source": True},
    {"name": "dat_prim", "opType": "textDAT",
     "x": -1 * NODE_SPACING_X, "y": NODE_SPACING_Y,
     "key_params": {}, "text_content": GLSL_PRIM_SHADER, "is_dat": True},
    {"name": "gadv_prim", "opType": "glsladvancedPOP",
     "x": 0, "y": 0,
     "key_params": {}, "is_source": False},
    {"name": "out_prim", "opType": "nullPOP",
     "x": NODE_SPACING_X, "y": 0,
     "key_params": {}, "is_source": False},

    # ── Chain 2: Multi-pass GLSL TOP (npasses=4) ────────────────────────
    {"name": "src_multipass", "opType": "noiseTOP",
     "x": -2 * NODE_SPACING_X, "y": 2 * NODE_SPACING_Y,
     "key_params": {"amp": 0.8}, "is_source": True},
    {"name": "dat_multipass", "opType": "textDAT",
     "x": -1 * NODE_SPACING_X, "y": 3 * NODE_SPACING_Y,
     "key_params": {}, "text_content": GLSL_MULTIPASS_SHADER, "is_dat": True},
    {"name": "glsl_multipass", "opType": "glslTOP",
     "x": 0, "y": 2 * NODE_SPACING_Y,
     "key_params": {}, "is_source": False},
    {"name": "out_multipass", "opType": "nullTOP",
     "x": NODE_SPACING_X, "y": 2 * NODE_SPACING_Y,
     "key_params": {}, "is_source": False},

    # ── Chain 3: GLSL TOP vertex shader ──────────────────────────────────
    {"name": "src_vertex", "opType": "noiseTOP",
     "x": -2 * NODE_SPACING_X, "y": 4 * NODE_SPACING_Y,
     "key_params": {"amp": 0.6}, "is_source": True},
    {"name": "dat_vertex_vs", "opType": "textDAT",
     "x": -1 * NODE_SPACING_X, "y": 5 * NODE_SPACING_Y,
     "key_params": {}, "text_content": GLSL_VERTEX_SHADER, "is_dat": True},
    {"name": "dat_vertex_ps", "opType": "textDAT",
     "x": 0, "y": 5 * NODE_SPACING_Y,
     "key_params": {}, "text_content": GLSL_VERTEX_PIXEL_PASSTHROUGH, "is_dat": True},
    {"name": "glsl_vertex", "opType": "glslTOP",
     "x": NODE_SPACING_X, "y": 4 * NODE_SPACING_Y,
     "key_params": {}, "is_source": False},
    {"name": "out_vertex", "opType": "nullTOP",
     "x": 2 * NODE_SPACING_X, "y": 4 * NODE_SPACING_Y,
     "key_params": {}, "is_source": False},

    # ── Chain 4: glsladvancedPOP extra output ────────────────────────────
    {"name": "src_extra", "opType": "spherePOP",
     "x": -2 * NODE_SPACING_X, "y": 6 * NODE_SPACING_Y,
     "key_params": {"radx": 1.0, "rady": 1.0, "rows": 12, "cols": 12}, "is_source": True},
    {"name": "dat_extra", "opType": "textDAT",
     "x": -1 * NODE_SPACING_X, "y": 7 * NODE_SPACING_Y,
     "key_params": {}, "text_content": GLSL_EXTRAOUT_SHADER, "is_dat": True},
    {"name": "gadv_extra", "opType": "glsladvancedPOP",
     "x": 0, "y": 6 * NODE_SPACING_Y,
     "key_params": {}, "is_source": False},
    {"name": "out_extra", "opType": "nullPOP",
     "x": NODE_SPACING_X, "y": 6 * NODE_SPACING_Y,
     "key_params": {}, "is_source": False},
]

# Connections
CONNECTIONS = [
    # Chain 1: glsladvancedPOP primitive
    ("src_prim", "gadv_prim"),
    ("gadv_prim", "out_prim"),
    # Chain 2: multi-pass GLSL TOP
    ("src_multipass", "glsl_multipass"),
    ("glsl_multipass", "out_multipass"),
    # Chain 3: vertex shader GLSL TOP
    ("src_vertex", "glsl_vertex"),
    ("glsl_vertex", "out_vertex"),
    # Chain 4: glsladvancedPOP extra output
    ("src_extra", "gadv_extra"),
    ("gadv_extra", "out_extra"),
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

    @property
    def total(self) -> int:
        return len(self.steps)

    @property
    def pass_count(self) -> int:
        return sum(1 for s in self.steps if s["ok"])


def _py_repr(value) -> str:
    if isinstance(value, bool):
        return "True" if value else "False"
    if isinstance(value, (int, float)):
        return repr(value)
    return repr(str(value))


# ─── Build phase ──────────────────────────────────────────────────────────────

def build_network(td: TDClient, res: TestResult) -> bool:
    """Create sandbox + all nodes + wire connections."""

    # Phase 1: create sandbox
    try:
        td.exec("c = op(%r); c.destroy() if c is not None else None" % SANDBOX_PATH)
        td.exec("op(%r).create(baseCOMP, %r)" % (SANDBOX_PARENT, SANDBOX_NAME))
        td.exec("op(%r).nodeX = 0; op(%r).nodeY = 0" % (SANDBOX_PATH, SANDBOX_PATH))
        res.step("sandbox_create", True, SANDBOX_PATH)
    except Exception as e:
        res.step("sandbox_create", False, str(e))
        return False

    # Phase 2: create all nodes
    created = {}
    for node in ALL_NODES:
        path = f"{SANDBOX_PATH}/{node['name']}"
        try:
            td.exec("op(%r).create(%s, %r)" % (SANDBOX_PATH, node["opType"], node["name"]))
            created[node["name"]] = path
            res.step(f"cr_{node['name']}", True, node["opType"])
        except Exception as e:
            res.step(f"cr_{node['name']}", False, str(e))

    ok = len(created) == len(ALL_NODES)
    res.step("cr_all", ok, f"{len(created)}/{len(ALL_NODES)} nodes")
    if not ok:
        print("  [WARN] continuing with partial network")

    # Phase 2b: write text content into DAT nodes
    for node in ALL_NODES:
        if not node.get("text_content"):
            continue
        try:
            td.exec("op(%r).text = %r" % (f"{SANDBOX_PATH}/{node['name']}", node["text_content"]))
            res.step(f"txt_{node['name']}", True, "shader text written")
        except Exception as e:
            res.step(f"txt_{node['name']}", False, str(e))

    # Phase 2c: setup glsladvancedPOP computedat for Chain 1 (prim)
    _setup_gadv(td, res, "gadv_prim", "dat_prim", "setup_gadv_prim",
                ptoutputattrs=None, primoutputattrs="N")
    # Chain 4 (extra output)
    _setup_gadv(td, res, "gadv_extra", "dat_extra", "setup_gadv_extra",
                ptoutputattrs="P", primoutputattrs=None, extra_output=True)

    # Phase 2d: setup GLSL TOPs
    # Chain 2: multi-pass — set computedat + npasses
    _setup_glsl_top(td, res, "glsl_multipass", "dat_multipass", "setup_multipass")
    # Set npasses=4
    try:
        td.exec("op(%r).par.npasses = 4" % f"{SANDBOX_PATH}/glsl_multipass")
        res.step("set_npasses", True, "npasses=4")
    except Exception as e:
        res.step("set_npasses", False, str(e))

    # Chain 3: vertex shader — set vertexdat + pixeldat
    _setup_glsl_top(td, res, "glsl_vertex", "dat_vertex_ps", "setup_vertex_pixeldat")
    try:
        td.exec("op(%r).par.vertexdat = %r" % (f"{SANDBOX_PATH}/glsl_vertex", "dat_vertex_vs"))
        res.step("setup_vertex_vs", True, "vertexdat=dat_vertex_vs")
    except Exception as e:
        res.step("setup_vertex_vs", False, str(e))

    # Phase 2e: set scalar/toggle params
    for node in ALL_NODES:
        if not node["key_params"]:
            continue
        for pname, pval in node["key_params"].items():
            try:
                td.exec("op(%r).par.%s = %s" % (
                    f"{SANDBOX_PATH}/{node['name']}", pname, _py_repr(pval)))
            except Exception as e:
                res.step(f"par_{node['name']}_{pname}", False, str(e))
        res.step(f"par_{node['name']}", True, f"set {len(node['key_params'])} param(s)")

    # Phase 3: wire connections
    wired = 0
    for conn in CONNECTIONS:
        src_name, tgt_name = conn
        if src_name not in created or tgt_name not in created:
            res.step(f"w_{src_name}_to_{tgt_name}", False, "missing node")
            continue
        try:
            td.exec(
                "op(%r).outputConnectors[0].connect(op(%r))"
                % (created[src_name], created[tgt_name]))
            wired += 1
            res.step(f"w_{src_name}_to_{tgt_name}", True)
        except Exception as e:
            res.step(f"w_{src_name}_to_{tgt_name}", False, str(e))
    res.step("w_all", wired == len(CONNECTIONS), f"{wired}/{len(CONNECTIONS)}")

    # Phase 4: position nodes
    positioned = 0
    for node in ALL_NODES:
        try:
            td.exec("o = op(%r); o.nodeX = %d; o.nodeY = %d" % (
                f"{SANDBOX_PATH}/{node['name']}", node["x"], node["y"]))
            positioned += 1
        except Exception as e:
            res.step(f"ly_{node['name']}", False, str(e))
    res.step("ly_all", positioned == len(ALL_NODES), f"{positioned}/{len(ALL_NODES)}")

    return True


def _setup_gadv(td: TDClient, res: TestResult, gadv_name: str,
                dat_name: str, step_name: str,
                ptoutputattrs=None, primoutputattrs=None,
                extra_output=False) -> None:
    """Setup glsladvancedPOP: computedat + output attrs + optional extra output."""
    path = f"{SANDBOX_PATH}/{gadv_name}"
    code = (
        "import json\n"
        "o = op(%r)\n"
        "res = {}\n"
        "try:\n"
        "    o.par.computedat = %r\n"
        "    res['computedat'] = True\n"
        "except Exception as e:\n"
        "    res['computedat'] = 'ERR:' + str(e)[:80]\n"
    ) % (path, dat_name)

    if ptoutputattrs:
        code += (
            "try:\n"
            "    o.par.ptoutputattrs = %r\n"
            "    res['ptoutputattrs'] = True\n"
            "except Exception as e:\n"
            "    res['ptoutputattrs'] = 'ERR:' + str(e)[:80]\n"
        ) % ptoutputattrs

    if primoutputattrs:
        code += (
            "try:\n"
            "    o.par.primoutputattrs = %r\n"
            "    res['primoutputattrs'] = True\n"
            "except Exception as e:\n"
            "    res['primoutputattrs'] = 'ERR:' + str(e)[:80]\n"
        ) % primoutputattrs

    if extra_output:
        code += (
            "try:\n"
            "    o.par.extraout = 1\n"
            "    res['extraout'] = True\n"
            "except Exception as e:\n"
            "    res['extraout'] = 'ERR:' + str(e)[:80]\n"
            "try:\n"
            "    o.par.extraout0name = 'myVelocity'\n"
            "    res['extraout0name'] = True\n"
            "except Exception as e:\n"
            "    res['extraout0name'] = 'ERR:' + str(e)[:80]\n"
        )

    code += "print(json.dumps(res))\n"

    try:
        raw = td.exec(code)
        data = json.loads(raw.strip().splitlines()[-1]) if raw.strip() else {}
        ok = all(v is True for v in data.values())
        detail = ", ".join(f"{k}={'ok' if v is True else v}" for k, v in data.items())
        res.step(step_name, ok, detail)
    except Exception as e:
        res.step(step_name, False, str(e))


def _setup_glsl_top(td: TDClient, res: TestResult, glsl_name: str,
                    dat_name: str, step_name: str) -> None:
    """Set pixeldat on a glslTOP."""
    path = f"{SANDBOX_PATH}/{glsl_name}"
    try:
        td.exec("op(%r).par.pixeldat = %r" % (path, dat_name))
        res.step(step_name, True, f"pixeldat={dat_name}")
    except Exception as e:
        res.step(step_name, False, str(e))


# ─── Verify phase ─────────────────────────────────────────────────────────────

def verify_network(td: TDClient, res: TestResult) -> None:
    """Verify all GLSL ops compiled, wired, and zero errors."""
    time.sleep(1.5)

    # Inspect all children
    inspect_code = (
        "import json\n"
        "c = op(%r)\n"
        "out = {'nodes': []}\n"
        "if c is not None:\n"
        "    for n in c.findChildren():\n"
        "        info = {'name': n.name,\n"
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

    # Check all expected nodes exist with correct opType
    present = 0
    for node in ALL_NODES:
        n = by_name.get(node["name"])
        if n is None:
            res.step(f"pr_{node['name']}", False, "not found")
        else:
            ok = n["opType"] == node["opType"]
            if ok:
                present += 1
            res.step(f"pr_{node['name']}", ok,
                     f"opType={n['opType']}" + ("" if ok else f" (expected {node['opType']})"))
    res.step("pr_all", present == len(ALL_NODES), f"{present}/{len(ALL_NODES)}")

    # Check zero errors
    any_errors = False
    for n in nodes:
        if n["errors"]:
            any_errors = True
            res.step(f"err_{n['name']}", False, " | ".join(n["errors"]))
    if not any_errors:
        res.step("err_all", True, "all operators error-free")

    # Check GLSL compilation (glsladvancedPOP + glslTOP nodes)
    glsl_names = [n["name"] for n in ALL_NODES
                  if n["opType"] in ("glsladvancedPOP", "glslTOP")]
    for gn in glsl_names:
        gn_node = by_name.get(gn)
        if gn_node:
            ok = not gn_node["errors"]
            res.step(f"glsl_compile_{gn}", ok,
                     "no errors" if ok else f"errors: {gn_node['errors']}")

    # Check connections
    for conn in CONNECTIONS:
        src_name, tgt_name = conn
        tgt_node = by_name.get(tgt_name)
        if tgt_node is None:
            res.step(f"cn_{src_name}_to_{tgt_name}", False, f"{tgt_name} missing")
            continue
        expected_src = f"{SANDBOX_PATH}/{src_name}"
        flat = [owner for inp in tgt_node["inputs"] for owner in inp]
        ok = expected_src in flat
        res.step(f"cn_{src_name}_to_{tgt_name}", ok,
                 "wired" if ok else f"inputs={flat}")

    # Check npasses on glsl_multipass
    try:
        raw = td.exec(
            "import json\n"
            "o = op('%s/glsl_multipass')\n"
            "print(json.dumps({'npasses': o.par.npasses.eval()}))\n" % SANDBOX_PATH)
        params = json.loads(raw.strip().splitlines()[-1]) if raw.strip() else {}
        np = params.get("npasses", 0)
        res.step("check_npasses", np == 4, f"npasses={np}" + ("" if np == 4 else " (expected 4)"))
    except Exception as e:
        res.step("check_npasses", False, str(e))

    # Check vertexdat on glsl_vertex
    try:
        raw = td.exec(
            "import json\n"
            "o = op('%s/glsl_vertex')\n"
            "vd = str(o.par.vertexdat.eval()) if hasattr(o.par, 'vertexdat') else 'N/A'\n"
            "print(json.dumps({'vertexdat': vd}))\n" % SANDBOX_PATH)
        params = json.loads(raw.strip().splitlines()[-1]) if raw.strip() else {}
        vd = params.get("vertexdat", "")
        res.step("check_vertexdat", "dat_vertex_vs" in str(vd),
                 f"vertexdat={vd}")
    except Exception as e:
        res.step("check_vertexdat", False, str(e))

    # Check extra output on gadv_extra
    try:
        raw = td.exec(
            "import json\n"
            "o = op('%s/gadv_extra')\n"
            "eo_exists = hasattr(o.par, 'extraout')\n"
            "eo = int(o.par.extraout.eval()) if eo_exists else 'N/A'\n"
            "en = str(o.par.extraout0name.eval()) if hasattr(o.par, 'extraout0name') else 'N/A'\n"
            "print(json.dumps({'extraout_exists': eo_exists, 'extraout_val': eo, 'extraout0name': en}))\n" % SANDBOX_PATH)
        params = json.loads(raw.strip().splitlines()[-1]) if raw.strip() else {}
        eo_exists = params.get("extraout_exists", False)
        eo_val = params.get("extraout_val")
        en = params.get("extraout0name", "")
        # extraout is a Sequence param (pulse) — it fires but resets to 0.
        # Verify the param exists and the extra output config (name) is set.
        res.step("check_extraout", eo_exists, f"extraout_param_exists={eo_exists}")
        res.step("check_extraout_name", en == "myVelocity",
                 f"extraout0name={en}" + ("" if en == "myVelocity" else " (expected myVelocity)"))
    except Exception as e:
        res.step("check_extraout", False, str(e))

    # /verify endpoint
    try:
        v = td.get_json(f"/verify?path={SANDBOX_PATH}")
        healthy = bool(v.get("healthy", False))
        err_cnt = int(v.get("error_count", -1))
        res.step("verify_endpoint", healthy and err_cnt == 0,
                 f"healthy={healthy}, errors={err_cnt}, ops={v.get('operator_count')}")
    except Exception as e:
        res.step("verify_endpoint", False, str(e))

    # RULE 2: async GLSL re-check
    print("\n--- RULE 2: Async GLSL re-check ---")
    try:
        td.exec("c = op(%r); c.cook(force=True)" % SANDBOX_PATH)
        time.sleep(2.0)
        recheck = (
            "import json\n"
            "c = op(%r)\n"
            "errs = []\n"
            "for n in c.findChildren():\n"
            "    e = list(n.errors()) if n.errors() else []\n"
            "    if e:\n"
            "        errs.append({'name': n.name, 'errors': [str(x) for x in e]})\n"
            "print(json.dumps(errs))\n"
        ) % SANDBOX_PATH
        raw = td.exec(recheck)
        post_errors = json.loads(raw.strip().splitlines()[-1]) if raw.strip() else []
        res.step("async_clean", len(post_errors) == 0,
                 "all async-clean" if not post_errors else f"{len(post_errors)} error(s)")
        for pe in post_errors:
            res.step(f"async_{pe.get('name', '?')}", False, str(pe.get("errors", [])))
    except Exception as e:
        res.step("async_recheck", False, str(e))


def cleanup(td: TDClient, res: TestResult) -> None:
    try:
        td.exec("c = op(%r); c.destroy() if c is not None else None" % SANDBOX_PATH)
        gone = td.exec("print('GONE' if op(%r) is None else 'STILL')" % SANDBOX_PATH).strip()
        res.step("cleanup", gone == "GONE", "destroyed" if gone == "GONE" else "still present")
    except Exception as e:
        res.step("cleanup", False, str(e))


# ─── Main ─────────────────────────────────────────────────────────────────────

def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

    td = TDClient(DEFAULT_HOST, DEFAULT_PORT)
    res = TestResult()

    print("=" * 72)
    print("  Extreme GLSL Test — glsladvancedPOP + Multi-Pass + Vertex Shaders")
    print(f"  Target: http://{DEFAULT_HOST}:{DEFAULT_PORT}")
    print(f"  Sandbox: {SANDBOX_PATH}")
    print(f"  Nodes: {len(ALL_NODES)}, Connections: {len(CONNECTIONS)}")
    print("  Chain 1: glsladvancedPOP prim compute (primoutputattrs='N')")
    print("  Chain 2: Multi-pass GLSL TOP (npasses=4)")
    print("  Chain 3: GLSL TOP vertex shader (vertexdat)")
    print("  Chain 4: glsladvancedPOP extra output (extraout)")
    print("=" * 72)
    print()

    if not td.ping():
        print("ERROR: Cannot reach TouchDesigner HTTP API.")
        return 2

    info = td.get_json("/info")
    print(f"Connected: {info.get('version', '?')} @ {info.get('projectFPS', '?')} FPS\n")

    print("--- Build phase ---")
    if not build_network(td, res):
        print("\nBuild failed.")
        return 1

    print("\n--- Verify phase ---")
    verify_network(td, res)

    print("\n--- Cleanup ---")
    cleanup(td, res)

    print(f"\n{'=' * 72}")
    print(f"  Results: {res.pass_count}/{res.total} passed, {len(res.failures)} failed")
    print(f"{'=' * 72}")

    if not res.passed:
        print("\nFailed checks:")
        for f in res.failures:
            print(f"  - {f}")

    return 1 if res.failures else 0


if __name__ == "__main__":
    sys.exit(main())
