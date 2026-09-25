#!/usr/bin/env python3
"""MCP stdio server for TouchDesigner.

Implements the Model Context Protocol (MCP) over stdio using JSON-RPC 2.0.
Translates MCP tool/resource calls to HTTP calls against the TD API at
127.0.0.1:44444.

Usage:
    python mcp_server_stdio.py          # run interactively
    echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | python mcp_server_stdio.py

Supports:
  - tools/list
  - tools/call
  - resources/list
  - resources/read

All tools are backed by the TD HTTP API at http://127.0.0.1:44444.
"""

from __future__ import annotations

import json
import os
import re
import sys
import time
import traceback
from datetime import datetime, timezone
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

# Loopback always means 127.0.0.1: the TD bridge (and the test mocks) only
# listen on IPv4, while on Windows resolving "localhost" returns ::1 first, so
# every request would stall ~2s on dead IPv6 SYNs before falling back
# (measured: 2011ms vs 2.8ms per round-trip). Same normalization the TS client
# does in api/src/index.ts (_normalize_host).
TD_API_BASE = "http://127.0.0.1:44444"
REQUEST_TIMEOUT = 30
RETRY_ATTEMPTS = 3
RETRY_BASE_DELAY_S = 0.15

# ---------------------------------------------------------------------------
# Client diagnostics — parity with api/src/diagnostics.ts (backlog item 57).
#
# The TS client keeps a ring buffer + JSONL log, classifies transport errors
# and attaches an actionable envelope. This client had none: a bridge failure
# surfaced as a bare {"error": ...} with no evidence. The classification
# table, retry rules and hint texts below are COPIED from diagnostics.ts —
# the parity contract is tests/test_client_contract.py.
# ---------------------------------------------------------------------------

# TDErrorKind parity
def _classify_connection_error(msg: str) -> str:
    """Classify a transport error message. Mirrors classifyConnectionError() in
    api/src/diagnostics.ts — order of the checks matters (reset patterns before
    the generic unreachable wording, aborts first). urllib formats differ from
    undici's, so the patterns ALSO accept errno spellings ([Errno 104] = reset,
    [Errno 111] = refused, 'HTTP Error 500') — the TS parity table is the
    contract (tests/bridge_contract.json error_classification.patterns)."""
    m = (msg or "").lower()
    if re.search(r"timed out|timeout|aborted|abort", m):
        return "timeout"
    if re.search(r"http \d{3}|http error \d{3}", m):
        return "http_error"
    if re.search(
        r"econnreset|socket hang up|connection dropped|epipe|other side closed|premature close|terminated|errno 104|connection reset|winerror 10054",
        m,
    ):
        return "connect_reset"
    if re.search(
        r"econnrefused|enotfound|eaddrnotavail|ehostunreach|enetunreach|fetch failed|unable to connect|connection refused|could not connect|errno 111|winerror 10061|actively refused",
        m,
    ):
        return "bridge_unreachable"
    if re.search(r"websocket", m):
        return "ws_error"
    return "unknown"


def _is_retryable(kind: str, method: str) -> bool:
    """Same uncertainty rule as isRetryable() in diagnostics.ts:
    bridge_unreachable always (the request never reached TD); connect_reset /
    timeout only for reads (a write may have executed); http_error never."""
    m = (method or "GET").upper()
    is_read = m in ("GET", "HEAD")
    if kind == "bridge_unreachable":
        return True
    if kind in ("connect_reset", "timeout"):
        return is_read
    return False


# KIND_HINTS copied VERBATIM from api/src/diagnostics.ts (do not rephrase —
# the parity test asserts equality with the TS source).
KIND_HINTS: dict[str, str] = {
    "bridge_unreachable": (
        "El bridge de TD no está escuchando. Verificá que TD esté abierto, que el componente del API esté cargado "
        "y que el puerto sea el correcto (Settings → MCP). Si acabás de abrir TD, reintentá en unos segundos."
    ),
    "connect_reset": (
        "La conexión se cortó con el socket ya abierto: TD puede haberse cerrado, congelado o quedado sin cocinar. "
        "Revisá el estado de TD antes de reintentar una escritura (pudo haberse aplicado)."
    ),
    "timeout": (
        "El bridge no respondió dentro del timeout. Suele ser TD ocupado u operación pesada: "
        "acotá el scope (path/limit) antes de reintentar."
    ),
    "http_error": (
        "TD respondió con un error HTTP: es una respuesta real, no un problema de conexión. "
        "Leé el mensaje del bridge y corregí la llamada."
    ),
    "ws_error": (
        "Falló el transporte WebSocket. Si el modo es 'auto' el cliente reintenta por HTTP; "
        "si es 'websocket', revisá que ese transporte esté disponible."
    ),
    "unknown": "Error no clasificado del transporte. Adjuntá el log del cliente al reportar.",
}

