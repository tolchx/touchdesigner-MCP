#!/usr/bin/env python3
"""SOLVE: Use constantCHOP + channel renaming for dashboard data.
Alternative: just use constantCHOP and let users access channels by index.
"""
import json, urllib.request, time, sys

MCP = "http://127.0.0.1:44444"
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

# ═══════════════════════════════════════════════════
# STEP 1: Clean up
# ═══════════════════════════════════════════════════
print("=== CLEANUP ===")
td('for n in ["neon_channels","neon_out","_test_nc"]: o=op("/project1/"+n);o.destroy()')

# ═══════════════════════════════════════════════════
# STEP 2: Create constantCHOP with 20 channels
# ═══════════════════════════════════════════════════
print("\n=== CREATE constantCHOP ===")
# A constantCHOP has par.value0 through par.value19 (default 10, but up to 40+)
r = td(
    'c=op("/project1").create(td.constantCHOP,"_test_nc");'
    'c.nodeX=-400;c.nodeY=300;'
    'print("Chans:",c.numChans);'
    '[print("  ch["+str(i)+"] name="+c[i].name) for i in range(c.numChans)]'
)
print(r.get("output","")[:400])
if r.get("error"): print("ERR:", r.get("error","")[:200])

# ═══════════════════════════════════════════════════
# STEP 3: Set a value and try to rename channel
# ═══════════════════════════════════════════════════
print("\n=== SET values & RENAME channels ===")
r = td(
    'c=op("/project1/_test_nc");'
    'c.par.value0=0.85;'
    'print("Set val0:",c.par.value0.eval());'
    '# Try to rename channel 0'
    'try:'
    ' c[0].name="amp";'
    ' print("Renamed ch0 to:",c[0].name);'
    'except Exception as e:'
    ' print("Rename failed:",str(e));'
    'c.cook(force=True);'
    '[print("  ch["+str(i)+"] "+c[i].name+"="+str(c[i].vals[0])) for i in range(c.numChans)]'
)
print(r.get("output","")[:500])
print("ERR:", r.get("error","")[:200])

# ═══════════════════════════════════════════════════
# STEP 4: Try number of channels
# ═══════════════════════════════════════════════════
print("\n=== Check constantCHOP capabilities ===")
r = td(
    'c=op("/project1/_test_nc");'
    'print("Max chans?",c.numChans);'
    'c.par.value10=0.5;' if False else td(
    'print("Setting value10")'
))
# Just check what we have
r = td(
    'c=op("/project1/_test_nc");'
    'c.par.value10=0.5;'
)
# Let me just try different things
print("\n=== FALLBACK: direct value set ===")
r = td(
    'c=op("/project1/_test_nc");'
    'c.par.value0=0.85;c.par.value1=0.5;c.par.value2=0.3;c.par.value3=2.0;c.par.value4=1.0;'
    'c.cook(force=True);'
    'print("Chans:",c.numChans);'
    '[print("  ch["+str(i)+"] name="+c[i].name+" val="+str(c[i].vals[0])) for i in range(min(c.numChans,10))]'
)
print(r.get("output","")[:500])
print("ERR:", r.get("error","")[:200])

# ═══════════════════════════════════════════════════
# STEP 5: Check if we can rename channels
# ═══════════════════════════════════════════════════
print("\n=== Try renaming channels ===")
r = td(
    'c=op("/project1/_test_nc");'
    '# Try different rename approaches'
    'import sys;'
    'print("Has channels attr:",hasattr(c,"channels"));'
    'print("Chan0 type:",type(c[0]));'
    'print("Chan0 dir:",[a for a in dir(c[0]) if not a.startswith("_")][:20]);'
)
print(r.get("output","")[:500])
print("ERR:", r.get("error","")[:200])

# ═══════════════════════════════════════════════════
# STEP 6: Check if we can use appendChan on constantCHOP
# ═══════════════════════════════════════════════════
print("\n=== Try appendChan on constantCHOP ===")
r = td(
    'c=op("/project1/_test_nc");'
    'try:'
    ' idx=c.appendChan("amp");'
    ' print("appendChan OK:",idx);'
    ' c[idx]=0.85;'
    ' c.cook(force=True);'
    ' [print("  ch["+str(i)+"] "+c[i].name+"="+str(c[i].vals[0])) for i in range(c.numChans)]'
    'except Exception as e:'
    ' print("appendChan failed:",str(e));'
)
print(r.get("output","")[:500])
print("ERR:", r.get("error","")[:200])

# ═══════════════════════════════════════════════════
# STEP 7: What if we use a mergeCHOP of many constantCHOPs?
# Each constantCHOP is one "named" channel
# ═══════════════════════════════════════════════════
print("\n=== MergeCHOP approach ===")
td('for n in ["_ca","_cf","_cs","_cm"]: o=op("/project1/"+n);o.destroy()')
# Create 3 single-value constantCHOPs
r = td(
    'a=op("/project1").create(td.constantCHOP,"_ca");'
    'a.par.value0=0.85;a.nodeX=-800;a.nodeY=100;'
    'f=op("/project1").create(td.constantCHOP,"_cf");'
    'f.par.value0=0.50;f.nodeX=-800;f.nodeY=200;'
    's=op("/project1").create(td.constantCHOP,"_cs");'
    's.par.value0=0.30;s.nodeX=-800;s.nodeY=300;'
    'print("Created 3 constantCHOPs");'
)
print("Create:", r.get("output","")[:200], r.get("error","")[:200])

# Create mergeCHOP
r = td(
    'm=op("/project1").create(td.mergeCHOP,"_cm");'
    'm.nodeX=-600;m.nodeY=200;'
    # Wire all three
    'op("/project1/_ca").outputConnectors[0].connect(m);'
    'op("/project1/_cf").outputConnectors[0].connect(m);'
    'op("/project1/_cs").outputConnectors[0].connect(m);'
    'print("Merged!");'
    'm.cook(force=True);'
    'print("Chans:",m.numChans);'
    '[print("  ch["+str(i)+"] "+m[i].name+"="+str(m[i].vals[0])) for i in range(m.numChans)]'
)
print("Merge:", r.get("output","")[:500])
print("ERR:", r.get("error","")[:200])

# ═══════════════════════════════════════════════════
# STEP 8: Cleanup
# ═══════════════════════════════════════════════════
print("\n=== Cleanup ===")
td('for n in ["_test_nc","_ca","_cf","_cs","_cm"]: o=op("/project1/"+n);o.destroy()')
print("Done")
