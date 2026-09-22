#!/usr/bin/env python3
"""
Live acceptance: GET /connections must return the REAL wiring graph
(backlog item 38). Builds a sandbox boxPOP -> noisePOP -> nullPOP chain
wired with outputConnectors[0].connect(), then asserts:

  1. Response shape has "connections" (edges), NOT the old "operators" list.
  2. Exactly 2 edges with the right from/to/input (recurse=false).
  3. recurse=true still returns both edges.
  4. Edge count matches /verify total_connections (cross-check).

Exit codes: 0 = all pass, 1 = failures, 2 = TD unreachable (no numbers invented).
"""

import json
import sys
import urllib.request

BASE = "http://127.0.0.1:44444"
SB = "/project1/_probe_conn_item38"


def _req(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else b"{}"
    req = urllib.request.Request(BASE + path, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode())


def main():
    # Gate: TD reachable.
    try:
        info = _req("GET", "/info")
    except Exception as e:
        print("TD_UNREACHABLE:", e)
        return 2
    print("TD build:", info.get("build"))

    failures = []

    def check(name, cond, detail=""):
        print(("PASS " if cond else "FAIL ") + name + (" :: " + detail if detail else ""))
        if not cond:
            failures.append(name)

    # Clean slate.
    _req("POST", "/exec", {"code": f"op('{SB}').destroy() if op('{SB}') else None\nprint('ok')"})

    # Build + wire the 3-node chain in ONE exec (also proves wiring exists).
    code = f"""
import json
n = op('/project1').create(td.baseCOMP, '_probe_conn_item38')
n.nodeX, n.nodeY = 0, 0
b = n.create(td.boxPOP, 'box');    b.nodeX, b.nodeY = -300, 0
nz = n.create(td.noisePOP, 'noise'); nz.nodeX, nz.nodeY = 0, 0
nl = n.create(td.nullPOP, 'null1');  nl.nodeX, nl.nodeY = 300, 0
b.outputConnectors[0].connect(nz)
nz.outputConnectors[0].connect(nl)
out = {{'created': True, 'errors': n.errors()}}
print(json.dumps(out))
"""
    r = _req("POST", "/exec", {"code": code})
    print("build:", json.dumps(r)[:160])
    if "\"created\": true" not in r.get("output", "").lower():
        failures.append("build-chain")

    # 1+2: default recurse=false -> 2 real edges.
    conn = _req("GET", f"/connections?path={SB}")
    print("RESPONSE /connections:", json.dumps(conn, ensure_ascii=False))
    check("no-old-operators-key", "operators" not in conn)
    check("has-connections-key", "connections" in conn)
    check("total-is-2-edges", conn.get("total") == 2, f"total={conn.get('total')} (expected 2 EDGES)")
    edges = conn.get("connections", [])
    check("edge-box-noise",
          any(e["from"] == "box" and e["to"] == "noise" and e["input"] == 0 for e in edges))
    check("edge-noise-null",
          any(e["from"] == "noise" and e["to"] == "null1" and e["input"] == 0 for e in edges))
    check("paths-are-full",
          all("/" in e.get("fromPath", "") and "/" in e.get("toPath", "") for e in edges))

    # 3: recurse=true on the container -> same 2 edges (no nested wiring here).
    conn_r = _req("GET", f"/connections?path={SB}&recurse=1")
    check("recurse-true-2-edges", conn_r.get("total") == 2, f"total={conn_r.get('total')}")
    check("recurse-flag-echoed", conn_r.get("recurse") is True)

    # Cross-check with /verify (its total_connections was always right).
    ver = _req("GET", f"/verify?path={SB}")
    check("matches-verify-count", ver.get("total_connections") == conn.get("total"),
          f"verify={ver.get('total_connections')} connections={conn.get('total')}")

    # Cleanup.
    _req("POST", "/exec", {"code": f"op('{SB}').destroy()\nprint('ok')"})

    print()
    if failures:
        print("FAILED:", failures)
        return 1
    print("ALL OK — /connections returns the real wiring graph.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