# Call log: JSONL at %TEMP%/tdmcp-client.log (TDMCP_CLIENT_LOG overrides;
# off/0/false/no/none disables the file). Rotation at ~1 MB, one generation.
_LOG_MAX_BYTES = 1_000_000
_ring: list[dict[str, Any]] = []
_RING_MAX = 200
_last_ok_call: str | None = None


def _client_log_path() -> str | None:
    env = os.environ.get("TDMCP_CLIENT_LOG", "").strip()
    if not env:
        import tempfile

        return os.path.join(tempfile.gettempdir(), "tdmcp-client.log")
    if re.match(r"^(off|0|false|no|none)$", env, re.IGNORECASE):
        return None
    return env


def _record_call(rec: dict[str, Any]) -> None:
    """Append to the ring + JSONL file. Never raises: diagnostics must not be
    the reason a call fails (same contract as recordCall in diagnostics.ts)."""
    global _last_ok_call
    _ring.append(rec)
    if len(_ring) > _RING_MAX:
        del _ring[: len(_ring) - _RING_MAX]
    if rec.get("ok"):
        _last_ok_call = rec.get("ts")
    file = _client_log_path()
    if not file:
        return
    try:
        os.makedirs(os.path.dirname(file) or ".", exist_ok=True)
        if os.path.exists(file) and os.path.getsize(file) > _LOG_MAX_BYTES:
            os.replace(file, file + ".1")
        with open(file, "a", encoding="utf-8") as f:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")
    except Exception:
        pass


def _safe_target(path: str) -> str:
    """Path without query string — keeps records comparable across calls."""
    q = path.find("?")
    return path if q == -1 else path[:q]


def _error_envelope(kind: str, method: str, target: str, attempts: int,
                    last_error: str) -> dict[str, Any]:
    """Same fields as TDErrorEnvelope in api/src/index.ts."""
    host_port = TD_API_BASE.replace("http://", "")
    return {
        "kind": kind,
        "bridge": host_port,
        "transport": "http",
        "method": method,
        "target": target,
        "attempts": attempts,
        "last_ok_call": _last_ok_call,
        "hint": KIND_HINTS.get(kind, KIND_HINTS["unknown"]),
        "benign": False,
        "error": last_error[:300],
    }


# ---------------------------------------------------------------------------
# Security: escape single quotes for embedding into TD Python code strings
# ---------------------------------------------------------------------------

def _py_esc(s: str) -> str:
    """Escape a string for safe embedding inside single-quoted Python strings."""
    return s.replace("\\", "\\\\").replace("'", "\\'")


def _validate_operator_type(op_type: str) -> str:
    """Validate that op_type is a safe Python class reference (e.g. td.glslPOP).
    Allows alphanumeric characters, dots, and underscores only."""
    if not re.match(r'^[a-zA-Z_][a-zA-Z0-9_.]*$', op_type):
        raise ValueError(f"Invalid operator type: '{op_type}' — must be a valid Python class reference")
    return op_type


# ---------------------------------------------------------------------------
# HTTP helpers — classified retry + call log + error envelope
# ---------------------------------------------------------------------------

def _http_request(path: str, method: str = "GET", body: dict[str, Any] | None = None) -> dict[str, Any]:
    """One HTTP request against the TD bridge. Raises _TDRequestError on
    transport failure after the classified retry loop; returns parsed JSON on
    success. A non-2xx answer is http_error and is NEVER retried."""
    url = f"{TD_API_BASE}{path}"
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = Request(url, data=data, method=method)
    if body is not None:
        req.add_header("Content-Type", "application/json")

    with urlopen(req, timeout=REQUEST_TIMEOUT) as resp:
        raw = resp.read().decode("utf-8")
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        raise _TDRequestError("unknown", method, _safe_target(path), 1,
                              f"Non-JSON response: {raw[:200]}")


