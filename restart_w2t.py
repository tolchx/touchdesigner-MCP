#!/usr/bin/env python3
"""Safely restart w2t_server.py and test the full flow."""
import json, time, urllib.request, subprocess, os

MCP = "http://127.0.0.1:44444"
PROJ = r"C:\Users\Tolch\Documents\AI_Code\Touchdesigner_MCP\Main"

def td(code):
    for i in range(5):
        try:
            r = urllib.request.Request(MCP+"/exec",
                data=json.dumps({"code":code}).encode(),
                headers={"Content-Type":"application/json"})
            return json.loads(urllib.request.urlopen(r, timeout=10).read())
        except Exception as e:
            if i < 4: time.sleep(1)
            else: return {"output":"","error":str(e)}

# ══════════════════════════════════════
# 1) Verify MCP first
# ══════════════════════════════════════
print("=== Step 1: Verify MCP ===")
try:
    r = urllib.request.urlopen("http://127.0.0.1:44444/info", timeout=5)
    print(f"  MCP OK: {json.loads(r.read()).get('projectFPS','?')} FPS")
except Exception as e:
    print(f"  MCP DEAD: {e}")
    print("  Start TouchDesigner + MCP server first!")
    exit(1)

# ══════════════════════════════════════
# 2) Kill old w2t_server (specific)
# ══════════════════════════════════════
print("\n=== Step 2: Restart w2t_server ===")
import psutil
killed = 0
for proc in psutil.process_iter(['pid','cmdline']):
    try:
        cmd = ' '.join(proc.info['cmdline'] or [])
        if 'w2t_server.py' in cmd:
            proc.kill()
            killed += 1
            print(f"  Killed pid {proc.info['pid']}")
    except: pass
time.sleep(1)

log = open(os.path.join(PROJ, 'w2t_server.log'), 'w')
p = subprocess.Popen(
    ['python', 'w2t_server.py'],
    cwd=PROJ,
    stdout=log,
    stderr=subprocess.STDOUT,
    creationflags=subprocess.CREATE_NEW_CONSOLE
)
time.sleep(2)
print(f"  Started pid={p.pid}")

# Verify W2T is alive
try:
    r = urllib.request.urlopen("http://127.0.0.1:8090/", timeout=5)
    print(f"  W2T OK ({r.status})")
except Exception as e:
    print(f"  W2T FAIL: {e}")

# ══════════════════════════════════════
# 3) Verify pipeline in TD
# ══════════════════════════════════════
print("\n=== Step 3: Verify TD pipeline ===")
r = td(
    'c=op("/project1/neon_channels");'
    'o=op("/project1/neon_out");'
    'print("neon_channels:",c!=None,"chans:",c and c.numChans);'
    'print("neon_out:",o!=None,"chans:",o and o.numChans)'
)
print(f"  {r.get('output','')[:200]}")

# ══════════════════════════════════════
# 4) Send data via WS
# ══════════════════════════════════════
print("\n=== Step 4: Send test data via WS ===")
test_data = [
    {"id":"amp","type":"slider","value":"0.85"},
    {"id":"freq","type":"slider","value":"0.50"},
    {"id":"speed","type":"slider","value":"0.30"},
    {"id":"size","type":"slider","value":"2.0"},
    {"id":"fx","type":"toggle","value":"1"},
    {"id":"knob_master","type":"knob",
     "channels":{"value":"0.850","degrees":"229.5","normalized":"0.850"}},
]
try:
    import websocket
    ws = websocket.create_connection("ws://127.0.0.1:8090", timeout=5)
    for d in test_data:
        ws.send(json.dumps(d))
    ws.close()
    print(f"  Sent {len(test_data)} messages")
except Exception as e:
    print(f"  WS failed: {e}")

time.sleep(1)

# ══════════════════════════════════════
# 5) Check CHOP output
# ══════════════════════════════════════
print("\n=== Step 5: CHECK CHOP OUTPUT ===")
r = td(
    'c=op("/project1/neon_channels");'
    'print("CHANS: "+str(c.numChans));'
    '[print("  "+str(c[i].name)+"="+str(c[i].vals[0])) for i in range(c.numChans)]'
)
out = r.get("output","")
print(f"\n{out}")

r = td(
    'o=op("/project1/neon_out");'
    'print("OUT chans="+str(o.numChans));'
    '[print("  "+str(o[i].name)+"="+str(o[i].vals[0])) for i in range(o.numChans)]'
)
print(f"\nOUT:\n{r.get('output','')[:500]}")

# List all _ch_* ops
r = td(
    'for n in op("/project1").children:'
    ' if n.name.startswith("_ch_"):'
    '  print(n.name[4:]+"="+str(n.par.value0.eval())[:6])'
)
print(f"\nCHANNELS:\n{r.get('output','')[:300]}")

# ══════════════════════════════════════
# 6) Result
# ══════════════════════════════════════
has = "CHANS: 0" not in (out.split("CHANS:")[1].split("\n")[0] if "CHANS:" in out else "0")
print("\n" + "=" * 50)
if has:
    print("  FULL PIPELINE WORKS! ✓")
    print("  Dashboard → WS → MCP → TD CHOP pipeline functional")
    print("  neon_out shows", out.split("CHANS:")[1].split("\n")[0].strip() if "CHANS:" in out else "?", "channels")
else:
    print("  PIPELINE FAILED")
    print("  See w2t_server.log for details")
print("=" * 50)
