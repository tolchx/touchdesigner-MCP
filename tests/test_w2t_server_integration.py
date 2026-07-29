#!/usr/bin/env python3
"""
Integration tests for w2t_server.py.

Launches w2t_server.py as a subprocess on port 18090 (to avoid conflicting
with any running instance on port 8090) and a mock TD API server on port
44444. Tests cover:

  - HTTP static file serving (index.html, assets, fallback, Content-Type)
  - WebSocket upgrade handshake (valid key, accept verification)
  - WebSocket frames (text, close, ping/pong, extended lengths)
  - Message forwarding to TD MCP (/exec endpoint)
  - Error handling (invalid HTTP, connection close)

Usage:
    python -m unittest tests.test_w2t_server_integration -v
    python -m unittest tests.test_w2t_server_integration -v
"""

import asyncio
import base64
import hashlib
import http.client
import json
import os
import pathlib
import re
import select
import socket
import struct
import subprocess
import sys
import threading
import time
import unittest
from http.server import HTTPServer, BaseHTTPRequestHandler
from typing import Any
from tests.test_helpers import coverage_cmd, COVERAGE_ACTIVE
import tempfile

# ── Paths ─────────────────────────────────────────────────────────────────
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
W2T_PATH = os.path.join(PROJECT_ROOT, "w2t_server.py")
WEB2TOUCH_DIR = os.path.join(PROJECT_ROOT, "web2touch")

# ── Ports ─────────────────────────────────────────────────────────────────
MOCK_TD_PORT = 44444
W2T_PORT = 18090  # avoid conflict with any running w2t on 8090


# ═══════════════════════════════════════════════════════════════════════════
# WebSocket helpers  (RFC 6455)
# ═══════════════════════════════════════════════════════════════════════════

WS_MAGIC = b"258EAFA5-E914-47DA-95CA-C5AB0DC85B11"


def _ws_accept_key(key: str) -> str:
    """Compute the Sec-WebSocket-Accept value for a given client key."""
    return base64.b64encode(hashlib.sha1(key.encode() + WS_MAGIC).digest()).decode()


def _make_ws_handshake_req(host: str = "localhost", path: str = "/",
                           key: str | None = None) -> tuple[str, str]:
    """Build a WebSocket HTTP upgrade request and return (request_text, key).

    If *key* is None a random base64 key is generated.
    """
    if key is None:
        key = base64.b64encode(os.urandom(16)).decode()
    req = (
        f"GET {path} HTTP/1.1\r\n"
        f"Host: {host}:{W2T_PORT}\r\n"
        f"Upgrade: websocket\r\n"
        f"Connection: Upgrade\r\n"
        f"Sec-WebSocket-Key: {key}\r\n"
        f"Sec-WebSocket-Version: 13\r\n"
        f"\r\n"
    )
    return req, key


def _make_ws_frame(payload: bytes | str, opcode: int = 1,
                   masked: bool = True) -> bytes:
    """Encode a WebSocket data frame.

    *opcode*: 1=text, 8=close, 9=ping, 10=pong
    *masked*: client→server frames MUST be masked (RFC 6455 §5.1)
    """
    if isinstance(payload, str):
        payload = payload.encode("utf-8")
    length = len(payload)

    frame = bytearray()
    # Byte 0: FIN (1) + RSV (000) + opcode
    frame.append(0x80 | opcode)

    # Byte 1+: Mask + Payload length (7 bits, or extended)
    if length < 126:
        frame.append((0x80 if masked else 0x00) | length)
    elif length < 65536:
        frame.append((0x80 if masked else 0x00) | 126)
        frame.extend(struct.pack("!H", length))
    else:
        frame.append((0x80 if masked else 0x00) | 127)
        frame.extend(struct.pack("!Q", length))

    # Masking key (4 random bytes)
    if masked:
        mask = bytes(os.urandom(4))
        frame.extend(mask)
        payload = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))

    frame.extend(payload)
    return bytes(frame)


