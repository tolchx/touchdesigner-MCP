#!/usr/bin/env python3
"""
Unit tests for w2t_server.py — Pure functions extracted from the async server.

Tests the WebSocket frame parsing, HTTP request parsing, MCP code generation,
and file-serving helper functions without requiring a running server or
network infrastructure.

Run:
    python -m unittest tests.test_w2t_server_unit -v

Uses unittest.mock for filesystem-dependent functions.
"""

import json
import os
import pathlib
import sys
import tempfile
import unittest
from unittest.mock import patch, MagicMock

# ── Ensure the project root is on sys.path ──
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

# The module uses ``if __name__ == \"__main__\": main()`` guard so importing
# it does not start the server.
import w2t_server as w2t


# ═══════════════════════════════════════════════════════════════════════════
# _compute_ws_accept — WebSocket accept key (RFC 6455 §4.2.2)
# ═══════════════════════════════════════════════════════════════════════════

class TestComputeWsAccept(unittest.TestCase):
    """Tests for _compute_ws_accept()."""

    def test_known_key(self):
        """Known key from RFC 6455 examples should produce known accept."""
        # RFC 6455 §4.2.2 example:
        # Key: "dGhlIHNhbXBsZSBub25jZQ=="
        # Accept: "s3pPLMBiTxaQ9kYGzzhZRbK+xOo="
        result = w2t._compute_ws_accept("dGhlIHNhbXBsZSBub25jZQ==")
        self.assertEqual(result, "s3pPLMBiTxaQ9kYGzzhZRbK+xOo=")

    def test_empty_key(self):
        """Empty key should still produce a deterministic accept."""
        result = w2t._compute_ws_accept("")
        # SHA1("" + MAGIC) → base64
        self.assertEqual(len(result), 28)  # 20 bytes → 28 base64 chars
        self.assertTrue(result.endswith("="))

    def test_long_key(self):
        """Long keys should work correctly."""
        key = "x" * 100
        result = w2t._compute_ws_accept(key)
        self.assertEqual(len(result), 28)
        self.assertTrue(result.endswith("="))

    def test_deterministic(self):
        """Same input always produces same output."""
        k = "test-key-value"
        self.assertEqual(
            w2t._compute_ws_accept(k),
            w2t._compute_ws_accept(k),
        )

    def test_different_keys_different_accept(self):
        """Different keys produce different accept values."""
        self.assertNotEqual(
            w2t._compute_ws_accept("key-a"),
            w2t._compute_ws_accept("key-b"),
        )


# ═══════════════════════════════════════════════════════════════════════════
# _parse_ws_header — WS frame header (first 2 bytes)
# ═══════════════════════════════════════════════════════════════════════════

class TestParseWsHeader(unittest.TestCase):
    """Tests for _parse_ws_header()."""

    def test_text_frame_fin_masked(self):
        """Text frame (opcode 1), FIN set, masked = 1, length 5."""
        data = bytes([0x81, 0x85])  # FIN=1, opcode=1, mask=1, len=5
        opcode, fin, masked, raw_len = w2t._parse_ws_header(data)
        self.assertEqual(opcode, 1)
        self.assertTrue(fin)
        self.assertTrue(masked)
        self.assertEqual(raw_len, 5)

    def test_text_frame_unmasked(self):
        """Text frame, FIN set, unmasked, length 10."""
        data = bytes([0x81, 0x0A])
        opcode, fin, masked, raw_len = w2t._parse_ws_header(data)
        self.assertEqual(opcode, 1)
        self.assertTrue(fin)
        self.assertFalse(masked)
        self.assertEqual(raw_len, 10)

    def test_close_frame(self):
        """Close frame: opcode 8, FIN set, unmasked."""
        data = bytes([0x88, 0x02])  # close frame, payload len 2
        opcode, fin, masked, raw_len = w2t._parse_ws_header(data)
        self.assertEqual(opcode, 8)
        self.assertTrue(fin)

    def test_ping_frame(self):
        """Ping frame: opcode 9, FIN set, unmasked."""
        data = bytes([0x89, 0x00])
        opcode, fin, masked, raw_len = w2t._parse_ws_header(data)
        self.assertEqual(opcode, 9)
        self.assertTrue(fin)
        self.assertEqual(raw_len, 0)

    def test_pong_frame(self):
        """Pong frame: opcode 10, FIN set, unmasked."""
        data = bytes([0x8A, 0x00])
        opcode, fin, masked, raw_len = w2t._parse_ws_header(data)
        self.assertEqual(opcode, 10)
        self.assertEqual(raw_len, 0)

    def test_continuation_frame(self):
        """Continuation frame: opcode 0, FIN not set."""
        data = bytes([0x00, 0x05])  # no FIN, opcode 0
        opcode, fin, masked, raw_len = w2t._parse_ws_header(data)
        self.assertEqual(opcode, 0)
        self.assertFalse(fin)

    def test_rsv_bits_stripped(self):
        """RSV bits (bits 4-6 of byte 0) should be stripped from opcode."""
        data = bytes([0xF1, 0x00])  # RSV=111 + opcode=1
        opcode, fin, masked, raw_len = w2t._parse_ws_header(data)
        self.assertEqual(opcode, 1)  # 0xF1 & 0x0F = 0x01

    def test_extended_length_126_indicator(self):
        """Length byte = 126 indicates extended length follows."""
        data = bytes([0x81, 0xFE])  # 0xFE = 126 in 7 bits
        opcode, fin, masked, raw_len = w2t._parse_ws_header(data)
        self.assertEqual(raw_len, 126)  # raw 7-bit value, not actual length

    def test_extended_length_127_indicator(self):
        """Length byte = 127 indicates 8-byte extended length follows."""
        data = bytes([0x81, 0xFF])  # 0xFF = 127 in 7 bits
        opcode, fin, masked, raw_len = w2t._parse_ws_header(data)
        self.assertEqual(raw_len, 127)

    def test_max_7bit_length(self):
        """Maximum 7-bit length = 125 is returned directly."""
        data = bytes([0x81, 0x7D])
        opcode, fin, masked, raw_len = w2t._parse_ws_header(data)
        self.assertEqual(raw_len, 125)

    def test_too_short_raises(self):
        """Less than 2 bytes should raise ValueError."""
        with self.assertRaises(ValueError) as ctx:
            w2t._parse_ws_header(b"")
        self.assertIn("too short", str(ctx.exception))

        with self.assertRaises(ValueError):
            w2t._parse_ws_header(b"\x81")

    def test_single_byte_raises(self):
        """Exactly 1 byte should raise ValueError."""
        with self.assertRaises(ValueError):
            w2t._parse_ws_header(b"\x81")


