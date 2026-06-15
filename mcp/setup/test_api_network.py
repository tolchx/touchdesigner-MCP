"""
Test script for api_patagonia network.
Checks: operator positions, table data, custom parameters, triggers fetch.
"""
import json
import time

base = op("/project1/api_patagonia")
if base is None:
    print("ERROR: api_patagonia not found!")
else:
    print("=== OPERATORS & POSITIONS ===")
    for child in base.children:
        try:
            x = child.par.x.eval() if hasattr(child.par, "x") else "N/A"
            y = child.par.y.eval() if hasattr(child.par, "y") else "N/A"
            print("  {:25s} {:20s} pos=({}, {})".format(child.name, child.type, x, y))
        except:
            print("  {:25s} {:20s} pos=(?)".format(child.name, child.type))

    print("\n=== TABLE DATS ===")
    for name in ["tbl_weather", "tbl_marine", "tbl_air_quality", "tbl_seismic", "tbl_geomagnetic", "tbl_astronomy"]:
        tbl = op("api_patagonia/" + name)
        if tbl:
            rows = tbl.numRows
            cols = tbl.numCols
            sample = ""
            if rows > 1 and cols > 1:
                sample = str(tbl[1, 1])[:60] if tbl[1, 1] else ""
            print("  {:25s} rows={} cols={} sample='{}'".format(name, rows, cols, sample))

    print("\n=== LAST STATUS ===")
    status = op("api_patagonia/last_status")
    if status:
        print(status.text[:600])

    print("\n=== CUSTOM PARAMETERS ===")
    try:
        print("  Pollsec:     {}".format(base.par.Pollsec.eval()))
        print("  Location:    {}".format(base.par.Location.eval()))
        print("  Autofetch:   {}".format(base.par.Autofetch.eval()))
        print("  Lastfetch:   {}".format(base.par.Lastfetch.eval()))
    except Exception as e:
        print("  Error: {}".format(e))

    print("\n=== TRIGGERING MANUAL FETCH ===")
    try:
        base.par.Lastfetch.val = 0
        exec(op("api_patagonia/fetch_apis_script").text)
        print("  Fetch completed!")
    except Exception as e:
        print("  Fetch error: {}".format(e))

    print("\n=== DATA AFTER FETCH ===")
    for name in ["tbl_weather", "tbl_marine", "tbl_air_quality", "tbl_seismic", "tbl_geomagnetic", "tbl_astronomy"]:
        tbl = op("api_patagonia/" + name)
        if tbl:
            rows = tbl.numRows
            sample = ""
            if rows > 1 and cols > 1:
                sample = str(tbl[1, 1])[:60] if tbl[1, 1] else ""
            print("  {:25s} rows={} sample='{}'".format(name, rows, sample))

    print("\n=== OUT_DATA CHOP ===")
    out = op("api_patagonia/out_data")
    if out:
        try:
            for ch in out.chans():
                print("  {:25s} = {}".format(ch.name, ch[0]))
        except:
            print("  (could not read channels)")

    print("\n=== HEALTHCHECK ===")
    errors = 0
    for child in base.children:
        try:
            e = child.errors()
            if e:
                print("  ERROR on {}: {}".format(child.name, str(e)[:100]))
                errors += 1
        except:
            pass
    if errors == 0:
        print("  All operators clean - no errors!")

print("\n=== TEST COMPLETE ===")
