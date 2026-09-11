#!/usr/bin/env python3
"""
Live TD Test: Advanced GLSL — TOP Fragments, Feedback Loops, Multi-Pass
=======================================================================

EXPLICIT RULES (verified every run):
  RULE 1 — CONTAINER: All operators inside a UUID-named baseCOMP.
  RULE 2 — NO ERRORS: Immediate + async post-cook re-check.
  RULE 3 — NO OVERLAP: Grid positions verified for separation.

Tests GLSL patterns NOT covered by existing tests:

  Chain 1 — GLSL TOP Fragment Shaders (pixel/fragment shaders):
    a) Threshold — luminance threshold on noiseTOP input
    b) Blur — 3x3 box blur on noiseTOP input
    c) Color Manipulation — procedural gradient with time uniform

  Chain 2 — Feedback Loop (FeedbackTOP + GLSL TOP):
    constantTOP → compositeTOP → feedbackTOP → glslTOP(decal) → nullTOP
    feedbackTOP.top = nullTOP (closes the loop)

  Chain 3 — Multi-Pass GLSL TOP:
    noiseTOP → glslTOP_pass1(edge detect) → glslTOP_pass2(blur) → nullTOP
    Two GLSL TOPs in series, each performing a distinct image operation.

Parameter-name notes (empirically verified):
  - glslTOP:      pixeldat (String — name of the pixel shader DAT, NOT computedat)
  - feedbackTOP:  top (OP reference — downstream nullTOP)
  - noiseTOP:     amp (Float), period (Float)

Exit code 0 = pass, non-zero = fail. Safe to re-run.
"""

from __future__ import annotations

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
SANDBOX_NAME = f"test_glsl_adv_{uuid.uuid4().hex[:8]}"
SANDBOX_PATH = f"{SANDBOX_PARENT}/{SANDBOX_NAME}"

NODE_SPACING_X = 400
NODE_SPACING_Y = 300

# ─── GLSL TOP Fragment Shaders ────────────────────────────────────────────────
# These are pixel shaders for glslTOP (NOT compute shaders for glslPOP).
# They use sTD2DInputs[], vUV.st, fragColor, TDOutputSwizzle().

# Chain 1a: Threshold — luminance-based black/white threshold
GLSL_TOP_THRESHOLD = (
    "out vec4 fragColor;\n"
    "void main() {\n"
    "    vec4 src = texture(sTD2DInputs[0], vUV.st);\n"
    "    float lum = dot(src.rgb, vec3(0.299, 0.587, 0.114));\n"
    "    float thresh = 0.3;\n"
    "    vec3 result = (lum > thresh) ? src.rgb : vec3(0.0);\n"
    "    fragColor = TDOutputSwizzle(vec4(result, 1.0));\n"
    "}\n"
)

# Chain 1b: Blur — 3x3 box blur
GLSL_TOP_BLUR = (
    "out vec4 fragColor;\n"
    "void main() {\n"
    "    vec2 res = uTD2DInfos[0].res.zw;\n"
    "    vec4 sum = vec4(0.0);\n"
    "    for (int x = -1; x <= 1; x++) {\n"
    "        for (int y = -1; y <= 1; y++) {\n"
    "            vec2 offset = vec2(float(x), float(y)) * res;\n"
    "            sum += texture(sTD2DInputs[0], vUV.st + offset);\n"
    "        }\n"
    "    }\n"
    "    fragColor = TDOutputSwizzle(sum / 9.0);\n"
    "}\n"
)

# Chain 1c: Color Manipulation — procedural gradient with time
GLSL_TOP_GRADIENT = (
    "out vec4 fragColor;\n"
    "uniform float u_time;\n"
    "void main() {\n"
    "    vec2 st = vUV.st;\n"
    "    vec3 col = vec3(\n"
    "        0.5 + 0.5 * sin(st.x * 6.28 + u_time),\n"
    "        0.5 + 0.5 * sin(st.y * 6.28 + u_time * 0.7),\n"
    "        0.5 + 0.5 * sin((st.x + st.y) * 3.14 + u_time * 1.3)\n"
    "    );\n"
    "    fragColor = TDOutputSwizzle(vec4(col, 1.0));\n"
    "}\n"
)