# ═══════════════════════════════════════════════════════════════════════════
# _read_payload_length — Extended length resolution
# ═══════════════════════════════════════════════════════════════════════════

class TestReadPayloadLength(unittest.TestCase):
    """Tests for _read_payload_length()."""

    def test_code_0_to_125_returns_directly(self):
        """Codes 0-125 should be returned unchanged (no extended bytes)."""
        for code in [0, 1, 64, 125]:
            self.assertEqual(w2t._read_payload_length(code, b""), code)

    def test_code_126_reads_2_bytes(self):
        """Code 126 should read 2-byte extended length (network byte order)."""
        self.assertEqual(w2t._read_payload_length(126, b"\x00\x05"), 5)
        self.assertEqual(w2t._read_payload_length(126, b"\x01\x00"), 256)
        self.assertEqual(w2t._read_payload_length(126, b"\xff\xff"), 65535)

    def test_code_127_reads_8_bytes(self):
        """Code 127 should read 8-byte extended length."""
        self.assertEqual(w2t._read_payload_length(127, b"\x00" * 8), 0)
        self.assertEqual(w2t._read_payload_length(127, b"\x00" * 7 + b"\x01"), 1)

    def test_code_126_too_few_bytes_raises(self):
        """Code 126 with < 2 extended bytes should raise ValueError."""
        with self.assertRaises(ValueError) as ctx:
            w2t._read_payload_length(126, b"\x00")
        self.assertIn("needs 2 bytes", str(ctx.exception))

        with self.assertRaises(ValueError):
            w2t._read_payload_length(126, b"")

    def test_code_127_too_few_bytes_raises(self):
        """Code 127 with < 8 extended bytes should raise ValueError."""
        with self.assertRaises(ValueError) as ctx:
            w2t._read_payload_length(127, b"\x00" * 7)
        self.assertIn("needs 8 bytes", str(ctx.exception))

    def test_large_payload_126_max(self):
        """Maximum 16-bit extended length."""
        self.assertEqual(
            w2t._read_payload_length(126, b"\xff\xff"),
            65535,
        )


# ═══════════════════════════════════════════════════════════════════════════
# _apply_mask — WebSocket XOR masking
# ═══════════════════════════════════════════════════════════════════════════

class TestApplyMask(unittest.TestCase):
    """Tests for _apply_mask()."""

    def test_empty_payload(self):
        """Empty payload should return empty bytes."""
        result = w2t._apply_mask(b"", b"\x00\x00\x00\x00")
        self.assertEqual(result, b"")

    def test_null_mask_passthrough(self):
        """Zero mask should leave payload unchanged."""
        payload = b"hello"
        result = w2t._apply_mask(payload, b"\x00\x00\x00\x00")
        self.assertEqual(result, payload)

    def test_known_mask(self):
        """Known XOR mask should produce predictable output."""
        # payload = b"AAAA" (0x41 0x41 0x41 0x41)
        # mask    = b"\x01\x02\x03\x04"
        # XOR: 0x41^0x01=0x40='@', 0x41^0x02=0x43='C',
        #      0x41^0x03=0x42='B', 0x41^0x04=0x45='E'
        result = w2t._apply_mask(b"AAAA", b"\x01\x02\x03\x04")
        self.assertEqual(result, b"@CBE")

    def test_mask_repeated_at_4_byte_boundary(self):
        """XOR mask repeats every 4 bytes."""
        # payload = b"AAAAAAAA" (8 bytes)
        # mask    = b"\x01\x02\x03\x04"
        # XOR repeats: @CBE@CBE
        result = w2t._apply_mask(b"AAAAAAAA", b"\x01\x02\x03\x04")
        self.assertEqual(result, b"@CBE@CBE")

    def test_unmasking_is_symmetric(self):
        """Applying the same mask twice returns the original (XOR property)."""
        payload = b"WebSocket test data 12345"
        mask = b"\xab\xcd\xef\x01"
        masked = w2t._apply_mask(payload, mask)
        unmasked = w2t._apply_mask(masked, mask)
        self.assertEqual(unmasked, payload)

    def test_wrong_mask_length_raises(self):
        """Mask not exactly 4 bytes should raise ValueError."""
        with self.assertRaises(ValueError) as ctx:
            w2t._apply_mask(b"test", b"\x00\x00\x00")
        self.assertIn("exactly 4 bytes", str(ctx.exception))

        with self.assertRaises(ValueError):
            w2t._apply_mask(b"test", b"")

        with self.assertRaises(ValueError):
            w2t._apply_mask(b"test", b"\x00" * 5)


# ═══════════════════════════════════════════════════════════════════════════
# _parse_http_request — HTTP request parsing
# ═══════════════════════════════════════════════════════════════════════════

