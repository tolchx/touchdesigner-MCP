#!/usr/bin/env python3
"""
Integration tests for mcp_server_stdio.py.

Launches mcp_server_stdio.py as a subprocess, sends JSON-RPC 2.0 commands
via stdin, and validates the responses from stdout. A lightweight mock
HTTP server runs on port 44444 to simulate the TouchDesigner API without
requiring a running TD instance.

Usage:
    python -m unittest tests.test_mcp_server_stdio_integration -v
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

# ── Project root ──────────────────────────────────────────────────────────
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MCP_STDIO_PATH = os.path.join(PROJECT_ROOT, "mcp_server_stdio.py")
MOCK_HOST = "localhost"
MOCK_PORT = 44444


# ═══════════════════════════════════════════════════════════════════════════
# Mock TouchDesigner HTTP API
# ═══════════════════════════════════════════════════════════════════════════

class MockTDRequestHandler(BaseHTTPRequestHandler):
    """Minimal mock of the TouchDesigner HTTP API at localhost:44444.

    Returns canned JSON responses for all endpoints that mcp_server_stdio.py
    calls. For POST /exec, it validates that the received Python code
    is syntactically valid — catching regressions in code generation.
    """

    # ── Class-level request log (shared across handler instances) ─────
    received_requests: list[dict[str, Any]] = []

    def do_GET(self) -> None:
        path = self.path.split("?")[0]  # strip query params for routing
        query = self.path

        if path in ("/info",):
            data = {"projectFPS": 60, "version": "2022.28000", "build": "test-mock"}
        elif path in ("/operators",):
            data = [{"name": "op1", "path": "/project1/op1", "type": "noiseTOP"}]
        elif path in ("/parameters",):
            data = {"amp": {"val": 0.5, "default": 0.5, "label": "Amplitude"},
                    "type": {"val": "simplex", "default": "perlin", "label": "Type"}}
        elif path in ("/connections",):
            data = {"connections": [{"src": "noise1", "dst": "blur1", "input": 0}]}
        elif path in ("/verify",):
            data = {"healthy": True, "errors": 0, "connectionCount": 1}
        elif path in ("/help",):
            data = {"name": "noiseTOP", "doc": "Generates noise patterns.",
                    "params": {"amp": "float", "type": "menu"}}
        elif path in ("/audit/performance",):
            data = {"fps": 60.0, "slowestOps": []}
        elif path in ("/spatial_context",):
            data = {"here": "/project1", "this": "/project1", "parent": "/"}
        else:
            self._respond(404, {"error": f"Unknown endpoint: {path}"})
            return

        self._log_request("GET", query)
        self._respond(200, data)

    def do_POST(self) -> None:
        content_length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(content_length) if content_length else b"{}"
        body: dict[str, Any] = json.loads(raw.decode("utf-8"))

        path = self.path.split("?")[0]

        if path in ("/exec",):
            code = body.get("code", "")
            # Validate the generated Python code is syntactically valid.
            # This is a key integration check: ensure injection attempts are
            # neutralized so the generated code can actually be compiled.
            try:
                compile(code, "<td-mock>", "exec")
            except SyntaxError as exc:
                self._log_request("POST", path, body)
                self._respond(400, {"error": f"SyntaxError in generated code: {exc}"})
                return
            self._log_request("POST", path, body)
            self._respond(200, {"output": "(ok)"})

        elif path in ("/parameters/set",):
            self._log_request("POST", path, body)
            self._respond(200, {"success": True})

        elif path in ("/screenshot",):
            self._log_request("POST", path, body)
            self._respond(200, {"screenshot": "base64_mock_data"})

        else:
            self._log_request("POST", path, body)
            self._respond(404, {"error": f"Unknown POST endpoint: {path}"})

    # ── helpers ───────────────────────────────────────────────────────

    def _respond(self, status: int, data: Any) -> None:
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _log_request(self, method: str, path: str, body: Any = None) -> None:
        entry: dict[str, Any] = {"method": method, "path": path}
        if body is not None:
            entry["body"] = body
        self.__class__.received_requests.append(entry)

    def log_message(self, fmt: str, *args: Any) -> None:
        pass  # Suppress HTTP server log noise


# ═══════════════════════════════════════════════════════════════════════════
# Integration test suite
# ═══════════════════════════════════════════════════════════════════════════

class TestMcpStdioIntegration(unittest.TestCase):
    """Integration tests that run mcp_server_stdio.py as a subprocess.

    A mock HTTP server runs on localhost:44444 for the duration of the
    test class, so mcp_server_stdio.py can make real HTTP calls without
    a running TouchDesigner instance.
    """

    mock_server: HTTPServer | None = None
    server_thread: threading.Thread | None = None

    @classmethod
    def setUpClass(cls) -> None:
        """Start the mock HTTP server on port 44444 on a background thread.

        If port 44444 is already in use (e.g. a real TD instance is running),
        all tests in this class are skipped gracefully.
        """
        # Reset request log
        MockTDRequestHandler.received_requests.clear()

        try:
            server = HTTPServer((MOCK_HOST, MOCK_PORT), MockTDRequestHandler)
        except OSError as exc:
            raise unittest.SkipTest(
                f"Port {MOCK_PORT} is not available — cannot start mock TD API "
                f"server. If TouchDesigner is running, close it first, or use "
                f"a different port. OS error: {exc}"
            ) from exc

        cls.mock_server = server
        cls.server_thread = threading.Thread(target=server.serve_forever,
                                             daemon=True)
        cls.server_thread.start()

    @classmethod
    def tearDownClass(cls) -> None:
        """Shut down the mock HTTP server."""
        if cls.mock_server is not None:
            cls.mock_server.shutdown()
            if cls.server_thread and cls.server_thread.is_alive():
                cls.server_thread.join(timeout=3)

    def setUp(self) -> None:
        """Clear request log before each test."""
        MockTDRequestHandler.received_requests.clear()

    # ── Subprocess helper ─────────────────────────────────────────────

    def _run_mcp(self, request: dict[str, Any],
                 timeout: float = 10.0) -> dict[str, Any] | list[dict[str, Any]]:
        """Send a single JSON-RPC request to mcp_server_stdio.py via stdin
        and return the parsed JSON response from stdout.

        Raises AssertionError on non-zero exit, stderr output, or timeout.
        """
        cmd = coverage_cmd(MCP_STDIO_PATH, ["-u"])
        proc = subprocess.Popen(
            cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        try:
            stdout, stderr = proc.communicate(
                input=json.dumps(request) + "\n",
                timeout=timeout,
            )
        except subprocess.TimeoutExpired:
            proc.kill()
            stdout, stderr = proc.communicate(timeout=2)
            self.fail(f"Subprocess timed out after {timeout}s\n"
                      f"stdout so far: {stdout[:500]}\n"
                      f"stderr: {stderr[:500]}")

        # Collect stderr for diagnostics
        if stderr.strip():
            # Integration tests should produce no stderr
            self.fail(f"Subprocess wrote to stderr:\n{stderr[:1000]}")

        # Parse the response line(s)
        stdout = stdout.strip()
        if not stdout:
            self.fail("Subprocess produced no stdout output")

        lines = stdout.split("\n")
        if len(lines) == 1:
            return json.loads(lines[0])
        # Multiple lines → multiple JSON-RPC responses
        return [json.loads(line) for line in lines]

    # ═══════════════════════════════════════════════════════════════════
    # Tools
    # ═══════════════════════════════════════════════════════════════════

    def test_tools_list_returns_tools(self) -> None:
        """tools/list should return a non-empty list of tool definitions."""
        resp = self._run_mcp({
            "jsonrpc": "2.0", "id": 1, "method": "tools/list",
        })
        self.assertIn("result", resp)
        tools = resp["result"]["tools"]
        self.assertIsInstance(tools, list)
        self.assertGreater(len(tools), 0)
        names = [t["name"] for t in tools]
        self.assertIn("create_td_node", names)
        self.assertIn("execute_td_python", names)

    def test_initialize_returns_protocol(self) -> None:
        """Initialize should return capabilities and server info."""
        resp = self._run_mcp({
            "jsonrpc": "2.0", "id": 1, "method": "initialize",
        })
        self.assertIn("result", resp)
        r = resp["result"]
        self.assertEqual(r["protocolVersion"], "2024-11-05")
        self.assertIn("capabilities", r)
        self.assertIn("tools", r["capabilities"])
        self.assertEqual(r["serverInfo"]["name"], "td-mcp-server")

    def test_notifications_initialized_no_response(self) -> None:
        """notifications/initialized should produce no stdout output
        (notification = no response per JSON-RPC 2.0)."""
        cmd = coverage_cmd(MCP_STDIO_PATH, ["-u"])
        proc = subprocess.Popen(
            cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        out, err = proc.communicate(
            input=json.dumps({
                "jsonrpc": "2.0", "id": 1, "method": "notifications/initialized",
            }) + "\n",
            timeout=5,
        )
        # A notification should produce no output — the server reads it,
        # returns None from _dispatch, and skips writing to stdout.
        # However, stdin closing will eventually cause the for-loop to
        # exit and the process terminates, so stdout could produce nothing.
        self.assertEqual(out.strip(), "",
                         "Notifications should not produce stdout output")

    def test_create_td_node_success(self) -> None:
        """create_td_node with valid params should return success."""
        resp = self._run_mcp({
            "jsonrpc": "2.0", "id": 1, "method": "tools/call",
            "params": {
                "name": "create_td_node",
                "arguments": {
                    "type": "td.noiseTOP",
                    "name": "my_noise",
                    "parent": "/project1",
                },
            },
        })
        self.assertIn("result", resp)
        self.assertNotIn("isError", resp.get("result", {}))
        content = resp["result"]["content"][0]["text"]
        self.assertIn("output", content)

    def test_create_td_node_malicious_name_neutralized(self) -> None:
        """Malicious operator name should be escaped, not cause code injection
        or syntax errors in the generated Python."""
        resp = self._run_mcp({
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
        # Must succeed — the injection must be neutralized
        self.assertIn("result", resp)
        self.assertNotIn("isError", resp.get("result", {}))
        content = resp["result"]["content"][0]["text"]
        self.assertIn("output", content)

    def test_create_td_node_invalid_type_returns_error(self) -> None:
        """Invalid operator type should return isError: true."""
        resp = self._run_mcp({
            "jsonrpc": "2.0", "id": 1, "method": "tools/call",
            "params": {
                "name": "create_td_node",
                "arguments": {
                    "type": "noise TOP",  # space → invalid
                    "name": "n1",
                },
            },
        })
        # The mock server should NOT have received any /exec call
        self.assertIn("result", resp)
        self.assertTrue(resp["result"].get("isError", False),
                        "Invalid op_type should return isError")
        content = resp["result"]["content"][0]["text"]
        self.assertIn("Invalid operator type", content)

    def test_delete_td_node_success(self) -> None:
        """delete_td_node should generate valid Python and return success."""
        resp = self._run_mcp({
            "jsonrpc": "2.0", "id": 1, "method": "tools/call",
            "params": {
                "name": "delete_td_node",
                "arguments": {"path": "/project1/my_noise"},
            },
        })
        self.assertIn("result", resp)
        self.assertNotIn("isError", resp.get("result", {}))
        content = resp["result"]["content"][0]["text"]
        self.assertIn("output", content)

    def test_connect_td_nodes_success(self) -> None:
        """connect_td_nodes should generate valid Python."""
        resp = self._run_mcp({
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
        self.assertIn("result", resp)
        self.assertNotIn("isError", resp.get("result", {}))
        content = resp["result"]["content"][0]["text"]
        self.assertIn("output", content)

    def test_execute_td_python_passthrough(self) -> None:
        """execute_td_python should pass code through unchanged."""
        code = "print('hello')"
        resp = self._run_mcp({
            "jsonrpc": "2.0", "id": 1, "method": "tools/call",
            "params": {
                "name": "execute_td_python",
                "arguments": {"code": code},
            },
        })
        self.assertIn("result", resp)
        content = resp["result"]["content"][0]["text"]
        self.assertIn("output", content)
        # Verify the exact code was sent to the mock server
        exec_requests = [
            r for r in MockTDRequestHandler.received_requests
            if r["method"] == "POST" and "/exec" in r["path"]
        ]
        self.assertGreater(len(exec_requests), 0)
        self.assertEqual(exec_requests[-1]["body"]["code"], code)

    def test_verify_td_network_success(self) -> None:
        """verify_td_network should return healthy status from mock."""
        resp = self._run_mcp({
            "jsonrpc": "2.0", "id": 1, "method": "tools/call",
            "params": {
                "name": "verify_td_network",
                "arguments": {"path": "/project1"},
            },
        })
        self.assertIn("result", resp)
        content = resp["result"]["content"][0]["text"]
        self.assertIn("healthy", content)
        self.assertIn("0", content)  # errors: 0

    def test_get_td_help_returns_doc(self) -> None:
        """get_td_help should return documentation from mock."""
        resp = self._run_mcp({
            "jsonrpc": "2.0", "id": 1, "method": "tools/call",
            "params": {
                "name": "get_td_help",
                "arguments": {"module": "noiseTOP"},
            },
        })
        self.assertIn("result", resp)
        content = resp["result"]["content"][0]["text"]
        self.assertIn("noiseTOP", content)
        self.assertIn("Generates", content)

    def test_get_td_performance_returns_fps(self) -> None:
        """get_td_performance should return FPS from mock."""
        resp = self._run_mcp({
            "jsonrpc": "2.0", "id": 1, "method": "tools/call",
            "params": {
                "name": "get_td_performance",
                "arguments": {},
            },
        })
        self.assertIn("result", resp)
        content = resp["result"]["content"][0]["text"]
        self.assertTrue("fps" in content.lower() or "60" in content,
                        f"Expected 'fps' or '60' in performance response: {content}")

    def test_unknown_tool_returns_error(self) -> None:
        """Calling an unknown tool should return isError: true."""
        resp = self._run_mcp({
            "jsonrpc": "2.0", "id": 1, "method": "tools/call",
            "params": {
                "name": "does_not_exist",
                "arguments": {},
            },
        })
        self.assertIn("result", resp)
        self.assertTrue(resp["result"].get("isError", False))
        content = resp["result"]["content"][0]["text"]
        self.assertIn("Unknown tool", content)

    # ═══════════════════════════════════════════════════════════════════
    # Resources
    # ═══════════════════════════════════════════════════════════════════

    def test_resources_list_returns_three_resources(self) -> None:
        """resources/list should return exactly 3 resource definitions."""
        resp = self._run_mcp({
            "jsonrpc": "2.0", "id": 1, "method": "resources/list",
        })
        self.assertIn("result", resp)
        resources = resp["result"]["resources"]
        self.assertEqual(len(resources), 3)
        uris = [r["uri"] for r in resources]
        self.assertIn("td://info", uris)
        self.assertIn("td://performance", uris)
        self.assertIn("td://spatial_context", uris)

    def test_read_resource_info_success(self) -> None:
        """resources/read of td://info should return TD info from mock."""
        resp = self._run_mcp({
            "jsonrpc": "2.0", "id": 1, "method": "resources/read",
            "params": {"uri": "td://info"},
        })
        self.assertIn("result", resp)
        contents = resp["result"]["contents"]
        self.assertEqual(len(contents), 1)
        self.assertEqual(contents[0]["mimeType"], "application/json")
        self.assertIn("projectFPS", contents[0]["text"])
        self.assertIn("60", contents[0]["text"])

    def test_read_resource_unknown_returns_error(self) -> None:
        """resources/read of unknown URI should return error text."""
        resp = self._run_mcp({
            "jsonrpc": "2.0", "id": 1, "method": "resources/read",
            "params": {"uri": "td://nonexistent"},
        })
        self.assertIn("result", resp)
        contents = resp["result"]["contents"]
        self.assertEqual(len(contents), 1)
        self.assertEqual(contents[0]["mimeType"], "text/plain")
        self.assertIn("Error", contents[0]["text"])

    # ═══════════════════════════════════════════════════════════════════
    # Protocol / error scenarios
    # ═══════════════════════════════════════════════════════════════════

    def test_unknown_method_returns_error_code(self) -> None:
        """Request with unknown method should return JSON-RPC error -32601."""
        resp = self._run_mcp({
            "jsonrpc": "2.0", "id": 1, "method": "bogus_method",
        })
        self.assertIn("error", resp)
        self.assertEqual(resp["error"]["code"], -32601)
        self.assertIn("not found", resp["error"]["message"])

    def test_invalid_json_parse_error(self) -> None:
        """Non-JSON input should return JSON-RPC parse error -32700."""
        cmd = coverage_cmd(MCP_STDIO_PATH, ["-u"])
        proc = subprocess.Popen(
            cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        out, err = proc.communicate(
            input="this is not json\n",
            timeout=5,
        )
        resp = json.loads(out.strip())
        self.assertIn("error", resp)
        self.assertEqual(resp["error"]["code"], -32700)
        self.assertIn("Parse error", resp["error"]["message"])

    def test_invalid_request_missing_method(self) -> None:
        """Request without a 'method' key should return -32600."""
        resp = self._run_mcp({
            "jsonrpc": "2.0", "id": 1, "params": {},
        })
        self.assertIn("error", resp)
        self.assertEqual(resp["error"]["code"], -32600)
        self.assertIn("Invalid Request", resp["error"]["message"])

    def test_tools_list_returns_correct_id(self) -> None:
        """Response 'id' should echo the request 'id'."""
        resp = self._run_mcp({
            "jsonrpc": "2.0", "id": 42, "method": "tools/list",
        })
        self.assertEqual(resp.get("id"), 42)

    def test_initialized_then_tools_list(self) -> None:
        """Multiple requests in sequence should all produce valid responses."""
        # Send two requests in one stdin stream
        cmd = coverage_cmd(MCP_STDIO_PATH, ["-u"])
        proc = subprocess.Popen(
            cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        payload = (
            json.dumps({"jsonrpc": "2.0", "id": 1, "method": "initialize"}) + "\n"
            + json.dumps({"jsonrpc": "2.0", "id": 2, "method": "tools/list"}) + "\n"
        )
        out, err = proc.communicate(input=payload, timeout=5)
        lines = out.strip().split("\n")
        self.assertEqual(len(lines), 2, "Expected 2 response lines")
        resp1 = json.loads(lines[0])
        resp2 = json.loads(lines[1])
        self.assertEqual(resp1["id"], 1)
        self.assertEqual(resp1["result"]["protocolVersion"], "2024-11-05")
        self.assertEqual(resp2["id"], 2)
        self.assertIn("tools", resp2["result"])

    def test_create_then_delete_sequential(self) -> None:
        """Two tool calls in sequence should both return success."""
        cmd = coverage_cmd(MCP_STDIO_PATH, ["-u"])
        proc = subprocess.Popen(
            cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        payload = (
            json.dumps({
                "jsonrpc": "2.0", "id": 1, "method": "tools/call",
                "params": {
                    "name": "create_td_node",
                    "arguments": {"type": "td.noiseTOP", "name": "n1"},
                },
            }) + "\n"
            + json.dumps({
                "jsonrpc": "2.0", "id": 2, "method": "tools/call",
                "params": {
                    "name": "delete_td_node",
                    "arguments": {"path": "/project1/n1"},
                },
            }) + "\n"
        )
        out, err = proc.communicate(input=payload, timeout=5)
        lines = out.strip().split("\n")
        self.assertEqual(len(lines), 2, "Expected 2 response lines")
        r1 = json.loads(lines[0])
        r2 = json.loads(lines[1])
        self.assertEqual(r1["id"], 1)
        self.assertEqual(r2["id"], 2)
        # Both should succeed
        self.assertNotIn("isError", r1.get("result", {}))
        self.assertNotIn("isError", r2.get("result", {}))

    def test_create_with_backslash_in_name(self) -> None:
        """Backslash in operator name must be escaped in the generated code."""
        resp = self._run_mcp({
            "jsonrpc": "2.0", "id": 1, "method": "tools/call",
            "params": {
                "name": "create_td_node",
                "arguments": {
                    "type": "td.boxPOP",
                    "name": "test\\path",
                    "parent": "/project1",
                },
            },
        })
        self.assertIn("result", resp)
        self.assertNotIn("isError", resp.get("result", {}))
        # Verify the mock server received the request (generated code compiled)
        exec_requests = [
            r for r in MockTDRequestHandler.received_requests
            if r["method"] == "POST" and "/exec" in r["path"]
        ]
        self.assertGreater(len(exec_requests), 0)
        code = exec_requests[-1]["body"]["code"]
        # Backslash should be escaped: `test\\path` → `test\\\\path` in code
        # (each single `\` doubled by _py_esc → two `\\` in the generated string)
        self.assertIn("\\\\", code)  # two backslashes


# ═══════════════════════════════════════════════════════════════════════════
# Stress test — 100 sequential requests in a single subprocess
# ═══════════════════════════════════════════════════════════════════════════

class TestMcpStdioStress(unittest.TestCase):
    """Stress test: sends 100 JSON-RPC requests in sequence within a single
    subprocess, simulating sustained usage of the MCP stdio server.

    Starts its own mock TD API server on port 44444, independent of
    TestMcpStdioIntegration.
    """

    mock_server: HTTPServer | None = None
    server_thread: threading.Thread | None = None

    @classmethod
    def setUpClass(cls) -> None:
        """Start mock TD API server on port 44444."""
        MockTDRequestHandler.received_requests.clear()
        try:
            server = HTTPServer((MOCK_HOST, MOCK_PORT), MockTDRequestHandler)
        except OSError as exc:
            raise unittest.SkipTest(
                f"Port {MOCK_PORT} not available — cannot start mock TD API. {exc}"
            ) from exc
        cls.mock_server = server
        cls.server_thread = threading.Thread(target=server.serve_forever, daemon=True)
        cls.server_thread.start()

    @classmethod
    def tearDownClass(cls) -> None:
        """Shut down the mock TD API server."""
        if cls.mock_server is not None:
            cls.mock_server.shutdown()

    def setUp(self) -> None:
        MockTDRequestHandler.received_requests.clear()

    # ── Request factory ───────────────────────────────────────────────

    @staticmethod
    def _build_100_requests() -> tuple[str, list[tuple[int, str]]]:
        """Build a payload of 100 JSON-RPC requests and a parallel list of
        expected outcomes: (request_id, outcome_type).

        Outcome types:
          'result'         — normal success (response has "result" key)
          'tool_error'     — tool call error (response has "result" with isError=true)
          'jsonrpc_error'  — protocol error (response has top-level "error" key)
        """
        requests: list[dict[str, Any]] = []
        expected: list[tuple[int, str]] = []
        rid = 0

        def add(method: str, params: dict | None = None,
                exp: str = "result") -> None:
            nonlocal rid
            rid += 1
            req: dict[str, Any] = {"jsonrpc": "2.0", "id": rid, "method": method}
            if params is not None:
                req["params"] = params
            requests.append(req)
            expected.append((rid, exp))

        # IDs 1-20: tools/list (result)
        for _ in range(20):
            add("tools/list")

        # IDs 21-40: initialize (result)
        for _ in range(20):
            add("initialize")

        # IDs 41-55: create_td_node valid (result)
        for i in range(15):
            add("tools/call", {
                "name": "create_td_node",
                "arguments": {
                    "type": "td.noiseTOP",
                    "name": f"stress_node_{i}",
                    "parent": "/project1",
                },
            })

        # IDs 56-60: create_td_node invalid → tool_error (isError in result)
        for _ in range(5):
            add("tools/call", {
                "name": "create_td_node",
                "arguments": {"type": "bad type!", "name": "nope"},
            }, exp="tool_error")

        # IDs 61-70: delete_td_node (result)
        for i in range(10):
            add("tools/call", {
                "name": "delete_td_node",
                "arguments": {"path": f"/project1/stress_del_{i}"},
            })

        # IDs 71-75: execute_td_python (result)
        for i in range(5):
            add("tools/call", {
                "name": "execute_td_python",
                "arguments": {"code": f"print('stress {i}')"},
            })

        # IDs 76-85: verify_td_network (result)
        for _ in range(10):
            add("tools/call", {
                "name": "verify_td_network",
                "arguments": {"path": "/project1"},
            })

        # IDs 86-90: resources/list (result)
        for _ in range(5):
            add("resources/list")

        # IDs 91-93: resources/read (result)
        for _ in range(3):
            add("resources/read", {"uri": "td://info"})

        # IDs 94-95: unknown method → jsonrpc_error (-32601)
        for _ in range(2):
            add("nonexistent_rpc_method", exp="jsonrpc_error")

        # IDs 96-97: missing "method" key → jsonrpc_error (-32600)
        requests.append({"jsonrpc": "2.0", "id": 96, "params": {}})
        expected.append((96, "jsonrpc_error"))
        requests.append({"jsonrpc": "2.0", "id": 97, "params": {}})
        expected.append((97, "jsonrpc_error"))
        rid = 97

        # ID 98: tools/list after errors → result
        add("tools/list")

        # ID 99: get_td_help → result
        add("tools/call", {
            "name": "get_td_help",
            "arguments": {"module": "noiseTOP"},
        })

        # ID 100: get_td_performance → result
        add("tools/call", {
            "name": "get_td_performance",
            "arguments": {},
        })

        payload = "\n".join(json.dumps(r) for r in requests)
        return payload, expected

    # ── Stress test ───────────────────────────────────────────────────

    def test_100_sequential_requests(self) -> None:
        """Send 100 requests in sequence within one subprocess.

        Validates:
        - Exactly 100 response lines received
        - Every response ID matches the request ID
        - Expected outcome ('result' vs 'error') matches
        - No stderr output from the subprocess
        - Total elapsed time is reported
        """
        payload, expected = self._build_100_requests()
        self.assertEqual(
            len(expected), 100,
            f"Expected 100 request/outcome pairs, got {len(expected)}"
        )

        cmd = coverage_cmd(MCP_STDIO_PATH, ["-u"])
        proc = subprocess.Popen(
            cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )

        import time
        t0 = time.monotonic()
        try:
            stdout, stderr = proc.communicate(input=payload, timeout=120)
        except subprocess.TimeoutExpired:
            proc.kill()
            stdout, stderr = proc.communicate(timeout=5)
            partial_lines = stdout.strip().split("\n")
            # Show which IDs we received to diagnose where it hangs
            received_ids = []
            for line in partial_lines:
                try:
                    received_ids.append(json.loads(line).get("id"))
                except json.JSONDecodeError:
                    received_ids.append("<parse error>")
            self.fail(
                f"Stress test timed out after 120s\n"
                f"  Received {len(partial_lines)}/{len(expected)} lines\n"
                f"  Last 5 IDs received: {received_ids[-5:]}\n"
                f"  Expected next IDs: {expected[len(partial_lines):][:5]}\n"
                f"  Stderr: {stderr.decode(errors='replace')[:500] if isinstance(stderr, bytes) else stderr[:500]}"
            )
        elapsed = time.monotonic() - t0

        # No stderr
        if stderr.strip():
            self.fail(f"Stress test produced stderr:\n{stderr[:2000]}")

        # Parse all response lines
        lines = stdout.strip().split("\n")
        self.assertEqual(
            len(lines), 100,
            f"Expected 100 response lines, got {len(lines)} "
            f"(elapsed: {elapsed:.2f}s)"
        )

        # Validate each response matches its expected outcome
        failures: list[str] = []
        for i, (line, (req_id, expected_type)) in enumerate(zip(lines, expected)):
            try:
                resp = json.loads(line)
            except json.JSONDecodeError as exc:
                failures.append(f"  Line {i}: not JSON ({exc}): {line[:100]}")
                continue

            # Check ID matches
            resp_id = resp.get("id")
            if resp_id != req_id:
                failures.append(
                    f"  Line {i}: expected id={req_id}, got id={resp_id}"
                )
                continue

            # Check expected outcome
            if expected_type == "result":
                if "result" not in resp:
                    failures.append(
                        f"  Line {i} (id={req_id}): expected 'result', "
                        f"got keys: {list(resp.keys())}"
                    )
            elif expected_type == "tool_error":
                # MCP tool errors: result key exists with isError=true
                if "result" not in resp:
                    failures.append(
                        f"  Line {i} (id={req_id}): expected 'result' with "
                        f"isError, got keys: {list(resp.keys())}"
                    )
                elif not resp.get("result", {}).get("isError", False):
                    failures.append(
                        f"  Line {i} (id={req_id}): expected isError=true, "
                        f"got isError=false or missing"
                    )
            elif expected_type == "jsonrpc_error":
                # JSON-RPC protocol errors: top-level error key
                if "error" not in resp:
                    failures.append(
                        f"  Line {i} (id={req_id}): expected 'error' key, "
                        f"got keys: {list(resp.keys())}"
                    )

        if failures:
            self.fail(
                f"Stress test failed {len(failures)}/100 checks:\n" +
                "\n".join(failures[:20]) +
                (f"\n  ... and {len(failures) - 20} more" if len(failures) > 20 else "")
            )

        # Optional: print performance info (visible with -v)
        print(f"\n  [OK] {len(lines)}/100 requests OK in {elapsed:.2f}s "
              f"({elapsed/100*1000:.1f}ms/req avg)")

    def test_stress_mixed_tool_types_recover_from_errors(self) -> None:
        """Send requests with error-triggering calls between valid ones
        to ensure the server stays responsive after errors."""
        requests = []
        # Pattern: valid → error → valid → error → ... x 10 cycles
        for i in range(10):
            requests.append({
                "jsonrpc": "2.0", "id": i * 2 + 1,
                "method": "tools/list",
            })
            requests.append({
                "jsonrpc": "2.0", "id": i * 2 + 2,
                "method": "tools/call",
                "params": {
                    "name": "create_td_node",
                    "arguments": {"type": "INVALID!!", "name": "x"},
                },
            })

        payload = "\n".join(json.dumps(r) for r in requests)
        cmd = coverage_cmd(MCP_STDIO_PATH, ["-u"])
        proc = subprocess.Popen(
            cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        stdout, stderr = proc.communicate(input=payload, timeout=30)

        self.assertFalse(stderr.strip(), f"Unexpected stderr: {stderr[:500]}")
        lines = stdout.strip().split("\n")
        self.assertEqual(len(lines), 20, "Expected 20 responses")

        for i, line in enumerate(lines):
            resp = json.loads(line)
            req_id = i + 1
            self.assertEqual(resp.get("id"), req_id,
                             f"Line {i}: id mismatch")
            if i % 2 == 0:
                # Even indices (0, 2, 4...) = tools/list → result
                self.assertIn("result", resp,
                              f"Line {i} (tools/list) should have result")
            else:
                # Odd indices (1, 3, 5...) = invalid create → isError
                self.assertIn("result", resp,
                              f"Line {i} (error) should have result wrapper")
                self.assertTrue(
                    resp.get("result", {}).get("isError", False),
                    f"Line {i} (invalid op) should have isError=true"
                )




    # ── Stress test: 500 sequential requests ──────────────────────────

    @staticmethod
    def _build_500_requests() -> tuple[str, list[tuple[int, str]]]:
        """Build a payload of 500 JSON-RPC requests and expected outcomes.

        Mix approximates real usage: 70% results, 20% tool errors, 10% protocol errors.
        """
        requests: list[dict[str, Any]] = []
        expected: list[tuple[int, str]] = []
        rid = 0

        def add(method: str, params: dict | None = None,
                exp: str = "result") -> None:
            nonlocal rid
            rid += 1
            req: dict[str, Any] = {"jsonrpc": "2.0", "id": rid, "method": method}
            if params is not None:
                req["params"] = params
            requests.append(req)
            expected.append((rid, exp))

        # IDs 1-100: tools/list (result)
        for _ in range(100):
            add("tools/list")

        # IDs 101-150: initialize (result)
        for _ in range(50):
            add("initialize")

        # IDs 151-250: create_td_node valid (result)
        for i in range(100):
            add("tools/call", {
                "name": "create_td_node",
                "arguments": {
                    "type": "td.noiseTOP",
                    "name": f"stress_node_{i}",
                    "parent": "/project1",
                },
            })

        # IDs 251-300: delete_td_node (result)
        for i in range(50):
            add("tools/call", {
                "name": "delete_td_node",
                "arguments": {"path": f"/project1/stress_del_{i}"},
            })

        # IDs 301-350: execute_td_python (result)
        for i in range(50):
            add("tools/call", {
                "name": "execute_td_python",
                "arguments": {"code": f"print('stress {i}')"},
            })

        # IDs 351-390: verify_td_network (result)
        for _ in range(40):
            add("tools/call", {
                "name": "verify_td_network",
                "arguments": {"path": "/project1"},
            })

        # IDs 391-410: get_td_help (result)
        for _ in range(20):
            add("tools/call", {
                "name": "get_td_help",
                "arguments": {"module": "noiseTOP"},
            })

        # IDs 411-435: resources/list (result)
        for _ in range(25):
            add("resources/list")

        # IDs 436-460: resources/read (result)
        for _ in range(25):
            add("resources/read", {"uri": "td://info"})

        # IDs 461-475: create_td_node invalid → tool_error
        for _ in range(15):
            add("tools/call", {
                "name": "create_td_node",
                "arguments": {"type": "bad type!", "name": "nope"},
            }, exp="tool_error")

        # IDs 476-485: nonexistent_rpc_method → jsonrpc_error
        for _ in range(10):
            add("nonexistent_rpc_method", exp="jsonrpc_error")

        # IDs 486-490: missing "method" key → jsonrpc_error
        for _ in range(5):
            requests.append({"jsonrpc": "2.0", "id": rid + 1, "params": {}})
            expected.append((rid + 1, "jsonrpc_error"))
            rid += 1

        # IDs 491-495: connect_td_nodes (result)
        for i in range(5):
            add("tools/call", {
                "name": "connect_td_nodes",
                "arguments": {
                    "src": "/project1/noise1",
                    "dst": "/project1/blur1",
                    "input": 0,
                },
            })

        # IDs 496-500: get_td_performance (result)
        for _ in range(5):
            add("tools/call", {
                "name": "get_td_performance",
                "arguments": {},
            })

        payload = "\n".join(json.dumps(r) for r in requests)
        return payload, expected

    def test_500_sequential_requests(self) -> None:
        """Send 500 requests in sequence within one subprocess.

        This is the primary stress test, designed to detect:
        - Memory leaks or resource exhaustion in the stdio server
        - Pipe buffer deadlocks (stdout not flushed between requests)
        - Cumulative slowdown under sustained load
        - Correct recovery after error responses

        Validates:
        - Exactly 500 response lines received
        - Every response ID matches the request ID
        - Expected outcome type matches (result / tool_error / jsonrpc_error)
        - No stderr output from the subprocess
        - Reports timing stats
        """
        payload, expected = self._build_500_requests()
        self.assertEqual(
            len(expected), 500,
            f"Expected 500 request/outcome pairs, got {len(expected)}"
        )

        cmd = coverage_cmd(MCP_STDIO_PATH, ["-u"])
        proc = subprocess.Popen(
            cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )

        import time
        t0 = time.monotonic()
        timeout = 900  # 15 minutes max for 500 requests under coverage
        try:
            stdout, stderr = proc.communicate(input=payload, timeout=timeout)
        except subprocess.TimeoutExpired:
            proc.kill()
            stdout, stderr = proc.communicate(timeout=5)
            partial_lines = stdout.strip().split("\n")
            # Show which IDs we received to diagnose where it hangs
            received_ids = []
            for line in partial_lines:
                try:
                    received_ids.append(json.loads(line).get("id"))
                except json.JSONDecodeError:
                    received_ids.append("<parse error>")
            # Also show what the mock server last received
            mock_last = MockTDRequestHandler.received_requests[-3:] if MockTDRequestHandler.received_requests else []
            self.fail(
                f"500-stress test timed out after {timeout}s\n"
                f"  Received {len(partial_lines)}/{len(expected)} lines\n"
                f"  Last 5 IDs received: {received_ids[-5:]}\n"
                f"  Expected next IDs: {expected[len(partial_lines):][:5]}\n"
                f"  Mock server last 3 requests: {json.dumps(mock_last, indent=2)[:300]}\n"
                f"  Stderr: {stderr[:500]}"
            )
        elapsed = time.monotonic() - t0

        # No stderr
        if stderr.strip():
            self.fail(f"500-stress test produced stderr:\n{stderr[:2000]}")

        # Parse all response lines
        lines = stdout.strip().split("\n")
        self.assertEqual(
            len(lines), 500,
            f"Expected 500 response lines, got {len(lines)} "
            f"(elapsed: {elapsed:.2f}s)"
        )

        # Validate each response matches its expected outcome
        failures: list[str] = []
        for i, (line, (req_id, expected_type)) in enumerate(zip(lines, expected)):
            try:
                resp = json.loads(line)
            except json.JSONDecodeError as exc:
                failures.append(f"  Line {i}: not JSON ({exc}): {line[:100]}")
                continue

            # Check ID matches
            resp_id = resp.get("id")
            if resp_id != req_id:
                failures.append(
                    f"  Line {i}: expected id={req_id}, got id={resp_id}"
                )
                continue

            # Check expected outcome
            if expected_type == "result":
                if "result" not in resp:
                    failures.append(
                        f"  Line {i} (id={req_id}): expected 'result', "
                        f"got keys: {list(resp.keys())}"
                    )
            elif expected_type == "tool_error":
                if "result" not in resp:
                    failures.append(
                        f"  Line {i} (id={req_id}): expected 'result' with "
                        f"isError, got keys: {list(resp.keys())}"
                    )
                elif not resp.get("result", {}).get("isError", False):
                    failures.append(
                        f"  Line {i} (id={req_id}): expected isError=true, "
                        f"got isError=false or missing"
                    )
            elif expected_type == "jsonrpc_error":
                if "error" not in resp:
                    failures.append(
                        f"  Line {i} (id={req_id}): expected 'error' key, "
                        f"got keys: {list(resp.keys())}"
                    )

        if failures:
            self.fail(
                f"500-stress test failed {len(failures)}/500 checks:\n" +
                "\n".join(failures[:30]) +
                (f"\n  ... and {len(failures) - 30} more" if len(failures) > 30 else "")
            )

        # Performance summary (visible with -v)
        req_per_sec = 500 / elapsed
        print(f"\n  [OK] 500/500 requests OK in {elapsed:.2f}s "
              f"({elapsed/500*1000:.1f}ms/req, {req_per_sec:.0f} req/s, "
              f"{len(MockTDRequestHandler.received_requests)} mock calls)")



# ═══════════════════════════════════════════════════════════════════════════
# Main entry
# ═══════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    unittest.main()
