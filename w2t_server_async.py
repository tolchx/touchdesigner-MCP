#!/usr/bin/env python
"""Web2Touch server — HTTP + WebSocket on same port, relay to TD MCP."""
import asyncio, json, pathlib, sys, urllib.request

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8090
BASE = pathlib.Path(__file__).parent / "web2touch"
MCP = "http://127.0.0.1:44444"

MIMES = {".html": "text/html", ".js": "application/javascript",
         ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml"}

async def ws_handler(websocket):
    print("W2T: connected")
    try:
        async for message in websocket:
            print(f"W2T RECV: {message[:200]}")
            try:
                data = json.loads(message)
            except json.JSONDecodeError:
                data = {"raw": message}
            # Forward to TD MCP
            code = 'import json; t=op("/project1/neon_values"); cid="{}"; ctype="{}"; cval="{}"; cts="{}"; found=-1\nfor r in range(1,t.numRows):\n if t[r,0].val==cid: found=r; break\nif found<0: t.appendRow([cid,ctype,cval,cts])\nelse: t[found,2]=cval; t[found,3]=cts'.format(
                str(data.get("id","")), str(data.get("type","")),
                str(data.get("value","")), str(data.get("timestamp","")))
            try:
                req = urllib.request.Request(MCP+"/exec",
                    data=json.dumps({"code":code}).encode(),
                    headers={"Content-Type":"application/json"})
                with urllib.request.urlopen(req, timeout=3) as r:
                    pass
            except Exception as e:
                print(f"W2T MCP err: {e}")
    except Exception as e:
        print(f"W2T: disconnected ({e})")

async def http_handler(reader, writer):
    try:
        data = await asyncio.wait_for(reader.read(4096), timeout=5)
        line = data.decode().split("\r\n")[0]
        parts = line.split()
        if len(parts) < 2:
            return
        method, uri = parts[0], parts[1]
        file_path = BASE / uri.lstrip("/")
        if not file_path.exists() or file_path.is_dir():
            file_path = BASE / "index.html"
        ext = file_path.suffix.lower()
        content_type = MIMES.get(ext, "application/octet-stream")
        body = file_path.read_bytes()
        resp = f"HTTP/1.1 200 OK\r\nContent-Type: {content_type}\r\nContent-Length: {len(body)}\r\n\r\n"
        writer.write(resp.encode() + body)
        await writer.drain()
    except:
        pass
    finally:
        writer.close()

async def main():
    import websockets
    ws_server = await websockets.serve(ws_handler, "0.0.0.0", PORT)
    print(f"🟢 Web2Touch: http://127.0.0.1:{PORT}")
    print(f"🟢 WebSocket: ws://127.0.0.1:{PORT}")
    print(f"🟢 TD MCP: {MCP}")
    # Also start HTTP server on same port using asyncio
    http_server = await asyncio.start_server(http_handler, "0.0.0.0", PORT)
    print("🟢 HTTP share same port")
    await asyncio.gather(ws_server.wait_closed(), http_server.serve_forever())

asyncio.run(main())
