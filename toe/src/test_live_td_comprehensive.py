#!/usr/bin/env python3
"""
Comprehensive Live TD Integration Test — All Operator Families
=============================================================

Exercises the live TouchDesigner HTTP API (port 44444) to create, wire,
verify, and clean up operator networks across ALL 7 families inside an
isolated sandbox container. It NEVER touches existing /project1 operators.

Networks built:
  - COMP: containerCOMP (parent sandbox)
  - TOP: noiseTOP → blurTOP → compositeTOP
  - CHOP: noiseCHOP
  - SOP: sphereSOP
  - DAT: textDAT (write shader code, read back)
  - MAT: constantMAT
  - POP: boxPOP → noisePOP → particlePOP → nullPOP
  - GLSL TOP: noiseTOP + textDAT(glsl code) + glslTOP
  - GLSL POP: boxPOP + textDAT(compute code) + glslPOP

Verification:
  - Every operator has zero TD runtime errors
  - All connections wired correctly (source feeds target input 0)
  - Grid layout has NO overlapping nodes
  - /verify endpoint confirms network health

Exit code 0 = pass, non-zero = fail. Safe to re-run.

Usage:
    python toe/src/test_live_td_comprehensive.py
    python toe/src/test_live_td_comprehensive.py --host 127.0.0.1 --port 44444
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.request
import uuid

# ─── Configuration ──────────────────────────────────────────────────────────

DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 44444
DEFAULT_TIMEOUT = 30  # seconds per HTTP call

SANDBOX_PARENT = "/project1"
# Use a unique name to avoid collisions on re-runs within the same session
SANDBOX_NAME = f"test_comprehensive_{uuid.uuid4().hex[:8]}"
SANDBOX_PATH = f"{SANDBOX_PARENT}/{SANDBOX_NAME}"

NODE_SPACING_X = 350
NODE_SPACING_Y = 200

# ─── Operator Definitions ──────────────────────────────────────────────────

# COMP: sandbox container (created by script, listed here for reference)
# Handled specially: the sandbox IS a containerCOMP

# TOP chain: noise → blur → composite
TOP_NETWORK = [
    {
        "name": "noise_top",
        "opType": "noiseTOP",
        "label": "Noise Source",
        "x": -2 * NODE_SPACING_X,
        "y": 0,
        "key_params": {"amp": 0.8},
        "is_source": True,
    },
    {
        "name": "blur_top",
        "opType": "blurTOP",
        "label": "Blur",
        "x": -1 * NODE_SPACING_X,
        "y": 0,
        "key_params": {},
        "is_source": False,
    },
    {
        "name": "composite_top",
        "opType": "compositeTOP",
        "label": "Composite Out",
        "x": 0,
        "y": 0,
        "key_params": {},
        "is_source": False,
    },
]

# compositeTOP has multiple inputs: input 0 = background, input 1 = foreground
# Wire noise_top → composite input 0 (bg), blur_top → composite input 1 (fg)
TOP_CONNECTIONS_WITH_INDEX = [
    ("noise_top", "blur_top"),                    # noise → blur (standard chain)
    ("noise_top", "composite_top", 0),             # noise → composite input 0 (bg)
    ("blur_top", "composite_top", 1),              # blur → composite input 1 (fg)
]

# CHOP: standalone noise
CHOP_NODES = [
    {
        "name": "noise_chop",
        "opType": "noiseCHOP",
        "label": "Noise CHOP",
        "x": -2 * NODE_SPACING_X,
        "y": -NODE_SPACING_Y,
        "key_params": {"amp": 1.0},
        "is_source": True,
    },
]

# SOP: standalone sphere
SOP_NODES = [
    {
        "name": "sphere_sop",
        "opType": "sphereSOP",
        "label": "Sphere",
        "x": -2 * NODE_SPACING_X,
        "y": -2 * NODE_SPACING_Y,
        "key_params": {"tx": 0.0, "ty": 0.0, "tz": 0.0, "rx": 0.0},
        "is_source": True,
    },
]

# DAT: text DAT
DAT_NODES = [
    {
        "name": "code_dat",
        "opType": "textDAT",
        "label": "Code",
        "x": -2 * NODE_SPACING_X,
        "y": -3 * NODE_SPACING_Y,
        "key_params": {},
        "text_content": "# TouchDesigner test code\nprint('Hello from DAT!')\n",
        "is_source": True,
    },
]

# MAT: constant material
MAT_NODES = [
    {
        "name": "const_mat",
        "opType": "constantMAT",
        "label": "Material",
        "x": -2 * NODE_SPACING_X,
        "y": -4 * NODE_SPACING_Y,
        "key_params": {"colorr": 0.2, "colorg": 0.6, "colorb": 1.0},
        "is_source": True,
    },
]

# POP chain: box → noise → particle → null
POP_NETWORK = [
    {
        "name": "pop_box",
        "opType": "boxPOP",
        "label": "Box POP Source",
        "x": -1 * NODE_SPACING_X,
        "y": NODE_SPACING_Y,
        "key_params": {"sizex": 1.5, "depth": 6},
        "is_source": True,
    },
    {
        "name": "pop_noise",
        "opType": "noisePOP",
        "label": "Noise Deform",
        "x": 0,
        "y": NODE_SPACING_Y,
        "key_params": {"amp0": 0.4, "noisesize": 1.5},
        "is_source": False,
    },
    {
        "name": "pop_particles",
        "opType": "particlePOP",
        "label": "Particle Solver",
        "x": NODE_SPACING_X,
        "y": NODE_SPACING_Y,
        "key_params": {"birthrate": 80, "life": 2.5, "maxparticles": 400},
        "is_source": False,
    },
    {
        "name": "pop_out",
        "opType": "nullPOP",
        "label": "POP Output",
        "x": 2 * NODE_SPACING_X,
        "y": NODE_SPACING_Y,
        "key_params": {},
        "is_source": False,
    },
]

POP_CONNECTIONS = [
    ("pop_box", "pop_noise"),
    ("pop_noise", "pop_particles"),
    ("pop_particles", "pop_out"),
]

# GLSL TOP: noise source → shader code DAT → glslTOP
GLSL_TOP_NODES = [
    {
        "name": "glsl_top_source",
        "opType": "noiseTOP",
        "label": "GLSL Input",
        "x": -1 * NODE_SPACING_X,
        "y": -NODE_SPACING_Y,
        "key_params": {"amp": 0.6},
        "is_source": True,
    },
    {
        "name": "glsl_top_code",
        "opType": "textDAT",
        "label": "GLSL Code",
        "x": 0,
        "y": -NODE_SPACING_Y - 200,
        "key_params": {},
        "text_content": (
            "out vec4 fragColor;\n"
            "void main() {\n"
            "    vec4 src = texture(sTD2DInputs[0], vUV.st);\n"
            "    float gray = dot(src.rgb, vec3(0.299, 0.587, 0.114));\n"
            "    float thresh = 0.3;\n"
            "    vec4 bw = vec4(vec3(gray > thresh ? 1.0 : 0.0), 1.0);\n"
            "    fragColor = bw;\n"
            "}\n"
        ),
        "is_source": False,
    },
    {
        "name": "glsl_top_out",
        "opType": "glslTOP",
        "label": "GLSL Out",
        "x": NODE_SPACING_X,
        "y": -NODE_SPACING_Y,
        "key_params": {},
        # computedat set separately
        "is_source": False,
    },
]

GLSL_TOP_CONNECTIONS = [
    ("glsl_top_source", "glsl_top_out"),
]

# GLSL POP: boxPOP source → shader code DAT → glslPOP
GLSL_POP_NODES = [
    {
        "name": "glsl_pop_source",
        "opType": "boxPOP",
        "label": "GLSL POP Source",
        "x": -1 * NODE_SPACING_X,
        "y": 2 * NODE_SPACING_Y,
        "key_params": {"sizex": 1.5, "depth": 4},
        "is_source": True,
    },
    {
        "name": "glsl_pop_code",
        "opType": "textDAT",
        "label": "GLSL POP Code",
        "x": 0,
        "y": 2 * NODE_SPACING_Y + 100,
        "key_params": {},
        "text_content": (
            "uniform float u_time;\n"
            "void main() {\n"
            "    int id = TDIndex();\n"
            "    float t = float(id) * 0.001;\n"
            "    P[id] = TDIn_P(0, id) * (1.0 + sin(u_time + t) * 0.05);\n"
            "}\n"
        ),
        "is_source": False,
    },
    {
        "name": "glsl_pop_out",
        "opType": "glslPOP",
        "label": "GLSL POP Out",
        "x": NODE_SPACING_X,
        "y": 2 * NODE_SPACING_Y,
        "key_params": {},
        # computedat + outputattrs set separately
        "is_source": False,
    },
]

GLSL_POP_CONNECTIONS = [
    ("glsl_pop_source", "glsl_pop_out"),
]


# ─── HTTP helper ─────────────────────────────────────────────────────────────


class TDClient:
    """Minimal urllib-based client for the TouchDesigner HTTP API."""

    def __init__(self, host: str, port: int, timeout: int = DEFAULT_TIMEOUT):
        self.base = f"http://{host}:{port}"
        self.timeout = timeout

    def exec(self, code: str) -> str:
        """POST code to /exec. Returns stdout output string. Raises on error."""
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
        """GET a JSON endpoint (e.g. /verify?path=...)."""
        url = f"{self.base}{path}"
        with urllib.request.urlopen(url, timeout=self.timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))

    def ping(self) -> bool:
        """Return True if the TD server responds to /info."""
        try:
            self.get_json("/info")
            return True
        except Exception:
            return False


# ─── Test harness ────────────────────────────────────────────────────────────


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


def _py_repr(value) -> str:
    """Render a Python value for embedding in generated TD code."""
    if isinstance(value, bool):
        return "True" if value else "False"
    if isinstance(value, (int, float)):
        return repr(value)
    return repr(str(value))


# ─── Build phase ────────────────────────────────────────────────────────────


def create_sandbox(td: TDClient, res: TestResult) -> bool:
    """Create the sandbox container. Returns True on success."""
    # Clean any stale first
    try:
        td.exec("c = op(%r); c.destroy() if c is not None else None" % SANDBOX_PATH)
    except Exception:
        pass  # ignore cleanup failures here

    try:
        td.exec("op(%r).create(baseCOMP, %r)" % (SANDBOX_PARENT, SANDBOX_NAME))
        res.step("create_sandbox", True, f"created {SANDBOX_PATH}")
        return True
    except Exception as e:
        res.step("create_sandbox", False, str(e))
        return False


def _create_nodes(td: TDClient, res: TestResult, prefix: str, network: list[dict]) -> dict:
    """Create a list of operator nodes inside the sandbox. Returns name→info map."""
    created: dict[str, dict] = {}
    for node in network:
        path = f"{SANDBOX_PATH}/{node['name']}"
        try:
            td.exec("op(%r).create(%s, %r)" % (SANDBOX_PATH, node["opType"], node["name"]))

            # Set text content for DAT nodes
            text_content = node.get("text_content")
            if text_content:
                td.exec("op(%r).text = %r" % (path, text_content))

            created[node["name"]] = {**node, "path": path}
            res.step(
                f"{prefix}_create_{node['name']}",
                True,
                f"{node['opType']} @ {path}",
            )
        except Exception as e:
            res.step(f"{prefix}_create_{node['name']}", False, str(e))

    total_expected = len(network)
    total_created = len(created)
    res.step(
        f"{prefix}_create_all",
        total_created == total_expected,
        f"created {total_created}/{total_expected} operators",
    )
    return created


def _set_params(td: TDClient, res: TestResult, prefix: str, network: list[dict], created: dict[str, dict]) -> None:
    """Set key_params on each created node."""
    for node in network:
        if not node["key_params"]:
            continue
        failures = []
        for pname, pval in node["key_params"].items():
            try:
                td.exec("op(%r).par.%s = %s" % (f"{SANDBOX_PATH}/{node['name']}", pname, _py_repr(pval)))
            except Exception as e:
                failures.append(f"{pname}: {e}")
        if failures:
            res.step(
                f"{prefix}_params_{node['name']}",
                False,
                "; ".join(failures),
            )
        else:
            res.step(
                f"{prefix}_params_{node['name']}",
                True,
                f"set {len(node['key_params'])} param(s)",
            )


def _wire_connections(
    td: TDClient, res: TestResult, prefix: str,
    connections: list[tuple], created: dict[str, dict],
) -> None:
    """Wire connections in topological order.
    Connections can be (src, tgt) or (src, tgt, inputIndex)."""
    wired = 0
    for conn in connections:
        if len(conn) == 3:
            src_name, tgt_name, input_idx = conn
        else:
            src_name, tgt_name = conn
            input_idx = 0
        if src_name not in created or tgt_name not in created:
            res.step(f"{prefix}_wire_{src_name}_to_{tgt_name}", False, "source or target not created")
            continue
        src_path = created[src_name]["path"]
        tgt_path = created[tgt_name]["path"]
        try:
            td.exec(
                "op(%r).outputConnectors[0].connect(op(%r).inputConnectors[%d])"
                % (src_path, tgt_path, input_idx)
            )
            wired += 1
            res.step(f"{prefix}_wire_{src_name}_to_{tgt_name}", True, f"{src_path} -> {tgt_path} input[{input_idx}]")
        except Exception as e:
            res.step(f"{prefix}_wire_{src_name}_to_{tgt_name}", False, str(e))
    res.step(
        f"{prefix}_wire_all",
        wired == len(connections),
        f"wired {wired}/{len(connections)} connections",
    )


def _position_nodes(td: TDClient, res: TestResult, prefix: str, network: list[dict]) -> None:
    """Position nodes with uniform spacing."""
    positioned = 0
    for node in network:
        try:
            td.exec(
                "o = op(%r); o.nodeX = %d; o.nodeY = %d"
                % (f"{SANDBOX_PATH}/{node['name']}", node["x"], node["y"])
            )
            positioned += 1
        except Exception as e:
            res.step(f"{prefix}_layout_{node['name']}", False, str(e))
    res.step(
        f"{prefix}_layout_all",
        positioned == len(network),
        f"positioned {positioned}/{len(network)} nodes",
    )


def _setup_glsl_top(td: TDClient, res: TestResult, created: dict[str, dict]) -> None:
    """Set up GLSL TOP: set computedat and input count."""
    out_node = created.get("glsl_top_out")
    code_node = created.get("glsl_top_code")
    if not out_node or not code_node:
        return

    try:
        td.exec(
            "o = op(%r); o.par.computedat = %r"
            % (out_node["path"], "glsl_top_code")
        )
        res.step("glsl_top_setup_computedat", True, "computedat=glsl_top_code")
    except Exception as e:
        res.step("glsl_top_setup_computedat", False, str(e))


def _setup_glsl_pop(td: TDClient, res: TestResult, created: dict[str, dict]) -> None:
    """Set up GLSL POP: set computedat and outputattrs."""
    out_node = created.get("glsl_pop_out")
    code_node = created.get("glsl_pop_code")
    if not out_node or not code_node:
        return

    try:
        td.exec(
            "o = op(%r); o.par.computedat = %r; o.par.outputattrs = 'P'"
            % (out_node["path"], "glsl_pop_code")
        )
        res.step("glsl_pop_setup", True, "computedat=glsl_pop_code, outputattrs='P'")
    except Exception as e:
        res.step("glsl_pop_setup", False, str(e))


# ─── Verify phase ───────────────────────────────────────────────────────────


def _collect_all_nodes(td: TDClient, res: TestResult) -> list[dict]:
    """Collect the sandbox container AND all child operators via TD Python introspection."""
    inspect_code = (
        "import json\n"
        "c = op(%r)\n"
        "out = {'nodes': []}\n"
        "if c is not None:\n"
        "    # Include the sandbox container itself (COMP family)\n"
        "    container_info = {'path': c.path, 'name': c.name,\n"
        "                     'opType': getattr(c, 'OPType', '?'),\n"
        "                     'errors': list(c.errors()) if c.errors() else [],\n"
        "                     'x': getattr(c, 'nodeX', None),\n"
        "                     'y': getattr(c, 'nodeY', None),\n"
        "                     'inputs': []}\n"
        "    try:\n"
        "        for ic in c.inputConnectors:\n"
        "            container_info['inputs'].append([conn.owner.path for conn in ic.connections])\n"
        "    except Exception:\n"
        "        pass\n"
        "    out['nodes'].append(container_info)\n"
        "    for n in c.findChildren():\n"
        "        info = {'path': n.path, 'name': n.name,\n"
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
        res.step("inspect_all", True, f"inspected {len(nodes)} operator(s)")
        return nodes
    except Exception as e:
        res.step("inspect_all", False, f"inspection failed: {e}")
        return []


def _verify_no_errors(td: TDClient, res: TestResult, prefix: str, nodes: list[dict]) -> None:
    """Verify zero TD runtime errors on every operator in a sub-network."""
    any_errors = False
    for n in nodes:
        if n["errors"]:
            any_errors = True
            res.step(f"{prefix}_errors_{n['name']}", False, f"{n['path']}: {' | '.join(n['errors'])}")
        else:
            res.step(f"{prefix}_errors_{n['name']}", True, "no errors")
    res.step(f"{prefix}_errors_all", not any_errors, "all operators error-free" if not any_errors else "errors detected")


def _verify_connections(
    td: TDClient, res: TestResult, prefix: str,
    connections: list[tuple], nodes_by_name: dict[str, dict],
) -> None:
    """Verify connections match expected topology.
    Connections can be (src, tgt) or (src, tgt, inputIndex)."""
    for conn in connections:
        if len(conn) == 3:
            src_name, tgt_name, input_idx = conn
        else:
            src_name, tgt_name = conn
            input_idx = 0
        tgt = nodes_by_name.get(tgt_name)
        if tgt is None:
            res.step(f"{prefix}_conn_{src_name}_to_{tgt_name}", False, f"{tgt_name} missing")
            continue
        expected_path = f"{SANDBOX_PATH}/{src_name}"
        input_list = tgt["inputs"][input_idx] if len(tgt["inputs"]) > input_idx else []
        ok = expected_path in input_list
        res.step(
            f"{prefix}_conn_{src_name}_to_{tgt_name}",
            ok,
            f"{tgt_name} input[{input_idx}] sources = {input_list}",
        )


def _verify_layout_no_overlap(td: TDClient, res: TestResult, nodes: list[dict]) -> None:
    """Verify no two operators overlap in the grid.
    Skips TD-internal auto-created child operators (e.g. Info DAT, compute
    TOPs inside compositeTOP) since their positions are controlled by TD."""
    
    # Skip TD-internal nodes that are auto-created children of complex ops
    # These have names like "Info", "compute", "pixel", etc.
    internal_names = {"info", "compute", "pixel", "constant", "output1", "output2"}
    
    positions = []
    for n in nodes:
        if n["x"] is None:
            continue
        # Skip TD-internal child components
        name_lower = n["name"].lower()
        if name_lower in internal_names or any(suffix in name_lower for suffix in ["_info", "_compute", "_pixel", "_output"]):
            continue
        positions.append((n["name"], n["x"], n["y"]))

    overlap = False
    for i in range(len(positions)):
        for j in range(i + 1, len(positions)):
            _, x1, y1 = positions[i]
            _, x2, y2 = positions[j]
            if abs(x1 - x2) < 100 and abs(y1 - y2) < 100:
                overlap = True
                res.step(
                    f"layout_overlap_{positions[i][0]}_{positions[j][0]}",
                    False,
                    f"overlap at ({x1},{y1}) vs ({x2},{y2})",
                )
    res.step("layout_no_overlap", not overlap, "no overlapping nodes" if not overlap else "overlaps detected")


def _verify_dat_content(td: TDClient, res: TestResult, created: dict[str, dict]) -> None:
    """Read the textDAT content and verify it was written correctly."""
    code_node = created.get("code_dat")
    if not code_node:
        return
    try:
        content = td.exec("print(op(%r).text)" % code_node["path"]).strip()
        expected = "# TouchDesigner test code"
        ok = expected in content
        res.step("dat_content_check", ok, f"contains '{expected}'" if ok else f"content: {content[:80]}")
    except Exception as e:
        res.step("dat_content_check", False, str(e))


def _verify_glsl_top_compilation(td: TDClient, res: TestResult, nodes_by_name: dict[str, dict]) -> None:
    """Check GLSL TOP for compile errors."""
    glsl_out = nodes_by_name.get("glsl_top_out")
    if glsl_out is None:
        res.step("glsl_top_compilation", False, "node not found")
        return
    ok = not glsl_out["errors"]
    errs = " | ".join(glsl_out["errors"]) if glsl_out["errors"] else "no errors"
    res.step("glsl_top_compilation", ok, errs)


def _verify_glsl_pop_compilation(td: TDClient, res: TestResult, nodes_by_name: dict[str, dict]) -> None:
    """Check GLSL POP for compile errors."""
    glsl_out = nodes_by_name.get("glsl_pop_out")
    if glsl_out is None:
        res.step("glsl_pop_compilation", False, "node not found")
        return
    ok = not glsl_out["errors"]
    errs = " | ".join(glsl_out["errors"]) if glsl_out["errors"] else "no errors"
    res.step("glsl_pop_compilation", ok, errs)


def _verify_via_endpoint(td: TDClient, res: TestResult) -> None:
    """Cross-check via /verify endpoint."""
    try:
        verify = td.get_json(f"/verify?path={SANDBOX_PATH}")
        healthy = bool(verify.get("healthy", False))
        err_count = int(verify.get("error_count", -1))
        res.step(
            "verify_endpoint_crosscheck",
            healthy and err_count == 0,
            f"healthy={healthy}, error_count={err_count}, op_count={verify.get('operator_count')}",
        )
    except Exception as e:
        res.step("verify_endpoint_crosscheck", False, f"/verify failed: {e}")


# ─── Network builders ──────────────────────────────────────────────────────


def build_top_network(td: TDClient, res: TestResult) -> dict:
    """Build TOP chain: noise → blur → composite."""
    prefix = "top"
    created = _create_nodes(td, res, prefix, TOP_NETWORK)
    _set_params(td, res, prefix, TOP_NETWORK, created)
    _wire_connections(td, res, prefix, TOP_CONNECTIONS_WITH_INDEX, created)
    _position_nodes(td, res, prefix, TOP_NETWORK)
    return created


def build_chop_network(td: TDClient, res: TestResult) -> dict:
    """Build CHOP: standalone noiseCHOP."""
    prefix = "chop"
    created = _create_nodes(td, res, prefix, CHOP_NODES)
    _set_params(td, res, prefix, CHOP_NODES, created)
    _position_nodes(td, res, prefix, CHOP_NODES)
    return created


def build_sop_network(td: TDClient, res: TestResult) -> dict:
    """Build SOP: standalone sphereSOP."""
    prefix = "sop"
    created = _create_nodes(td, res, prefix, SOP_NODES)
    _set_params(td, res, prefix, SOP_NODES, created)
    _position_nodes(td, res, prefix, SOP_NODES)
    return created


def build_dat_network(td: TDClient, res: TestResult) -> dict:
    """Build DAT: textDAT with text content."""
    prefix = "dat"
    created = _create_nodes(td, res, prefix, DAT_NODES)
    _position_nodes(td, res, prefix, DAT_NODES)
    return created


def build_mat_network(td: TDClient, res: TestResult) -> dict:
    """Build MAT: constantMAT with color params."""
    prefix = "mat"
    created = _create_nodes(td, res, prefix, MAT_NODES)
    _set_params(td, res, prefix, MAT_NODES, created)
    _position_nodes(td, res, prefix, MAT_NODES)
    return created


def build_pop_network(td: TDClient, res: TestResult) -> dict:
    """Build POP chain: box → noise → particle → null."""
    prefix = "pop"
    created = _create_nodes(td, res, prefix, POP_NETWORK)
    _set_params(td, res, prefix, POP_NETWORK, created)
    _wire_connections(td, res, prefix, POP_CONNECTIONS, created)
    _position_nodes(td, res, prefix, POP_NETWORK)
    return created


def build_glsl_top_network(td: TDClient, res: TestResult) -> dict:
    """Build GLSL TOP: noise + shader + glslTOP."""
    prefix = "glsl_top"
    created = _create_nodes(td, res, prefix, GLSL_TOP_NODES)
    _position_nodes(td, res, prefix, GLSL_TOP_NODES)
    _setup_glsl_top(td, res, created)
    _wire_connections(td, res, prefix, GLSL_TOP_CONNECTIONS, created)
    return created


def build_glsl_pop_network(td: TDClient, res: TestResult) -> dict:
    """Build GLSL POP: box source + compute shader + glslPOP."""
    prefix = "glsl_pop"
    created = _create_nodes(td, res, prefix, GLSL_POP_NODES)
    _position_nodes(td, res, prefix, GLSL_POP_NODES)
    _setup_glsl_pop(td, res, created)
    _wire_connections(td, res, prefix, GLSL_POP_CONNECTIONS, created)
    return created


def verify_all(td: TDClient, res: TestResult, all_created: dict[str, list]) -> None:
    """Run full verification across all sub-networks."""
    time.sleep(1.5)  # let network settle

    all_nodes = _collect_all_nodes(td, res)
    if not all_nodes:
        return

    nodes_by_name = {n["name"]: n for n in all_nodes}

    # Broadcast: operator types present
    print("\n  ── Operator presence check ──")
    # Collect all op types we expect
    all_networks = [TOP_NETWORK, CHOP_NODES, SOP_NODES, DAT_NODES, MAT_NODES, POP_NETWORK, GLSL_TOP_NODES, GLSL_POP_NODES]
    family_labels = ["TOP", "CHOP", "SOP", "DAT", "MAT", "POP", "GLSL_TOP", "GLSL_POP"]
    families_present = set()
    for n in all_nodes:
        op_type = n["opType"].lower()
        if "top" in op_type and "pop" not in op_type and "mat" not in op_type:
            families_present.add("TOP")
        elif "chop" in op_type:
            families_present.add("CHOP")
        elif "sop" in op_type:
            families_present.add("SOP")
        elif "dat" in op_type:
            families_present.add("DAT")
        elif "mat" in op_type:
            families_present.add("MAT")
        elif "pop" in op_type:
            families_present.add("POP")
        elif "comp" in op_type or "base" in op_type:
            families_present.add("COMP")

    all_families = {"COMP", "TOP", "CHOP", "SOP", "DAT", "MAT", "POP"}
    missing = all_families - families_present
    for fam in all_families:
        ok = fam in families_present
        res.step(f"family_present_{fam.lower()}", ok, f"{'✓' if ok else '✗'} operators present")

    if missing:
        res.step("family_coverage", False, f"missing families: {', '.join(sorted(missing))}")
    else:
        res.step("family_coverage", True, "all 7 families represented")

    # Verify sub-networks
    print("\n  ── TOP chain errors ──")
    top_nodes = [n for n in all_nodes if n["name"] in {nd["name"] for nd in TOP_NETWORK}]
    _verify_no_errors(td, res, "top", top_nodes)
    _verify_connections(td, res, "top", TOP_CONNECTIONS_WITH_INDEX, nodes_by_name)

    print("\n  ── CHOP errors ──")
    chop_nodes = [n for n in all_nodes if n["name"] in {nd["name"] for nd in CHOP_NODES}]
    _verify_no_errors(td, res, "chop", chop_nodes)

    print("\n  ── SOP errors ──")
    sop_nodes = [n for n in all_nodes if n["name"] in {nd["name"] for nd in SOP_NODES}]
    _verify_no_errors(td, res, "sop", sop_nodes)

    print("\n  ── DAT errors ──")
    dat_nodes = [n for n in all_nodes if n["name"] in {nd["name"] for nd in DAT_NODES}]
    _verify_no_errors(td, res, "dat", dat_nodes)

    print("\n  ── MAT errors ──")
    mat_nodes = [n for n in all_nodes if n["name"] in {nd["name"] for nd in MAT_NODES}]
    _verify_no_errors(td, res, "mat", mat_nodes)

    print("\n  ── POP chain errors ──")
    pop_nodes = [n for n in all_nodes if n["name"] in {nd["name"] for nd in POP_NETWORK}]
    _verify_no_errors(td, res, "pop", pop_nodes)
    _verify_connections(td, res, "pop", POP_CONNECTIONS, nodes_by_name)

    print("\n  ── GLSL TOP errors ──")
    glsl_top_nodes = [n for n in all_nodes if n["name"] in {nd["name"] for nd in GLSL_TOP_NODES}]
    _verify_no_errors(td, res, "glsl_top", glsl_top_nodes)
    _verify_connections(td, res, "glsl_top", GLSL_TOP_CONNECTIONS, nodes_by_name)
    _verify_glsl_top_compilation(td, res, nodes_by_name)

    print("\n  ── GLSL POP errors ──")
    glsl_pop_nodes = [n for n in all_nodes if n["name"] in {nd["name"] for nd in GLSL_POP_NODES}]
    _verify_no_errors(td, res, "glsl_pop", glsl_pop_nodes)
    _verify_connections(td, res, "glsl_pop", GLSL_POP_CONNECTIONS, nodes_by_name)
    _verify_glsl_pop_compilation(td, res, nodes_by_name)

    print("\n  ── Data integrity checks ──")
    _verify_dat_content(td, res, {nd["name"]: {"path": f"{SANDBOX_PATH}/{nd['name']}"} for nd in DAT_NODES})

    print("\n  ── Layout verification ──")
    _verify_layout_no_overlap(td, res, all_nodes)

    print("\n  ── /verify endpoint cross-check ──")
    _verify_via_endpoint(td, res)


def cleanup(td: TDClient, res: TestResult) -> None:
    """ALWAYS destroy the sandbox container."""
    try:
        td.exec("c = op(%r); c.destroy() if c is not None else None" % SANDBOX_PATH)
        gone = td.exec("print('GONE' if op(%r) is None else 'STILL_HERE')" % SANDBOX_PATH).strip()
        res.step(
            "cleanup",
            gone == "GONE",
            "sandbox container destroyed" if gone == "GONE" else f"container still present ({gone})",
        )
    except Exception as e:
        res.step("cleanup", False, str(e))


# ─── Main ────────────────────────────────────────────────────────────────────


def main() -> int:
    # Fallback encoding: reconfigure stdout to handle UTF-8 even
    # on Windows cp1252 terminals (prevents UnicodeEncodeError).
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

    parser = argparse.ArgumentParser(description="Comprehensive live TD integration test.")
    parser.add_argument("--host", default=DEFAULT_HOST)
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    args = parser.parse_args()

    print("=" * 72)
    print("  Comprehensive Live TD Integration Test")
    print("  TouchDesigner HTTP API — All 7 Operator Families")
    print(f"  Target: http://{args.host}:{args.port}")
    print(f"  Sandbox: {SANDBOX_PATH}")
    print("=" * 72)

    td = TDClient(args.host, args.port)
    res = TestResult()

    # Pre-flight
    if not td.ping():
        print("\nFAIL: TouchDesigner HTTP API not reachable.")
        return 2
    print("\n[setup] TD server reachable.\n")

    try:
        # ── Build ──
        print("─── Build phase ───\n")

        if not create_sandbox(td, res):
            print("  FAIL: could not create sandbox. Aborting.")
            return 1

        # Position sandbox container away from sub-network nodes
        try:
            td.exec("op(%r).nodeX = -800; op(%r).nodeY = 500" % (SANDBOX_PATH, SANDBOX_PATH))
            res.step("position_sandbox", True, "sandbox at (-800, 500)")
        except Exception as e:
            res.step("position_sandbox", False, str(e))

        print("\n  • TOP chain (noise → blur → composite)")
        top_created = build_top_network(td, res)

        print("\n  • CHOP (noiseCHOP)")
        chop_created = build_chop_network(td, res)

        print("\n  • SOP (sphereSOP)")
        sop_created = build_sop_network(td, res)

        print("\n  • DAT (textDAT)")
        dat_created = build_dat_network(td, res)

        print("\n  • MAT (constantMAT)")
        mat_created = build_mat_network(td, res)

        print("\n  • POP chain (box → noise → particle → null)")
        pop_created = build_pop_network(td, res)

        print("\n  • GLSL TOP (noise → shader → glslTOP)")
        glsl_top_created = build_glsl_top_network(td, res)

        print("\n  • GLSL POP (boxPOP → shader → glslPOP)")
        glsl_pop_created = build_glsl_pop_network(td, res)

        all_created = {
            "top": top_created,
            "chop": chop_created,
            "sop": sop_created,
            "dat": dat_created,
            "mat": mat_created,
            "pop": pop_created,
            "glsl_top": glsl_top_created,
            "glsl_pop": glsl_pop_created,
        }

        # ── Verify ──
        print("\n─── Verify phase ───")
        verify_all(td, res, all_created)

    finally:
        # ── Cleanup (ALWAYS runs) ──
        print("\n─── Cleanup phase (always runs) ───")
        cleanup(td, res)

    # ── Final report ──
    print("\n" + "=" * 72)
    total = len(res.steps)
    passed = sum(1 for s in res.steps if s["ok"])
    print(f"RESULT: {passed}/{total} checks passed")
    if res.failures:
        print("FAILURES:")
        for f in res.failures:
            print(f"  - {f}")
        print("\nOVERALL: FAIL")
        return 1
    print("\nOVERALL: PASS — All 7 families tested successfully.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
