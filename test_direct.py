#!/usr/bin/env python3
"""Generate, execute, and verify the CHOP pipeline code."""
import json, urllib.request, time, sys
sys.path.insert(0, '.')
from w2t_server import _build_chop_code

MCP = "http://127.0.0.1:44444"

def td(code):
    r = urllib.request.Request(MCP+"/exec",
        data=json.dumps({"code":code}).encode(),
        headers={"Content-Type":"application/json"})
    return json.loads(urllib.request.urlopen(r, timeout=10).read())

# 1) Execute amp code
code_amp = _build_chop_code({"id":"amp","type":"slider","value":"0.85"})
r = td(code_amp)
print("AMP RESULT:", r.get("output","")[:200])
print("AMP ERR:", r.get("error","")[:200])

# 2) Execute freq code
code_freq = _build_chop_code({"id":"freq","type":"slider","value":"0.50"})
r = td(code_freq)
print("FREQ RESULT:", r.get("output","")[:200])

# 3) Check _ch_amp detail
r = td('c=op("/project1/_ch_amp");print(c!=None,c.numChans,c[0].name,c[0].vals[0])')
print("AMP:", r.get("output","")[:200])

# 4) Check mergeCHOP
r = td('c=op("/project1/neon_channels");print("Chans:",c.numChans);[print(c[i].name,c[i].vals[0]) for i in range(c.numChans)]')
print("MERGE:", r.get("output","")[:500])
print("ERR:", r.get("error","")[:200])

# 5) Check neon_out
r = td('o=op("/project1/neon_out");print("Chans:",o.numChans);[print(o[i].name,o[i].vals[0]) for i in range(o.numChans)]')
print("OUT:", r.get("output","")[:500])