# Chain 2: Feedback Loop — decal shader that zooms and fades feedback texture
GLSL_TOP_FEEDBACK_DECAL = (
    "out vec4 fragColor;\n"
    "void main() {\n"
    "    vec2 uv = vUV.st - vec2(0.5);\n"
    "    uv *= 0.98;\n"
    "    uv += vec2(0.5);\n"
    "    vec4 fb = texture(sTD2DInputs[0], uv);\n"
    "    fb.rgb *= 0.92;\n"
    "    fragColor = TDOutputSwizzle(fb);\n"
    "}\n"
)

# Chain 3: Multi-pass Pass 1 — Sobel edge detection
GLSL_TOP_EDGE_DETECT = (
    "out vec4 fragColor;\n"
    "void main() {\n"
    "    vec2 res = uTD2DInfos[0].res.zw;\n"
    "    vec4 tl = texture(sTD2DInputs[0], vUV.st + vec2(-res.x, -res.y));\n"
    "    vec4 tc = texture(sTD2DInputs[0], vUV.st + vec2(0.0, -res.y));\n"
    "    vec4 tr = texture(sTD2DInputs[0], vUV.st + vec2(res.x, -res.y));\n"
    "    vec4 ml = texture(sTD2DInputs[0], vUV.st + vec2(-res.x, 0.0));\n"
    "    vec4 mr = texture(sTD2DInputs[0], vUV.st + vec2(res.x, 0.0));\n"
    "    vec4 bl = texture(sTD2DInputs[0], vUV.st + vec2(-res.x, res.y));\n"
    "    vec4 bc = texture(sTD2DInputs[0], vUV.st + vec2(0.0, res.y));\n"
    "    vec4 br = texture(sTD2DInputs[0], vUV.st + vec2(res.x, res.y));\n"
    "    vec3 sx = -tl.rgb - 2.0*ml.rgb - bl.rgb + tr.rgb + 2.0*mr.rgb + br.rgb;\n"
    "    vec3 sy = -tl.rgb - 2.0*tc.rgb - tr.rgb + bl.rgb + 2.0*bc.rgb + br.rgb;\n"
    "    float edge = length(sx) + length(sy);\n"
    "    fragColor = TDOutputSwizzle(vec4(vec3(edge), 1.0));\n"
    "}\n"
)

# Chain 3: Multi-pass Pass 2 — Soft glow on edge output
GLSL_TOP_SOFT_GLOW = (
    "out vec4 fragColor;\n"
    "void main() {\n"
    "    vec2 res = uTD2DInfos[0].res.zw;\n"
    "    vec4 sum = vec4(0.0);\n"
    "    for (int x = -2; x <= 2; x++) {\n"
    "        for (int y = -2; y <= 2; y++) {\n"
    "            vec2 offset = vec2(float(x), float(y)) * res * 2.0;\n"
    "            sum += texture(sTD2DInputs[0], vUV.st + offset);\n"
    "        }\n"
    "    }\n"
    "    vec4 blurred = sum / 25.0;\n"
    "    vec4 sharp = texture(sTD2DInputs[0], vUV.st);\n"
    "    vec4 result = max(sharp, blurred * 1.5);\n"
    "    result.rgb *= vec3(0.3, 1.0, 0.5);\n"
    "    fragColor = TDOutputSwizzle(result);\n"
    "}\n"
)


# ─── Operator topology ────────────────────────────────────────────────────────

