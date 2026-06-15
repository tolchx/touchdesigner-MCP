"""
Fix fetch script references and re-deploy api_patagonia network.
Uses absolute paths (/project1/api_patagonia/...) for all op() references.
Also organizes DAT display and verifies data flow.
"""
import json
import time

# ================================================================
# STEP 1: Fix fetch_apis_script op() references to use absolute paths
# ================================================================
fetch_dat = op("/project1/api_patagonia/fetch_apis_script")
if fetch_dat is None:
    print("ERROR: fetch_apis_script not found!")
else:
    old_text = fetch_dat.text
    # Replace relative paths with absolute paths
    new_text = old_text.replace('op("api_patagonia/', 'op("/project1/api_patagonia/')
    new_text = new_text.replace("op('api_patagonia/", "op('/project1/api_patagonia/")
    if new_text != old_text:
        fetch_dat.text = new_text
        print("[FIX] Updated op() paths in fetch_apis_script to absolute")
    else:
        print("[FIX] Paths already absolute (or no changes needed)")

# ================================================================
# STEP 2: Fix on_frame Execute DAT references
# ================================================================
on_frame = op("/project1/api_patagonia/on_frame")
if on_frame:
    old = on_frame.text
    new = old.replace('op("api_patagonia/', 'op("/project1/api_patagonia/')
    if new != old:
        on_frame.text = new
        print("[FIX] Updated op() paths in on_frame Execute DAT")
    else:
        print("[FIX] on_frame paths already OK")

# ================================================================
# STEP 3: Fix manual_fetch Execute DAT references
# ================================================================
manual = op("/project1/api_patagonia/manual_fetch")
if manual:
    old = manual.text
    new = old.replace('op("api_patagonia/', 'op("/project1/api_patagonia/')
    if new != old:
        manual.text = new
        print("[FIX] Updated op() paths in manual_fetch Execute DAT")
    else:
        print("[FIX] manual_fetch paths already OK")

# ================================================================
# STEP 4: Verify all operators exist
# ================================================================
print("\n=== OPERATOR CHECK ===")
base = op("/project1/api_patagonia")
if base:
    for child in base.children:
        print("  {:25s} {:20s}".format(child.name, child.type))

# ================================================================
# STEP 5: Test fetch with fixed paths
# ================================================================
print("\n=== TRIGGERING FETCH ===")
base.par.Lastfetch.val = 0
t0 = time.time()
try:
    exec(fetch_dat.text)
    elapsed = round(time.time() - t0, 1)
    print("[FETCH] Completed in {}s".format(elapsed))
except Exception as e:
    elapsed = round(time.time() - t0, 1)
    print("[FETCH] ERROR ({}s): {}".format(elapsed, e))
    import traceback
    traceback.print_exc()

# ================================================================
# STEP 6: Verify Table DATs have data
# ================================================================
print("\n=== TABLE DATS ===")
for name in ["tbl_weather", "tbl_marine", "tbl_air_quality",
             "tbl_seismic", "tbl_geomagnetic", "tbl_astronomy"]:
    tbl = op("/project1/api_patagonia/" + name)
    if tbl:
        rows = tbl.numRows
        has_data = rows > 2
        first_key = tbl[1, 0] if rows > 1 else ""
        first_val = str(tbl[1, 1])[:40] if rows > 1 and cols_check else ""
        print("  {:25s} rows={:>2d} {} key='{}' val='{}'".format(
            name, rows, "[DATA]" if has_data else "[EMPTY]",
            first_key, first_val))

# ================================================================
# STEP 7: Check out_data CHOP
# ================================================================
print("\n=== OUT_DATA CHOP ===")
out = op("/project1/api_patagonia/out_data")
if out:
    try:
        chans = list(out.chans())
        print("  Channels: {}".format(len(chans)))
        for ch in chans:
            print("    {:25s} = {}".format(ch.name, round(ch[0], 4)))
    except Exception as e:
        print("  Error reading channels: {}".format(e))
else:
    print("  out_data not found — checking alternate paths...")
    # Try to find it
    for child in base.children:
        if "out" in child.name.lower() or "data" in child.name.lower():
            print("  Found: {} ({})".format(child.path, child.type))

# ================================================================
# STEP 8: Status
# ================================================================
print("\n=== STATUS ===")
status = op("/project1/api_patagonia/last_status")
if status:
    try:
        s = json.loads(status.text)
        print("  last_fetch: {}".format(s.get("last_fetch")))
        print("  fetch_count: {}".format(s.get("fetch_count")))
        print("  elapsed: {}s".format(s.get("elapsed_sec")))
        print("  sources_ok: {}".format(s.get("sources_ok")))
        errors = s.get("errors", [])
        if errors:
            print("  ERRORS ({}):".format(len(errors)))
            for e in errors:
                print("    - {}".format(e))
        else:
            print("  errors: NONE")
    except Exception as e:
        print("  Status parse error: {}".format(e))
        print("  Raw: {}".format(status.text[:200]))

# ================================================================
# STEP 9: Healthcheck
# ================================================================
print("\n=== HEALTHCHECK ===")
issues = 0
for child in base.children:
    try:
        errs = child.errors()
        if errs:
            print("  ERROR {:20s}: {}".format(child.name, str(errs)[:80]))
            issues += 1
    except:
        pass
if issues == 0:
    print("  All operators clean!")

print("\n=== TEST COMPLETE ===")