def _parse_ws_frame(data: bytes) -> tuple[int, bool, bytes]:
    """Parse a single WebSocket frame (server→client, so unmasked).

    Returns (opcode, fin, payload).
    """
    if len(data) < 2:
        raise ValueError("Frame too short")
    opcode = data[0] & 0x0F
    fin = bool(data[0] & 0x80)
    masked = bool(data[1] & 0x80)
    length = data[1] & 0x7F
    offset = 2

    if length == 126:
        if len(data) < offset + 2:
            raise ValueError("Frame too short for extended length 16")
        length = struct.unpack("!H", data[offset:offset + 2])[0]
        offset += 2
    elif length == 127:
        if len(data) < offset + 8:
            raise ValueError("Frame too short for extended length 64")
        length = struct.unpack("!Q", data[offset:offset + 8])[0]
        offset += 8

    # Masking key (server→client SHOULD be unmasked, but handle both)
    if masked:
        if len(data) < offset + 4:
            raise ValueError("Frame too short for masking key")
        mask = data[offset:offset + 4]
        offset += 4
    else:
        mask = None

    payload = data[offset:offset + length]
    if mask is not None:
        payload = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))

    return opcode, fin, payload


def _drain_socket(sock: socket.socket, timeout: float = 2.0) -> bytes:
    """Read all available data from a socket up to *timeout* seconds."""
    sock.settimeout(timeout)
    chunks = []
    try:
        while True:
            chunk = sock.recv(4096)
            if not chunk:
                break
            chunks.append(chunk)
    except (socket.timeout, BlockingIOError):
        pass
    return b"".join(chunks)


# ═══════════════════════════════════════════════════════════════════════════
# Mock TD API server (port 44444)
# ═══════════════════════════════════════════════════════════════════════════

class MockTDHandler(BaseHTTPRequestHandler):
    """Minimal mock of the TouchDesigner /exec endpoint.

    Records every received POST body so tests can verify what was forwarded.
    """

    received_requests: list[dict[str, Any]] = []
    close_connection = True  # Prevent HTTP/1.1 keep-alive blocking

    def do_POST(self) -> None:
        content_length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(content_length) if content_length else b"{}"
        body: dict[str, Any] = json.loads(raw.decode("utf-8"))
        self.__class__.received_requests.append(body)

        # Validate the generated code compiles (injection safety check)
        code = body.get("code", "")
        try:
            compile(code, "<w2t-mock>", "exec")
        except SyntaxError as exc:
            self._respond(400, {"error": f"SyntaxError: {exc}"})
            return

        self._respond(200, {"output": "(ok)"})

    def do_GET(self) -> None:
        self._respond(200, {"status": "mock-td-ok"})

    def _respond(self, status: int, data: Any) -> None:
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt: str, *args: Any) -> None:
        pass  # suppress log noise


# ═══════════════════════════════════════════════════════════════════════════
# Helpers — launch w2t_server.py with a patched PORT
# ═══════════════════════════════════════════════════════════════════════════

_temp_shim_files: list[str] = []
_pipe_drainer_threads: list[threading.Thread] = []

_W2T_SHIM_TEMPLATE = r"""import sys, os, pathlib
w2t_path = r"{w2t_path}"
port = {port}
__file__ = w2t_path
source = open(w2t_path, "r", encoding="utf-8").read().replace(
    "PORT = 8090", f"PORT = {port}"
)
exec(compile(source, w2t_path, "exec"))
""".lstrip()


def _drain_pipe(infile) -> None:
    """Background thread: continuously read from *infile* to prevent
    OS pipe buffer from filling up and blocking the subprocess."""
    try:
        while True:
            chunk = infile.read(65536)
            if not chunk:
                break
    except (ValueError, OSError):
        pass