ALL_NODES = [
    # ── Chain 1a: Threshold GLSL TOP ──────────────────────────────────────
    {"name": "src_threshold", "opType": "noiseTOP",
     "x": -2 * NODE_SPACING_X, "y": 0,
     "key_params": {"amp": 0.8}, "is_source": True},
    {"name": "dat_threshold", "opType": "textDAT",
     "x": -1 * NODE_SPACING_X, "y": NODE_SPACING_Y,
     "key_params": {}, "text_content": GLSL_TOP_THRESHOLD, "is_dat": True},
    {"name": "glsl_threshold", "opType": "glslTOP",
     "x": 0, "y": 0,
     "key_params": {}, "is_source": False},
    {"name": "out_threshold", "opType": "nullTOP",
     "x": NODE_SPACING_X, "y": 0,
     "key_params": {}, "is_source": False},

    # ── Chain 1b: Blur GLSL TOP ───────────────────────────────────────────
    {"name": "src_blur", "opType": "noiseTOP",
     "x": -2 * NODE_SPACING_X, "y": NODE_SPACING_Y,
     "key_params": {"amp": 0.6}, "is_source": True},
    {"name": "dat_blur", "opType": "textDAT",
     "x": -1 * NODE_SPACING_X, "y": 2 * NODE_SPACING_Y,
     "key_params": {}, "text_content": GLSL_TOP_BLUR, "is_dat": True},
    {"name": "glsl_blur", "opType": "glslTOP",
     "x": 0, "y": NODE_SPACING_Y,
     "key_params": {}, "is_source": False},
    {"name": "out_blur", "opType": "nullTOP",
     "x": NODE_SPACING_X, "y": NODE_SPACING_Y,
     "key_params": {}, "is_source": False},

    # ── Chain 1c: Gradient GLSL TOP ───────────────────────────────────────
    {"name": "src_gradient", "opType": "noiseTOP",
     "x": -2 * NODE_SPACING_X, "y": 2 * NODE_SPACING_Y,
     "key_params": {"amp": 0.5}, "is_source": True},
    {"name": "dat_gradient", "opType": "textDAT",
     "x": -1 * NODE_SPACING_X, "y": 3 * NODE_SPACING_Y,
     "key_params": {}, "text_content": GLSL_TOP_GRADIENT, "is_dat": True},
    {"name": "glsl_gradient", "opType": "glslTOP",
     "x": 0, "y": 2 * NODE_SPACING_Y,
     "key_params": {}, "is_source": False},
    {"name": "out_gradient", "opType": "nullTOP",
     "x": NODE_SPACING_X, "y": 2 * NODE_SPACING_Y,
     "key_params": {}, "is_source": False},

    # ── Chain 2: Feedback Loop ────────────────────────────────────────────
    # constantTOP → compositeTOP(+feedback) → glslTOP(decal) → nullTOP
    # feedbackTOP.target = nullTOP (closes the loop)
    {"name": "src_feedback", "opType": "constantTOP",
     "x": -3 * NODE_SPACING_X, "y": 4 * NODE_SPACING_Y,
     "key_params": {"colorr": 0.8, "colorg": 0.2, "colorb": 1.0}, "is_source": True},
    {"name": "fb_glsl_dat", "opType": "textDAT",
     "x": -1 * NODE_SPACING_X, "y": 5 * NODE_SPACING_Y,
     "key_params": {}, "text_content": GLSL_TOP_FEEDBACK_DECAL, "is_dat": True},
    {"name": "fb_feedback", "opType": "feedbackTOP",
     "x": -1 * NODE_SPACING_X, "y": 4 * NODE_SPACING_Y,
     "key_params": {}, "is_source": False},
    {"name": "fb_composite", "opType": "compositeTOP",
     "x": 0, "y": 4 * NODE_SPACING_Y,
     "key_params": {}, "is_source": False},
    {"name": "fb_glsl", "opType": "glslTOP",
     "x": NODE_SPACING_X, "y": 4 * NODE_SPACING_Y,
     "key_params": {}, "is_source": False},
    {"name": "fb_out", "opType": "nullTOP",
     "x": 2 * NODE_SPACING_X, "y": 4 * NODE_SPACING_Y,
     "key_params": {}, "is_source": False},

    # ── Chain 3: Multi-Pass (edge detect → soft glow) ─────────────────────
    {"name": "src_multipass", "opType": "noiseTOP",
     "x": -2 * NODE_SPACING_X, "y": 6 * NODE_SPACING_Y,
     "key_params": {"amp": 1.0}, "is_source": True},
    {"name": "mp_dat1", "opType": "textDAT",
     "x": -1 * NODE_SPACING_X, "y": 7 * NODE_SPACING_Y,
     "key_params": {}, "text_content": GLSL_TOP_EDGE_DETECT, "is_dat": True},
    {"name": "mp_glsl1", "opType": "glslTOP",
     "x": 0, "y": 6 * NODE_SPACING_Y,
     "key_params": {}, "is_source": False},
    {"name": "mp_dat2", "opType": "textDAT",
     "x": 1 * NODE_SPACING_X, "y": 7 * NODE_SPACING_Y,
     "key_params": {}, "text_content": GLSL_TOP_SOFT_GLOW, "is_dat": True},
    {"name": "mp_glsl2", "opType": "glslTOP",
     "x": 1 * NODE_SPACING_X, "y": 6 * NODE_SPACING_Y,
     "key_params": {}, "is_source": False},
    {"name": "mp_out", "opType": "nullTOP",
     "x": 2 * NODE_SPACING_X, "y": 6 * NODE_SPACING_Y,
     "key_params": {}, "is_source": False},
]

