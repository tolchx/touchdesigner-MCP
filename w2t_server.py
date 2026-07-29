#!/usr/bin/env python
"""Web2Touch bridge — HTTP + WS on same port 8090, relay to TD MCP"""
import asyncio
import base64
import hashlib
import json
import pathlib
import struct
import sys
import urllib.request

PORT = 8090
BASE = pathlib.Path(__file__).parent / "web2touch"
MCP = "http://127.0.0.1:44444"
MIMES: dict[str, str] = {
    ".html": "text/html",
    ".js": "application/javascript",
    ".css": "text/css",
    ".png": "image/png",
    ".svg": "image/svg+xml",
}
MAGIC = b"258EAFA5-E914-47DA-95CA-C5AB0DC85B11"

# Path to endpoint_fix.py (standalone implementations for missing TD endpoints)
_FIX_PATH = (
    r"C:\Users\Tolch\Documents\AI_Code\Touchdesigner_MCP\Main\toe\endpoint_fix.py"
)
_FIX_LOAD = (
    f'exec(compile(open(r"{_FIX_PATH}",encoding="utf-8").read(),"fix","exec"))'
)
# Map missing TD API paths → endpoint_call name
_FIX_ENDPOINTS: dict[str, str] = {
    "/auto_layout": "auto_layout",
    "/glsl_reload": "glsl_reload",
    "/glsl_update": "glsl_update",
    "/smart_connect": "smart_connect",
    "/pop_inspect": "pop_inspect",
    "/get_node_detail": "get_node_detail",
}


# ═══════════════════════════════════════════════════════════════════════════
# Pure functions — testable without async or network
# ═══════════════════════════════════════════════════════════════════════════


def _compute_ws_accept(key: str) -> str:
    """Compute Sec-WebSocket-Accept value per RFC 6455 §4.2.2."""
    return base64.b64encode(hashlib.sha1(key.encode() + MAGIC).digest()).decode()


def _parse_ws_header(data: bytes) -> tuple[int, bool, bool, int]:
    """Parse the initial 2 bytes of a WebSocket frame header.

    Parameters
    ----------
    data:
        At least 2 bytes of the frame header.

    Returns
    -------
    ``(opcode, fin, masked, payload_len_7bit)`` where *payload_len_7bit*
    is the raw 7-bit length value.  If it is 126 or 127, the actual
    length is encoded in additional bytes which must be read separately
    (see ``_read_payload_length``).

    Raises
    ------
    ValueError
        If *data* is shorter than 2 bytes.
    """
    if len(data) < 2:
        raise ValueError(
            f"Frame header too short: got {len(data)} bytes, need at least 2"
        )
    opcode = data[0] & 0x0F
    fin = bool(data[0] & 0x80)
    masked = bool(data[1] & 0x80)
    payload_len_7bit = data[1] & 0x7F
    return opcode, fin, masked, payload_len_7bit


def _read_payload_length(length_code: int, data: bytes) -> int:
    """Resolve the actual payload length from the 7-bit code and optional
    extended length bytes.

    Parameters
    ----------
    length_code:
        The raw 7-bit length value from ``_parse_ws_header``.
    data:
        The extended length bytes (2 bytes for code 126, 8 for code 127).
        For codes 0-125 this is ignored and can be empty.

    Returns
    -------
    The actual payload length.
    """
    if length_code == 126:
        if len(data) < 2:
            raise ValueError(
                f"Extended length 16 needs 2 bytes, got {len(data)}"
            )
        return struct.unpack("!H", data[:2])[0]
    if length_code == 127:
        if len(data) < 8:
            raise ValueError(
                f"Extended length 64 needs 8 bytes, got {len(data)}"
            )
        return struct.unpack("!Q", data[:8])[0]
    return length_code


def _apply_mask(payload: bytes, mask: bytes) -> bytes:
    """Apply or unapply a WebSocket XOR mask (RFC 6455 §5.3).

    Parameters
    ----------
    payload:
        Bytes to (un)mask.
    mask:
        Exactly 4 bytes.

    Returns
    -------
    Unmasked bytes of the same length as *payload*.
    """
    if len(mask) != 4:
        raise ValueError(f"Mask must be exactly 4 bytes, got {len(mask)}")
    return bytes(b ^ mask[i % 4] for i, b in enumerate(payload))


