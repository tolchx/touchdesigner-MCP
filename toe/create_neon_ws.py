"""Create WebSocket DAT in TD for NEON-CTRL."""
import json

p1 = op('/project1')

# Remove old if exists
existing = op('/project1/neon_ws')
if existing:
    existing.destroy()
old_cb = op('/project1/neon_ws_callbacks')
if old_cb:
    old_cb.destroy()

# 1. Create WebSocket DAT
ws = p1.create(td.websocketDAT, 'neon_ws')
ws.nodeX = -400
ws.nodeY = 600
ws.par.active = 1
ws.par.port = 9988

# 2. Create callbacks DAT with NEON-CTRL message handling
cb_code = '''
def onReceiveJSON(dat, row, data):
    table = op("/project1/neon_values")
    if not table:
        return
    cid = data.get("id", "")
    ctype = data.get("type", "")
    cval = str(data.get("value", ""))
    cts = str(data.get("timestamp", ""))
    if not cid:
        return
    found = -1
    for r in range(1, table.numRows):
        if table[r, 0].val == cid:
            found = r
            break
    if found < 0:
        table.appendRow([cid, ctype, cval, cts])
    else:
        table[found, 2] = cval
        table[found, 3] = cts
'''.strip()

cb = p1.create(td.textDAT, 'neon_ws_callbacks')
cb.nodeX = -200
cb.nodeY = 600
cb.text = cb_code

# Wire callback to websocket
ws.par.callbackdat = cb

# Force cook to activate
ws.cook(force=True)

nv = op('/project1/neon_values')
print(json.dumps({
    'ws_created': ws.path,
    'ws_port': ws.par.port.eval(),
    'ws_active': ws.par.active.eval(),
    'cb_created': cb.path,
    'neon_values_rows': nv.numRows if nv else 0,
}))