class TestParseHttpRequest(unittest.TestCase):
    """Tests for _parse_http_request()."""

    def test_simple_get(self):
        """Simple GET request should parse method, URI, and headers."""
        text = "GET /index.html HTTP/1.1\r\nHost: localhost\r\n\r\n"
        method, uri, headers = w2t._parse_http_request(text)
        self.assertEqual(method, "GET")
        self.assertEqual(uri, "/index.html")
        self.assertEqual(headers["host"], "localhost")

    def test_ws_upgrade_request(self):
        """WebSocket upgrade request should parse all WS headers."""
        key = "dGhlIHNhbXBsZSBub25jZQ=="
        text = (
            "GET /ws HTTP/1.1\r\n"
            "Host: localhost:8090\r\n"
            f"Sec-WebSocket-Key: {key}\r\n"
            "Upgrade: websocket\r\n"
            "Connection: Upgrade\r\n"
            "\r\n"
        )
        method, uri, headers = w2t._parse_http_request(text)
        self.assertEqual(method, "GET")
        self.assertEqual(uri, "/ws")
        self.assertEqual(headers["sec-websocket-key"], key)
        self.assertEqual(headers["upgrade"], "websocket")

    def test_headers_are_lowercased(self):
        """Header keys should be normalized to lowercase."""
        text = "GET / HTTP/1.1\r\nContent-Type: text/html\r\nX-Custom: val\r\n\r\n"
        _, _, headers = w2t._parse_http_request(text)
        self.assertIn("content-type", headers)
        self.assertIn("x-custom", headers)
        self.assertNotIn("Content-Type", headers)

    def test_malformed_request_line(self):
        """Malformed request line should return empty method, / URI."""
        text = "\r\n\r\n"
        method, uri, _ = w2t._parse_http_request(text)
        self.assertEqual(method, "")
        self.assertEqual(uri, "/")

    def test_empty_text(self):
        """Empty text should return empty method, / URI."""
        method, uri, _ = w2t._parse_http_request("")
        self.assertEqual(method, "")
        self.assertEqual(uri, "/")

    def test_multiple_header_values(self):
        """Multiple headers with same name should all be captured (last wins)."""
        text = "GET / HTTP/1.1\r\nAccept: text/html\r\nAccept: application/json\r\n\r\n"
        _, _, headers = w2t._parse_http_request(text)
        self.assertEqual(headers["accept"], "application/json")  # last wins

    def test_header_with_colon_in_value(self):
        """Header values containing colons should be handled correctly."""
        text = "GET / HTTP/1.1\r\nLocation: http://example.com:8080/path\r\n\r\n"
        _, _, headers = w2t._parse_http_request(text)
        self.assertEqual(headers["location"], "http://example.com:8080/path")

    def test_query_string_in_uri(self):
        """URI with query string should be preserved."""
        text = "GET /path?a=1&b=2 HTTP/1.1\r\nHost: localhost\r\n\r\n"
        _, uri, _ = w2t._parse_http_request(text)
        self.assertEqual(uri, "/path?a=1&b=2")


# ═══════════════════════════════════════════════════════════════════════════
# _build_forward_code — MCP forwarding code generation
# ═══════════════════════════════════════════════════════════════════════════

# ═══════════════════════════════════════════════════════════════════════════
# _py_esc_double — Double-quote escaping for generated Python code
# ═══════════════════════════════════════════════════════════════════════════

class TestPyEscDouble(unittest.TestCase):
    """Tests for _py_esc_double() that escapes strings for embedding
    inside double-quoted Python string literals."""

    def test_empty_string(self):
        """Empty string should remain empty."""
        self.assertEqual(w2t._py_esc_double(""), "")

    def test_normal_string_no_escaping_needed(self):
        """Normal alphanumeric strings should pass through unchanged."""
        self.assertEqual(w2t._py_esc_double("normal"), "normal")
        self.assertEqual(w2t._py_esc_double("sensor-01"), "sensor-01")
        self.assertEqual(w2t._py_esc_double("23.5"), "23.5")

    def test_double_quote_is_escaped(self):
        """Double quotes must be escaped to prevent breaking the Python string literal."""
        self.assertEqual(w2t._py_esc_double('say "hello"'), 'say \\"hello\\"')
        self.assertEqual(w2t._py_esc_double('"'), '\\"')

    def test_backslash_is_escaped(self):
        """Backslashes must be escaped to prevent unintended escape sequences."""
        self.assertEqual(w2t._py_esc_double("path\\to"), "path\\\\to")
        self.assertEqual(w2t._py_esc_double("\\"), "\\\\")

    def test_backslash_then_quote(self):
        """Backslash followed by double quote — both must be escaped."""
        self.assertEqual(w2t._py_esc_double('\\"'), '\\\\\\"')

    def test_multiple_quotes_and_backslashes(self):
        """Multiple special characters must all be escaped.
        Verify via compile() rather than exact string comparison
        since backslash/quote combinations are hard to represent."""
        result = w2t._py_esc_double('it\\"s a \\"test\\" with \\backslash\\')
        # Generated code must be syntactically valid
        code = f'x="{result}"'
        compile(code, "<test>", "exec")

    def test_single_quotes_not_escaped(self):
        """Single quotes are safe inside double-quoted strings and should not be escaped."""
        result = w2t._py_esc_double("it's fine")
        self.assertEqual(result, "it's fine")

    def test_unicode_preserved(self):
        """Unicode characters should not be mangled."""
        result = w2t._py_esc_double("café")
        self.assertEqual(result, "café")

    def test_generated_code_compiles_after_escape(self):
        """Escaped string should produce valid Python when embedded in code."""
        malicious = 'valid\\" + os.system("rm") + "'
        escaped = w2t._py_esc_double(malicious)
        code = f'x="{escaped}"'
        compile(code, "<test>", "exec")


