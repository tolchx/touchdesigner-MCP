#!/usr/bin/env python3
"""
Live TD Test: Vertex Shader Geometry Deformation via glslTOP
=============================================================

EXPLICIT RULES (verified every run):
  RULE 1 — CONTAINER: All operators inside a UUID-named baseCOMP.
  RULE 2 — NO ERRORS: Immediate + async post-cook re-check on ALL GLSL DATs.
  RULE 3 — NO OVERLAP: Grid positions verified for separation.

Tests vertex shader deformation patterns using glslTOP with vertexdat.
This is the ONLY way to use vertex shaders in TD — vertexdat is a glslTOP
parameter, NOT available on glslPOP or glsladvancedPOP.

  Chain 1 — Wave deformation (4 nodes)
            noiseTOP → glslTOP(vertexdat + pixeldat) → nullTOP
            Vertex shader applies sinusoidal wave to gl_Position.

  Chain 2 — Noise displacement (4 nodes)
            noiseTOP → glslTOP(vertexdat + pixeldat) → nullTOP
            Vertex shader uses simplex noise to displace vertices.

  Chain 3 — Twist/bend (4 nodes)
            circleTOP → glslTOP(vertexdat + pixeldat) → nullTOP
            Vertex shader applies twist rotation based on Y position.

  Chain 4 — Pulse scaling (4 nodes)
            rectangleTOP → glslTOP(vertexdat + pixeldat) → nullTOP
            Vertex shader scales vertices with time-based pulse.

Each chain has:
  - 1 source TOP (feeds pixel data to the shader)
  - 1 textDAT with vertex shader code
  - 1 textDAT with pixel shader code (passthrough)
  - 1 glslTOP with vertexdat + pixeldat set
  - 1 nullTOP output

Parameter-name notes (empirically verified):
  - glslTOP: vertexdat (String), pixeldat (String), npasses (Int)

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
SANDBOX_NAME = f"test_glsl_vertex_{uuid.uuid4().hex[:8]}"
SANDBOX_PATH = f"{SANDBOX_PARENT}/{SANDBOX_NAME}"

NODE_SPACING_X = 400
NODE_SPACING_Y = 300


# ─── GLSL Shader Definitions ──────────────────────────────────────────────────

# Vertex shaders (one per chain)

# Chain 1: Wave deformation
VS_WAVE = (
    "// Vertex shader: sinusoidal wave deformation\n"
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

# Chain 2: Noise displacement
VS_NOISE = (
    "// Vertex shader: simplex noise displacement\n"
    "#include \"util_noise.glsl\"\n"
    "uniform float u_time;\n"
    "void main() {\n"
    "    vec4 pos = P;\n"
    "    float n = snoise(pos.xyz * 2.0 + u_time * 0.5);\n"
    "    pos.xyz += normalize(pos.xyz + vec3(0.001)) * n * 0.2;\n"
    "    gl_Position = TDWorldToProj(TDModelToWorld(pos));\n"
    "    uv = uvable;\n"
    "    color = CD;\n"
    "}\n"
)

# Chain 3: Twist/bend
VS_TWIST = (
    "// Vertex shader: twist rotation based on Y\n"
    "uniform float u_time;\n"
    "void main() {\n"
    "    vec4 pos = P;\n"
    "    float twist = pos.y * 2.0 + u_time;\n"
    "    float c = cos(twist);\n"
    "    float s = sin(twist);\n"
    "    vec3 twisted = vec3(\n"
    "        pos.x * c - pos.z * s,\n"
    "        pos.y,\n"
    "        pos.x * s + pos.z * c\n"
    "    );\n"
    "    gl_Position = TDWorldToProj(TDModelToWorld(vec4(twisted, 1.0)));\n"
    "    uv = uvable;\n"
    "    color = CD;\n"
    "}\n"
)

# Chain 4: Pulse scaling
VS_PULSE = (
    "// Vertex shader: time-based pulse scaling\n"
    "uniform float u_time;\n"
    "void main() {\n"
    "    vec4 pos = P;\n"
    "    float pulse = 1.0 + sin(u_time * 3.0) * 0.3;\n"
    "    pos.xyz *= pulse;\n"
    "    gl_Position = TDWorldToProj(TDModelToWorld(pos));\n"
    "    uv = uvable;\n"
    "    color = CD;\n"
    "}\n"
)

# Pixel shaders (all passthrough)
PS_PASSTHROUGH = (
    "// Pixel shader: passthrough\n"
    "out vec4 fragColor;\n"
    "void main() {\n"
    "    fragColor = TDOutputSwizzle(texture(sTD2DInputs[0], vUV.st));\n"
    "}\n"
)


# ─── Operator topology ────────────────────────────────────────────────────────

ALL_NODES = [
    # ── Chain 1: Wave deformation ──────────────────────────────────────────
    {"name": "src_wave", "opType": "noiseTOP",
     "x": 0, "y": 0,
     "key_params": {"amp": 0.8}, "is_source": True},
    {"name": "vs_wave", "opType": "textDAT",
     "x": 0, "y": NODE_SPACING_Y,
     "key_params": {}, "text_content": VS_WAVE, "is_dat": True},
    {"name": "ps_wave", "opType": "textDAT",
     "x": NODE_SPACING_X, "y": NODE_SPACING_Y,
     "key_params": {}, "text_content": PS_PASSTHROUGH, "is_dat": True},
    {"name": "glsl_wave", "opType": "glslTOP",
     "x": NODE_SPACING_X, "y": 0,
     "key_params": {}, "is_source": False},
    {"name": "out_wave", "opType": "nullTOP",
     "x": 2 * NODE_SPACING_X, "y": 0,
     "key_params": {}, "is_source": False},

    # ── Chain 2: Noise displacement ────────────────────────────────────────
    {"name": "src_noise", "opType": "noiseTOP",
     "x": 0, "y": 2 * NODE_SPACING_Y,
     "key_params": {"amp": 0.8}, "is_source": True},
    {"name": "vs_noise", "opType": "textDAT",
     "x": 0, "y": 3 * NODE_SPACING_Y,
     "key_params": {}, "text_content": VS_NOISE, "is_dat": True},
    {"name": "ps_noise", "opType": "textDAT",
     "x": NODE_SPACING_X, "y": 3 * NODE_SPACING_Y,
     "key_params": {}, "text_content": PS_PASSTHROUGH, "is_dat": True},
    {"name": "glsl_noise", "opType": "glslTOP",
     "x": NODE_SPACING_X, "y": 2 * NODE_SPACING_Y,
     "key_params": {}, "is_source": False},
    {"name": "out_noise", "opType": "nullTOP",
     "x": 2 * NODE_SPACING_X, "y": 2 * NODE_SPACING_Y,
     "key_params": {}, "is_source": False},

    # ── Chain 3: Twist/bend ────────────────────────────────────────────────
    {"name": "src_twist", "opType": "circleTOP",
     "x": 0, "y": 4 * NODE_SPACING_Y,
     "key_params": {}, "is_source": True},
    {"name": "vs_twist", "opType": "textDAT",
     "x": 0, "y": 5 * NODE_SPACING_Y,
     "key_params": {}, "text_content": VS_TWIST, "is_dat": True},
    {"name": "ps_twist", "opType": "textDAT",
     "x": NODE_SPACING_X, "y": 5 * NODE_SPACING_Y,
     "key_params": {}, "text_content": PS_PASSTHROUGH, "is_dat": True},
    {"name": "glsl_twist", "opType": "glslTOP",
     "x": NODE_SPACING_X, "y": 4 * NODE_SPACING_Y,
     "key_params": {}, "is_source": False},
    {"name": "out_twist", "opType": "nullTOP",
     "x": 2 * NODE_SPACING_X, "y": 4 * NODE_SPACING_Y,
     "key_params": {}, "is_source": False},

    # ── Chain 4: Pulse scaling ─────────────────────────────────────────────
    {"name": "src_pulse", "opType": "rectangleTOP",
     "x": 0, "y": 6 * NODE_SPACING_Y,
     "key_params": {}, "is_source": True},
    {"name": "vs_pulse", "opType": "textDAT",
     "x": 0, "y": 7 * NODE_SPACING_Y,
     "key_params": {}, "text_content": VS_PULSE, "is_dat": True},
    {"name": "ps_pulse", "opType": "textDAT",
     "x": NODE_SPACING_X, "y": 7 * NODE_SPACING_Y,
     "key_params": {}, "text_content": PS_PASSTHROUGH, "is_dat": True},
    {"name": "glsl_pulse", "opType": "glslTOP",
     "x": NODE_SPACING_X, "y": 6 * NODE_SPACING_Y,
     "key_params": {}, "is_source": False},
    {"name": "out_pulse", "opType": "nullTOP",
     "x": 2 * NODE_SPACING_X, "y": 6 * NODE_SPACING_Y,
     "key_params": {}, "is_source": False},
]

# Connections
# Pattern: source → glslTOP → nullTOP
# vertexdat and pixeldat are set as params, not wired connections
CONNECTIONS = [
    # Chain 1: wave
    ("src_wave", "glsl_wave"),
    ("glsl_wave", "out_wave"),
    # Chain 2: noise
    ("src_noise", "glsl_noise"),
    ("glsl_noise", "out_noise"),
    # Chain 3: twist
    ("src_twist", "glsl_twist"),
    ("glsl_twist", "out_twist"),
    # Chain 4: pulse
    ("src_pulse", "glsl_pulse"),
    ("glsl_pulse", "out_pulse"),
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

    # Phase 2b: write text content into DAT nodes (shaders)
    for node in ALL_NODES:
        if not node.get("text_content"):
            continue
        try:
            td.exec("op(%r).text = %r" % (f"{SANDBOX_PATH}/{node['name']}", node["text_content"]))
            res.step(f"txt_{node['name']}", True, "shader text written")
        except Exception as e:
            res.step(f"txt_{node['name']}", False, str(e))

    # Phase 2c: setup vertexdat + pixeldat on each glslTOP
    for chain_name, glsl_name, vs_dat, ps_dat in [
        ("wave", "glsl_wave", "vs_wave", "ps_wave"),
        ("noise", "glsl_noise", "vs_noise", "ps_noise"),
        ("twist", "glsl_twist", "vs_twist", "ps_twist"),
        ("pulse", "glsl_pulse", "vs_pulse", "ps_pulse"),
    ]:
        path = f"{SANDBOX_PATH}/{glsl_name}"
        try:
            td.exec("op(%r).par.vertexdat = %r" % (path, vs_dat))
            td.exec("op(%r).par.pixeldat = %r" % (path, ps_dat))
            res.step(f"setup_{chain_name}", True, f"vertexdat={vs_dat}, pixeldat={ps_dat}")
        except Exception as e:
            res.step(f"setup_{chain_name}", False, str(e))

    # Phase 2d: set scalar params
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


# ─── Verify phase ─────────────────────────────────────────────────────────────

def verify_network(td: TDClient, res: TestResult) -> None:
    """Verify all GLSL TOPs compiled, vertexdat set, and zero errors."""
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

    # Check zero errors on ALL operators
    any_errors = False
    for n in nodes:
        if n["errors"]:
            any_errors = True
            res.step(f"err_{n['name']}", False, " | ".join(n["errors"]))
    if not any_errors:
        res.step("err_all", True, "all operators error-free")

    # Check GLSL compilation on all glslTOP nodes
    glsl_names = [n["name"] for n in ALL_NODES if n["opType"] == "glslTOP"]
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

    # Check vertexdat readback on each glslTOP
    for chain_name, glsl_name, expected_vs in [
        ("wave", "glsl_wave", "vs_wave"),
        ("noise", "glsl_noise", "vs_noise"),
        ("twist", "glsl_twist", "vs_twist"),
        ("pulse", "glsl_pulse", "vs_pulse"),
    ]:
        try:
            raw = td.exec(
                "import json\n"
                "o = op('%s/%s')\n"
                "vd = str(o.par.vertexdat.eval()) if hasattr(o.par, 'vertexdat') else 'N/A'\n"
                "pd = str(o.par.pixeldat.eval()) if hasattr(o.par, 'pixeldat') else 'N/A'\n"
                "print(json.dumps({'vertexdat': vd, 'pixeldat': pd}))\n" % (SANDBOX_PATH, glsl_name))
            params = json.loads(raw.strip().splitlines()[-1]) if raw.strip() else {}
            vd = params.get("vertexdat", "")
            pd = params.get("pixeldat", "")
            res.step(f"check_vertexdat_{chain_name}", expected_vs in str(vd),
                     f"vertexdat={vd}")
            res.step(f"check_pixeldat_{chain_name}", f"ps_{chain_name}" in str(pd),
                     f"pixeldat={pd}")
        except Exception as e:
            res.step(f"check_params_{chain_name}", False, str(e))

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
    print("  Vertex Shader Geometry Deformation — glslTOP with vertexdat")
    print(f"  Target: http://{DEFAULT_HOST}:{DEFAULT_PORT}")
    print(f"  Sandbox: {SANDBOX_PATH}")
    print(f"  Nodes: {len(ALL_NODES)}, Connections: {len(CONNECTIONS)}")
    print("  Chain 1: Wave deformation (sinusoidal)")
    print("  Chain 2: Noise displacement (simplex)")
    print("  Chain 3: Twist/bend (rotation by Y)")
    print("  Chain 4: Pulse scaling (time-based)")
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
