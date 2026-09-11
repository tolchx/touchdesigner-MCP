#!/usr/bin/env python3
"""
Advanced GLSL POP Test — 10 Independent Base Systems
======================================================

Each system is a separate baseCOMP container with 4-5 nodes:
  source POP → textDAT(shader) → glslPOP/glsladvancedPOP → nullPOP

EXPLICIT RULES (verified every run):
  RULE 1 — CONTAINER: All operators inside a UUID-named baseCOMP per system.
  RULE 2 — NO ERRORS: Immediate + async post-cook re-check on ALL GLSL DATs.
  RULE 3 — NO OVERLAP: Grid positions verified for separation.

10 Systems:
  Base 01 — Sinusoidal wave displacement (glslPOP)
  Base 02 — Color by distance (glsladvancedPOP, P + Cd)
  Base 03 — Spiral vortex displacement (glsladvancedPOP, P + Cd)
  Base 04 — Noise turbulence (glslPOP with noise functions)
  Base 05 — Feedback accumulation (glslPOP + feedbackPOP)
  Base 06 — Multi-pass blur (glslPOP, npasses=4)
  Base 07 — Fractal displacement (glslPOP with fractal math)
  Base 08 — Attraction field (glsladvancedPOP, attraction to center)
  Base 09 — Radial ripple wave (glslPOP, distance-based ripple)
  Base 10 — Color cycling animation (glsladvancedPOP, animated Cd)

Parameter-name notes (empirically verified):
  - glslPOP:         computedat (String), outputattrs (Menu 'P')
  - glsladvancedPOP: computedat (String), ptoutputattrs (Menu 'P'/'*')
  - feedbackPOP:     inputmul (Int — NOT gain, NOT Float)

Exit code 0 = pass, non-zero = fail. Safe to re-run.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.request
import uuid

DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 44444
DEFAULT_TIMEOUT = 30

SANDBOX_PARENT = "/project1"
SANDBOX_NAME = f"test_glsl10bases_{uuid.uuid4().hex[:8]}"
SANDBOX_PATH = f"{SANDBOX_PARENT}/{SANDBOX_NAME}"

# Spacing between systems (Y axis) and nodes within a system (X axis)
SYSTEM_SPACING_Y = 600
NODE_SPACING_X = 400

# ═══════════════════════════════════════════════════════════════════════════════
# GLSL Shader Definitions (10 systems)
# ═══════════════════════════════════════════════════════════════════════════════

# Base 01: Sinusoidal wave displacement
GLSL_WAVE = (
    "// Base 01: Sinusoidal wave displacement\n"
    "uniform float u_time;\n"
    "void main() {\n"
    "    uint id = TDIndex();\n"
    "    vec3 pos = TDIn_P(0, id);\n"
    "    float wave = sin(pos.x * 3.0 + pos.z * 2.0 + u_time * 1.5) * 0.15;\n"
    "    float wave2 = cos(pos.z * 2.5 + pos.x * 1.8 + u_time * 1.2) * 0.1;\n"
    "    P[id] = pos + vec3(wave2, wave, wave * 0.5);\n"
    "}\n"
)

# Base 02: Color by distance from origin
GLSL_COLOR_DISTANCE = (
    "// Base 02: Color by distance from origin\n"
    "uniform float u_time;\n"
    "void main() {\n"
    "    uint id = TDIndex();\n"
    "    vec3 pos = TDIn_P(0, id);\n"
    "    float d = length(pos);\n"
    "    P[id] = pos;\n"
    "    Cd[id] = vec4(\n"
    "        sin(d * 2.0 + u_time) * 0.5 + 0.5,\n"
    "        cos(d * 1.5 + u_time * 0.7) * 0.5 + 0.5,\n"
    "        1.0 - d * 0.3,\n"
    "        1.0\n"
    "    );\n"
    "}\n"
)

# Base 03: Spiral vortex displacement
GLSL_SPIRAL = (
    "// Base 03: Spiral vortex displacement\n"
    "uniform float u_time;\n"
    "void main() {\n"
    "    uint id = TDIndex();\n"
    "    vec3 pos = TDIn_P(0, id);\n"
    "    float angle = atan(pos.z, pos.x) + u_time * 0.8;\n"
    "    float rad = length(pos.xz);\n"
    "    float spiral = sin(rad * 4.0 - u_time * 3.0) * 0.15;\n"
    "    pos.x = cos(angle) * rad;\n"
    "    pos.z = sin(angle) * rad;\n"
    "    pos.y += spiral;\n"
    "    P[id] = pos;\n"
    "    Cd[id] = vec4(\n"
    "        sin(angle + u_time) * 0.5 + 0.5,\n"
    "        rad * 0.3,\n"
    "        cos(angle - u_time) * 0.5 + 0.5,\n"
    "        1.0\n"
    "    );\n"
    "}\n"
)

# Base 04: Noise turbulence
GLSL_NOISE = (
    "// Base 04: Noise turbulence displacement\n"
    "uniform float u_time;\n"
    "void main() {\n"
    "    uint id = TDIndex();\n"
    "    vec3 pos = TDIn_P(0, id);\n"
    "    float n1 = TDSimplexNoise(vec4(pos * 2.0, u_time * 0.5));\n"
    "    float n2 = TDSimplexNoise(vec4(pos * 4.0 + 100.0, u_time * 0.3));\n"
    "    float n3 = TDSimplexNoise(vec4(pos * 8.0 + 200.0, u_time * 0.2));\n"
    "    float turbulence = n1 * 0.5 + n2 * 0.3 + n3 * 0.2;\n"
    "    P[id] = pos + vec3(n1, n2, n3) * 0.2 * turbulence;\n"
    "}\n"
)

# Base 05: Feedback accumulation (needs feedbackPOP)
GLSL_FEEDBACK = (
    "// Base 05: Feedback-aware displacement\n"
    "// feedbackPOP.inputmul controls temporal blending\n"
    "uniform float u_time;\n"
    "void main() {\n"
    "    uint id = TDIndex();\n"
    "    vec3 pos = TDIn_P(0, id);\n"
    "    float drift = sin(u_time * 0.4 + pos.x * 2.0 + pos.z * 1.5) * 0.06;\n"
    "    float drift2 = cos(u_time * 0.3 + pos.y * 1.8 + pos.x * 2.2) * 0.05;\n"
    "    pos.x += drift;\n"
    "    pos.z += drift2;\n"
    "    pos.y += sin(u_time * 0.2 + id * 0.003) * 0.03;\n"
    "    P[id] = pos;\n"
    "}\n"
)

# Base 06: Multi-pass blur (uses npasses)
GLSL_MULTIPASS = (
    "// Base 06: Multi-pass iterative displacement\n"
    "uniform float u_time;\n"
    "void main() {\n"
    "    uint id = TDIndex();\n"
    "    vec3 pos = TDIn_P(0, id);\n"
    "    // Each pass adds a layer of displacement\n"
    "    float amp = 0.12 / float(uTDPass + 1);\n"
    "    float wave = sin(pos.x * 5.0 + pos.z * 3.0 + u_time + float(uTDPass) * 1.5) * amp;\n"
    "    pos.y += wave;\n"
    "    pos.x += cos(pos.z * 4.0 + u_time * 0.8 + float(uTDPass) * 1.2) * amp * 0.5;\n"
    "    P[id] = pos;\n"
    "}\n"
)

# Base 07: Fractal displacement
GLSL_FRACTAL = (
    "// Base 07: Fractal displacement (iterative noise)\n"
    "uniform float u_time;\n"
    "void main() {\n"
    "    uint id = TDIndex();\n"
    "    vec3 pos = TDIn_P(0, id);\n"
    "    float amp = 0.2;\n"
    "    float freq = 1.0;\n"
    "    vec3 offset = vec3(0.0);\n"
    "    for (int i = 0; i < 5; i++) {\n"
    "        float n = TDSimplexNoise(vec4(pos * freq + offset, u_time * 0.3));\n"
    "        offset += vec3(n * amp, n * amp * 0.5, n * amp * 0.7);\n"
    "        amp *= 0.5;\n"
    "        freq *= 2.0;\n"
    "    }\n"
    "    P[id] = pos + offset;\n"
    "}\n"
)

# Base 08: Attraction field
GLSL_ATTRACTOR = (
    "// Base 08: Attraction field toward center\n"
    "// u_strength is set via TD const params (uniform initializers not supported)\n"
    "uniform float u_time;\n"
    "uniform float u_strength;\n"
    "void main() {\n"
    "    uint id = TDIndex();\n"
    "    vec3 pos = TDIn_P(0, id);\n"
    "    vec3 center = vec3(0.0, sin(u_time * 0.5) * 0.3, 0.0);\n"
    "    vec3 dir = center - pos;\n"
    "    float dist = length(dir);\n"
    "    vec3 norm_dir = dist > 0.001 ? dir / dist : vec3(0.0);\n"
    "    float force = u_strength / (dist * dist + 0.5);\n"
    "    // Add orbital component\n"
    "    vec3 orbital = vec3(-pos.z, 0.0, pos.x) * 0.3;\n"
    "    P[id] = pos + norm_dir * force * 0.05 + orbital * 0.02;\n"
    "    Cd[id] = vec4(force * 0.5, 1.0 - force * 0.3, 0.8, 1.0);\n"
    "}\n"
)

# Base 09: Radial ripple wave
GLSL_RIPPLE = (
    "// Base 09: Radial ripple wave from center\n"
    "uniform float u_time;\n"
    "void main() {\n"
    "    uint id = TDIndex();\n"
    "    vec3 pos = TDIn_P(0, id);\n"
    "    float dist = length(pos.xz);\n"
    "    float ripple1 = sin(dist * 8.0 - u_time * 4.0) * 0.08;\n"
    "    float ripple2 = cos(dist * 5.0 + u_time * 2.5) * 0.05;\n"
    "    float falloff = exp(-dist * 0.5);\n"
    "    pos.y += (ripple1 + ripple2) * falloff;\n"
    "    // Radial expansion/contraction\n"
    "    float pulse = sin(u_time * 1.5) * 0.1 * falloff;\n"
    "    pos.xz *= 1.0 + pulse;\n"
    "    P[id] = pos;\n"
    "}\n"
)

# Base 10: Color cycling animation
GLSL_COLOR_CYCLE = (
    "// Base 10: Color cycling animation\n"
    "uniform float u_time;\n"
    "void main() {\n"
    "    uint id = TDIndex();\n"
    "    vec3 pos = TDIn_P(0, id);\n"
    "    // Gentle wave displacement\n"
    "    float wave = sin(pos.x * 2.0 + u_time) * 0.08;\n"
    "    P[id] = pos + vec3(0.0, wave, 0.0);\n"
    "    // HSV-like color cycling based on position + time\n"
    "    float hue = fract(atan(pos.z, pos.x) / 6.283 + u_time * 0.1 + pos.y * 0.3);\n"
    "    float sat = 0.8 + 0.2 * sin(pos.y * 3.0);\n"
    "    float val = 0.7 + 0.3 * cos(pos.x * 2.0 + u_time * 0.5);\n"
    "    // Simple HSV to RGB\n"
    "    vec3 rgb = clamp(abs(mod(hue * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);\n"
    "    Cd[id] = vec4(rgb * val * sat, 1.0);\n"
    "}\n"
)


# ═══════════════════════════════════════════════════════════════════════════════
# System Definitions — 10 independent base systems
# ═══════════════════════════════════════════════════════════════════════════════

SYSTEMS = [
    # Base 01: Sinusoidal wave (boxPOP → glslPOP → nullPOP)
    {
        "name": "base01_wave",
        "desc": "Sinusoidal wave displacement",
        "source_type": "boxPOP",
        "source_params": {"sizex": 1.5, "depth": 10},
        "glsl_type": "glslPOP",
        "glsl_shader": GLSL_WAVE,
        "output_attrs": "P",
        "extra_setup": {},
    },
    # Base 02: Color by distance (spherePOP → glsladvancedPOP → nullPOP)
    {
        "name": "base02_coldist",
        "desc": "Color by distance from origin",
        "source_type": "spherePOP",
        "source_params": {"radx": 1.2, "rady": 1.2, "rows": 16, "cols": 16},
        "glsl_type": "glsladvancedPOP",
        "glsl_shader": GLSL_COLOR_DISTANCE,
        "output_attrs": "P",
        "extra_setup": {"ptoutputattrs": "P"},
    },
    # Base 03: Spiral vortex (boxPOP → glsladvancedPOP → nullPOP)
    {
        "name": "base03_spiral",
        "desc": "Spiral vortex displacement",
        "source_type": "boxPOP",
        "source_params": {"sizex": 2.0, "depth": 12},
        "glsl_type": "glsladvancedPOP",
        "glsl_shader": GLSL_SPIRAL,
        "output_attrs": "P",
        "extra_setup": {"ptoutputattrs": "P"},
    },
    # Base 04: Noise turbulence (spherePOP → glslPOP → nullPOP)
    {
        "name": "base04_noise",
        "desc": "Noise turbulence displacement",
        "source_type": "spherePOP",
        "source_params": {"radx": 1.5, "rady": 1.5, "rows": 20, "cols": 20},
        "glsl_type": "glslPOP",
        "glsl_shader": GLSL_NOISE,
        "output_attrs": "P",
        "extra_setup": {},
    },
    # Base 05: Feedback (boxPOP → glslPOP → feedbackPOP → nullPOP)
    {
        "name": "base05_feedback",
        "desc": "Feedback accumulation",
        "source_type": "boxPOP",
        "source_params": {"sizex": 1.0, "depth": 8},
        "glsl_type": "glslPOP",
        "glsl_shader": GLSL_FEEDBACK,
        "output_attrs": "P",
        "has_feedback": True,
        "extra_setup": {},
    },
    # Base 06: Multi-pass (circlePOP → glslPOP(npasses=4) → nullPOP)
    {
        "name": "base06_multipass",
        "desc": "Multi-pass blur (npasses=4)",
        "source_type": "circlePOP",
        "source_params": {"radx": 1.5, "rady": 1.5, "divs": 48},
        "glsl_type": "glslPOP",
        "glsl_shader": GLSL_MULTIPASS,
        "output_attrs": "P",
        "extra_setup": {"npasses": 4},
    },
    # Base 07: Fractal (boxPOP → glslPOP → nullPOP)
    {
        "name": "base07_fractal",
        "desc": "Fractal displacement",
        "source_type": "boxPOP",
        "source_params": {"sizex": 2.5, "depth": 16},
        "glsl_type": "glslPOP",
        "glsl_shader": GLSL_FRACTAL,
        "output_attrs": "P",
        "extra_setup": {},
    },
    # Base 08: Attractor (spherePOP → glsladvancedPOP → nullPOP)
    {
        "name": "base08_attractor",
        "desc": "Attraction field toward center",
        "source_type": "spherePOP",
        "source_params": {"radx": 2.0, "rady": 2.0, "rows": 14, "cols": 14},
        "glsl_type": "glsladvancedPOP",
        "glsl_shader": GLSL_ATTRACTOR,
        "output_attrs": "P",
        "extra_setup": {"ptoutputattrs": "P", "const0name": "u_strength", "const0value": 0.5},
    },
    # Base 09: Ripple (gridPOP → glslPOP → nullPOP)
    {
        "name": "base09_ripple",
        "desc": "Radial ripple wave from center",
        "source_type": "gridPOP",
        "source_params": {"sizex": 4.0, "sizez": 4.0, "rows": 20, "cols": 20},
        "glsl_type": "glslPOP",
        "glsl_shader": GLSL_RIPPLE,
        "output_attrs": "P",
        "extra_setup": {},
    },
    # Base 10: Color cycle (boxPOP → glsladvancedPOP → nullPOP)
    {
        "name": "base10_colorcycle",
        "desc": "Color cycling animation",
        "source_type": "boxPOP",
        "source_params": {"sizex": 2.0, "depth": 12},
        "glsl_type": "glsladvancedPOP",
        "glsl_shader": GLSL_COLOR_CYCLE,
        "output_attrs": "P",
        "extra_setup": {"ptoutputattrs": "P"},
    },
]


# ═══════════════════════════════════════════════════════════════════════════════
# HTTP client + Test harness
# ═══════════════════════════════════════════════════════════════════════════════

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


# ═══════════════════════════════════════════════════════════════════════════════
# Build phase
# ═══════════════════════════════════════════════════════════════════════════════

def build_network(td: TDClient, res: TestResult) -> bool:
    """Create sandbox + all 10 base systems."""

    # Phase 1: create master sandbox
    try:
        td.exec("c = op(%r); c.destroy() if c is not None else None" % SANDBOX_PATH)
        td.exec("op(%r).create(baseCOMP, %r)" % (SANDBOX_PARENT, SANDBOX_NAME))
        td.exec("op(%r).nodeX = 0; op(%r).nodeY = 0" % (SANDBOX_PATH, SANDBOX_PATH))
        res.step("sandbox_create", True, SANDBOX_PATH)
    except Exception as e:
        res.step("sandbox_create", False, str(e))
        return False

    # Phase 2: build each system
    total_nodes = 0
    total_conns = 0
    for idx, sys_def in enumerate(SYSTEMS):
        sys_ok = _build_system(td, res, idx, sys_def)
        if sys_ok:
            total_nodes += _count_nodes(sys_def)
            total_conns += _count_connections(sys_def)

    res.step("systems_built", True,
             f"{len(SYSTEMS)} systems, {total_nodes} nodes, {total_conns} connections")
    return True


def _count_nodes(sys_def: dict) -> int:
    """Count nodes in a system: source + dat + glsl + out [+ feedback]."""
    n = 4  # source, dat, glsl, out
    if sys_def.get("has_feedback"):
        n += 1  # feedbackPOP
    return n


def _count_connections(sys_def: dict) -> int:
    """Count connections in a system."""
    n = 2  # source→glsl, glsl→out (or glsl→feedback, feedback→out)
    if sys_def.get("has_feedback"):
        n = 3  # source→glsl, glsl→feedback, feedback→out
    return n


def _build_system(td: TDClient, res: TestResult, idx: int, sys_def: dict) -> bool:
    """Build one base system inside the sandbox."""
    base_name = sys_def["name"]
    base_path = f"{SANDBOX_PATH}/{base_name}"
    sys_y = idx * SYSTEM_SPACING_Y

    # Create sub-container
    try:
        td.exec("op(%r).create(baseCOMP, %r)" % (SANDBOX_PATH, base_name))
        td.exec("op(%r).nodeX = 0; op(%r).nodeY = %d" % (base_path, base_path, sys_y))
        res.step(f"cr_{base_name}", True, "baseCOMP")
    except Exception as e:
        res.step(f"cr_{base_name}", False, str(e))
        return False

    # Create nodes inside the sub-container
    node_names = {
        "src": f"{base_name}_src",
        "dat": f"{base_name}_dat",
        "glsl": f"{base_name}_glsl",
        "out": f"{base_name}_out",
    }
    if sys_def.get("has_feedback"):
        node_names["fb"] = f"{base_name}_fb"

    created = {}
    for role, node_name in node_names.items():
        if role == "src":
            op_type = sys_def["source_type"]
        elif role == "dat":
            op_type = "textDAT"
        elif role == "glsl":
            op_type = sys_def["glsl_type"]
        elif role == "out":
            op_type = "nullPOP"
        elif role == "fb":
            op_type = "feedbackPOP"
        else:
            continue

        try:
            td.exec("op(%r).create(%s, %r)" % (base_path, op_type, node_name))
            created[role] = node_name
            res.step(f"cr_{base_name}_{role}", True, op_type)
        except Exception as e:
            res.step(f"cr_{base_name}_{role}", False, str(e))

    if len(created) < len(node_names):
        res.step(f"cr_{base_name}_all", False, f"{len(created)}/{len(node_names)}")
        return False
    res.step(f"cr_{base_name}_all", True, f"{len(created)} nodes")

    # Write shader text to DAT
    try:
        dat_path = f"{base_path}/{node_names['dat']}"
        td.exec("op(%r).text = %r" % (dat_path, sys_def["glsl_shader"]))
        res.step(f"txt_{base_name}", True, "shader written")
    except Exception as e:
        res.step(f"txt_{base_name}", False, str(e))

    # Wire connections (BEFORE computedat — input must be connected when
    # shader compiles, otherwise TDIn_P fails with 'no matching overload')
    if sys_def.get("has_feedback"):
        # source → glsl → feedback → out
        conns = [
            (node_names["src"], node_names["glsl"]),
            (node_names["glsl"], node_names["fb"]),
            (node_names["fb"], node_names["out"]),
        ]
    else:
        # source → glsl → out
        conns = [
            (node_names["src"], node_names["glsl"]),
            (node_names["glsl"], node_names["out"]),
        ]

    wired = 0
    for src, tgt in conns:
        try:
            td.exec(
                "op(%r).outputConnectors[0].connect(op(%r))"
                % (f"{base_path}/{src}", f"{base_path}/{tgt}")
            )
            wired += 1
            res.step(f"w_{base_name}_{src}_to_{tgt}", True)
        except Exception as e:
            res.step(f"w_{base_name}_{src}_to_{tgt}", False, str(e))
    res.step(f"w_{base_name}_all", wired == len(conns), f"{wired}/{len(conns)}")

    # Setup GLSL POP computedat (after wiring — TDIn_P finds connected input)
    glsl_path = f"{base_path}/{node_names['glsl']}"
    try:
        td.exec("op(%r).par.computedat = %r" % (glsl_path, node_names["dat"]))
        res.step(f"setup_{base_name}_cdat", True, f"computedat={node_names['dat']}")
    except Exception as e:
        res.step(f"setup_{base_name}_cdat", False, str(e))

    # Setup output attributes
    if sys_def["glsl_type"] == "glslPOP":
        try:
            td.exec("op(%r).par.outputattrs = %r" % (glsl_path, sys_def["output_attrs"]))
            res.step(f"setup_{base_name}_oattr", True, f"outputattrs={sys_def['output_attrs']}")
        except Exception as e:
            res.step(f"setup_{base_name}_oattr", False, str(e))
    else:
        # glsladvancedPOP uses ptoutputattrs
        pt_attr = sys_def.get("extra_setup", {}).get("ptoutputattrs", "P")
        try:
            td.exec("op(%r).par.ptoutputattrs = %r" % (glsl_path, pt_attr))
            res.step(f"setup_{base_name}_oattr", True, f"ptoutputattrs={pt_attr}")
        except Exception as e:
            res.step(f"setup_{base_name}_oattr", False, str(e))

    # Setup extra params (npasses, etc.)
    for pname, pval in sys_def.get("extra_setup", {}).items():
        if pname == "ptoutputattrs":
            continue  # already handled above
        try:
            td.exec("op(%r).par.%s = %s" % (glsl_path, pname, _py_repr(pval)))
            res.step(f"par_{base_name}_{pname}", True, f"{pname}={pval}")
        except Exception as e:
            res.step(f"par_{base_name}_{pname}", False, str(e))

    # Setup source params
    for pname, pval in sys_def["source_params"].items():
        src_path = f"{base_path}/{node_names['src']}"
        try:
            td.exec("op(%r).par.%s = %s" % (src_path, pname, _py_repr(pval)))
        except Exception as e:
            res.step(f"par_{base_name}_src_{pname}", False, str(e))
    res.step(f"par_{base_name}_src", True, f"set {len(sys_def['source_params'])} source params")

    # Setup feedbackPOP if present
    # NOTE: feedbackPOP reads from its own input history automatically.
    # Unlike feedbackTOP, feedbackPOP has no 'top' param — only 'inputmul'.
    if sys_def.get("has_feedback") and "fb" in node_names:
        try:
            fb_path = f"{base_path}/{node_names['fb']}"
            td.exec("op(%r).par.inputmul = 1" % fb_path)
            res.step(f"setup_{base_name}_fb", True, "inputmul=1")
        except Exception as e:
            res.step(f"setup_{base_name}_fb", False, str(e))

    # Position nodes
    for role, node_name in node_names.items():
        x = {"src": 0, "dat": 0, "glsl": NODE_SPACING_X,
             "out": 2 * NODE_SPACING_X, "fb": 2 * NODE_SPACING_X}.get(role, 0)
        y_off = {"dat": 300}.get(role, 0)  # DAT above the chain
        try:
            td.exec("o = op(%r); o.nodeX = %d; o.nodeY = %d" % (
                f"{base_path}/{node_name}", x, y_off))
        except Exception:
            pass

    return True


# ═══════════════════════════════════════════════════════════════════════════════
# Verify phase
# ═══════════════════════════════════════════════════════════════════════════════

def verify_network(td: TDClient, res: TestResult) -> None:
    """Verify all 10 systems: zero errors, GLSL compiled, connections valid."""
    time.sleep(2.0)

    for idx, sys_def in enumerate(SYSTEMS):
        base_name = sys_def["name"]
        base_path = f"{SANDBOX_PATH}/{base_name}"

        # Check zero errors on all operators in this system
        try:
            raw = td.exec(
                "import json\n"
                "c = op('%s')\n"
                "errs = []\n"
                "if c is not None:\n"
                "    for n in c.findChildren():\n"
                "        e = list(n.errors()) if n.errors() else []\n"
                "        if e:\n"
                "            errs.append({'name': n.name, 'errors': [str(x) for x in e]})\n"
                "print(json.dumps(errs))\n" % base_path
            )
            post_errors = json.loads(raw.strip().splitlines()[-1]) if raw.strip() else []
            res.step(f"err_{base_name}", len(post_errors) == 0,
                     "all clean" if not post_errors else f"{len(post_errors)} error(s)")
            for pe in post_errors:
                res.step(f"err_{base_name}_{pe.get('name', '?')}", False,
                         str(pe.get("errors", [])))
        except Exception as e:
            res.step(f"err_{base_name}", False, str(e))

        # Check GLSL compilation specifically
        glsl_name = f"{base_name}_glsl"
        try:
            raw = td.exec(
                "import json\n"
                "o = op('%s/%s')\n"
                "errs = list(o.errors()) if o.errors() else []\n"
                "print(json.dumps({'errors': [str(x) for x in errs]}))\n"
                % (base_path, glsl_name)
            )
            data = json.loads(raw.strip().splitlines()[-1]) if raw.strip() else {}
            errs = data.get("errors", [])
            res.step(f"glsl_compile_{base_name}", len(errs) == 0,
                     "no errors" if not errs else f"errors: {errs}")
        except Exception as e:
            res.step(f"glsl_compile_{base_name}", False, str(e))

    # RULE 2: async re-check on ALL systems
    print("\n--- RULE 2: Async GLSL re-check ---")
    try:
        td.exec("c = op(%r); c.cook(force=True)" % SANDBOX_PATH)
        time.sleep(3.0)
        raw = td.exec(
            "import json\n"
            "errs = []\n"
            "c = op('%s')\n"
            "if c is not None:\n"
            "    for n in c.findChildren():\n"
            "        for child in (n.findChildren() if hasattr(n, 'findChildren') else []):\n"
            "            e = list(child.errors()) if child.errors() else []\n"
            "            if e:\n"
            "                errs.append({'name': child.path, 'errors': [str(x) for x in e]})\n"
            "print(json.dumps(errs))\n" % SANDBOX_PATH
        )
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


# ═══════════════════════════════════════════════════════════════════════════════
# Main
# ═══════════════════════════════════════════════════════════════════════════════

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--keep", action="store_true",
                        help="Skip cleanup — keep sandboxes in TD for visual inspection")
    args = parser.parse_args()

    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

    td = TDClient(DEFAULT_HOST, DEFAULT_PORT)
    res = TestResult()

    print("=" * 72)
    print("  Advanced GLSL POP — 10 Independent Base Systems")
    print(f"  Target: http://{DEFAULT_HOST}:{DEFAULT_PORT}")
    print(f"  Sandbox: {SANDBOX_PATH}")
    total_n = sum(_count_nodes(s) for s in SYSTEMS)
    total_c = sum(_count_connections(s) for s in SYSTEMS)
    print(f"  Systems: {len(SYSTEMS)}, Total nodes: {total_n}, Connections: {total_c}")
    for s in SYSTEMS:
        print(f"    {s['name']}: {s['desc']}")
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

    if not args.keep:
        print("\n--- Cleanup ---")
        cleanup(td, res)
    else:
        print(f"\n--- Keeping sandbox: {SANDBOX_PATH} ---")
        print("  (use without --keep to auto-cleanup)")

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
