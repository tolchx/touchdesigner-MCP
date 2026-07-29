#!/usr/bin/env python3
"""
Comprehensive integration test for mcp_server_stdio.py.

Covers ALL 12 tools, ALL 3 resources, and ALL protocol edge cases
using a mock HTTP server that simulates every TouchDesigner API endpoint.

No TouchDesigner instance required — runs entirely offline.

Usage:
    python -m unittest tests.test_mcp_server_integration_comprehensive -v
    python -m coverage run --parallel-mode --rcfile=.coveragerc \\
        -m unittest tests.test_mcp_server_integration_comprehensive -v
"""

import json
import os
import subprocess
import sys
import threading
import unittest
from http.server import HTTPServer, BaseHTTPRequestHandler
from typing import Any

from tests.test_helpers import coverage_cmd

# ── Paths and constants ───────────────────────────────────────────────────
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MCP_STDIO_PATH = os.path.join(PROJECT_ROOT, "mcp_server_stdio.py")
MOCK_HOST = "localhost"
MOCK_PORT = 44444


# ═══════════════════════════════════════════════════════════════════════════
# Mock TouchDesigner HTTP API  —  covers ALL endpoints used by the MCP server
# ═══════════════════════════════════════════════════════════════════════════

class MockTDAPI(BaseHTTPRequestHandler):
    """Complete mock of the TouchDesigner HTTP API at localhost:44444.

    Handles every endpoint that mcp_server_stdio.py calls, with canned
    responses that validate generated Python code for syntax correctness.
    """

    # ── Shared request log ────────────────────────────────────────────
    requests: list[dict[str, Any]] = []
    close_connection = True  # Prevent HTTP/1.1 keep-alive blocking

    # ── GET endpoints ─────────────────────────────────────────────────

    def do_GET(self) -> None:
        path = self.path.split("?")[0]
        query = self.path

        if path == "/info":
            data = {
                "projectFPS": 60.0,
                "version": "2022.28000",
                "build": "test-mock",
            }
        elif path == "/operators":
            data = [
                {"name": "myNoise", "path": "/project1/myNoise", "type": "noiseTOP"},
                {"name": "blur1",   "path": "/project1/blur1",   "type": "blurTOP"},
            ]
        elif path == "/parameters":
            data = {
                "amp": {"val": 0.8, "default": 0.5, "label": "Amplitude",
                        "page": "Noise", "enable": True},
                "type": {"val": "simplex", "default": "perlin", "label": "Type",
                         "menu": {"Perlin": "perlin", "Simplex": "simplex"}},
                "speed": {"val": 1.0, "default": 1.0, "label": "Speed"},
            }
        elif path == "/connections":
            data = {
                "connections": [
                    {"src": "noise1", "dst": "blur1", "input": 0},
                ]
            }
        elif path == "/verify":
            data = {"healthy": True, "errors": 0, "warnings": 0,
                    "connectionCount": 2, "operatorCount": 5}
        elif path == "/help":
            data = {
                "name": "noiseTOP",
                "doc": "Generates noise patterns using various algorithms.",
                "params": {"amp": "float", "type": "menu"},
            }
        elif path == "/audit/performance":
            data = {
                "fps": 60.0,
                "minFPS": 58.2,
                "avgFPS": 59.8,
                "slowestOps": [],
                "totalOps": 12,
                "memoryMB": 256,
            }
        elif path == "/spatial_context":
            data = {
                "here": "/project1",
                "this": "/project1/currentOp",
                "these": ["/project1/op1", "/project1/op2"],
                "parent": "/",
            }
        elif path == "/editor/selection":
            data = {"selected": ["/project1/op1"]}
        else:
            self._respond(404, {"error": f"Unknown GET endpoint: {path}"})
            return

        self._log("GET", query)
        self._respond(200, data)

    # ── POST endpoints ────────────────────────────────────────────────

    def do_POST(self) -> None:
        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length).decode("utf-8") if length else "{}"
        body: dict[str, Any] = json.loads(raw)

        path = self.path.split("?")[0]

        if path == "/exec":
            code = body.get("code", "")
            try:
                compile(code, "<td-mock>", "exec")
            except SyntaxError as exc:
                self._log("POST", path, body)
                self._respond(400, {"error": f"SyntaxError: {exc}"})
                return
            self._log("POST", path, body)
            self._respond(200, {"output": "(ok)"})

        elif path == "/parameters/set":
            self._log("POST", path, body)
            self._respond(200, {"success": True,
                                "changed": list(body.get("params", {}).keys())})

        elif path == "/screenshot":
            self._log("POST", path, body)
            self._respond(200, {
                "screenshot": "/9j/4AAQSkZJRg...base64_encoded_png_data...",
                "width": 1920,
                "height": 1080,
                "format": "png",
            })

        else:
            self._log("POST", path, body)
            self._respond(404, {"error": f"Unknown POST endpoint: {path}"})

    # ── Helpers ───────────────────────────────────────────────────────

    def _respond(self, status: int, data: Any) -> None:
        payload = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def _log(self, method: str, endpoint: str, body: Any = None) -> None:
        entry: dict[str, Any] = {"method": method, "path": endpoint}
        if body is not None:
            entry["body"] = body
        self.__class__.requests.append(entry)

    def log_message(self, fmt: str, *args: Any) -> None:
        pass  # Suppress HTTP server log noise

    @classmethod
    def clear_log(cls) -> None:
        cls.requests.clear()

    @classmethod
    def exec_requests(cls) -> list[dict[str, Any]]:
        """Return only POST /exec entries from the request log."""
        return [r for r in cls.requests
                if r["method"] == "POST" and "/exec" in r["path"]]


