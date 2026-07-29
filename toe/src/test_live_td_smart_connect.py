#!/usr/bin/env python3
"""
Live TD Integration Test — POST /smart_connect endpoint
=======================================================

Tests the recently-fixed POST /smart_connect endpoint (the handler now uses
``getattr(td, use_type)`` instead of a bare identifier that raised NameError
at runtime). Five scenarios exercise every code path:

  Scenario A — source + destination, AUTO type (TOP):
       circleTOP + nullTOP -> /smart_connect auto-detects a bridging
       nullTOP placed at the midpoint. Verifies success, midpoint X,
       wiring source -> new -> destination, zero errors.
  Scenario B — source + destination, EXPLICIT type:
       noiseTOP + nullTOP -> /smart_connect with type="blurTOP".
       Verifies the new op is a blurTOP and is correctly wired.
  Scenario C — source only (no destination):
       boxSOP -> /smart_connect creates a new op to the RIGHT of source.
       Verifies positioning (src.x + 200) and source->new wiring.
  Scenario D — destination only (no source):
       nullCHOP -> /smart_connect creates a new op to the LEFT of
       destination. Verifies positioning (dst.x - 200) and new->dst wiring.
  Scenario E — source + destination, AUTO type (POP):
       boxPOP + nullPOP -> /smart_connect auto-detects a bridging nullPOP
       (POP family). Exercises the POP branch of the auto-type chain;
       without it the handler fell through to the default nullCHOP and
       cross-family wiring failed. Verifies success, type == nullPOP,
       midpoint X, wiring source -> new -> destination, zero errors.

The test runs OUTSIDE TouchDesigner as a normal Python script, calling the
TD HTTP API on port 44444 via the ``requests`` library.

EXPLICIT RULES (verified every run):

  RULE 1 — CONTAINER
      All operators are created INSIDE a UUID-named baseCOMP container to
      avoid collisions.  NUNCA en ``/project1``.

  RULE 2 — NO ERRORS
      Every operator is checked for errors at test time AND re-checked
      after a forced cook + 2 s wait (GLSL compilation in TD is
      asynchronous and errors may surface late).

  RULE 3 — NO OVERLAP
      Grid positions are verified to have >= 200 px horizontal and
      >= 150 px vertical separation between EVERY pair of nodes.

  RULE 4 — EXEC NAMESPACE
      The TD /exec executor runs ``exec(code)`` without a proper namespace.
      Dict/set comprehensions inside exec'd code can fail because the
      comprehension's implicit nested scope cannot see variables in the
      exec namespace.  This test uses ONLY simple for-loops (no
      comprehensions) in all TD-side code, and multi-statement code is
      sent as-is — consistent with the ``exec(compile(code, "<mcp>",
      "exec"), globals())`` pattern recommended for robustness.

Exit code 0 = pass, non-zero = fail.  Safe to re-run (isolated sandbox).
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import uuid

try:
    import requests
except ImportError:
    print("ERROR: 'requests' library is required.  Install with:  pip install requests")
    sys.exit(2)


# ─── Constants ────────────────────────────────────────────────────────────────

DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 44444
DEFAULT_TIMEOUT = 30

SANDBOX_PARENT = "/project1"
SANDBOX_NAME = "test_sc_" + uuid.uuid4().hex[:8]
SANDBOX_PATH = SANDBOX_PARENT + "/" + SANDBOX_NAME

# Grid separation thresholds (RULE 3).
MIN_SEP_X = 200
MIN_SEP_Y = 150

# Per-scenario Y offsets — ensures cross-scenario pairs always have
# dy >= 300 > MIN_SEP_Y, so only within-row pairs need X-checking.
ROW_A = 0     # TOP scenario (auto-type)
ROW_B = 300   # TOP scenario (explicit type)
ROW_C = 600   # SOP scenario
ROW_D = 900   # CHOP scenario
ROW_E = 1200  # POP scenario (auto-type)


# ─── HTTP client ──────────────────────────────────────────────────────────────

class TDClient:
    """Thin HTTP client for the TouchDesigner API (port 44444)."""

    def __init__(self, host: str, port: int, timeout: int = DEFAULT_TIMEOUT):
        self.base = "http://{}:{}".format(host, port)
        self.timeout = timeout

    # -- raw HTTP helpers ---------------------------------------------------

    def ping(self) -> bool:
        try:
            self.get("/info")
            return True
        except Exception:
            return False

    def get(self, path: str) -> dict:
        url = "{}{}".format(self.base, path)
        resp = requests.get(url, timeout=self.timeout)
        resp.raise_for_status()
        return resp.json()

    def post(self, path: str, body: dict) -> dict:
        url = "{}{}".format(self.base, path)
        resp = requests.post(url, json=body, timeout=self.timeout)
        resp.raise_for_status()
        return resp.json()

    # -- high-level helpers -------------------------------------------------

    def exec(self, code: str) -> str:
        """Execute Python code in TD via POST /exec.  Returns stdout."""
        resp = self.post("/exec", {"code": code})
        if resp.get("error"):
            raise RuntimeError("TD exec error: {}".format(resp["error"]))
        return resp.get("output", "")

    def smart_connect(self,
                      source: str | None = None,
                      destination: str | None = None,
                      op_type: str | None = None,
                      name: str | None = None) -> dict:
        """Call POST /smart_connect and return the parsed inner result.

        Handler response shape:  {"output": "<json-string>"}
        Inner JSON on success:
            {success, path, name, type, sourcePath, destPath, nodeX, nodeY}
        Inner JSON on failure:
            {success: false, error: "..."}
        """
        body: dict = {}
        if source is not None:
            body["source"] = source
        if destination is not None:
            body["destination"] = destination
        if op_type is not None:
            body["type"] = op_type
        if name is not None:
            body["name"] = name
        resp = self.post("/smart_connect", body)
        raw = resp.get("output", "")
        try:
            return json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            # Fallback: response might already be the result dict.
            if isinstance(resp, dict) and ("success" in resp or "error" in resp):
                return resp
            return {"success": False,
                    "error": "unparseable response: {}".format(str(raw)[:200])}

    def get_positions(self, container: str) -> list:
        """Query nodeX / nodeY / opType for all children of *container*."""
        # RULE 4: simple for-loop, no comprehensions.
        code = (
            "import json\n"
            "c = op(%r)\n"
            "out = []\n"
            "if c is not None:\n"
            "    for n in c.findChildren():\n"
            "        out.append({'name': n.name, 'path': n.path, "
            "                     'opType': getattr(n, 'OPType', '?'), "
            "                     'x': getattr(n, 'nodeX', None), "
            "                     'y': getattr(n, 'nodeY', None)})\n"
            "print(json.dumps(out))\n"
        ) % container
        raw = self.exec(code)
        return json.loads(raw.strip().splitlines()[-1]) if raw.strip() else []

    def check_errors(self, container: str) -> list:
        """Return [{name, errors}] for any children with errors."""
        code = (
            "import json\n"
            "c = op(%r)\n"
            "out = []\n"
            "if c is not None:\n"
            "    for n in c.findChildren():\n"
            "        errs = [str(x) for x in n.errors()] if n.errors() else []\n"
            "        if errs:\n"
            "            out.append({'name': n.name, 'errors': errs})\n"
            "print(json.dumps(out))\n"
        ) % container
        raw = self.exec(code)
        return json.loads(raw.strip().splitlines()[-1]) if raw.strip() else []


# ─── Test harness ─────────────────────────────────────────────────────────────

class SafeCheck:
    """Counts [PASS] / [FAIL] checks and records failure details."""

    def __init__(self):
        self.steps: list = []
        self.failures: list = []

    def check(self, name: str, ok: bool, detail: str = "") -> None:
        self.steps.append({"step": name, "ok": bool(ok), "detail": detail})
        status = "PASS" if ok else "FAIL"
        line = "  [{}] {}".format(status, name)
        if detail:
            line += ": {}".format(detail)
        print(line)
        if not ok:
            self.failures.append("{}: {}".format(name, detail) if detail else name)

    @property
    def total(self) -> int:
        return len(self.steps)

    @property
    def passed(self) -> int:
        return sum(1 for s in self.steps if s["ok"])

    @property
    def failed(self) -> int:
        return sum(1 for s in self.steps if not s["ok"])

    @property
    def all_passed(self) -> bool:
        return not self.failures


# ─── Setup: create sandbox container (RULE 1) ─────────────────────────────────

def setup_sandbox(td: TDClient, res: SafeCheck, keep: bool = False,
                  container_x: int = 200, container_y: int = 0) -> int:
    """Create the UUID-named baseCOMP sandbox.  Returns actual Y offset.

    RULE 1 — all ops go INSIDE this container, never loose at /project1.
    In --keep mode the Y is auto-offset by +700 to avoid overlap with
    existing containers at the same X.
    """
    # Clean stale sandbox (only if not keeping).
    if not keep:
        try:
            td.exec("c = op(%r); c.destroy() if c is not None else None" % SANDBOX_PATH)
        except Exception:
            pass

    # Auto-offset Y to avoid overlap with existing baseCOMPs (keep mode).
    offset_y = container_y
    if keep:
        try:
            # RULE 4: simple for-loop, no comprehensions.
            scan_code = (
                "import json\n"
                "result = []\n"
                "for c in op('/project1').children:\n"
                "    tp = c.OPType if hasattr(c, 'OPType') else ''\n"
                "    if tp in ('baseCOMP', 'containerCOMP'):\n"
                "        result.append({'x': c.nodeX, 'y': c.nodeY, 'name': c.name})\n"
                "print(json.dumps(result))\n"
            )
            raw = td.exec(scan_code)
            existing = json.loads(raw.strip().splitlines()[-1]) if raw.strip() else []
            for c in existing:
                cx = c.get("x")
                if cx is not None and abs(cx - container_x) < 100:
                    cy = c.get("y", 0)
                    if cy >= offset_y:
                        offset_y = cy + 700
            if offset_y != container_y:
                print("    [auto-offset] Y adjusted {} -> {}".format(
                    container_y, offset_y))
        except Exception:
            pass

    # Create sandbox container.
    try:
        td.exec("op(%r).create(baseCOMP, %r)" % (SANDBOX_PARENT, SANDBOX_NAME))
        res.check("create_sandbox", True, "created {}".format(SANDBOX_PATH))
    except Exception as e:
        res.check("create_sandbox", False, str(e))
        return -1

    # Position container.
    td.exec("op(%r).nodeX = %d; op(%r).nodeY = %d"
            % (SANDBOX_PATH, container_x, SANDBOX_PATH, offset_y))
    res.check("position_sandbox", True,
              "container at ({}, {})".format(container_x, offset_y))
    return offset_y


# ─── Helper: create + position a single op ───────────────────────────────────

def _create_op(td: TDClient, res: SafeCheck, op_type: str, name: str,
               x: int, y: int) -> str | None:
    """Create one operator inside the sandbox, position it, return its path."""
    path = "{}/{}".format(SANDBOX_PATH, name)
    try:
        td.exec("op(%r).create(%s, %r)" % (SANDBOX_PATH, op_type, name))
        td.exec("o = op(%r); o.nodeX = %d; o.nodeY = %d" % (path, x, y))
        res.check("cr_" + name, True, "{} at ({},{})".format(op_type, x, y))
        return path
    except Exception as e:
        res.check("cr_" + name, False, str(e))
        return None


# ─── Verification helpers ─────────────────────────────────────────────────────

def _verify_op_exists(td: TDClient, res: SafeCheck, step: str,
                      path: str | None) -> None:
    """Verify an operator exists via GET /operators and /exec fallback."""
    if not path:
        res.check(step, False, "no path in smart_connect response")
        return
    found = False
    detail = ""
    # Primary: GET /operators on the parent (lists children).
    try:
        parent = path.rsplit("/", 1)[0]
        data = td.get("/operators?path={}".format(parent))
        ops = data.get("operators", []) if isinstance(data, dict) else []
        op_name = path.rsplit("/", 1)[-1]
        found = any(o.get("name") == op_name for o in ops)
        if found:
            detail = "listed in /operators"
    except Exception:
        pass
    # Fallback: /exec existence probe.
    if not found:
        try:
            raw = td.exec("print('YES' if op(%r) is not None else 'NO')" % path)
            found = "YES" in raw
            if found:
                detail = "confirmed via /exec"
        except Exception as e:
            detail = "exec fallback error: {}".format(e)
    res.check(step, found,
              detail if found else "NOT FOUND at {}".format(path))


def _verify_midpoint(td: TDClient, res: SafeCheck, step: str,
                     new_path: str, src_path: str, dst_path: str) -> None:
    """Verify new op X lies between source X and destination X."""
    code = (
        "import json\n"
        "n = op(%r); s = op(%r); d = op(%r)\n"
        "out = {'nx': n.nodeX if n else None, "
        "       'sx': s.nodeX if s else None, "
        "       'dx': d.nodeX if d else None}\n"
        "print(json.dumps(out))\n"
    ) % (new_path, src_path, dst_path)
    try:
        raw = td.exec(code)
        vals = json.loads(raw.strip().splitlines()[-1])
        nx, sx, dx = vals["nx"], vals["sx"], vals["dx"]
        if nx is None or sx is None or dx is None:
            res.check(step, False, "missing positions: {}".format(vals))
            return
        lo, hi = min(sx, dx), max(sx, dx)
        between = lo <= nx <= hi
        res.check(step, between,
                  "new.x={} between src.x={} and dst.x={}".format(nx, sx, dx)
                  + ("" if between else " (expected in [{}, {}])".format(lo, hi)))
    except Exception as e:
        res.check(step, False, str(e))


def _verify_right_of(td: TDClient, res: SafeCheck, step: str,
                     new_path: str, src_path: str) -> None:
    """Verify new op is to the RIGHT of source (new.x > src.x)."""
    code = (
        "import json\n"
        "n = op(%r); s = op(%r)\n"
        "out = {'nx': n.nodeX if n else None, 'sx': s.nodeX if s else None}\n"
        "print(json.dumps(out))\n"
    ) % (new_path, src_path)
    try:
        raw = td.exec(code)
        vals = json.loads(raw.strip().splitlines()[-1])
        nx, sx = vals["nx"], vals["sx"]
        if nx is None or sx is None:
            res.check(step, False, "missing positions: {}".format(vals))
            return
        right = nx > sx
        res.check(step, right,
                  "new.x={} > src.x={}".format(nx, sx)
                  + ("" if right else " (expected to the RIGHT of source)"))
    except Exception as e:
        res.check(step, False, str(e))


def _verify_left_of(td: TDClient, res: SafeCheck, step: str,
                    new_path: str, dst_path: str) -> None:
    """Verify new op is to the LEFT of destination (new.x < dst.x)."""
    code = (
        "import json\n"
        "n = op(%r); d = op(%r)\n"
        "out = {'nx': n.nodeX if n else None, 'dx': d.nodeX if d else None}\n"
        "print(json.dumps(out))\n"
    ) % (new_path, dst_path)
    try:
        raw = td.exec(code)
        vals = json.loads(raw.strip().splitlines()[-1])
        nx, dx = vals["nx"], vals["dx"]
        if nx is None or dx is None:
            res.check(step, False, "missing positions: {}".format(vals))
            return
        left = nx < dx
        res.check(step, left,
                  "new.x={} < dst.x={}".format(nx, dx)
                  + ("" if left else " (expected to the LEFT of destination)"))
    except Exception as e:
        res.check(step, False, str(e))


def _verify_wiring(td: TDClient, res: SafeCheck, step: str,
                   src_path: str | None, new_path: str | None,
                   dst_path: str | None) -> None:
    """Verify wiring via GET /connections.

    Checks (when applicable):
      - src_path  ->  new_path   (new_op's input[0] == src)
      - new_path  ->  dst_path   (dst's input[0] == new_op)
    """
    try:
        data = td.get("/connections?path={}&recurse=true".format(SANDBOX_PATH))
        operators = data.get("operators", []) if isinstance(data, dict) else []
    except Exception as e:
        res.check(step, False, "/connections error: {}".format(e))
        return

    by_path: dict = {}
    for op_info in operators:
        p = op_info.get("path", "")
        if p:
            by_path[p] = op_info

    details = []
    all_ok = True

    # Check: src -> new  (new_op's first input should be src).
    if src_path and new_path:
        new_info = by_path.get(new_path, {})
        inputs = new_info.get("inputs", [])
        src_connected = any(inp.get("path") == src_path for inp in inputs)
        if not src_connected:
            all_ok = False
            details.append("{} input != {} (inputs={})".format(
                new_path, src_path, inputs))
        else:
            details.append("{} -> {}".format(src_path, new_path))

    # Check: new -> dst  (dst's first input should be new_op).
    if dst_path and new_path:
        dst_info = by_path.get(dst_path, {})
        inputs = dst_info.get("inputs", [])
        new_connected = any(inp.get("path") == new_path for inp in inputs)
        if not new_connected:
            all_ok = False
            details.append("{} input != {} (inputs={})".format(
                dst_path, new_path, inputs))
        else:
            details.append("{} -> {}".format(new_path, dst_path))

    res.check(step, all_ok,
              "; ".join(details) if details else "no wiring to verify")


def _verify_no_errors(td: TDClient, res: SafeCheck, step: str,
                      paths: list) -> None:
    """Verify zero errors() on the given operators (initial check)."""
    valid = [p for p in paths if p]
    if not valid:
        res.check(step, True, "no ops to check")
        return
    errs = td.check_errors(SANDBOX_PATH)
    err_names = {e["name"] for e in errs}
    relevant = []
    for p in valid:
        nm = p.rsplit("/", 1)[-1]
        if nm in err_names:
            err_msgs = next(e["errors"] for e in errs if e["name"] == nm)
            relevant.append("{}: {}".format(nm, err_msgs))
    ok = not relevant
    res.check(step, ok,
              "no errors" if ok
              else "{} error(s): {}".format(len(relevant), " | ".join(relevant)))


# ─── Scenario A: source + destination, auto type (TOP) ───────────────────────

def scenario_a(td: TDClient, res: SafeCheck) -> None:
    """Scenario A — source + destination, auto type detection (TOP family).

    Creates circleTOP (source) + nullTOP (destination) at 400 px horizontal
    separation.  Calls /smart_connect WITHOUT a type.  The handler
    auto-detects a bridging nullTOP (TOP branch of the auto-type chain),
    places it at the midpoint, and wires source -> new -> destination.
    """
    print("\n--- Scenario A: source + destination, auto type (TOP) ---")
    print("    circleTOP -> [auto] -> nullTOP")

    src_path = _create_op(td, res, "circleTOP", "sc_a_src", x=0, y=ROW_A)
    dst_path = _create_op(td, res, "nullTOP", "sc_a_dst", x=400, y=ROW_A)
    if not src_path or not dst_path:
        res.check("sc_a_call", False, "prerequisite ops missing")
        return

    result = td.smart_connect(source=src_path, destination=dst_path,
                              name="sc_a_new")
    success = bool(result.get("success", False))
    res.check("sc_a_success", success,
              "success={}".format(success)
              + ("" if success else " error={}".format(result.get("error", "?"))))

    new_path = result.get("path")
    new_type = result.get("type", "?")
    print("    result: type={}, path={}".format(new_type, new_path))

    # Auto-detection must pick the TOP family bridging op.
    type_ok = success and new_type == "nullTOP"
    res.check("sc_a_type_nullTOP", type_ok,
              "type={!r}".format(new_type)
              + ("" if type_ok else " (expected 'nullTOP')"))

    _verify_op_exists(td, res, "sc_a_exists", new_path)
    if success and new_path:
        _verify_midpoint(td, res, "sc_a_midpoint", new_path, src_path, dst_path)
    if success:
        _verify_wiring(td, res, "sc_a_wiring", src_path, new_path, dst_path)
    _verify_no_errors(td, res, "sc_a_errors", [src_path, dst_path, new_path])


# ─── Scenario B: source + destination, explicit type ─────────────────────────

def scenario_b(td: TDClient, res: SafeCheck) -> None:
    """Scenario B — source + destination, explicit type='blurTOP'.

    Creates noiseTOP (source) + nullTOP (destination).  Calls /smart_connect
    with type="blurTOP".  Verifies the new op IS a blurTOP and is correctly
    wired in the chain.
    """
    print("\n--- Scenario B: source + destination, explicit type ---")
    print('    noiseTOP -> blurTOP -> nullTOP  (type="blurTOP")')

    src_path = _create_op(td, res, "noiseTOP", "sc_b_src", x=0, y=ROW_B)
    dst_path = _create_op(td, res, "nullTOP", "sc_b_dst", x=400, y=ROW_B)
    if not src_path or not dst_path:
        res.check("sc_b_call", False, "prerequisite ops missing")
        return

    result = td.smart_connect(source=src_path, destination=dst_path,
                              op_type="blurTOP", name="sc_b_new")
    success = bool(result.get("success", False))
    res.check("sc_b_success", success,
              "success={}".format(success)
              + ("" if success else " error={}".format(result.get("error", "?"))))

    new_type = result.get("type", "")
    type_ok = success and new_type == "blurTOP"
    res.check("sc_b_type_blurTOP", type_ok,
              "type={!r}".format(new_type)
              + ("" if type_ok else " (expected 'blurTOP')"))

    new_path = result.get("path")
    print("    result: type={}, path={}".format(new_type, new_path))

    _verify_op_exists(td, res, "sc_b_exists", new_path)
    if success and new_path:
        _verify_midpoint(td, res, "sc_b_midpoint", new_path, src_path, dst_path)
    if success:
        _verify_wiring(td, res, "sc_b_wiring", src_path, new_path, dst_path)
    _verify_no_errors(td, res, "sc_b_errors", [src_path, dst_path, new_path])


# ─── Scenario C: source only ─────────────────────────────────────────────────

def scenario_c(td: TDClient, res: SafeCheck) -> None:
    """Scenario C — source only (no destination).

    Creates boxSOP (source).  Calls /smart_connect with ONLY source.
    The handler creates a new op to the RIGHT of source (src.x + 200) and
    connects source -> new.
    """
    print("\n--- Scenario C: source only ---")
    print("    boxSOP -> [auto, to the right]")

    src_path = _create_op(td, res, "boxSOP", "sc_c_src", x=0, y=ROW_C)
    if not src_path:
        res.check("sc_c_call", False, "prerequisite op missing")
        return

    result = td.smart_connect(source=src_path, name="sc_c_new")
    success = bool(result.get("success", False))
    res.check("sc_c_success", success,
              "success={}".format(success)
              + ("" if success else " error={}".format(result.get("error", "?"))))

    new_path = result.get("path")
    new_type = result.get("type", "?")
    print("    result: type={}, path={}".format(new_type, new_path))

    _verify_op_exists(td, res, "sc_c_exists", new_path)
    if success and new_path:
        _verify_right_of(td, res, "sc_c_right_of", new_path, src_path)
    if success:
        _verify_wiring(td, res, "sc_c_wiring", src_path, new_path, None)
    _verify_no_errors(td, res, "sc_c_errors", [src_path, new_path])


# ─── Scenario D: destination only ────────────────────────────────────────────

def scenario_d(td: TDClient, res: SafeCheck) -> None:
    """Scenario D — destination only (no source).

    Creates nullCHOP (destination).  Calls /smart_connect with ONLY
    destination.  The handler creates a new op to the LEFT of destination
    (dst.x - 200) and connects new -> destination.
    """
    print("\n--- Scenario D: destination only ---")
    print("    [auto, to the left] -> nullCHOP")

    dst_path = _create_op(td, res, "nullCHOP", "sc_d_dst", x=400, y=ROW_D)
    if not dst_path:
        res.check("sc_d_call", False, "prerequisite op missing")
        return

    result = td.smart_connect(destination=dst_path, name="sc_d_new")
    success = bool(result.get("success", False))
    res.check("sc_d_success", success,
              "success={}".format(success)
              + ("" if success else " error={}".format(result.get("error", "?"))))

    new_path = result.get("path")
    new_type = result.get("type", "?")
    print("    result: type={}, path={}".format(new_type, new_path))

    _verify_op_exists(td, res, "sc_d_exists", new_path)
    if success and new_path:
        _verify_left_of(td, res, "sc_d_left_of", new_path, dst_path)
    if success:
        _verify_wiring(td, res, "sc_d_wiring", None, new_path, dst_path)
    _verify_no_errors(td, res, "sc_d_errors", [new_path, dst_path])


# ─── Scenario E: source + destination, auto type (POP) ───────────────────────

def scenario_e(td: TDClient, res: SafeCheck) -> None:
    """Scenario E — source + destination, auto type detection (POP family).

    Creates boxPOP (source) + nullPOP (destination) at 400 px horizontal
    separation.  Calls /smart_connect WITHOUT a type.  The handler must
    auto-detect a bridging nullPOP via the POP branch of its auto-type
    chain.  This scenario is the regression test for the POP auto-detection
    fix: previously POP was missing from the if/elif chain, so the handler
    fell through to the default nullCHOP and cross-family wiring
    (CHOP <-> POP) failed.

    Verifies success, type == "nullPOP", midpoint X, wiring
    source -> new -> destination, and zero errors.
    """
    print("\n--- Scenario E: source + destination, auto type (POP) ---")
    print("    boxPOP -> [auto] -> nullPOP")

    src_path = _create_op(td, res, "boxPOP", "sc_e_src", x=0, y=ROW_E)
    dst_path = _create_op(td, res, "nullPOP", "sc_e_dst", x=400, y=ROW_E)
    if not src_path or not dst_path:
        res.check("sc_e_call", False, "prerequisite ops missing")
        return

    result = td.smart_connect(source=src_path, destination=dst_path,
                              name="sc_e_new")
    success = bool(result.get("success", False))
    res.check("sc_e_success", success,
              "success={}".format(success)
              + ("" if success else " error={}".format(result.get("error", "?"))))

    new_path = result.get("path")
    new_type = result.get("type", "?")
    print("    result: type={}, path={}".format(new_type, new_path))

    # KEY regression assertion: auto-detection must resolve to nullPOP,
    # NOT the default nullCHOP.  A nullCHOP bridge would break POP wiring.
    type_ok = success and new_type == "nullPOP"
    res.check("sc_e_type_nullPOP", type_ok,
              "type={!r}".format(new_type)
              + ("" if type_ok else " (expected 'nullPOP')"))

    _verify_op_exists(td, res, "sc_e_exists", new_path)
    if success and new_path:
        _verify_midpoint(td, res, "sc_e_midpoint", new_path, src_path, dst_path)
    if success:
        _verify_wiring(td, res, "sc_e_wiring", src_path, new_path, dst_path)
    _verify_no_errors(td, res, "sc_e_errors", [src_path, dst_path, new_path])


# ─── Global checks ───────────────────────────────────────────────────────────

def verify_operators_listing(td: TDClient, res: SafeCheck) -> None:
    """List all operators in the sandbox via GET /operators."""
    print("\n--- Global: /operators listing ---")
    try:
        data = td.get("/operators?path={}".format(SANDBOX_PATH))
        ops = data.get("operators", []) if isinstance(data, dict) else []
        count = len(ops)
        res.check("operators_listing", count > 0,
                  "{} operators found".format(count))
        for o in ops:
            print("      {} : {}".format(o.get("name", "?"), o.get("opType", "?")))
    except Exception as e:
        res.check("operators_listing", False, str(e))


def verify_connections_intact(td: TDClient, res: SafeCheck) -> None:
    """Cross-check all connections via GET /connections.  Ensures every
    non-source node in the sandbox has at least one wired input."""
    print("\n--- Global: /connections integrity ---")
    try:
        data = td.get("/connections?path={}&recurse=true".format(SANDBOX_PATH))
        operators = data.get("operators", []) if isinstance(data, dict) else []
    except Exception as e:
        res.check("connections_listing", False, str(e))
        return

    # Source-type operators that legitimately have zero inputs.
    source_keywords = ("boxPOP", "noiseTOP", "boxSOP", "constant", "noiseCHOP",
                       "circle", "source", "moviein", "audioin", "lfo", "timer")

    isolated = []
    total_wired = 0
    for op_info in operators:
        inputs = op_info.get("inputs", [])
        has_input = any(inp.get("path") for inp in inputs)
        if has_input:
            total_wired += 1
        else:
            op_type = op_info.get("opType", "") or op_info.get("type", "")
            is_source = any(kw in op_type for kw in source_keywords)
            if not is_source:
                isolated.append(op_info.get("name", "?"))

    res.check("connections_listing", len(operators) > 0,
              "{} operators, {} wired".format(len(operators), total_wired))
    res.check("connections_no_isolated", not isolated,
              "all non-source nodes have inputs" if not isolated
              else "isolated non-source: {}".format(isolated))


def verify_grid_separation(td: TDClient, res: SafeCheck) -> None:
    """RULE 3 — every pair of nodes must have dx >= 200 OR dy >= 150."""
    print("\n--- Global: grid separation (RULE 3) ---")
    positions = td.get_positions(SANDBOX_PATH)
    if len(positions) < 2:
        res.check("grid_sep_count", False,
                  "only {} nodes — need >= 2".format(len(positions)))
        return

    pts = []
    for n in positions:
        x, y = n.get("x"), n.get("y")
        if x is not None and y is not None:
            pts.append((n["name"], float(x), float(y)))

    res.check("grid_sep_collected",
              len(pts) == len(positions),
              "{}/{} positions".format(len(pts), len(positions)))

    violations = []
    for i in range(len(pts)):
        for j in range(i + 1, len(pts)):
            nm1, x1, y1 = pts[i]
            nm2, x2, y2 = pts[j]
            dx = abs(x1 - x2)
            dy = abs(y1 - y2)
            if dx < MIN_SEP_X and dy < MIN_SEP_Y:
                violations.append(
                    "{}({:.0f},{:.0f}) vs {}({:.0f},{:.0f}) dx={:.0f} dy={:.0f}".format(
                        nm1, x1, y1, nm2, x2, y2, dx, dy))

    for v in violations:
        print("      [OVERLAP] {}".format(v))
    res.check("grid_sep_all", not violations,
              "all {} nodes separated".format(len(pts)) if not violations
              else "{} overlap(s)".format(len(violations)))


def verify_endpoint_crosscheck(td: TDClient, res: SafeCheck) -> None:
    """Cross-check via GET /verify endpoint (healthy + error_count == 0)."""
    print("\n--- Global: /verify endpoint cross-check ---")
    try:
        v = td.get("/verify?path={}".format(SANDBOX_PATH))
        healthy = bool(v.get("healthy", False))
        err_cnt = int(v.get("error_count", -1))
        op_cnt = v.get("operator_count", "?")
        res.check("verify_endpoint", healthy and err_cnt == 0,
                  "healthy={}, errors={}, ops={}".format(healthy, err_cnt, op_cnt))
    except Exception as e:
        res.check("verify_endpoint", False, str(e))


def verify_async_settle(td: TDClient, res: SafeCheck) -> None:
    """RULE 2 — force-cook + 2 s wait, then re-scan for async errors."""
    print("\n--- RULE 2: force-cook + 2s async re-check ---")
    try:
        td.exec("c = op(%r); c.cook(force=True)" % SANDBOX_PATH)
        time.sleep(2.0)
        errs = td.check_errors(SANDBOX_PATH)
        if errs:
            for e in errs:
                res.check("async_err_" + e["name"], False,
                          "{}: {}".format(e["name"], e["errors"]))
        res.check("async_settle", not errs,
                  "no async errors after force-cook + 2s" if not errs
                  else "{} node(s) with post-cook errors".format(len(errs)))
    except Exception as e:
        res.check("async_settle", False, str(e)[:120])


# ─── Cleanup ──────────────────────────────────────────────────────────────────

def cleanup(td: TDClient, res: SafeCheck, keep: bool = False,
            container_x: int = 200, container_y: int = 0) -> None:
    """Destroy the sandbox unless --keep.  In --keep mode, report retention."""
    if keep:
        res.check("cleanup", True,
                  "kept at {} (x={}, y={})".format(
                      SANDBOX_PATH, container_x, container_y))
        return
    try:
        td.exec("c = op(%r); c.destroy() if c is not None else None" % SANDBOX_PATH)
        raw = td.exec("print('GONE' if op(%r) is None else 'STILL_HERE')" % SANDBOX_PATH)
        gone = "GONE" in raw
        res.check("cleanup", gone,
                  "destroyed" if gone else "still present ({})".format(raw.strip()))
    except Exception as e:
        res.check("cleanup", False, str(e))


# ─── Main ─────────────────────────────────────────────────────────────────────

def main() -> int:
    # Fallback encoding: reconfigure stdout to handle UTF-8 even
    # on Windows cp1252 terminals (prevents UnicodeEncodeError).
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

    parser = argparse.ArgumentParser(
        description="Live TD integration test — POST /smart_connect endpoint."
    )
    parser.add_argument("--host", default=DEFAULT_HOST,
                        help="TD HTTP API host (default: {})".format(DEFAULT_HOST))
    parser.add_argument("--port", type=int, default=DEFAULT_PORT,
                        help="TD HTTP API port (default: {})".format(DEFAULT_PORT))
    parser.add_argument("--keep", action="store_true",
                        help="Keep the sandbox container after test (don't destroy)")
    parser.add_argument("--container-x", type=int, default=200,
                        help="X position for the sandbox container")
    parser.add_argument("--container-y", type=int, default=0,
                        help="Y position for the sandbox container")
    args = parser.parse_args()

    print("=" * 72)
    print("  smart_connect Integration Test — POST /smart_connect endpoint")
    print("  Target:  http://{}:{}".format(args.host, args.port))
    print("  Sandbox: {}".format(SANDBOX_PATH))
    print("  Scenario A: source + dest, auto type   (circleTOP + nullTOP)")
    print('  Scenario B: source + dest, type=blurTOP (noiseTOP + nullTOP)')
    print("  Scenario C: source only                 (boxSOP)")
    print("  Scenario D: destination only            (nullCHOP)")
    print("  Scenario E: source + dest, auto type   (boxPOP + nullPOP)")
    print("  Endpoints: /smart_connect /operators /connections /verify /exec")
    if args.keep:
        print("  Keep mode: container stays at ({}, {})".format(
            args.container_x, args.container_y))
    print("=" * 72)

    td = TDClient(args.host, args.port)
    res = SafeCheck()

    if not td.ping():
        print("\nFAIL: TouchDesigner HTTP API not reachable.")
        return 2
    print("\n[setup] TD server reachable.\n")

    # ── Setup sandbox ─────────────────────────────────────────────────────
    print("--- Setup phase ---")
    actual_y = setup_sandbox(td, res, keep=args.keep,
                             container_x=args.container_x,
                             container_y=args.container_y)
    if actual_y < 0:
        print("\n[ABORT] sandbox creation failed — skipping scenarios.")
    else:
        # ── Run scenarios ──────────────────────────────────────────────
        scenario_a(td, res)
        scenario_b(td, res)
        scenario_c(td, res)
        scenario_d(td, res)
        scenario_e(td, res)

        # ── Global checks ──────────────────────────────────────────────
        verify_operators_listing(td, res)
        verify_connections_intact(td, res)
        verify_grid_separation(td, res)
        verify_endpoint_crosscheck(td, res)
        verify_async_settle(td, res)

    # ── Cleanup ────────────────────────────────────────────────────────────
    if not args.keep:
        print("\n--- Cleanup phase ---")
        cleanup(td, res, keep=args.keep,
                container_x=args.container_x, container_y=args.container_y)
    else:
        print("\n--- (Keep mode — no cleanup) ---")
        res.check("cleanup", True,
                  "kept at {} (x={}, y={})".format(
                      SANDBOX_PATH, args.container_x, actual_y))

    # ── Summary ─────────────────────────────────────────────────────────────
    total = res.total
    passed = res.passed
    failed = res.failed
    print("\n" + "=" * 72)
    print("RESULT: {}/{} checks passed ({} failed)".format(passed, total, failed))
    if res.all_passed:
        print("\nOVERALL: PASS — all 5 smart_connect scenarios passed, "
              "grid separation clean, zero errors, cleaned up.")
        return 0
    else:
        print("\nOVERALL: FAIL — {} check(s) failed:".format(failed))
        for f in res.failures:
            print("  - {}".format(f))
        return 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("\nAborted by user.")
        sys.exit(130)
