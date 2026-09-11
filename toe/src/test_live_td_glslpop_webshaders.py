#!/usr/bin/env python3
"""
Web-Sourced GLSL POP Shaders — 5 Base COMP Systems
====================================================

Real-world GLSL algorithms adapted from Shadertoy, The Book of Shaders,
and academic papers for TouchDesigner glslPOP/glsladvancedPOP.

Each system is an independent baseCOMP with 4-5 nodes:
  source POP → textDAT(shader) → glslPOP/glsladvancedPOP → nullPOP

5 Systems (sourced + adapted):
  Base 01 — Voronoi Displacement (Inigo Quilez algorithm)
             spherePOP → glsladvancedPOP → nullPOP
             Voronoi cell boundaries drive point displacement.

  Base 02 — Curl Noise Flow Field (Stam / Bridson)
             boxPOP → glslPOP → nullPOP
             Curl of simplex noise creates divergence-free flow.

  Base 03 — Lorenz Attractor (chaotic system)
             spherePOP → glsladvancedPOP → nullPOP
             Points orbit the Lorenz strange attractor (sigma=10, rho=28, beta=8/3).

  Base 04 — Reaction-Diffusion / Gray-Scott (Turing pattern)
             gridPOP → glslPOP → nullPOP
             Simplified Gray-Scott equations drive position oscillation.

  Base 05 — Fractal Brownian Motion Terrain (fBm)
             boxPOP → glslPOP → nullPOP
             Multi-octave fBm generates heightfield-like displacement.

Sources:
  - iq (Inigo Quilez): https://iquilezles.org/articles/voronoise/
  - The Book of Shaders: https://thebookofshaders.com/11/
  - Stam, J. (1999): Stable Fluids — curl noise
  - Lorenz, E.N. (1963): Deterministic Nonperiodic Flow
  - Gray, P. & Scott, S.K. (1983): Autocatalytic reactions

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
SANDBOX_NAME = f"test_webshaders_{uuid.uuid4().hex[:8]}"
SANDBOX_PATH = f"{SANDBOX_PARENT}/{SANDBOX_NAME}"

SYSTEM_SPACING_Y = 600
NODE_SPACING_X = 400

# ═══════════════════════════════════════════════════════════════════════════════
# GLSL Shaders — Adapted from real-world sources for TD glslPOP
# ═══════════════════════════════════════════════════════════════════════════════

# Base 01: Voronoi Displacement
# Source: Inigo Quilez — https://iquilezles.org/articles/voronoise/
# Adapted: Voronoi cell boundary distance drives P displacement
GLSL_VORONOI = (
    "// Base 01: Voronoi Displacement (adapted from iq/Quilez)\n"
    "// Voronoi cell boundaries push points away from edges\n"
    "uniform float u_time;\n"
    "\n"
    "// Hash function for Voronoi\n"
    "vec2 hash2(vec2 p) {\n"
    "    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));\n"
    "    return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);\n"
    "}\n"
    "\n"
    "float voronoi(vec2 p) {\n"
    "    vec2 n = floor(p);\n"
    "    vec2 f = fract(p);\n"
    "    float md = 8.0;\n"
    "    for (int j = -1; j <= 1; j++) {\n"
    "        for (int i = -1; i <= 1; i++) {\n"
    "            vec2 g = vec2(float(i), float(j));\n"
    "            vec2 o = hash2(n + g);\n"
    "            o = 0.5 + 0.5 * sin(u_time * 0.5 + 6.2831 * o);\n"
    "            vec2 r = g + o - f;\n"
    "            float d = dot(r, r);\n"
    "            md = min(md, d);\n"
    "        }\n"
    "    }\n"
    "    return md;\n"
    "}\n"
    "\n"
    "void main() {\n"
    "    uint id = TDIndex();\n"
    "    vec3 pos = TDIn_P(0, id);\n"
    "    float v = voronoi(pos.xz * 2.0);\n"
    "    float edge = smoothstep(0.0, 0.05, v) * 0.3;\n"
    "    P[id] = pos + vec3(0.0, v * 0.5 - 0.25, 0.0) * edge;\n"
    "}\n"
)

# Base 02: Curl Noise Flow Field
# Source: Jos Stam — Stable Fluids (1999), Bridson curl noise
# Adapted: Divergence-free curl of simplex noise for fluid-like motion
GLSL_CURL_NOISE = (
    "// Base 02: Curl Noise Flow Field (adapted from Stam/Bridson)\n"
    "// Divergence-free displacement via curl of 3D simplex noise\n"
    "uniform float u_time;\n"
    "\n"
    "vec3 curlNoise(vec3 p) {\n"
    "    float e = 0.1;\n"
    "    float n1, n2;\n"
    "    vec3 curl;\n"
    "    // curl.x = dNz/dy - dNy/dz\n"
    "    n1 = TDSimplexNoise(vec4(p + vec3(0, e, 0), u_time * 0.3));\n"
    "    n2 = TDSimplexNoise(vec4(p - vec3(0, e, 0), u_time * 0.3));\n"
    "    float a = (n1 - n2) / (2.0 * e);\n"
    "    n1 = TDSimplexNoise(vec4(p + vec3(0, 0, e), u_time * 0.3));\n"
    "    n2 = TDSimplexNoise(vec4(p - vec3(0, 0, e), u_time * 0.3));\n"
    "    float b = (n1 - n2) / (2.0 * e);\n"
    "    curl.x = a - b;\n"
    "    // curl.y = dNx/dz - dNz/dx\n"
    "    n1 = TDSimplexNoise(vec4(p + vec3(0, 0, e), u_time * 0.3));\n"
    "    n2 = TDSimplexNoise(vec4(p - vec3(0, 0, e), u_time * 0.3));\n"
    "    a = (n1 - n2) / (2.0 * e);\n"
    "    n1 = TDSimplexNoise(vec4(p + vec3(e, 0, 0), u_time * 0.3));\n"
    "    n2 = TDSimplexNoise(vec4(p - vec3(e, 0, 0), u_time * 0.3));\n"
    "    b = (n1 - n2) / (2.0 * e);\n"
    "    curl.y = a - b;\n"
    "    // curl.z = dNy/dx - dNx/dy\n"
    "    n1 = TDSimplexNoise(vec4(p + vec3(e, 0, 0), u_time * 0.3));\n"
    "    n2 = TDSimplexNoise(vec4(p - vec3(e, 0, 0), u_time * 0.3));\n"
    "    a = (n1 - n2) / (2.0 * e);\n"
    "    n1 = TDSimplexNoise(vec4(p + vec3(0, e, 0), u_time * 0.3));\n"
    "    n2 = TDSimplexNoise(vec4(p - vec3(0, e, 0), u_time * 0.3));\n"
    "    b = (n1 - n2) / (2.0 * e);\n"
    "    curl.z = a - b;\n"
    "    return curl;\n"
    "}\n"
    "\n"
    "void main() {\n"
    "    uint id = TDIndex();\n"
    "    vec3 pos = TDIn_P(0, id);\n"
    "    vec3 vel = curlNoise(pos * 1.5) * 0.15;\n"
    "    P[id] = pos + vel;\n"
    "}\n"
)

# Base 03: Lorenz Attractor
# Source: Lorenz, E.N. (1963) — Deterministic Nonperiodic Flow
# Adapted: Points attracted toward the Lorenz strange attractor
# sigma=10, rho=28, beta=8/3 (classic parameters)
GLSL_LORENZ = (
    "// Base 03: Lorenz Attractor (adapted from Lorenz 1963)\n"
    "// Strange attractor: dx/dt = sigma*(y-x), dy/dt = x*(rho-z)-y, dz/dt = x*y-beta*z\n"
    "uniform float u_time;\n"
    "\n"
    "void main() {\n"
    "    uint id = TDIndex();\n"
    "    vec3 pos = TDIn_P(0, id);\n"
    "    // Scale to Lorenz coordinate space (x ~ [-20,20], y ~ [-30,30], z ~ [0,50])\n"
    "    vec3 lorenz_pos = pos * 5.0;\n"
    "    // Lorenz parameters\n"
    "    float sigma = 10.0;\n"
    "    float rho = 28.0;\n"
    "    float beta = 8.0 / 3.0;\n"
    "    float dt = 0.005;\n"
    "    // Lorenz differential equations\n"
    "    float dx = sigma * (lorenz_pos.y - lorenz_pos.x);\n"
    "    float dy = lorenz_pos.x * (rho - lorenz_pos.z) - lorenz_pos.y;\n"
    "    float dz = lorenz_pos.x * lorenz_pos.y - beta * lorenz_pos.z;\n"
    "    // Attract toward Lorenz trajectory\n"
    "    vec3 target = lorenz_pos + vec3(dx, dy, dz) * dt;\n"
    "    // Mix current position toward attractor (gentle pull)\n"
    "    vec3 new_pos = mix(lorenz_pos, target, 0.3);\n"
    "    P[id] = new_pos / 5.0;\n"
    "    Cd[id] = vec4(\n"
    "        clamp(new_pos.z / 50.0, 0.0, 1.0),\n"
    "        clamp(1.0 - abs(new_pos.x) / 20.0, 0.0, 1.0),\n"
    "        clamp(abs(new_pos.y) / 30.0, 0.0, 1.0),\n"
    "        1.0\n"
    "    );\n"
    "}\n"
)

# Base 04: Reaction-Diffusion (Gray-Scott simplified)
# Source: Gray & Scott (1983), Pearson (1993)
# Adapted: Simplified RD equations drive position oscillation
GLSL_RD = (
    "// Base 04: Reaction-Diffusion / Gray-Scott (adapted from Gray-Scott 1983)\n"
    "// Simplified Turing pattern: points oscillate based on RD-like equations\n"
    "uniform float u_time;\n"
    "\n"
    "void main() {\n"
    "    uint id = TDIndex();\n"
    "    vec3 pos = TDIn_P(0, id);\n"
    "    // Use position as RD grid coordinates\n"
    "    float x = pos.x;\n"
    "    float z = pos.z;\n"
    "    // Gray-Scott-like pattern: two competing waves\n"
    "    float u = 0.0;\n"
    "    float v = 0.0;\n"
    "    for (int oct = 1; oct <= 4; oct++) {\n"
    "        float f = float(oct);\n"
    "        u += sin(x * f * 1.5 + u_time * (0.5 + f * 0.2)) / f;\n"
    "        v += cos(z * f * 1.8 + u_time * (0.3 + f * 0.15)) / f;\n"
    "    }\n"
    "    u *= 0.3;\n"
    "    v *= 0.3;\n"
    "    // Displace based on RD pattern\n"
    "    float height = (u + v) * 0.5;\n"
    "    P[id] = pos + vec3(0.0, height, 0.0);\n"
    "    // Color based on activator/inhibitor\n"
    "    Cd[id] = vec4(\n"
    "        u * 0.5 + 0.5,\n"
    "        height * 0.5 + 0.5,\n"
    "        v * 0.5 + 0.5,\n"
    "        1.0\n"
    "    );\n"
    "}\n"
)

# Base 05: Fractal Brownian Motion (fBm) Terrain
# Source: The Book of Shaders — https://thebookofshaders.com/12/
# Adapted: Multi-octave fBm generates heightfield displacement
GLSL_FBM_TERRAIN = (
    "// Base 05: Fractal Brownian Motion Terrain (adapted from Book of Shaders Ch.12)\n"
    "// Multi-octave fBm generates heightfield-like displacement\n"
    "uniform float u_time;\n"
    "\n"
    "float fbm(vec2 p) {\n"
    "    float value = 0.0;\n"
    "    float amplitude = 0.5;\n"
    "    float frequency = 1.0;\n"
    "    // 6 octaves of noise\n"
    "    for (int i = 0; i < 6; i++) {\n"
    "        value += amplitude * TDSimplexNoise(vec4(p * frequency, u_time * 0.1, 0.0));\n"
    "        frequency *= 2.0;\n"
    "        amplitude *= 0.5;\n"
    "    }\n"
    "    return value;\n"
    "}\n"
    "\n"
    "void main() {\n"
    "    uint id = TDIndex();\n"
    "    vec3 pos = TDIn_P(0, id);\n"
    "    // fBm heightfield\n"
    "    float h = fbm(pos.xz * 1.5) * 0.6;\n"
    "    // Ridge noise for mountain peaks\n"
    "    float ridge = 1.0 - abs(TDSimplexNoise(vec4(pos.xz * 3.0, u_time * 0.05, 1.0)));\n"
    "    ridge = ridge * ridge * 0.3;\n"
    "    P[id] = pos + vec3(0.0, h + ridge, 0.0);\n"
    "    // Color: height-based gradient\n"
    "    float t = (h + ridge + 0.3) / 0.9;\n"
    "    vec3 low = vec3(0.1, 0.3, 0.1);  // green lowlands\n"
    "    vec3 mid = vec3(0.5, 0.4, 0.2);  // brown hills\n"
    "    vec3 high = vec3(0.9, 0.9, 0.95); // white peaks\n"
    "    vec3 col = t < 0.5 ? mix(low, mid, t * 2.0) : mix(mid, high, (t - 0.5) * 2.0);\n"
    "    Cd[id] = vec4(col, 1.0);\n"
    "}\n"
)


# ═══════════════════════════════════════════════════════════════════════════════
# System Definitions
# ═══════════════════════════════════════════════════════════════════════════════

SYSTEMS = [
    {
        "name": "base01_voronoi",
        "desc": "Voronoi Displacement (Inigo Quilez)",
        "source": "spherePOP",
        "source_params": {"radx": 2.0, "rady": 2.0, "rows": 20, "cols": 20},
        "glsl_type": "glsladvancedPOP",
        "shader": GLSL_VORONOI,
        "output_attr": "P",
    },
    {
        "name": "base02_curl",
        "desc": "Curl Noise Flow Field (Stam/Bridson)",
        "source": "boxPOP",
        "source_params": {"sizex": 3.0, "depth": 20},
        "glsl_type": "glslPOP",
        "shader": GLSL_CURL_NOISE,
        "output_attr": "P",
    },
    {
        "name": "base03_lorenz",
        "desc": "Lorenz Strange Attractor",
        "source": "spherePOP",
        "source_params": {"radx": 1.5, "rady": 1.5, "rows": 14, "cols": 14},
        "glsl_type": "glsladvancedPOP",
        "shader": GLSL_LORENZ,
        "output_attr": "P",
    },
    {
        "name": "base04_rd",
        "desc": "Reaction-Diffusion / Gray-Scott",
        "source": "gridPOP",
        "source_params": {"sizex": 4.0, "sizez": 4.0, "rows": 20, "cols": 20},
        "glsl_type": "glsladvancedPOP",
        "shader": GLSL_RD,
        "output_attr": "P",
    },
    {
        "name": "base05_fbm",
        "desc": "Fractal Brownian Motion Terrain",
        "source": "boxPOP",
        "source_params": {"sizex": 4.0, "depth": 24},
        "glsl_type": "glsladvancedPOP",
        "shader": GLSL_FBM_TERRAIN,
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
    """Create sandbox + all 5 web-shader base systems."""

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

    # Setup computedat
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

    # Wire: source → glsl → out
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
    print("  Web-Sourced GLSL POP Shaders — 5 Base COMP Systems")
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
