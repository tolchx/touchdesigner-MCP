#!/usr/bin/env python3
"""
Shared Test Harness for Live TouchDesigner HTTP API Tests
=========================================================

Provides reusable classes and utilities that are duplicated across the
12+ test scripts in this directory:

  - TDClient:       urllib-based HTTP client for the TD API
  - TestResult:     step-based pass/fail tracker
  - _py_repr:       render Python values for TD code generation
  - create_sandbox: create an isolated baseCOMP container
  - cleanup_sandbox: destroy a sandbox container (always-safe)
  - inspect_nodes:  introspect operators inside a container via TD Python
  - wire_connections: wire operator connections (2-tuple or 3-tuple with inputIndex)
  - set_params:     set key_params on operators via op().par.xxx = yyy
  - position_nodes:  set nodeX/nodeY on each operator
  - check_overlap:  verify no two operators overlap on the grid

Usage:
    from td_test_harness import TDClient, TestResult, _py_repr
    from td_test_harness import create_sandbox, cleanup_sandbox, inspect_nodes

All functions accept a `sandbox_path` parameter rather than relying on
module-level constants, making them reusable across different test scripts
with different sandbox names.
"""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
from typing import Any

# Re-exported for backward compatibility
__all__ = [
    "TDClient", "TestResult", "_py_repr",
    "DEFAULT_HOST", "DEFAULT_PORT", "DEFAULT_TIMEOUT", "SANDBOX_PARENT",
    "create_sandbox", "cleanup_sandbox", "inspect_nodes",
    "create_operators", "set_params", "wire_connections", "position_nodes",
    "check_overlap", "verify_endpoint", "verify_connections", "verify_no_errors",
]

# ─── Default Configuration ─────────────────────────────────────────────────

DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 44444
DEFAULT_TIMEOUT = 30  # seconds per HTTP call

SANDBOX_PARENT = "/project1"


# ─── HTTP Client ───────────────────────────────────────────────────────────


class TDClient:
    """Minimal urllib-based client for the TouchDesigner HTTP API."""

    def __init__(self, host: str = DEFAULT_HOST, port: int = DEFAULT_PORT,
                 timeout: int = DEFAULT_TIMEOUT):
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

    def post_json(self, path: str, body: dict) -> dict:
        """POST a JSON body to an endpoint and return the parsed response."""
        payload = json.dumps(body).encode("utf-8")
        req = urllib.request.Request(
            f"{self.base}{path}",
            data=payload,
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=self.timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))

    def ping(self) -> bool:
        """Return True if the TD server responds to /info."""
        try:
            self.get_json("/info")
            return True
        except Exception:
            return False


# ─── Test Result Tracker ──────────────────────────────────────────────────


class TestResult:
    """Step-based pass/fail tracker with failure recording."""

    def __init__(self) -> None:
        self.steps: list[dict[str, Any]] = []
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

    def summary(self) -> tuple[int, int]:
        """Return (passed_count, total_count)."""
        total = len(self.steps)
        passed = sum(1 for s in self.steps if s["ok"])
        return passed, total


# ─── Python Value Renderer ────────────────────────────────────────────────


def _py_repr(value: Any) -> str:
    """Render a Python value for embedding in generated TD code."""
    if isinstance(value, bool):
        return "True" if value else "False"
    if isinstance(value, (int, float)):
        return repr(value)
    return repr(str(value))


# ─── Sandbox Management ───────────────────────────────────────────────────


def create_sandbox(td: TDClient, sandbox_path: str,
                   res: TestResult | None = None) -> bool:
    """Create an isolated baseCOMP sandbox container.

    First cleans any stale container at the same path (idempotent re-runs).
    Returns True on success.
    """
    parent = sandbox_path.rsplit("/", 1)[0]
    name = sandbox_path.rsplit("/", 1)[-1]

    # Clean any stale sandbox
    try:
        td.exec("c = op(%r); c.destroy() if c is not None else None" % sandbox_path)
    except Exception:
        pass

    try:
        td.exec("op(%r).create(baseCOMP, %r)" % (parent, name))
        if res:
            res.step("create_sandbox", True, f"created {sandbox_path}")
        return True
    except Exception as e:
        if res:
            res.step("create_sandbox", False, str(e))
        return False


def cleanup_sandbox(td: TDClient, sandbox_path: str,
                    res: TestResult | None = None) -> None:
    """Destroy the sandbox container and confirm it's gone. Always safe."""
    try:
        td.exec("c = op(%r); c.destroy() if c is not None else None" % sandbox_path)
        gone = td.exec(
            "print('GONE' if op(%r) is None else 'STILL_HERE')" % sandbox_path
        ).strip()
        if res:
            res.step(
                "cleanup",
                gone == "GONE",
                "sandbox container destroyed" if gone == "GONE"
                else f"container still present ({gone})",
            )
    except Exception as e:
        if res:
            res.step("cleanup", False, str(e))