# ── Connections ──────────────────────────────────────────────────────────────
# (src, tgt) or (src, tgt, inputIndex)
CONNECTIONS = [
    # Chain 1a: threshold
    ("src_threshold", "glsl_threshold"),
    ("glsl_threshold", "out_threshold"),
    # Chain 1b: blur
    ("src_blur", "glsl_blur"),
    ("glsl_blur", "out_blur"),
    # Chain 1c: gradient
    ("src_gradient", "glsl_gradient"),
    ("glsl_gradient", "out_gradient"),
    # Chain 2: feedback loop
    ("src_feedback", "fb_composite", 0),
    ("fb_feedback", "fb_composite", 1),
    ("fb_composite", "fb_glsl"),
    ("fb_glsl", "fb_out"),
    # Chain 3: multi-pass
    ("src_multipass", "mp_glsl1"),
    ("mp_glsl1", "mp_glsl2"),
    ("mp_glsl2", "mp_out"),
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

    # Phase 2c: set GLSL TOP pixeldat parameters (pixeldat, NOT computedat)
    # Chain 1a: glsl_threshold
    _setup_glsl_top(td, res, "glsl_threshold", "dat_threshold", "setup_threshold")
    # Chain 1b: glsl_blur
    _setup_glsl_top(td, res, "glsl_blur", "dat_blur", "setup_blur")
    # Chain 1c: glsl_gradient
    _setup_glsl_top(td, res, "glsl_gradient", "dat_gradient", "setup_gradient")
    # Chain 2: fb_glsl
    _setup_glsl_top(td, res, "fb_glsl", "fb_glsl_dat", "setup_fb_glsl")
    # Chain 3: mp_glsl1 + mp_glsl2
    _setup_glsl_top(td, res, "mp_glsl1", "mp_dat1", "setup_mp1")
    _setup_glsl_top(td, res, "mp_glsl2", "mp_dat2", "setup_mp2")

    # Phase 2d: set scalar/toggle params
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

    # Phase 2e: setup feedbackTOP target (must point to fb_out)
    try:
        td.exec(
            "op(%r).par.top = op(%r)" % (
                f"{SANDBOX_PATH}/fb_feedback", f"{SANDBOX_PATH}/fb_out"))
        res.step("feedback_target", True, "top=fb_out")
    except Exception as e:
        res.step("feedback_target", False, str(e))

    # Phase 3: wire connections
    wired = 0
    for conn in CONNECTIONS:
        if len(conn) == 3:
            src_name, tgt_name, input_idx = conn
        else:
            src_name, tgt_name = conn
            input_idx = 0
        if src_name not in created or tgt_name not in created:
            res.step(f"w_{src_name}_to_{tgt_name}", False, "missing node")
            continue
        try:
            td.exec(
                "op(%r).outputConnectors[0].connect(op(%r).inputConnectors[%d])"
                % (created[src_name], created[tgt_name], input_idx))
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


def _setup_glsl_top(td: TDClient, res: TestResult, glsl_name: str,
                    dat_name: str, step_name: str) -> None:
    """Set pixeldat on a glslTOP (NOT computedat — that's for glslPOP)."""
    path = f"{SANDBOX_PATH}/{glsl_name}"
    try:
        td.exec("op(%r).par.pixeldat = %r" % (path, dat_name))
        res.step(step_name, True, f"pixeldat={dat_name}")
    except Exception as e:
        res.step(step_name, False, str(e))


# ─── Verify phase ─────────────────────────────────────────────────────────────

def verify_network(td: TDClient, res: TestResult) -> None:
    """Verify all GLSL TOPs compiled, wired, and zero errors."""
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

    # Check GLSL TOP compilation (all glslTOP nodes)
    glsl_names = [n["name"] for n in ALL_NODES if n["opType"] == "glslTOP"]
    for gn in glsl_names:
        gn_node = by_name.get(gn)
        if gn_node:
            ok = not gn_node["errors"]
            res.step(f"glsl_compile_{gn}", ok,
                     "no errors" if ok else f"errors: {gn_node['errors']}")

    # Check connections
    for conn in CONNECTIONS:
        if len(conn) == 3:
            src_name, tgt_name, input_idx = conn
        else:
            src_name, tgt_name = conn
            input_idx = 0
        tgt_node = by_name.get(tgt_name)
        if tgt_node is None:
            res.step(f"cn_{src_name}_to_{tgt_name}", False, f"{tgt_name} missing")
            continue
        expected_src = f"{SANDBOX_PATH}/{src_name}"
        input_list = tgt_node["inputs"][input_idx] if len(tgt_node["inputs"]) > input_idx else []
        ok = expected_src in input_list
        res.step(f"cn_{src_name}_to_{tgt_name}", ok,
                 "wired" if ok else f"input[{input_idx}]={input_list}")

    # Check layout (no overlapping nodes)
    positions = []
    for node in ALL_NODES:
        n = by_name.get(node["name"])
        if n and n["x"] is not None:
            positions.append((node["name"], n["x"], n["y"]))
    overlap = False
    for i in range(len(positions)):
        for j in range(i + 1, len(positions)):
            _, x1, y1 = positions[i]
            _, x2, y2 = positions[j]
            if abs(x1 - x2) < 100 and abs(y1 - y2) < 100:
                overlap = True
                res.step(f"ov_{positions[i][0]}_{positions[j][0]}", False,
                         f"overlap at ({x1},{y1}) vs ({x2},{y2})")
    res.step("layout_no_overlap", not overlap,
             "no overlapping nodes" if not overlap else "overlaps detected")

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
    print("  Advanced GLSL Test — TOP Fragments + Feedback + Multi-Pass")
    print(f"  Target: http://{DEFAULT_HOST}:{DEFAULT_PORT}")
    print(f"  Sandbox: {SANDBOX_PATH}")
    print(f"  Nodes: {len(ALL_NODES)}, Connections: {len(CONNECTIONS)}")
    print("  Chain 1: GLSL TOP fragments (threshold, blur, gradient)")
    print("  Chain 2: Feedback loop (FeedbackTOP + GLSL TOP decal)")
    print("  Chain 3: Multi-pass (edge detect → soft glow)")
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
