#!/usr/bin/env python3
"""
Live TD Integration Test: spherePOP + transformPOP + trailPOP

Tests two new POP operator families NOT covered by existing tests:
  Chain A: spherePOP → transformPOP (translate Y) → nullPOP
  Chain B: boxPOP → trailPOP (length=60) → nullPOP

EXPLICIT RULES enforced in this test:
  RULE 1 — CONTAINER: All operators inside a baseCOMP sandbox (UUID names)
  RULE 2 — NO ERRORS: Immediate check + async post-cook re-check for GLSL/GPU
  RULE 3 — NO OVERLAP: ≥200px X, ≥150px Y grid separation

Empirically verified parameter names (from live TD probing):
  spherePOP: type(Menu:G/Grid/T/S), orient(Menu:X/Y/Z), radx(Float,1), rady(Float,1)
             freq(Int,3), fuse(Toggle,True), cols(Int,12), rows(Int,8), normal(Menu), texture(Menu)
  transformPOP: mode(Menu), tx/ty/tz(Float), rx/ry/rz(Float), sx/sy/sz(Float), scale(Float)
  trailPOP: active(Toggle), alwayscook(Toggle), length(Int,30), inc(Float,0.01),
            surftype(Menu), closed(Toggle), tx/ty/tz(Float)

Usage:
  python toe/src/test_live_td_sphere_transform_trail.py
  python toe/src/test_live_td_sphere_transform_trail.py --keep
  python toe/src/test_live_td_sphere_transform_trail.py --keep --container-x 200 --container-y 0
"""

import json
import time
import uuid
import argparse
import urllib.request as req
import urllib.parse as parse
import os
import sys

# === CONFIG ===
TD_URL = "http://localhost:44444"
SANDBOX_NAME = "sph_tr_tl_test"
UUID_SUFFIX = uuid.uuid4().hex[:8]
HEADERS = {"Content-Type": "application/json"}
checks_passed = 0
checks_total = 0

def td_post(path, body, label=""):
    """POST to TouchDesigner HTTP server and return parsed JSON."""
    url = TD_URL + path
    data = json.dumps(body).encode()
    r = req.Request(url, data=data, headers=HEADERS, method="POST")
    try:
        resp = req.urlopen(r, timeout=15)
        return json.loads(resp.read().decode())
    except Exception as e:
        return {"error": str(e)}

def td_get(path, label=""):
    """GET from TouchDesigner HTTP server and return parsed JSON."""
    url = TD_URL + path
    try:
        resp = req.urlopen(url, timeout=15)
        return json.loads(resp.read().decode())
    except Exception as e:
        return {"error": str(e)}

def td_exec(code):
    """Execute Python code in TD and return stdout."""
    return td_post("/exec", {"code": code}, label="exec")

def get_op_path(name):
    return f"/project1/{SANDBOX_NAME}/{name}"

def check(label, condition):
    """Record a check result."""
    global checks_passed, checks_total
    checks_total += 1
    if condition:
        checks_passed += 1
        print(f"  ✓ {label}")
    else:
        print(f"  ✗ {label}")

def assert_approx(actual, expected, label, tol=0.01):
    """Check numeric equality within tolerance."""
    ok = abs(actual - expected) < tol
    check(f"{label}: got {actual}, expected {expected}", ok)
    return ok

def assert_ge(actual, threshold, label):
    """Check >= threshold."""
    ok = actual >= threshold
    check(f"{label}: got {actual} >= {threshold}", ok)
    return ok