class TestBuildForwardCode(unittest.TestCase):
    """Tests for _build_forward_code()."""

    def test_full_message_with_id_type_value(self):
        """Message with id/type/value should embed all three."""
        code = w2t._build_forward_code(
            {"id": "sensor-01", "type": "temp", "value": "23.5"},
            '{"id":"sensor-01","type":"temp","value":"23.5"}',
        )
        self.assertIn("sensor-01", code)
        self.assertIn("temp", code)
        self.assertIn("23.5", code)
        # Should be syntactically valid Python
        compile(code, "<test>", "exec")

    def test_message_without_id_uses_empty_string(self):
        """Message missing 'id' should use empty string."""
        code = w2t._build_forward_code(
            {"type": "button", "value": "click"},
            '{"type":"button","value":"click"}',
        )
        self.assertIn('cid=""', code)
        compile(code, "<test>", "exec")

    def test_message_without_value_uses_raw_msg(self):
        """Message missing 'value' should use raw_msg as fallback."""
        code = w2t._build_forward_code(
            {"id": "m1", "type": "text"},
            "raw text fallback",
        )
        self.assertIn("raw text fallback", code)
        compile(code, "<test>", "exec")

    def test_non_json_data_empty_dict(self):
        """When data is empty dict (non-JSON msg), cid/ctype are blank."""
        code = w2t._build_forward_code({}, "hello world")
        self.assertIn('cid=""', code)
        self.assertIn('ctype=""', code)
        self.assertIn("hello world", code)  # raw_msg as value
        compile(code, "<test>", "exec")

    def test_numeric_id_converted_to_string(self):
        """Numeric id should be converted to string."""
        code = w2t._build_forward_code(
            {"id": 42, "type": "counter", "value": "100"},
            "",
        )
        self.assertIn('cid="42"', code)
        compile(code, "<test>", "exec")

    def test_timestamp_field_not_in_code(self):
        """Timestamp in data is accepted but not embedded in code."""
        code = w2t._build_forward_code(
            {"id": "x", "type": "y", "value": "z", "timestamp": "2026-01-01"},
            "",
        )
        # timestamp is not in the generated code (original behavior)
        self.assertNotIn("2026", code)
        compile(code, "<test>", "exec")

    def test_generated_code_has_correct_structure(self):
        """Generated code should reference the neon_values table."""
        code = w2t._build_forward_code(
            {"id": "t1", "type": "test", "value": "v1"},
            "",
        )
        self.assertIn("neon_values", code)
        self.assertIn("appendRow", code)
        self.assertIn("numRows", code)
        compile(code, "<test>", "exec")

    # ── Injection security tests ────────────────────────────────────────

    def test_injection_double_quote_in_id(self):
        """Double quote in id must be escaped to prevent Python injection."""
        code = w2t._build_forward_code(
            {"id": 'bad" + os.system("rm") + "', "type": "x", "value": "y"},
            "",
        )
        # Must still compile — injected quote must be escaped
        compile(code, "<test>", "exec")
        self.assertIn("os.system", code)  # value still present as literal text
        self.assertIn('\\"', code)  # escaped quote

    def test_injection_double_quote_in_type(self):
        """Double quote in type must be escaped."""
        code = w2t._build_forward_code(
            {"id": "1", "type": '"); print("injected"', "value": "y"},
            "",
        )
        compile(code, "<test>", "exec")
        self.assertIn('\\"', code)

    def test_injection_double_quote_in_value(self):
        """Double quote in value must be escaped."""
        code = w2t._build_forward_code(
            {"id": "1", "type": "x", "value": '"); import os; os.system("evil"); "'},
            "",
        )
        compile(code, "<test>", "exec")

    def test_injection_backslash_in_id(self):
        """Backslash in id must be escaped to prevent escape sequence injection."""
        code = w2t._build_forward_code(
            {"id": "test\\", "type": "x", "value": "y"},
            "",
        )
        compile(code, "<test>", "exec")

    def test_injection_backslash_and_quote_combined(self):
        """Combined backslash+quote attack must be neutralized."""
        # Attack: value = "\\"  →  escaped: "\\\\\\"  →  safe
        code = w2t._build_forward_code(
            {"id": "1", "type": "x", "value": '\\"'},
            "",
        )
        compile(code, "<test>", "exec")

    def test_injection_newlines_in_value(self):
        """Newlines in value should be escaped as \\n in generated code."""
        code = w2t._build_forward_code(
            {"id": "1", "type": "x", "value": "line1\nline2"},
            "",
        )
        self.assertIn("line1", code)
        self.assertIn("line2", code)
        # The newline should appear as \\n escape, not literal newline
        self.assertIn("\\n", code)
        compile(code, "<test>", "exec")

    def test_injection_raw_msg_fallback_escaped(self):
        """When value is missing, raw_msg fallback must also be escaped."""
        code = w2t._build_forward_code(
            {"id": "1", "type": "x"},
            'raw with "quotes" and \\backslashes',
        )
        compile(code, "<test>", "exec")
    # ── Table schema validation tests ─────────────────────────────────

    def test_table_target_path(self) -> None:
        """Generated code should target the neon_values table."""
        code = w2t._build_forward_code(
            {"id": "x", "type": "y", "value": "z"},
            "",
        )
        self.assertIn('op("/project1/neon_values")', code)
        compile(code, "<test>", "exec")

    def test_table_schema_four_columns_in_append_row(self) -> None:
        """appendRow should have exactly 4 columns: [cid, ctype, cval, cts]."""
        code = w2t._build_forward_code(
            {"id": "s1", "type": "sensor", "value": "23.5"},
            "",
        )
        self.assertIn("appendRow([cid,ctype,cval,cts])", code)
        # Row must use exactly these 4 variables in order
        self.assertIn("[cid,ctype,cval,cts]", code)
        compile(code, "<test>", "exec")

    def test_table_upsert_lookup_by_cid(self) -> None:
        """Upsert should search existing rows by column 0 (cid)."""
        code = w2t._build_forward_code(
            {"id": "s1", "type": "sensor", "value": "23.5"},
            "",
        )
        self.assertIn("t[r,0].val==cid", code)
        compile(code, "<test>", "exec")

    def test_table_update_existing_row_columns(self) -> None:
        """Updating an existing row should set cval (col 2) and cts (col 3)."""
        code = w2t._build_forward_code(
            {"id": "existing", "type": "test", "value": "updated"},
            "",
        )
        self.assertIn("t[found,2]=cval", code)
        self.assertIn("t[found,3]=cts", code)
        compile(code, "<test>", "exec")

    def test_table_append_new_row_with_type(self) -> None:
        """When id is new, appendRow should include the type value."""
        code = w2t._build_forward_code(
            {"id": "new-id", "type": "slider", "value": "0.85"},
            "",
        )
        self.assertIn('cid="new-id"', code)
        self.assertIn('ctype="slider"', code)
        self.assertIn('cval="0.85"', code)
        compile(code, "<test>", "exec")

    def test_table_import_json_at_top(self) -> None:
        """Generated code should import json."""
        code = w2t._build_forward_code(
            {"id": "x", "type": "y", "value": "z"},
            "",
        )
        self.assertTrue(code.startswith("import json;"), "Code must start with import json;")
        compile(code, "<test>", "exec")

    # ── Preset data matching test UI (web2touch/test-ui.html) ──────────

    def test_preset_slider_message(self) -> None:
        """Slider preset (type=slider) should match test UI format."""
        # test UI sends: {id: 'amp', type: 'slider', value: '0.85'}
        code = w2t._build_forward_code(
            {"id": "amp", "type": "slider", "value": "0.85"},
            "",
        )
        self.assertIn('cid="amp"', code)
        self.assertIn('ctype="slider"', code)
        self.assertIn('cval="0.85"', code)
        compile(code, "<test>", "exec")

    def test_preset_toggle_on_message(self) -> None:
        """Toggle ON preset should forward all fields."""
        code = w2t._build_forward_code(
            {"id": "enable", "type": "toggle", "value": "1"},
            "",
        )
        self.assertIn('cid="enable"', code)
        self.assertIn('ctype="toggle"', code)
        self.assertIn('cval="1"', code)
        compile(code, "<test>", "exec")

    def test_preset_color_message(self) -> None:
        """Color preset (type=color) should forward hue value."""
        code = w2t._build_forward_code(
            {"id": "hue", "type": "color", "value": "0.33"},
            "",
        )
        self.assertIn('cid="hue"', code)
        self.assertIn('ctype="color"', code)
        self.assertIn('cval="0.33"', code)
        compile(code, "<test>", "exec")

    def test_preset_text_message(self) -> None:
        """Text preset should forward label string."""
        code = w2t._build_forward_code(
            {"id": "label", "type": "text", "value": "hello_td"},
            "",
        )
        self.assertIn('cid="label"', code)
        self.assertIn('ctype="text"', code)
        self.assertIn('cval="hello_td"', code)
        compile(code, "<test>", "exec")

    def test_preset_sensor_message(self) -> None:
        """Sensor preset should forward temp value."""
        code = w2t._build_forward_code(
            {"id": "temp", "type": "sensor", "value": "23.5"},
            "",
        )
        self.assertIn('cid="temp"', code)
        self.assertIn('ctype="sensor"', code)
        self.assertIn('cval="23.5"', code)
        compile(code, "<test>", "exec")

    def test_preset_trigger_message(self) -> None:
        """Trigger preset should forward reset signal."""
        code = w2t._build_forward_code(
            {"id": "reset", "type": "trigger", "value": "1"},
            "",
        )
        self.assertIn('cid="reset"', code)
        self.assertIn('ctype="trigger"', code)
        self.assertIn('cval="1"', code)
        compile(code, "<test>", "exec")

    def test_preset_timestamp_in_message_not_in_code(self) -> None:
        """Timestamp from test UI should not appear in generated code."""
        # test UI sends: {id, type, value, timestamp: new Date().toISOString()}
        code = w2t._build_forward_code(
            {"id": "temp", "type": "sensor", "value": "23.5",
             "timestamp": "2026-07-25T12:00:00.000Z"},
            "",
        )
        self.assertNotIn("2026", code)
        self.assertNotIn("timestamp", code)
        compile(code, "<test>", "exec")


