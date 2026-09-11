#!/usr/bin/env python3
"""
Live TD Test: GLSL Shader Showcase — 8 Shader Types
=====================================================

Tests the full GLSL POP shader pipeline against a live TouchDesigner instance
(port 44444). Covers:

  1. Sin Wave — basic sinusoidal displacement
  2. Waves — multi-frequency wave deformation with twist
  3. Movement — orbital movement + breathing scale
  4. Explosion — radial explosion + spiral rotation
  5. Fountain — particle fountain (position-only)
  6. Spiral Points — spiral distribution with HSB coloring
  7. Color by Position — maps XYZ to RGB
  8. Fractal Displacement — Julia set fractal on particle positions

References:
  - https://fullscreencode.com/ejemplosshaders/
  - https://derivative.ca/UserGuide/GLSL_POP
  - https://docs.derivative.ca/GLSL_POP

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
SANDBOX_NAME = f"glsl_showcase_{uuid.uuid4().hex[:8]}"
SANDBOX_PATH = f"{SANDBOX_PARENT}/{SANDBOX_NAME}"

NODE_SPACING_X = 500
NODE_SPACING_Y = 400

# ─── GLSL Shader Definitions ─────────────────────────────────────────────────
# spherePOP empirically verified params (from test_live_td_sphere_transform_trail.py):
#   radx, rady (Float), rows, cols (Int), freq (Int)
# NOT: columns, radius (those don't exist)

SHADERS = [
    {
        "name": "sin_wave",
        "desc": "Basic sinusoidal displacement on Y axis",
        "source": (
            "uniform float u_time;\n"
            "void main() {\n"
            "    uint id = TDIndex();\n"
            "    if (id >= TDNumElements()) return;\n"
            "    vec3 pos = TDIn_P(0, id);\n"
            "    float t = float(id) / float(TDNumElements() - 1);\n"
            "    float wave = sin(t * 10.0 + u_time) * 0.5;\n"
            "    wave += sin(t * 20.0 - u_time * 1.5) * 0.15;\n"
            "    wave += sin(t * 5.0 + u_time * 0.7) * 0.25;\n"
            "    pos.y = wave;\n"
            "    P[id] = pos;\n"
            "    Cd[id] = vec4(wave * 0.5 + 0.5, t, 1.0 - t, 1.0);\n"
            "}\n"
        ),
        "src_type": "boxPOP",
        "src_params": {"sizex": 2.0, "sizey": 0.01, "sizez": 0.01, "depth": 8},
        "outputattrs": "P Cd",
    },
    {
        "name": "waves",
        "desc": "Multi-frequency wave deformation with twist",
        "source": (
            "uniform float u_time;\n"
            "void main() {\n"
            "    uint id = TDIndex();\n"
            "    if (id >= TDNumElements()) return;\n"
            "    vec3 p = TDIn_P(0, id);\n"
            "    float w1 = sin(p.x * 1.5 + u_time * 1.2) * 0.4;\n"
            "    float w2 = cos(p.z * 2.0 + u_time * 0.8) * 0.3;\n"
            "    float w3 = sin((p.x + p.z) * 1.0 + u_time * 2.5) * 0.2;\n"
            "    p.y += w1 + w2 + w3;\n"
            "    float twist = sin(p.y * 0.5 + u_time) * 0.3;\n"
            "    float ct = cos(twist), st = sin(twist);\n"
            "    p.xz = mat2(ct, -st, st, ct) * p.xz;\n"
            "    P[id] = p;\n"
            "}\n"
        ),
        "src_type": "boxPOP",
        "src_params": {"sizex": 2.0, "sizey": 0.01, "sizez": 2.0, "depth": 6},
        "outputattrs": "P",
    },
    {
        "name": "movement",
        "desc": "Orbital movement around Y axis + breathing scale",
        "source": (
            "uniform float u_time;\n"
            "void main() {\n"
            "    uint id = TDIndex();\n"
            "    if (id >= TDNumElements()) return;\n"
            "    vec3 p = TDIn_P(0, id);\n"
            "    float speed = u_time * 0.5;\n"
            "    float angle = atan(p.z, p.x) + speed;\n"
            "    float rad = length(p.xz);\n"
            "    p.x = cos(angle) * rad;\n"
            "    p.z = sin(angle) * rad;\n"
            "    float breathe = 1.0 + sin(u_time * 1.5 + p.y * 0.5) * 0.15;\n"
            "    p *= breathe;\n"
            "    p.y += sin(p.x * 3.0 + u_time * 2.0) * 0.2;\n"
            "    P[id] = p;\n"
            "}\n"
        ),
        "src_type": "boxPOP",
        "src_params": {"sizex": 1.0, "sizey": 1.0, "sizez": 1.0, "depth": 6},
        "outputattrs": "P",
    },
    {
        "name": "explosion",
        "desc": "Radial explosion + spiral rotation",
        "source": (
            "uniform float u_time;\n"
            "void main() {\n"
            "    uint id = TDIndex();\n"
            "    if (id >= TDNumElements()) return;\n"
            "    vec3 p = TDIn_P(0, id);\n"
            "    float dist = length(p);\n"
            "    float force = sin(u_time * 1.5) * 0.5 + 0.5;\n"
            "    vec3 dir = normalize(p + 0.001);\n"
            "    float push = force * 2.0 + sin(dist * 2.0 - u_time * 3.0) * 0.3;\n"
            "    p += dir * push;\n"
            "    float a = u_time * 0.5 + dist * 0.3;\n"
            "    float ct = cos(a), st = sin(a);\n"
            "    p.xz = mat2(ct, -st, st, ct) * p.xz;\n"
            "    P[id] = p;\n"
            "}\n"
        ),
        "src_type": "spherePOP",
        # Empirically verified: radx/rady (Float), rows/cols (Int), freq (Int)
        "src_params": {"radx": 1.0, "rady": 1.0, "rows": 15, "cols": 15},
        "outputattrs": "P",
    },
    {
        "name": "fountain",
        "desc": "Particle fountain — position generated from index + time",
        "source": (
            "uniform float u_time;\n"
            "void main() {\n"
            "    uint id = TDIndex();\n"
            "    if (id >= TDNumElements()) return;\n"
            "    float a = float(id) * 0.05 + u_time * 2.0;\n"
            "    float r = 0.5 + sin(float(id) * 0.3 + u_time) * 0.3;\n"
            "    float x = cos(a) * r * (1.0 + sin(u_time * 0.7) * 0.3);\n"
            "    float z = sin(a) * r * (1.0 + cos(u_time * 0.5) * 0.3);\n"
            "    float y = 2.0 + sin(float(id) * 0.1 + u_time * 1.5) * 1.5\n"
            "             - abs(sin(u_time * 0.3)) * 3.0;\n"
            "    P[id] = vec3(x, y + 2.0, z);\n"
            "    Cd[id] = vec4(y * 0.2 + 0.5, 0.8, 1.0 - y * 0.15, 1.0);\n"
            "}\n"
        ),
        "src_type": "boxPOP",
        "src_params": {"sizex": 0.01, "sizey": 0.01, "sizez": 0.01, "depth": 1},
        "outputattrs": "P Cd",
    },
    {
        "name": "spiral",
        "desc": "Spiral distribution with HSB coloring",
        "source": (
            "#define PI 3.14159265359\n"
            "#define TAU 6.28318530718\n"
            "uniform float u_time;\n"
            "vec3 hsb2rgb(vec3 c) {\n"
            "    vec3 rgb = clamp(abs(mod(c.x*6.0+vec3(0.0,4.0,2.0),6.0)-3.0)-1.0,0.0,1.0);\n"
            "    rgb = rgb*rgb*(3.0-2.0*rgb);\n"
            "    return c.z*mix(vec3(1.0),rgb,c.y);\n"
            "}\n"
            "void main() {\n"
            "    uint id = TDIndex();\n"
            "    if (id >= TDNumElements()) return;\n"
            "    float t = float(id) / float(TDNumElements() - 1);\n"
            "    float turns = 5.0;\n"
            "    float angle = t * turns * TAU + u_time;\n"
            "    float radius = t * 2.0 + sin(t * 30.0 + u_time * 2.0) * 0.1;\n"
            "    vec3 pos;\n"
            "    pos.x = cos(angle) * radius;\n"
            "    pos.y = sin(angle) * radius;\n"
            "    pos.z = t * 2.0 - 1.0;\n"
            "    P[id] = pos;\n"
            "    Cd[id] = vec4(hsb2rgb(vec3(t, 0.7, 0.9)), 1.0);\n"
            "}\n"
        ),
        "src_type": "boxPOP",
        "src_params": {"sizex": 0.01, "sizey": 0.01, "sizez": 0.01, "depth": 1},
        "outputattrs": "P Cd",
    },
    {
        "name": "color_pos",
        "desc": "Maps XYZ position to RGB color",
        "source": (
            "void main() {\n"
            "    uint id = TDIndex();\n"
            "    if (id >= TDNumElements()) return;\n"
            "    vec3 pos = TDIn_P(0, id);\n"
            "    Cd[id] = vec4(pos.x * 0.25 + 0.5, pos.y * 0.25 + 0.5, pos.z * 0.25 + 0.5, 1.0);\n"
            "}\n"
        ),
        "src_type": "boxPOP",
        "src_params": {"sizex": 2.0, "sizey": 2.0, "sizez": 2.0, "depth": 6},
        "outputattrs": "P Cd",
    },
    {
        "name": "fractal",
        "desc": "Julia set fractal displacement on particle positions",
        "source": (
            "uniform float u_time;\n"
            "vec3 hsb2rgb(vec3 c) {\n"
            "    vec3 rgb = clamp(abs(mod(c.x*6.0+vec3(0.0,4.0,2.0),6.0)-3.0)-1.0,0.0,1.0);\n"
            "    rgb = rgb*rgb*(3.0-2.0*rgb);\n"
            "    return c.z*mix(vec3(1.0),rgb,c.y);\n"
            "}\n"
            "void main() {\n"
            "    uint id = TDIndex();\n"
            "    if (id >= TDNumElements()) return;\n"
            "    vec3 pos = TDIn_P(0, id);\n"
            "    vec2 c = pos.xy * 1.5;\n"
            "    vec2 z = vec2(0.0);\n"
            "    vec2 juliaC = vec2(\n"
            "        -0.7 + sin(u_time * 0.2) * 0.1,\n"
            "         0.27015 + cos(u_time * 0.3) * 0.1\n"
            "    );\n"
            "    float iter = 0.0;\n"
            "    for (int i = 0; i < 20; i++) {\n"
            "        z = vec2(z.x*z.x - z.y*z.y, 2.0*z.x*z.y) + juliaC;\n"
            "        if (dot(z, z) > 4.0) break;\n"
            "        iter += 1.0;\n"
            "    }\n"
            "    float t = iter / 20.0;\n"
            "    pos.z += t * 2.0 - 1.0;\n"
            "    P[id] = pos;\n"
            "    Cd[id] = vec4(hsb2rgb(vec3(t + u_time * 0.1, 0.8, 0.9)), 1.0);\n"
            "}\n"
        ),
        "src_type": "spherePOP",
        "src_params": {"radx": 1.5, "rady": 1.5, "rows": 12, "cols": 12},
        "outputattrs": "P Cd",
    },
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


# ─── Test result collector ────────────────────────────────────────────────────


class TestResult:
    def __init__(self):
        self.steps: list[dict] = []
        self.failures: list[str] = []

    def step(self, name: str, ok: bool, detail: str = "") -> None:
        self.steps.append({"name": name, "ok": ok, "detail": detail})
        status = "[PASS]" if ok else "[FAIL]"
        msg = f"  {status} {name}"
        if detail:
            msg += f" — {detail}"
        print(msg)
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
    """Build the complete GLSL showcase network."""

    # Phase 1: Create sandbox container
    try:
        td.exec("op(%r).create(baseCOMP, %r)" % (SANDBOX_PARENT, SANDBOX_NAME))
        td.exec("op(%r).nodeX = 0; op(%r).nodeY = 0" % (SANDBOX_PATH, SANDBOX_PATH))
        res.step("sandbox_create", True, SANDBOX_PATH)
    except Exception as e:
        res.step("sandbox_create", False, str(e))
        return False

    # Phase 2: Create all nodes
    created = {}
    for i, shader in enumerate(SHADERS):
        name = shader["name"]
        src_name = f"src_{name}"
        dat_name = f"code_{name}"
        glsl_name = f"glsl_{name}"
        out_name = f"out_{name}"
        y = i * NODE_SPACING_Y

        # 2a: Create source POP + set params
        try:
            td.exec("op(%r).create(%s, %r)" % (SANDBOX_PATH, shader["src_type"], src_name))
            td.exec("op(%r).nodeX = %d; op(%r).nodeY = %d" % (
                f"{SANDBOX_PATH}/{src_name}", -3 * NODE_SPACING_X,
                f"{SANDBOX_PATH}/{src_name}", y))
            # Set source params batched
            param_lines = []
            for pname, pval in shader["src_params"].items():
                param_lines.append("op(%r).par.%s = %s" % (
                    f"{SANDBOX_PATH}/{src_name}", pname, _py_repr(pval)))
            if param_lines:
                td.exec("; ".join(param_lines))
            created[src_name] = f"{SANDBOX_PATH}/{src_name}"
            res.step(f"{name}_src", True, shader["src_type"])
        except Exception as e:
            res.step(f"{name}_src", False, str(e))
            continue

        # 2b: Create code DAT
        try:
            td.exec("op(%r).create(textDAT, %r)" % (SANDBOX_PATH, dat_name))
            td.exec("op(%r).text = %r" % (
                f"{SANDBOX_PATH}/{dat_name}", shader["source"]))
            td.exec("op(%r).nodeX = %d; op(%r).nodeY = %d" % (
                f"{SANDBOX_PATH}/{dat_name}", -2 * NODE_SPACING_X,
                f"{SANDBOX_PATH}/{dat_name}", y + 100))
            created[dat_name] = f"{SANDBOX_PATH}/{dat_name}"
            res.step(f"{name}_dat", True, "textDAT")
        except Exception as e:
            res.step(f"{name}_dat", False, str(e))
            continue

        # 2c: Create glslPOP + IMMEDIATELY set computedat
        try:
            td.exec("op(%r).create(glslPOP, %r)" % (SANDBOX_PATH, glsl_name))
            td.exec("op(%r).par.computedat = %r" % (
                f"{SANDBOX_PATH}/{glsl_name}", dat_name))
            td.exec("op(%r).par.outputattrs = %r" % (
                f"{SANDBOX_PATH}/{glsl_name}", shader["outputattrs"]))
            td.exec("op(%r).par.numelems = 500" % (f"{SANDBOX_PATH}/{glsl_name}"))
            td.exec("op(%r).nodeX = %d; op(%r).nodeY = %d" % (
                f"{SANDBOX_PATH}/{glsl_name}", -1 * NODE_SPACING_X,
                f"{SANDBOX_PATH}/{glsl_name}", y))
            created[glsl_name] = f"{SANDBOX_PATH}/{glsl_name}"
            res.step(f"{name}_glsl", True, "glslPOP")
        except Exception as e:
            res.step(f"{name}_glsl", False, str(e))
            continue

        # 2d: Create nullPOP output
        try:
            td.exec("op(%r).create(nullPOP, %r)" % (SANDBOX_PATH, out_name))
            td.exec("op(%r).nodeX = %d; op(%r).nodeY = %d" % (
                f"{SANDBOX_PATH}/{out_name}", 0,
                f"{SANDBOX_PATH}/{out_name}", y))
            created[out_name] = f"{SANDBOX_PATH}/{out_name}"
            res.step(f"{name}_out", True, "nullPOP")
        except Exception as e:
            res.step(f"{name}_out", False, str(e))
            continue

    total_nodes = len(SHADERS) * 4
    res.step("nodes_created", len(created) == total_nodes,
             f"{len(created)}/{total_nodes} nodes")
    if len(created) < total_nodes:
        print("  [WARN] continuing with partial network")

    # Phase 3: Wire connections
    wired = 0
    wire_expected = 0
    for shader in SHADERS:
        name = shader["name"]
        src_key = f"src_{name}"
        glsl_key = f"glsl_{name}"
        out_key = f"out_{name}"
        wire_expected += 2
        if src_key not in created or glsl_key not in created or out_key not in created:
            continue
        try:
            td.exec("op(%r).outputConnectors[0].connect(op(%r))" % (
                created[src_key], created[glsl_key]))
            td.exec("op(%r).outputConnectors[0].connect(op(%r))" % (
                created[glsl_key], created[out_key]))
            wired += 2
        except Exception as e:
            res.step(f"wire_{name}", False, str(e))

    res.step("wires", wired == wire_expected, f"{wired}/{wire_expected} connections")
    return True


# ─── Verify phase ─────────────────────────────────────────────────────────────


def verify_network(td: TDClient, res: TestResult) -> None:
    """Verify all GLSL shaders compiled and are wired correctly."""
    time.sleep(1.5)

    # Inspect all children in one batched call
    inspect_code = (
        "import json\n"
        "c = op(%r)\n"
        "out = {'nodes': []}\n"
        "if c is not None:\n"
        "    for n in c.findChildren():\n"
        "        info = {'name': n.name,\n"
        "                'opType': getattr(n, 'OPType', '?'),\n"
        "                'errors': list(n.errors()) if n.errors() else [],\n"
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

    # ── Check all expected operators exist with correct opType ──
    expected_ops = {
        f"src_{s['name']}": s["src_type"] for s in SHADERS
    }
    expected_ops.update({f"code_{s['name']}": "textDAT" for s in SHADERS})
    expected_ops.update({f"glsl_{s['name']}": "glslPOP" for s in SHADERS})
    expected_ops.update({f"out_{s['name']}": "nullPOP" for s in SHADERS})

    present = 0
    for op_name, expected_type in expected_ops.items():
        n = by_name.get(op_name)
        if n is None:
            res.step(f"exists_{op_name}", False, "not found")
        else:
            ok = n["opType"] == expected_type
            if ok:
                present += 1
            res.step(f"exists_{op_name}", ok,
                     f"{n['opType']}" + ("" if ok else f" (expected {expected_type})"))
    res.step("all_ops_exist", present == len(expected_ops),
             f"{present}/{len(expected_ops)} operators verified")

    # ── Check zero errors ──
    any_errors = False
    for n in nodes:
        if n["errors"]:
            any_errors = True
            res.step(f"err_{n['name']}", False, f"{' | '.join(n['errors'][:3])}")
    if not any_errors:
        res.step("zero_errors", True, "all operators error-free")

    # ── Check glslPOP connections (src → glsl → null) and outputattrs ──
    for shader in SHADERS:
        name = shader["name"]
        glsl_key = f"glsl_{name}"
        src_key = f"src_{name}"
        out_key = f"out_{name}"
        gn = by_name.get(glsl_key)
        if gn is None:
            continue

        # Check outputattrs on glslPOP
        oa_check_code = (
            "import json\n"
            "o = op('%s/%s')\n"
            "oa = str(o.par.outputattrs.eval()) if hasattr(o.par, 'outputattrs') else 'N/A'\n"
            "ct = str(o.par.computedat.eval()) if hasattr(o.par, 'computedat') else 'N/A'\n"
            "print(json.dumps({'outputattrs': oa, 'computedat': ct}))\n"
        ) % (SANDBOX_PATH, glsl_key)
        try:
            raw = td.exec(oa_check_code)
            params = json.loads(raw.strip().splitlines()[-1]) if raw.strip() else {}
            oa_val = params.get("outputattrs", "")
            ct_val = params.get("computedat", "")
            expected_oa = shader["outputattrs"]
            oa_ok = expected_oa in oa_val
            res.step(f"oa_{name}", oa_ok,
                     f"outputattrs={oa_val}" + ("" if oa_ok else f" (expected {expected_oa})"))
            ct_ok = f"code_{name}" in ct_val
            res.step(f"ct_{name}", ct_ok,
                     f"computedat={ct_val}" + ("" if ct_ok else f" (expected code_{name})"))
        except Exception as e:
            res.step(f"params_{name}", False, str(e))

        # Check src → glsl wiring
        src_path = f"{SANDBOX_PATH}/{src_key}"
        inputs = gn.get("inputs", [])
        flat = [owner for inp in inputs for owner in inp]
        connected_to_src = any(src_path in f for f in flat)
        res.step(f"wire_{name}", connected_to_src,
                 "src→glsl wired" if connected_to_src else f"inputs={flat}")

    # ── /verify endpoint ──
    try:
        v = td.get_json(f"/verify?path={SANDBOX_PATH}")
        healthy = bool(v.get("healthy", False))
        err_cnt = int(v.get("error_count", -1))
        op_cnt = int(v.get("operator_count", 0))
        conn_cnt = int(v.get("connectionCount", 0))
        res.step("verify_endpoint", healthy and err_cnt == 0,
                 f"healthy={healthy} errors={err_cnt} ops={op_cnt} conns={conn_cnt}")
    except Exception as e:
        res.step("verify_endpoint", False, str(e))

    # ── RULE 2: async GLSL re-check ──
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
        res.step("cleanup", gone == "GONE",
                 "destroyed" if gone == "GONE" else "still present")
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

    print("=" * 60)
    print("  GLSL Shader Showcase — 8 Shaders × Live TouchDesigner")
    print(f"  Target: http://{DEFAULT_HOST}:{DEFAULT_PORT}")
    print(f"  Sandbox: {SANDBOX_PATH}")
    print(f"  Shaders: {len(SHADERS)}")
    print("=" * 60)
    print()

    if not td.ping():
        print("ERROR: Cannot reach TouchDesigner HTTP API.")
        print("Make sure TouchDesigner is running with the HTTP API on port 44444.")
        return 2

    info = td.get_json("/info")
    print(f"Connected: {info.get('version', '?')} @ {info.get('projectFPS', '?')} FPS\n")

    print("--- Build phase ---")
    if not build_network(td, res):
        print("\nBuild failed. Aborting verify.")
        return 1

    print("\n--- Verify phase ---")
    verify_network(td, res)

    print("\n--- Cleanup ---")
    cleanup(td, res)

    print(f"\n{'=' * 60}")
    print(f"  Results: {res.pass_count}/{res.total} passed, {len(res.failures)} failed")
    print(f"{'=' * 60}")

    if not res.passed:
        print("\nFailed checks:")
        for f in res.failures:
            print(f"  - {f}")

    return 1 if res.failures else 0


if __name__ == "__main__":
    sys.exit(main())
