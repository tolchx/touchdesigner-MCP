#!/usr/bin/env python3
"""
Unit tests for mcp_server_stdio.py — Security fixes.

Tests the input escaping and validation functions added to prevent
Python code injection through operator names, paths, and types.

Run:  python -m unittest tests.test_mcp_server_stdio -v
      python -m unittest tests.test_mcp_server_stdio -v

Uses unittest.mock to avoid making real HTTP calls to TouchDesigner.
"""

import json
import sys
import os
import unittest
from unittest.mock import patch, MagicMock
from io import StringIO

# ── Ensure the project root is on sys.path so we can import mcp_server_stdio ──
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

# The module uses `if __name__ == "__main__": main()` guard, so we can safely
# import it without triggering the main loop.
import mcp_server_stdio as stdio


# ═══════════════════════════════════════════════════════════════════════════
# _py_esc — String escaping for safe Python string embedding
# ═══════════════════════════════════════════════════════════════════════════

class TestPyEsc(unittest.TestCase):
    """Tests for the _py_esc() function that escapes strings for embedding
    inside single-quoted Python string literals."""

    def test_empty_string(self):
        """Empty string should remain empty."""
        self.assertEqual(stdio._py_esc(""), "")

    def test_normal_string_no_escaping_needed(self):
        """Normal alphanumeric strings should pass through unchanged."""
        self.assertEqual(stdio._py_esc("normal"), "normal")
        self.assertEqual(stdio._py_esc("/project1/noise1"), "/project1/noise1")
        self.assertEqual(stdio._py_esc("noiseTOP"), "noiseTOP")

    def test_single_quote_is_escaped(self):
        """Single quotes must be escaped to prevent breaking the Python string literal."""
        self.assertEqual(stdio._py_esc("it's"), r"it\'s")
        self.assertEqual(stdio._py_esc("'"), r"\'")

    def test_backslash_is_escaped(self):
        """Backslashes must be escaped to prevent unintended escape sequences."""
        self.assertEqual(stdio._py_esc("path\\to"), r"path\\to")
        self.assertEqual(stdio._py_esc("\\"), r"\\")

    def test_backslash_then_quote(self):
        """Backslash followed by quote — both must be escaped."""
        self.assertEqual(stdio._py_esc("\\'"), r"\\\'")

    def test_multiple_quotes_and_backslashes(self):
        """Multiple special characters must all be escaped."""
        result = stdio._py_esc("it's a 'test' with \\backslash\\")
        expected = r"it\'s a \'test\' with \\backslash\\"
        self.assertEqual(result, expected)

    def test_newlines_and_tabs_preserved(self):
        """Newlines and tabs should pass through (they are valid inside Python strings)."""
        result = stdio._py_esc("line1\nline2\tindented")
        self.assertEqual(result, "line1\nline2\tindented")

    def test_path_with_special_chars(self):
        """A TD path with single quotes must be escaped."""
        result = stdio._py_esc("/project1/weird'name/op1")
        self.assertEqual(result, r"/project1/weird\'name/op1")

    def test_unicode_preserved(self):
        """Unicode characters should not be mangled."""
        result = stdio._py_esc("/project1/café/operador")
        self.assertEqual(result, "/project1/café/operador")

    def test_double_quotes_not_escaped(self):
        """Double quotes are safe inside single-quoted strings and should not be escaped."""
        result = stdio._py_esc('say "hello"')
        self.assertEqual(result, 'say "hello"')

    def test_embedded_code_attempt(self):
        """Malicious code attempt through string must be neutralized."""
        malicious = "'; os.system('rm -rf /'); '"
        result = stdio._py_esc(malicious)
        # No bare single quotes should remain in escaped output
        # All quotes should be escaped as \'
        self.assertNotIn("'", result.replace("\\'", ""))
        # Verify it can be safely embedded: op('...') should still be valid Python
        safe_python = f"op('{result}')"
        compile(safe_python, "<test>", "exec")


# ═══════════════════════════════════════════════════════════════════════════
# _validate_operator_type — Operator type validation
# ═══════════════════════════════════════════════════════════════════════════

