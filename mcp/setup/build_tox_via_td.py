#!/usr/bin/env python3
"""
build_tox_via_td.py — Build a real .tox from inside TouchDesigner.

Connects to a running TD instance via /exec and sends Python code that:
  1. Creates a Base COMP with WebServer DAT, Text DAT (extension), Execute DAT
  2. Sets text content and basic wiring
  3. Exports as a real .tox binary using base.saveExternalTox()

REQUIRES: TouchDesigner running with /exec endpoint on port 44444.

Usage:
    python mcp/setup/build_tox_via_td.py [--output path/to/file.tox] [--port 44444]
"""

import argparse
import base64
import json
import os
import sys
import urllib.request
import urllib.error

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
TOE_EXTENSION_PATH = os.path.join(SCRIPT_DIR, "toe_extension.py")
DEFAULT_OUTPUT = os.path.join(SCRIPT_DIR, "TouchDesigner_MCP_Server.tox")

EXEC_CALLBACK = """def onHTTPRequest(dat, request):
    me = op('../touchdesigner_api')
    if me and hasattr(me, 'TouchDesignerAPI'):
        api = me.store('api')
        if api is None:
            api = me.TouchDesignerAPI()
            me.store('api', api)
        return api.handle_request(dat, request)
    return {'status': 500, 'body': 'API not initialized'}"""


def td_exec(host: str, port: int, code: str) -> dict:
    """Send Python code to TD via /exec and return the result."""
    url = f"http://{host}:{port}/exec"
    payload = json.dumps({"code": code}).encode("utf-8")
    req = urllib.request.Request(url, data=payload, method="POST",
                                headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        try:
            return json.loads(body)
        except Exception:
            return {"error": body}
    except Exception as e:
        return {"error": str(e)}


def build_tox(host: str, port: int, output_path: str, server_port: int = 44444) -> bool:
    """Build a real .tox by sending creation code to TD."""

    # 1. Read and encode the extension code
    if not os.path.exists(TOE_EXTENSION_PATH):
        print(f"ERROR: Extension not found at {TOE_EXTENSION_PATH}")
        return False

    with open(TOE_EXTENSION_PATH, "r", encoding="utf-8") as f:
        extension_code = f.read()

    ext_b64 = base64.b64encode(extension_code.encode("utf-8")).decode("ascii")
    output_abs = os.path.abspath(output_path).replace("\\", "/")
    exec_b64 = base64.b64encode(EXEC_CALLBACK.encode("utf-8")).decode("ascii")

    # Delete old .tox to prevent stale ZIP from lingering on failure
    if os.path.exists(output_path):
        try:
            os.remove(output_path)
            print(f"Removed old file: {output_path}")
        except Exception:
            pass

    # 2. Build TD script using json.dumps for safe string embedding
    td_script_parts = [
        'import base64, json, os',
        '',
        f'output_path = r"{output_abs}"',
        f'api_port = {server_port}',
        f'ext_b64 = "{ext_b64}"',
        f'exec_b64 = "{exec_b64}"',
        '',
        '# Decode content',
        'ext_code = base64.b64decode(ext_b64).decode("utf-8")',
        'exec_code = base64.b64decode(exec_b64).decode("utf-8")',
        '',
        '# Step 1: Clean up any existing mcp_server',
        'root = op("/")',
        'existing = root.findChildren(depth=1, name="mcp_server")',
        'for e in existing:',
        '    try: e.destroy()',
        '    except: pass',
        '',
        '# Step 2: Create Base COMP',
        'base = root.create(baseCOMP, "mcp_server")',
        'base.nodeX = 0',
        'base.nodeY = 0',
        'print("[1/5] Created Base COMP: mcp_server")',
        '',
        '# Step 3: Create WebServer DAT',
        'ws = base.create(webserverDAT, "webserver1")',
        'ws.par.port = api_port',
        'ws.nodeX = 200',
        'ws.nodeY = 0',
        'print("[2/5] Created WebServer DAT on port " + str(api_port))',
        '',
        '# Step 4: Create Text DAT with extension code',
        'td_api = base.create(textDAT, "touchdesigner_api")',
        'td_api.text = ext_code',
        'td_api.par.language = "python"',
        'td_api.nodeX = -200',
        'td_api.nodeY = 0',
        'print("[3/5] Created Text DAT (" + str(len(ext_code)) + " chars)")',
        '',
        '# Step 5: Create Execute DAT',
        'exec_dat = base.create(executeDAT, "execute1")',
        'exec_dat.text = exec_code',
        'exec_dat.nodeX = 200',
        'exec_dat.nodeY = -200',
        'print("[4/5] Created Execute DAT with HTTP callback")',
        '',
        '# Step 6: Wire WebServer -> Execute',
        'try:',
        '    ws.outputConnectors[0].connect(exec_dat.inputConnectors[0])',
        '    print("[5/5] Connected WebServer -> Execute")',
        'except Exception as e:',
        '    print("[5/5] Wire warning: " + str(e))',
        '',
        '# Step 7: Export as .tox',
        'try:',
        '    base.save(output_path)',
        '    size = os.path.getsize(output_path)',
        '    print("EXPORTED .tox: " + output_path + " (" + str(size) + " bytes)")',
        '    print(json.dumps({"success": True, "path": output_path, "size": size}))',
        'except Exception as e:',
        '    print("EXPORT FAILED: " + str(e))',
        '    print(json.dumps({"success": False, "error": str(e)}))',
    ]

    td_script = "\n".join(td_script_parts)

    # 3. Send to TD
    print(f"Connecting to TD at {host}:{port}...")
    print(f"Sending creation script ({len(td_script)} chars)...")

    result = td_exec(host, port, td_script)

    # 4. Parse output
    output = result.get("output", "")
    error = result.get("error", "")

    if output:
        for line in output.strip().split("\n"):
            print(f"  TD> {line}")

    if error:
        for line in error.strip().split("\n"):
            print(f"  ERR> {line}")

    # Check if the file was actually created by TD
    if os.path.exists(output_path):
        with open(output_path, "rb") as f:
            header = f.read(2)
        size = os.path.getsize(output_path)
        is_td_binary = header == b"\x00\x00"
        td_success = "EXPORTED .tox" in output

        if td_success and is_td_binary:
            print(f"\nSUCCESS: Real TD .tox created at {output_path} ({size:,} bytes)")
            return True
        elif td_success and header == b"PK":
            print(f"\nWARNING: TD exported but file is ZIP format ({size:,} bytes)")
            return False
        elif header == b"PK" and not td_success:
            print(f"\nFAILED: File is still the old ZIP ({size:,} bytes)")
            return False
        else:
            print(f"\nUNKNOWN: File exists ({size:,} bytes, header: {header.hex()})")
            return False
    else:
        print(f"\nFAILED: .tox not found at {output_path}")
        return False


def main():
    parser = argparse.ArgumentParser(description="Build .tox from inside TouchDesigner")
    parser.add_argument("--host", default="localhost", help="TD host")
    parser.add_argument("--port", type=int, default=44444, help="TD API port")
    parser.add_argument("--server-port", type=int, default=44444, help="WebServer port in .tox")
    parser.add_argument("--output", default=None, help="Output .tox path")
    args = parser.parse_args()

    output = args.output or DEFAULT_OUTPUT

    print("=" * 60)
    print("  TouchDesigner MCP — Build .tox from inside TD")
    print("=" * 60)
    print()

    success = build_tox(args.host, args.port, output, args.server_port)
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
