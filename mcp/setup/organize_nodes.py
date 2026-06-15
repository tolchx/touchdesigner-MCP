"""
Organize node positions in api_patagonia Base COMP.
Lays out operators in a logical grid pattern.
"""
import json

base = op("/project1/api_patagonia")
if base is None:
    print("ERROR: api_patagonia not found!")
else:
    # Define logical layout positions
    # Row 0: Config (left)
    # Row 1: Table DATs (middle, spread horizontally)
    # Row 2: Scripts and Execute DATs
    # Row 3: Output CHOP

    positions = {
        # Config & Status (left column)
        "config":           (0, 0),
        "last_status":      (0, 1),
        "fetch_apis_script":(0, 2),
        "on_frame":         (0, 3),
        "manual_fetch":     (0, 4),

        # Table DATs (spread across row 0, y offset -1)
        "tbl_weather":      (1, 0),
        "tbl_marine":       (2, 0),
        "tbl_air_quality":  (3, 0),
        "tbl_seismic":      (4, 0),
        "tbl_geomagnetic":  (5, 0),
        "tbl_astronomy":    (6, 0),

        # Output
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
                    print("  Could not set position for:", name)

    print("Organized {} / {} operators".format(placed, len(base.children)))
    print("Layout: config(left) | tables(spread top) | output(center bottom)")
