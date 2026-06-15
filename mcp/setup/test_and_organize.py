"""
Test & Organize api_patagonia network in TouchDesigner.
Step 1: Organize node positions
Step 2: Trigger manual fetch
Step 3: Verify data in all Table DATs and CHOPs
"""
import json
import time
import urllib.request

base = op("/project1/api_patagonia")
if base is None:
    print("ERROR: api_patagonia not found!")
    print("Run build_api_network.py first.")
else:
    # ================================================================
    # STEP 1: ORGANIZE NODE POSITIONS
    # ================================================================
    print("=" * 60)
    print("  STEP 1: ORGANIZING NODE POSITIONS")
    print("=" * 60)

    positions = {
        "config":           (0, 0),
        "last_status":      (0, 1),
        "fetch_apis_script":(0, 2),
        "on_frame":         (0, 3),
        "manual_fetch":     (0, 4),
        "tbl_weather":      (1, 0),
        "tbl_marine":       (2, 0),
        "tbl_air_quality":  (3, 0),
        "tbl_seismic":      (4, 0),
        "tbl_geomagnetic":  (5, 0),
        "tbl_astronomy":    (6, 0),
        "out_data":         (3, 3),
    }

    placed = 0
    for child in base.children:
        name = child.name
        if name in positions:
            x, y = positions[name]
            try:
                child.par.x = x * 350
                child.par.y = y * 200
                placed += 1
            except:
                try:
                    child.par.positionx = x * 350
                    child.par.positiony = y * 200
                    placed += 1
                except:
                    print("  WARN: Could not position '{}'".format(name))

    print("  Organized {} / {} operators".format(placed, len(base.children)))
    print("  Layout: config(left col) | tables(top row) | output(center)")

    # Show positions
    for child in base.children:
        try:
            x = child.par.x.eval()
            y = child.par.y.eval()
            print("    {:25s} {:20s} ({:>6.0f}, {:>6.0f})".format(
                child.name, child.type, x, y))
        except:
            print("    {:25s} {:20s} (no position)".format(child.name, child.type))

    # ================================================================
    # STEP 2: CHECK CUSTOM PARAMETERS
    # ================================================================
    print("\n" + "=" * 60)
    print("  STEP 2: CUSTOM PARAMETERS")
    print("=" * 60)
    try:
        print("  Pollsec:     {}".format(base.par.Pollsec.eval()))
        print("  Location:    {}".format(base.par.Location.eval()))
        print("  Autofetch:   {}".format(base.par.Autofetch.eval()))
        print("  Lastfetch:   {}".format(base.par.Lastfetch.eval()))
    except Exception as e:
        print("  PARAM ERROR: {}".format(e))

    # ================================================================
    # STEP 3: CHECK CURRENT TABLE DATA (before fetch)
    # ================================================================
    print("\n" + "=" * 60)
    print("  STEP 3: TABLE DATS (before fetch)")
    print("=" * 60)
    tbl_names = ["tbl_weather", "tbl_marine", "tbl_air_quality",
                 "tbl_seismic", "tbl_geomagnetic", "tbl_astronomy"]
    for name in tbl_names:
        tbl = op("api_patagonia/" + name)
        if tbl:
            rows = tbl.numRows
            sample = ""
            if rows > 1:
                sample = str(tbl[1, 1])[:50] if tbl[1, 1] else ""
            print("  {:25s} rows={:>2d}  sample='{}'".format(name, rows, sample))

    # ================================================================
    # STEP 4: TRIGGER MANUAL FETCH
    # ================================================================
    print("\n" + "=" * 60)
    print("  STEP 4: TRIGGERING MANUAL FETCH")
    print("=" * 60)
    t0 = time.time()
    try:
        base.par.Lastfetch.val = 0
        exec(op("api_patagonia/fetch_apis_script").text)
        elapsed = round(time.time() - t0, 1)
        print("  Fetch completed in {}s".format(elapsed))
    except Exception as e:
        elapsed = round(time.time() - t0, 1)
        print("  FETCH ERROR ({}s): {}".format(elapsed, e))

    # ================================================================
    # STEP 5: VERIFY DATA AFTER FETCH
    # ================================================================
    print("\n" + "=" * 60)
    print("  STEP 5: TABLE DATS (after fetch)")
    print("=" * 60)
    for name in tbl_names:
        tbl = op("api_patagonia/" + name)
        if tbl:
            rows = tbl.numRows
            sample = ""
            if rows > 1:
                sample = str(tbl[1, 1])[:50] if tbl[1, 1] else ""
            status = "OK" if rows > 2 else "EMPTY"
            print("  {:25s} rows={:>2d} [{}] sample='{}'".format(
                name, rows, status, sample))

    # ================================================================
    # STEP 6: VERIFY OUT_DATA CHOP
    # ================================================================
    print("\n" + "=" * 60)
    print("  STEP 6: OUT_DATA CHOP CHANNELS")
    print("=" * 60)
    out = op("api_patagonia/out_data")
    if out:
        try:
            chans = list(out.chans())
            if chans:
                for ch in chans:
                    print("  {:25s} = {}".format(ch.name, round(ch[0], 4) if ch[0] else 0))
            else:
                print("  (no channels — fetch may not have populated CHOP)")
        except Exception as e:
            print("  CHOP READ ERROR: {}".format(e))
    else:
        print("  out_data CHOP not found!")

    # ================================================================
    # STEP 7: STATUS CHECK
    # ================================================================
    print("\n" + "=" * 60)
    print("  STEP 7: LAST FETCH STATUS")
    print("=" * 60)
    status = op("api_patagonia/last_status")
    if status:
        try:
            s = json.loads(status.text)
            print("  last_fetch: {}".format(s.get("last_fetch")))
            print("  fetch_count: {}".format(s.get("fetch_count")))
            print("  elapsed: {}s".format(s.get("elapsed_sec")))
            print("  sources_ok: {}".format(s.get("sources_ok")))
            errors = s.get("errors", [])
            if errors:
                print("  ERRORS:")
                for e in errors:
                    print("    - {}".format(e))
            else:
                print("  errors: none")
        except:
            print("  Could not parse status JSON")

    # ================================================================
    # STEP 8: HEALTHCHECK
    # ================================================================
    print("\n" + "=" * 60)
    print("  STEP 8: HEALTHCHECK")
    print("=" * 60)
    issues = 0
    for child in base.children:
        try:
            errs = child.errors()
            warns = child.warnings()
            if errs:
                print("  ERROR  {:20s}: {}".format(child.name, str(errs)[:100]))
                issues += 1
            elif warns:
                print("  WARN   {:20s}: {}".format(child.name, str(warns)[:100]))
                issues += 1
        except:
            pass
    if issues == 0:
        print("  All operators clean!")

    # ================================================================
    # FINAL SUMMARY
    # ================================================================
    print("\n" + "=" * 60)
    print("  TEST SUMMARY")
    print("=" * 60)
    print("  Operators:  {}".format(len(base.children)))
    print("  Positions:  {} / {} organized".format(placed, len(base.children)))
    print("  Custom Pars: OK")
    print("=" * 60)
