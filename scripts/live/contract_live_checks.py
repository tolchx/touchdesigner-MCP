#!/usr/bin/env python3
"""
Live contract checks against the real TD bridge (127.0.0.1:44444).

Verifies on a real sandbox network (boxPOP -> noisePOP -> nullPOP):
  1. /connections returns the real edge graph (item 38 contract)
  2. /verify carries the A1 additive keys (errors_truncated / warnings_truncated)
  3. /healthcheck carries the A3 forceCook key
  4. /metrics carries the A5 keys (max_depth / walk_truncated / deepest_visited)
  5. /document declares its recursive scope (A4)
  6. /parameters/set with updates[] applies, /undo reverts, /redo re-applies
  7. /exec create -> /undo deletes -> /redo recreates (network write history)
  8. td_verify_wiring edge-set expectation (exact expected edges)

Exit codes: 0 all pass, 1 failures, 2 TD unreachable. TD must be running.
"""
import json
import sys
import time
import urllib.request

BASE = "http://127.0.0.1:44444"
SB = "/project1/_contract_live"

results = []


def req(method, path, body=None, timeout=15):
    url = BASE + path
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(url, data=data, method=method,
                               headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(r, timeout=timeout) as resp:
        return json.loads(resp.read().decode())


def check(name, ok, detail=""):
    results.append((name, ok, detail))
    print(("PASS " if ok else "FAIL ") + name + (" | " + detail if detail else ""))


def setup_net():
    code = (
        "n = op('%(sb)s')\n"
        "if n: n.destroy()\n"
        "n = op('/project1').create(td.baseCOMP, '_contract_live')\n"
        "n.nodeX = -2000; n.nodeY = -2000\n"
        "a = n.create(td.boxPOP, 'box'); a.nodeX = 0; a.nodeY = 0\n"
        "b = n.create(td.noisePOP, 'nz');  b.nodeX = -100; b.nodeY = 0\n"
        "c = n.create(td.nullPOP, 'out');  c.nodeX = -200; c.nodeY = 0\n"
        "a.outputConnectors[0].connect(b)\n"
        "b.outputConnectors[0].connect(c)\n"
        "print('ok')\n" % {"sb": SB}
    )
    r = req("POST", "/exec", {"code": code})
    # /exec responds {"output": ...} on success (no "success" key)
    assert "ok" in r.get("output", ""), "sandbox setup failed: %s" % r


def teardown_net():
    req("POST", "/exec", {"code": "n = op('%s')\nif n: n.destroy()\nprint('ok')" % SB})


def expected_edges_ok(edges):
    want = {("box", "nz", 0), ("nz", "out", 0)}
    got = {(e["from"], e["to"], e["input"]) for e in edges}
    return got == want, str(sorted(got))


def main():
    try:
        req("GET", "/info", timeout=5)
    except Exception as e:
        print("TD unreachable: %s" % e)
        return 2

    setup_net()
    try:
        # 1. /connections = real edges (item 38)
        c = req("GET", "/connections?path=%s" % SB)
        edges = c.get("connections", [])
        ok, detail = expected_edges_ok(edges)
        check("connections.real_edges", ok and c.get("total") == 2,
              "total=%s edges=%s" % (c.get("total"), detail))
        check("connections.no_operators_key", "operators" not in c)

        # 2. A1 keys on /verify
        v = req("GET", "/verify?path=%s" % SB)
        check("verify.a1_keys",
              isinstance(v.get("errors_truncated"), bool)
              and isinstance(v.get("warnings_truncated"), bool),
              "errors_truncated=%r warnings_truncated=%r" % (
                  v.get("errors_truncated"), v.get("warnings_truncated")))

        # 3. A3 key on /healthcheck
        h = req("GET", "/healthcheck")
        check("healthcheck.forceCook", isinstance(h.get("forceCook"), bool),
              "forceCook=%r" % h.get("forceCook"))

        # 4. A5 keys on /metrics
        m = req("GET", "/metrics")
        check("metrics.a5_keys",
              m.get("max_depth") == 30
              and isinstance(m.get("walk_truncated"), bool),
              "max_depth=%r walk_truncated=%r deepest_visited=%r" % (
                  m.get("max_depth"), m.get("walk_truncated"),
                  m.get("deepest_visited")))

        # 5. A4 /document declares recursion
        d = req("POST", "/document", {"path": SB})
        check("document.recursive_declared", d.get("recursive") is False,
              "recursive=%r operator_count=%r" % (
                  d.get("recursive"), d.get("operator_count")))

        # 6. parameter set -> undo -> redo round-trip
        # GET /parameters returns a LIST of param objects (key 'value').
        # noisePOP's Amplitude par is named 'amp0'; 'amp' resolves to it.
        def amp_value():
            g = req("GET", "/parameters?path=%s/nz" % SB)
            obj = next((p for p in g.get("parameters", [])
                        if p.get("name") in ("amp", "amp0")), None)
            return obj.get("value") if obj else None

        base = amp_value()
        p = req("POST", "/parameters/set", {
            "path": SB + "/nz", "updates": [{"name": "amp", "value": 3.5}]})
        upd = p.get("updated")
        check("parameters_set.applies",
              isinstance(upd, list) and len(upd) >= 1
              and upd[0].get("value") == 3.5,
              "updated[0].value=%r (base was %r)" % (
                  upd[0].get("value") if upd else None, base))
        check("parameters_set.value", amp_value() == 3.5,
              "amp=%r" % amp_value())

        u = req("POST", "/undo")
        check("undo.param_reverts", u.get("success") is True, json.dumps(u)[:120])
        check("undo.value_back", amp_value() == base,
              "amp=%r (base=%r)" % (amp_value(), base))

        r2 = req("POST", "/redo")
        check("redo.param_reapplies", r2.get("success") is True, json.dumps(r2)[:120])
        check("redo.value_back", amp_value() == 3.5, "amp=%r" % amp_value())

        # 7. create -> undo (delete) -> redo (recreate)
        # NOTE: /create (create_operator) IS recorded in history; /exec is
        # deliberately NOT (arbitrary code is not undoable) — verified live.
        cr = req("POST", "/create?path=%s&type=noisePOP&name=undo_me"
                        "&position_x=-300&position_y=-100" % SB, {})
        # /create wraps the inner JSON print inside {"output": "<json>"} and
        # the codegen may prepend SyntaxWarning lines — take the last JSON line.
        inner = {}
        for line in reversed(cr.get("output", "").splitlines()):
            line = line.strip()
            if line.startswith("{"):
                try:
                    inner = json.loads(line)
                    break
                except Exception:
                    pass
        check("create.operator_created",
              inner.get("success") is True and inner.get("name") == "undo_me",
              "inner=%s" % json.dumps(inner)[:120])
        hist = req("GET", "/history")
        check("history.has_entries", len(hist.get("undo", [])) > 0,
              "canUndo=%r entries=%d" % (hist.get("canUndo"),
                                         len(hist.get("undo", []))))
        u2 = req("POST", "/undo")
        check("undo.create_deletes", u2.get("success") is True,
              json.dumps(u2)[:120])
        gone = req("POST", "/exec", {"code":
            "print('exists' if op('%s/undo_me') is None else 'STILL_THERE')" % SB})
        check("undo.operator_gone", "exists" in gone.get("output", ""),
              gone.get("output", "")[:80])
        r3 = req("POST", "/redo")
        back = req("POST", "/exec", {"code":
            "print('BACK' if op('%s/undo_me') is not None else 'GONE')" % SB})
        check("redo.operator_recreated",
              r3.get("success") is True and "BACK" in back.get("output", ""),
              back.get("output", "")[:80])

        # 8. wiring expectation (td_verify_wiring semantics, edge sets)
        c2 = req("GET", "/connections?path=%s&recurse=true" % SB)
        nested = {(e["from"], e["to"], e["input"]) for e in c2.get("connections", [])}
        check("wiring.expected_edges_recurse",
              {("box", "nz", 0), ("nz", "out", 0)} <= nested,
              "edges=%s" % sorted(nested))
    finally:
        teardown_net()

    fails = [n for n, ok, _ in results if not ok]
    print("\n%d/%d checks passed" % (len(results) - len(fails), len(results)))
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