def _parse_http_request(text: str) -> tuple[str, str, dict[str, str]]:
    """Parse an HTTP/1.x request line and headers.

    Parameters
    ----------
    text:
        Raw HTTP request text (ends at ``\\r\\n\\r\\n``).

    Returns
    -------
    ``(method, uri, headers_dict)`` where *headers_dict* keys are
    lowercased.

    If the request line is malformed, *method* is ``""`` and *uri*
    is ``"/"``.
    """
    lines = text.split("\r\n")
    parts = lines[0].split() if lines else []
    method = parts[0] if len(parts) > 0 else ""
    uri = parts[1] if len(parts) > 1 else "/"
    headers: dict[str, str] = {}
    for line in lines[1:]:
        if ":" in line:
            k, v = line.split(":", 1)
            headers[k.strip().lower()] = v.strip()
    return method, uri, headers


def _py_esc_double(s: str) -> str:
    """Escape a string for embedding inside double-quoted Python strings.

    Escapes backslash (``\\``) and double-quote (``"``) so the value cannot
    break out of a ``"..."`` literal in generated code.  Also escapes
    newline (``\n``), carriage-return (``\r``), and tab (``\t``) so that
    multi-line values do not produce unterminated string literals.
    """
    s = s.replace("\\", "\\\\")
    s = s.replace('"', '\\"')
    s = s.replace("\n", "\\n")
    s = s.replace("\r", "\\r")
    s = s.replace("\t", "\\t")
    return s


def _build_forward_code(data: dict, raw_msg: str) -> str:
    """Build TD Python code that forwards a WS message to a TD table.

    Supports two modes:

    1. **Simple mode** (single value)::
           {"id": "amp", "type": "slider", "value": "0.85"}

    2. **CHOP-like mode** (multi-channel)::
           {"id": "canvas1", "type": "canvas",
            "channels": {"u": 0.5, "v": 0.75, "select": 1}}

    In ``channels`` mode, each key/value pair is stored as a separate
    row in the TD table, using ``id + "." + key`` as the unique row ID.
    This mirrors the original Web2Touch CHOP output (u, v, select,
    rselect, refresh).

    All user-controlled values are escaped with ``_py_esc_double``
    before embedding in the generated code to prevent Python injection.

    Parameters
    ----------
    data:
        Parsed JSON dict from the WebSocket message.
    raw_msg:
        Raw message text, used as fallback *value* when neither
        ``"value"`` nor ``"channels"`` are present.

    Returns
    -------
    Python code string suitable for POST /exec.
    """
    cid = _py_esc_double(str(data.get("id", "")))
    ctype = _py_esc_double(str(data.get("type", "")))
    channels = data.get("channels")

    if isinstance(channels, dict) and len(channels) > 0:
        # CHOP-like mode: each channel becomes a separate row
        # id = "canvas1.u", type = "canvas", value = channel value
        lines = []
        for key, val in channels.items():
            ch_id = _py_esc_double(f"{data.get('id', '')}.{key}")
            ch_val = _py_esc_double(str(val))
            lines.append(
                f'import json; t=op("/project1/neon_values"); '
                f'cid="{ch_id}"; ctype="{ctype}"; cval="{ch_val}"; '
                f'cts=""; found=-1\n'
                f'for r in range(1,t.numRows):\n'
                f' if t[r,0].val==cid: found=r; break\n'
                f'if found<0: t.appendRow([cid,ctype,cval,cts])\n'
                f'else: t[found,2]=cval; t[found,3]=cts'
            )
        return "\n".join(lines)

    # Simple mode: single value
    cval = _py_esc_double(str(data.get("value", raw_msg)))
    return (
        'import json; t=op("/project1/neon_values"); '
        f'cid="{cid}"; ctype="{ctype}"; cval="{cval}"; cts=""; found=-1\n'
        "for r in range(1,t.numRows):\n"
        " if t[r,0].val==cid: found=r; break\n"
        "if found<0: t.appendRow([cid,ctype,cval,cts])\n"
        "else: t[found,2]=cval; t[found,3]=cts"
    )


