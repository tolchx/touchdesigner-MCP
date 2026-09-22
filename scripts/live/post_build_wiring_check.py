#!/usr/bin/env python3
"""
Post-build wiring check (AGENTS.md rule 16).

Verify the wiring of a freshly built network via GET /connections (real edges,
backlog item 38) instead of trusting build output. Compare edges as SETS of
(from_name, to_name, input_index) so missing wires, missing outputs and wrong
input indices are all caught, with actionable names.

Usage:
  # Inline after any build script:
  python scripts/live/post_build_wiring_check.py \
      --path /project1/my_net \
      --expect "srcA->nz:0,nz->mg:0,srcB->mg:1,mg->out:0"

  # Protocol self-test (builds + destroys its own sandboxes):
  python scripts/live/post_build_wiring_check.py --selftest

Exit codes: 0 = wiring OK / selftest passed, 1 = mismatch or build failure,
2 = TD unreachable. Never invents results.
"""

import argparse
import json
import sys
import urllib.request

BASE = "http://127.0.0.1:44444"


def req(method, path, body=None, timeout=60):
    data = json.dumps(body or {}).encode()
    r = urllib.request.Request(BASE + path, data=data, method=method)
    r.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(r, timeout=timeout) as resp:
        return json.loads(resp.read().decode())


def get_edges(container_path):
    """Return the set {(from, to, input)} of real wiring edges under container."""
    conn = req("GET", "/connections?path=%s&recurse=1" % container_path)
    return {(e["from"], e["to"], e["input"]) for e in conn.get("connections", [])}


def parse_expect(spec):
    """Parse 'srcA->nz:0,nz->mg:0' into {(from, to, input)}."""
    expected = set()
    for part in spec.split(","):
        part = part.strip()
        if not part:
            continue
        pair, idx = part.split(":")
        a, b = pair.split("->")
        expected.add((a.strip(), b.strip(), int(idx)))
    return expected


def check_wiring(container_path, expected):
    """Compare expected vs real edges. Returns (ok, missing, extra)."""
    got = get_edges(container_path)
    return expected <= got, expected - got, got - expected


# --------------------------------------------------------------------------
# Self-test: proves the check catches the three failure classes (verified
# live on TD 2025.31760). Builds a 5-node mergePOP network per case.
# --------------------------------------------------------------------------

EXPECTED = {("srcA", "nz", 0), ("nz", "mg", 0), ("srcB", "mg", 1), ("mg", "out", 0)}

BUILD_CODE = """
import json
c = op('/project1').create(td.baseCOMP, '%(name)s')
a = c.create(td.boxPOP, 'srcA');    a.nodeX, a.nodeY = -600, 100
b = c.create(td.spherePOP, 'srcB'); b.nodeX, b.nodeY = -600, -100
n = c.create(td.noisePOP, 'nz');    n.nodeX, n.nodeY = -300, 0
m = c.create(td.mergePOP, 'mg');    m.nodeX, m.nodeY = 0, 0
o = c.create(td.nullPOP, 'out');    o.nodeX, o.nodeY = 300, 0
%(wires)s
print('built')
"""

WIRES = {
    "A": "a.outputConnectors[0].connect(n)",
    "N0": "n.outputConnectors[0].connect(m.inputConnectors[0])",
    "N1": "b.outputConnectors[0].connect(m.inputConnectors[1])",
    "OUT": "m.outputConnectors[0].connect(o)",
}


def build_case(name, forget=None):
    wires = "\n".join(w for k, w in WIRES.items() if k != forget)
    req("POST", "/exec", {"code": "op('/project1/%s').destroy() if op('/project1/%s') else None\nprint('ok')" % (name, name)})
    r = req("POST", "/exec", {"code": BUILD_CODE % {"name": name, "wires": wires}})
    if "built" not in r.get("output", ""):
        raise RuntimeError("build failed: %s" % json.dumps(r)[:200])


def destroy(name):
    req("POST", "/exec", {"code": "op('/project1/%s').destroy()\nprint('ok')" % name})


def selftest():
    try:
        req("GET", "/info")
    except Exception as e:
        print("TD_UNREACHABLE:", e)
        return 2

    results = []

    def run(label, name, forget, expect_rewire=False):
        try:
            build_case(name, forget=forget)
            if expect_rewire:
                req("POST", "/exec", {"code":
                    "b = op('/project1/%s/srcB'); m = op('/project1/%s/mg')\n"
                    "b.outputConnectors[0].connect(m.inputConnectors[0])\nprint('ok')" % (name, name)})
            ok, missing, extra = check_wiring("/project1/" + name, EXPECTED)
            detected = not ok
            results.append((label, detected, sorted(missing), sorted(extra)))
            print("%-28s detected=%s missing=%s extra=%s"
                  % (label, detected, sorted(missing), sorted(extra)))
        finally:
            destroy(name)

    # Positive: correct build must PASS the check.
    build_case("_wc_pos")
    ok, missing, extra = check_wiring("/project1/_wc_pos", EXPECTED)
    results.append(("POSITIVE (correct build)", ok, sorted(missing), sorted(extra)))
    print("%-28s pass=%s missing=%s extra=%s"
          % ("POSITIVE (correct build)", ok, sorted(missing), sorted(extra)))
    destroy("_wc_pos")

    # Negatives: each must FAIL the check (be detected).
    run("NEG1 missing merge wire", "_wc_neg1", forget="N1")
    run("NEG2 missing output wire", "_wc_neg2", forget="OUT")
    run("NEG3 wrong input index", "_wc_neg3", forget=None, expect_rewire=True)

    all_ok = all((okr if label.startswith("POSITIVE") else detected)
                 for label, detected, _, _ in results for okr in [detected])
    # clearer: positive needs detected==True value to be 'ok' (i.e. not detected)
    all_ok = (results[0][1]) and all(detected for label, detected, _, _ in results[1:])
    print()
    if all_ok:
        print("ALL OK - wiring check protocol verified (positive passes, 3 negatives detected).")
        return 0
    print("FAILED:", [(l, d) for l, d, _, _ in results])
    return 1


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--selftest", action="store_true")
    ap.add_argument("--path", help="container path to check")
    ap.add_argument("--expect", help="expected edges: 'a->b:0,c->d:1' (names, input index)")
    args = ap.parse_args()

    if args.selftest:
        sys.exit(selftest())

    if not args.path or not args.expect:
        ap.error("provide --path + --expect, or --selftest")
    try:
        req("GET", "/info")
    except Exception as e:
        print("TD_UNREACHABLE:", e)
        return 2
    ok, missing, extra = check_wiring(args.path, parse_expect(args.expect))
    print("path:   %s" % args.path)
    print("result: %s" % ("WIRING OK" if ok else "WIRING MISMATCH"))
    if missing:
        print("missing edges: %s" % sorted(missing))
    if extra:
        print("unexpected edges: %s" % sorted(extra))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