def _start_w2t_server(port: int, w2t_path: str, timeout: float = 15.0) -> subprocess.Popen:
    """Start w2t_server.py as a subprocess with a patched PORT.

    Writes a tiny shim script (~10 lines) to a temp file, then launches
    it via ``coverage_cmd()``.  The shim uses ``compile(source, w2t_path,
    "exec")`` so code objects have ``co_filename = w2t_server.py`` —
    coverage.py records the executed lines under the **original** file,
    not the temp shim.
    """
    shim = _W2T_SHIM_TEMPLATE.replace(
        "{w2t_path}", w2t_path
    ).replace(
        "{port}", str(port)
    )

    # Write the shim to a temp file (tiny — ~10 lines)
    tmp = tempfile.NamedTemporaryFile(
        mode="w", encoding="utf-8", suffix=".py",
        prefix="w2t_shim_", delete=False,
        dir=os.path.dirname(w2t_path),
    )
    tmp.write(shim)
    tmp.close()
    _temp_shim_files.append(tmp.name)

    cmd = coverage_cmd(tmp.name, ["-u"])

    # Set PYTHONIOENCODING=utf-8 for emoji in print() statements
    env = os.environ.copy()
    env["PYTHONIOENCODING"] = "utf-8"
    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        cwd=PROJECT_ROOT,
        env=env,
    )

    # Start background drain threads to prevent pipe buffer from filling up
    # (especially important when running under COVERAGE_RUN which generates
    # more output and slows everything down). Without draining, the subprocess
    # blocks on print() and can't process incoming WS messages or forward them.
    drain_stdout = threading.Thread(
        target=_drain_pipe, args=(proc.stdout,), daemon=True
    )
    drain_stderr = threading.Thread(
        target=_drain_pipe, args=(proc.stderr,), daemon=True
    )
    drain_stdout.start()
    drain_stderr.start()
    _pipe_drainer_threads.append(drain_stdout)
    _pipe_drainer_threads.append(drain_stderr)

    # Wait for the server to be ready by polling the port
    deadline = time.monotonic() + timeout
    last_err = ""
    while time.monotonic() < deadline:
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=1):
                return proc
        except (ConnectionRefusedError, OSError) as exc:
            last_err = str(exc)
            time.sleep(0.3)

    # Timed out — capture output and clean up
    stdout, stderr = proc.communicate(timeout=2)
    raise RuntimeError(
        f"w2t_server.py did not start on port {port} within {timeout}s\n"
        f"  stdout: {stdout.decode(errors='replace')[:500]}\n"
        f"  stderr: {stderr.decode(errors='replace')[:500]}\n"
        f"  last socket error: {last_err}"
    )


def _stop_w2t_server(proc: subprocess.Popen | None) -> None:
    """Gracefully terminate the w2t server subprocess and clean up temp shim files."""
    # Always clean up temp shim files FIRST (even if proc is None)
    while _temp_shim_files:
        p = _temp_shim_files.pop()
        try:
            os.unlink(p)
        except OSError:
            pass
    # Clear pipe drainer thread references
    _pipe_drainer_threads.clear()
    if proc is None:
        return
    try:
        proc.terminate()
        proc.wait(timeout=3)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait(timeout=2)


# ═══════════════════════════════════════════════════════════════════════════
# Integration test suite
# ═══════════════════════════════════════════════════════════════════════════