# ─── Network Inspection ───────────────────────────────────────────────────


def inspect_nodes(td: TDClient, sandbox_path: str,
                  res: TestResult | None = None, settle_sec: float = 1.0) -> list[dict]:
    """Introspect all operators inside a sandbox container via TD Python.

    Returns a list of dicts with keys: path, name, opType, errors, x, y, inputs.
    Settle_sec controls the delay before inspection (0 to skip).
    """
    if settle_sec > 0:
        time.sleep(settle_sec)  # let network settle before checking

    inspect_code = (
        "import json\n"
        "c = op(%r)\n"
        "out = {'nodes': []}\n"
        "if c is not None:\n"
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
    ) % sandbox_path

    try:
        raw = td.exec(inspect_code)
        data = json.loads(raw.strip().splitlines()[-1]) if raw.strip() else {"nodes": []}
        nodes = data.get("nodes", [])
        if res:
            res.step("inspect_network", True, f"inspected {len(nodes)} operator(s)")
        return nodes
    except Exception as e:
        if res:
            res.step("inspect_network", False, f"inspection failed: {e}")
        return []


# ─── Operator Management ──────────────────────────────────────────────────


def create_operators(td: TDClient, sandbox_path: str, network: list[dict],
                     prefix: str = "",
                     res: TestResult | None = None) -> dict[str, dict]:
    """Create a list of operators inside the sandbox.

    Each node dict must have: name, opType.
    Optional: text_content (for DAT nodes).
    Returns a map of name → node info dict (with 'path' added).
    """
    created: dict[str, dict] = {}
    for node in network:
        path = f"{sandbox_path}/{node['name']}"
        try:
            td.exec(
                "op(%r).create(%s, %r)"
                % (sandbox_path, node["opType"], node["name"])
            )
            text_content = node.get("text_content")
            if text_content:
                td.exec("op(%r).text = %r" % (path, text_content))
            created[node["name"]] = {**node, "path": path}
            if res:
                res.step(
                    f"{prefix}create_{node['name']}",
                    True,
                    f"{node['opType']} @ {path}",
                )
        except Exception as e:
            if res:
                res.step(f"{prefix}create_{node['name']}", False, str(e))

    if res:
        total_expected = len(network)
        total_created = len(created)
        res.step(
            f"{prefix}create_all",
            total_created == total_expected,
            f"created {total_created}/{total_expected} operators",
        )
    return created


def set_params(td: TDClient, sandbox_path: str, network: list[dict],
               prefix: str = "",
               res: TestResult | None = None) -> None:
    """Set key_params on each node via op().par.xxx = yyy."""
    for node in network:
        if not node.get("key_params"):
            continue
        failures: list[str] = []
        for pname, pval in node["key_params"].items():
            try:
                td.exec(
                    "op(%r).par.%s = %s"
                    % (f"{sandbox_path}/{node['name']}", pname, _py_repr(pval))
                )
            except Exception as e:
                failures.append(f"{pname}: {e}")
        if res:
            if failures:
                res.step(f"{prefix}params_{node['name']}", False, "; ".join(failures))
            else:
                res.step(
                    f"{prefix}params_{node['name']}",
                    True,
                    f"set {len(node['key_params'])} param(s)",
                )


def wire_connections(td: TDClient, connections: list[tuple],
                     created: dict[str, dict], prefix: str = "",
                     res: TestResult | None = None) -> None:
    """Wire connections in topological order.

    Connections can be (src_name, tgt_name) or (src_name, tgt_name, inputIndex).
    """
    wired = 0
    for conn in connections:
        if len(conn) == 3:
            src_name, tgt_name, input_idx = conn
        else:
            src_name, tgt_name = conn
            input_idx = 0

        if src_name not in created or tgt_name not in created:
            if res:
                res.step(
                    f"{prefix}wire_{src_name}_to_{tgt_name}",
                    False,
                    "source or target not created",
                )
            continue

        src_path = created[src_name]["path"]
        tgt_path = created[tgt_name]["path"]
        try:
            td.exec(
                "op(%r).outputConnectors[0].connect(op(%r).inputConnectors[%d])"
                % (src_path, tgt_path, input_idx)
            )
            wired += 1
            if res:
                res.step(
                    f"{prefix}wire_{src_name}_to_{tgt_name}",
                    True,
                    f"{src_path} -> {tgt_path} input[{input_idx}]",
                )
        except Exception as e:
            if res:
                res.step(f"{prefix}wire_{src_name}_to_{tgt_name}", False, str(e))

    if res:
        res.step(
            f"{prefix}wire_all",
            wired == len(connections),
            f"wired {wired}/{len(connections)} connections",
        )