class _TDRequestError(Exception):
    """Transport failure with the parity envelope attached (TDErrorEnvelope
    in api/src/index.ts)."""

    def __init__(self, kind: str, method: str, target: str, attempts: int,
                 error: str):
        self.envelope = _error_envelope(kind, method, target, attempts, error)
        self.kind = kind
        super().__init__(
            f"{error} [bridge={self.envelope['bridge']} kind={kind} "
            f"attempts={attempts} "
            f"last_ok={self.envelope['last_ok_call'] or 'never'}]"
        )


def _http_with_retry(path: str, method: str, body: dict[str, Any] | None = None) -> dict[str, Any]:
    """Request with the TS client's classified retry loop:
    bridge_unreachable retries always (request never left the client),
    connect_reset/timeout only reads, http_error never. Every attempt is
    recorded to the ring + JSONL log; failure raises _TDRequestError whose
    message carries the envelope summary."""
    target = _safe_target(path)
    attempt = 0
    last_kind = "unknown"
    last_error = ""
    while attempt < RETRY_ATTEMPTS:
        attempt += 1
        started = time.monotonic()
        try:
            url = f"{TD_API_BASE}{path}"
            data = json.dumps(body).encode("utf-8") if body is not None else None
            req = Request(url, data=data, method=method)
            if body is not None:
                req.add_header("Content-Type", "application/json")
            with urlopen(req, timeout=REQUEST_TIMEOUT) as resp:
                raw = resp.read().decode("utf-8")
            result = json.loads(raw)
            _record_call({
                "ts": datetime.now(timezone.utc).isoformat(),
                "target": target,
                "method": method,
                "ok": True,
                "ms": int((time.monotonic() - started) * 1000),
                "attempt": attempt,
                "transport": "http",
            })
            return result
        except HTTPError as e:
            # TD answered with a real (non-2xx) status: never a transport issue,
            # never retried. Read the body for the message (best effort).
            try:
                detail = e.read().decode("utf-8", "replace")[:200]
            except Exception:
                detail = ""
            last_kind = "http_error"
            last_error = f"HTTP {e.code} {e.reason}: {detail}".strip()
        except json.JSONDecodeError:
            # TD answered but not with JSON: a real (broken) answer — classify
            # like the TS client treats an unparseable body (unknown), no retry.
            last_kind = "unknown"
            last_error = f"Non-JSON response: {raw[:200]}"
        except Exception as e:  # URLError, socket.timeout, OSError
            msg = str(e)
            cause = getattr(e, "reason", None) or getattr(e, "__cause__", None)
            if cause is not None:
                msg = f"{msg} {cause}"
            if isinstance(e, (TimeoutError,)) or "timed out" in msg.lower():
                last_kind = "timeout"
                last_error = f"Request timed out after {REQUEST_TIMEOUT * 1000}ms: {url}"
            else:
                last_kind = _classify_connection_error(msg)
                last_error = msg
        _record_call({
            "ts": datetime.now(timezone.utc).isoformat(),
            "target": target,
            "method": method,
            "ok": False,
            "ms": int((time.monotonic() - started) * 1000),
            "attempt": attempt,
            "transport": "http",
            "kind": last_kind,
            "error": last_error[:300],
        })
        if not _is_retryable(last_kind, method) or attempt >= RETRY_ATTEMPTS:
            break
        time.sleep(RETRY_BASE_DELAY_S * (2 ** (attempt - 1)))
    raise _TDRequestError(last_kind, method, target, attempt, last_error)


def _http_get(path: str) -> dict[str, Any]:
    """Perform GET against the TD API. On transport failure returns the
    parity envelope dict (kind/bridge/attempts/last_ok_call/hint) with an
    "error" key — the same diagnosis the TS client attaches to TDRequestError."""
    try:
        return _http_with_retry(path, "GET")
    except _TDRequestError as e:
        env = dict(e.envelope)
        env["error"] = str(e)
        return {"error": env["error"], "kind": e.kind,
                "envelope": env}