def _build_chop_code(data: dict) -> str:
    """Build TD Python code that updates ``neon_channels`` mergeCHOP.

    Uses the ``constantCHOP`` + ``mergeCHOP`` pattern:
    * Each dashboard channel gets its own ``constantCHOP`` named
      ``_ch_{id}`` (only created once).
    * The single channel inside is renamed to the dashboard ID so it
      appears as a named channel in the mergeCHOP output.
    * All ``constantCHOP`` s are wired into ``neon_channels`` (a
      ``mergeCHOP``) which aggregates them into one multi-channel CHOP.
    * ``neon_out`` (a ``nullCHOP``) provides a clean endpoint.

    Supports **simple mode** (single value) and **channels mode**
    (multi-channel, e.g. ``canvas.u/v``).

    ``_py_esc_double`` is applied to channel ID text embedded in
    generated string literals; numeric values are inlined directly.
    """
    cid_raw = str(data.get("id", "")).strip()
    if not cid_raw:
        # No ID → nothing to update on the CHOP
        return ""

    channels = data.get("channels")
    lines: list[str] = []

    def _gen_chan(ch_id: str, ch_val: float) -> list[str]:
        """Generate TD Python lines for one constantCHOP channel."""
        safe_op = ch_id.replace(".", "_").replace(" ", "_").replace("-", "_")
        op_name = f"_ch_{safe_op}"
        y_offset = 100 + (abs(hash(ch_id)) % 700)
        return [
            f'c=op("/project1/{op_name}")',
            f'if not c:',
            f'    c=op("/project1").create(td.constantCHOP,"{op_name}")',
            f'    c.nodeX=-800; c.nodeY={y_offset}',
            f'    m=op("/project1/neon_channels")',
            f'    if m: c.outputConnectors[0].connect(m)',
            f'c.par.value0={ch_val}',
            f'c.cook(force=True)',
        ]

    if isinstance(channels, dict) and len(channels) > 0:
        # Multi-channel mode
        for key, val in channels.items():
            ch_id = f"{cid_raw}.{key}" if cid_raw else key
            try:
                lines.extend(_gen_chan(ch_id, float(val)))
            except (ValueError, TypeError):
                pass
    else:
        # Simple mode: single value
        try:
            cval = float(data.get("value", data.get("val", 0)))
        except (ValueError, TypeError):
            cval = 0.0
        lines = _gen_chan(cid_raw, cval)

    return "\n".join(lines)


def _resolve_mime_type(suffix: str) -> str:
    """Resolve a file extension to an HTTP Content-Type value.

    Parameters
    ----------
    suffix:
        File extension including the leading dot, e.g. ``".html"``.

    Returns
    -------
    MIME type string, or ``"application/octet-stream"`` for unknown
    extensions.
    """
    return MIMES.get(suffix.lower(), "application/octet-stream")


def _resolve_file_path(uri: str, base: pathlib.Path | None = None) -> pathlib.Path:
    """Resolve *uri* to a file path under *base*.

    If the resolved path does not exist, is a directory, or attempts
    path traversal outside *base*, falls back to ``base / "index.html"``.

    Parameters
    ----------
    uri:
        Request URI (e.g. ``"/assets/app.js"``).
    base:
        Base directory.  Defaults to the module-level ``BASE``
        constant (``web2touch/``).

    Returns
    -------
    Absolute file path guaranteed to be under *base*.
    """
    if base is None:
        base = BASE
    base_resolved = base.resolve()
    requested = (base / uri.lstrip("/")).resolve()

    # Path traversal prevention: ensure the resolved path is inside base
    if base_resolved not in requested.parents and requested != base_resolved:
        requested = base / "index.html"

    if not requested.exists() or requested.is_dir():
        requested = base / "index.html"

    return requested


def _inject_ws_script(body: bytes, port: int) -> bytes:
    """Inject the WebSocket reconnect script into ``index.html``.

    Replaces ``</head>`` with a ``<script>`` block that sets
    ``window.__WS_PORT``.

    Parameters
    ----------
    body:
        Raw HTML bytes.
    port:
        The port to insert into the script.

    Returns
    -------
    Modified HTML bytes.  If ``</head>`` is not found, returns
    *body* unchanged.
    """
    script = (
        b'<script>window.__WS_PORT=\'%d\';'
        b'var _o=WebSocket;WebSocket=function(u){'
        b'return new _o(\'ws://\'+window.location.hostname+\':\'+window.__WS_PORT)'
        b'};</script></head>'
    ) % port
    return body.replace(b"</head>", script)


# ═══════════════════════════════════════════════════════════════════════════
# Async handlers
# ═══════════════════════════════════════════════════════════════════════════