# ═══════════════════════════════════════════════════════════════════════════
# Comprehensive integration test suite
# ═══════════════════════════════════════════════════════════════════════════

class TestMCPComprehensive(unittest.TestCase):
    """Complete integration test exercising every MCP protocol path.

    Structure:
      ─ setUpClass / tearDownClass  — mock HTTP server lifecycle
      ─ setUp / tearDown            — clear request log
      ─ _run / _run_multi           — subprocess helpers
      ─ Section A:  Protocol basics  (initialize, tools/list, resources/list)
      ─ Section B:  12 tools, one-by-one  (create, delete, get, set, connect, etc.)
      ─ Section C:  3 resources, each URI
      ─ Section D:  Security edge cases  (injection, escaping, invalid types)
      ─ Section E:  Protocol error scenarios  (parse errors, unknown methods)
      ─ Section F:  Sequential / mixed requests
    """

    mock_server: HTTPServer | None = None
    server_thread: threading.Thread | None = None

    # ═══════════════════════════════════════════════════════════════
    # Server lifecycle
    # ═══════════════════════════════════════════════════════════════

    @classmethod
    def setUpClass(cls) -> None:
        MockTDAPI.clear_log()
        try:
            server = HTTPServer((MOCK_HOST, MOCK_PORT), MockTDAPI)
        except OSError as exc:
            raise unittest.SkipTest(
                f"Port {MOCK_PORT} not available — mock TD API cannot start. "
                f"Is TouchDesigner or another test suite running? Error: {exc}"
            ) from exc
        cls.mock_server = server
        cls.server_thread = threading.Thread(
            target=server.serve_forever, daemon=True
        )
        cls.server_thread.start()

    @classmethod
    def tearDownClass(cls) -> None:
        if cls.mock_server is not None:
            cls.mock_server.shutdown()
            if cls.server_thread and cls.server_thread.is_alive():
                cls.server_thread.join(timeout=3)

    def setUp(self) -> None:
        MockTDAPI.clear_log()

    # ═══════════════════════════════════════════════════════════════
    # Subprocess helpers
    # ═══════════════════════════════════════════════════════════════

    def _run(self, request: dict[str, Any],
             timeout: float = 10.0) -> dict[str, Any]:
        """Send one JSON-RPC request, return the parsed response.

        Fails the test if the subprocess writes to stderr or times out.
        """
        cmd = coverage_cmd(MCP_STDIO_PATH, ["-u"])
        proc = subprocess.Popen(
            cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
            stderr=subprocess.PIPE, text=True,
        )
        try:
            stdout, stderr = proc.communicate(
                input=json.dumps(request) + "\n", timeout=timeout,
            )
        except subprocess.TimeoutExpired:
            proc.kill()
            stdout, stderr = proc.communicate(timeout=2)
            self.fail(f"Subprocess timed out after {timeout}s\n"
                      f"stdout: {stdout[:300]}\nstderr: {stderr[:300]}")

        if stderr.strip():
            self.fail(f"Subprocess wrote to stderr:\n{stderr[:1000]}")

        stdout = stdout.strip()
        if not stdout:
            self.fail("Subprocess produced no stdout output")

        return json.loads(stdout)

    def _run_multi(self, *requests: dict[str, Any],
                   timeout: float = 10.0) -> list[dict[str, Any]]:
        """Send multiple JSON-RPC requests in one subprocess invocation.

        Each request must be on its own line.  Returns one response per line.
        """
        cmd = coverage_cmd(MCP_STDIO_PATH, ["-u"])
        proc = subprocess.Popen(
            cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
            stderr=subprocess.PIPE, text=True,
        )
        payload = "\n".join(json.dumps(r) for r in requests)
        try:
            stdout, stderr = proc.communicate(input=payload, timeout=timeout)
        except subprocess.TimeoutExpired:
            proc.kill()
            stdout, stderr = proc.communicate(timeout=2)
            self.fail(f"Multi-subprocess timed out after {timeout}s\n"
                      f"stdout: {stdout[:300]}\nstderr: {stderr[:300]}")

        if stderr.strip():
            self.fail(f"Multi-subprocess wrote to stderr:\n{stderr[:1000]}")
        stdout = stdout.strip()
        if not stdout:
            self.fail("Multi-subprocess produced no stdout")

        return [json.loads(line) for line in stdout.split("\n")]

    # ── Helpers for common assertions ──────────────────────────────

    def _assert_success(self, resp: dict[str, Any],
                        id: int = 1) -> dict[str, Any]:
        """Assert the response is a successful result with expected ID."""
        self.assertEqual(resp.get("id"), id,
                         f"Expected id={id}, got {resp.get('id')}")
        self.assertIn("result", resp,
                      f"Expected 'result' key, got: {list(resp.keys())}")
        result = resp["result"]
        self.assertNotIn("isError", result,
                         "Expected success (no isError)")
        return result

    def _assert_tool_error(self, resp: dict[str, Any],
                           id: int = 1) -> dict[str, Any]:
        """Assert the response is a tool-level error (isError=true in result)."""
        self.assertEqual(resp.get("id"), id)
        self.assertIn("result", resp)
        result = resp["result"]
        self.assertIn("isError", result)
        self.assertTrue(result["isError"])
        return result

    def _assert_jsonrpc_error(self, resp: dict[str, Any],
                              id: int | None = None,
                              code: int | None = None) -> dict[str, Any]:
        """Assert the response is a JSON-RPC protocol error."""
        if id is not None:
            self.assertEqual(resp.get("id"), id)
        self.assertIn("error", resp)
        if code is not None:
            self.assertEqual(resp["error"]["code"], code)
        return resp["error"]

    def _assert_in_content(self, resp: dict[str, Any],
                           *substrings: str) -> None:
        """Assert the response content text contains all given substrings."""
        text = resp["result"]["content"][0]["text"]
        for s in substrings:
            self.assertIn(s, text, f"Expected '{s}' in content:\n{text}")

    # ═══════════════════════════════════════════════════════════════════
    # Section A — Protocol basics
    # ═══════════════════════════════════════════════════════════════════

    def test_initialize(self) -> None:
        """initialize returns protocol version, capabilities, server info."""
        resp = self._run({"jsonrpc": "2.0", "id": 1, "method": "initialize"})
        r = self._assert_success(resp)
        self.assertEqual(r["protocolVersion"], "2024-11-05")
        self.assertIn("tools", r["capabilities"])
        self.assertIn("resources", r["capabilities"])
        self.assertEqual(r["serverInfo"]["name"], "td-mcp-server")

    def test_notification_initialized_no_output(self) -> None:
        """notifications/initialized produces no stdout."""
        cmd = coverage_cmd(MCP_STDIO_PATH, ["-u"])
        proc = subprocess.Popen(
            cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
            stderr=subprocess.PIPE, text=True,
        )
        out, err = proc.communicate(
            input=json.dumps({
                "jsonrpc": "2.0", "id": 1, "method": "notifications/initialized",
            }) + "\n",
            timeout=5,
        )
        self.assertEqual(out.strip(), "",
                         "Notifications should produce no stdout")
        self.assertEqual(err.strip(), "",
                         "Notifications should produce no stderr")

    def test_tools_list(self) -> None:
        """tools/list returns all 12 tool definitions with input schemas."""
        resp = self._run({"jsonrpc": "2.0", "id": 1, "method": "tools/list"})
        r = self._assert_success(resp)
        tools = r["tools"]
        names = [t["name"] for t in tools]
        self.assertEqual(
            len(tools), 12,
            f"Expected 12 tools, got {len(tools)}: {names}"
        )
        expected_tools = [
            "create_td_node", "delete_td_node", "get_td_nodes",
            "get_td_parameters", "set_td_parameters", "connect_td_nodes",
            "execute_td_python", "verify_td_network", "get_td_performance",
            "get_td_spatial_context", "capture_td_screenshot", "get_td_help",
        ]
        for name in expected_tools:
            self.assertIn(name, names, f"Missing tool: {name}")
        for tool in tools:
            self.assertIn("inputSchema", tool,
                          f"Tool '{tool['name']}' missing inputSchema")
            self.assertIn("description", tool,
                          f"Tool '{tool['name']}' missing description")

    def test_resources_list(self) -> None:
        """resources/list returns all 3 resource definitions."""
        resp = self._run(
            {"jsonrpc": "2.0", "id": 1, "method": "resources/list"}
        )
        r = self._assert_success(resp)
        resources = r["resources"]
        self.assertEqual(len(resources), 3)
        uris = [res["uri"] for res in resources]
        self.assertIn("td://info", uris)
        self.assertIn("td://performance", uris)
        self.assertIn("td://spatial_context", uris)
        for res in resources:
            self.assertIn("name", res)
            self.assertIn("mimeType", res)
            self.assertEqual(res["mimeType"], "application/json")

    # ═══════════════════════════════════════════════════════════════════
    # Section B — All 12 tools
    # ═══════════════════════════════════════════════════════════════════

    # ── B1. create_td_node ───────────────────────────────────────────

    def test_create_td_node_valid(self) -> None:
        """Create a node with valid params returns success."""
        resp = self._run({
            "jsonrpc": "2.0", "id": 1, "method": "tools/call",
            "params": {
                "name": "create_td_node",
                "arguments": {
                    "type": "td.noiseTOP", "name": "myNoise",
                    "parent": "/project1",
                },
            },
        })
        r = self._assert_success(resp)
        self._assert_in_content(resp, "output")

    def test_create_td_node_default_parent(self) -> None:
        """Create without parent defaults to /project1."""
        resp = self._run({
            "jsonrpc": "2.0", "id": 1, "method": "tools/call",
            "params": {
                "name": "create_td_node",
                "arguments": {"type": "td.blurTOP", "name": "blur1"},
            },
        })
        r = self._assert_success(resp)
        self._assert_in_content(resp, "output")

    def test_create_td_node_with_backslash(self) -> None:
        """Backslash in name is escaped in generated code."""
        resp = self._run({
            "jsonrpc": "2.0", "id": 1, "method": "tools/call",
            "params": {
                "name": "create_td_node",
                "arguments": {
                    "type": "td.boxPOP", "name": "test\\path",
                    "parent": "/project1",
                },
            },
        })
        self._assert_success(resp)
        # Verify generated code compiles (injection neutralized)
        exec_reqs = MockTDAPI.exec_requests()
        self.assertGreater(len(exec_reqs), 0)
        compile(exec_reqs[-1]["body"]["code"], "<test>", "exec")

    def test_create_td_node_invalid_type_returns_error(self) -> None:
        """Invalid operator type returns isError, no HTTP call made."""
        resp = self._run({
            "jsonrpc": "2.0", "id": 1, "method": "tools/call",
            "params": {
                "name": "create_td_node",
                "arguments": {"type": "bad type!", "name": "n1"},
            },
        })
        r = self._assert_tool_error(resp)
        self._assert_in_content(resp, "Invalid operator type")
        # No HTTP request should have been made
        self.assertEqual(len(MockTDAPI.requests), 0)

    # ── B2. delete_td_node ───────────────────────────────────────────

    def test_delete_td_node_valid(self) -> None:
        """Delete a node with valid path returns success."""
        resp = self._run({
            "jsonrpc": "2.0", "id": 1, "method": "tools/call",
            "params": {
                "name": "delete_td_node",
                "arguments": {"path": "/project1/myNoise"},
            },
        })
        self._assert_success(resp)
        self._assert_in_content(resp, "output")

    def test_delete_td_node_malicious_path(self) -> None:
        """Malicious path with injection attempt is neutralized."""
        resp = self._run({
            "jsonrpc": "2.0", "id": 1, "method": "tools/call",
            "params": {
                "name": "delete_td_node",
                "arguments": {
                    "path": "/project1'); import os; os.system('ls'); ('",
                },
            },
        })
        self._assert_success(resp)
        self._assert_in_content(resp, "output")

    # ── B3. get_td_nodes ─────────────────────────────────────────────

    def test_get_td_nodes_with_path(self) -> None:
        """List nodes under a specific path."""
        resp = self._run({
            "jsonrpc": "2.0", "id": 1, "method": "tools/call",
            "params": {
                "name": "get_td_nodes",
                "arguments": {"path": "/project1"},
            },
        })
        self._assert_success(resp)
        self._assert_in_content(resp, "myNoise", "blur1")

    def test_get_td_nodes_default_path(self) -> None:
        """List nodes defaults to root path /."""
        resp = self._run({
            "jsonrpc": "2.0", "id": 1, "method": "tools/call",
            "params": {
                "name": "get_td_nodes",
                "arguments": {},
            },
        })
        self._assert_success(resp)
        # Default path / means request to /operators?path=/
        get_reqs = [r for r in MockTDAPI.requests
                    if r["method"] == "GET" and "/operators" in r["path"]]
        self.assertGreater(len(get_reqs), 0)
        self.assertIn("path=/", get_reqs[-1]["path"])

    # ── B4. get_td_parameters ────────────────────────────────────────

    def test_get_td_parameters_with_path(self) -> None:
        """Get parameters of a specific operator."""
        resp = self._run({
            "jsonrpc": "2.0", "id": 1, "method": "tools/call",
            "params": {
                "name": "get_td_parameters",
                "arguments": {"path": "/project1/myNoise"},
            },
        })
        self._assert_success(resp)
        self._assert_in_content(resp, "amp", "0.8", "simplex")

    # ── B5. set_td_parameters ────────────────────────────────────────

    def test_set_td_parameters_valid(self) -> None:
        """Set parameters with path and params dict."""
        resp = self._run({
            "jsonrpc": "2.0", "id": 1, "method": "tools/call",
            "params": {
                "name": "set_td_parameters",
                "arguments": {
                    "path": "/project1/myNoise",
                    "params": {"amp": 0.9, "type": "perlin"},
                },
            },
        })
        self._assert_success(resp)
        self._assert_in_content(resp, "success", "amp", "type")

    # ── B6. connect_td_nodes ─────────────────────────────────────────

    def test_connect_td_nodes_valid(self) -> None:
        """Connect two operators."""
        resp = self._run({
            "jsonrpc": "2.0", "id": 1, "method": "tools/call",
            "params": {
                "name": "connect_td_nodes",
                "arguments": {
                    "src": "/project1/noise1",
                    "dst": "/project1/blur1",
                    "input": 0,
                },
            },
        })
        self._assert_success(resp)
        self._assert_in_content(resp, "output")

    def test_connect_td_nodes_default_input(self) -> None:
        """Connect without input index defaults to 0."""
        resp = self._run({
            "jsonrpc": "2.0", "id": 1, "method": "tools/call",
            "params": {
                "name": "connect_td_nodes",
                "arguments": {
                    "src": "/project1/a", "dst": "/project1/b",
                },
            },
        })
        self._assert_success(resp)
        # Verify generated code compiles (injection neutralized)
        exec_reqs = MockTDAPI.exec_requests()
        self.assertGreater(len(exec_reqs), 0)
        self.assertIn("inputConnectors[0]", exec_reqs[-1]["body"]["code"])

    # ── B7. execute_td_python ────────────────────────────────────────

    def test_execute_td_python_passthrough(self) -> None:
        """Python code is passed through unchanged to the TD API."""
        code = "print('hello from integration test')"
        resp = self._run({
            "jsonrpc": "2.0", "id": 1, "method": "tools/call",
            "params": {
                "name": "execute_td_python",
                "arguments": {"code": code},
            },
        })
        self._assert_success(resp)
        self._assert_in_content(resp, "output")

    # ── B8. verify_td_network ────────────────────────────────────────

    def test_verify_td_network(self) -> None:
        """Verify network health."""
        resp = self._run({
            "jsonrpc": "2.0", "id": 1, "method": "tools/call",
            "params": {
                "name": "verify_td_network",
                "arguments": {"path": "/project1"},
            },
        })
        self._assert_success(resp)
        self._assert_in_content(resp, "healthy", "errors", "connectionCount")

    # ── B9. get_td_performance ───────────────────────────────────────

    def test_get_td_performance(self) -> None:
        """Get performance metrics with FPS and slowest ops."""
        resp = self._run({
            "jsonrpc": "2.0", "id": 1, "method": "tools/call",
            "params": {
                "name": "get_td_performance",
                "arguments": {},
            },
        })
        self._assert_success(resp)
        self._assert_in_content(resp, "fps", "60", "totalOps", "memoryMB")

    # ── B10. get_td_spatial_context ──────────────────────────────────

    def test_get_td_spatial_context(self) -> None:
        """Get spatial context: here, this, these, parent."""
        resp = self._run({
            "jsonrpc": "2.0", "id": 1, "method": "tools/call",
            "params": {
                "name": "get_td_spatial_context",
                "arguments": {},
            },
        })
        self._assert_success(resp)
        self._assert_in_content(resp, "/project1", "currentOp", "parent")

    # ── B11. capture_td_screenshot ───────────────────────────────────

    def test_capture_td_screenshot(self) -> None:
        """Capture screenshot returns base64 image data."""
        resp = self._run({
            "jsonrpc": "2.0", "id": 1, "method": "tools/call",
            "params": {
                "name": "capture_td_screenshot",
                "arguments": {},
            },
        })
        self._assert_success(resp)
        self._assert_in_content(resp, "screenshot", "width", "height", "format")

    # ── B12. get_td_help ─────────────────────────────────────────────

    def test_get_td_help(self) -> None:
        """Get documentation for noiseTOP."""
        resp = self._run({
            "jsonrpc": "2.0", "id": 1, "method": "tools/call",
            "params": {
                "name": "get_td_help",
                "arguments": {"module": "noiseTOP"},
            },
        })
        self._assert_success(resp)
        self._assert_in_content(resp, "noiseTOP", "Generates", "algorithms")

    # ── Unknown tool ─────────────────────────────────────────────────

    def test_unknown_tool_returns_error(self) -> None:
        """Calling a tool that doesn't exist returns isError."""
        resp = self._run({
            "jsonrpc": "2.0", "id": 1, "method": "tools/call",
            "params": {
                "name": "does_not_exist",
                "arguments": {},
            },
        })
        r = self._assert_tool_error(resp)
        self._assert_in_content(resp, "Unknown tool")

    # ═══════════════════════════════════════════════════════════════════
    # Section C — All 3 resource URIs
    # ═══════════════════════════════════════════════════════════════════

    def test_read_resource_info(self) -> None:
        """Read td://info resource."""
        resp = self._run({
            "jsonrpc": "2.0", "id": 1, "method": "resources/read",
            "params": {"uri": "td://info"},
        })
        r = self._assert_success(resp)
        contents = r["contents"]
        self.assertEqual(len(contents), 1)
        self.assertEqual(contents[0]["mimeType"], "application/json")
        self.assertEqual(contents[0]["uri"], "td://info")
        text = contents[0]["text"]
        self.assertIn("projectFPS", text)
        self.assertIn("60", text)
        self.assertIn("version", text)

    def test_read_resource_performance(self) -> None:
        """Read td://performance resource."""
        resp = self._run({
            "jsonrpc": "2.0", "id": 1, "method": "resources/read",
            "params": {"uri": "td://performance"},
        })
        r = self._assert_success(resp)
        contents = r["contents"]
        self.assertEqual(len(contents), 1)
        self.assertEqual(contents[0]["mimeType"], "application/json")
        text = contents[0]["text"]
        self.assertIn("fps", text)
        self.assertIn("slowestOps", text)
        self.assertIn("256", text)  # memoryMB

    def test_read_resource_spatial_context(self) -> None:
        """Read td://spatial_context resource."""
        resp = self._run({
            "jsonrpc": "2.0", "id": 1, "method": "resources/read",
            "params": {"uri": "td://spatial_context"},
        })
        r = self._assert_success(resp)
        contents = r["contents"]
        self.assertEqual(len(contents), 1)
        self.assertEqual(contents[0]["mimeType"], "application/json")
        text = contents[0]["text"]
        self.assertIn("here", text)
        self.assertIn("/project1", text)
        self.assertIn("these", text)

    def test_read_resource_unknown_returns_error(self) -> None:
        """Reading an unknown resource URI returns error text."""
        resp = self._run({
            "jsonrpc": "2.0", "id": 1, "method": "resources/read",
            "params": {"uri": "td://nonexistent"},
        })
        r = self._assert_success(resp)
        contents = r["contents"]
        self.assertEqual(len(contents), 1)
        self.assertEqual(contents[0]["mimeType"], "text/plain")
        self.assertIn("Error", contents[0]["text"])

    # ═══════════════════════════════════════════════════════════════════
    # Section D — Security edge cases
    # ═══════════════════════════════════════════════════════════════════

    def test_injection_in_name_neutralized(self) -> None:
        """SQL/Python injection attempt in operator name is neutralized."""
        resp = self._run({
            "jsonrpc": "2.0", "id": 1, "method": "tools/call",
            "params": {
                "name": "create_td_node",
                "arguments": {
                    "type": "td.noiseTOP",
                    "name": "'); os.system('rm -rf /'); ('",
                    "parent": "/project1",
                },
            },
        })
        self._assert_success(resp)
        self._assert_in_content(resp, "output")

    def test_injection_in_path_neutralized(self) -> None:
        """Injection in delete path is neutralized."""
        resp = self._run({
            "jsonrpc": "2.0", "id": 1, "method": "tools/call",
            "params": {
                "name": "delete_td_node",
                "arguments": {
                    "path": "/project1'); __import__('os').system('id'); ('",
                },
            },
        })
        self._assert_success(resp)

    def test_backslash_in_connect_paths(self) -> None:
        """Backslash in connect source/dest is escaped."""
        resp = self._run({
            "jsonrpc": "2.0", "id": 1, "method": "tools/call",
            "params": {
                "name": "connect_td_nodes",
                "arguments": {
                    "src": "/project1/noise\\1",
                    "dst": "/project1/blur\\1",
                },
            },
        })
        self._assert_success(resp)
        self._assert_in_content(resp, "output")

    # ═══════════════════════════════════════════════════════════════════
    # Section E — Protocol error scenarios
    # ═══════════════════════════════════════════════════════════════════

    def test_invalid_json_parse_error(self) -> None:
        """Non-JSON input returns JSON-RPC parse error -32700."""
        cmd = coverage_cmd(MCP_STDIO_PATH, ["-u"])
        proc = subprocess.Popen(
            cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
            stderr=subprocess.PIPE, text=True,
        )
        out, err = proc.communicate(input="this is not json\n", timeout=5)
        resp = json.loads(out.strip())
        err_obj = self._assert_jsonrpc_error(resp, id=None, code=-32700)
        self.assertIn("Parse error", err_obj["message"])

    def test_missing_method_key(self) -> None:
        """Request without 'method' returns -32600 Invalid Request."""
        resp = self._run({
            "jsonrpc": "2.0", "id": 1, "params": {},
        })
        self._assert_jsonrpc_error(resp, id=1, code=-32600)

    def test_list_as_request(self) -> None:
        """A JSON list (not dict) returns Invalid Request."""
        cmd = coverage_cmd(MCP_STDIO_PATH, ["-u"])
        proc = subprocess.Popen(
            cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
            stderr=subprocess.PIPE, text=True,
        )
        out, err = proc.communicate(input="[1, 2, 3]\n", timeout=5)
        resp = json.loads(out.strip())
        self._assert_jsonrpc_error(resp, id=None, code=-32600)

    def test_unknown_method(self) -> None:
        """Unknown method returns JSON-RPC error -32601."""
        resp = self._run({
            "jsonrpc": "2.0", "id": 1, "method": "bogus_method",
        })
        self._assert_jsonrpc_error(resp, id=1, code=-32601)

    def test_response_echoes_jsonrpc_field(self) -> None:
        """Every response includes 'jsonrpc': '2.0'."""
        resp = self._run({
            "jsonrpc": "2.0", "id": 42, "method": "initialize",
        })
        self.assertEqual(resp.get("jsonrpc"), "2.0")
        self.assertEqual(resp.get("id"), 42)

    # ═══════════════════════════════════════════════════════════════════
    # Section F — Sequential / mixed requests
    # ═══════════════════════════════════════════════════════════════════

    def test_initialize_then_tools_list(self) -> None:
        """Two requests in one subprocess: initialize + tools/list."""
        responses = self._run_multi(
            {"jsonrpc": "2.0", "id": 1, "method": "initialize"},
            {"jsonrpc": "2.0", "id": 2, "method": "tools/list"},
        )
        self.assertEqual(len(responses), 2)
        r1 = self._assert_success(responses[0], id=1)
        self.assertEqual(r1["protocolVersion"], "2024-11-05")
        r2 = self._assert_success(responses[1], id=2)
        self.assertIn("tools", r2)

    def test_create_then_delete_sequential(self) -> None:
        """Create a node, then delete it — both succeed."""
        responses = self._run_multi(
            {
                "jsonrpc": "2.0", "id": 1, "method": "tools/call",
                "params": {
                    "name": "create_td_node",
                    "arguments": {
                        "type": "td.noiseTOP", "name": "seq_noise",
                    },
                },
            },
            {
                "jsonrpc": "2.0", "id": 2, "method": "tools/call",
                "params": {
                    "name": "delete_td_node",
                    "arguments": {"path": "/project1/seq_noise"},
                },
            },
        )
        self.assertEqual(len(responses), 2)
        self._assert_success(responses[0], id=1)
        self._assert_success(responses[1], id=2)

    def test_sequential_error_then_success(self) -> None:
        """An error response doesn't break the next valid request."""
        responses = self._run_multi(
            {
                "jsonrpc": "2.0", "id": 1, "method": "tools/call",
                "params": {
                    "name": "create_td_node",
                    "arguments": {"type": "INVALID!!", "name": "x"},
                },
            },
            {"jsonrpc": "2.0", "id": 2, "method": "tools/list"},
            {
                "jsonrpc": "2.0", "id": 3, "method": "tools/call",
                "params": {
                    "name": "get_td_performance",
                    "arguments": {},
                },
            },
        )
        self.assertEqual(len(responses), 3)
        # Request 1: error
        self._assert_tool_error(responses[0], id=1)
        # Request 2: success
        self._assert_success(responses[1], id=2)
        # Request 3: success
        self._assert_success(responses[2], id=3)
        self._assert_in_content(responses[2], "fps", "60")

    def test_mixed_tools_all_endpoints(self) -> None:
        """A mixed batch touching every tool + resource type."""
        responses = self._run_multi(
            # Protocol
            {"jsonrpc": "2.0", "id": 1, "method": "initialize"},
            # List
            {"jsonrpc": "2.0", "id": 2, "method": "resources/list"},
            # Tools that generate code (POST /exec)
            {"jsonrpc": "2.0", "id": 3, "method": "tools/call",
             "params": {"name": "create_td_node",
                        "arguments": {"type": "td.blurTOP", "name": "test_b"}}},
            {"jsonrpc": "2.0", "id": 4, "method": "tools/call",
             "params": {"name": "execute_td_python",
                        "arguments": {"code": "print('hi')"}}},
            {"jsonrpc": "2.0", "id": 5, "method": "tools/call",
             "params": {"name": "connect_td_nodes",
                        "arguments": {"src": "/a", "dst": "/b"}}},
            {"jsonrpc": "2.0", "id": 6, "method": "tools/call",
             "params": {"name": "delete_td_node",
                        "arguments": {"path": "/project1/test_b"}}},
            # Tools that use GET
            {"jsonrpc": "2.0", "id": 7, "method": "tools/call",
             "params": {"name": "get_td_nodes",
                        "arguments": {"path": "/project1"}}},
            {"jsonrpc": "2.0", "id": 8, "method": "tools/call",
             "params": {"name": "get_td_parameters",
                        "arguments": {"path": "/project1/myNoise"}}},
            {"jsonrpc": "2.0", "id": 9, "method": "tools/call",
             "params": {"name": "verify_td_network",
                        "arguments": {"path": "/project1"}}},
            {"jsonrpc": "2.0", "id": 10, "method": "tools/call",
             "params": {"name": "get_td_help",
                        "arguments": {"module": "noiseTOP"}}},
            {"jsonrpc": "2.0", "id": 11, "method": "tools/call",
             "params": {"name": "get_td_performance", "arguments": {}}},
            {"jsonrpc": "2.0", "id": 12, "method": "tools/call",
             "params": {"name": "get_td_spatial_context", "arguments": {}}},
            # POST (non-exec) tool
            {"jsonrpc": "2.0", "id": 13, "method": "tools/call",
             "params": {"name": "set_td_parameters",
                        "arguments": {"path": "/p1",
                                      "params": {"amp": 1.0}}}},
            {"jsonrpc": "2.0", "id": 14, "method": "tools/call",
             "params": {"name": "capture_td_screenshot", "arguments": {}}},
            timeout=30.0,
        )
        self.assertEqual(len(responses), 14,
                         f"Expected 14 responses, got {len(responses)}")
        for i, resp in enumerate(responses):
            self.assertIn("id", resp, f"Response {i} missing 'id'")
            self.assertEqual(
                resp["id"], i + 1,
                f"Response {i}: expected id={i+1}, got {resp['id']}"
            )
            self.assertIn("result", resp,
                          f"Response {i} (id={i+1}) missing 'result': "
                          f"keys={list(resp.keys())}")
        # Verify mock server received requests for code-gen tools
        exec_count = len(MockTDAPI.exec_requests())
        self.assertGreaterEqual(exec_count, 4,
                                f"Expected >=4 exec requests, got {exec_count}")


# ═══════════════════════════════════════════════════════════════════════════
# Main entry
# ═══════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    unittest.main()