def _http_post(path: str, body: dict[str, Any]) -> dict[str, Any]:
    """Perform POST against the TD API with the same classified retry + log
    + envelope as _http_get."""
    try:
        return _http_with_retry(path, "POST", body)
    except _TDRequestError as e:
        env = dict(e.envelope)
        env["error"] = str(e)
        return {"error": env["error"], "kind": e.kind,
                "envelope": env}


# ---------------------------------------------------------------------------
# Tool definitions
# ---------------------------------------------------------------------------

TOOL_DEFINITIONS: list[dict[str, Any]] = [
    {
        "name": "create_td_node",
        "description": "Create a new TouchDesigner operator node",
        "inputSchema": {
            "type": "object",
            "properties": {
                "type": {"type": "string", "description": "TD operator type (e.g. 'td.glslPOP', 'td.boxPOP')"},
                "name": {"type": "string", "description": "Name for the new operator"},
                "parent": {"type": "string", "description": "Parent path (default: /project1)"},
                "replace": {"type": "boolean", "description": "Destroy an existing operator with the same name first (TD silently renames on collision otherwise: noise1 -> noise1)"},
            },
            "required": ["type", "name"],
        },
    },
    {
        "name": "get_td_pop_attributes",
        "description": "Read POP geometry data: point/prim counts, attribute list (pointAttributes), and numeric samples of named attributes. Custom GLSL attributes are CPU-readable here once the POP cooked (docs/MCP_REAL_CASES.md F1/F3).",
        "inputSchema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "POP operator path to inspect"},
                "attrs": {"type": "array", "items": {"type": "string"}, "description": "Attribute names to sample (default ['P','ID'])"},
                "sample_indices": {"type": "array", "items": {"type": "integer"}, "description": "Element indices to sample (default [0,1,2])"},
            },
            "required": ["path"],
        },
    },
    {
        "name": "delete_td_node",
        "description": "Delete a TouchDesigner operator node",
        "inputSchema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Path to the operator to delete"},
            },
            "required": ["path"],
        },
    },
    {
        "name": "get_td_nodes",
        "description": "List operators at a given path",
        "inputSchema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Path to list operators under"},
            },
            "required": ["path"],
        },
    },
    {
        "name": "get_td_parameters",
        "description": "Get parameters of an operator",
        "inputSchema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Path to the operator"},
            },
            "required": ["path"],
        },
    },
    {
        "name": "set_td_parameters",
        "description": "Set parameters on an operator",
        "inputSchema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Path to the operator"},
                "params": {"type": "object", "description": "Dict of parameter name -> value"},
            },
            "required": ["path", "params"],
        },
    },
    {
        "name": "connect_td_nodes",
        "description": "Connect two operators (source -> destination)",
        "inputSchema": {
            "type": "object",
            "properties": {
                "src": {"type": "string", "description": "Source operator path"},
                "dst": {"type": "string", "description": "Destination operator path"},
                "input": {"type": "integer", "description": "Input index on destination (default: 0)"},
            },
            "required": ["src", "dst"],
        },
    },
    {
        "name": "execute_td_python",
        "description": "Execute arbitrary Python code in TouchDesigner",
        "inputSchema": {
            "type": "object",
            "properties": {
                "code": {"type": "string", "description": "Python code to execute"},
            },
            "required": ["code"],
        },
    },
    {
        "name": "verify_td_network",
        "description": "Verify a network for errors and connections",
        "inputSchema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Network path to verify"},
            },
            "required": ["path"],
        },
    },
    {
        "name": "get_td_performance",
        "description": "Get TouchDesigner performance metrics (FPS, slowest ops)",
        "inputSchema": {
            "type": "object",
            "properties": {},
        },
    },
    {
        "name": "get_td_spatial_context",
        "description": "Get spatial context (*here, *this, *these, *parent)",
        "inputSchema": {
            "type": "object",
            "properties": {},
        },
    },
    {
        "name": "capture_td_screenshot",
        "description": "Capture a screenshot from TouchDesigner",
        "inputSchema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Path of the TOP operator to capture (default: active pane's TOP)"},
            },
        },
    },
    {
        "name": "get_td_help",
        "description": "Get help for a TouchDesigner module or operator type",
        "inputSchema": {
            "type": "object",
            "properties": {
                "module": {"type": "string", "description": "Module/class name (e.g. 'noiseTOP', 'glslPOP')"},
            },
            "required": ["module"],
        },
    },
]