# ═══════════════════════════════════════════════════════════════════════════
# _resolve_mime_type — Content-Type lookup
# ═══════════════════════════════════════════════════════════════════════════


# ==============================================================================
# _build_forward_code -- CHOP multi-channel mode
# ==============================================================================

class TestBuildForwardCodeChopMode(unittest.TestCase):
    """Tests for CHOP-like multi-channel mode of _build_forward_code().

    When ``data`` contains a ``channels`` key with a non-empty dict,
    the function generates multiple Python code blocks -- one per
    channel -- joined by newlines. Each channel becomes a separate
    row with ID ``<id>.<channel_key>``.
    """

    def _compile_blocks(self, code):
        """Compile the entire multi-block code (all channels joined)."""
        compile(code, "<test>", "exec")

    def _count_blocks(self, code):
        """Count channel blocks via 'import json;' occurrences."""
        return code.count("import json;")

    # -- Basic CHOP mode -------------------------------------------------

    def test_chop_basic_three_channels(self):
        """Canvas with u/v/select should produce 3 blocks."""
        data = {"id": "canvas", "type": "canvas",
                "channels": {"u": "0.500", "v": "0.750", "select": "1"}}
        code = w2t._build_forward_code(data, "")
        self.assertEqual(self._count_blocks(code), 3)
        self._compile_blocks(code)
        self.assertIn('cid="canvas.u"', code)
        self.assertIn('cid="canvas.v"', code)
        self.assertIn('cid="canvas.select"', code)

    def test_chop_color_rgb_hex(self):
        """Color with R/G/B/hex should produce 4 blocks."""
        data = {"id": "color", "type": "color",
                "channels": {"r": "0.5", "g": "0.2", "b": "0.8", "hex": "#8033cc"}}
        code = w2t._build_forward_code(data, "")
        self.assertEqual(self._count_blocks(code), 4)
        self._compile_blocks(code)
        self.assertIn('cid="color.r"', code)
        self.assertIn('cid="color.g"', code)
        self.assertIn('cid="color.b"', code)
        self.assertIn('cid="color.hex"', code)

    def test_chop_single_channel(self):
        """Single channel should produce 1 block."""
        data = {"id": "knob_master", "type": "knob",
                "channels": {"value": "0.850"}}
        code = w2t._build_forward_code(data, "")
        self.assertEqual(self._count_blocks(code), 1)
        self.assertIn('cid="knob_master.value"', code)
        self.assertIn('cval="0.850"', code)
        self._compile_blocks(code)

    # -- Dashboard presets -----------------------------------------------

    def test_chop_knob_master_channels(self):
        """Knob: 3 channels (value, degrees, normalized)."""
        data = {"id": "knob_master", "type": "knob",
                "channels": {"value": "0.850", "degrees": "229.5", "normalized": "0.850"}}
        code = w2t._build_forward_code(data, "")
        self.assertEqual(self._count_blocks(code), 3)
        self._compile_blocks(code)
        self.assertIn('cid="knob_master.value"', code)
        self.assertIn('cid="knob_master.degrees"', code)
        self.assertIn('cid="knob_master.normalized"', code)

    def test_chop_xypad_channels(self):
        """XY Pad: 5 channels (x, y, angle, magnitude, normalized)."""
        data = {"id": "xypad", "type": "xypad",
                "channels": {"x": "0.750", "y": "0.600", "angle": "14.0",
                             "magnitude": "0.320", "normalized": "0.675"}}
        code = w2t._build_forward_code(data, "")
        self.assertEqual(self._count_blocks(code), 5)
        self._compile_blocks(code)
        self.assertIn('cid="xypad.x"', code)
        self.assertIn('cid="xypad.y"', code)
        self.assertIn('cid="xypad.angle"', code)

    def test_chop_timeline_channels(self):
        """Timeline: 5 channels (pos, sec, norm, playing, duration)."""
        data = {"id": "timeline", "type": "timeline",
                "channels": {"position": "0.250", "seconds": "2.50",
                             "normalized": "0.250", "playing": "1", "duration": "10"}}
        code = w2t._build_forward_code(data, "")
        self.assertEqual(self._count_blocks(code), 5)
        self._compile_blocks(code)
        self.assertIn('cid="timeline.position"', code)
        self.assertIn('cid="timeline.seconds"', code)

    def test_chop_dropdown_channels(self):
        """Dropdown: 3 channels (value, index, label)."""
        data = {"id": "waveform", "type": "dropdown",
                "channels": {"value": "square", "index": "1", "label": "Square"}}
        code = w2t._build_forward_code(data, "")
        self.assertEqual(self._count_blocks(code), 3)
        self._compile_blocks(code)
        self.assertIn('cid="waveform.value"', code)
        self.assertIn('cid="waveform.label"', code)

    # -- Edge cases ------------------------------------------------------

    def test_chop_empty_channels_falls_to_simple(self):
        """Empty channels {} should fall back to simple mode."""
        data = {"id": "test", "type": "x", "value": "42", "channels": {}}
        code = w2t._build_forward_code(data, "")
        self.assertEqual(self._count_blocks(code), 1)
        self.assertIn('cid="test"', code)
        self.assertIn('cval="42"', code)
        self._compile_blocks(code)

    def test_chop_numeric_channel_values(self):
        """Numeric channel values should convert to strings."""
        data = {"id": "knob", "type": "knob",
                "channels": {"value": 0.85, "degrees": 229.5}}
        code = w2t._build_forward_code(data, "")
        self.assertEqual(self._count_blocks(code), 2)
        self.assertIn('cval="0.85"', code)
        self.assertIn('cval="229.5"', code)
        self._compile_blocks(code)

    def test_chop_mixed_value_types(self):
        """Mixed str/int/float should all convert to string."""
        data = {"id": "mix", "type": "test",
                "channels": {"s": "hello", "i": 42, "f": 3.14}}
        code = w2t._build_forward_code(data, "")
        self.assertEqual(self._count_blocks(code), 3)
        self.assertIn('cval="hello"', code)
        self.assertIn('cval="42"', code)
        self.assertIn('cval="3.14"', code)
        self._compile_blocks(code)

    def test_chop_special_chars_in_key(self):
        """Channel keys with dots should preserve them in id."""
        data = {"id": "data", "type": "sensor",
                "channels": {"temp.celsius": "23.5", "humid_pct": "68"}}
        code = w2t._build_forward_code(data, "")
        self.assertEqual(self._count_blocks(code), 2)
        self.assertIn('cid="data.temp.celsius"', code)
        self.assertIn('cid="data.humid_pct"', code)
        self._compile_blocks(code)

    def test_chop_no_id_with_channels(self):
        """Missing id -> row IDs use .key."""
        data = {"type": "canvas", "channels": {"u": "0.5", "v": "0.3"}}
        code = w2t._build_forward_code(data, "")
        self.assertEqual(self._count_blocks(code), 2)
        self.assertIn('cid=".u"', code)
        self.assertIn('cid=".v"', code)
        self._compile_blocks(code)

    # -- Structure validation -------------------------------------------

    def test_chop_each_block_has_table_ref(self):
        """Every block should reference neon_values and upsert logic."""
        data = {"id": "canvas", "type": "canvas",
                "channels": {"u": "0.5", "v": "0.7", "select": "1"}}
        code = w2t._build_forward_code(data, "")
        self.assertEqual(code.count("neon_values"), 3)
        self.assertEqual(code.count("appendRow"), 3)
        self.assertEqual(code.count("numRows"), 3)
        self.assertEqual(code.count("found=-1"), 3)
        self._compile_blocks(code)

    def test_chop_each_block_has_upsert(self):
        """Every block should contain lookup and update logic."""
        data = {"id": "knob_master", "type": "knob",
                "channels": {"value": "0.85", "degrees": "229.5", "normalized": "0.85"}}
        code = w2t._build_forward_code(data, "")
        self.assertEqual(code.count("t[r,0].val==cid"), 3)
        self.assertEqual(code.count("t[found,2]=cval"), 3)
        self._compile_blocks(code)

    # -- Injection security ----------------------------------------------

    def test_chop_injection_in_channel_value(self):
        """Injected quotes in channel values must be escaped."""
        data = {"id": "bad", "type": "x",
                "channels": {"v": 'test" + os.system("rm") + "inj'}}
        code = w2t._build_forward_code(data, "")
        self._compile_blocks(code)

    def test_chop_injection_newline_in_channel_value(self):
        """Newlines in channel values must be escaped."""
        data = {"id": "safe", "type": "x",
                "channels": {"v": "line1\nline2"}}
        code = w2t._build_forward_code(data, "")
        self._compile_blocks(code)
        self.assertEqual(self._count_blocks(code), 1)

    # -- Canvas presets (Web2Touch original) -----------------------------

    def test_chop_canvas_u_v_select(self):
        """Canvas preset: u=0.5, v=0.3, select=1."""
        data = {"id": "canvas", "type": "canvas",
                "channels": {"u": "0.500", "v": "0.300", "select": "1"}}
        code = w2t._build_forward_code(data, "")
        self.assertEqual(self._count_blocks(code), 3)
        self.assertIn('cid="canvas.u"', code)
        self.assertIn('cid="canvas.v"', code)
        self.assertIn('cid="canvas.select"', code)
        self._compile_blocks(code)

    def test_chop_canvas_clear_with_rselect(self):
        """Canvas clear: u=0, v=0, select=0, rselect=1."""
        data = {"id": "canvas", "type": "canvas",
                "channels": {"u": "0", "v": "0", "select": "0", "rselect": "1"}}
        code = w2t._build_forward_code(data, "")
        self.assertEqual(self._count_blocks(code), 4)
        self.assertIn('cid="canvas.rselect"', code)
        self.assertIn('cval="1"', code)
        self._compile_blocks(code)


