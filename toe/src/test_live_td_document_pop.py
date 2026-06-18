#!/usr/bin/env python3
"""
Live TD Integration Test: POST /document with POP Network
=========================================================

Validates the POST /document endpoint by creating a 3-chain POP network inside
an isolated sandbox and confirming the returned documentation structure matches
the actual operator topology.

EXPLICIT RULES enforced in this test:
  RULE 1 — CONTAINER: All operators inside a baseCOMP sandbox (UUID names)
  RULE 2 — NO ERRORS: Immediate check + async post-cook re-check for GLSL/GPU
  RULE 3 — NO OVERLAP: ≥200px X, ≥150px Y grid separation

Network topology:
  Chain A (standard POP): boxPOP → noisePOP → particlePOP → nullPOP
  Chain B (simple POP):   circlePOP → nullPOP
  Chain C (advanced POP): spherePOP → transformPOP → trailPOP → nullPOP

  Total: 12 nodes, 7 connections, all POP family.

POP parameter names (empirically verified — docs are frequently wrong):
  boxPOP:        sizex, depth
  noisePOP:      amp0, harmon (Int!)
  particlePOP:   birthrate, maxparticles
  circlePOP:     radx, rady
  spherePOP:     radx, rady, freq
  transformPOP:  ty (ty=0.5 translates Y)
  trailPOP:      length (Int)

Usage:
  python toe/src/test_live_td_document_pop.py
  python toe/src/test_live_td_document_pop.py --keep
  python toe/src/test_live_td_document_pop.py --keep --container-x 200 --container-y 0
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
SANDBOX_NAME = "doc_pop_test"
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


def td_get(path):
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
        print(f"  \u2713 {label}")
    else:
        print(f"  \u2717 {label}")


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


def assert_in(key, container, label):
    """Check key is in container (dict keys or list)."""
    if isinstance(container, dict):
        ok = key in container
    else:
        ok = key in container
    check(f"{label}: '{key}' present ({'yes' if ok else 'no'})", ok)
    return ok


def get_param_val(param_data, name, key="value"):
    """Find param by name in /parameters list (which is an array, not dict)."""
    for p in param_data.get("parameters", []):
        if p.get("name") == name:
            return p.get(key)
    return None


# === MAIN ===
def main():
    global checks_passed, checks_total
    parser = argparse.ArgumentParser(
        description="POST /document endpoint test with POP network"
    )
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
    print("TD-MCP Live Test: POST /document with POP Network")
    print("=" * 60)
    print()

    sandbox_path = f"/project1/{SANDBOX_NAME}"

    # ─── PHASE 0: Clean up stale sandboxes ──────────────────────────────
    if not keep:
        scan = td_exec(
            "import json\n"
            "out = []\n"
            "for c in op('/project1').children:\n"
            "  if c.name.startswith('doc_pop_test'):\n"
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
            "  if hasattr(c, 'name') and 'doc_pop_test' in c.name: "
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

    # ─── PHASE 1: Create sandbox container ─────────────────────────────
    result = td_exec(
        f"c = op('/project1').create(td.baseCOMP, '{SANDBOX_NAME}'); "
        f"c.nodeX = {container_x}; c.nodeY = {container_y}; "
        f"print('created: ' + c.name)"
    )
    check("Sandbox container created",
          "error" not in result and SANDBOX_NAME in result.get("output", ""))
    print()

    # ─── PHASE 2: Create operators ─────────────────────────────────────
    #
    # Chain A: boxPOP → noisePOP → particlePOP → nullPOP
    #
    td_exec(
        f"op_a1 = op('{sandbox_path}').create(td.boxPOP, 'box_src_a'); "
        f"op_a1.nodeX = -500; op_a1.nodeY = 0; "
        f"op_a1.par.sizex = 2.0; "
        f"print('box_a: ' + op_a1.name)"
    )
    td_exec(
        f"op_a2 = op('{sandbox_path}').create(td.noisePOP, 'noise_mod_a'); "
        f"op_a2.nodeX = -200; op_a2.nodeY = 0; "
        f"op_a2.par.amp0 = 0.5; "
        f"op_a2.par.harmon = 2; "
        f"print('noise_a: ' + op_a2.name)"
    )
    td_exec(
        f"op_a3 = op('{sandbox_path}').create(td.particlePOP, 'particle_mod_a'); "
        f"op_a3.nodeX = 100; op_a3.nodeY = 0; "
        f"op_a3.par.birthrate = 100; "
        f"op_a3.par.maxparticles = 500; "
        f"print('particle_a: ' + op_a3.name)"
    )
    td_exec(
        f"op_a4 = op('{sandbox_path}').create(td.nullPOP, 'null_out_a'); "
        f"op_a4.nodeX = 400; op_a4.nodeY = 0; "
        f"print('null_a: ' + op_a4.name)"
    )

    #
    # Chain B: circlePOP → nullPOP
    #
    td_exec(
        f"op_b1 = op('{sandbox_path}').create(td.circlePOP, 'circle_src_b'); "
        f"op_b1.nodeX = -500; op_b1.nodeY = 400; "
        f"op_b1.par.radx = 1.5; op_b1.par.rady = 1.5; "
        f"print('circle_b: ' + op_b1.name)"
    )
    td_exec(
        f"op_b2 = op('{sandbox_path}').create(td.nullPOP, 'null_out_b'); "
        f"op_b2.nodeX = -200; op_b2.nodeY = 400; "
        f"print('null_b: ' + op_b2.name)"
    )

    #
    # Chain C: spherePOP → transformPOP → trailPOP → nullPOP
    #
    td_exec(
        f"op_c1 = op('{sandbox_path}').create(td.spherePOP, 'sphere_src_c'); "
        f"op_c1.nodeX = -500; op_c1.nodeY = 800; "
        f"op_c1.par.radx = 2.0; op_c1.par.rady = 2.0; op_c1.par.freq = 4; "
        f"print('sphere_c: ' + op_c1.name)"
    )
    td_exec(
        f"op_c2 = op('{sandbox_path}').create(td.transformPOP, 'xform_mod_c'); "
        f"op_c2.nodeX = -200; op_c2.nodeY = 800; "
        f"op_c2.par.ty = 0.5; "
        f"print('xform_c: ' + op_c2.name)"
    )
    td_exec(
        f"op_c3 = op('{sandbox_path}').create(td.trailPOP, 'trail_mod_c'); "
        f"op_c3.nodeX = 100; op_c3.nodeY = 800; "
        f"op_c3.par.length = 60; "
        f"print('trail_c: ' + op_c3.name)"
    )
    td_exec(
        f"op_c4 = op('{sandbox_path}').create(td.nullPOP, 'null_out_c'); "
        f"op_c4.nodeX = 400; op_c4.nodeY = 800; "
        f"print('null_c: ' + op_c4.name)"
    )

    # Verify all 12 operators exist
    result = td_get(f"/operators?path={sandbox_path}")
    ops = result.get("operators", [])
    check(f"12+ operators created (got {len(ops)})", len(ops) >= 12)
    print()

    # ─── PHASE 3: Wire connections ─────────────────────────────────────
    # Chain A: box_src_a → noise_mod_a → particle_mod_a → null_out_a
    td_exec(
        f"src = op('{sandbox_path}/box_src_a'); "
        f"mod1 = op('{sandbox_path}/noise_mod_a'); "
        f"src.outputConnectors[0].connect(mod1.inputConnectors[0]); "
        f"print('wired box→noise')"
    )
    td_exec(
        f"mod1 = op('{sandbox_path}/noise_mod_a'); "
        f"mod2 = op('{sandbox_path}/particle_mod_a'); "
        f"mod1.outputConnectors[0].connect(mod2.inputConnectors[0]); "
        f"print('wired noise→particle')"
    )
    td_exec(
        f"mod2 = op('{sandbox_path}/particle_mod_a'); "
        f"out = op('{sandbox_path}/null_out_a'); "
        f"mod2.outputConnectors[0].connect(out.inputConnectors[0]); "
        f"print('wired particle→null')"
    )

    # Chain B: circle_src_b → null_out_b
    td_exec(
        f"src = op('{sandbox_path}/circle_src_b'); "
        f"out = op('{sandbox_path}/null_out_b'); "
        f"src.outputConnectors[0].connect(out.inputConnectors[0]); "
        f"print('wired circle→null')"
    )

    # Chain C: sphere_src_c → xform_mod_c → trail_mod_c → null_out_c
    td_exec(
        f"src = op('{sandbox_path}/sphere_src_c'); "
        f"mod1 = op('{sandbox_path}/xform_mod_c'); "
        f"src.outputConnectors[0].connect(mod1.inputConnectors[0]); "
        f"print('wired sphere→xform')"
    )
    td_exec(
        f"mod1 = op('{sandbox_path}/xform_mod_c'); "
        f"mod2 = op('{sandbox_path}/trail_mod_c'); "
        f"mod1.outputConnectors[0].connect(mod2.inputConnectors[0]); "
        f"print('wired xform→trail')"
    )
    td_exec(
        f"mod2 = op('{sandbox_path}/trail_mod_c'); "
        f"out = op('{sandbox_path}/null_out_c'); "
        f"mod2.outputConnectors[0].connect(out.inputConnectors[0]); "
        f"print('wired trail→null')"
    )

    print("  Wiring done — 7 connections")
    print()

    # ─── PHASE 4: Verify parameters via /exec (Method A) ───────────────
    # Chain A
    a1 = td_exec(
        f"import json; o = op('{sandbox_path}/box_src_a'); "
        f"print(json.dumps({{'sizex': o.par.sizex.val}}))"
    )
    a1_vals = json.loads(a1.get("output", "{}"))
    assert_approx(a1_vals.get("sizex", 0), 2.0, "Chain A box.sizex=2.0")

    a2 = td_exec(
        f"import json; o = op('{sandbox_path}/noise_mod_a'); "
        f"print(json.dumps({{'amp0': o.par.amp0.val, 'harmon': o.par.harmon.val}}))"
    )
    a2_vals = json.loads(a2.get("output", "{}"))
    assert_approx(a2_vals.get("amp0", 0), 0.5, "Chain A noise.amp0=0.5")
    check(f"Chain A noise.harmon={a2_vals.get('harmon')} (expected 2)",
          a2_vals.get("harmon") == 2)

    a3 = td_exec(
        f"import json; o = op('{sandbox_path}/particle_mod_a'); "
        f"print(json.dumps({{'birthrate': o.par.birthrate.val, 'maxparticles': o.par.maxparticles.val}}))"
    )
    a3_vals = json.loads(a3.get("output", "{}"))
    check(f"Chain A particle.birthrate={a3_vals.get('birthrate')} (expected 100)",
          a3_vals.get("birthrate") == 100)
    check(f"Chain A particle.maxparticles={a3_vals.get('maxparticles')} (expected 500)",
          a3_vals.get("maxparticles") == 500)

    # Chain B
    b1 = td_exec(
        f"import json; o = op('{sandbox_path}/circle_src_b'); "
        f"print(json.dumps({{'radx': o.par.radx.val, 'rady': o.par.rady.val}}))"
    )
    b1_vals = json.loads(b1.get("output", "{}"))
    assert_approx(b1_vals.get("radx", 0), 1.5, "Chain B circle.radx=1.5")
    assert_approx(b1_vals.get("rady", 0), 1.5, "Chain B circle.rady=1.5")

    # Chain C
    c1 = td_exec(
        f"import json; o = op('{sandbox_path}/sphere_src_c'); "
        f"print(json.dumps({{'radx': o.par.radx.val, 'rady': o.par.rady.val, 'freq': o.par.freq.val}}))"
    )
    c1_vals = json.loads(c1.get("output", "{}"))
    assert_approx(c1_vals.get("radx", 0), 2.0, "Chain C sphere.radx=2.0")
    assert_approx(c1_vals.get("rady", 0), 2.0, "Chain C sphere.rady=2.0")
    check(f"Chain C sphere.freq={c1_vals.get('freq')} (expected 4)",
          c1_vals.get("freq") == 4)

    c2 = td_exec(
        f"import json; o = op('{sandbox_path}/xform_mod_c'); "
        f"print(json.dumps({{'ty': o.par.ty.val}}))"
    )
    c2_vals = json.loads(c2.get("output", "{}"))
    assert_approx(c2_vals.get("ty", 0), 0.5, "Chain C xform.ty=0.5")

    c3 = td_exec(
        f"import json; o = op('{sandbox_path}/trail_mod_c'); "
        f"print(json.dumps({{'length': o.par.length.val}}))"
    )
    c3_vals = json.loads(c3.get("output", "{}"))
    check(f"Chain C trail.length={c3_vals.get('length')} (expected 60)",
          c3_vals.get("length") == 60)

    print()

    # ─── PHASE 5: POST /document endpoint ──────────────────────────────
    doc = td_post("/document", {"path": sandbox_path})
    print(f"  /document returned in OK")

    # Validate structure
    assert_ge(doc.get("operator_count", 0), 12, "doc.operator_count >= 12")
    check(f"doc.connection_count == 7 (got {doc.get('connection_count')})",
          doc.get("connection_count") == 7)
    check(f"doc.error_count == 0 (got {doc.get('error_count')})",
          doc.get("error_count") == 0)

    # Summary checks
    summary = doc.get("summary", "")
    check("summary contains 'POP' (family)", "POP" in summary)
    check("summary contains 'sources'", "sources" in summary)
    check("summary contains 'outputs'", "outputs" in summary)

    # Structure checks
    structure = doc.get("structure", [])
    assert_ge(len(structure), 12, "doc.structure length >= 12")

    # Check individual structure entries
    struct_by_name = {s.get("name"): s for s in structure}
    check("box_src_a in structure", "box_src_a" in struct_by_name)
    check("null_out_c in structure", "null_out_c" in struct_by_name)
    check("sphere_src_c in structure", "sphere_src_c" in struct_by_name)

    # Role validation
    if "box_src_a" in struct_by_name:
        check("box_src_a role is 'source'",
              struct_by_name["box_src_a"].get("role") == "source")
    if "noise_mod_a" in struct_by_name:
        check("noise_mod_a role is 'processor'",
              struct_by_name["noise_mod_a"].get("role") == "processor")
    if "null_out_a" in struct_by_name:
        check("null_out_a role is 'sink / output'",
              struct_by_name["null_out_a"].get("role") == "sink / output")
    if "trail_mod_c" in struct_by_name:
        check("trail_mod_c role is 'processor'",
              struct_by_name["trail_mod_c"].get("role") == "processor")
    if "null_out_c" in struct_by_name:
        check("null_out_c role is 'sink / output'",
              struct_by_name["null_out_c"].get("role") == "sink / output")

    # Verify each structure entry has required fields
    for entry in structure[:5]:  # sample first 5
        for field in ["path", "name", "type", "family", "role"]:
            entry_name = entry.get("name", "?")
            check(f"  entry '{entry_name}' has '{field}'", field in entry)

    # Connections validation
    connections = doc.get("connections", [])
    assert_ge(len(connections), 7, "doc.connections >= 7")
    # Check format — each should contain → arrow
    arrow_count = sum(1 for c in connections if "\u2192" in c)
    check(f"connections with \u2192 arrow: {arrow_count}", arrow_count >= 7)
    # Check specific connection names appear
    conn_text = " ".join(connections)
    check("'box_src_a' in connections", "box_src_a" in conn_text)
    check("'sphere_src_c' in connections", "sphere_src_c" in conn_text)
    check("'null_out_c' in connections", "null_out_c" in conn_text)

    # Diagram validation
    diagram = doc.get("diagram", "")
    check("diagram is non-empty", bool(diagram) and len(diagram) > 10)
    check("diagram contains 'Column 1'", "Column 1" in diagram)
    check("diagram contains \u2500\u2500\u2192 arrows", "\u2500\u2500\u2192" in diagram)

    # Families dict
    families = doc.get("families", {})
    check("families has 'POP' key", "POP" in families)
    check(f"families POP count >= 12 (got {families.get('POP', 0)})",
          families.get("POP", 0) >= 12)

    # Roles dict
    roles = doc.get("roles", {})
    source_count = roles.get("source", 0)
    processor_count = roles.get("processor", 0)
    sink_count = roles.get("sink / output", 0)
    check(f"roles source >= 3 (got {source_count})", source_count >= 3)
    check(f"roles processor >= 4 (got {processor_count})", processor_count >= 4)
    check(f"roles sink / output >= 3 (got {sink_count})", sink_count >= 3)

    print()

    # ─── PHASE 5-B: Parameters in document output ──────────────────────
    doc_params = doc.get("parameters", {})
    # Check that some of our operators have params in the document output
    box_path = get_op_path("box_src_a")
    if box_path in doc_params:
        params_dict = doc_params[box_path]
        check(f"doc.parameters has box_src_a.sizex",
              "sizex" in params_dict or "size" in params_dict)
    else:
        check("doc.parameters has path for box_src_a", False)

    # Also check documentation entries for type/family fields
    # Make sure each structure entry correctly identifies the POP family
    non_pop_family = [s for s in structure if s.get("family") and s["family"] != "POP"]
    check("all documented operators are POP family (0 non-POP)",
          len(non_pop_family) == 0)
    print()

    # ─── PHASE 6: Verify grid positions (RULE 3 — no overlap) ──────────
    pos = td_exec(
        f"import json; "
        f"children = op('{sandbox_path}').findChildren(); "
        f"out = [{{'n': c.name, 'x': c.nodeX, 'y': c.nodeY}} for c in children]; "
        f"print(json.dumps(out))"
    )
    positions = json.loads(pos.get("output", "[]"))
    expected_names = ["box_src_a", "noise_mod_a", "particle_mod_a", "null_out_a",
                      "circle_src_b", "null_out_b",
                      "sphere_src_c", "xform_mod_c", "trail_mod_c", "null_out_c"]
    pos_by_name = {p["n"]: p for p in positions}
    for name in expected_names:
        check(f"Position found for {name}", name in pos_by_name)
        if name in pos_by_name:
            check(f"  {name} has nodeX defined", pos_by_name[name]["x"] is not None)

    # Check grid separation on same-row pairs (RULE 3)
    positions_list = [p for p in positions if p["n"] in expected_names]
    for i, a in enumerate(positions_list):
        for b in positions_list[i+1:]:
            dx = abs(a["x"] - b["x"])
            dy = abs(a["y"] - b["y"])
            if a["y"] == b["y"]:
                # Same row: need ≥200px horizontal separation
                check(f"Row sep {a['n']}→{b['n']}: dx={dx}", dx >= 200)
            elif a["x"] == b["x"]:
                # Same column: need ≥150px vertical
                check(f"Col sep {a['n']}→{b['n']}: dy={dy}", dy >= 150)
            else:
                # Different row and col
                check(f"Diag sep {a['n']}→{b['n']}: dx={dx}, dy={dy}",
                      dx >= 100 and dy >= 100)
    print()

    # ─── PHASE 7: Verify wiring via connection integrity check ─────────
    for chain_label, src, mod1, mod2, out_node in [
        ("A", "box_src_a", "noise_mod_a", "particle_mod_a", "null_out_a"),
        ("B", "circle_src_b", None, None, "null_out_b"),
        ("C", "sphere_src_c", "xform_mod_c", "trail_mod_c", "null_out_c"),
    ]:
        if chain_label == "B":
            # 2-node chain: src → out
            wire = td_exec(
                f"import json\n"
                f"src = op('{sandbox_path}/{src}')\n"
                f"out = op('{sandbox_path}/{out_node}')\n"
                f"src_to_out = bool(src.outputConnectors[0].connections) "
                f"and src.outputConnectors[0].connections[0].owner == out\n"
                f"print(json.dumps({{'src_to_out': src_to_out}}))"
            )
            raw = wire.get("output", "")
            w = json.loads(raw) if raw else {}
            check(f"Chain {chain_label}: src\u2192out wired", w.get("src_to_out", False))
        else:
            # 4-node chain: src → mod1 → mod2 → out
            wire = td_exec(
                f"import json\n"
                f"src = op('{sandbox_path}/{src}')\n"
                f"m1 = op('{sandbox_path}/{mod1}')\n"
                f"m2 = op('{sandbox_path}/{mod2}')\n"
                f"out = op('{sandbox_path}/{out_node}')\n"
                f"src_to_m1 = bool(src.outputConnectors[0].connections) "
                f"and src.outputConnectors[0].connections[0].owner == m1\n"
                f"m1_to_m2 = bool(m1.outputConnectors[0].connections) "
                f"and m1.outputConnectors[0].connections[0].owner == m2\n"
                f"m2_to_out = bool(m2.outputConnectors[0].connections) "
                f"and m2.outputConnectors[0].connections[0].owner == out\n"
                f"print(json.dumps({{'src_to_m1': src_to_m1, "
                f"'m1_to_m2': m1_to_m2, 'm2_to_out': m2_to_out}}))"
            )
            raw = wire.get("output", "")
            w = json.loads(raw) if raw else {}
            check(f"Chain {chain_label}: src\u2192mod1 wired", w.get("src_to_m1", False))
            check(f"Chain {chain_label}: mod1\u2192mod2 wired", w.get("m1_to_m2", False))
            check(f"Chain {chain_label}: mod2\u2192out wired", w.get("m2_to_out", False))
    print()

    # ─── PHASE 8: /verify cross-check ──────────────────────────────────
    verify = td_get(f"/verify?path={sandbox_path}")
    healthy = verify.get("healthy", False)
    op_count = verify.get("operator_count", 0)
    error_count = verify.get("error_count", 0)
    check(f"/verify reports healthy=True",
          healthy is True or healthy == "true")
    assert_ge(op_count, 12, f"/verify operator_count >= 12 (got {op_count})")
    check(f"/verify error_count = 0 (got {error_count})", error_count == 0)
    print()

    # ─── PHASE 9: Zero errors (RULE 2 — immediate + async re-check) ───
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

    # ─── PHASE 10: Summary ─────────────────────────────────────────────
    print("=" * 60)
    print(f"RESULTS: {checks_passed}/{checks_total} checks passed")
    print("=" * 60)

    # ─── PHASE 11: Cleanup (unless --keep) ─────────────────────────────
    if not keep:
        td_exec(f"op('{sandbox_path}').destroy()")
        print(f"Sandbox '{SANDBOX_NAME}' destroyed.")

    # Exit code
    success = checks_passed == checks_total
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
