#!/usr/bin/env python3
"""Diagnose w2t forwarding failure under COVERAGE_RUN=1."""
import sys, os, json, tempfile, time, socket, threading, base64, hashlib, subprocess, struct
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from tests.test_helpers import coverage_cmd
from http.server import HTTPServer, BaseHTTPRequestHandler

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
W2T_PATH = os.path.join(PROJECT_ROOT, "w2t_server.py")
W2T_PORT = 18090
MOCK_TD_PORT = 44444

# ── Mock TD ──
received = []
class MockTDHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        self._respond(200, {"status": "ok"})
    def do_POST(self):
        cl = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(cl) if cl else b"{}"
        body = json.loads(raw)
        received.append(body)
        self._respond(200, {"output": "(ok)"})
    def _respond(self, status, data):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
    def log_message(self, *a): pass

# Start mock TD
td_server = HTTPServer(("127.0.0.1", MOCK_TD_PORT), MockTDHandler)
td_thread = threading.Thread(target=td_server.serve_forever, daemon=True)
td_thread.start()
time.sleep(0.3)

# Verify mock TD is reachable
import urllib.request
try:
    r = urllib.request.urlopen("http://127.0.0.1:44444/", timeout=3)
    print(f"MOCK TD REACHABLE: {r.status}")
except Exception as e:
    print(f"MOCK TD UNREACHABLE: {e}")
    td_server.shutdown()
    sys.exit(1)

# ── Start w2t_server as subprocess with coverage ──
_W2T_SHIM_TEMPLATE = (
    'import sys, os, pathlib\n'
    'w2t_path = r"{w2t_path}"\n'
    'port = {port}\n'
    '__file__ = w2t_path\n'
    'source = open(w2t_path, "r", encoding="utf-8").read().replace(\n'
    '    "PORT = 8090", f"PORT = {port}"\n'
    ')\n'
    'exec(compile(source, w2t_path, "exec"))\n'
)

shim = _W2T_SHIM_TEMPLATE.replace("{w2t_path}", W2T_PATH).replace("{port}", str(W2T_PORT))
tmp = tempfile.NamedTemporaryFile(mode="w", suffix=".py", prefix="w2t_shim_",
                                   delete=False, dir=PROJECT_ROOT)
tmp.write(shim)
tmp.close()

cmd = coverage_cmd(tmp.name, ["-u"])
print(f"CMD: {cmd}")

env = os.environ.copy()
env["PYTHONIOENCODING"] = "utf-8"
proc = subprocess.Popen(
    cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
    cwd=PROJECT_ROOT, env=env,
)

# Wait for server
deadline = time.monotonic() + 15
server_ready = False
while time.monotonic() < deadline:
    try:
        with socket.create_connection(("127.0.0.1", W2T_PORT), timeout=1):
            server_ready = True
            break
    except (ConnectionRefusedError, OSError):
        time.sleep(0.3)

if not server_ready:
    stdout, stderr = proc.communicate(timeout=2)
    print(f"SERVER DID NOT START. stdout: {stdout[:500]} stderr: {stderr[:500]}")
    os.unlink(tmp.name)
    sys.exit(1)

print("SERVER READY on port", W2T_PORT)

# ── Send WS message ──
WS_MAGIC = b"258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
def ws_key(): return base64.b64encode(os.urandom(16)).decode()
def ws_accept(k): return base64.b64encode(hashlib.sha1(k.encode() + WS_MAGIC).digest()).decode()
def ws_frame(payload, opcode=1, masked=True):
    if isinstance(payload, str): payload = payload.encode()
    length = len(payload)
    frame = bytearray()
    frame.append(0x80 | opcode)
    if length < 126:
        frame.append((0x80 if masked else 0) | length)
    elif length < 65536:
        frame.append((0x80 if masked else 0) | 126)
        frame.extend(struct.pack("!H", length))  # will error here if struct not imported
    if masked:
        mask = bytes(os.urandom(4))
        frame.extend(mask)
        payload = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
    frame.extend(payload)
    return bytes(frame)

import struct

sock = socket.create_connection(("127.0.0.1", W2T_PORT), timeout=5)
key = ws_key()
req = (
    f"GET / HTTP/1.1\r\nHost: localhost:{W2T_PORT}\r\n"
    f"Upgrade: websocket\r\nConnection: Upgrade\r\n"
    f"Sec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n"
)
sock.sendall(req.encode())
time.sleep(0.5)

# Read handshake response
resp = b""
sock.settimeout(3)
try:
    while b"\r\n\r\n" not in resp:
        resp += sock.recv(4096)
except socket.timeout:
    pass
print(f"WS HANDSHAKE RESPONSE ({len(resp)} bytes): {resp[:200]}")

# Check if handshake succeeded
if b"101" in resp:
    print("WS HANDSHAKE: OK")
else:
    print("WS HANDSHAKE: FAILED")
    sock.close()
    proc.terminate()
    proc.wait(3)
    stdout, stderr = proc.communicate(timeout=2)
    print(f"STDOUT: {stdout[:1000]}")
    print(f"STDERR: {stderr[:1000]}")
    os.unlink(tmp.name)
    sys.exit(1)

# Send a WS message
msg = json.dumps({"id": "diag-1", "type": "test", "value": "hello"})
sock.sendall(ws_frame(msg, opcode=1, masked=True))
print("WS MESSAGE SENT")

# Wait and check for forwarded
time.sleep(6)
print(f"RECEIVED {len(received)} forwarded requests")
for r in received:
    print(f"  - {json.dumps(r)[:200]}")

# Capture w2t_server stderr (non-blocking)
proc.terminate()
proc.wait(3)
stdout, stderr = proc.communicate(timeout=2)
print(f"\nW2T STDOUT: {stdout[:2000]}")
print(f"\nW2T STDERR: {stderr[:2000]}")

sock.close()
os.unlink(tmp.name)
td_server.shutdown()