class TestValidateOperatorType(unittest.TestCase):
    """Tests for the _validate_operator_type() function that ensures operator
    type references are safe Python class references."""

    def test_valid_simple_type(self):
        """Standard operator types like noiseTOP should be valid."""
        self.assertEqual(stdio._validate_operator_type("noiseTOP"), "noiseTOP")

    def test_valid_td_prefixed(self):
        """Types with td. prefix (e.g. td.glslPOP) should be valid."""
        self.assertEqual(stdio._validate_operator_type("td.glslPOP"), "td.glslPOP")
        self.assertEqual(stdio._validate_operator_type("td.noiseTOP"), "td.noiseTOP")
        self.assertEqual(stdio._validate_operator_type("td.boxPOP"), "td.boxPOP")

    def test_valid_with_numbers(self):
        """Types with numbers should be valid."""
        self.assertEqual(stdio._validate_operator_type("nullCHOP"), "nullCHOP")
        self.assertEqual(stdio._validate_operator_type("blurTOP"), "blurTOP")

    def test_valid_complex_module(self):
        """Deep module references like foo.bar.Type should be valid."""
        self.assertEqual(stdio._validate_operator_type("foo.bar.MyType"), "foo.bar.MyType")

    def test_valid_underscore(self):
        """Types with underscores should be valid (e.g. GLSL_Copy_POP)."""
        self.assertEqual(stdio._validate_operator_type("GLSL_Copy_POP"), "GLSL_Copy_POP")
        self.assertEqual(stdio._validate_operator_type("_HiddenType"), "_HiddenType")

    def test_valid_single_letter(self):
        """Single-letter types should be valid."""
        self.assertEqual(stdio._validate_operator_type("A"), "A")

    def test_empty_string_raises(self):
        """Empty string must raise ValueError."""
        with self.assertRaises(ValueError) as ctx:
            stdio._validate_operator_type("")
        self.assertIn("Invalid operator type", str(ctx.exception))

    def test_code_injection_via_semicolons(self):
        """Semicolons or code should be rejected."""
        with self.assertRaises(ValueError):
            stdio._validate_operator_type("noiseTOP; import os")

    def test_code_injection_via_parentheses(self):
        """Parentheses for function calls should be rejected."""
        with self.assertRaises(ValueError):
            stdio._validate_operator_type("__import__('os').system('ls')")

    def test_code_injection_via_spaces(self):
        """Spaces (which break Python identifiers) should be rejected."""
        with self.assertRaises(ValueError):
            stdio._validate_operator_type("noise TOP")

    def test_code_injection_via_hyphens(self):
        """Hyphens (not valid in Python identifiers) should be rejected."""
        with self.assertRaises(ValueError):
            stdio._validate_operator_type("noise-TOP")

    def test_code_injection_via_slash(self):
        """Forward slash (path traversal) should be rejected."""
        with self.assertRaises(ValueError):
            stdio._validate_operator_type("../../etc/passwd")

    def test_double_underscore_is_valid(self):
        """Double underscores are valid Python identifiers and should pass.
        The op_type 'td.__init__' is safe as a class reference; TD would reject
        it at runtime but it won't break the generated Python code."""
        self.assertEqual(stdio._validate_operator_type("__import__.__class__"), "__import__.__class__")

    def test_code_injection_via_newline(self):
        """Newline injection should be rejected."""
        with self.assertRaises(ValueError):
            stdio._validate_operator_type("noiseTOP\ndo_bad_things()")

    def test_starting_with_number_raises(self):
        """Type starting with a number is not a valid Python identifier."""
        with self.assertRaises(ValueError):
            stdio._validate_operator_type("1noiseTOP")


# ═══════════════════════════════════════════════════════════════════════════
# _call_tool — Generated code safety (using mocks)
# ═══════════════════════════════════════════════════════════════════════════