class TestResolveMimeType(unittest.TestCase):
    """Tests for _resolve_mime_type()."""

    def test_html(self):
        self.assertEqual(w2t._resolve_mime_type(".html"), "text/html")

    def test_js(self):
        self.assertEqual(w2t._resolve_mime_type(".js"), "application/javascript")

    def test_css(self):
        self.assertEqual(w2t._resolve_mime_type(".css"), "text/css")

    def test_png(self):
        self.assertEqual(w2t._resolve_mime_type(".png"), "image/png")

    def test_svg(self):
        self.assertEqual(w2t._resolve_mime_type(".svg"), "image/svg+xml")

    def test_unknown_returns_octet_stream(self):
        """Unknown extensions should return application/octet-stream."""
        self.assertEqual(
            w2t._resolve_mime_type(".unknown"),
            "application/octet-stream",
        )
        self.assertEqual(
            w2t._resolve_mime_type(".xyz"),
            "application/octet-stream",
        )

    def test_case_insensitive(self):
        """Extension matching should be case-insensitive."""
        self.assertEqual(w2t._resolve_mime_type(".HTML"), "text/html")
        self.assertEqual(w2t._resolve_mime_type(".Js"), "application/javascript")

    def test_empty_suffix(self):
        """Empty suffix should return octet-stream."""
        self.assertEqual(w2t._resolve_mime_type(""), "application/octet-stream")

    def test_dotless_suffix_does_not_match(self):
        """Suffix without dot should not match known MIMES."""
        self.assertEqual(w2t._resolve_mime_type("html"), "application/octet-stream")