# ---------------------------------------------------------------------------
# Tool execution
# ---------------------------------------------------------------------------

def _call_tool(name: str, arguments: dict[str, Any]) -> dict[str, Any]:
    """Execute an MCP tool by translating it to an HTTP call."""
    # ---- create_td_node ----
    if name == "create_td_node":
        op_type = _validate_operator_type(arguments.get("type", ""))
        op_name = arguments.get("name", "")
        parent = _py_esc(arguments.get("parent", "/project1"))
        op_name_esc = _py_esc(op_name)
        replace = bool(arguments.get("replace", False))
        if replace:
            # F6 (docs/MCP_REAL_CASES.md): TD renames silently on name collision
            # (pt_copy -> pt_copy1) which poisons later wiring by name. Destroy
            # the collision first, then create under the requested name.
            code = (
                "import json\n"
                "try:\n"
                f"    _p = op('{parent}')\n"
                "    if _p is None:\n"
                f"        print(json.dumps({{'success': False, 'error': 'Parent not found: {parent}'}}))\n"
                "    else:\n"
                f"        _cands = [c for c in _p.children if c.name == '{op_name_esc}']\n"
                "        _old = _cands[0] if _cands else None\n"
                "        _existed = _old is not None\n"
                "        if _old is not None:\n"
                "            _old.destroy()\n"
                f"        _n = _p.create({op_type}, '{op_name_esc}')\n"
                "        print(json.dumps({'success': True, 'path': _n.path, 'name': _n.name, 'opType': _n.OPType, 'replaced': _existed}))\n"
                "except Exception as e:\n"
                "    print(json.dumps({'success': False, 'error': str(e)}))\n"
            )
        else:
            code = f"op('{parent}').create({op_type}, '{op_name_esc}')"
        result = _http_post("/exec", {"code": code})
        return _unwrap_post(result)

    # ---- get_td_pop_attributes ----
    if name == "get_td_pop_attributes":
        path = _py_esc(arguments.get("path", ""))
        attrs = arguments.get("attrs") or ["P", "ID"]
        idxs = arguments.get("sample_indices") or [0, 1, 2]
        attr_list = ", ".join("'" + _py_esc(str(a)) + "'" for a in attrs)
        idx_list = ", ".join(str(int(i)) for i in idxs)
        code = (
            "import json\n"
            "try:\n"
            f"    _t = op('{path}')\n"
            "    if _t is None:\n"
            f"        print(json.dumps({{'success': False, 'error': 'Not found: {path}'}}))\n"
            "    else:\n"
            "        _info = {'success': True, 'path': _t.path, 'name': _t.name, 'opType': _t.OPType}\n"
            "        try:\n"
            "            _info['numPoints'] = int(_t.numPoints())\n"
            "            _info['numPrims'] = int(_t.numPrims())\n"
            "        except Exception:\n"
            "            pass\n"
            "        _attrs = []\n"
            "        try:\n"
            "            for _a in (_t.pointAttributes or ()):\n"
            "                _attrs.append({'name': _a.name, 'size': _a.size})\n"
            "        except Exception:\n"
            "            _attrs = None\n"
            "        _info['attributes'] = _attrs\n"
            "        _samples = {}\n"
            f"        for _nm in ({attr_list},):\n"
            "            _vals = []\n"
            "            try:\n"
            "                _pts = _t.points(_nm)\n"
            f"                for _i in ({idx_list},):\n"
            "                    if _i >= len(_pts):\n"
            "                        continue\n"
            "                    _v = _pts[_i]\n"
            "                    try:\n"
            "                        _vals.append(list(_v))\n"
            "                    except Exception:\n"
            "                        try:\n"
            "                            _vals.append(float(_v))\n"
            "                        except Exception:\n"
            "                            _vals.append(str(_v))\n"
            "            except Exception as _e:\n"
            "                _vals = None\n"
            "                _samples[_nm + '__error'] = str(_e)[:120]\n"
            "            _samples[_nm] = _vals\n"
            "        _info['samples'] = _samples\n"
            "        print(json.dumps(_info))\n"
            "except Exception as e:\n"
            "    print(json.dumps({'success': False, 'error': str(e)}))\n"
        )
        result = _http_post("/exec", {"code": code})
        return _unwrap_post(result)

    # ---- delete_td_node ----
    if name == "delete_td_node":
        path = _py_esc(arguments.get("path", ""))
        code = f"op('{path}').destroy()"
        result = _http_post("/exec", {"code": code})
        return _unwrap_post(result)

    # ---- get_td_nodes ----
    if name == "get_td_nodes":
        path = arguments.get("path", "/")
        result = _http_get(f"/operators?path={path}")
        return result

    # ---- get_td_parameters ----
    if name == "get_td_parameters":
        path = arguments.get("path", "/")
        result = _http_get(f"/parameters?path={path}")
        return result

    # ---- set_td_parameters ----
    if name == "set_td_parameters":
        path = arguments.get("path", "")
        # /parameters/set expects an updates array ({name, value?}); convert
        # this tool's params dict ({name: value}) to that form. The endpoint
        # also accepts a raw params dict for backwards compatibility.
        params = arguments.get("params", {})
        if isinstance(params, dict):
            updates = [{"name": str(k), "value": v} for k, v in params.items()]
        else:
            updates = params
        result = _http_post("/parameters/set", {"path": path, "updates": updates})
        return result

    # ---- connect_td_nodes ----
    if name == "connect_td_nodes":
        src = _py_esc(arguments.get("src", ""))
        dst = _py_esc(arguments.get("dst", ""))
        inp = arguments.get("input", 0)
        code = f"op('{dst}').inputConnectors[{inp}].connect(op('{src}'))"
        result = _http_post("/exec", {"code": code})
        return _unwrap_post(result)

    # ---- execute_td_python ----
    if name == "execute_td_python":
        code = arguments.get("code", "")
        result = _http_post("/exec", {"code": code})
        return result

    # ---- verify_td_network ----
    if name == "verify_td_network":
        path = arguments.get("path", "/project1")
        result = _http_get(f"/verify?path={path}")
        return result

    # ---- get_td_performance ----
    if name == "get_td_performance":
        result = _http_get("/audit/performance")
        return result

    # ---- get_td_spatial_context ----
    if name == "get_td_spatial_context":
        result = _http_get("/spatial_context")
        return result

    # ---- capture_td_screenshot ----
    if name == "capture_td_screenshot":
        payload = {}
        if arguments.get("path"):
            payload["path"] = arguments.get("path")
        result = _http_post("/screenshot", payload)
        return result

    # ---- get_td_help ----
    if name == "get_td_help":
        module = arguments.get("module", "")
        result = _http_get(f"/help?module={module}")
        return result

    raise ValueError(f"Unknown tool: {name}")