class TestCallToolCodeInjection(unittest.TestCase):
    """Tests that _call_tool() generates syntactically safe Python code
    even with malicious inputs. HTTP calls are mocked."""

    def setUp(self):
        """Patch _http_post and _http_get to avoid real HTTP calls."""
        self.patcher_post = patch.object(stdio, '_http_post')
        self.patcher_get = patch.object(stdio, '_http_get')
        self.mock_post = self.patcher_post.start()
        self.mock_get = self.patcher_get.start()
        self.mock_post.return_value = {"output": "(ok)"}
        self.mock_get.return_value = {"success": True}

    def tearDown(self):
        self.patcher_post.stop()
        self.patcher_get.stop()

    def _extract_generated_code(self, mock_post_call):
        """Helper: extract the 'code' value from the last _http_post call."""
        args, kwargs = mock_post_call
        # _http_post is called with (path, body) — body is a dict with 'code'
        return args[1]["code"]

    # ── create_td_node ──────────────────────────────────────────────────

    def test_create_normal_name(self):
        """Normal name should generate valid Python."""
        stdio._call_tool("create_td_node", {
            "type": "td.noiseTOP", "name": "myNoise", "parent": "/project1"
        })
        code = self._extract_generated_code(self.mock_post.call_args)
        # Verify the generated Python is syntactically valid
        compile(code, "<test>", "exec")

    def test_create_single_quote_in_name(self):
        """Single quote in name must be escaped to prevent injection."""
        stdio._call_tool("create_td_node", {
            "type": "td.noiseTOP", "name": "it's_bad", "parent": "/project1"
        })
        code = self._extract_generated_code(self.mock_post.call_args)
        # The Python should compile — quote must be escaped
        compile(code, "<test>", "exec")
        # Verify the escaped name is in the code
        self.assertIn("it\\'s_bad", code)

    def test_create_single_quote_in_parent(self):
        """Single quote in parent path must be escaped."""
        stdio._call_tool("create_td_node", {
            "type": "td.noiseTOP", "name": "n1",
            "parent": "/proj'ect1"
        })
        code = self._extract_generated_code(self.mock_post.call_args)
        compile(code, "<test>", "exec")
        self.assertIn("proj\\'ect1", code)

    def test_create_backslash_in_name(self):
        """Backslash in name must be escaped."""
        stdio._call_tool("create_td_node", {
            "type": "td.noiseTOP", "name": "test\\path", "parent": "/project1"
        })
        code = self._extract_generated_code(self.mock_post.call_args)
        compile(code, "<test>", "exec")
        self.assertIn("test\\\\path", code)  # \\ escaped

    def test_create_malicious_name_code_injection(self):
        """Malicious name attempting Python code injection must be neutralized."""
        stdio._call_tool("create_td_node", {
            "type": "td.noiseTOP",
            "name": "'); import os; os.system('rm -rf /'); ('",
            "parent": "/project1"
        })
        code = self._extract_generated_code(self.mock_post.call_args)
        # The code should still be syntactically valid Python
        compile(code, "<test>", "exec")

    def test_create_invalid_op_type_raises_error(self):
        """Invalid op_type should raise ValueError, not generate code."""
        with self.assertRaises(ValueError):
            stdio._call_tool("create_td_node", {
                "type": "noise TOP", "name": "n1", "parent": "/project1"
            })
        # No HTTP call should have been made
        self.mock_post.assert_not_called()

    def test_create_empty_op_type_raises_error(self):
        """Empty op_type should raise ValueError."""
        with self.assertRaises(ValueError):
            stdio._call_tool("create_td_node", {
                "type": "", "name": "n1", "parent": "/project1"
            })
        self.mock_post.assert_not_called()

    def test_create_default_parent_is_project1(self):
        """Default parent should be /project1."""
        stdio._call_tool("create_td_node", {
            "type": "td.noiseTOP", "name": "n1"
        })
        code = self._extract_generated_code(self.mock_post.call_args)
        self.assertIn("/project1", code)

    # ── delete_td_node ──────────────────────────────────────────────────

    def test_delete_normal_path(self):
        """Normal path should generate valid Python."""
        stdio._call_tool("delete_td_node", {"path": "/project1/noise1"})
        code = self._extract_generated_code(self.mock_post.call_args)
        compile(code, "<test>", "exec")

    def test_delete_path_with_quote(self):
        """Path with single quote must be escaped."""
        stdio._call_tool("delete_td_node", {"path": "/project1/it's_weird/noise1"})
        code = self._extract_generated_code(self.mock_post.call_args)
        compile(code, "<test>", "exec")
        self.assertIn("it\\'s_weird", code)

    def test_delete_malicious_path_injection(self):
        """Malicious path attempting code injection must be neutralized."""
        stdio._call_tool("delete_td_node", {
            "path": "/project1'); import os; os.system('ls'); ('"
        })
        code = self._extract_generated_code(self.mock_post.call_args)
        # Must still be valid Python
        compile(code, "<test>", "exec")

    # ── connect_td_nodes ────────────────────────────────────────────────

    def test_connect_normal(self):
        """Normal connection should generate valid Python."""
        stdio._call_tool("connect_td_nodes", {
            "src": "/project1/noise1", "dst": "/project1/blur1", "input": 0
        })
        code = self._extract_generated_code(self.mock_post.call_args)
        compile(code, "<test>", "exec")

    def test_connect_quoted_paths(self):
        """Paths with single quotes must be escaped."""
        stdio._call_tool("connect_td_nodes", {
            "src": "/project1/noise's", "dst": "/project1/blur's", "input": 0
        })
        code = self._extract_generated_code(self.mock_post.call_args)
        compile(code, "<test>", "exec")
        self.assertIn("noise\\'s", code)
        self.assertIn("blur\\'s", code)

    def test_connect_default_input_is_0(self):
        """Default input index should be 0."""
        stdio._call_tool("connect_td_nodes", {
            "src": "/a", "dst": "/b"
        })
        code = self._extract_generated_code(self.mock_post.call_args)
        self.assertIn("inputConnectors[0]", code)

    def test_execute_python_passthrough(self):
        """Execute should pass code through without modification."""
        stdio._call_tool("execute_td_python", {"code": "print('hello')"})
        args, kwargs = self.mock_post.call_args
        self.assertEqual(args[1]["code"], "print('hello')")

    # ── get_td_nodes ────────────────────────────────────────────────────

    def test_get_td_nodes_calls_http_get(self):
        """get_td_nodes should call _http_get with operators path."""
        result = stdio._call_tool("get_td_nodes", {"path": "/project1"})
        self.mock_get.assert_called_once_with("/operators?path=/project1")
        # Should return mock_get's return value directly
        self.assertEqual(result, {"success": True})

    def test_get_td_nodes_default_path(self):
        """get_td_nodes without path should default to /."""
        stdio._call_tool("get_td_nodes", {})
        self.mock_get.assert_called_once_with("/operators?path=/")

    # ── get_td_parameters ───────────────────────────────────────────────

    def test_get_td_parameters_calls_http_get(self):
        """get_td_parameters should call _http_get with parameters path."""
        result = stdio._call_tool("get_td_parameters", {"path": "/project1/noise1"})
        self.mock_get.assert_called_once_with("/parameters?path=/project1/noise1")
        self.assertEqual(result, {"success": True})

    def test_get_td_parameters_default_path(self):
        """get_td_parameters without path should default to /."""
        stdio._call_tool("get_td_parameters", {})
        self.mock_get.assert_called_once_with("/parameters?path=/")

    # ── set_td_parameters ───────────────────────────────────────────────

    def test_set_td_parameters_calls_http_post(self):
        """set_td_parameters should call _http_post with path and params."""
        result = stdio._call_tool("set_td_parameters", {
            "path": "/project1/noise1",
            "params": {"amp": 0.5, "type": "simplex"},
        })
        self.mock_post.assert_called_once_with("/parameters/set", {
            "path": "/project1/noise1",
            "params": {"amp": 0.5, "type": "simplex"},
        })
        self.assertEqual(result, {"output": "(ok)"})

    def test_set_td_parameters_empty_params(self):
        """set_td_parameters with empty params should still work."""
        stdio._call_tool("set_td_parameters", {"path": "/project1/noise1", "params": {}})
        self.mock_post.assert_called_once()
        args, _ = self.mock_post.call_args
        self.assertEqual(args[1]["params"], {})

    # ── get_td_spatial_context ──────────────────────────────────────────

    def test_get_td_spatial_context_calls_http_get(self):
        """get_td_spatial_context should call _http_get with spatial_context endpoint."""
        result = stdio._call_tool("get_td_spatial_context", {})
        self.mock_get.assert_called_once_with("/spatial_context")
        self.assertEqual(result, {"success": True})

    # ── capture_td_screenshot ───────────────────────────────────────────

    def test_capture_td_screenshot_calls_http_post(self):
        """capture_td_screenshot should call _http_post with screenshot endpoint."""
        result = stdio._call_tool("capture_td_screenshot", {})
        self.mock_post.assert_called_once_with("/screenshot", {})
        self.assertEqual(result, {"output": "(ok)"})


