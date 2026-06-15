# fix_flat.py — Paste each line into TD textport one at a time.
# No indentation, no multi-line blocks. Each line is independent.
#
# STEP 1: Find and inspect the mcp_server
base = op("/mcp_server")
print("mcp_server:", base)

# STEP 2: List children
for c in base.children: print(c.name, c.type)

# STEP 3: Get the Text DAT
td_api = [c for c in base.children if c.type == "textDAT"][0]
print("TextDAT:", td_api.path, len(td_api.text), "chars")

# STEP 4: Set extension params (one line each)
td_api.par.extension = "pythonext"
print("extension set")

td_api.par.customext = "TouchDesignerAPI"
print("customext set")

td_api.par.language = "python"
print("language set")

# STEP 5: Get WebServer and Execute
ws = [c for c in base.children if c.type == "webserverDAT"][0]
exec_dat = [c for c in base.children if c.type == "executeDAT"][0]
print("WS:", ws.path, "EXEC:", exec_dat.path)

# STEP 6: Wire WebServer -> Execute
ws.outputConnectors[0].connect(exec_dat.inputConnectors[0])
print("Wired!")

# STEP 7: Cook the extension to reload it
td_api.cook(force=True)
print("Cooked textDAT")

# STEP 8: Verify
print("Port:", ws.par.port.eval())
print("Has ext:", hasattr(td_api, "ext"))
if hasattr(td_api, "ext"):
    print("Has TDAPI:", hasattr(td_api.ext, "TouchDesignerAPI"))
print("Done!")
