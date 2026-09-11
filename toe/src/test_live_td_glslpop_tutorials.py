#!/usr/bin/env python3
"""
Tutorial-Inspired GLSL POP Shaders — 10 Base COMP Systems
===========================================================

GLSL POP techniques sourced from 2025-2026 TouchDesigner tutorials:
  - water__shed Patreon/YouTube GLSL for POPs series
  - Derivative official POPs Workshops
  - Community forum best practices (March 2026)
  - The Book of Shaders adaptations

Each system is an independent baseCOMP with 4 nodes:
  source POP → textDAT(shader) → glslPOP/glsladvancedPOP → nullPOP

10 Systems:
  Tut 01 — Phyllotaxis Spiral Layout (procedural instancing)
  Tut 02 — Magnetic Field Displacement (field lines)
  Tut 03 — Domain Warped Turbulence (advanced noise)
  Tut 04 — Sine Wave Interference Pattern (wave superposition)
  Tut 05 — Lissajous Curve Attractor (parametric oscillation)
  Tut 06 — Spring Dynamics (damped oscillation)
  Tut 07 — Particle Age/Lifecycle (time-based evolution)
  Tut 08 — Quaternary Rotation (axis-angle rotation)
  Tut 09 — Emergent Growth Pattern (noise-driven organic structures)
  Tut 10 — Audio-Reactive Heightfield (TOP-to-POP pipeline)

Parameter-name notes (empirically verified):
  - glslPOP:         computedat (String), outputattrs (Menu 'P')
  - glsladvancedPOP: computedat (String), ptoutputattrs (Menu 'P'/'*')

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
SANDBOX_NAME = f"test_tutorials_{uuid.uuid4().hex[:8]}"
SANDBOX_PATH = f"{SANDBOX_PARENT}/{SANDBOX_NAME}"

SYSTEM_SPACING_Y = 600
NODE_SPACING_X = 400

# ═══════════════════════════════════════════════════════════════════════════════
# GLSL Shaders — Tutorial-inspired patterns for TD glslPOP
# ═══════════════════════════════════════════════════════════════════════════════

# Tut 01: Phyllotaxis Spiral Layout
# Pattern: Procedural sunflower spiral distribution
# Source: The Book of Shaders, water__shed tutorials
GLSL_PHYLLLOTAXIS = (
    "// Tut 01: Phyllotaxis Spiral Layout (procedural instancing)\n"
    "// Golden angle distribution — each point placed at 137.5° increment\n"
    "uniform float u_time;\n"
    "\n"
    "void main() {\n"
    "    uint id = TDIndex();\n"
    "    vec3 pos = TDIn_P(0, id);\n"
    "    float n = float(id);\n"
    "    float golden_angle = 2.39996323; // 137.5 degrees in radians\n"
    "    float phi = n * golden_angle + u_time * 0.5;\n"
    "    float r = sqrt(n) * 0.08;\n"
    "    vec3 target = vec3(cos(phi) * r, sin(phi) * r, 0.0);\n"
    "    // Spiral outward over time\n"
    "    float expansion = 1.0 + sin(u_time * 0.3) * 0.3;\n"
    "    P[id] = mix(pos, target * expansion, 0.15);\n"
    "}\n"
)

# Tut 02: Magnetic Field Displacement
# Pattern: Field lines around dipole magnets
# Source: TD forum magnetic field simulations
GLSL_MAGNETIC = (
    "// Tut 02: Magnetic Field Displacement\n"
    "// Dipole field: B = (3(m·r)r/m^5 - m/r^3)\n"
    "uniform float u_time;\n"
    "\n"
    "void main() {\n"
    "    uint id = TDIndex();\n"
    "    vec3 pos = TDIn_P(0, id);\n"
    "    // Two magnetic poles\n"
    "    vec3 pole1 = vec3(sin(u_time * 0.7) * 1.5, 0.0, 0.0);\n"
    "    vec3 pole2 = vec3(-sin(u_time * 0.7) * 1.5, 0.0, 0.0);\n"
    "    vec3 field = vec3(0.0);\n"
    "    // Field from pole1 (north)\n"
    "    vec3 d1 = pos - pole1;\n"
    "    float r1 = max(length(d1), 0.1);\n"
    "    field += d1 / (r1 * r1 * r1) * 0.5;\n"
    "    // Field from pole2 (south)\n"
    "    vec3 d2 = pos - pole2;\n"
    "    float r2 = max(length(d2), 0.1);\n"
    "    field -= d2 / (r2 * r2 * r2) * 0.5;\n"
    "    P[id] = pos + normalize(field) * 0.02;\n"
    "}\n"
)

# Tut 03: Domain Warped Turbulence
# Pattern: FBM with domain warping (Inigo Quilez technique)
# Source: iquilezles.org/articles/warp/
GLSL_DOMAIN_WARP = (
    "// Tut 03: Domain Warped Turbulence\n"
    "// Noise of noise — domain warping creates organic flow\n"
    "uniform float u_time;\n"
    "\n"
    "float fbm(vec3 p) {\n"
    "    float f = 0.0;\n"
    "    float amp = 0.5;\n"
    "    for (int i = 0; i < 5; i++) {\n"
    "        f += amp * TDSimplexNoise(vec4(p, u_time * 0.1));\n"
    "        p *= 2.1;\n"
    "        amp *= 0.5;\n"
    "    }\n"
    "    return f;\n"
    "}\n"
    "\n"
    "void main() {\n"
    "    uint id = TDIndex();\n"
    "    vec3 pos = TDIn_P(0, id);\n"
    "    // Domain warp: offset position by noise of noise\n"
    "    vec3 q = vec3(\n"
    "        fbm(pos + vec3(0.0, 0.0, 0.0)),\n"
    "        fbm(pos + vec3(5.2, 1.3, 0.0)),\n"
    "        fbm(pos + vec3(0.0, 0.0, 0.0))\n"
    "    );\n"
    "    vec3 r = vec3(\n"
    "        fbm(pos + 4.0 * q + vec3(1.7, 9.2, 0.0)),\n"
    "        fbm(pos + 4.0 * q + vec3(8.3, 2.8, 0.0)),\n"
    "        fbm(pos + 4.0 * q)\n"
    "    );\n"
    "    float f = fbm(pos + 4.0 * r);\n"
    "    P[id] = pos + vec3(f * 0.3, f * 0.2, f * 0.15);\n"
    "}\n"
)

# Tut 04: Sine Wave Interference
# Pattern: Multiple wave sources creating interference patterns
# Source: TD community wave simulation tutorials
GLSL_INTERFERENCE = (
    "// Tut 04: Sine Wave Interference Pattern\n"
    "// Multiple point sources create Moiré-like interference\n"
    "uniform float u_time;\n"
    "\n"
    "void main() {\n"
    "    uint id = TDIndex();\n"
    "    vec3 pos = TDIn_P(0, id);\n"
    "    // Three wave sources at different positions\n"
    "    vec3 s1 = vec3(2.0, 0.0, 0.0);\n"
    "    vec3 s2 = vec3(-2.0, 0.0, 0.0);\n"
    "    vec3 s3 = vec3(0.0, 0.0, 2.0);\n"
    "    float d1 = length(pos.xz - s1.xz);\n"
    "    float d2 = length(pos.xz - s2.xz);\n"
    "    float d3 = length(pos.xz - s3.xz);\n"
    "    float wave = sin(d1 * 4.0 - u_time * 3.0) * 0.15\n"
    "              + sin(d2 * 5.0 - u_time * 2.5) * 0.12\n"
    "              + sin(d3 * 3.5 - u_time * 3.5) * 0.1;\n"
    "    P[id] = pos + vec3(0.0, wave, 0.0);\n"
    "}\n"
)

# Tut 05: Lissajous Curve Attractor
# Pattern: Parametric 3D Lissajous curves
# Source: Mathematical visualization tutorials
GLSL_LISSAJOUS = (
    "// Tut 05: Lissajous Curve Attractor\n"
    "// 3D parametric: x=sin(a*t+d), y=sin(b*t), z=sin(c*t)\n"
    "uniform float u_time;\n"
    "\n"
    "void main() {\n"
    "    uint id = TDIndex();\n"
    "    vec3 pos = TDIn_P(0, id);\n"
    "    // Lissajous parameters — different ratios create different patterns\n"
    "    float a = 3.0, b = 2.0, c = 5.0;\n"
    "    float phase = float(id) * 0.05;\n"
    "    float t = u_time * 0.8 + phase;\n"
    "    vec3 target = vec3(\n"
    "        sin(a * t + 1.57) * 1.5,\n"
    "        sin(b * t) * 1.5,\n"
    "        sin(c * t + 0.78) * 1.5\n"
    "    );\n"
    "    // Attract toward Lissajous curve\n"
    "    P[id] = mix(pos, target, 0.08);\n"
    "    Cd[id] = vec4(\n"
    "        sin(t) * 0.5 + 0.5,\n"
    "        sin(t + 2.09) * 0.5 + 0.5,\n"
    "        sin(t + 4.19) * 0.5 + 0.5,\n"
    "        1.0\n"
    "    );\n"
    "}\n"
)

# Tut 06: Spring Dynamics
# Pattern: Damped harmonic oscillation per point
# Source: water__shed spring system tutorials
GLSL_SPRING = (
    "// Tut 06: Spring Dynamics (damped oscillation)\n"
    "// Each point oscillates around its rest position\n"
    "uniform float u_time;\n"
    "\n"
    "void main() {\n"
    "    uint id = TDIndex();\n"
    "    vec3 pos = TDIn_P(0, id);\n"
    "    // Rest position = original position\n"
    "    vec3 rest = vec3(0.0); // approximate rest\n"
    "    // Spring force: F = -k*x - c*v\n"
    "    vec3 displacement = pos - rest;\n"
    "    float k = 5.0;  // spring constant\n"
    "    float c = 0.5;  // damping\n"
    "    // Oscillation with damping\n"
    "    float freq = sqrt(k);\n"
    "    float amp = exp(-c * u_time * 0.1);\n"
    "    float osc = sin(freq * u_time + float(id) * 0.1);\n"
    "    vec3 force = -displacement * k * 0.01;\n"
    "    P[id] = pos + vec3(\n"
    "        osc * amp * 0.15,\n"
    "        cos(osc * 1.3) * amp * 0.1,\n"
    "        sin(osc * 0.7) * amp * 0.12\n"
    "    );\n"
    "}\n"
)

# Tut 07: Particle Age/Lifecycle
# Pattern: Time-based particle evolution (birth → mature → decay)
# Source: TD particle lifecycle tutorials
GLSL_LIFECYCLE = (
    "// Tut 07: Particle Age/Lifecycle\n"
    "// Points evolve through lifecycle phases based on time\n"
    "uniform float u_time;\n"
    "\n"
    "void main() {\n"
    "    uint id = TDIndex();\n"
    "    vec3 pos = TDIn_P(0, id);\n"
    "    // Each particle has a unique phase offset\n"
    "    float phase = float(id) * 0.13;\n"
    "    float age = fract(u_time * 0.15 + phase);\n"
    "    // Lifecycle: birth (0-0.2), grow (0.2-0.5), mature (0.5-0.8), decay (0.8-1.0)\n"
    "    float scale;\n"
    "    if (age < 0.2) {\n"
    "        scale = age / 0.2; // birth: scale up\n"
    "    } else if (age < 0.5) {\n"
    "        scale = 1.0; // grow: full size\n"
    "    } else if (age < 0.8) {\n"
    "        scale = 1.0; // mature: stable\n"
    "    } else {\n"
    "        scale = (1.0 - age) / 0.2; // decay: shrink\n"
    "    }\n"
    "    // Spiral outward during lifecycle\n"
    "    float angle = age * 6.283 + phase;\n"
    "    float radius = scale * 1.5;\n"
    "    P[id] = vec3(cos(angle) * radius, age * 2.0 - 1.0, sin(angle) * radius);\n"
    "    Cd[id] = vec4(scale, 1.0 - age, age * 0.5, 1.0);\n"
    "}\n"
)

# Tut 08: Quaternion Rotation
# Pattern: Axis-angle rotation of points around an arbitrary axis
# Source: 3D rotation mathematics tutorials
GLSL_QUATERNION = (
    "// Tut 08: Quaternion Rotation\n"
    "// Rotate points around arbitrary axis using axis-angle\n"
    "uniform float u_time;\n"
    "\n"
    "vec3 rotateAxis(vec3 p, vec3 axis, float angle) {\n"
    "    float c = cos(angle);\n"
    "    float s = sin(angle);\n"
    "    return p * c + cross(axis, p) * s + axis * dot(axis, p) * (1.0 - c);\n"
    "}\n"
    "\n"
    "void main() {\n"
    "    uint id = TDIndex();\n"
    "    vec3 pos = TDIn_P(0, id);\n"
    "    // Rotation axis precesses over time\n"
    "    vec3 axis = normalize(vec3(\n"
    "        sin(u_time * 0.3),\n"
    "        cos(u_time * 0.5),\n"
    "        sin(u_time * 0.7)\n"
    "    ));\n"
    "    float angle = u_time * 0.8;\n"
    "    vec3 rotated = rotateAxis(pos, axis, angle);\n"
    "    P[id] = rotated;\n"
    "    // Color based on rotation angle\n"
    "    Cd[id] = vec4(\n"
    "        sin(angle + pos.x) * 0.5 + 0.5,\n"
    "        cos(angle + pos.y) * 0.5 + 0.5,\n"
    "        sin(angle * 0.5 + pos.z) * 0.5 + 0.5,\n"
    "        1.0\n"
    "    );\n"
    "}\n"
)

# Tut 09: Emergent Growth Pattern
# Pattern: Noise-driven organic growth from position seeds
# Source: Procedural generation tutorials
GLSL_GROWTH = (
    "// Tut 09: Emergent Growth Pattern\n"
    "// Noise-driven organic growth from position seeds\n"
    "uniform float u_time;\n"
    "\n"
    "void main() {\n"
    "    uint id = TDIndex();\n"
    "    vec3 pos = TDIn_P(0, id);\n"
    "    // Position-dependent seed value\n"
    "    float seed = TDSimplexNoise(vec4(pos * 0.5, 0.0, 0.0));\n"
    "    // Growth factor: expands outward from seed points over time\n"
    "    float growth = smoothstep(-0.3, 0.3, sin(seed * 6.0 + u_time * 0.5));\n"
    "    // Branching: secondary noise creates sub-structures\n"
    "    float branch = TDSimplexNoise(vec4(pos * 2.0 + seed, u_time * 0.3, 0.0));\n"
    "    float height = growth * 0.4 + branch * 0.2;\n"
    "    P[id] = pos + vec3(0.0, height, 0.0);\n"
    "    Cd[id] = vec4(growth * 0.5, 0.8 - growth * 0.3, branch * 0.5 + 0.3, 1.0);\n"
    "}\n"
)

# Tut 10: Audio-Reactive Heightfield
# Pattern: Multi-band frequency response simulation
# Source: TD forum audio-reactive tutorials (simplified without TOP input)
GLSL_AUDIO_REACTIVE = (
    "// Tut 10: Audio-Reactive Heightfield\n"
    "// Simulated multi-band audio response (bass/mid/high)\n"
    "// In production, replace sine waves with sTD2DInputs[0] texture sampling\n"
    "uniform float u_time;\n"
    "\n"
    "void main() {\n"
    "    uint id = TDIndex();\n"
    "    vec3 pos = TDIn_P(0, id);\n"
    "    float x = (pos.x + 2.0) / 4.0;\n"
    "    // Simulated frequency bands\n"
    "    float bass = sin(x * 3.0 + u_time * 4.0) * 0.4;\n"
    "    float mid = sin(x * 15.0 + u_time * 6.0) * 0.2;\n"
    "    float high = sin(x * 30.0 + u_time * 8.0) * 0.1;\n"
    "    float height = bass + mid + high;\n"
    "    P[id] = pos + vec3(0.0, height * 0.5, 0.0);\n"
    "    Cd[id] = vec4(abs(bass) * 2.0, abs(mid) * 2.0, abs(high) * 2.0, 1.0);\n"
    "}\n"
)


# ═══════════════════════════════════════════════════════════════════════════════
# System Definitions
# ═══════════════════════════════════════════════════════════════════════════════

SYSTEMS = [
    {
        "name": "tut01_phyllotaxis",
        "desc": "Phyllotaxis Spiral Layout",
        "source": "spherePOP",
        "source_params": {"radx": 1.5, "rady": 1.5, "rows": 16, "cols": 16},
        "glsl_type": "glsladvancedPOP",
        "shader": GLSL_PHYLLLOTAXIS,
        "output_attr": "P",
    },
    {
        "name": "tut02_magnetic",
        "desc": "Magnetic Field Displacement",
        "source": "spherePOP",
        "source_params": {"radx": 2.0, "rady": 2.0, "rows": 14, "cols": 14},
        "glsl_type": "glslPOP",
        "shader": GLSL_MAGNETIC,
        "output_attr": "P",
    },
    {
        "name": "tut03_domainwarp",
        "desc": "Domain Warped Turbulence",
        "source": "boxPOP",
        "source_params": {"sizex": 3.0, "depth": 20},
        "glsl_type": "glslPOP",
        "shader": GLSL_DOMAIN_WARP,
        "output_attr": "P",
    },
    {
        "name": "tut04_interference",
        "desc": "Sine Wave Interference Pattern",
        "source": "gridPOP",
        "source_params": {"sizex": 5.0, "sizez": 5.0, "rows": 24, "cols": 24},
        "glsl_type": "glslPOP",
        "shader": GLSL_INTERFERENCE,
        "output_attr": "P",
    },
    {
        "name": "tut05_lissajous",
        "desc": "Lissajous Curve Attractor",
        "source": "spherePOP",
        "source_params": {"radx": 1.0, "rady": 1.0, "rows": 12, "cols": 12},
        "glsl_type": "glsladvancedPOP",
        "shader": GLSL_LISSAJOUS,
        "output_attr": "P",
    },
    {
        "name": "tut06_spring",
        "desc": "Spring Dynamics (Damped Oscillation)",
        "source": "boxPOP",
        "source_params": {"sizex": 2.0, "depth": 12},
        "glsl_type": "glslPOP",
        "shader": GLSL_SPRING,
        "output_attr": "P",
    },
    {
        "name": "tut07_lifecycle",
        "desc": "Particle Age/Lifecycle",
        "source": "spherePOP",
        "source_params": {"radx": 1.5, "rady": 1.5, "rows": 18, "cols": 18},
        "glsl_type": "glsladvancedPOP",
        "shader": GLSL_LIFECYCLE,
        "output_attr": "P",
    },
    {
        "name": "tut08_quaternion",
        "desc": "Quaternion Rotation",
        "source": "boxPOP",
        "source_params": {"sizex": 1.5, "depth": 10},
        "glsl_type": "glsladvancedPOP",
        "shader": GLSL_QUATERNION,
        "output_attr": "P",
    },
    {
        "name": "tut09_growth",
        "desc": "Emergent Growth Pattern",
        "source": "gridPOP",
        "source_params": {"sizex": 6.0, "sizez": 1.0, "rows": 4, "cols": 30},
        "glsl_type": "glsladvancedPOP",
        "shader": GLSL_GROWTH,
        "output_attr": "P",
    },
    {
        "name": "tut10_audio",
        "desc": "Audio-Reactive Heightfield",
        "source": "gridPOP",
        "source_params": {"sizex": 4.0, "sizez": 4.0, "rows": 20, "cols": 20},
        "glsl_type": "glsladvancedPOP",
        "shader": GLSL_AUDIO_REACTIVE,
        "output_attr": "P",
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
    for idx, sys_def in enumerate(SYSTEMS):
        _build_system(td, res, idx, sys_def)

    return True


def _build_system(td: TDClient, res: TestResult, idx: int, sys_def: dict) -> bool:
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

    # Create nodes
    node_names = {
        "src": f"{base_name}_src",
        "dat": f"{base_name}_dat",
        "glsl": f"{base_name}_glsl",
        "out": f"{base_name}_out",
    }

    created = {}
    for role, node_name in node_names.items():
        if role == "src":
            op_type = sys_def["source"]
        elif role == "dat":
            op_type = "textDAT"
        elif role == "glsl":
            op_type = sys_def["glsl_type"]
        elif role == "out":
            op_type = "nullPOP"

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

    # Write shader text
    try:
        dat_path = f"{base_path}/{node_names['dat']}"
        td.exec("op(%r).text = %r" % (dat_path, sys_def["shader"]))
        res.step(f"txt_{base_name}", True, "shader written")
    except Exception as e:
        res.step(f"txt_{base_name}", False, str(e))

    # Wire: source → glsl → out (BEFORE computedat — input must be
    # connected when shader compiles, otherwise TDIn_P fails with
    # 'no matching overloaded function found')
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

    # Setup computedat (after wiring — TDIn_P finds connected input)
    glsl_path = f"{base_path}/{node_names['glsl']}"
    try:
        td.exec("op(%r).par.computedat = %r" % (glsl_path, node_names["dat"]))
        res.step(f"setup_{base_name}_cdat", True, f"computedat={node_names['dat']}")
    except Exception as e:
        res.step(f"setup_{base_name}_cdat", False, str(e))

    # Setup output attributes
    if sys_def["glsl_type"] == "glslPOP":
        try:
            td.exec("op(%r).par.outputattrs = %r" % (glsl_path, sys_def["output_attr"]))
            res.step(f"setup_{base_name}_oattr", True, f"outputattrs={sys_def['output_attr']}")
        except Exception as e:
            res.step(f"setup_{base_name}_oattr", False, str(e))
    else:
        try:
            td.exec("op(%r).par.ptoutputattrs = %r" % (glsl_path, sys_def["output_attr"]))
            res.step(f"setup_{base_name}_oattr", True, f"ptoutputattrs={sys_def['output_attr']}")
        except Exception as e:
            res.step(f"setup_{base_name}_oattr", False, str(e))

    # Setup source params
    for pname, pval in sys_def["source_params"].items():
        src_path = f"{base_path}/{node_names['src']}"
        try:
            td.exec("op(%r).par.%s = %s" % (src_path, pname, _py_repr(pval)))
        except Exception as e:
            res.step(f"par_{base_name}_src_{pname}", False, str(e))
    res.step(f"par_{base_name}_src", True, f"set {len(sys_def['source_params'])} params")

    # Position nodes
    for role, node_name in node_names.items():
        x = {"src": 0, "dat": 0, "glsl": NODE_SPACING_X, "out": 2 * NODE_SPACING_X}.get(role, 0)
        y_off = {"dat": 300}.get(role, 0)
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
    time.sleep(2.0)

    for idx, sys_def in enumerate(SYSTEMS):
        base_name = sys_def["name"]
        base_path = f"{SANDBOX_PATH}/{base_name}"

        # Check zero errors
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

        # Check GLSL compilation
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

    # RULE 2: async re-check
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
    print("  Tutorial-Inspired GLSL POP Shaders — 10 Base COMP Systems")
    print(f"  Target: http://{DEFAULT_HOST}:{DEFAULT_PORT}")
    print(f"  Sandbox: {SANDBOX_PATH}")
    print(f"  Systems: {len(SYSTEMS)}")
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