def _unwrap_post(result: dict[str, Any]) -> dict[str, Any]:
    """Unwrap the nested exec response from POST /exec."""
    if isinstance(result, dict) and "output" in result:
        return result
    if isinstance(result, dict) and "error" in result:
        return {"error": result["error"]}
    return result


# ---------------------------------------------------------------------------
# MCP protocol handlers
# ---------------------------------------------------------------------------

def _handle_list_tools() -> dict[str, Any]:
    """Handle tools/list request."""
    return {"tools": TOOL_DEFINITIONS}


def _handle_call_tool(params: dict[str, Any]) -> dict[str, Any]:
    """Handle tools/call request."""
    name = params.get("name", "")
    arguments = params.get("arguments", {})
    try:
        result = _call_tool(name, arguments)
        if isinstance(result, dict) and "error" in result:
            return {
                "content": [{"type": "text", "text": json.dumps(result, indent=2)}],
                "isError": True,
            }
        return {
            "content": [{"type": "text", "text": json.dumps(result, indent=2)}],
        }
    except Exception as e:
        return {
            "content": [{"type": "text", "text": f"Error: {e}\n{traceback.format_exc()}"}],
            "isError": True,
        }


def _handle_list_resources() -> dict[str, Any]:
    """Handle resources/list request."""
    return {
        "resources": [
            {
                "uri": "td://info",
                "name": "TouchDesigner Info",
                "description": "TD build version and FPS",
                "mimeType": "application/json",
            },
            {
                "uri": "td://performance",
                "name": "TouchDesigner Performance",
                "description": "FPS and slowest operators",
                "mimeType": "application/json",
            },
            {
                "uri": "td://spatial_context",
                "name": "Spatial Context",
                "description": "*here, *this, *these resolution",
                "mimeType": "application/json",
            },
        ]
    }


