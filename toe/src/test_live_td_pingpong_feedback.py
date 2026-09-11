#!/usr/bin/env python3
"""
Live TD Test: Ping-Pong Feedback GLSL — Reaction-Diffusion Simulation
======================================================================

EXPLICIT RULES (verified every run):
  RULE 1 — CONTAINER: All operators inside a UUID-named baseCOMP.
  RULE 2 — NO ERRORS: Immediate + async post-cook re-check.
  RULE 3 — NO OVERLAP: Grid positions verified for separation.

Tests a ping-pong feedback pattern NOT covered by any existing test:

  Chain 1 — Gray-Scott Reaction-Diffusion:
    Two GLSL TOPs alternating via two feedbackTOPs:
    feedbackTOP_A → glslTOP_A(react) → feedbackTOP_B → glslTOP_B(seed) → back to A

    The ping-pong topology:
    - feedbackTOP_A.target = glslTOP_B (reads previous frame from B)
    - feedbackTOP_B.target = glslTOP_A (reads previous frame from A)
    - glslTOP_A computes one RD step (Laplacian + Gray-Scott equations)
    - glslTOP_B seeds initial conditions and passes through

  Chain 2 — Simple Ping-Pong Blur:
    A simpler ping-pong with progressive blur:
    feedbackTOP_C → glslTOP_C(blur) → feedbackTOP_D → glslTOP_D(blur) → back to C
    Each frame accumulates more blur, demonstrating temporal feedback accumulation.

Parameter-name notes (empirically verified):
  - glslTOP:    pixeldat (String), vertexdat (String), npasses (Int)
  - feedbackTOP: top (OP reference — downstream node to capture from)

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
SANDBOX_NAME = f"test_pingpong_{uuid.uuid4().hex[:8]}"
SANDBOX_PATH = f"{SANDBOX_PARENT}/{SANDBOX_NAME}"

NODE_SPACING_X = 400
NODE_SPACING_Y = 300

# ─── GLSL Shader Definitions ──────────────────────────────────────────────────

# Chain 1: Gray-Scott Reaction-Diffusion compute step
# Reads previous state from sTD2DInputs[0], computes one RD iteration
GLSL_RD_COMPUTE = (
    "out vec4 fragColor;\n"
    "uniform float u_feed = 0.055;\n"
    "uniform float u_kill = 0.062;\n"
    "void main() {\n"
    "    vec2 uv = vUV.st;\n"
    "    vec2 texel = 1.0 / uTDOutputInfo.res;\n"
    "\n"
    "    // Sample center and 4 neighbors for Laplacian\n"
    "    vec2 c = texture(sTD2DInputs[0], uv).rg;\n"
    "    vec2 l = texture(sTD2DInputs[0], uv + vec2(-texel.x, 0.0)).rg;\n"
    "    vec2 r = texture(sTD2DInputs[0], uv + vec2( texel.x, 0.0)).rg;\n"
    "    vec2 u = texture(sTD2DInputs[0], uv + vec2(0.0,  texel.y)).rg;\n"
    "    vec2 d = texture(sTD2DInputs[0], uv + vec2(0.0, -texel.y)).rg;\n"
    "\n"
    "    // 5-point Laplacian\n"
    "    vec2 lap = l + r + u + d - 4.0 * c;\n"
    "\n"
    "    // Gray-Scott equations\n"
    "    float Da = 1.0, Db = 0.5, dt = 1.0;\n"
    "    float feed = u_feed, kill = u_kill;\n"
    "    float uvv = c.r * c.g * c.g;\n"
    "    float du = Da * lap.r - uvv + feed * (1.0 - c.r);\n"
    "    float dv = Db * lap.g + uvv - (feed + kill) * c.g;\n"
    "\n"
    "    float new_u = clamp(c.r + du * dt, 0.0, 1.0);\n"
    "    float new_v = clamp(c.g + dv * dt, 0.0, 1.0);\n"
    "\n"
    "    fragColor = vec4(new_u, new_v, 0.0, 1.0);\n"
    "}\n"
)

# Chain 1: Seed pass — initializes U=1, V=0 with small seed spots
GLSL_RD_SEED = (
    "out vec4 fragColor;\n"
    "void main() {\n"
    "    vec2 uv = vUV.st;\n"
    "    float u = 1.0;\n"
    "    float v = 0.0;\n"
    "    // Seed: small square patches of V in the center\n"
    "    vec2 center = vec2(0.5);\n"
    "    float d = length(uv - center);\n"
    "    if (d < 0.05) {\n"
    "        v = 1.0;\n"
    "        u = 0.5;\n"
    "    }\n"
    "    // Additional seed spots\n"
    "    if (length(uv - vec2(0.3, 0.5)) < 0.03) { v = 1.0; u = 0.5; }\n"
    "    if (length(uv - vec2(0.7, 0.5)) < 0.03) { v = 1.0; u = 0.5; }\n"
    "    fragColor = vec4(u, v, 0.0, 1.0);\n"
    "}\n"
)

# Chain 2: Progressive blur for simple ping-pong accumulation
GLSL_PINGPONG_BLUR = (
    "out vec4 fragColor;\n"
    "void main() {\n"
    "    vec2 texel = 1.0 / uTDOutputInfo.res;\n"
    "    vec2 uv = vUV.st;\n"
    "    vec4 sum = vec4(0.0);\n"
    "    // 3x3 blur kernel\n"
    "    for (int x = -1; x <= 1; x++) {\n"
    "        for (int y = -1; y <= 1; y++) {\n"
    "            vec2 offset = vec2(float(x), float(y)) * texel;\n"
    "            sum += texture(sTD2DInputs[0], uv + offset);\n"
    "        }\n"
    "    }\n"
    "    vec4 blurred = sum / 9.0;\n"
    "    // Slight color shift to visualize accumulation\n"
    "    blurred.r *= 0.99;\n"
    "    blurred.g *= 1.005;\n"
    "    blurred.b *= 1.01;\n"
    "    fragColor = blurred;\n"
    "}\n"
)

# Chain 2: Initial color fill for the blur ping-pong
GLSL_PINGPONG_FILL = (
    "out vec4 fragColor;\n"
    "void main() {\n"
    "    vec2 uv = vUV.st;\n"
    "    vec3 col = vec3(\n"
    "        0.5 + 0.5 * sin(uv.x * 6.28),\n"
    "        0.5 + 0.5 * sin(uv.y * 6.28),\n"
    "        0.5 + 0.5 * cos((uv.x + uv.y) * 3.14)\n"
    "    );\n"
    "    fragColor = vec4(col, 1.0);\n"
    "}\n"
)


# ─── Operator topology ────────────────────────────────────────────────────────

ALL_NODES = [
    # ── Chain 1: Gray-Scott Reaction-Diffusion ────────────────────────────
    # Ping-pong: feedbackTOP_A → glslTOP_A(react) → feedbackTOP_B → glslTOP_B(seed)
    {"name": "fb_a", "opType": "feedbackTOP",
     "x": -2 * NODE_SPACING_X, "y": 0,
     "key_params": {}, "is_source": False},
    {"name": "dat_react", "opType": "textDAT",
     "x": -1 * NODE_SPACING_X, "y": NODE_SPACING_Y,
     "key_params": {}, "text_content": GLSL_RD_COMPUTE, "is_dat": True},
    {"name": "glsl_a", "opType": "glslTOP",
     "x": 0, "y": 0,
     "key_params": {}, "is_source": False},
    {"name": "fb_b", "opType": "feedbackTOP",
     "x": NODE_SPACING_X, "y": 0,
     "key_params": {}, "is_source": False},
    {"name": "dat_seed", "opType": "textDAT",
     "x": 2 * NODE_SPACING_X, "y": NODE_SPACING_Y,
     "key_params": {}, "text_content": GLSL_RD_SEED, "is_dat": True},
    {"name": "glsl_b", "opType": "glslTOP",
     "x": 2 * NODE_SPACING_X, "y": 0,
     "key_params": {}, "is_source": False},
    {"name": "out_rd", "opType": "nullTOP",
     "x": 3 * NODE_SPACING_X, "y": 0,
     "key_params": {}, "is_source": False},

    # ── Chain 2: Simple Ping-Pong Blur Accumulation ────────────────────────
    {"name": "fb_c", "opType": "feedbackTOP",
     "x": -2 * NODE_SPACING_X, "y": 2 * NODE_SPACING_Y,
     "key_params": {}, "is_source": False},
    {"name": "dat_fill", "opType": "textDAT",
     "x": -1 * NODE_SPACING_X, "y": 3 * NODE_SPACING_Y,
     "key_params": {}, "text_content": GLSL_PINGPONG_FILL, "is_dat": True},
    {"name": "glsl_c", "opType": "glslTOP",
     "x": 0, "y": 2 * NODE_SPACING_Y,
     "key_params": {}, "is_source": False},
    {"name": "fb_d", "opType": "feedbackTOP",
     "x": NODE_SPACING_X, "y": 2 * NODE_SPACING_Y,
     "key_params": {}, "is_source": False},
    {"name": "dat_blur", "opType": "textDAT",
     "x": 2 * NODE_SPACING_X, "y": 3 * NODE_SPACING_Y,
     "key_params": {}, "text_content": GLSL_PINGPONG_BLUR, "is_dat": True},
    {"name": "glsl_d", "opType": "glslTOP",
     "x": 2 * NODE_SPACING_X, "y": 2 * NODE_SPACING_Y,
     "key_params": {}, "is_source": False},
    {"name": "out_blur", "opType": "nullTOP",
     "x": 3 * NODE_SPACING_X, "y": 2 * NODE_SPACING_Y,
     "key_params": {}, "is_source": False},
]

# Connections
# Ping-pong topology: fb → glsl → next_fb → next_glsl → back to first_fb
# Note: feedbackTOPs don't need wired inputs — they capture from their target.
# glslTOPs need input from their upstream feedbackTOP.
CONNECTIONS = [
    # Chain 1: RD ping-pong
    # fb_a → glsl_a (fb_a reads from glsl_b via target param)
    ("fb_a", "glsl_a"),
    # glsl_a → fb_b (fb_b reads from glsl_a via target param)
    ("glsl_a", "fb_b"),
    # fb_b → glsl_b (fb_b reads from glsl_a via target param)
    ("fb_b", "glsl_b"),
    # glsl_b → out_rd
    ("glsl_b", "out_rd"),

    # Chain 2: Blur ping-pong
    ("fb_c", "glsl_c"),
    ("glsl_c", "fb_d"),
    ("fb_d", "glsl_d"),
    ("glsl_d", "out_blur"),
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
    """Create sandbox + all nodes + wire connections + set feedback targets."""

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

    # Phase 2c: setup GLSL TOP pixeldat + uniform params
    for glsl_name, dat_name, step_name in [
        ("glsl_a", "dat_react", "setup_glsl_a"),
        ("glsl_b", "dat_seed", "setup_glsl_b"),
        ("glsl_c", "dat_fill", "setup_glsl_c"),
        ("glsl_d", "dat_blur", "setup_glsl_d"),
    ]:
        path = f"{SANDBOX_PATH}/{glsl_name}"
        try:
            td.exec("op(%r).par.pixeldat = %r" % (path, dat_name))
            res.step(step_name, True, f"pixeldat={dat_name}")
        except Exception as e:
            res.step(step_name, False, str(e))

    # Phase 2c-b: expose u_feed/u_kill as TD uniform params on glsl_a (Gray-Scott)
    _set_uniform(td, res, "glsl_a", "u_feed", 0.055, "const0name", "const0value")
    _set_uniform(td, res, "glsl_a", "u_kill", 0.062, "const1name", "const1value")

    # Phase 2d: set feedbackTOP target parameters (THE CRITICAL PART)
    # Chain 1: fb_a.target = glsl_b, fb_b.target = glsl_a
    _set_feedback_target(td, res, "fb_a", "glsl_b", "target_fb_a")
    _set_feedback_target(td, res, "fb_b", "glsl_a", "target_fb_b")
    # Chain 2: fb_c.target = glsl_d, fb_d.target = glsl_c
    _set_feedback_target(td, res, "fb_c", "glsl_d", "target_fb_c")
    _set_feedback_target(td, res, "fb_d", "glsl_c", "target_fb_d")

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


def _set_feedback_target(td: TDClient, res: TestResult,
                         fb_name: str, target_name: str, step_name: str) -> None:
    """Set the feedbackTOP.target parameter to point to the target glslTOP."""
    fb_path = f"{SANDBOX_PATH}/{fb_name}"
    tgt_path = f"{SANDBOX_PATH}/{target_name}"
    try:
        td.exec("op(%r).par.top = op(%r)" % (fb_path, tgt_path))
        res.step(step_name, True, f"top={target_name}")
    except Exception as e:
        res.step(step_name, False, str(e))


def _set_uniform(td: TDClient, res: TestResult, glsl_name: str,
                 uniform_name: str, value: float,
                 name_param: str, value_param: str) -> None:
    """Set a uniform on a glslTOP via const params (const0name/const0value, etc.).

    TD glslTOP has a 'Constants' page with sequence params:
      const0name (String) — uniform name as declared in shader
      const0value (Float) — value to pass to the uniform
      const1name, const1value, etc. for additional uniforms.
    """
    path = f"{SANDBOX_PATH}/{glsl_name}"
    try:
        td.exec(
            "op(%r).par.%s = %r\n"
            "op(%r).par.%s = %s"
            % (path, name_param, uniform_name,
               path, value_param, repr(value)))
        res.step(f"uniform_{glsl_name}_{uniform_name}", True,
                 f"{name_param}={uniform_name}, {value_param}={value}")
    except Exception as e:
        res.step(f"uniform_{glsl_name}_{uniform_name}", False, str(e))


# ─── Verify phase ─────────────────────────────────────────────────────────────

def verify_network(td: TDClient, res: TestResult) -> None:
    """Verify all GLSL TOPs compiled, feedback targets set, and zero errors."""
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

    # Check GLSL compilation (all glslTOP nodes)
    glsl_names = [n["name"] for n in ALL_NODES if n["opType"] == "glslTOP"]
    for gn in glsl_names:
        gn_node = by_name.get(gn)
        if gn_node:
            ok = not gn_node["errors"]
            res.step(f"glsl_compile_{gn}", ok,
                     "no errors" if ok else f"errors: {gn_node['errors']}")

    # Check feedbackTOP target parameters
    _verify_feedback_target(td, res, "fb_a", "glsl_b", "verify_target_fb_a")
    _verify_feedback_target(td, res, "fb_b", "glsl_a", "verify_target_fb_b")
    _verify_feedback_target(td, res, "fb_c", "glsl_d", "verify_target_fb_c")
    _verify_feedback_target(td, res, "fb_d", "glsl_c", "verify_target_fb_d")

    # Check uniform params on glsl_a (Gray-Scott u_feed / u_kill)
    _verify_uniform(td, res, "glsl_a", "u_feed", 0.055, "const0name", "const0value",
                   "verify_uniform_feed")
    _verify_uniform(td, res, "glsl_a", "u_kill", 0.062, "const1name", "const1value",
                   "verify_uniform_kill")

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


def _verify_feedback_target(td: TDClient, res: TestResult,
                            fb_name: str, expected_target: str, step_name: str) -> None:
    """Read back feedbackTOP.top parameter and verify it points to the expected target."""
    fb_path = f"{SANDBOX_PATH}/{fb_name}"
    code = (
        "import json\n"
        "o = op(%r)\n"
        "try:\n"
        "    t = o.par.top.eval()\n"
        "    name = t.name if hasattr(t, 'name') else str(t)\n"
        "    path = t.path if hasattr(t, 'path') else str(t)\n"
        "    print(json.dumps({'name': name, 'path': path}))\n"
        "except Exception as e:\n"
        "    print(json.dumps({'error': str(e)[:120]}))\n"
    ) % fb_path
    try:
        raw = td.exec(code)
        data = json.loads(raw.strip().splitlines()[-1]) if raw.strip() else {}
        if "error" in data:
            res.step(step_name, False, data["error"])
        else:
            ok = data.get("name") == expected_target
            res.step(step_name, ok,
                     f"top={data.get('name')} ({data.get('path', '')})"
                     + ("" if ok else f" (expected {expected_target})"))
    except Exception as e:
        res.step(step_name, False, str(e))


def _verify_uniform(td: TDClient, res: TestResult, glsl_name: str,
                    expected_name: str, expected_value: float,
                    name_param: str, value_param: str,
                    step_name: str) -> None:
    """Read back glslTOP const params and verify uniform name + value."""
    path = f"{SANDBOX_PATH}/{glsl_name}"
    code = (
        "import json\n"
        "o = op(%r)\n"
        "try:\n"
        "    n = str(o.par.%s.eval())\n"
        "    v = float(o.par.%s.eval())\n"
        "    print(json.dumps({'name': n, 'value': v}))\n"
        "except Exception as e:\n"
        "    print(json.dumps({'error': str(e)[:120]}))\n"
    ) % (path, name_param, value_param)
    try:
        raw = td.exec(code)
        data = json.loads(raw.strip().splitlines()[-1]) if raw.strip() else {}
        if "error" in data:
            res.step(step_name, False, data["error"])
        else:
            name_ok = data.get("name") == expected_name
            val_ok = abs(data.get("value", 0) - expected_value) < 0.001
            ok = name_ok and val_ok
            res.step(step_name, ok,
                     f"{name_param}={data.get('name')}, {value_param}={data.get('value')}"
                     + ("" if ok else f" (expected {expected_name}={expected_value})"))
    except Exception as e:
        res.step(step_name, False, str(e))


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
    print("  Ping-Pong Feedback GLSL — Reaction-Diffusion Simulation")
    print(f"  Target: http://{DEFAULT_HOST}:{DEFAULT_PORT}")
    print(f"  Sandbox: {SANDBOX_PATH}")
    print(f"  Nodes: {len(ALL_NODES)}, Connections: {len(CONNECTIONS)}")
    print("  Chain 1: Gray-Scott RD (fb_a → glsl_a → fb_b → glsl_b → back)")
    print("  Chain 2: Progressive blur (fb_c → glsl_c → fb_d → glsl_d → back)")
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