def position_nodes(td: TDClient, sandbox_path: str, network: list[dict],
                   prefix: str = "",
                   res: TestResult | None = None) -> None:
    """Position nodes with nodeX/nodeY from the node dicts."""
    positioned = 0
    for node in network:
        try:
            td.exec(
                "o = op(%r); o.nodeX = %d; o.nodeY = %d"
                % (f"{sandbox_path}/{node['name']}", node["x"], node["y"])
            )
            positioned += 1
        except Exception as e:
            if res:
                res.step(f"{prefix}layout_{node['name']}", False, str(e))
    if res:
        res.step(
            f"{prefix}layout_all",
            positioned == len(network),
            f"positioned {positioned}/{len(network)} nodes",
        )


# ─── Overlap Detection ────────────────────────────────────────────────────


def check_overlap(nodes: list[dict], min_dx: int = 200, min_dy: int = 150,
                  res: TestResult | None = None,
                  skip_internal: bool = False) -> bool:
    """Verify no two operators overlap on the grid.

    Returns True if no overlap detected.
    """
    internal_names = {"info", "compute", "pixel", "constant", "output1", "output2"}

    positions: list[tuple[str, float, float]] = []
    for n in nodes:
        if n.get("x") is None:
            continue
        if skip_internal:
            name_lower = n.get("name", "").lower()
            if name_lower in internal_names or any(
                s in name_lower for s in ["_info", "_compute", "_pixel", "_output"]
            ):
                continue
        positions.append((n["name"], float(n["x"]), float(n["y"])))

    overlap = False
    for i in range(len(positions)):
        for j in range(i + 1, len(positions)):
            _, x1, y1 = positions[i]
            _, x2, y2 = positions[j]
            if abs(x1 - x2) < min_dx and abs(y1 - y2) < min_dy:
                overlap = True
                if res:
                    res.step(
                        f"layout_overlap_{positions[i][0]}_{positions[j][0]}",
                        False,
                        f"overlap at ({x1},{y1}) vs ({x2},{y2})",
                    )

    if res:
        res.step(
            "layout_no_overlap",
            not overlap,
            "no overlapping nodes" if not overlap else "overlaps detected",
        )
    return not overlap


# ─── /verify Endpoint Check ───────────────────────────────────────────────


def verify_endpoint(td: TDClient, sandbox_path: str,
                    res: TestResult | None = None) -> bool:
    """Cross-check via the /verify endpoint. Returns True if healthy."""
    try:
        verify = td.get_json(f"/verify?path={sandbox_path}")
        healthy = bool(verify.get("healthy", False))
        err_count = int(verify.get("error_count", -1))
        ok = healthy and err_count == 0
        if res:
            res.step(
                "verify_endpoint",
                ok,
                f"healthy={healthy}, error_count={err_count}, "
                f"op_count={verify.get('operator_count')}",
            )
        return ok
    except Exception as e:
        if res:
            res.step("verify_endpoint", False, f"/verify call failed: {e}")
        return False


# ─── Connection Verification ──────────────────────────────────────────────


def verify_connections(connections: list[tuple], nodes_by_name: dict[str, dict],
                       sandbox_path: str, prefix: str = "",
                       res: TestResult | None = None) -> None:
    """Verify connections match expected topology.

    Connections can be (src, tgt) or (src, tgt, inputIndex).
    """
    for conn in connections:
        if len(conn) == 3:
            src_name, tgt_name, input_idx = conn
        else:
            src_name, tgt_name = conn
            input_idx = 0

        tgt = nodes_by_name.get(tgt_name)
        if tgt is None:
            if res:
                res.step(f"{prefix}conn_{src_name}_to_{tgt_name}", False, f"{tgt_name} missing")
            continue

        expected_path = f"{sandbox_path}/{src_name}"
        input_list = tgt["inputs"][input_idx] if len(tgt["inputs"]) > input_idx else []
        ok = expected_path in input_list
        if res:
            res.step(
                f"{prefix}conn_{src_name}_to_{tgt_name}",
                ok,
                f"{tgt_name} input[{input_idx}] sources = {input_list}",
            )


def verify_no_errors(nodes: list[dict], prefix: str = "",
                     res: TestResult | None = None) -> bool:
    """Verify zero TD runtime errors on every operator. Returns True if clean."""
    any_errors = False
    for n in nodes:
        if n.get("errors"):
            any_errors = True
            if res:
                res.step(
                    f"{prefix}errors_{n['name']}",
                    False,
                    f"{n['path']}: {' | '.join(n['errors'])}",
                )
        else:
            if res:
                res.step(f"{prefix}errors_{n['name']}", True, "no errors")
    if res:
        res.step(
            f"{prefix}errors_none",
            not any_errors,
            "all operators error-free" if not any_errors else "operator errors detected",
        )
    return not any_errors