def _handle_read_resource(params: dict[str, Any]) -> dict[str, Any]:
    """Handle resources/read request."""
    uri = params.get("uri", "")
    try:
        if uri == "td://info":
            data = _http_get("/info")
        elif uri == "td://performance":
            data = _http_get("/audit/performance")
        elif uri == "td://spatial_context":
            data = _http_get("/spatial_context")
        else:
            raise ValueError(f"Unknown resource URI: {uri}")

        return {
            "contents": [
                {
                    "uri": uri,
                    "mimeType": "application/json",
                    "text": json.dumps(data, indent=2),
                }
            ]
        }
    except Exception as e:
        return {
            "contents": [
                {
                    "uri": uri,
                    "mimeType": "text/plain",
                    "text": f"Error: {e}",
                }
            ]
        }


# ---------------------------------------------------------------------------
# JSON-RPC 2.0 dispatcher
# ---------------------------------------------------------------------------

def _dispatch(request: dict[str, Any]) -> dict[str, Any] | None:
    """Route a single JSON-RPC 2.0 request to the appropriate handler."""
    req_id = request.get("id")
    method = request.get("method", "")
    params = request.get("params", {})

    if method == "tools/list":
        result = _handle_list_tools()
        return {"jsonrpc": "2.0", "id": req_id, "result": result}

    if method == "tools/call":
        result = _handle_call_tool(params)
        return {"jsonrpc": "2.0", "id": req_id, "result": result}

    if method == "resources/list":
        result = _handle_list_resources()
        return {"jsonrpc": "2.0", "id": req_id, "result": result}

    if method == "resources/read":
        result = _handle_read_resource(params)
        return {"jsonrpc": "2.0", "id": req_id, "result": result}

    # Initialize notification — just acknowledge
    if method == "initialize":
        return {
            "jsonrpc": "2.0",
            "id": req_id,
            "result": {
                "protocolVersion": "2024-11-05",
                "capabilities": {
                    "tools": {},
                    "resources": {},
                },
                "serverInfo": {
                    "name": "td-mcp-server",
                    "version": "1.0.0",
                },
            },
        }

    if method == "notifications/initialized":
        return None  # No response for notifications

    # Unknown method
    return {
        "jsonrpc": "2.0",
        "id": req_id,
        "error": {"code": -32601, "message": f"Method not found: {method}"},
    }


# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------

def main() -> None:
    """Read JSON-RPC 2.0 messages from stdin and write responses to stdout."""
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            request = json.loads(line)
        except json.JSONDecodeError:
            err = {"jsonrpc": "2.0", "id": None, "error": {"code": -32700, "message": "Parse error"}}
            sys.stdout.write(json.dumps(err) + "\n")
            sys.stdout.flush()
            continue

        if not isinstance(request, dict) or "method" not in request:
            err = {"jsonrpc": "2.0", "id": request.get("id") if isinstance(request, dict) else None,
                   "error": {"code": -32600, "message": "Invalid Request"}}
            sys.stdout.write(json.dumps(err) + "\n")
            sys.stdout.flush()
            continue

        try:
            response = _dispatch(request)
            if response is not None:
                sys.stdout.write(json.dumps(response, ensure_ascii=False) + "\n")
                sys.stdout.flush()
        except Exception as e:
            err_resp = {
                "jsonrpc": "2.0",
                "id": request.get("id"),
                "error": {"code": -32603, "message": f"Internal error: {e}"},
            }
            sys.stdout.write(json.dumps(err_resp) + "\n")
            sys.stdout.flush()


if __name__ == "__main__":
    main()