# ═══════════════════════════════════════════════════════════════════════════
# _resolve_file_path — File path resolution with fallback
# ═══════════════════════════════════════════════════════════════════════════

class TestResolveFilePath(unittest.TestCase):
    """Tests for _resolve_file_path() using a temp directory."""

    def setUp(self):
        self.tmpdir = pathlib.Path(tempfile.mkdtemp())
        (self.tmpdir / "index.html").write_text("<html></html>", encoding="utf-8")
        (self.tmpdir / "assets").mkdir()
        (self.tmpdir / "assets" / "app.js").write_text("console.log(1);", encoding="utf-8")

    def tearDown(self):
        import shutil
        shutil.rmtree(self.tmpdir, ignore_errors=True)

    def test_existing_file(self):
        """Existing file should be resolved."""
        result = w2t._resolve_file_path("/assets/app.js", base=self.tmpdir)
        self.assertEqual(result, self.tmpdir / "assets" / "app.js")

    def test_root_falls_to_index(self):
        """Root URI should resolve to index.html."""
        result = w2t._resolve_file_path("/", base=self.tmpdir)
        self.assertEqual(result, self.tmpdir / "index.html")

    def test_nonexistent_file_falls_to_index(self):
        """Nonexistent file should fall back to index.html."""
        result = w2t._resolve_file_path("/nonexistent/file.txt", base=self.tmpdir)
        self.assertEqual(result, self.tmpdir / "index.html")

    def test_directory_falls_to_index(self):
        """Directory URI should fall back to index.html."""
        result = w2t._resolve_file_path("/assets", base=self.tmpdir)
        self.assertEqual(result, self.tmpdir / "index.html")

    def test_uri_leading_slash_stripped(self):
        """Leading slash should be stripped before resolving."""
        result = w2t._resolve_file_path("assets/app.js", base=self.tmpdir)
        self.assertEqual(result, self.tmpdir / "assets" / "app.js")

    def test_nested_path(self):
        """Deeply nested paths should be resolved."""
        nested = self.tmpdir / "a" / "b" / "c"
        nested.mkdir(parents=True)
        (nested / "data.json").write_text("{}")
        result = w2t._resolve_file_path("/a/b/c/data.json", base=self.tmpdir)
        self.assertEqual(result, nested / "data.json")

    # ── Path traversal security tests ───────────────────────────────────

    def test_path_traversal_unix_dotdot(self):
        """Unix ``..`` traversal outside base should fall back to index."""
        result = w2t._resolve_file_path("/../../../etc/passwd", base=self.tmpdir)
        self.assertEqual(result, self.tmpdir / "index.html")

    def test_path_traversal_windows_backslash(self):
        """Windows ``..\\`` traversal with backslashes should be blocked."""
        result = w2t._resolve_file_path(
            "/..\\..\\..\\Windows\\System32\\cmd.exe", base=self.tmpdir
        )
        self.assertEqual(result, self.tmpdir / "index.html")

    def test_path_traversal_deep(self):
        """Deep multi-level traversal should be blocked."""
        result = w2t._resolve_file_path(
            "/../../../../../../../../../../etc/shadow", base=self.tmpdir
        )
        self.assertEqual(result, self.tmpdir / "index.html")

    def test_path_traversal_from_subdirectory(self):
        """Traversal from a subdirectory (../../) should be blocked."""
        result = w2t._resolve_file_path(
            "/assets/../../../etc/passwd", base=self.tmpdir
        )
        self.assertEqual(result, self.tmpdir / "index.html")

    def test_path_traversal_mixed_slashes(self):
        """Mixed forward/backslash traversal should be blocked."""
        result = w2t._resolve_file_path(
            "/assets\\..\\..\\..\\Windows\\win.ini", base=self.tmpdir
        )
        self.assertEqual(result, self.tmpdir / "index.html")

    def test_path_traversal_dot_as_filename(self):
        """URI with ``.`` and ``..`` inside base should still find the file."""
        (self.tmpdir / "subdir").mkdir()
        (self.tmpdir / "subdir" / "target.txt").write_text("data")
        # Navigate: subdir/../subdir/target.txt stays inside base
        result = w2t._resolve_file_path(
            "/subdir/../subdir/target.txt", base=self.tmpdir
        )
        self.assertEqual(
            result.resolve(),
            (self.tmpdir / "subdir" / "target.txt").resolve(),
        )

    def test_path_traversal_double_dot_only(self):
        """URI that is just ``..`` should fall back to index (cannot go up)."""
        result = w2t._resolve_file_path("/..", base=self.tmpdir)
        self.assertEqual(result, self.tmpdir / "index.html")

    def test_path_traversal_encoded_dotdot_unescaped(self):
        """Literal ``%2e%2e%2f`` in URI should NOT be decoded (URL encoding
        is handled elsewhere). The path is treated literally, which does not
        match any file, so falls back to index."""
        result = w2t._resolve_file_path("/%2e%2e%2fetc", base=self.tmpdir)
        self.assertEqual(result, self.tmpdir / "index.html")

    def test_path_traversal_absolute_path_behaviour(self):
        """URI that resolves to an absolute path outside base is blocked.
        On Unix ``/etc/passwd`` as a URI resolves as ``base/etc/passwd``
        (not an absolute path) because ``lstrip"/"`` removes the leading
        slash.  The resulting path stays inside the base directory, which
        doesn't exist, so it falls back to index."""
        result = w2t._resolve_file_path("/etc/passwd", base=self.tmpdir)
        self.assertEqual(result, self.tmpdir / "index.html")

    def test_path_traversal_symlink_outside_base(self):
        """If a symlink inside base points outside, the resolved path is
        outside base and should be blocked."""
        # Create a symlink inside tmpdir that points outside
        outside = self.tmpdir / ".." / "outside_file.txt"
        outside = outside.resolve()
        outside.write_text("outside content")
        (self.tmpdir / "link.txt").symlink_to(outside)

        result = w2t._resolve_file_path("/link.txt", base=self.tmpdir)
        # The resolved path is outside base → blocked → index.html
        self.assertEqual(result, self.tmpdir / "index.html")
        # Clean up
        outside.unlink()

    def test_path_traversal_null_byte_attempt(self):
        """Null byte in URI should not bypass the traversal check."""
        result = w2t._resolve_file_path(
            "/../../../etc/passwd%00", base=self.tmpdir
        )
        self.assertEqual(result, self.tmpdir / "index.html")

    def test_regression_normal_request_still_works(self):
        """Normal requests should still resolve correctly (regression check)."""
        result = w2t._resolve_file_path("/assets/app.js", base=self.tmpdir)
        self.assertEqual(result, self.tmpdir / "assets" / "app.js")