# ═══════════════════════════════════════════════════════════════════════════
# MCP Protocol — Request handling sanity
# ═══════════════════════════════════════════════════════════════════════════

class TestMcpProtocol(unittest.TestCase):
    """Tests for the JSON-RPC 2.0 MCP protocol handlers."""

    def test_tools_list_returns_list(self):
        """tools/list should return a dict with 'tools' key."""
        result = stdio._handle_list_tools()
        self.assertIn("tools", result)
        self.assertIsInstance(result["tools"], list)
        self.assertGreater(len(result["tools"]), 0)

    def test_tools_list_has_create_td_node(self):
        """tools/list should include create_td_node."""
        result = stdio._handle_list_tools()
        names = [t["name"] for t in result["tools"]]
        self.assertIn("create_td_node", names)
        self.assertIn("delete_td_node", names)
        self.assertIn("connect_td_nodes", names)

    def test_tools_list_all_tools_have_input_schema(self):
        """Every tool definition must have an inputSchema."""
        result = stdio._handle_list_tools()
        for tool in result["tools"]:
            self.assertIn("inputSchema", tool,
                          f"Tool '{tool['name']}' missing inputSchema")

    def test_dispatch_list_tools(self):
        """Full dispatch of tools/list."""
        request = {"jsonrpc": "2.0", "id": 1, "method": "tools/list"}
        response = stdio._dispatch(request)
        self.assertIsNotNone(response)
        self.assertIn("result", response)
        self.assertIn("tools", response["result"])

    @patch.object(stdio, '_call_tool')
    def test_dispatch_call_tool(self, mock_call):
        """Full dispatch of tools/call."""
        mock_call.return_value = {"success": True}
        request = {
            "jsonrpc": "2.0", "id": 2, "method": "tools/call",
            "params": {"name": "create_td_node", "arguments": {"type": "td.noiseTOP", "name": "n1"}}
        }
        response = stdio._dispatch(request)
        self.assertIsNotNone(response)
        self.assertIn("result", response)
        mock_call.assert_called_once_with("create_td_node", {"type": "td.noiseTOP", "name": "n1"})

    def test_dispatch_initialize(self):
        """Initialize should return protocol version and capabilities."""
        request = {"jsonrpc": "2.0", "id": 1, "method": "initialize"}
        response = stdio._dispatch(request)
        self.assertIn("result", response)
        self.assertEqual(response["result"]["protocolVersion"], "2024-11-05")
        self.assertIn("capabilities", response["result"])
        self.assertIn("serverInfo", response["result"])

    def test_dispatch_unknown_method(self):
        """Unknown methods should return an error response."""
        request = {"jsonrpc": "2.0", "id": 1, "method": "nonexistent"}
        response = stdio._dispatch(request)
        self.assertIn("error", response)
        self.assertEqual(response["error"]["code"], -32601)

    def test_dispatch_notifications_initialized_returns_none(self):
        """notifications/initialized should return None (no response for notifications)."""
        request = {"jsonrpc": "2.0", "id": 1, "method": "notifications/initialized"}
        response = stdio._dispatch(request)
        self.assertIsNone(response)

    def test_dispatch_unknown_method_returns_error(self):
        """Unknown method string should return JSON-RPC error -32601."""
        request = {"jsonrpc": "2.0", "id": 1, "method": "bogus_method"}
        response = stdio._dispatch(request)
        # Falls through all known methods → unknown method error
        self.assertIsNotNone(response)
        self.assertIn("error", response)
        self.assertEqual(response["error"]["code"], -32601)
        self.assertIn("not found", response["error"]["message"])


# ═══════════════════════════════════════════════════════════════════════════
# _handle_read_resource — Resource read error handling
# ═══════════════════════════════════════════════════════════════════════════

class TestReadResource(unittest.TestCase):
    """Tests for resource reading."""

    @patch.object(stdio, '_http_get')
    def test_unknown_uri_returns_error(self, mock_get):
        """Unknown resource URIs should return an error message."""
        result = stdio._handle_read_resource({"uri": "td://nonexistent"})
        self.assertIn("contents", result)
        self.assertEqual(result["contents"][0]["mimeType"], "text/plain")
        self.assertIn("Error", result["contents"][0]["text"])
        mock_get.assert_not_called()


