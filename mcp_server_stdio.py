#!/usr/bin/env python3
"""MCP stdio server for TouchDesigner.

Implements the Model Context Protocol (MCP) over stdio using JSON-RPC 2.0.
Translates MCP tool/resource calls to HTTP calls against the TD API at
localhost:44444.

Usage:
    python mcp_server_stdio.py          # run interactively
    echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | python mcp_server_stdio.py

Supports:
  - tools/list
  - tools/call
  - resources/list
  - resources/read

All tools are backed by the TD HTTP API at http://localhost:44444.
"""

from __future__ import annotations

import json
import sys
import traceback
from typing import Any
from urllib.request import Request, urlopen
from urllib.error import URLError

TD_API_BASE = "http://localhost:44444"
REQUEST_TIMEOUT = 30


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
            },
            "required": ["type", "name"],
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
            "properties": {},
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
        op_type = arguments.get("type", "")
        op_name = arguments.get("name", "")
        parent = arguments.get("parent", "/project1")
        code = f"op('{parent}').create({op_type}, '{op_name}')"
        result = _http_post("/exec", {"code": code})
        return _unwrap_post(result)

    # ---- delete_td_node ----
    if name == "delete_td_node":
        path = arguments.get("path", "")
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
        params = arguments.get("params", {})
        result = _http_post("/parameters/set", {"path": path, "params": params})
        return result

    # ---- connect_td_nodes ----
    if name == "connect_td_nodes":
        src = arguments.get("src", "")
        dst = arguments.get("dst", "")
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
        result = _http_post("/screenshot", {})
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