# ═══════════════════════════════════════════════════════════════════════════
# _inject_ws_script — index.html WS reconnect script injection
# ═══════════════════════════════════════════════════════════════════════════

class TestInjectWsScript(unittest.TestCase):
    """Tests for _inject_ws_script()."""

    def test_injects_port_number(self):
        """The WS port should be inserted into the script."""
        body = b"<html><head></head><body></body></html>"
        result = w2t._inject_ws_script(body, 18090)
        self.assertIn(b"18090", result)

    def test_replaces_close_head(self):
        """The script should be inserted before </head>."""
        body = b"<html><head></head><body></body></html>"
        result = w2t._inject_ws_script(body, 8090)
        self.assertIn(b"<script>", result)
        self.assertTrue(result.endswith(b"</head><body></body></html>"))

    def test_no_close_head_returns_unchanged(self):
        """If </head> is not found, body should be returned unchanged."""
        body = b"<html><body>no head here</body></html>"
        result = w2t._inject_ws_script(body, 8090)
        self.assertEqual(result, body)

    def test_different_ports(self):
        """Different ports should produce different output."""
        body = b"<head></head>"
        r1 = w2t._inject_ws_script(body, 8090)
        r2 = w2t._inject_ws_script(body, 18090)
        self.assertNotEqual(r1, r2)
        self.assertIn(b"8090", r1)
        self.assertIn(b"18090", r2)

    def test_script_contains_websocket_reconnect(self):
        """The injected script should reference WebSocket."""
        body = b"<html><head></head></html>"
        result = w2t._inject_ws_script(body, 8090)
        self.assertIn(b"WebSocket", result)
        self.assertIn(b"__WS_PORT", result)


# ═══════════════════════════════════════════════════════════════════════════
# Main entry
# ═══════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    unittest.main()