# ═══════════════════════════════════════════════════════════════════════════
# _handle_call_tool — Error wrapping for invalid tool calls
# ═══════════════════════════════════════════════════════════════════════════

class TestHandleCallTool(unittest.TestCase):
    """Tests that _handle_call_tool properly wraps errors and successes."""

    def test_invalid_op_type_returns_isError(self):
        """Invalid op_type should return isError: true, not throw."""
        result = stdio._handle_call_tool({
            "name": "create_td_node",
            "arguments": {"type": "invalid type!", "name": "n1"}
        })
        self.assertIn("isError", result)
        self.assertTrue(result["isError"])
        self.assertIn("content", result)
        self.assertIn("Invalid operator type", result["content"][0]["text"])

    def test_unknown_tool_returns_isError(self):
        """Unknown tool name should return isError: true."""
        result = stdio._handle_call_tool({
            "name": "nonexistent_tool",
            "arguments": {}
        })
        self.assertIn("isError", result)
        self.assertTrue(result["isError"])
        self.assertIn("Unknown tool", result["content"][0]["text"])

    @patch.object(stdio, '_call_tool')
    def test_success_path_returns_content_without_isError(self, mock_call):
        """Successful tool call should return content with no isError flag."""
        mock_call.return_value = {"output": "(ok)"}
        result = stdio._handle_call_tool({
            "name": "create_td_node",
            "arguments": {"type": "td.noiseTOP", "name": "n1"},
        })
        # Must contain content with the result serialized as JSON
        self.assertIn("content", result)
        self.assertNotIn("isError", result, "Success should NOT have isError flag")
        text = result["content"][0]["text"]
        self.assertIn("output", text)
        self.assertIn("(ok)", text)


# ═══════════════════════════════════════════════════════════════════════════
# _unwrap_post — Exec response unwrapping
# ═══════════════════════════════════════════════════════════════════════════

class TestUnwrapPost(unittest.TestCase):
    """Tests for the _unwrap_post() helper that unwraps POST /exec responses."""

    def test_output_key_passthrough(self):
        """Dict with 'output' key should be returned as-is."""
        result = stdio._unwrap_post({"output": "(ok)", "key": "value"})
        self.assertEqual(result, {"output": "(ok)", "key": "value"})

    def test_error_key_wraps(self):
        """Dict with 'error' key should wrap with top-level 'error'."""
        result = stdio._unwrap_post({"error": "Something went wrong"})
        self.assertEqual(result, {"error": "Something went wrong"})

    def test_normal_result_passthrough(self):
        """Dict without 'output' or 'error' should pass through unchanged."""
        result = stdio._unwrap_post({"success": True, "data": 42})
        self.assertEqual(result, {"success": True, "data": 42})

    def test_empty_dict_passthrough(self):
        """Empty dict should pass through unchanged."""
        result = stdio._unwrap_post({})
        self.assertEqual(result, {})


# ═══════════════════════════════════════════════════════════════════════════
# _http_get — HTTP GET helper
# ═══════════════════════════════════════════════════════════════════════════

class TestHttpGet(unittest.TestCase):
    """Tests for the _http_get() HTTP helper.

    Patches mcp_server_stdio.urlopen at the module level since it was
    imported as a plain function reference (from urllib.request import urlopen),
    not accessed through the module.
    """

    def _make_success_response(self, json_bytes: bytes) -> MagicMock:
        """Helper: build a urlopen-compatible mock that returns JSON bytes."""
        mock_resp = MagicMock()
        mock_resp.read.return_value = json_bytes
        mock_cm = MagicMock()
        mock_cm.__enter__.return_value = mock_resp
        return mock_cm

    @patch('mcp_server_stdio.urlopen')
    def test_success_returns_parsed_json(self, mock_urlopen):
        """Successful GET with valid JSON should return parsed dict."""
        mock_urlopen.return_value = self._make_success_response(
            b'{"projectFPS": 60, "version": "2022.28000"}'
        )
        result = stdio._http_get("/info")
        self.assertEqual(result, {"projectFPS": 60, "version": "2022.28000"})

    @patch('mcp_server_stdio.urlopen')
    def test_success_with_list_response(self, mock_urlopen):
        """GET returning a JSON array should still be parsed correctly."""
        mock_urlopen.return_value = self._make_success_response(
            b'[{"name": "op1"}, {"name": "op2"}]'
        )
        result = stdio._http_get("/operators?path=/")
        self.assertEqual(result, [{"name": "op1"}, {"name": "op2"}])

    @patch('mcp_server_stdio.urlopen')
    def test_urlerror_returns_error_dict(self, mock_urlopen):
        """URLError should return dict with descriptive 'error' key."""
        from urllib.error import URLError
        mock_urlopen.side_effect = URLError("Connection refused")
        result = stdio._http_get("/info")
        self.assertIn("error", result)
        # str(URLError) formats as '<urlopen error Connection refused>'
        self.assertIn("Connection refused", result["error"])

    @patch('mcp_server_stdio.urlopen')
    def test_json_decode_error_returns_error_dict(self, mock_urlopen):
        """Non-JSON response should return error dict with 'Non-JSON response' prefix."""
        mock_urlopen.return_value = self._make_success_response(
            b'<html>Server Error</html>'
        )
        result = stdio._http_get("/info")
        self.assertIn("error", result)
        self.assertIn("Non-JSON response", result["error"])

    @patch('mcp_server_stdio.urlopen')
    def test_urlerror_with_http_error_code(self, mock_urlopen):
        """HTTPError (subclass of URLError) should also be caught."""
        from urllib.error import HTTPError
        # HTTPError constructor: HTTPError(url, code, msg, hdrs, fp)
        import io
        error = HTTPError("http://localhost:44444/exec", 500, "Internal Server Error", {}, io.BytesIO())
        mock_urlopen.side_effect = error
        result = stdio._http_get("/exec")
        self.assertIn("error", result)
        self.assertIn("500", result["error"])
        self.assertIn("Internal Server Error", result["error"])

    @patch('mcp_server_stdio.urlopen')
    def test_sends_request_to_correct_url(self, mock_urlopen):
        """Verify that the GET request is sent to the correct TD API URL."""
        mock_urlopen.return_value = self._make_success_response(b'{}')
        stdio._http_get("/verify?path=/project1")
        # urlopen should have been called with a Request object
        call_args = mock_urlopen.call_args[0][0]
        self.assertIsInstance(call_args, stdio.Request)
        # Python >= 3.11: urllib.request.Request has .full_url
        full_url = call_args.full_url if hasattr(call_args, 'full_url') else call_args.get_full_url()
        self.assertIn("/verify?path=/project1", full_url)
        self.assertEqual(call_args.method, "GET")


