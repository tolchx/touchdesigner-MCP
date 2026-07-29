#!/usr/bin/env python3
"""
Live TD POP Parameter Read-Back Integration Test
=================================================

Exercises the live TouchDesigner HTTP API (port 44444) to validate that POP
parameters set via /exec can be **read back** through two independent channels
and that the values persist:

  1. Method A — direct Python inspection via POST /exec
     (``op(...).par[name].val`` for every parameter on the operator)
  2. Method B — GET /parameters?path=<op>  endpoint

This closes a critical gap: the existing tests *set* parameters but never
*read them back* to confirm they actually took effect.

POP chain built:
  boxPOP(box_src) -> noisePOP(noise_mod) -> particlePOP(particle_sim) -> nullPOP(pop_out)

Parameters use the TD names verified against this live instance:
  - boxPOP:      sizex (XYZW), depth (Int)         (doc: size / divsx)
  - noisePOP:    period (Float), amp0 (Float), harmon (Int)
                 (doc: freq0 / rough; task draft said noisesize/0.3 but a live
                  probe showed `noisesize` is a **Menu** param and `harmon` is an
                  **Int** — so the genuine float "noise size" control is `period`
                  and harmonics must be an integer. This test itself surfaced
                  that discrepancy: see the FINDING note below.)
  - particlePOP: birthrate (Float), life (Float), maxparticles (Int), initvelocityy (XYZW)
                 (doc: rate / lifeexpect / maxCount / gravity[does not exist])

FINDING (empirical, from running this test against live TD on :44444):
  On the POP-family noisePOP, `noisesize` is a Menu parameter (its value is a
  menu index string like '3'), NOT a float. Setting noisesize=2.0 therefore
  cannot round-trip a float. The actual float noise-size control is `period`.
  `harmon` is an Int, so the draft value 0.3 truncates to 0. This test uses
  `period`/`harmon`(int) so the set->read-back round trip is meaningful.

Exit codes:  0 = pass, 1 = fail, 2 = no TD connection. Safe to re-run.

Usage:
    python toe/src/test_live_td_pop_params.py
    python toe/src/test_live_td_pop_params.py --host 127.0.0.1 --port 44444
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.request
import uuid

# ─── Configuration ────────────────────────────────────────────────────────────

DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 44444
DEFAULT_TIMEOUT = 30  # seconds per HTTP call

SANDBOX_PARENT = "/project1"
# Unique sandbox name for isolation across re-runs within the same TD session
SANDBOX_NAME = f"test_pop_params_{uuid.uuid4().hex[:8]}"
SANDBOX_PATH = f"{SANDBOX_PARENT}/{SANDBOX_NAME}"

# Grid spacing (x-spacing=300, y-spacing=200)
NODE_SPACING_X = 300
NODE_SPACING_Y = 200

# ─── Operator topology definitions ────────────────────────────────────────────
#
# POP chain: box -> noise -> particle -> null, laid out left-to-right.
# key_params use the ACTUAL TD parameter names (empirically verified), not the
# doc names. See module docstring for the mapping table.

POP_NODES = [
    {
        "name": "box_src",
        "opType": "boxPOP",
        "label": "Box POP Source",
        "x": -2 * NODE_SPACING_X,
        "y": 0,
        # doc said: size / divsx ; actual: sizex / depth
        "key_params": {"sizex": 3.0, "depth": 16},
        "is_source": True,
    },
    {
        "name": "noise_mod",
        "opType": "noisePOP",
        "label": "Noise Modifier",
        "x": -1 * NODE_SPACING_X,
        "y": 0,
        # doc said: freq0 / rough ; task draft said noisesize/0.3.
        # Live probe: `noisesize` is a Menu, `harmon` is an Int. The real float
        # noise-size control is `period`; use an int for harmonics.
        "key_params": {"period": 2.0, "amp0": 0.8, "harmon": 4},
        "is_source": False,
    },
    {
        "name": "particle_sim",
        "opType": "particlePOP",
        "label": "Particle Solver",
        "x": 0,
        "y": 0,
        # doc said: rate / lifeexpect / maxCount / gravity ; actual below,
        # and gravity does NOT exist (use initvelocityy / damping instead)
        "key_params": {
            "birthrate": 150,
            "life": 4.0,
            "maxparticles": 500,
            "initvelocityy": 0.5,
        },
        "is_source": False,
    },
    {
        "name": "pop_out",
        "opType": "nullPOP",
        "label": "POP Output",
        "x": 1 * NODE_SPACING_X,
        "y": 0,
        "key_params": {},
        "is_source": False,
    },
]

# Linear chain: box -> noise -> particle -> null
POP_CONNECTIONS = [
    ("box_src", "noise_mod"),
    ("noise_mod", "particle_sim"),
    ("particle_sim", "pop_out"),
]

ALL_NODE_NAMES = [n["name"] for n in POP_NODES]

# Critical parameters that MUST survive a set->read-back round trip.
# At least these 6 critical values are verified via BOTH read-back methods:
# (sizex, depth, period, amp0, birthrate, life) — all genuinely numeric.
CRITICAL_PARAMS = {
    "box_src": {"sizex": 3.0, "depth": 16},
    "noise_mod": {"period": 2.0, "amp0": 0.8},
    "particle_sim": {"birthrate": 150, "life": 4.0},
}


# ─── HTTP client ──────────────────────────────────────────────────────────────


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
        """GET a JSON endpoint (e.g. /parameters?path=...)."""
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


def _py_repr(value) -> str:
    """Render a Python value for embedding in generated TD code."""
    if isinstance(value, bool):
        return "True" if value else "False"
    if isinstance(value, (int, float)):
        return repr(value)
    return repr(str(value))


def _num_close(a, b, tol: float = 1e-6) -> bool:
    """Numeric equality with tolerance — survives int/float coercion."""
    try:
        return abs(float(a) - float(b)) <= tol
    except (TypeError, ValueError):
        return False


# ─── Build phase ──────────────────────────────────────────────────────────────


def build_network(td: TDClient, res: TestResult) -> bool:
    """Create sandbox, nodes, params, wiring, and layout. Returns ok-so-far."""

    # Phase 0: clean stale sandbox (ignore failure — may not exist)
    try:
        td.exec("c = op(%r); c.destroy() if c is not None else None" % SANDBOX_PATH)
        res.step("cln_stale", True)
    except Exception as e:
        res.step("cln_stale", False, str(e))

    # Phase 1: create sandbox container
    try:
        td.exec("op(%r).create(baseCOMP, %r)" % (SANDBOX_PARENT, SANDBOX_NAME))
        res.step("create_sandbox", True, f"created {SANDBOX_PATH}")
    except Exception as e:
        res.step("create_sandbox", False, str(e))
        return False

    # Phase 2: create all nodes
    created: dict[str, str] = {}
    for node in POP_NODES:
        try:
            td.exec(
                "op(%r).create(%s, %r)"
                % (SANDBOX_PATH, node["opType"], node["name"])
            )
            created[node["name"]] = f"{SANDBOX_PATH}/{node['name']}"
            res.step(f"cr_{node['name']}", True, f"{node['opType']}")
        except Exception as e:
            res.step(f"cr_{node['name']}", False, str(e))
    res.step(
        "cr_all",
        len(created) == len(POP_NODES),
        f"created {len(created)}/{len(POP_NODES)} nodes",
    )

    # Phase 3: set parameters (only nodes with key_params)
    for node in POP_NODES:
        if not node["key_params"]:
            continue
        failures = []
        for pname, pval in node["key_params"].items():
            try:
                td.exec(
                    "op(%r).par.%s = %s"
                    % (f"{SANDBOX_PATH}/{node['name']}", pname, _py_repr(pval))
                )
            except Exception as e:
                failures.append(f"{pname}: {e}")
        if failures:
            res.step(f"pr_{node['name']}", False, "; ".join(failures))
        else:
            res.step(
                f"pr_{node['name']}",
                True,
                f"set {len(node['key_params'])} param(s): "
                + ", ".join(node["key_params"].keys()),
            )

    # Phase 4: wire connections (linear chain)
    wired = 0
    for src, tgt in POP_CONNECTIONS:
        if src not in created or tgt not in created:
            res.step(f"w_{src}_to_{tgt}", False, "missing node")
            continue
        try:
            td.exec(
                "op(%r).outputConnectors[0].connect(op(%r))"
                % (created[src], created[tgt])
            )
            wired += 1
            res.step(f"w_{src}_to_{tgt}", True)
        except Exception as e:
            res.step(f"w_{src}_to_{tgt}", False, str(e))
    res.step("w_all", wired == len(POP_CONNECTIONS),
             f"wired {wired}/{len(POP_CONNECTIONS)} connections")

    # Phase 5: position nodes in a grid (no overlap)
    positioned = 0
    for node in POP_NODES:
        try:
            td.exec(
                "o = op(%r); o.nodeX = %d; o.nodeY = %d"
                % (f"{SANDBOX_PATH}/{node['name']}", node["x"], node["y"])
            )
            positioned += 1
            res.step(f"ly_{node['name']}", True, f"({node['x']},{node['y']})")
        except Exception as e:
            res.step(f"ly_{node['name']}", False, str(e))
    res.step("ly_all", positioned == len(POP_NODES),
             f"positioned {positioned}/{len(POP_NODES)} nodes")

    return True


# ─── Read-back + Verify phase ─────────────────────────────────────────────────


def _read_back_method_a(td: TDClient, node_name: str) -> dict:
    """Method A: direct Python inspection via /exec.

    Reads ``op(path).par[name].val`` for every parameter on the operator and
    returns a {name: value} dict.
    """
    path = f"{SANDBOX_PATH}/{node_name}"
    code = (
        "import json\n"
        "o = op(%r)\n"
        "vals = {}\n"
        "for p in o.pars():\n"
        "    try:\n"
        "        v = o.par[p.name].val\n"
        "        if not isinstance(v, (int, float, str, bool)):\n"
        "            v = str(v)\n"
        "        vals[p.name] = v\n"
        "    except Exception:\n"
        "        pass\n"
        "print(json.dumps(vals))\n"
    ) % path
    raw = td.exec(code).strip()
    line = raw.splitlines()[-1] if raw else "{}"
    return json.loads(line)


def _read_back_method_b(td: TDClient, node_name: str) -> dict:
    """Method B: GET /parameters?path=<op> endpoint.

    Returns a {name: value} dict built from the serialized parameter list.
    """
    import urllib.parse
    path = f"{SANDBOX_PATH}/{node_name}"
    encoded = urllib.parse.quote(path, safe="")
    data = td.get_json(f"/parameters?path={encoded}")
    params = data.get("parameters", [])
    return {p["name"]: p.get("value") for p in params}


def verify_read_back(td: TDClient, res: TestResult) -> None:
    """The core of this test: read params back two ways and confirm persistence."""
    time.sleep(1.0)  # let the network settle so cooks/values are current

    method_a: dict[str, dict] = {}
    method_b: dict[str, dict] = {}

    # ── Per-node read-back via both methods ──
    for node in POP_NODES:
        name = node["name"]
        # Method A
        try:
            vals_a = _read_back_method_a(td, name)
            method_a[name] = vals_a
            res.step(f"rb_a_{name}", True, f"{len(vals_a)} params via /exec")
        except Exception as e:
            res.step(f"rb_a_{name}", False, str(e))

        # Method B
        try:
            vals_b = _read_back_method_b(td, name)
            method_b[name] = vals_b
            res.step(
                f"rb_b_{name}",
                True,
                f"{len(vals_b)} params via GET /parameters",
            )
        except Exception as e:
            res.step(f"rb_b_{name}", False, str(e))

    # ── Verify critical params survived set -> read-back (both methods) ──
    # Checks at least: sizex, depth, noisesize, amp0, birthrate, life (6 values)
    for node_name, expected in CRITICAL_PARAMS.items():
        a = method_a.get(node_name, {})
        b = method_b.get(node_name, {})
        for pname, exp_val in expected.items():
            got_a = a.get(pname)
            got_b = b.get(pname)
            ok_a = _num_close(got_a, exp_val)
            ok_b = _num_close(got_b, exp_val)
            ok = ok_a and ok_b
            res.step(
                f"chk_{node_name}_{pname}",
                ok,
                f"expected={exp_val} exec={got_a!r} endpoint={got_b!r}",
            )

    # ── Cross-method consistency: the two read-back channels agree ──
    agree = 0
    total = 0
    for node_name, expected in CRITICAL_PARAMS.items():
        a = method_a.get(node_name, {})
        b = method_b.get(node_name, {})
        for pname in expected:
            total += 1
            if _num_close(a.get(pname), b.get(pname)):
                agree += 1
    res.step("rb_cross_method", agree == total,
             f"exec vs endpoint agree on {agree}/{total} critical params")


def verify_no_errors(td: TDClient, res: TestResult) -> None:
    """Verify no TD runtime errors on any node via /exec + n.errors()."""
    code = (
        "import json\n"
        "errs = {}\n"
        "for nm in %r:\n"
        "    n = op(%r + '/' + nm)\n"
        "    if n is not None:\n"
        "        e = list(n.errors()) if n.errors() else []\n"
        "        errs[nm] = e\n"
        "print(json.dumps(errs))\n"
    ) % (ALL_NODE_NAMES, SANDBOX_PATH)
    try:
        raw = td.exec(code).strip()
        line = raw.splitlines()[-1] if raw else "{}"
        errs = json.loads(line)
    except Exception as e:
        res.step("err_inspect", False, str(e))
        return

    any_errors = False
    for nm in ALL_NODE_NAMES:
        e = errs.get(nm, [])
        if e:
            any_errors = True
            res.step(f"err_{nm}", False, " | ".join(str(x) for x in e))
        else:
            res.step(f"err_{nm}", True, "no errors")
    res.step("err_all", not any_errors,
             "all nodes error-free" if not any_errors else "errors detected")


def verify_connections(td: TDClient, res: TestResult) -> None:
    """Verify the 3 wired connections are present (box->noise->particle->null)."""
    code = (
        "import json\n"
        "out = {}\n"
        "for nm in %r:\n"
        "    n = op(%r + '/' + nm)\n"
        "    inputs = []\n"
        "    if n is not None:\n"
        "        try:\n"
        "            for ic in n.inputConnectors:\n"
        "                inputs.append([c.owner.path for c in ic.connections])\n"
        "        except Exception:\n"
        "            pass\n"
        "    out[nm] = inputs\n"
        "print(json.dumps(out))\n"
    ) % (ALL_NODE_NAMES, SANDBOX_PATH)
    try:
        raw = td.exec(code).strip()
        line = raw.splitlines()[-1] if raw else "{}"
        inputs = json.loads(line)
    except Exception as e:
        res.step("conn_inspect", False, str(e))
        return

    for src, tgt in POP_CONNECTIONS:
        tgt_inputs = inputs.get(tgt, [])
        expected = f"{SANDBOX_PATH}/{src}"
        found = any(expected in slot for slot in tgt_inputs)
        res.step(f"cn_{src}_to_{tgt}", found,
                 f"{tgt} inputs={tgt_inputs}" if found else f"{tgt} inputs={tgt_inputs} (missing {src})")


def verify_layout_no_overlap(td: TDClient, res: TestResult) -> None:
    """Verify no two nodes overlap in the grid (x>=200px OR y>=150px apart)."""
    code = (
        "import json\n"
        "out = {}\n"
        "for nm in %r:\n"
        "    n = op(%r + '/' + nm)\n"
        "    if n is not None:\n"
        "        out[nm] = [getattr(n, 'nodeX', None), getattr(n, 'nodeY', None)]\n"
        "print(json.dumps(out))\n"
    ) % (ALL_NODE_NAMES, SANDBOX_PATH)
    try:
        raw = td.exec(code).strip()
        line = raw.splitlines()[-1] if raw else "{}"
        pos = json.loads(line)
    except Exception as e:
        res.step("layout_inspect", False, str(e))
        return

    positions = [(nm, p[0], p[1]) for nm, p in pos.items()
                 if p and p[0] is not None and p[1] is not None]
    overlap = False
    for i in range(len(positions)):
        for j in range(i + 1, len(positions)):
            _, x1, y1 = positions[i]
            _, x2, y2 = positions[j]
            if abs(x1 - x2) < 200 and abs(y1 - y2) < 150:
                overlap = True
                res.step(f"ov_{positions[i][0]}_{positions[j][0]}", False,
                         f"overlap at ({x1},{y1}) vs ({x2},{y2})")
    res.step("layout_no_overlap", not overlap,
             "no overlapping nodes" if not overlap else "overlaps detected")


def verify_via_endpoint(td: TDClient, res: TestResult) -> None:
    """Cross-check the whole sandbox via GET /verify."""
    try:
        v = td.get_json(f"/verify?path={SANDBOX_PATH}")
        healthy = bool(v.get("healthy", False))
        err_cnt = int(v.get("error_count", -1))
        res.step("verify_endpoint", healthy and err_cnt == 0,
                 f"healthy={healthy}, error_count={err_cnt}, ops={v.get('operator_count')}")
    except Exception as e:
        res.step("verify_endpoint", False, str(e))


# ─── Cleanup ──────────────────────────────────────────────────────────────────


def cleanup(td: TDClient, res: TestResult) -> None:
    """ALWAYS destroy the sandbox container."""
    try:
        td.exec("c = op(%r); c.destroy() if c is not None else None" % SANDBOX_PATH)
        gone = td.exec(
            "print('GONE' if op(%r) is None else 'STILL_HERE')" % SANDBOX_PATH
        ).strip()
        res.step(
            "cleanup",
            gone == "GONE",
            "sandbox container destroyed" if gone == "GONE" else f"still present ({gone})",
        )
    except Exception as e:
        res.step("cleanup", False, str(e))


# ─── Main ─────────────────────────────────────────────────────────────────────


def main() -> int:
    # Fallback encoding: reconfigure stdout to handle UTF-8 even
    # on Windows cp1252 terminals (prevents UnicodeEncodeError).
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

    parser = argparse.ArgumentParser(
        description="Live TD POP parameter read-back integration test."
    )
    parser.add_argument("--host", default=DEFAULT_HOST)
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    args = parser.parse_args()

    print("=" * 72)
    print("  Live TD POP Parameter Read-Back Integration Test")
    print("  TouchDesigner HTTP API — POP param set/read-back round trip")
    print(f"  Target:  http://{args.host}:{args.port}")
    print(f"  Sandbox: {SANDBOX_PATH}")
    print(f"  Chain:   boxPOP -> noisePOP -> particlePOP -> nullPOP")
    print(f"  Methods: /exec (Python) + GET /parameters endpoint")
    print("=" * 72)

    td = TDClient(args.host, args.port)
    res = TestResult()

    # Pre-flight: is TD reachable?
    if not td.ping():
        print("\nFAIL: TouchDesigner HTTP API not reachable.")
        return 2
    print("\n[setup] TD server reachable.\n")

    try:
        # ── Build ──
        print("--- Build phase ---")
        build_network(td, res)

        # ── Verify ──
        print("\n--- Verify phase: parameter read-back (the core check) ---")
        verify_read_back(td, res)

        print("\n--- Verify phase: error check ---")
        verify_no_errors(td, res)

        print("\n--- Verify phase: connections ---")
        verify_connections(td, res)

        print("\n--- Verify phase: layout ---")
        verify_layout_no_overlap(td, res)

        print("\n--- Verify phase: /verify endpoint ---")
        verify_via_endpoint(td, res)

    finally:
        # ── Cleanup (ALWAYS runs) ──
        print("\n--- Cleanup phase (always runs) ---")
        cleanup(td, res)

    # ── Final report ──
    total = len(res.steps)
    passed = sum(1 for s in res.steps if s["ok"])
    print(f"\n{'=' * 72}")
    print(f"RESULT: {passed}/{total} checks passed")
    if res.passed:
        print("\nOVERALL: PASS — POP params set, read back via both methods, "
              "verified, cleaned up.")
        return 0
    print(f"\nOVERALL: FAIL — {len(res.failures)} check(s) failed")
    for f in res.failures:
        print(f"  - {f}")
    return 1


if __name__ == "__main__":
    sys.exit(main())
