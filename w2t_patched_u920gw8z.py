#!/usr/bin/env python
"""Web2Touch bridge — HTTP + WS on same port 8090, relay to TD MCP"""
import asyncio, json, pathlib, sys, urllib.request

PORT = 18090
BASE = pathlib.Path(__file__).parent / "web2touch"
MCP = "http://127.0.0.1:44444"
MIMES = {".html":"text/html",".js":"application/javascript",".css":"text/css",".png":"image/png",".svg":"image/svg+xml"}

# ── Single TCP server handling both HTTP and WS ──
import struct, hashlib, base64
MAGIC = b"258EAFA5-E914-47DA-95CA-C5AB0DC85B11"

async def serve_file(writer, uri):
    fp = BASE / uri.lstrip("/")
    if not fp.exists() or fp.is_dir(): fp = BASE / "index.html"
    ct = MIMES.get(fp.suffix.lower(), "application/octet-stream")
    body = fp.read_bytes()
    # Inject WS reconnect fix for index.html
    if fp.name == "index.html":
        body = body.replace(
            b"</head>",
            b"<script>window.__WS_PORT='%d';var _o=WebSocket;WebSocket=function(u){return new _o('ws://'+window.location.hostname+':'+window.__WS_PORT)};</script></head>" % PORT
        )
    hdr = f"HTTP/1.1 200 OK\r\nContent-Type: {ct}\r\nContent-Length: {len(body)}\r\nAccess-Control-Allow-Origin: *\r\n\r\n".encode()
    writer.write(hdr + body)
    await writer.drain()

async def handle_ws(reader, writer):
    """Handle WebSocket client"""
    import traceback
    addr = writer.get_extra_info("peername")
    print(f"W2T: connected {addr}")
    try:
        while True:
            hdr = await asyncio.wait_for(reader.readexactly(2), 5)
            opcode = hdr[0] & 0x0F
            print(f"  WS frame: op={opcode} fin={hdr[0]>>7} len={hdr[1]&127} masked={bool(hdr[1]&128)}")
            if opcode == 8: break  # close
            if opcode == 9:  # ping → pong
                writer.write(b"\x8a\x00")
                await writer.drain()
                continue
            masked = bool(hdr[1] & 0x80)
            length = hdr[1] & 0x7F
            if length == 126: length = struct.unpack("!H", await reader.readexactly(2))[0]
            elif length == 127: length = struct.unpack("!Q", await reader.readexactly(8))[0]
            mask = await reader.readexactly(4) if masked else b"\x00"*4
            raw = bytearray(await reader.readexactly(length))
            for i in range(length): raw[i] ^= mask[i%4]
            msg = raw.decode()
            print(f"W2T RECV: {msg[:200]}")
            # Forward to TD
            try: data = json.loads(msg)
            except: data = {}
            cid = str(data.get("id",""))
            ctype = str(data.get("type",""))
            cval = str(data.get("value",msg))
            code = 'import json; t=op("/project1/neon_values"); cid="{}"; ctype="{}"; cval="{}"; cts="{}"; found=-1\nfor r in range(1,t.numRows):\n if t[r,0].val==cid: found=r; break\nif found<0: t.appendRow([cid,ctype,cval,cts])\nelse: t[found,2]=cval; t[found,3]=cts'.format(cid,ctype,cval,"")
            try:
                req = urllib.request.Request(MCP+"/exec", data=json.dumps({"code":code}).encode(), headers={"Content-Type":"application/json"})
                urllib.request.urlopen(req, timeout=3)
            except Exception as e:
                print(f"  MCP err: {e}")
    except Exception as e:
        if "Connection" not in str(e):
            print(f"W2T err: {traceback.format_exc()[-200:]}")
    writer.close()
    print(f"W2T: disconnected {addr}")

async def handle_client(reader, writer):
    try:
        # Read up to 64KB for the initial HTTP request (10s total timeout)
        first = b""
        deadline = asyncio.get_event_loop().time() + 10.0
        while len(first) < 65536 and asyncio.get_event_loop().time() < deadline:
            try:
                chunk = await asyncio.wait_for(reader.read(4096), max(1.0, deadline - asyncio.get_event_loop().time()))
            except asyncio.TimeoutError:
                chunk = b""
            if not chunk:
                break
            first += chunk
            if b"\r\n\r\n" in first:
                break
        text = first.decode(errors="ignore")
    except:
        writer.close(); return

    if "Upgrade: websocket" in text:
        key = ""
        for line in text.split("\r\n"):
            if line.startswith("Sec-WebSocket-Key:"):
                key = line.split(":")[1].strip()
        accept = base64.b64encode(hashlib.sha1(key.encode()+MAGIC).digest()).decode()
        resp = f"HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: {accept}\r\n\r\n"
        writer.write(resp.encode()); await writer.drain()
        await handle_ws(reader, writer)
    else:
        parts = text.split("\r\n")[0].split()
        uri = parts[1] if len(parts) > 1 else "/"
        await serve_file(writer, uri)
        writer.close()

async def main():
    server = await asyncio.start_server(handle_client, "0.0.0.0", PORT)
    print(f"🟢 Web2Touch: http://127.0.0.1:{PORT}")
    print(f"🟢 WebSocket: ws://127.0.0.1:{PORT}")
    print(f"🟢 TD MCP relay: {MCP}")
    async with server:
        await server.serve_forever()

asyncio.run(main())
