"""
Clean test for api_patagonia network in TouchDesigner.
Verifies: operators, custom params, data delivery, CHOP channels, healthcheck.
All paths use absolute /project1/api_patagonia/...
"""
import json
import time

base = op("/project1/api_patagonia")
if base is None:
    print("ERROR: /project1/api_patagonia not found!")
else:
    # ============================================================
    # 1. OPERATORS
    # ============================================================
    print("=== 1. OPERATORS ({}) ===".format(len(base.children)))
    for child in base.children:
        print("  {:25s} {}".format(child.name, child.type))

    # ============================================================
    # 2. CUSTOM PARAMETERS
    # ============================================================
    print("\n=== 2. CUSTOM PARAMETERS ===")
    params_ok = True
    for pname in ["Pollsec", "Location", "Autofetch", "Lastfetch"]:
        try:
            val = getattr(base.par, pname).eval()
            print("  {:20s} = {}".format(pname, val))
        except Exception as e:
            print("  {:20s} MISSING: {}".format(pname, e))
            params_ok = False

    # ============================================================
    # 3. TRIGGER FETCH (force by resetting timestamp)
    # ============================================================
    print("\n=== 3. TRIGGERING FETCH ===")
    try:
        base.par.Lastfetch.val = 0
    except:
        pass
    t0 = time.time()
    try:
        exec(op("/project1/api_patagonia/fetch_apis_script").text)
        elapsed = round(time.time() - t0, 1)
        print("  Fetch completed in {}s".format(elapsed))
    except Exception as e:
        elapsed = round(time.time() - t0, 1)
        print("  FETCH ERROR ({}s): {}".format(elapsed, e))

    # ============================================================
    # 4. TABLE DATS — verify real data arrived
    # ============================================================
    print("\n=== 4. TABLE DATS ===")
    tbl_names = ["tbl_weather", "tbl_marine", "tbl_air_quality",
                 "tbl_seismic", "tbl_geomagnetic", "tbl_astronomy"]
    for name in tbl_names:
        tbl = op("/project1/api_patagonia/" + name)
        if tbl:
            rows = tbl.numRows
            has_data = rows > 2
            val_preview = ""
            if rows > 2:
                val_preview = str(tbl[1, 1])[:40]
            print("  {:25s} rows={:>2d} {}".format(
                name, rows, "[DATA] " + val_preview if has_data else "[EMPTY]"))

    # ============================================================
    # 5. OUT_DATA CHOP — verify channels have real values
    # ============================================================
    print("\n=== 5. OUT_DATA CHOP ===")
    out = op("/project1/api_patagonia/out_data")
    if out:
        try:
            chans = list(out.chans())
            print("  {} channels:".format(len(chans)))
            for ch in chans:
                val = ch[0] if ch[0] is not None else 0
                print("    {:25s} = {}".format(ch.name, round(val, 4)))
        except Exception as e:
            print("  ERROR reading channels: {}".format(e))
    else:
        print("  out_data CHOP not found!")

    # ============================================================
    # 6. STATUS
    # ============================================================
    print("\n=== 6. STATUS ===")
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
                for e in errors:
                    print("  ERROR: {}".format(e))
            else:
                print("  errors: NONE")
        except Exception as e:
            print("  Parse error: {}".format(e))

    # ============================================================
    # 7. HEALTHCHECK
    # ============================================================
    print("\n=== 7. HEALTHCHECK ===")
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
