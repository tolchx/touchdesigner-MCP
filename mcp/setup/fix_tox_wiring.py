"""
Fix .tox Wiring — Paste this into TD's textport.

This script fixes the mcp_server component after loading the .tox:
1. Finds the mcp_server Base COMP
2. Wires WebServer DAT -> Execute DAT
3. Configures the Text DAT as a Python extension
4. Verifies the API works
"""
import json

root = op("/")
comps = root.findChildren(depth=1, name="mcp_server")

if not comps:
    print("ERROR: No mcp_server found at root. Did you drag the .tox in?")
else:
    base = comps[0]
    print(f"Found mcp_server at {base.path}")

    # Find operators inside the Base COMP
    ws = None
    exec_dat = None
    td_api = None

    for child in base.children:
        if child.type == "webserverDAT":
            ws = child
            print(f"  WebServer: {child.path}")
        elif child.type == "executeDAT":
            exec_dat = child
            print(f"  Execute: {child.path}")
        elif child.type == "textDAT":
            td_api = child
            print(f"  TextDAT: {child.path} ({len(child.text)} chars)")

    # Step 1: Configure Text DAT as extension
    if td_api:
        try:
            td_api.par.extension = "pythonext"
            print(f"  Set extension = pythonext")
        except Exception as e:
            print(f"  Extension set error: {e}")
        try:
            td_api.par.customext = "TouchDesignerAPI"
            print(f"  Set customext = TouchDesignerAPI")
        except Exception as e:
            print(f"  Customext set error: {e}")
        try:
            td_api.par.language = "python"
            print(f"  Set language = python")
        except Exception as e:
            print(f"  Language set error: {e}")

    # Step 2: Enable HTTP request on Execute DAT
    if exec_dat:
        try:
            exec_dat.par.active = True
            print(f"  Execute DAT active = True")
        except Exception as e:
            print(f"  Execute active error: {e}")
        # Check if the callback text is present
        if "onHTTPRequest" in exec_dat.text:
            print(f"  Execute DAT has onHTTPRequest callback")
        else:
            print(f"  WARNING: Execute DAT missing onHTTPRequest callback!")
            print(f"  Text preview: {exec_dat.text[:200]}")

    # Step 3: Wire WebServer -> Execute
    if ws and exec_dat:
        try:
            # Disconnect any existing wires first
            for conn in ws.outputConnectors[0].connections:
                ws.outputConnectors[0].disconnect(conn)
            # Connect
            ws.outputConnectors[0].connect(exec_dat.inputConnectors[0])
            print(f"  Wired WebServer -> Execute")
        except Exception as e:
            print(f"  Wire error: {e}")

    # Step 4: Verify
    print("\nVerification:")
    if ws:
        print(f"  WebServer port: {ws.par.port.eval()}")
    if td_api and hasattr(td_api, "ext") and hasattr(td_api.ext, "TouchDesignerAPI"):
        print(f"  Extension loaded: YES")
    else:
        print(f"  Extension loaded: NO (may need cook/reload)")

    print("\nDone! Try: curl http://localhost:44444/info")
