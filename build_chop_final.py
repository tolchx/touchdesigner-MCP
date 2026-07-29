#!/usr/bin/env python3
"""FINAL: Build CHOP pipeline in TouchDesigner via MCP.
Creates:
  - mergeCHOP 'neon_channels'  — aggregates all constantCHOP channels
  - nullCHOP  'neon_out'       — output (mirrors neon_channels)

Wires: neon_channels -> neon_out

The w2t_server.py (updated) creates individual constantCHOPs for each
dashboard channel and wires them into neon_channels automatically.
"""
import json, time, urllib.request, os, subprocess

MCP = "http://127.0.0.1:44444"

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

# ═══════════════════════════════════════════════════════════════════════════
# Step 1: Clean up old operators
# ═══════════════════════════════════════════════════════════════════════════
print("=== STEP 1: CLEANUP ===")
# Remove old _ch_* constantCHOPs and old pipeline ops
td('for n in ["neon_channels","neon_out","_ch_amp","_ch_freq","_ch_speed",'
   '"_ch_size","_ch_fx","_ch_neon_readme"]:'
   ' o=op("/project1/"+n); o.destroy()')
print("  Cleaned old operators")

# Delete old temp scripts (keep only this one and solve_chop)
for f in ["rebuild_final.py","build_td_simple.py","build_td_chop.py",
          "probe_dat2chop.py","probe_d2c2.py","probe_d2c3.py",
          "probe_datto.py","probe_datto2.py","probe_datto3.py",
          "probe_final.py","probe_key.py","probe_dict.py",
          "probe_script_params.py","tests/fix_and_test.py",
          "tests/add_chop_final.py","tests/add_chop_tests.py",
          "tests/fix_chop_tests.py","tests/add_table_tests.py",
          "tests/fix_w2t_int.py","tests/fix_w2t_int2.py",
          "tests/fix_w2t_int3.py","tests/fix_comprehensive_tests.py",
          "tests/fix_mtdapi_close.py"]:
    if os.path.exists(f):
        os.remove(f)
        print(f"  Deleted {f}")

# ═══════════════════════════════════════════════════════════════════════════
# Step 2: Create mergeCHOP 'neon_channels'
# ═══════════════════════════════════════════════════════════════════════════
print("\n=== STEP 2: Create mergeCHOP 'neon_channels' ===")
r = td(
    'm=op("/project1").create(td.mergeCHOP,"neon_channels");'
    'm.nodeX=-400;m.nodeY=300;'
    'print("Created mergeCHOP:",m.numChans,"chans",m.numSamples,"samples")'
)
print(f"  {r.get('output','')[:200]}")
if r.get("error"):
    print(f"  ERROR: {r['error'][:200]}")
    exit(1)

# ═══════════════════════════════════════════════════════════════════════════
# Step 3: Create nullCHOP 'neon_out'
# ═══════════════════════════════════════════════════════════════════════════
print("\n=== STEP 3: Create nullCHOP 'neon_out' ===")
r = td(
    'o=op("/project1").create(td.nullCHOP,"neon_out");'
    'o.nodeX=-200;o.nodeY=300;'
    'print("Created out:",o.numChans,"chans")'
)
print(f"  {r.get('output','')[:200]}")

# Wire: neon_channels -> neon_out
r = td(
    'src=op("/project1/neon_channels");'
    'dst=op("/project1/neon_out");'
    'src.outputConnectors[0].connect(dst);'
    'print("Wired")'
)
print(f"  {r.get('output','')[:100]}")

# ═══════════════════════════════════════════════════════════════════════════
# Step 4: Restart w2t_server.py with updated code
# ═══════════════════════════════════════════════════════════════════════════
print("\n=== STEP 4: Restart w2t_server.py ===")
try:
    import psutil
    for proc in psutil.process_iter(['pid','name','cmdline']):
        try:
            cmd = ' '.join(proc.info['cmdline'] or [])
            if 'w2t_server.py' in cmd:
                proc.kill()
                time.sleep(1)
                break
        except: pass
except ImportError:
    pass  # psutil not available, assume manual restart

# Start new w2t_server
try:
    p = subprocess.Popen(
        ['python', 'w2t_server.py'],
        cwd=r'C:\Users\Tolch\Documents\AI_Code\Touchdesigner_MCP\Main',
        stdout=open('w2t_server.log', 'w'),
        stderr=subprocess.STDOUT,
        creationflags=subprocess.CREATE_NO_WINDOW
    )
    time.sleep(2)
    print(f"  Started w2t_server.py (pid={p.pid})")
except Exception as e:
    print(f"  WARN: Could not restart: {e}")
    print("  Please restart w2t_server.py manually")

time.sleep(1)

# ═══════════════════════════════════════════════════════════════════════════
# Step 5: Test data flow via WS
# ═══════════════════════════════════════════════════════════════════════════
print("\n=== STEP 5: Send test data via WS ===")
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
    print(f"  Sent {len(test_data)} messages via WS")
except Exception as e:
    print(f"  WS failed: {e}")
    print("  (is w2t_server running on :8090?)")

time.sleep(1)

# ═══════════════════════════════════════════════════════════════════════════
# Step 6: Check CHOP output
# ═══════════════════════════════════════════════════════════════════════════
print("\n=== STEP 6: CHECK CHOP OUTPUT ===")
r = td(
    'c=op("/project1/neon_channels");'
    'print("CHANS: "+str(c.numChans));'
    '[print("  "+str(c[i].name)+"="+str(c[i].vals[0])) for i in range(c.numChans)]'
)
out = r.get("output","")
print(f"\n{out}")
if r.get("error"):
    print(f"ERROR: {r['error'][:300]}")

# Also check neon_out
r = td(
    'o=op("/project1/neon_out");'
    'print("OUT chans="+str(o.numChans));'
    '[print("  "+str(o[i].name)+"="+str(o[i].vals[0])) for i in range(o.numChans)]'
)
print(f"\nOUT:\n{r.get('output','')[:500]}")

# ═══════════════════════════════════════════════════════════════════════════
# Result
# ═══════════════════════════════════════════════════════════════════════════
has_channels = False
for line in out.split("\n"):
    if line.startswith("CHANS:"):
        parts = line.split(":")
        if len(parts) > 1:
            try:
                has_channels = int(parts[1].strip()) > 0
            except: pass

print("\n" + "=" * 50)
if has_channels:
    print("  CHOP pipeline WORKS!")
    print("  neon_channels has named channels from dashboard.")
    print("  Use neon_out in TouchDesigner to access the data.")
else:
    print("  CHOP still has 0 channels. Debugging needed.")
    print("  Check that w2t_server.py was restarted with new code.")
print("=" * 50)
