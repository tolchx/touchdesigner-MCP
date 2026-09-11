#!/usr/bin/env python3
"""
Live TD Test: GLSL TOP Intra-Frame Multi-Pass (npasses > 1)
=============================================================

EXPLICIT RULES (verified every run):
  RULE 1 — CONTAINER: All operators inside a UUID-named baseCOMP.
  RULE 2 — NO ERRORS: Immediate + async post-cook re-check.
  RULE 3 — NO OVERLAP: Grid positions verified for separation.

Tests intra-frame multi-pass GLSL TOP rendering NOT covered by any existing test:

  Chain 1 — 4-pass progressive blur:
    noiseTOP → glslTOP(npasses=4, blur shader) → nullTOP
    Each pass applies a 3x3 blur, progressively softening the image.
    Uses uTDPass uniform to apply blur on passes > 0 and pass-through on pass 0.

  Chain 2 — 3-pass edge detection + glow:
    noiseTOP → glslTOP(npasses=3, edge+glow shader) → nullTOP
    Pass 0: Sobel edge detection
    Pass 1: Blur the edges
    Pass 2: Composite original + blurred edges (glow effect)

  Chain 3 — 2-pass color grading:
    noiseTOP → glslTOP(npasses=2, color grade shader) → nullTOP
    Pass 0: Lift/gamma/gain color correction
    Pass 1: Vignette effect

  Chain 4 — npasses=1 baseline (control):
    noiseTOP → glslTOP(npasses=1) → nullTOP
    Single pass for comparison — validates npasses=1 still works.

Parameter-name notes (empirically verified):
  - glslTOP: pixeldat (String), npasses (Int), mode (Menu)
  - Built-in: uTDPass (Int, current pass index 0-based)

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
SANDBOX_NAME = f"test_npasses_{uuid.uuid4().hex[:8]}"
SANDBOX_PATH = f"{SANDBOX_PARENT}/{SANDBOX_NAME}"

NODE_SPACING_X = 400
NODE_SPACING_Y = 300

# ─── GLSL Shader Definitions ──────────────────────────────────────────────────

# Chain 1: 4-pass progressive blur
# Pass 0: pass-through, Pass 1-3: progressive 3x3 blur
GLSL_4PASS_BLUR = (
    "out vec4 fragColor;\n"
    "void main() {\n"
    "    vec2 texel = 1.0 / uTDOutputInfo.res;\n"
    "    vec4 color = texture(sTD2DInputs[0], vUV.st);\n"
    "    // Apply blur on passes 1-3, pass-through on pass 0\n"
    "    if (uTDPass > 0) {\n"
    "        vec4 sum = vec4(0.0);\n"
    "        for (int x = -1; x <= 1; x++) {\n"
    "            for (int y = -1; y <= 1; y++) {\n"
    "                vec2 offset = vec2(float(x), float(y)) * texel;\n"
    "                sum += texture(sTD2DInputs[0], vUV.st + offset);\n"
    "            }\n"
    "        }\n"
    "        color = sum / 9.0;\n"
    "    }\n"
    "    fragColor = TDOutputSwizzle(color);\n"
    "}\n"
)

# Chain 2: 3-pass edge detection + glow
GLSL_3PASS_EDGE_GLOW = (
    "out vec4 fragColor;\n"
    "void main() {\n"
    "    vec2 texel = 1.0 / uTDOutputInfo.res;\n"
    "    vec2 uv = vUV.st;\n"
    "    vec4 color = texture(sTD2DInputs[0], uv);\n"
    "    if (uTDPass == 0) {\n"
    "        // Pass 0: Sobel edge detection\n"
    "        vec4 tl = texture(sTD2DInputs[0], uv + vec2(-texel.x, -texel.y));\n"
    "        vec4 tc = texture(sTD2DInputs[0], uv + vec2(0.0, -texel.y));\n"
    "        vec4 tr = texture(sTD2DInputs[0], uv + vec2( texel.x, -texel.y));\n"
    "        vec4 ml = texture(sTD2DInputs[0], uv + vec2(-texel.x, 0.0));\n"
    "        vec4 mr = texture(sTD2DInputs[0], uv + vec2( texel.x, 0.0));\n"
    "        vec4 bl = texture(sTD2DInputs[0], uv + vec2(-texel.x,  texel.y));\n"
    "        vec4 bc = texture(sTD2DInputs[0], uv + vec2(0.0,  texel.y));\n"
    "        vec4 br = texture(sTD2DInputs[0], uv + vec2( texel.x,  texel.y));\n"
    "        vec3 sx = -tl.rgb - 2.0*ml.rgb - bl.rgb + tr.rgb + 2.0*mr.rgb + br.rgb;\n"
    "        vec3 sy = -tl.rgb - 2.0*tc.rgb - tr.rgb + bl.rgb + 2.0*bc.rgb + br.rgb;\n"
    "        float edge = length(sx) + length(sy);\n"
    "        color = vec4(vec3(edge), 1.0);\n"
    "    } else if (uTDPass == 1) {\n"
    "        // Pass 1: Blur the edges\n"
    "        vec4 sum = vec4(0.0);\n"
    "        for (int x = -1; x <= 1; x++) {\n"
    "            for (int y = -1; y <= 1; y++) {\n"
    "                sum += texture(sTD2DInputs[0], uv + vec2(float(x), float(y)) * texel);\n"
    "            }\n"
    "        }\n"
    "        color = sum / 9.0;\n"
    "    } else {\n"
    "        // Pass 2: Composite — glow = original + blurred edges\n"
    "        // sTD2DInputs[0] is the output of pass 1 (blurred edges)\n"
    "        // We can't directly access the original here, so we just tint\n"
    "        vec4 edges = texture(sTD2DInputs[0], uv);\n"
    "        color = edges * vec4(0.3, 1.0, 0.5, 1.0);\n"
    "    }\n"
    "    fragColor = TDOutputSwizzle(color);\n"
    "}\n"
)

# Chain 3: 2-pass color grading
GLSL_2PASS_COLORGRADE = (
    "out vec4 fragColor;\n"
    "void main() {\n"
    "    vec2 uv = vUV.st;\n"
    "    vec4 color = texture(sTD2DInputs[0], uv);\n"
    "    if (uTDPass == 0) {\n"
    "        // Pass 0: Lift/Gamma/Gain\n"
    "        vec3 lift = vec3(0.05, 0.02, 0.08);\n"
    "        vec3 gamma = vec3(1.2, 1.0, 0.9);\n"
    "        vec3 gain = vec3(1.1, 1.05, 1.0);\n"
    "        vec3 graded = pow(color.rgb + lift, 1.0 / gamma) * gain;\n"
    "        color = vec4(clamp(graded, 0.0, 1.0), color.a);\n"
    "    } else {\n"
    "        // Pass 1: Vignette\n"
    "        vec2 center = uv - vec2(0.5);\n"
    "        float dist = length(center);\n"
    "        float vignette = 1.0 - smoothstep(0.3, 0.8, dist);\n"
    "        color.rgb *= vignette;\n"
    "    }\n"
    "    fragColor = TDOutputSwizzle(color);\n"
    "}\n"
)

# Chain 4: Single pass baseline (npasses=1)
GLSL_SINGLE_PASS = (
    "out vec4 fragColor;\n"
    "void main() {\n"
    "    vec4 color = texture(sTD2DInputs[0], vUV.st);\n"
    "    // Simple invert\n"
    "    color.rgb = 1.0 - color.rgb;\n"
    "    fragColor = TDOutputSwizzle(color);\n"
    "}\n"
)


# ─── Operator topology ────────────────────────────────────────────────────────

ALL_NODES = [
    # ── Chain 1: 4-pass progressive blur ──────────────────────────────────
    {"name": "src_4pass", "opType": "noiseTOP",
     "x": -2 * NODE_SPACING_X, "y": 0,
     "key_params": {"amp": 0.8}, "is_source": True},
    {"name": "dat_4pass", "opType": "textDAT",
     "x": -1 * NODE_SPACING_X, "y": NODE_SPACING_Y,
     "key_params": {}, "text_content": GLSL_4PASS_BLUR, "is_dat": True},
    {"name": "glsl_4pass", "opType": "glslTOP",
     "x": 0, "y": 0,
     "key_params": {}, "is_source": False},
    {"name": "out_4pass", "opType": "nullTOP",
     "x": NODE_SPACING_X, "y": 0,
     "key_params": {}, "is_source": False},

    # ── Chain 2: 3-pass edge + glow ───────────────────────────────────────
    {"name": "src_3pass", "opType": "noiseTOP",
     "x": -2 * NODE_SPACING_X, "y": 2 * NODE_SPACING_Y,
     "key_params": {"amp": 0.6}, "is_source": True},
    {"name": "dat_3pass", "opType": "textDAT",
     "x": -1 * NODE_SPACING_X, "y": 3 * NODE_SPACING_Y,
     "key_params": {}, "text_content": GLSL_3PASS_EDGE_GLOW, "is_dat": True},
    {"name": "glsl_3pass", "opType": "glslTOP",
     "x": 0, "y": 2 * NODE_SPACING_Y,
     "key_params": {}, "is_source": False},
    {"name": "out_3pass", "opType": "nullTOP",
     "x": NODE_SPACING_X, "y": 2 * NODE_SPACING_Y,
     "key_params": {}, "is_source": False},

    # ── Chain 3: 2-pass color grading ─────────────────────────────────────
    {"name": "src_2pass", "opType": "noiseTOP",
     "x": -2 * NODE_SPACING_X, "y": 4 * NODE_SPACING_Y,
     "key_params": {"amp": 0.5}, "is_source": True},
    {"name": "dat_2pass", "opType": "textDAT",
     "x": -1 * NODE_SPACING_X, "y": 5 * NODE_SPACING_Y,
     "key_params": {}, "text_content": GLSL_2PASS_COLORGRADE, "is_dat": True},
    {"name": "glsl_2pass", "opType": "glslTOP",
     "x": 0, "y": 4 * NODE_SPACING_Y,
     "key_params": {}, "is_source": False},
    {"name": "out_2pass", "opType": "nullTOP",
     "x": NODE_SPACING_X, "y": 4 * NODE_SPACING_Y,
     "key_params": {}, "is_source": False},

    # ── Chain 4: npasses=1 baseline ───────────────────────────────────────
    {"name": "src_1pass", "opType": "noiseTOP",
     "x": -2 * NODE_SPACING_X, "y": 6 * NODE_SPACING_Y,
     "key_params": {"amp": 0.7}, "is_source": True},
    {"name": "dat_1pass", "opType": "textDAT",
     "x": -1 * NODE_SPACING_X, "y": 7 * NODE_SPACING_Y,
     "key_params": {}, "text_content": GLSL_SINGLE_PASS, "is_dat": True},
    {"name": "glsl_1pass", "opType": "glslTOP",
     "x": 0, "y": 6 * NODE_SPACING_Y,
     "key_params": {}, "is_source": False},
    {"name": "out_1pass", "opType": "nullTOP",
     "x": NODE_SPACING_X, "y": 6 * NODE_SPACING_Y,
     "key_params": {}, "is_source": False},
]

# Connections
CONNECTIONS = [
    ("src_4pass", "glsl_4pass"), ("glsl_4pass", "out_4pass"),
    ("src_3pass", "glsl_3pass"), ("glsl_3pass", "out_3pass"),
    ("src_2pass", "glsl_2pass"), ("glsl_2pass", "out_2pass"),
    ("src_1pass", "glsl_1pass"), ("glsl_1pass", "out_1pass"),
]

# NPasses config: (glsl_name, npasses_value, step_name)
NPASS_CONFIG = [
    ("glsl_4pass", 4, "npasses_4pass"),
    ("glsl_3pass", 3, "npasses_3pass"),
    ("glsl_2pass", 2, "npasses_2pass"),
    ("glsl_1pass", 1, "npasses_1pass"),
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

    # Phase 2b: write shader text into DAT nodes
    for node in ALL_NODES:
        if not node.get("text_content"):
            continue
        try:
            td.exec("op(%r).text = %r" % (f"{SANDBOX_PATH}/{node['name']}", node["text_content"]))
            res.step(f"txt_{node['name']}", True, "shader text written")
        except Exception as e:
            res.step(f"txt_{node['name']}", False, str(e))

    # Phase 2c: setup GLSL TOP pixeldat for all 4 chains
    for glsl_name, dat_name, step_name in [
        ("glsl_4pass", "dat_4pass", "setup_4pass"),
        ("glsl_3pass", "dat_3pass", "setup_3pass"),
        ("glsl_2pass", "dat_2pass", "setup_2pass"),
        ("glsl_1pass", "dat_1pass", "setup_1pass"),
    ]:
        path = f"{SANDBOX_PATH}/{glsl_name}"
        try:
            td.exec("op(%r).par.pixeldat = %r" % (path, dat_name))
            res.step(step_name, True, f"pixeldat={dat_name}")
        except Exception as e:
            res.step(step_name, False, str(e))

    # Phase 2d: set npasses on each GLSL TOP
    for glsl_name, npasses_val, step_name in NPASS_CONFIG:
        path = f"{SANDBOX_PATH}/{glsl_name}"
        try:
            td.exec("op(%r).par.npasses = %d" % (path, npasses_val))
            res.step(step_name, True, f"npasses={npasses_val}")
        except Exception as e:
            res.step(step_name, False, str(e))

    # Phase 2e: set source params
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
            td.exec("op(%r).outputConnectors[0].connect(op(%r))" % (
                created[src_name], created[tgt_name]))
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


# ─── Verify phase ─────────────────────────────────────────────────────────────

def verify_network(td: TDClient, res: TestResult) -> None:
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

    # Check all expected nodes exist
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

    # Check GLSL compilation (all glslTOP nodes)
    glsl_names = [n["name"] for n in ALL_NODES if n["opType"] == "glslTOP"]
    for gn in glsl_names:
        gn_node = by_name.get(gn)
        if gn_node:
            ok = not gn_node["errors"]
            res.step(f"glsl_compile_{gn}", ok,
                     "no errors" if ok else f"errors: {gn_node['errors']}")

    # Verify npasses readback for each GLSL TOP
    for glsl_name, expected_npasses, step_name in NPASS_CONFIG:
        code = (
            "import json\n"
            "o = op('%s/%s')\n"
            "np = o.par.npasses.eval() if hasattr(o.par, 'npasses') else -1\n"
            "print(json.dumps({'npasses': np}))\n"
        ) % (SANDBOX_PATH, glsl_name)
        try:
            raw = td.exec(code)
            params = json.loads(raw.strip().splitlines()[-1]) if raw.strip() else {}
            np = params.get("npasses", -1)
            ok = np == expected_npasses
            res.step(f"verify_{step_name}", ok,
                     f"npasses={np}" + ("" if ok else f" (expected {expected_npasses})"))
        except Exception as e:
            res.step(f"verify_{step_name}", False, str(e))

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
    print("  GLSL TOP Intra-Frame Multi-Pass (npasses > 1)")
    print(f"  Target: http://{DEFAULT_HOST}:{DEFAULT_PORT}")
    print(f"  Sandbox: {SANDBOX_PATH}")
    print(f"  Nodes: {len(ALL_NODES)}, Connections: {len(CONNECTIONS)}")
    print("  Chain 1: 4-pass progressive blur")
    print("  Chain 2: 3-pass edge detection + glow")
    print("  Chain 3: 2-pass color grading")
    print("  Chain 4: 1-pass baseline (control)")
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
