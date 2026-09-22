#!/usr/bin/env python3
"""
Live probe: dynamic-input replacement semantics per operator type (AGENTS.md rule 12).

For each op type, against a live TouchDesigner bridge, measures:
  1. initial input connectors (fixed vs dynamic)
  2. plain connect #1 and #2 (append to free slot? replace slot 0?)
  3. explicit rewire onto OCCUPIED slot 0  -> replaced edge or both kept?
  4. fill slot 1 if free, rewire onto OCCUPIED slot 1 -> same question
  5. connect-beyond-count (inputConnectors[9]) -> error? grows?

Verdicts compare EDGE SETS (from, input), never counts. Exit codes:
0 measured, 2 TD unreachable. Never invents results.

Usage: python scripts/live/dynamic_input_probe.py [--ops mergePOP,compositeTOP,...]
Requires: TD running with the MCP bridge on 127.0.0.1:44444
"""

import argparse
import json
import sys
import urllib.request

HOST = "http://127.0.0.1:44444"


def req(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(HOST + path, data=data, method=method,
                               headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(r, timeout=30) as resp:
            return resp.status, json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode())


def sb_path(name):
    return "/project1/" + name


def destroy(path):
    code = "n = op('%s')\nprint('ok' if (n.destroy() if n else True) else 'fail')" % path
    req("POST", "/exec", {"code": code})


def build_case(name, op_type):
    """Sandbox with 4 same-family sources + target + output. Returns error or None."""
    family = "TOP" if op_type.endswith("TOP") else "POP"
    src = "constantTOP" if family == "TOP" else "boxPOP"
    out_op = "nullTOP" if family == "TOP" else "nullPOP"
    code = """
r = op('/project1')
if op('{sb}'): op('{sb}').destroy()
net = r.create(td.baseCOMP, '{name}')
bA = net.create(td.{src}, 'bA')
bB = net.create(td.{src}, 'bB')
bC = net.create(td.{src}, 'bC')
bD = net.create(td.{src}, 'bD')
sA = net.create(td.{out_op}, 'sA'); bA.outputConnectors[0].connect(sA)
sB = net.create(td.{out_op}, 'sB'); bB.outputConnectors[0].connect(sB)
sC = net.create(td.{out_op}, 'sC'); bC.outputConnectors[0].connect(sC)
sD = net.create(td.{out_op}, 'sD'); bD.outputConnectors[0].connect(sD)
tgt = net.create(td.{op_type}, 'tgt')
out = net.create(td.{out_op}, 'out')
tgt.outputConnectors[0].connect(out)
print('built')
""".format(sb=sb_path(name), name=name, src=src, out_op=out_op, op_type=op_type)
    st, body = req("POST", "/exec", {"code": code})
    if st != 200 or "built" not in body.get("output", ""):
        return (body.get("error", "") or body.get("output", "")).strip()[:160]
    return None


def tgt_edges(name):
    st, body = req("GET", "/connections?path=%s&recurse=1" % sb_path(name))
    if st != 200:
        raise RuntimeError("connections read failed: %s" % st)
    return sorted((e["from"], e["input"])
                  for e in body.get("connections", []) if e["to"] == "tgt")


def connect(name, expr, expect_ok=True):
    """Run a connect snippet; returns (raised_error, output)."""
    code = """
t = op('{sb}/tgt')
s = op('{sb}/{{s}}')
try:
    {expr}
    print('connected')
except Exception as e:
    print('ERR: ' + str(e))
""".format(sb=sb_path(name), s="{{s}}", expr=expr)
    return None  # replaced below; kept for clarity


def do_connect(name, source, expr):
    """Connect source via python expr using t (target) and s (source)."""
    code = """
t = op('%s/tgt')
s = op('%s/%s')
try:
    %s
    print('connected')
except Exception as e:
    print('ERR: ' + str(e))
""" % (sb_path(name), sb_path(name), source, expr)
    st, body = req("POST", "/exec", {"code": code})
    out = body.get("output", "")
    return "ERR" not in out, out.strip()


def count_connectors(name):
    code = """
import json as _j
t = op('%s/tgt')
print(_j.dumps({'n': len(t.inputConnectors)}))
""" % sb_path(name)
    st, body = req("POST", "/exec", {"code": code})
    out = body.get("output", "")
    return json.loads(out[out.index("{"):out.rindex("}") + 1])["n"]


def run_case(name, op_type):
    res = {"op": op_type}

    err = build_case(name, op_type)
    if err:
        res["error"] = "build: %s" % err
        return res
    res["initial"] = count_connectors(name)

    # 2. two plain connects (no explicit slot), capturing edges after EACH
    ok1, out1 = do_connect(name, "sA", "s.outputConnectors[0].connect(t)")
    if not ok1:
        res["error"] = "plain connect 1 failed: %r" % out1
        return res
    res["after_plain1"] = tgt_edges(name)
    ok2, out2 = do_connect(name, "sB", "s.outputConnectors[0].connect(t)")
    if not ok2:
        res["error"] = "plain connect 2 failed: %r" % out2
        return res
    res["after_plain2"] = tgt_edges(name)

    # 3. explicit rewire onto OCCUPIED slot 0
    ok, out = do_connect(name, "sD", "s.outputConnectors[0].connect(t.inputConnectors[0])")
    if not ok:
        res["error"] = "rewire slot0 failed: %r" % out
        return res
    res["after_rewire_slot0"] = tgt_edges(name)

    # 4. fill slot 1 if free, then rewire onto OCCUPIED slot 1
    before_slot1 = tgt_edges(name)
    if not any(i == 1 for _, i in before_slot1):
        ok, out = do_connect(name, "sC", "s.outputConnectors[0].connect(t.inputConnectors[1])")
        if not ok:
            res["error"] = "fill slot1 failed: %r" % out
            return res
        before_slot1 = tgt_edges(name)
    ok, out = do_connect(name, "sD", "s.outputConnectors[0].connect(t.inputConnectors[1])")
    if not ok:
        res["error"] = "rewire slot1 failed: %r" % out
        return res
    res["after_rewire_slot1"] = tgt_edges(name)

    # 5. beyond count
    ok, out = do_connect(name, "sD", "s.outputConnectors[0].connect(t.inputConnectors[9])")
    res["beyond_count"] = {"raised": not ok, "edges": tgt_edges(name)}

    # Verdicts (edge-set based, per step)
    plain_replaced = set(res["after_plain1"]) - set(res["after_plain2"])
    slot0_replaced = set(res["after_plain2"]) - set(res["after_rewire_slot0"])
    slot1_replaced = set(before_slot1) - set(res["after_rewire_slot1"])
    res["verdict"] = {
        "plain_connect": ("REPLACES existing wire" if plain_replaced else "appends (no replace)"),
        "occupied_slot0": ("REPLACES" if slot0_replaced else "keeps both"),
        "occupied_slot1": ("REPLACES" if slot1_replaced else "keeps both"),
        "beyond_count": ("raises" if res["beyond_count"]["raised"] else "accepted"),
    }
    return res


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--ops", default="mergePOP,compositeTOP,crossTOP,overTOP,copyPOP",
                    help="comma-separated op types to probe")
    args = ap.parse_args()

    try:
        st, _ = req("GET", "/info")
        if st != 200:
            print("TD_UNREACHABLE: /info -> %s" % st)
            return 2
    except Exception as e:
        print("TD_UNREACHABLE: %s" % e)
        return 2

    results = []
    for op_type in args.ops.split(","):
        name = "_di_" + op_type.lower()
        try:
            r = run_case(name, op_type)
        except Exception as e:
            r = {"op": op_type, "error": str(e)[:160]}
        finally:
            destroy(sb_path(name))
        results.append(r)
        print(json.dumps(r, default=list))

    print("\n=== SUMMARY (rule 12 semantics; edge-set based) ===")
    for r in results:
        if "error" in r:
            print("%-14s ERROR: %s" % (r["op"], r["error"]))
            continue
        v = r["verdict"]
        print("%-14s initial=%s | plain:%s | slot0:%s | slot1:%s | beyond:%s"
              % (r["op"], r["initial"], v["plain_connect"],
                 v["occupied_slot0"], v["occupied_slot1"], v["beyond_count"]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
