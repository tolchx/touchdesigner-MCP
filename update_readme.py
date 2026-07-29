#!/usr/bin/env python3
"""Update neon_readme textDAT with full pipeline documentation."""
import json, urllib.request, sys

MCP = "http://127.0.0.1:44444"

def td(code, retries=5):
    for i in range(retries):
        try:
            r = urllib.request.Request(
                MCP + "/exec",
                data=json.dumps({"code": code}).encode(),
                headers={"Content-Type": "application/json"},
            )
            return json.loads(urllib.request.urlopen(r, timeout=10).read())
        except Exception as e:
            if i < retries - 1:
                import time
                time.sleep(1)
            else:
                return {"output": "", "error": str(e)}

# Verify MCP alive
try:
    r = urllib.request.urlopen("http://127.0.0.1:44444/info", timeout=5)
    print(f"MCP OK: {json.loads(r.read()).get('projectFPS','?')} FPS")
except Exception as e:
    print(f"MCP DEAD: {e}")
    sys.exit(1)

README_TEXT = """Web2Touch — NEON Data Pipeline
═══════════════════════════════════════════════════════

DATA FLOW
─────────
  Dashboard (web)
    │  WebSocket :8090
    ▼
  w2t_server.py
    │  MCP /exec :44444
    ▼
  TouchDesigner /project1
    ├── neon_values  (tableDAT — stores all values as rows)
    └── _ch_{id}     (constantCHOP — one per dashboard channel)
            │
            ▼
       neon_channels (mergeCHOP — combines all constantCHOPs)
            │
            ▼
       neon_out      (nullCHOP — final CHOP output)


CHANNEL NAMING (important!)
════════════════════════════

Each dashboard widget (slider, toggle, knob, xypad) creates a
constantCHOP with one channel named "chan1".  The channel name
CANNOT be changed because CHOPChannel.name is read-only in this
TouchDesigner version.

When merged into neon_channels, the mergeCHOP auto-renames
duplicates sequentially in CONNECTION ORDER (first widget to
send data = chan1, second = chan2, …):

  _ch_amp       →  chan1   (first widget connected)
  _ch_freq      →  chan2   (second widget connected)
  _ch_speed     →  chan3
  _ch_size      →  chan4
  _ch_fx        →  chan5
  _ch_canvas.u  →  chan6
  _ch_canvas.v  →  chan7

The order is fixed after the widget sends its first message.
Old channels keep their index; new widgets are appended at end.


RENAMING CHANNELS with renameCHOP (optional)
═════════════════════════════════════════════

To give channels meaningful names (e.g. amp, freq, speed):

  Manual (in network editor):
    1. Create renameCHOP (⇧R)
    2. Wire: neon_out → renameCHOP
    3. In renameCHOP parameters, set:
         Rename 0 From:  chan1
         Rename 0 To:    amp
         Rename 1 From:  chan2
         Rename 1 To:    freq
       (one pair per channel)

  Python (via Text DAT or Execute DAT):
    r = op('/project1').create(td.renameCHOP, 'neon_renamed')
    op('/project1/neon_out').outputConnectors[0].connect(r)
    r.par.from0 = 'chan1'
    r.par.to0 = 'amp'
    r.par.from1 = 'chan2'
    r.par.to1 = 'freq'
    r.par.from2 = 'chan3'
    r.par.to2 = 'speed'


  Dynamic mapping (if channels change over time):
    r = op('/project1').create(td.renameCHOP, 'neon_renamed')
    op('/project1/neon_out').outputConnectors[0].connect(r)
    for i in range(op('/project1/neon_out').numChans):
        r.par['from' + str(i)] = 'chan' + str(i + 1)
        r.par['to' + str(i)] = 'chan_' + str(i + 1)


ACCESSING DATA IN TOUCHDESIGNER
═══════════════════════════════

  Via CHOP (neon_out):
    op('/project1/neon_out')[0]                 → ch0 value
    op('/project1/neon_out')['chan1']            → value by name
    op('/project1/neon_out').numChans            → active channels

  Via Table (neon_values):
    op('/project1/neon_values')[r, 0].val       → channel ID from row r
    op('/project1/neon_values')[r, 2].val       → value from row r
    op('/project1/neon_values').numRows - 1     → total channels


OPERATORS IN /project1
══════════════════════

  neon_values      textDAT      — stores all data (id, type, value, ts)
  neon_channels    mergeCHOP    — merges all constantCHOPs
  neon_out         nullCHOP     — final output (connect here)
  _ch_{id}         constantCHOP — one per dashboard widget (created on 1st msg)
  neon_readme      textDAT      — this document


TROUBLESHOOTING
═══════════════

  1. neon_out shows 0 channels:
     - Is w2t_server running? http://localhost:8090
     - Is MCP running? http://localhost:44444/info
     - Has the dashboard sent at least one message?
     - Run the build script: python build_chop_final.py

  2. Specific _ch_{id} missing:
     - Dashboard must send a message with that ID
     - Check neon_values table for the ID (use OP Viewer)

  3. Values not updating:
     - Each constantCHOP auto-cooks on par.value0 change
     - Force cook: c.cook(force=True) in /exec

  4. Dashboard not connecting (WS):
     - Open http://localhost:8090/dashboard.html
     - Status badge should show green "Connected"
     - Check w2t_server.log for errors
"""

# Create or update neon_readme
r = td(
    'o = op("/project1/neon_readme");'
    "if not o:"
    "    o = op('/project1').create(td.textDAT, 'neon_readme')"
    "    o.nodeX = -400"
    "    o.nodeY = 500"
    "o.text = " + json.dumps(README_TEXT) + ";"
    'print("Updated! Lines:", o.text.count(chr(10)) + 1)'
)

out = r.get("output", "")
err = r.get("error", "")
if out:
    print("Result:", out[:200])
if err:
    print("ERROR:", err[:200])

# Verify output
r = td('o = op("/project1/neon_readme"); print(o.text[:100]) if o else print("N/A")')
print("Verification:", r.get("output", "")[:150])
