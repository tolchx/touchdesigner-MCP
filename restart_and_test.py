#!/usr/bin/env python3
"""Force restart w2t_server + test CHOP pipeline."""
import json, time, urllib.request, subprocess, os, signal

MCP = "http://127.0.0.1:44444"
PROJ = r"C:\Users\Tolch\Documents\AI_Code\Touchdesigner_MCP\Main"

def td(code, retries=5):
    for i in range(retries):
        try:
            r = json.loads(urllib.request.urlopen(
                urllib.request.Request(MCP+"/exec",
                    data=json.dumps({"code":code}).encode(),
                    headers={"Content-Type":"application/json"}), timeout=10).read())
            out = (r.get("output") or "").strip()
            if out or not r.get("error"):
                return r
            if i < retries-1: time.sleep(1)
        except Exception as e:
            if i < retries-1: time.sleep(1)
            else: return {"output":"","error":str(e)}
    return {"output":""}

# ══════════════════════════════════════
# 1) Kill ALL w2t_server processes
# ══════════════════════════════════════
print("=== Killing old w2t_server ===")
killed = 0
try:
    r = subprocess.run(
        ['taskkill', '/f', '/im', 'python.exe', '/fi', 'cmdline eq *w2t_server*'],
        capture_output=True, text=True, timeout=5)
    print(f"  taskkill: {r.stdout[:200]}")
except:
    pass

# Also try with filter
try:
    import psutil
    for proc in psutil.process_iter(['pid','name','cmdline']):
        try:
            c = ' '.join(proc.info['cmdline'] or [])
            if 'w2t_server.py' in c:
                proc.kill()
                killed += 1
                print(f"  Killed pid {proc.info['pid']}")
        except: pass
except ImportError:
    pass

time.sleep(1)
print(f"  Killed {killed} processes")

# ══════════════════════════════════════
# 2) Start fresh w2t_server
# ══════════════════════════════════════
print("\n=== Starting w2t_server ===")
log = open(os.path.join(PROJ, 'w2t_server.log'), 'w')
p = subprocess.Popen(
    ['python', 'w2t_server.py'],
    cwd=PROJ,
    stdout=log,
    stderr=subprocess.STDOUT,
    creationflags=subprocess.CREATE_NEW_CONSOLE if os.name == 'nt' else 0)
time.sleep(2.5)
print(f"  Started pid={p.pid}")

# ══════════════════════════════════════
# 3) Verify mergeCHOP exists
# ══════════════════════════════════════
print("\n=== Verify pipeline ===")
r = td('c=op("/project1/neon_channels");print("Exists:",c!=None);print("Chans:",c.numChans)')
print(f"  {r.get('output','')[:200]}")
if r.get("error"):
    print(f"  ERROR: {r['error'][:200]}")

# ══════════════════════════════════════
# 4) Send test data via WS
# ══════════════════════════════════════
print("\n=== Send test data via WS ===")
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
print("\n=== CHECK CHOP ===")
r = td(
    'c=op("/project1/neon_channels");'
    'print("CHANS: "+str(c.numChans));'
    '[print("  "+str(c[i].name)+"="+str(c[i].vals[0])) for i in range(c.numChans)]'
)
out = r.get("output","")
print(f"\n{out}")
if r.get("error"):
    print(f"ERROR: {r['error'][:300]}")

# Also list all _ch_ operators
r = td(
    'for n in op("/project1").children:'
    ' if n.name.startswith("_ch_"):'
    '  print(n.name,"val0=",n.par.value0.eval(),"chan0=",n[0].name)'
)
print(f"\nConstantCHOPs:\n{r.get('output','')[:500]}")

# Also check neon_out
r = td(
    'o=op("/project1/neon_out");'
    'print("OUT chans="+str(o.numChans));'
    '[print("  "+str(o[i].name)+"="+str(o[i].vals[0])) for i in range(o.numChans)]'
)
print(f"\nOUT:\n{r.get('output','')[:500]}")

# ══════════════════════════════════════
# 6) Result
# ══════════════════════════════════════
has_chans = "CHANS: 0" not in out.split("CHANS:")[1].split("\n")[0].strip() if "CHANS:" in out else False
print("\n" + "=" * 50)
if has_chans:
    print("  CHOP PIPELINE WORKS! ✓")
else:
    print("  CHOP still shows 0 channels.")
    print("  See w2t_server.log for errors.")
print("=" * 50)