# ═══════════════════════════════════════════════════════════════════════════
# _http_post — HTTP POST helper
# ═══════════════════════════════════════════════════════════════════════════

class TestHttpPost(unittest.TestCase):
    """Tests for the _http_post() HTTP helper."""

    def _make_success_response(self, json_bytes: bytes) -> MagicMock:
        """Helper: build a urlopen-compatible mock that returns JSON bytes."""
        mock_resp = MagicMock()
        mock_resp.read.return_value = json_bytes
        mock_cm = MagicMock()
        mock_cm.__enter__.return_value = mock_resp
        return mock_cm

    @patch('mcp_server_stdio.urlopen')
    def test_success_returns_parsed_json(self, mock_urlopen):
        """Successful POST with valid JSON should return parsed dict."""
        mock_urlopen.return_value = self._make_success_response(
            b'{"output": "(ok)"}'
        )
        result = stdio._http_post("/exec", {"code": "print('hello')"})
        self.assertEqual(result, {"output": "(ok)"})

    @patch('mcp_server_stdio.urlopen')
    def test_urlerror_returns_error_dict(self, mock_urlopen):
        """URLError should return dict with 'error' key."""
        from urllib.error import URLError
        mock_urlopen.side_effect = URLError("Timeout")
        result = stdio._http_post("/exec", {"code": "test"})
        self.assertIn("error", result)
        # str(URLError) formats as '<urlopen error Timeout>'
        self.assertIn("Timeout", result["error"])

    @patch('mcp_server_stdio.urlopen')
    def test_json_decode_error_returns_error_dict(self, mock_urlopen):
        """Non-JSON response should return error dict."""
        mock_urlopen.return_value = self._make_success_response(
            b'Internal Server Error (not JSON)'
        )
        result = stdio._http_post("/exec", {"code": "test"})
        self.assertIn("error", result)
        self.assertIn("Non-JSON response", result["error"])

    @patch('mcp_server_stdio.urlopen')
    def test_passes_body_as_json_with_content_type(self, mock_urlopen):
        """Verify POST body is JSON-encoded with correct Content-Type."""
        mock_urlopen.return_value = self._make_success_response(b'{}')
        stdio._http_post("/parameters/set", {"path": "/op1", "params": {"amp": 0.5}})
        call_args = mock_urlopen.call_args[0]
        req = call_args[0]
        self.assertIsInstance(req, stdio.Request)
        # Body should be JSON-encoded bytes
        self.assertIsInstance(req.data, bytes)
        import json
        body = json.loads(req.data.decode())
        self.assertEqual(body, {"path": "/op1", "params": {"amp": 0.5}})
        # Content-Type header — note: Request.add_header capitalises the key
        # via str.capitalize(), so 'Content-Type' becomes 'Content-type'
        self.assertEqual(req.get_header("Content-type"), "application/json")

    @patch('mcp_server_stdio.urlopen')
    def test_http_error_is_caught(self, mock_urlopen):
        """HTTPError (e.g. 400 Bad Request) should be caught."""
        from urllib.error import HTTPError
        import io
        error = HTTPError("http://localhost:44444/exec", 400, "Bad Request", {}, io.BytesIO())
        mock_urlopen.side_effect = error
        result = stdio._http_post("/exec", {"code": "bad"})
        self.assertIn("error", result)
        self.assertIn("400", result["error"])


# ═══════════════════════════════════════════════════════════════════════════
# _handle_read_resource — Resource reading with mocked HTTP
# ═══════════════════════════════════════════════════════════════════════════