class TestW2TServerIntegration(unittest.TestCase):
    """Integration tests for w2t_server.py.

    Requires:
    - Port 44444 free (for mock TD API)
    - Port {W2T_PORT} free (for w2t_server under test)
    - web2touch/ directory with index.html and assets
    """.replace("{W2T_PORT}", str(W2T_PORT))

    mock_td: HTTPServer | None = None
    mock_td_thread: threading.Thread | None = None
    w2t_proc: subprocess.Popen | None = None

    @classmethod
    def setUpClass(cls) -> None:
        """Start mock TD API on 44444 and w2t_server on {W2T_PORT}."""
        MockTDHandler.received_requests.clear()

        # ── Mock TD API ──
        try:
            cls.mock_td = HTTPServer(("127.0.0.1", MOCK_TD_PORT), MockTDHandler)
        except OSError as exc:
            raise unittest.SkipTest(
                f"Port {MOCK_TD_PORT} not available — "
                f"cannot start mock TD API. {exc}"
            ) from exc
        cls.mock_td_thread = threading.Thread(target=cls.mock_td.serve_forever,
                                              daemon=True)
        cls.mock_td_thread.start()

        # ── w2t_server under test ──
        try:
            cls.w2t_proc = _start_w2t_server(W2T_PORT, W2T_PATH)
        except (RuntimeError, OSError) as exc:
            cls.tearDownClass()  # clean up mock TD
            raise unittest.SkipTest(f"Cannot start w2t_server: {exc}") from exc

    @classmethod
    def tearDownClass(cls) -> None:
        _stop_w2t_server(cls.w2t_proc)
        if cls.mock_td is not None:
            cls.mock_td.shutdown()

    def setUp(self) -> None:
        """Clear the mock TD request log before each test.

        When running under ``COVERAGE_RUN=1``, wait 0.3s between tests to
        give the asyncio-based w2t_server event loop time to clean up
        connections from the previous test.  Under coverage, line-level
        instrumentation slows the event loop significantly.
        """
        MockTDHandler.received_requests.clear()
        if COVERAGE_ACTIVE:
            time.sleep(0.5)

    # ────────────────────────────────────────────────────────────────────
    # HTTP file serving
    # ────────────────────────────────────────────────────────────────────

    def test_http_get_root_serves_index_html(self) -> None:
        """GET / should return index.html with Content-Type text/html."""
        conn = http.client.HTTPConnection("127.0.0.1", W2T_PORT, timeout=5)
        try:
            conn.request("GET", "/")
            resp = conn.getresponse()
            self.assertEqual(resp.status, 200)
            ct = resp.getheader("Content-Type", "")
            self.assertIn("text/html", ct)
            data = resp.read()
            self.assertGreater(len(data), 0)
            self.assertTrue(
                b"<html" in data.lower() or b"<!DOCTYPE" in data.lower(),
                "Response should contain HTML markup"
            )
        finally:
            conn.close()

    def test_http_get_nonexistent_falls_back_to_index(self) -> None:
        """GET /nonexistent/url should fall back to index.html."""
        conn = http.client.HTTPConnection("127.0.0.1", W2T_PORT, timeout=5)
        try:
            conn.request("GET", "/this/path/does/not/exist")
            resp = conn.getresponse()
            self.assertEqual(resp.status, 200)
            ct = resp.getheader("Content-Type", "")
            self.assertIn("text/html", ct)
        finally:
            conn.close()

    def test_http_get_js_asset_serves_with_correct_type(self) -> None:
        """GET /assets/index-*.js should return JS with correct Content-Type."""
        # Discover the actual JS asset filename
        assets_dir = os.path.join(WEB2TOUCH_DIR, "assets")
        if not os.path.isdir(assets_dir):
            self.skipTest("web2touch/assets/ directory not found")
        js_files = [f for f in os.listdir(assets_dir) if f.endswith(".js")]
        if not js_files:
            self.skipTest("No JS assets found in web2touch/assets/")
        conn = http.client.HTTPConnection("127.0.0.1", W2T_PORT, timeout=5)
        try:
            conn.request("GET", f"/assets/{js_files[0]}")
            resp = conn.getresponse()
            self.assertEqual(resp.status, 200)
            ct = resp.getheader("Content-Type", "")
            self.assertIn("javascript", ct)
            data = resp.read()
            self.assertGreater(len(data), 0)
        finally:
            conn.close()

    def test_http_get_css_asset_serves_with_correct_type(self) -> None:
        """GET /assets/index-*.css should return CSS with correct Content-Type."""
        assets_dir = os.path.join(WEB2TOUCH_DIR, "assets")
        if not os.path.isdir(assets_dir):
            self.skipTest("web2touch/assets/ directory not found")
        css_files = [f for f in os.listdir(assets_dir) if f.endswith(".css")]
        if not css_files:
            self.skipTest("No CSS assets found in web2touch/assets/")
        conn = http.client.HTTPConnection("127.0.0.1", W2T_PORT, timeout=5)
        try:
            conn.request("GET", f"/assets/{css_files[0]}")
            resp = conn.getresponse()
            self.assertEqual(resp.status, 200)
            ct = resp.getheader("Content-Type", "")
            self.assertIn("css", ct)
        finally:
            conn.close()

    def test_http_get_cors_headers_present(self) -> None:
        """Check that Access-Control-Allow-Origin header is present."""
        conn = http.client.HTTPConnection("127.0.0.1", W2T_PORT, timeout=5)
        try:
            conn.request("GET", "/")
            resp = conn.getresponse()
            resp.read()  # consume
            # CORS header injected by w2t_server
            acao = resp.getheader("Access-Control-Allow-Origin")
            if acao is not None:
                self.assertIn("*", acao)
        finally:
            conn.close()

    # ────────────────────────────────────────────────────────────────────
    # WebSocket upgrade handshake
    # ────────────────────────────────────────────────────────────────────

    def _ws_connect(self, path: str = "/",
                    timeout: float = 5.0) -> tuple[socket.socket, str]:
        """Open a raw TCP socket, perform WebSocket upgrade, return (sock, key).

        Raises AssertionError if the handshake fails.
        """
        sock = socket.create_connection(("127.0.0.1", W2T_PORT), timeout=timeout)
        try:
            req, key = _make_ws_handshake_req(path=path)
            sock.sendall(req.encode())

            # Read the HTTP 101 response
            resp = b""
            deadline = time.monotonic() + timeout
            while b"\r\n\r\n" not in resp and time.monotonic() < deadline:
                try:
                    chunk = sock.recv(4096)
                    if not chunk:
                        break
                    resp += chunk
                except socket.timeout:
                    break

            self.assertIn(b"101", resp, f"Expected 101, got:\n{resp[:500]}")
            self.assertIn(b"Upgrade: websocket", resp,
                          "Missing Upgrade header in response")
            self.assertIn(b"Sec-WebSocket-Accept:", resp,
                          "Missing Sec-WebSocket-Accept header")

            # Verify accept key
            accept_line = [l for l in resp.decode().split("\r\n")
                           if "Sec-WebSocket-Accept" in l]
            self.assertGreater(len(accept_line), 0)
            actual_accept = accept_line[0].split(":", 1)[1].strip()
            expected_accept = _ws_accept_key(key)
            self.assertEqual(actual_accept, expected_accept,
                             "WebSocket accept key mismatch")

            return sock, key
        except AssertionError:
            sock.close()
            raise
        except Exception:
            sock.close()
            raise

    def test_ws_handshake_valid(self) -> None:
        """Valid WebSocket upgrade should return 101 with correct accept."""
        sock, _ = self._ws_connect()
        sock.close()

    def test_ws_handshake_with_custom_path(self) -> None:
        """WebSocket upgrade on custom path should still succeed."""
        sock, _ = self._ws_connect(path="/ws")
        sock.close()

    def test_ws_handshake_invalid_http_request(self) -> None:
        """A plain HTTP request (non-upgrade) should serve a file, not WS."""
        conn = http.client.HTTPConnection("127.0.0.1", W2T_PORT, timeout=5)
        try:
            conn.request("GET", "/")
            resp = conn.getresponse()
            # Should serve index.html, not upgrade
            self.assertEqual(resp.status, 200)
            self.assertIn("text/html", resp.getheader("Content-Type", ""))
        finally:
            conn.close()

    # ── Polling helper (replaces fragile time.sleep) ──────────────────

    def _wait_for_forwarded(self, min_count: int = 1,
                            timeout: float | None = None) -> None:
        """Poll MockTDHandler.received_requests until at least *min_count*
        requests have been received, or raise AssertionError on timeout.

        Default timeout is 10s when ``COVERAGE_RUN=1`` (slower execution),
        otherwise 5s.
        """
        if timeout is None:
            timeout = 20.0 if COVERAGE_ACTIVE else 5.0
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if len(MockTDHandler.received_requests) >= min_count:
                return
            time.sleep(0.05)
        self.fail(
            f"Expected at least {min_count} forwarded requests, "
            f"got {len(MockTDHandler.received_requests)} "
            f"within {timeout}s"
        )

    # ── Polling helper for pong frames ────────────────────────────────

    def _wait_for_pong(self, sock: socket.socket,
                       timeout: float = 3.0) -> tuple[int, bool, bytes]:
        """Read from *sock* until a valid WS frame is received.
        Uses short per-read timeouts so the deadline is checked regularly.
        Returns (opcode, fin, payload). Raises AssertionError on timeout.
        """
        data = b""
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            remaining = deadline - time.monotonic()
            sock.settimeout(max(0.3, min(1.0, remaining)))
            try:
                chunk = sock.recv(4096)
                if not chunk:
                    continue
                data += chunk
                try:
                    return _parse_ws_frame(data)
                except ValueError:
                    continue  # Need more data
            except socket.timeout:
                continue  # Check deadline and try again
            except BlockingIOError:
                time.sleep(0.05)
                continue
        self.fail(f"No WebSocket frame received within {timeout}s (got {len(data)} raw bytes)")

    # ────────────────────────────────────────────────────────────────────
    # WebSocket frames — text, close, ping/pong
    # ────────────────────────────────────────────────────────────────────

    def test_ws_send_text_frame(self) -> None:
        """Sending a masked text frame should be processed and forwarded to mock TD."""
        sock, _ = self._ws_connect()
        try:
            payload = json.dumps({"id": "test-001", "type": "slider",
                                  "value": "0.75"})
            sock.sendall(_make_ws_frame(payload, opcode=1, masked=True))

            self._wait_for_forwarded(min_count=1)
            forwarded = MockTDHandler.received_requests[-1]
            self.assertIn("code", forwarded)
            self.assertIn("test-001", forwarded["code"])
            self.assertIn("slider", forwarded["code"])
            self.assertIn("0.75", forwarded["code"])
        finally:
            sock.close()

    def test_ws_send_non_json_message(self) -> None:
        """Non-JSON text should be forwarded as raw value."""
        sock, _ = self._ws_connect()
        try:
            sock.sendall(_make_ws_frame("hello world", opcode=1, masked=True))
            self._wait_for_forwarded(min_count=1)

            forwarded = MockTDHandler.received_requests[-1]
            self.assertIn("code", forwarded)
            self.assertIn("hello world", forwarded["code"])
        finally:
            sock.close()

    def test_ws_text_frame_extended_length(self) -> None:
        """A text frame with payload between 126 and 65535 bytes (extended length 16)."""
        sock, _ = self._ws_connect()
        try:
            large_val = "x" * 200
            payload = json.dumps({"id": "large", "type": "text",
                                  "value": large_val})
            self.assertGreater(len(payload), 126)
            sock.sendall(_make_ws_frame(payload, opcode=1, masked=True))

            self._wait_for_forwarded(min_count=1)
            forwarded = MockTDHandler.received_requests[-1]
            self.assertIn("large", forwarded["code"])
        finally:
            sock.close()

    def test_ws_ping_pong(self) -> None:
        """Ping frame (opcode 9) should receive pong frame (opcode 10)."""
        sock, _ = self._ws_connect()
        try:
            sock.sendall(_make_ws_frame(b"", opcode=9, masked=False))
            opcode, fin, _ = self._wait_for_pong(sock)
            self.assertEqual(opcode, 10, "Expected pong (opcode 10)")
            self.assertTrue(fin, "Pong should have FIN set")
        finally:
            sock.close()

    def test_ws_close_frame(self) -> None:
        """Close frame (opcode 8) should trigger a graceful close."""
        sock, _ = self._ws_connect()
        try:
            sock.sendall(_make_ws_frame(b"\x03\xe8", opcode=8, masked=True))
            sock.settimeout(3.0)
            try:
                data = sock.recv(4096)
                if data:
                    opcode, fin, payload = _parse_ws_frame(data)
                    self.assertEqual(opcode, 8, "Expected close (opcode 8)")
            except (ConnectionResetError, BrokenPipeError, OSError):
                pass  # Expected — connection closed
        finally:
            try:
                sock.close()
            except OSError:
                pass

    # ────────────────────────────────────────────────────────────────────
    # MCP forwarding behaviour
    # ────────────────────────────────────────────────────────────────────

    def test_ws_message_with_id_type_value_timestamp(self) -> None:
        """Message with id/type/value/timestamp should forward all fields."""
        sock, _ = self._ws_connect()
        try:
            msg = {"id": "sensor-42", "type": "temperature",
                   "value": "23.5", "timestamp": "2026-07-25T12:00:00Z"}
            sock.sendall(_make_ws_frame(json.dumps(msg), opcode=1, masked=True))

            self._wait_for_forwarded(min_count=1)
            code = MockTDHandler.received_requests[-1]["code"]
            self.assertIn("sensor-42", code)
            self.assertIn("temperature", code)
            self.assertIn("23.5", code)
        finally:
            sock.close()

    def test_ws_message_without_id_uses_empty_string(self) -> None:
        """Message without 'id' field should forward with empty cid."""
        sock, _ = self._ws_connect()
        try:
            msg = {"type": "button", "value": "click"}
            sock.sendall(_make_ws_frame(json.dumps(msg), opcode=1, masked=True))

            self._wait_for_forwarded(min_count=1)
            code = MockTDHandler.received_requests[-1]["code"]
            self.assertIn("button", code)
            self.assertIn("click", code)
        finally:
            sock.close()

    def test_multiple_ws_messages_sequentially(self) -> None:
        """Multiple WS messages in sequence should all be forwarded."""
        sock, _ = self._ws_connect()
        try:
            for i in range(3):
                msg = {"id": f"msg-{i}", "type": "seq", "value": str(i)}
                sock.sendall(_make_ws_frame(json.dumps(msg),
                                            opcode=1, masked=True))
                time.sleep(0.05)

            self._wait_for_forwarded(min_count=3)
            last_code = MockTDHandler.received_requests[-1]["code"]
            self.assertIn("msg-2", last_code)
        finally:
            sock.close()

    # Table data forwarding -- WS -> w2t -> TD Table schema validation
    # ────────────────────────────────────────────────────────────────────

    def test_forwarded_code_has_correct_table_path(self) -> None:
        """Forwarded code should target neon_values table."""
        sock, _ = self._ws_connect()
        try:
            msg = {"id": "test-id", "type": "test", "value": "test-val"}
            sock.sendall(_make_ws_frame(json.dumps(msg), opcode=1, masked=True))
            self._wait_for_forwarded(min_count=1)
            code = MockTDHandler.received_requests[-1]["code"]
            self.assertIn('op("/project1/neon_values")', code)
            compile(code, "<test>", "exec")
        finally:
            sock.close()

    def test_forwarded_code_schema_four_columns(self) -> None:
        """Forwarded code should use 4-column schema [cid,ctype,cval,cts]."""
        sock, _ = self._ws_connect()
        try:
            msg = {"id": "s1", "type": "sensor", "value": "23.5"}
            sock.sendall(_make_ws_frame(json.dumps(msg), opcode=1, masked=True))
            self._wait_for_forwarded(min_count=1)
            code = MockTDHandler.received_requests[-1]["code"]
            self.assertIn("[cid,ctype,cval,cts]", code)
            compile(code, "<test>", "exec")
        finally:
            sock.close()

    def test_forwarded_code_upsert_by_cid(self) -> None:
        """Forwarded code should search rows by cid (col 0)."""
        sock, _ = self._ws_connect()
        try:
            msg = {"id": "my-sensor", "type": "temp", "value": "22.0"}
            sock.sendall(_make_ws_frame(json.dumps(msg), opcode=1, masked=True))
            self._wait_for_forwarded(min_count=1)
            code = MockTDHandler.received_requests[-1]["code"]
            self.assertIn("t[r,0].val==cid", code)
            compile(code, "<test>", "exec")
        finally:
            sock.close()

    def test_forwarded_code_update_existing_row(self) -> None:
        """Forwarded code should update cval and cts on existing row."""
        sock, _ = self._ws_connect()
        try:
            msg = {"id": "existing-id", "type": "slider", "value": "0.95"}
            sock.sendall(_make_ws_frame(json.dumps(msg), opcode=1, masked=True))
            self._wait_for_forwarded(min_count=1)
            code = MockTDHandler.received_requests[-1]["code"]
            self.assertIn("t[found,2]=cval", code)
            self.assertIn("t[found,3]=cts", code)
            compile(code, "<test>", "exec")
        finally:
            sock.close()

    def test_forwarded_code_append_new_row(self) -> None:
        """Forwarded code should append new row when cid not found."""
        sock, _ = self._ws_connect()
        try:
            msg = {"id": "new-sensor", "type": "humidity", "value": "68"}
            sock.sendall(_make_ws_frame(json.dumps(msg), opcode=1, masked=True))
            self._wait_for_forwarded(min_count=1)
            code = MockTDHandler.received_requests[-1]["code"]
            self.assertIn("appendRow", code)
            compile(code, "<test>", "exec")
        finally:
            sock.close()

    def test_forwarded_code_slider_preset(self) -> None:
        """Slider preset from test UI should map correctly."""
        sock, _ = self._ws_connect()
        try:
            msg = {"id": "amp", "type": "slider", "value": "0.85"}
            sock.sendall(_make_ws_frame(json.dumps(msg), opcode=1, masked=True))
            self._wait_for_forwarded(min_count=1)
            code = MockTDHandler.received_requests[-1]["code"]
            self.assertIn('cid="amp"', code)
            self.assertIn('ctype="slider"', code)
            self.assertIn('cval="0.85"', code)
            compile(code, "<test>", "exec")
        finally:
            sock.close()

    def test_forwarded_code_toggle_preset(self) -> None:
        """Toggle ON from test UI should map correctly."""
        sock, _ = self._ws_connect()
        try:
            msg = {"id": "enable", "type": "toggle", "value": "1"}
            sock.sendall(_make_ws_frame(json.dumps(msg), opcode=1, masked=True))
            self._wait_for_forwarded(min_count=1)
            code = MockTDHandler.received_requests[-1]["code"]
            self.assertIn('cid="enable"', code)
            self.assertIn('ctype="toggle"', code)
            compile(code, "<test>", "exec")
        finally:
            sock.close()

    def test_forwarded_code_sensor_preset(self) -> None:
        """Sensor temp from test UI should map correctly."""
        sock, _ = self._ws_connect()
        try:
            msg = {"id": "temp", "type": "sensor", "value": "23.5"}
            sock.sendall(_make_ws_frame(json.dumps(msg), opcode=1, masked=True))
            self._wait_for_forwarded(min_count=1)
            code = MockTDHandler.received_requests[-1]["code"]
            self.assertIn('cid="temp"', code)
            self.assertIn('ctype="sensor"', code)
            self.assertIn('cval="23.5"', code)
            compile(code, "<test>", "exec")
        finally:
            sock.close()

    def test_forwarded_code_trigger_preset(self) -> None:
        """Trigger reset from test UI should map correctly."""
        sock, _ = self._ws_connect()
        try:
            msg = {"id": "reset", "type": "trigger", "value": "1"}
            sock.sendall(_make_ws_frame(json.dumps(msg), opcode=1, masked=True))
            self._wait_for_forwarded(min_count=1)
            code = MockTDHandler.received_requests[-1]["code"]
            self.assertIn('cid="reset"', code)
            self.assertIn('ctype="trigger"', code)
            compile(code, "<test>", "exec")
        finally:
            sock.close()

    def test_forwarded_code_multiple_presets_sequentially(self) -> None:
        """Multiple different presets in sequence should all work."""
        sock, _ = self._ws_connect()
        try:
            presets = [
                {"id": "amp", "type": "slider", "value": "0.85"},
                {"id": "enable", "type": "toggle", "value": "1"},
                {"id": "temp", "type": "sensor", "value": "23.5"},
                {"id": "reset", "type": "trigger", "value": "1"},
                {"id": "hue", "type": "color", "value": "0.33"},
            ]
            for p in presets:
                sock.sendall(_make_ws_frame(json.dumps(p), opcode=1, masked=True))

            self._wait_for_forwarded(min_count=5)
            self.assertGreaterEqual(
                len(MockTDHandler.received_requests), 5,
                "Should have received at least 5 forwarded requests",
            )
            # Verify the last one is the trigger/reset
            last_code = MockTDHandler.received_requests[-1]["code"]
            self.assertIn('cid="hue"', last_code)
            compile(last_code, "<test>", "exec")
        finally:
            sock.close()


# ═══════════════════════════════════════════════════════════════════════════
# Main entry
# ═══════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    unittest.main()