async def proxy_to_td(writer: asyncio.StreamWriter, method: str, uri: str, body: bytes) -> None:
    """Proxy a request to the TouchDesigner API, returning CORS-safe response."""
    import urllib.request as _ur
    td_path = uri[4:]  # strip '/api' prefix
    td_url = MCP + td_path

    try:
        req = _ur.Request(
            td_url,
            data=body if method == "POST" else None,
            headers={
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
        )
        resp = _ur.urlopen(req, timeout=10)
        resp_body = resp.read()
        status = resp.status

        # If TD API returns empty, fall back to endpoint_fix for known endpoints
        td_path_clean = td_path.split("?")[0]  # strip query string for dict lookup
        if not resp_body and td_path_clean in _FIX_ENDPOINTS:
            fix_name = _FIX_ENDPOINTS[td_path_clean]
            # Extract params: from POST body or GET query string
            params: dict = {}
            if method == "POST" and body:
                try:
                    params = json.loads(body.decode("utf-8"))
                except (json.JSONDecodeError, UnicodeDecodeError):
                    pass
            elif method == "GET" and "?" in td_path:
                qs = td_path.split("?", 1)[1]
                for part in qs.split("&"):
                    if "=" in part:
                        k, v = part.split("=", 1)
                        params[k] = v
            # Only fall back if we have at least a path or source/dest param
            if params.get("path") or params.get("source") or params.get("src"):
                params_json = json.dumps(params)
                exec_code = (
                    f'{_FIX_LOAD}; '
                    f'import json; '
                    f'print(json.dumps(endpoint_call("{fix_name}",{params_json})))'
                )
                try:
                    fix_req = _ur.Request(
                        MCP + "/exec",
                        data=json.dumps({"code": exec_code}).encode(),
                        headers={"Content-Type": "application/json"},
                    )
                    fix_resp = _ur.urlopen(fix_req, timeout=10)
                    fix_body = fix_resp.read()
                    if fix_body:
                        # Unwrap /exec's {output: "..."} wrapper
                        try:
                            fix_data = json.loads(fix_body)
                            if "output" in fix_data and isinstance(fix_data["output"], str):
                                inner = json.loads(fix_data["output"])
                                resp_body = json.dumps(inner).encode()
                            else:
                                resp_body = fix_body
                        except (json.JSONDecodeError, KeyError):
                            resp_body = fix_body
                        status = 200
                except Exception:
                    pass  # fallback failed, return original empty response
    except _ur.HTTPError as e:
        resp_body = e.read() if e.fp else b""
        status = e.code
    except Exception as e:
        resp_body = json.dumps({"error": str(e)}).encode()
        status = 502

    hdr = (
        f"HTTP/1.1 {status} {_status_text(status)}\r\n"
        f"Content-Type: application/json\r\n"
        f"Content-Length: {len(resp_body)}\r\n"
        f"Access-Control-Allow-Origin: *\r\n"
        f"Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n"
        f"Access-Control-Allow-Headers: Content-Type\r\n"
        f"\r\n"
    ).encode()
    writer.write(hdr + resp_body)
    await writer.drain()
    writer.close()


def _status_text(code: int) -> str:
    """Return HTTP status text for common codes."""
    return {
        200: "OK", 201: "Created", 204: "No Content",
        301: "Moved Permanently", 302: "Found", 304: "Not Modified",
        400: "Bad Request", 401: "Unauthorized", 403: "Forbidden",
        404: "Not Found", 405: "Method Not Allowed", 408: "Request Timeout",
        500: "Internal Server Error", 502: "Bad Gateway",
        503: "Service Unavailable",
    }.get(code, "Unknown")


async def serve_file(writer: asyncio.StreamWriter, uri: str) -> None:
    """Serve a static file from the ``web2touch/`` directory."""
    fp = _resolve_file_path(uri)
    ct = _resolve_mime_type(fp.suffix)
    body = fp.read_bytes()
    if fp.name in ("index.html", "dashboard.html", "test-ui.html", "glsl_editor.html"):
        body = _inject_ws_script(body, PORT)
    hdr = (
        f"HTTP/1.1 200 OK\r\n"
        f"Content-Type: {ct}\r\n"
        f"Content-Length: {len(body)}\r\n"
        f"Access-Control-Allow-Origin: *\r\n"
        f"\r\n"
    ).encode()
    writer.write(hdr + body)
    await writer.drain()


async def handle_ws(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
    """Handle a WebSocket client session (RFC 6455)."""
    import traceback

    addr = writer.get_extra_info("peername")
    print(f"W2T: connected {addr}")
    try:
        while True:
            # ── Read frame header (min 2 bytes) ──
            hdr = await asyncio.wait_for(reader.readexactly(2), 5)
            opcode, fin, masked, raw_len = _parse_ws_header(hdr)

            if opcode == 8:
                break  # close
            if opcode == 9:  # ping → pong
                writer.write(b"\x8a\x00")
                await writer.drain()
                continue

            # ── Read extended length if needed ──
            if raw_len == 126:
                ext = await reader.readexactly(2)
                payload_length = struct.unpack("!H", ext)[0]
            elif raw_len == 127:
                ext = await reader.readexactly(8)
                payload_length = struct.unpack("!Q", ext)[0]
            else:
                payload_length = raw_len

            print(
                f"  WS frame: op={opcode} fin={fin} "
                f"len={payload_length} masked={masked}"
            )

            # ── Read mask + payload ──
            mask = await reader.readexactly(4) if masked else b"\x00" * 4
            raw = bytearray(await reader.readexactly(payload_length))
            if masked:
                raw = _apply_mask(bytes(raw), mask)
            msg = raw.decode() if isinstance(raw, bytes) else bytes(raw).decode()
            print(f"W2T RECV: {msg[:200]}")

            # ── Forward to TD (table + CHOP) ──
            try:
                data = json.loads(msg)
            except json.JSONDecodeError:
                data = {}
            table_code = _build_forward_code(data, msg)
            chop_code = _build_chop_code(data)
            combined_code = table_code + "\n" + chop_code
            try:
                req = urllib.request.Request(
                    MCP + "/exec",
                    data=json.dumps({"code": combined_code}).encode(),
                    headers={"Content-Type": "application/json"},
                )
                urllib.request.urlopen(req, timeout=3)
            except Exception as e:
                print(f"  MCP err: {e}")
    except Exception as e:
        if "Connection" not in str(e):
            print(f"W2T err: {traceback.format_exc()[-200:]}")
    writer.close()
    print(f"W2T: disconnected {addr}")


async def handle_client(
    reader: asyncio.StreamReader, writer: asyncio.StreamWriter
) -> None:
    """Handle a single TCP connection (HTTP or WebSocket upgrade)."""
    try:
        # Read up to 64KB for the initial HTTP request (10s total timeout)
        first = b""
        loop = asyncio.get_event_loop()
        deadline = loop.time() + 10.0
        while len(first) < 65536 and loop.time() < deadline:
            try:
                chunk = await asyncio.wait_for(
                    reader.read(4096),
                    max(1.0, deadline - loop.time()),
                )
            except asyncio.TimeoutError:
                chunk = b""
            if not chunk:
                break
            first += chunk
            if b"\r\n\r\n" in first:
                break
        text = first.decode(errors="ignore")
    except Exception:
        writer.close()
        return

    method, uri, headers = _parse_http_request(text)
    upgrade_val = headers.get("upgrade", "").lower()

    # Proxy /api/* requests to TouchDesigner API (CORS-safe)
    if uri.startswith("/api"):
        body_start = first.find(b"\r\n\r\n")
        body = b""
        if body_start != -1:
            body = first[body_start + 4:]
        await proxy_to_td(writer, method, uri, body)
        return

    if upgrade_val == "websocket":
        key = headers.get("sec-websocket-key", "")
        accept = _compute_ws_accept(key)
        resp = (
            f"HTTP/1.1 101 Switching Protocols\r\n"
            f"Upgrade: websocket\r\n"
            f"Connection: Upgrade\r\n"
            f"Sec-WebSocket-Accept: {accept}\r\n"
            f"\r\n"
        )
        writer.write(resp.encode())
        await writer.drain()
        await handle_ws(reader, writer)
    else:
        await serve_file(writer, uri)
        writer.close()


async def main() -> None:
    """Start the TCP server."""
    server = await asyncio.start_server(handle_client, "0.0.0.0", PORT)
    print(f"[OK] Web2Touch: http://127.0.0.1:{PORT}")
    print(f"[OK] WebSocket: ws://127.0.0.1:{PORT}")
    print(f"[OK] TD MCP relay: {MCP}")
    async with server:
        await server.serve_forever()


if __name__ == "__main__":
    asyncio.run(main())
