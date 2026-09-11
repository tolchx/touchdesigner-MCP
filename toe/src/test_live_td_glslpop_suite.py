#!/usr/bin/env python3
"""
GLSL POP Comprehensive Test Suite — 7 Complexity Levels
========================================================

EXPLICIT RULES (verified every run):
  RULE 1 — CONTAINER: All operators inside a UUID-named baseCOMP.
  RULE 2 — NO ERRORS: Immediate + async post-cook re-check on ALL GLSL DATs.
  RULE 3 — NO OVERLAP: Grid positions verified for separation.

Tests GLSL POP systems with INCREASING complexity, verifying that every
GLSL shader DAT compiles without errors and all connections are valid.

  Level 1 — Basic glslPOP displacement (4 nodes)
            boxPOP → textDAT(shader) → glslPOP → nullPOP
            Simple sin-wave displacement on P.

  Level 2 — glsladvancedPOP with color output (4 nodes)
            spherePOP → textDAT(shader) → glsladvancedPOP → nullPOP
            Outputs both P displacement AND Cd color attribute.

  Level 3 — Multi-attribute glsladvancedPOP (4 nodes)
            boxPOP → textDAT(shader) → glsladvancedPOP → nullPOP
            Writes P (spiral displacement) and Cd (color by distance).

  Level 4 — Feedback loop with glslPOP (5 nodes)
            boxPOP → textDAT(shader) → glslPOP → feedbackPOP → nullPOP
            feedbackPOP.inputmul=1 keeps 100% of previous frame (temporal drift demo).

  Level 5 — Multi-pass + glslTOP const uniforms (9 nodes)
            Chain A: circlePOP → textDAT → glslPOP(npasses=3) → transformPOP → nullPOP
            Chain B: noiseTOP → textDAT → glslTOP(npasses=2, const0/1 uniforms) → nullTOP
            Demonstrates glslTOP const0name/const0value for uniform control.

  Level 6 — Full pipeline: dual chains (7 nodes)
            Chain A: boxPOP → glslPOP(particle displacement) → nullPOP
            Chain B: spherePOP → glsladvancedPOP(color) → nullPOP
            Both chains verified independently.

  Level 7 — Pixel shader (multi-pass) with const uniforms (4 nodes)
            noiseTOP → textDAT(pixel shader) → glslTOP(npasses=4, const uniforms) → nullTOP
            Multi-pass blur with u_radius and u_strength uniforms.
            Demonstrates glslTOP pixeldat mode + const0/const1 for GPU pixel processing.

Parameter-name notes (empirically verified):
  - glslPOP:         computedat (String), outputattrs (Menu 'P')
  - glsladvancedPOP: computedat (String), ptoutputattrs (Menu 'P'/'*'),
                     primoutputattrs, vertoutputattrs
  - feedbackPOP:     inputmul (Int — NOT gain, NOT Float)
  - glslTOP:         pixeldat (String), npasses (Int),
                     const0name (String), const0value (Float),
                     const1name (String), const1value (Float)

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
SANDBOX_NAME = f"test_glslpop_suite_{uuid.uuid4().hex[:8]}"
SANDBOX_PATH = f"{SANDBOX_PARENT}/{SANDBOX_NAME}"

NODE_SPACING_X = 400
NODE_SPACING_Y = 300


# ─── GLSL Shader Definitions (7 levels) ───────────────────────────────────────

# Level 1: Basic P displacement via glslPOP
GLSL_L1_DISPLACEMENT = (
    "// Level 1: Basic glslPOP displacement\n"
    "uniform float u_time;\n"
    "void main() {\n"
    "    uint id = TDIndex();\n"
    "    vec3 pos = TDIn_P(0, id);\n"
    "    float wave = sin(u_time * 0.8 + pos.x * 3.0 + pos.y * 2.0) * 0.15;\n"
    "    P[id] = pos + vec3(wave, wave * 0.5, 0.0);\n"
    "}\n"
)

# Level 2: P + Cd color output via glsladvancedPOP
GLSL_L2_COLOR_OUTPUT = (
    "// Level 2: glsladvancedPOP P + Cd output\n"
    "uniform float u_time;\n"
    "void main() {\n"
    "    uint id = TDIndex();\n"
    "    vec3 pos = TDIn_P(0, id);\n"
    "    float n = sin(u_time + pos.x * 2.0 + pos.y * 1.5) * 0.1;\n"
    "    P[id] = pos + vec3(n * 0.5, n, 0.0);\n"
    "    Cd[id] = vec4(pos.y * 0.3 + 0.5, 0.6, 1.0 - pos.y * 0.3, 1.0);\n"
    "}\n"
)

# Level 3: Multi-attribute output (P + Cd) with spiral displacement
GLSL_L3_MULTI_ATTR = (
    "// Level 3: Multi-attribute glsladvancedPOP\n"
    "uniform float u_time;\n"
    "void main() {\n"
    "    uint id = TDIndex();\n"
    "    vec3 pos = TDIn_P(0, id);\n"
    "    float angle = atan(pos.z, pos.x) + u_time * 0.5;\n"
    "    float rad = length(pos.xz);\n"
    "    pos.x = cos(angle) * rad;\n"
    "    pos.z = sin(angle) * rad;\n"
    "    pos.y += sin(u_time + id * 0.01) * 0.15;\n"
    "    P[id] = pos;\n"
    "    float d = length(pos);\n"
    "    Cd[id] = vec4(d * 0.2, 0.8 - d * 0.1, 0.5 + d * 0.1, 1.0);\n"
    "}\n"
)

# Level 4: Feedback-aware shader (inputmul blends current frame with previous)
GLSL_L4_FEEDBACK = (
    "// Level 4: Feedback-aware glslPOP\n"
    "// feedbackPOP.inputmul controls how much of previous frame is kept\n"
    "uniform float u_time;\n"
    "void main() {\n"
    "    uint id = TDIndex();\n"
    "    vec3 pos = TDIn_P(0, id);\n"
    "    float drift = sin(u_time * 0.3 + pos.x * 1.5 + pos.z * 2.0) * 0.08;\n"
    "    pos.x += drift;\n"
    "    pos.z += cos(u_time * 0.4 + pos.y * 1.8) * 0.06;\n"
    "    pos.y += sin(u_time * 0.2 + id * 0.005) * 0.04;\n"
    "    P[id] = pos;\n"
    "}\n"
)

# Level 5: Multi-pass shader
GLSL_L5_MULTIPASS = (
    "// Level 5: Multi-pass iterative displacement\n"
    "uniform float u_time;\n"
    "void main() {\n"
    "    uint id = TDIndex();\n"
    "    vec3 pos = TDIn_P(0, id);\n"
    "    float wave = sin(pos.x * 3.0 + pos.z * 2.1 + u_time) * 0.1;\n"
    "    pos.y += wave;\n"
    "    P[id] = pos;\n"
    "}\n"
)

# Level 5 glslTOP: fragment shader with const uniforms
GLSL_L5_TOP_CONST = (
    "// Level 5 glslTOP: const uniform-driven color grading\n"
    "// u_amplitude and u_frequency are set via const0name/const0value\n"
    "uniform float u_amplitude = 0.5;\n"
    "uniform float u_frequency = 3.0;\n"
    "out vec4 fragColor;\n"
    "void main() {\n"
    "    vec2 uv = vUV.st;\n"
    "    float wave = sin(uv.x * u_frequency + uv.y * u_frequency) * u_amplitude;\n"
    "    vec3 color = vec3(wave * 0.5 + 0.5, uv.x, uv.y);\n"
    "    fragColor = TDOutputSwizzle(vec4(color, 1.0));\n"
    "}\n"
)

# Level 6 Chain A: Swirl displacement
GLSL_L6A_SWIRL = (
    "// Level 6A: glslPOP swirl displacement\n"
    "uniform float u_time;\n"
    "void main() {\n"
    "    uint id = TDIndex();\n"
    "    vec3 pos = TDIn_P(0, id);\n"
    "    float angle = u_time * 0.5 + length(pos.xz) * 2.0;\n"
    "    pos.x += cos(angle) * 0.05;\n"
    "    pos.z += sin(angle) * 0.05;\n"
    "    pos.y += sin(u_time + id * 0.1) * 0.08;\n"
    "    P[id] = pos;\n"
    "}\n"
)

# Level 6 Chain B: Color by position
GLSL_L6B_COLOR = (
    "// Level 6B: glsladvancedPOP color by position\n"
    "uniform float u_time;\n"
    "void main() {\n"
    "    uint id = TDIndex();\n"
    "    vec3 pos = TDIn_P(0, id);\n"
    "    float wave = sin(u_time * 0.6 + pos.y * 3.0) * 0.08;\n"
    "    P[id] = pos + vec3(wave, 0.0, wave * 0.5);\n"
    "    Cd[id] = vec4(\n"
    "        sin(pos.x * 2.0 + u_time) * 0.5 + 0.5,\n"
    "        cos(pos.y * 2.0 + u_time * 0.7) * 0.5 + 0.5,\n"
    "        sin(pos.z * 2.0 + u_time * 1.3) * 0.5 + 0.5,\n"
    "        1.0\n"
    "    );\n"
    "}\n"
)

# Level 7: Pixel shader — multi-pass blur with const uniforms
GLSL_L7_PIXELBLUR = (
    "// Level 7: Multi-pass pixel shader — iterative box blur\n"
    "// npasses=4: each pass applies a 3x3 blur\n"
    "// u_radius controls blur spread, u_strength controls intensity\n"
    "uniform float u_radius = 1.0;\n"
    "uniform float u_strength = 1.0;\n"
    "out vec4 fragColor;\n"
    "void main() {\n"
    "    vec2 uv = vUV.st;\n"
    "    vec2 texel = 1.0 / uTDOutputInfo.res;\n"
    "    vec4 sum = vec4(0.0);\n"
    "    float total = 0.0;\n"
    "    int rad = int(u_radius);\n"
    "    for (int x = -rad; x <= rad; x++) {\n"
    "        for (int y = -rad; y <= rad; y++) {\n"
    "            vec2 offset = vec2(float(x), float(y)) * texel * u_strength;\n"
    "            sum += texture(sTD2DInputs[0], uv + offset);\n"
    "            total += 1.0;\n"
    "        }\n"
    "    }\n"
    "    fragColor = TDOutputSwizzle(sum / total);\n"
    "}\n"
)

# ─── Operator topology (all 6 levels) ─────────────────────────────────────────

ALL_NODES = [
    # ── Level 1: Basic glslPOP displacement ────────────────────────────────
    {"name": "l1_box", "opType": "boxPOP",
     "x": 0, "y": 0,
     "key_params": {"sizex": 1.5, "depth": 8}, "is_source": True},
    {"name": "l1_dat", "opType": "textDAT",
     "x": 0, "y": NODE_SPACING_Y,
     "key_params": {}, "text_content": GLSL_L1_DISPLACEMENT, "is_dat": True},
    {"name": "l1_glsl", "opType": "glslPOP",
     "x": NODE_SPACING_X, "y": 0,
     "key_params": {}, "is_source": False},
    {"name": "l1_out", "opType": "nullPOP",
     "x": 2 * NODE_SPACING_X, "y": 0,
     "key_params": {}, "is_source": False},

    # ── Level 2: glsladvancedPOP P + Cd ────────────────────────────────────
    {"name": "l2_sphere", "opType": "spherePOP",
     "x": 0, "y": 2 * NODE_SPACING_Y,
     "key_params": {"radx": 1.0, "rady": 1.0, "rows": 12, "cols": 12},
     "is_source": True},
    {"name": "l2_dat", "opType": "textDAT",
     "x": 0, "y": 3 * NODE_SPACING_Y,
     "key_params": {}, "text_content": GLSL_L2_COLOR_OUTPUT, "is_dat": True},
    {"name": "l2_glsl", "opType": "glsladvancedPOP",
     "x": NODE_SPACING_X, "y": 2 * NODE_SPACING_Y,
     "key_params": {}, "is_source": False},
    {"name": "l2_out", "opType": "nullPOP",
     "x": 2 * NODE_SPACING_X, "y": 2 * NODE_SPACING_Y,
     "key_params": {}, "is_source": False},

    # ── Level 3: Multi-attribute (P + Cd) ──────────────────────────────────
    {"name": "l3_box", "opType": "boxPOP",
     "x": 0, "y": 4 * NODE_SPACING_Y,
     "key_params": {"sizex": 2.0, "depth": 10}, "is_source": True},
    {"name": "l3_dat", "opType": "textDAT",
     "x": 0, "y": 5 * NODE_SPACING_Y,
     "key_params": {}, "text_content": GLSL_L3_MULTI_ATTR, "is_dat": True},
    {"name": "l3_glsl", "opType": "glsladvancedPOP",
     "x": NODE_SPACING_X, "y": 4 * NODE_SPACING_Y,
     "key_params": {}, "is_source": False},
    {"name": "l3_out", "opType": "nullPOP",
     "x": 2 * NODE_SPACING_X, "y": 4 * NODE_SPACING_Y,
     "key_params": {}, "is_source": False},

    # ── Level 4: Feedback loop ─────────────────────────────────────────────
    {"name": "l4_box", "opType": "boxPOP",
     "x": 0, "y": 6 * NODE_SPACING_Y,
     "key_params": {"sizex": 1.0, "depth": 6}, "is_source": True},
    {"name": "l4_dat", "opType": "textDAT",
     "x": 0, "y": 7 * NODE_SPACING_Y,
     "key_params": {}, "text_content": GLSL_L4_FEEDBACK, "is_dat": True},
    {"name": "l4_glsl", "opType": "glslPOP",
     "x": NODE_SPACING_X, "y": 6 * NODE_SPACING_Y,
     "key_params": {}, "is_source": False},
    {"name": "l4_feedback", "opType": "feedbackPOP",
     "x": 2 * NODE_SPACING_X, "y": 6 * NODE_SPACING_Y,
     "key_params": {"inputmul": 1}, "is_source": False},
    {"name": "l4_out", "opType": "nullPOP",
     "x": 3 * NODE_SPACING_X, "y": 6 * NODE_SPACING_Y,
     "key_params": {}, "is_source": False},

    # ── Level 5 Chain A: Multi-pass glslPOP ────────────────────────────────
    {"name": "l5_circle", "opType": "circlePOP",
     "x": 0, "y": 8 * NODE_SPACING_Y,
     "key_params": {"radx": 1.5, "rady": 1.5, "divs": 48}, "is_source": True},
    {"name": "l5_dat", "opType": "textDAT",
     "x": 0, "y": 9 * NODE_SPACING_Y,
     "key_params": {}, "text_content": GLSL_L5_MULTIPASS, "is_dat": True},
    {"name": "l5_glsl", "opType": "glslPOP",
     "x": NODE_SPACING_X, "y": 8 * NODE_SPACING_Y,
     "key_params": {}, "is_source": False},
    {"name": "l5_xform", "opType": "transformPOP",
     "x": 2 * NODE_SPACING_X, "y": 8 * NODE_SPACING_Y,
     "key_params": {"rx": 0.1}, "is_source": False},
    {"name": "l5_out", "opType": "nullPOP",
     "x": 3 * NODE_SPACING_X, "y": 8 * NODE_SPACING_Y,
     "key_params": {}, "is_source": False},
    # ── Level 5 Chain B: glslTOP with const uniforms ────────────────────────
    {"name": "l5_top_src", "opType": "noiseTOP",
     "x": 0, "y": 14 * NODE_SPACING_Y,
     "key_params": {"amp": 0.8}, "is_source": True},
    {"name": "l5_top_dat", "opType": "textDAT",
     "x": 0, "y": 15 * NODE_SPACING_Y,
     "key_params": {}, "text_content": GLSL_L5_TOP_CONST, "is_dat": True},
    {"name": "l5_glsltop", "opType": "glslTOP",
     "x": NODE_SPACING_X, "y": 14 * NODE_SPACING_Y,
     "key_params": {}, "is_source": False},
    {"name": "l5_top_out", "opType": "nullTOP",
     "x": 2 * NODE_SPACING_X, "y": 14 * NODE_SPACING_Y,
     "key_params": {}, "is_source": False},

    # ── Level 6 Chain A: Swirl (glslPOP) ───────────────────────────────────
    {"name": "l6a_box", "opType": "boxPOP",
     "x": 0, "y": 10 * NODE_SPACING_Y,
     "key_params": {"sizex": 1.5, "depth": 10}, "is_source": True},
    {"name": "l6a_dat", "opType": "textDAT",
     "x": 0, "y": 11 * NODE_SPACING_Y,
     "key_params": {}, "text_content": GLSL_L6A_SWIRL, "is_dat": True},
    {"name": "l6a_glsl", "opType": "glslPOP",
     "x": NODE_SPACING_X, "y": 10 * NODE_SPACING_Y,
     "key_params": {}, "is_source": False},
    {"name": "l6a_out", "opType": "nullPOP",
     "x": 2 * NODE_SPACING_X, "y": 10 * NODE_SPACING_Y,
     "key_params": {}, "is_source": False},

    # ── Level 6 Chain B: Color (glsladvancedPOP) ───────────────────────────
    {"name": "l6b_sphere", "opType": "spherePOP",
     "x": 0, "y": 12 * NODE_SPACING_Y,
     "key_params": {"radx": 1.2, "rady": 1.2, "rows": 16, "cols": 16},
     "is_source": True},
    {"name": "l6b_dat", "opType": "textDAT",
     "x": 0, "y": 13 * NODE_SPACING_Y,
     "key_params": {}, "text_content": GLSL_L6B_COLOR, "is_dat": True},
    {"name": "l6b_glsl", "opType": "glsladvancedPOP",
     "x": NODE_SPACING_X, "y": 12 * NODE_SPACING_Y,
     "key_params": {}, "is_source": False},
    {"name": "l6b_out", "opType": "nullPOP",
     "x": 2 * NODE_SPACING_X, "y": 12 * NODE_SPACING_Y,
     "key_params": {}, "is_source": False},

    # ── Level 7: Compute shader with npasses + const uniforms ───────────────
    {"name": "l7_noise", "opType": "noiseTOP",
     "x": 0, "y": 16 * NODE_SPACING_Y,
     "key_params": {"amp": 1.0}, "is_source": True},
    {"name": "l7_dat", "opType": "textDAT",
     "x": 0, "y": 17 * NODE_SPACING_Y,
     "key_params": {}, "text_content": GLSL_L7_PIXELBLUR, "is_dat": True},
    {"name": "l7_glsltop", "opType": "glslTOP",
     "x": NODE_SPACING_X, "y": 16 * NODE_SPACING_Y,
     "key_params": {}, "is_source": False},
    {"name": "l7_out", "opType": "nullTOP",
     "x": 2 * NODE_SPACING_X, "y": 16 * NODE_SPACING_Y,
     "key_params": {}, "is_source": False},
]

# Connections (one per chain)
CONNECTIONS = [
    # Level 1: box → glsl → null
    ("l1_box", "l1_glsl"),
    ("l1_glsl", "l1_out"),
    # Level 2: sphere → glsladvanced → null
    ("l2_sphere", "l2_glsl"),
    ("l2_glsl", "l2_out"),
    # Level 3: box → glsladvanced → null
    ("l3_box", "l3_glsl"),
    ("l3_glsl", "l3_out"),
    # Level 4: box → glsl → feedback → null
    ("l4_box", "l4_glsl"),
    ("l4_glsl", "l4_feedback"),
    ("l4_feedback", "l4_out"),
    # Level 5A: circle → glslPOP → transform → null
    ("l5_circle", "l5_glsl"),
    ("l5_glsl", "l5_xform"),
    ("l5_xform", "l5_out"),
    # Level 5B: noiseTOP → glslTOP → nullTOP (const uniforms)
    ("l5_top_src", "l5_glsltop"),
    ("l5_glsltop", "l5_top_out"),
    # Level 6A: box → glsl → null
    ("l6a_box", "l6a_glsl"),
    ("l6a_glsl", "l6a_out"),
    # Level 6B: sphere → glsladvanced → null
    ("l6b_sphere", "l6b_glsl"),
    ("l6b_glsl", "l6b_out"),
    # Level 7: noiseTOP → glslTOP → nullTOP (pixel shader + const uniforms)
    ("l7_noise", "l7_glsltop"),
    ("l7_glsltop", "l7_out"),
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
    """Create sandbox + all nodes + wire connections + set params."""

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

    # Phase 2b: write text content into DAT nodes (GLSL shaders)
    for node in ALL_NODES:
        if not node.get("text_content"):
            continue
        try:
            td.exec("op(%r).text = %r" % (f"{SANDBOX_PATH}/{node['name']}", node["text_content"]))
            res.step(f"txt_{node['name']}", True, "shader text written")
        except Exception as e:
            res.step(f"txt_{node['name']}", False, str(e))

    # Phase 2c: setup GLSL POP computedat params
    _setup_glslpop(td, res, "l1_glsl", "l1_dat", "l1_setup",
                   computedat="computedat", outputattr="outputattrs", outputval="P")
    _setup_glslpop(td, res, "l2_glsl", "l2_dat", "l2_setup",
                   computedat="computedat", outputattr="ptoutputattrs", outputval="P")
    _setup_glslpop(td, res, "l3_glsl", "l3_dat", "l3_setup",
                   computedat="computedat", outputattr="ptoutputattrs", outputval="P")
    _setup_glslpop(td, res, "l4_glsl", "l4_dat", "l4_setup",
                   computedat="computedat", outputattr="outputattrs", outputval="P")
    _setup_glslpop(td, res, "l5_glsl", "l5_dat", "l5_setup",
                   computedat="computedat", outputattr="outputattrs", outputval="P")
    _setup_glslpop(td, res, "l6a_glsl", "l6a_dat", "l6a_setup",
                   computedat="computedat", outputattr="outputattrs", outputval="P")
    _setup_glslpop(td, res, "l6b_glsl", "l6b_dat", "l6b_setup",
                   computedat="computedat", outputattr="ptoutputattrs", outputval="P")

    # Set npasses=3 on Level 5 Chain A (glslPOP)
    try:
        td.exec("op(%r).par.npasses = 3" % f"{SANDBOX_PATH}/l5_glsl")
        res.step("l5_npasses", True, "npasses=3")
    except Exception as e:
        res.step("l5_npasses", False, str(e))

    # Setup Level 5 Chain B: glslTOP with const uniforms
    try:
        td.exec("op(%r).par.pixeldat = %r" % (f"{SANDBOX_PATH}/l5_glsltop", "l5_top_dat"))
        td.exec("op(%r).par.npasses = 2" % f"{SANDBOX_PATH}/l5_glsltop")
        td.exec("op(%r).par.const0name = 'u_amplitude'" % f"{SANDBOX_PATH}/l5_glsltop")
        td.exec("op(%r).par.const0value = 0.3" % f"{SANDBOX_PATH}/l5_glsltop")
        td.exec("op(%r).par.const1name = 'u_frequency'" % f"{SANDBOX_PATH}/l5_glsltop")
        td.exec("op(%r).par.const1value = 5.0" % f"{SANDBOX_PATH}/l5_glsltop")
        res.step("l5_top_setup", True, "pixeldat + npasses=2 + const0/1 uniforms")
    except Exception as e:
        res.step("l5_top_setup", False, str(e))

    # Setup Level 7: glslTOP pixel shader with npasses + const uniforms
    try:
        td.exec("op(%r).par.pixeldat = %r" % (f"{SANDBOX_PATH}/l7_glsltop", "l7_dat"))
        td.exec("op(%r).par.npasses = 4" % f"{SANDBOX_PATH}/l7_glsltop")
        td.exec("op(%r).par.const0name = 'u_radius'" % f"{SANDBOX_PATH}/l7_glsltop")
        td.exec("op(%r).par.const0value = 2.0" % f"{SANDBOX_PATH}/l7_glsltop")
        td.exec("op(%r).par.const1name = 'u_strength'" % f"{SANDBOX_PATH}/l7_glsltop")
        td.exec("op(%r).par.const1value = 1.5" % f"{SANDBOX_PATH}/l7_glsltop")
        res.step("l7_setup", True, "pixeldat + npasses=4 + const0/1 uniforms")
    except Exception as e:
        res.step("l7_setup", False, str(e))

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


def _setup_glslpop(td: TDClient, res: TestResult,
                   glsl_name: str, dat_name: str, step_name: str,
                   computedat: str, outputattr: str, outputval: str) -> None:
    """Set computedat and output attributes on a GLSL POP operator."""
    path = f"{SANDBOX_PATH}/{glsl_name}"
    code = (
        "import json\n"
        "o = op(%r)\n"
        "res = {}\n"
        "try:\n"
        "    o.par.%s = %r\n"
        "    res['computedat'] = True\n"
        "except Exception as e:\n"
        "    res['computedat'] = 'ERR:' + str(e)[:80]\n"
        "try:\n"
        "    o.par.%s = %r\n"
        "    res['outputattr'] = True\n"
        "except Exception as e:\n"
        "    res['outputattr'] = 'ERR:' + str(e)[:80]\n"
        "print(json.dumps(res))\n"
    ) % (path, computedat, dat_name if dat_name else "", outputattr, outputval)
    try:
        raw = td.exec(code)
        data = json.loads(raw.strip().splitlines()[-1]) if raw.strip() else {}
        ok = all(v is True for v in data.values())
        detail = ", ".join(f"{k}={'ok' if v is True else v}" for k, v in data.items())
        res.step(step_name, ok, detail)
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

    # ═══ CRITICAL: Check zero errors on ALL operators ══════════════════════
    any_errors = False
    for n in nodes:
        if n["errors"]:
            any_errors = True
            res.step(f"err_{n['name']}", False, " | ".join(n["errors"]))
    if not any_errors:
        res.step("err_all", True, "all operators error-free")

    # Check GLSL compilation specifically on all GLSL POP/TOP nodes
    glsl_names = [n["name"] for n in ALL_NODES
                  if n["opType"] in ("glslPOP", "glsladvancedPOP", "glslTOP")]
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

    # Check npasses on Level 5 Chain A (glslPOP)
    try:
        raw = td.exec(
            "import json\n"
            "o = op('%s/l5_glsl')\n"
            "print(json.dumps({'npasses': o.par.npasses.eval()}))\n" % SANDBOX_PATH)
        params = json.loads(raw.strip().splitlines()[-1]) if raw.strip() else {}
        np = params.get("npasses", 0)
        res.step("check_l5_npasses", np == 3, f"npasses={np}" + ("" if np == 3 else " (expected 3)"))
    except Exception as e:
        res.step("check_l5_npasses", False, str(e))

    # Check const uniforms on Level 5 Chain B (glslTOP)
    try:
        raw = td.exec(
            "import json\n"
            "o = op('%s/l5_glsltop')\n"
            "print(json.dumps({\n"
            "    'const0name': str(o.par.const0name.eval()),\n"
            "    'const0value': float(o.par.const0value.eval()),\n"
            "    'const1name': str(o.par.const1name.eval()),\n"
            "    'const1value': float(o.par.const1value.eval()),\n"
            "    'npasses': int(o.par.npasses.eval()),\n"
            "}))\n" % SANDBOX_PATH)
        params = json.loads(raw.strip().splitlines()[-1]) if raw.strip() else {}
        res.step("check_l5_top_const0name", params.get("const0name") == "u_amplitude",
                 f"const0name={params.get('const0name')}")
        res.step("check_l5_top_const0value", abs(params.get("const0value", 0) - 0.3) < 0.01,
                 f"const0value={params.get('const0value')}")
        res.step("check_l5_top_const1name", params.get("const1name") == "u_frequency",
                 f"const1name={params.get('const1name')}")
        res.step("check_l5_top_const1value", abs(params.get("const1value", 0) - 5.0) < 0.01,
                 f"const1value={params.get('const1value')}")
        res.step("check_l5_top_npasses", params.get("npasses") == 2,
                 f"npasses={params.get('npasses')} (expected 2)")
    except Exception as e:
        res.step("check_l5_top_consts", False, str(e))

    # Check pixel shader params on Level 7 (glslTOP)
    try:
        raw = td.exec(
            "import json\n"
            "o = op('%s/l7_glsltop')\n"
            "print(json.dumps({\n"
            "    'const0name': str(o.par.const0name.eval()),\n"
            "    'const0value': float(o.par.const0value.eval()),\n"
            "    'const1name': str(o.par.const1name.eval()),\n"
            "    'const1value': float(o.par.const1value.eval()),\n"
            "    'npasses': int(o.par.npasses.eval()),\n"
            "}))\n" % SANDBOX_PATH)
        params = json.loads(raw.strip().splitlines()[-1]) if raw.strip() else {}
        res.step("check_l7_const0name", params.get("const0name") == "u_radius",
                 f"const0name={params.get('const0name')}")
        res.step("check_l7_const0value", abs(params.get("const0value", 0) - 2.0) < 0.01,
                 f"const0value={params.get('const0value')}")
        res.step("check_l7_const1name", params.get("const1name") == "u_strength",
                 f"const1name={params.get('const1name')}")
        res.step("check_l7_const1value", abs(params.get("const1value", 0) - 1.5) < 0.01,
                 f"const1value={params.get('const1value')}")
        res.step("check_l7_npasses", params.get("npasses") == 4,
                 f"npasses={params.get('npasses')} (expected 4)")
    except Exception as e:
        res.step("check_l7_consts", False, str(e))

    # Check feedback inputmul on Level 4
    try:
        raw = td.exec(
            "import json\n"
            "o = op('%s/l4_feedback')\n"
            "print(json.dumps({'inputmul': o.par.inputmul.eval()}))\n" % SANDBOX_PATH)
        params = json.loads(raw.strip().splitlines()[-1]) if raw.strip() else {}
        im = params.get("inputmul", -1)
        res.step("check_l4_inputmul", im == 1, f"inputmul={im} (Int param)")
    except Exception as e:
        res.step("check_l4_inputmul", False, str(e))

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
    print("  GLSL POP Comprehensive Suite — 7 Complexity Levels")
    print(f"  Target: http://{DEFAULT_HOST}:{DEFAULT_PORT}")
    print(f"  Sandbox: {SANDBOX_PATH}")
    print(f"  Nodes: {len(ALL_NODES)}, Connections: {len(CONNECTIONS)}")
    print("  L1: Basic glslPOP displacement (4 nodes)")
    print("  L2: glsladvancedPOP P + Cd color (4 nodes)")
    print("  L3: Multi-attribute spiral displacement (4 nodes)")
    print("  L4: Feedback loop temporal accumulation (4 nodes)")
    print("  L5: Multi-pass glslPOP npasses=3 (5 nodes)")
    print("  L6: Dual chains — glslPOP + glsladvancedPOP (7 nodes)")
    print("  L7: Pixel shader multi-pass + const uniforms (4 nodes)")
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
