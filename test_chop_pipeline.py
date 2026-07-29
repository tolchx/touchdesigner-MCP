#!/usr/bin/env python3
"""Test the _build_chop_code output directly against MCP."""
import json, time, urllib.request
import sys
sys.path.insert(0, '.')
from w2t_server import _build_chop_code

MCP = "http://127.0.0.1:44444"

def td(code, retries=3):
    for i in range(retries):
        try:
            r = urllib.request.Request(MCP+"/exec",
                data=json.dumps({"code":code}).encode(),
                headers={"Content-Type":"application/json"})
            return json.loads(urllib.request.urlopen(r, timeout=10).read())
        except Exception as e:
            if i < retries-1: time.sleep(1)
            else: return {"output":"","error":str(e)}

# First verify MCP is alive
print("=== MCP ALIVE? ===")
try:
    r = urllib.request.urlopen("http://127.0.0.1:44444/info", timeout=5)
    print(f"  MCP OK: {json.loads(r.read()).get('version','?')[:50]}")
except Exception as e:
    print(f"  MCP DEAD: {e}")
    print("  Is TouchDesigner + MCP server running?")
    sys.exit(1)

# Verify mergeCHOP exists
print("\n=== VERIFY PIPELINE ===")
r = td('c=op("/project1/neon_channels");print("Exists:",c!=None);print("Chans:",c.numChans)')
print(f"  {r.get('output','')[:200]}")
if r.get("error"): print(f"  ERR: {r['error'][:200]}")

# Generate chop code
print("\n=== GENERATED CHOP CODE ===")
code = _build_chop_code({"id":"amp","type":"slider","value":"0.85"})
print(code)
print()

# Execute it
print("=== EXECUTE CHOP CODE ===")
r = td(code)
print(f"  OUT: {r.get('output','')[:300]}")
print(f"  ERR: {r.get('error','')[:300]}")

# Check if constantCHOP was created
print("\n=== CHECK _ch_amp ===")
r = td(
    'c=op("/project1/_ch_amp");'
    'print("Exists:",c!=None);'
    'if c:'
    ' print("Type:",type(c).__name__);'
    ' print("Chans:",c.numChans);'
    ' print("Chan0:",c[0].name,"=",c[0].vals[0]);'
    ' print("Value0:",c.par.value0.eval())'
)
print(f"  {r.get('output','')[:500]}")
if r.get("error"): print(f"  ERR: {r['error'][:300]}")

# Now send freq
code2 = _build_chop_code({"id":"freq","type":"slider","value":"0.50"})
print("\n=== EXECUTE FREQ ===")
r = td(code2)
print(f"  OUT: {r.get('output','')[:200]}")
if r.get("error"): print(f"  ERR: {r['error'][:300]}")

# Check both
print("\n=== CHECK BOTH ===")
r = td(
    'for n in ["_ch_amp","_ch_freq"]:'
    ' c=op("/project1/"+n);'
    ' if c: print(n,"->",c.par.value0.eval(),"name=",c[0].name)'
)
print(f"  {r.get('output','')[:300]}")

# Check mergeCHOP channels
print("\n=== CHECK MERGE ===")
r = td(
    'c=op("/project1/neon_channels");'
    'print("Chans:",c.numChans);'
    '[print("  "+str(c[i].name)+"="+str(c[i].vals[0])) for i in range(c.numChans)]'
)
print(f"\n{r.get('output','')[:500]}")
if r.get("error"): print(f"  ERR: {r['error'][:300]}")

print("\nDone")
