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
import re
import sys
import traceback
from typing import Any
from urllib.request import Request, urlopen
from urllib.error import URLError

# Loopback always means 127.0.0.1: the TD bridge (and the test mocks) only
# listen on IPv4, while on Windows resolving "localhost" returns ::1 first, so
# every request would stall ~2s on dead IPv6 SYNs before falling back
# (measured: 2011ms vs 2.8ms per round-trip). Same normalization the TS client
# does in api/src/index.ts (_normalize_host).
TD_API_BASE = "http://127.0.0.1:44444"
REQUEST_TIMEOUT = 30


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
# HTTP helpers
# ---------------------------------------------------------------------------

def _http_get(path: str) -> dict[str, Any]:
    """Perform GET against the TD API and return parsed JSON."""
    url = f"{TD_API_BASE}{path}"
    req = Request(url, method="GET")
    try:
        with urlopen(req, timeout=REQUEST_TIMEOUT) as resp:
            body = resp.read().decode("utf-8")
            return json.loads(body)
    except URLError as e:
        return {"error": str(e)}
    except json.JSONDecodeError:
        return {"error": f"Non-JSON response: {body[:200]}"}


def _http_post(path: str, body: dict[str, Any]) -> dict[str, Any]:
    """Perform POST against the TD API and return parsed JSON."""
    url = f"{TD_API_BASE}{path}"
    data = json.dumps(body).encode("utf-8")
    req = Request(url, data=data, method="POST")
    req.add_header("Content-Type", "application/json")
    try:
        with urlopen(req, timeout=REQUEST_TIMEOUT) as resp:
            resp_body = resp.read().decode("utf-8")
            return json.loads(resp_body)
    except URLError as e:
        return {"error": str(e)}
    except json.JSONDecodeError:
        return {"error": f"Non-JSON response: {resp_body[:200]}"}


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