class TestReadResourceExtended(unittest.TestCase):
    """Extended tests for _handle_read_resource() using mocked _http_get."""

    @patch.object(stdio, '_http_get')
    def test_td_info_returns_json_content(self, mock_get):
        """td://info should call _http_get('/info')."""
        mock_get.return_value = {"projectFPS": 60, "version": "2022.28000"}
        result = stdio._handle_read_resource({"uri": "td://info"})
        mock_get.assert_called_once_with("/info")
        self.assertIn("contents", result)
        self.assertEqual(result["contents"][0]["mimeType"], "application/json")
        text = result["contents"][0]["text"]
        self.assertIn("60", text)
        self.assertIn("2022.28000", text)

    @patch.object(stdio, '_http_get')
    def test_td_performance_returns_json_content(self, mock_get):
        """td://performance should call _http_get('/audit/performance')."""
        mock_get.return_value = {"fps": 60, "slowestOps": []}
        result = stdio._handle_read_resource({"uri": "td://performance"})
        mock_get.assert_called_once_with("/audit/performance")
        self.assertEqual(result["contents"][0]["mimeType"], "application/json")
        self.assertIn("60", result["contents"][0]["text"])

    @patch.object(stdio, '_http_get')
    def test_td_spatial_context_returns_json_content(self, mock_get):
        """td://spatial_context should call _http_get('/spatial_context')."""
        mock_get.return_value = {"here": "/project1"}
        result = stdio._handle_read_resource({"uri": "td://spatial_context"})
        mock_get.assert_called_once_with("/spatial_context")
        self.assertEqual(result["contents"][0]["mimeType"], "application/json")

    @patch.object(stdio, '_http_get')
    def test_td_info_http_get_failure_returns_error_content(self, mock_get):
        """If _http_get returns an error, text/plain with error should be returned."""
        mock_get.return_value = {"error": "Connection refused"}
        result = stdio._handle_read_resource({"uri": "td://info"})
        self.assertEqual(result["contents"][0]["mimeType"], "application/json")
        # The error dict is serialized as JSON text
        self.assertIn("Connection refused", result["contents"][0]["text"])

    @patch.object(stdio, '_http_get')
    def test_unknown_uri_does_not_call_http(self, mock_get):
        """Unknown URI should not make any HTTP call."""
        result = stdio._handle_read_resource({"uri": "td://unknown"})
        mock_get.assert_not_called()
        self.assertEqual(result["contents"][0]["mimeType"], "text/plain")
        self.assertIn("Error", result["contents"][0]["text"])


# ═══════════════════════════════════════════════════════════════════════════
# main() — stdin/stdout loop
# ═══════════════════════════════════════════════════════════════════════════