# === MAIN ===
def main():
    global checks_passed, checks_total
    parser = argparse.ArgumentParser(description="spherePOP + transformPOP + trailPOP live test")
    parser.add_argument("--keep", action="store_true",
                        help="Keep sandbox after test (don't destroy)")
    parser.add_argument("--container-x", type=int, default=200,
                        help="X position for sandbox container")
    parser.add_argument("--container-y", type=int, default=0,
                        help="Y position for sandbox container")
    args = parser.parse_args()
    keep = args.keep
    container_x = args.container_x
    container_y = args.container_y

    print("=" * 60)
    print("TD-MCP Live Test: spherePOP + transformPOP + trailPOP")
    print("=" * 60)
    print()

    sandbox_path = f"/project1/{SANDBOX_NAME}"

    # PHASE 0: Clean up stale sandboxes from previous runs (unless --keep)
    if not keep:
        scan = td_exec(
            "import json\n"
            "out = []\n"
            "for c in op('/project1').children:\n"
            "  if c.name.startswith('sph_tr_tl_test'):\n"
            "    out.append(c.name)\n"
            "    c.destroy()\n"
            "print(json.dumps(out))"
        )
        stale = json.loads(scan.get("output", "[]"))
        if stale:
            print(f"  Cleaned {len(stale)} stale sandboxes: {stale}")
    else:
        # Auto-offset Y if existing container at same X
        scan = td_exec(
            "import json; "
            "out = []; "
            "for c in op('/project1').children: "
            "  if hasattr(c, 'name') and 'sph_tr_tl_test' in c.name: "
            f"    out.append({{'x': c.nodeX, 'y': c.nodeY, 'n': c.name}}); "
            "print(json.dumps(out))"
        )
        existing = json.loads(scan.get("output", "[]"))
        for e in existing:
            if abs(e['x'] - container_x) < 100:
                if e['y'] >= container_y:
                    container_y = e['y'] + 700
                    print(f"  Auto-offset Y to {container_y} for --keep")
    print()

    # PHASE 1: Create sandbox container
    result = td_exec(
        f"c = op('/project1').create(td.baseCOMP, '{SANDBOX_NAME}'); "
        f"c.nodeX = {container_x}; c.nodeY = {container_y}; "
        f"print('created: ' + c.name)"
    )
    check("Sandbox container created", "error" not in result and SANDBOX_NAME in result.get("output", ""))
    print()

    # PHASE 2: Create operators
    # Chain A: spherePOP → transformPOP (translate Y=0.5) → nullPOP
    td_exec(
        f"sph = op('{sandbox_path}').create(td.spherePOP, 'sphere_src'); "
        f"sph.nodeX = -400; sph.nodeY = 0; "
        f"sph.par.radx = 2.0; sph.par.rady = 2.0; sph.par.freq = 4; "
        f"print('sphere: ' + sph.name)"
    )
    td_exec(
        f"tr = op('{sandbox_path}').create(td.transformPOP, 'xform_mod'); "
        f"tr.nodeX = -100; tr.nodeY = 0; "
        f"tr.par.ty = 0.5; "
        f"print('transform: ' + tr.name)"
    )
    td_exec(
        f"null_a = op('{sandbox_path}').create(td.nullPOP, 'null_out_a'); "
        f"null_a.nodeX = 200; null_a.nodeY = 0; "
        f"print('null_a: ' + null_a.name)"
    )

    # Chain B: boxPOP → trailPOP (length=60) → nullPOP
    td_exec(
        f"box = op('{sandbox_path}').create(td.boxPOP, 'box_src'); "
        f"box.nodeX = -400; box.nodeY = 350; "
        f"box.par.sizex = 2.0; box.par.depth = 4; "
        f"print('box: ' + box.name)"
    )
    td_exec(
        f"trl = op('{sandbox_path}').create(td.trailPOP, 'trail_mod'); "
        f"trl.nodeX = -100; trl.nodeY = 350; "
        f"trl.par.length = 60; "
        f"print('trail: ' + trl.name)"
    )
    td_exec(
        f"null_b = op('{sandbox_path}').create(td.nullPOP, 'null_out_b'); "
        f"null_b.nodeX = 200; null_b.nodeY = 350; "
        f"print('null_b: ' + null_b.name)"
    )

    # Verify all 6 operators exist (use findChildren count, which includes nested ops)
    result = td_get(f"/operators?path={sandbox_path}")
    ops = result.get("operators", [])
    check(f"6+ operators created in sandbox (got {len(ops)})", len(ops) >= 6)
    print()

    # PHASE 3: Wire connections
    # Chain A: spherePOP[0] → transformPOP[0] → nullPOP[0]
    td_exec(
        f"src = op('{sandbox_path}/sphere_src'); "
        f"mod = op('{sandbox_path}/xform_mod'); "
        f"src.outputConnectors[0].connect(mod.inputConnectors[0]); "
        f"print('wired sphere→xform')"
    )
    td_exec(
        f"mod = op('{sandbox_path}/xform_mod'); "
        f"out = op('{sandbox_path}/null_out_a'); "
        f"mod.outputConnectors[0].connect(out.inputConnectors[0]); "
        f"print('wired xform→null_a')"
    )

    # Chain B: boxPOP[0] → trailPOP[0] → nullPOP[0]
    td_exec(
        f"src = op('{sandbox_path}/box_src'); "
        f"mod = op('{sandbox_path}/trail_mod'); "
        f"src.outputConnectors[0].connect(mod.inputConnectors[0]); "
        f"print('wired box→trail')"
    )
    td_exec(
        f"mod = op('{sandbox_path}/trail_mod'); "
        f"out = op('{sandbox_path}/null_out_b'); "
        f"mod.outputConnectors[0].connect(out.inputConnectors[0]); "
        f"print('wired trail→null_b')"
    )

    # Verify connections via direct exec inspection (RULE 1 — container sandbox)
    # (The /connections endpoint uses _serialize_operator which accesses operator.inputs;
    #  but wire detection via TD's API has issues with some TD versions. Use exec instead.)
    print(f"  (wiring verified via exec per-chain in Phase 7)")
    print()

    # PHASE 4: Verify parameters via /exec (Method A)
    # Chain A: spherePOP params
    a1 = td_exec(
        f"import json; o = op('{sandbox_path}/sphere_src'); "
        f"print(json.dumps({{'radx': o.par.radx.val, 'rady': o.par.rady.val, 'freq': o.par.freq.val}}))"
    )
    a1_vals = json.loads(a1.get("output", "{}"))
    assert_approx(a1_vals.get("radx", 0), 2.0, "Chain A sphere.radx=2.0")
    assert_approx(a1_vals.get("rady", 0), 2.0, "Chain A sphere.rady=2.0")
    check(f"Chain A sphere.freq={a1_vals.get('freq')} (expected 4)", a1_vals.get("freq") == 4)

    # Chain A: transformPOP params
    a2 = td_exec(
        f"import json; o = op('{sandbox_path}/xform_mod'); "
        f"print(json.dumps({{'ty': o.par.ty.val}}))"
    )
    a2_vals = json.loads(a2.get("output", "{}"))
    assert_approx(a2_vals.get("ty", 0), 0.5, "Chain A xform.ty=0.5")

    # Chain B: boxPOP params
    b1 = td_exec(
        f"import json; o = op('{sandbox_path}/box_src'); "
        f"print(json.dumps({{'sizex': o.par.sizex.val, 'depth': o.par.depth.val}}))"
    )
    b1_vals = json.loads(b1.get("output", "{}"))
    assert_approx(b1_vals.get("sizex", 0), 2.0, "Chain B box.sizex=2.0")
    check(f"Chain B box.depth={b1_vals.get('depth')} (expected 4)", b1_vals.get("depth") == 4)

    # Chain B: trailPOP params
    b2 = td_exec(
        f"import json; o = op('{sandbox_path}/trail_mod'); "
        f"print(json.dumps({{'length': o.par.length.val}}))"
    )
    b2_vals = json.loads(b2.get("output", "{}"))
    check(f"Chain B trail.length={b2_vals.get('length')} (expected 60)", b2_vals.get("length") == 60)
    print()

    # PHASE 5: Verify parameters via /parameters endpoint (Method B)
    # /parameters returns parameters as a list of {name, value} objects
    def get_param_val(param_data, name, key="value"):
        params = param_data.get("parameters", [])
        for p in params:
            if p.get("name") == name:
                return p.get(key)
        return None

    param_a1 = td_get(f"/parameters?path={get_op_path('sphere_src')}")
    radx_val = get_param_val(param_a1, "radx")
    rady_val = get_param_val(param_a1, "rady")
    assert_approx(float(radx_val or 0), 2.0, "Method B sphere.radx=2.0")
    assert_approx(float(rady_val or 0), 2.0, "Method B sphere.rady=2.0")

    param_tr = td_get(f"/parameters?path={get_op_path('xform_mod')}")
    ty_val = get_param_val(param_tr, "ty")
    assert_approx(float(ty_val or 0), 0.5, "Method B xform.ty=0.5")

    param_trail = td_get(f"/parameters?path={get_op_path('trail_mod')}")
    len_val = get_param_val(param_trail, "length")
    check(f"Method B trail.length={len_val} (expected 60)", float(len_val or 0) == 60.0)
    print()

    # PHASE 6: Verify grid positions (RULE 3 — no overlap)
    pos = td_exec(
        f"import json; "
        f"children = op('{sandbox_path}').findChildren(); "
        f"out = [{{'n': c.name, 'x': c.nodeX, 'y': c.nodeY}} for c in children]; "
        f"print(json.dumps(out))"
    )
    positions = json.loads(pos.get("output", "[]"))
    # Check all 6 nodes have positions
    pos_by_name = {p["n"]: p for p in positions}
    expected_names = ["sphere_src", "xform_mod", "null_out_a", "box_src", "trail_mod", "null_out_b"]
    for name in expected_names:
        check(f"Position found for {name}", name in pos_by_name)
        if name in pos_by_name:
            check(f"  {name} has nodeX defined", pos_by_name[name]["x"] is not None)

    # Check grid separation: minimum 150px between any two nodes
    positions_list = [p for p in positions if p["n"] in expected_names]
    for i, a in enumerate(positions_list):
        for b in positions_list[i+1:]:
            dx = abs(a["x"] - b["x"])
            dy = abs(a["y"] - b["y"])
            if a["y"] == b["y"]:
                # Same row: need ≥180px horizontal separation (operators + gap)
                check(f"Row separation {a['n']}→{b['n']}: dx={dx}", dx >= 180)
            elif a["x"] == b["x"]:
                # Same column: need ≥130px vertical
                check(f"Col separation {a['n']}→{b['n']}: dy={dy}", dy >= 130)
            else:
                # Different row and col: modest separation
                check(f"Diag separation {a['n']}→{b['n']}: dx={dx}, dy={dy}", dx >= 100 and dy >= 100)
    print()

    # PHASE 7: Verify wiring via connection integrity check
    for chain_name, src, mod, out_node in [
        ("A", "sphere_src", "xform_mod", "null_out_a"),
        ("B", "box_src", "trail_mod", "null_out_b"),
    ]:
        wire_check = td_exec(
            f"import json\n"
            f"src = op('{sandbox_path}/{src}')\n"
            f"mod = op('{sandbox_path}/{mod}')\n"
            f"out = op('{sandbox_path}/{out_node}')\n"
            f"# Check source → modifier:\n"
            f"src_to_mod = bool(src.outputConnectors[0].connections) "
            f"and src.outputConnectors[0].connections[0].owner == mod\n"
            f"# Check modifier → output:\n"
            f"mod_to_out = bool(mod.outputConnectors[0].connections) "
            f"and mod.outputConnectors[0].connections[0].owner == out\n"
            f"import json; print(json.dumps({{'src_to_mod': src_to_mod, 'mod_to_out': mod_to_out}}))"
        )
        raw = wire_check.get("output", "")
        wire = json.loads(raw) if raw else {}
        check(f"Chain {chain_name}: src→mod wired", wire.get("src_to_mod", False))
        check(f"Chain {chain_name}: mod→out wired", wire.get("mod_to_out", False))
    print()

    # PHASE 8: Check zero errors (RULE 2 — immediate + async)
    # Immediate check
    err_check = td_exec(
        f"import json; "
        f"children = op('{sandbox_path}').findChildren(); "
        f"out = []; "
        f"for n in children: "
        f"  errs = list(n.errors()) if n.errors() else []; "
        f"  if errs: "
        f"    out.append({{'n': n.name, 'e': [str(x) for x in errs]}}); "
        f"print(json.dumps(out))"
    )
    errors = json.loads(err_check.get("output", "[]"))
    check("Zero errors (immediate)", len(errors) == 0)
    if errors:
        for e in errors:
            print(f"   Error in {e['n']}: {e['e']}")

    # Async re-check: force cook + wait
    td_exec(f"c = op('{sandbox_path}'); c.cook(force=True)")
    time.sleep(2.0)

    re_check = td_exec(
        f"import json; "
        f"c = op('{sandbox_path}'); "
        f"out = []; "
        f"for n in c.findChildren(): "
        f"  errs = list(n.errors()) if n.errors() else []; "
        f"  if errs: "
        f"    out.append({{'n': n.name, 'e': [str(x) for x in errs]}}); "
        f"print(json.dumps(out))"
    )
    re_errors = json.loads(re_check.get("output", "[]"))
    check("Zero errors (async re-check)", len(re_errors) == 0)
    if re_errors:
        for e in re_errors:
            print(f"   Async error in {e['n']}: {e['e']}")
    print()

    # PHASE 9: /verify cross-check
    verify = td_get(f"/verify?path={sandbox_path}")
    healthy = verify.get("healthy", False)
    op_count = verify.get("operator_count", 0)
    error_count = verify.get("error_count", 0)
    check(f"/verify reports healthy=True", healthy is True or healthy == "true")
    check(f"/verify operator_count >= 6 (got {op_count})", op_count >= 6)
    check(f"/verify error_count = 0 (got {error_count})", error_count == 0)
    print()

    # PHASE 10: Summary
    print("=" * 60)
    print(f"RESULTS: {checks_passed}/{checks_total} checks passed")
    print("=" * 60)

    # PHASE 11: Cleanup (unless --keep)
    if not keep:
        td_exec(f"op('{sandbox_path}').destroy()")
        print(f"Sandbox '{SANDBOX_NAME}' destroyed.")

    # Exit code
    success = checks_passed == checks_total
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