class TestMainLoop(unittest.TestCase):
    """Tests for the main() function that reads JSON-RPC from stdin and
    writes responses to stdout.

    Patches sys.stdin with StringIO and sys.stdout with StringIO so the
    main loop can be tested without launching a subprocess.
    """

    def setUp(self):
        """Replace stdin/stdout with StringIO buffers."""
        self._orig_stdin = sys.stdin
        self._orig_stdout = sys.stdout
        self.stdin = StringIO()
        self.stdout = StringIO()
        sys.stdin = self.stdin
        sys.stdout = self.stdout

    def tearDown(self):
        """Restore original stdin/stdout."""
        sys.stdin = self._orig_stdin
        sys.stdout = self._orig_stdout

    def _write_requests(self, *requests: str) -> None:
        """Write one or more JSON-RPC strings to the simulated stdin,
        separated by newlines, then seek back to the start so main()
        can read them.
        """
        self.stdin.write("\n".join(requests) + "\n")
        self.stdin.seek(0)

    def _read_output(self) -> list[dict]:
        """Read all lines from the captured stdout and parse each as JSON.
        Returns a list of parsed response dicts.
        """
        self.stdout.seek(0)
        lines = [l for l in self.stdout.read().split("\n") if l.strip()]
        return [json.loads(l) for l in lines]

    # ── Parse error: invalid JSON ───────────────────────────────────────

    def test_invalid_json_returns_parse_error(self):
        """Non-JSON input should produce -32700 parse error."""
        self._write_requests("this is not json")
        stdio.main()
        responses = self._read_output()
        self.assertEqual(len(responses), 1)
        err = responses[0]["error"]
        self.assertEqual(err["code"], -32700)
        self.assertIn("Parse error", err["message"])

    def test_invalid_json_has_null_id(self):
        """Parse errors should have id=None per JSON-RPC 2.0."""
        self._write_requests("{broken json")
        stdio.main()
        responses = self._read_output()
        self.assertIsNone(responses[0].get("id"))

    # ── Invalid request: missing method ─────────────────────────────────

    def test_missing_method_returns_invalid_request(self):
        """Request without 'method' key should return -32600."""
        self._write_requests(json.dumps({"jsonrpc": "2.0", "id": 1, "params": {}}))
        stdio.main()
        responses = self._read_output()
        self.assertEqual(len(responses), 1)
        err = responses[0]["error"]
        self.assertEqual(err["code"], -32600)
        self.assertIn("Invalid Request", err["message"])

    def test_missing_method_echoes_id(self):
        """Invalid request should echo the request id."""
        self._write_requests(json.dumps({"jsonrpc": "2.0", "id": 42}))
        stdio.main()
        responses = self._read_output()
        self.assertEqual(responses[0]["id"], 42)

    def test_list_as_request_returns_error(self):
        """A JSON list (not dict) should return -32600 with id=None."""
        self._write_requests("[1, 2, 3]")
        stdio.main()
        responses = self._read_output()
        self.assertEqual(len(responses), 1)
        self.assertEqual(responses[0]["error"]["code"], -32600)

    # ── Normal dispatch cases (mocked _dispatch) ────────────────────────

    @patch.object(stdio, '_handle_list_tools')
    def test_tools_list_dispatched(self, mock_handler):
        """A valid tools/list request should be dispatched and the response
        written to stdout."""
        mock_handler.return_value = {"tools": [{"name": "mock_tool"}]}

        req = {"jsonrpc": "2.0", "id": 1, "method": "tools/list"}
        self._write_requests(json.dumps(req))
        stdio.main()

        mock_handler.assert_called_once()
        responses = self._read_output()
        self.assertEqual(len(responses), 1)
        self.assertEqual(responses[0]["id"], 1)
        self.assertEqual(responses[0]["result"]["tools"][0]["name"], "mock_tool")

    @patch.object(stdio, '_handle_list_resources')
    def test_resources_list_dispatched(self, mock_handler):
        """A valid resources/list request should be dispatched."""
        mock_handler.return_value = {"resources": []}

        req = {"jsonrpc": "2.0", "id": 5, "method": "resources/list"}
        self._write_requests(json.dumps(req))
        stdio.main()

        mock_handler.assert_called_once()
        responses = self._read_output()
        self.assertEqual(responses[0]["id"], 5)

    @patch.object(stdio, '_handle_call_tool')
    def test_tools_call_dispatched(self, mock_handler):
        """A valid tools/call request should be dispatched with params."""
        mock_handler.return_value = {
            "content": [{"type": "text", "text": "result"}]}

        req = {
            "jsonrpc": "2.0", "id": 3, "method": "tools/call",
            "params": {"name": "create_td_node", "arguments": {"type": "td.noiseTOP"}},
        }
        self._write_requests(json.dumps(req))
        stdio.main()

        mock_handler.assert_called_once_with(
            {"name": "create_td_node", "arguments": {"type": "td.noiseTOP"}}
        )
        responses = self._read_output()
        self.assertEqual(responses[0]["id"], 3)

    # ── Notification (no response) ─────────────────────────────────────

    def test_notification_produces_no_output(self):
        """notifications/initialized should produce no stdout output."""
        self._write_requests(
            json.dumps({"jsonrpc": "2.0", "id": 1, "method": "notifications/initialized"})
        )
        stdio.main()
        self.stdout.seek(0)
        output = self.stdout.read().strip()
        self.assertEqual(output, "")

    # ── Multiple requests in sequence ───────────────────────────────────

    def test_multiple_requests_all_get_responses(self):
        """Multiple requests in stdin should each get a response."""
        self._write_requests(
            json.dumps({"jsonrpc": "2.0", "id": 1, "method": "initialize"}),
            json.dumps({"jsonrpc": "2.0", "id": 2, "method": "tools/list"}),
        )
        stdio.main()
        responses = self._read_output()
        self.assertEqual(len(responses), 2)
        self.assertEqual(responses[0]["id"], 1)
        self.assertEqual(responses[1]["id"], 2)
        self.assertIn("protocolVersion", responses[0]["result"])
        self.assertIn("tools", responses[1]["result"])

    def test_parse_error_then_valid_request(self):
        """Server should recover after a parse error and handle the next request."""
        self._write_requests(
            "not json",
            json.dumps({"jsonrpc": "2.0", "id": 2, "method": "initialize"}),
        )
        stdio.main()
        responses = self._read_output()
        self.assertEqual(len(responses), 2)
        # First response: parse error
        self.assertEqual(responses[0]["error"]["code"], -32700)
        # Second response: valid initialize result
        self.assertEqual(responses[1]["id"], 2)
        self.assertIn("protocolVersion", responses[1]["result"])

    # ── Empty lines ─────────────────────────────────────────────────────

    def test_empty_lines_are_skipped(self):
        """Empty lines in stdin should be silently skipped."""
        self._write_requests(
            "",
            json.dumps({"jsonrpc": "2.0", "id": 1, "method": "initialize"}),
            "",
            "   ",
        )
        stdio.main()
        responses = self._read_output()
        self.assertEqual(len(responses), 1)
        self.assertEqual(responses[0]["id"], 1)

    # ── Internal errors ─────────────────────────────────────────────────

    @patch.object(stdio, '_dispatch')
    def test_dispatch_raises_exception_returns_internal_error(self, mock_dispatch):
        """If _dispatch raises an unexpected exception, an internal error
        (-32603) should be returned."""
        mock_dispatch.side_effect = RuntimeError("Unexpected failure")

        self._write_requests(
            json.dumps({"jsonrpc": "2.0", "id": 1, "method": "tools/list"})
        )
        stdio.main()
        responses = self._read_output()
        self.assertEqual(len(responses), 1)
        err = responses[0]["error"]
        self.assertEqual(err["code"], -32603)
        self.assertIn("Unexpected failure", err["message"])
        self.assertEqual(responses[0]["id"], 1)

    # ── Response JSON format ────────────────────────────────────────────

    def test_response_has_jsonrpc_field(self):
        """Every response should include 'jsonrpc': '2.0'."""
        self._write_requests(
            json.dumps({"jsonrpc": "2.0", "id": 1, "method": "initialize"})
        )
        stdio.main()
        responses = self._read_output()
        self.assertEqual(responses[0]["jsonrpc"], "2.0")


# ═══════════════════════════════════════════════════════════════════════════
# Main entry
# ═══════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    unittest.main()
