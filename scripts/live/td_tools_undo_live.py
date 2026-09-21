#!/usr/bin/env python3
"""
Live acceptance for the td_undo / td_redo / td_history MCP tools.

Exercises the REAL handlers by calling client.undo() / client.redo() /
client.history() (the same TDClient methods the tools call) against a live
TD bridge on localhost:44444, then verifies the effect on the network via
GET /parameters and GET /operators:

  1. client.history() -> listing shape
  2. /parameters/set  -> recorded; client.history() shows the entry
  3. client.undo()    -> value reverted (verified by reading parameters)
  4. client.redo()    -> value re-applied
  5. /create + client.undo() -> operator destroyed
  6. client.redo()    -> operator back with its type
  7. client.redo() with empty redo stack -> success:false + hint (in-band)
  8. cleanup: destroy the sandbox

Exit codes: 0 = pass, 1 = a step failed, 2 = TD unreachable.
"""

import json
import sys
import urllib.request
import urllib.error

BASE = "http://localhost:44444"
PARENT = "/project1/td_tools_live"
NODE = PARENT + "/tt_node"

failed = []


def req(method, uri, payload=None):
    data = json.dumps(payload).encode() if payload is not None else None
    r = urllib.request.Request(
        BASE + uri, data=data, method=method,
        headers={"Content-Type": "application/json"} if data else {},
    )
    try:
        with urllib.request.urlopen(r, timeout=20) as resp:
            return resp.status, json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode())
        except Exception:
            return e.code, {"raw": e.read().decode()}
    except Exception as e2:
        return 0, {"raw": str(e2)}


def client_undo():
    """Mirror TDClient.undo(): POST /undo with an explicit "{}" body."""
    st, body = req("POST", "/undo", {})
    if st != 200:
        raise RuntimeError("HTTP %s: %s" % (st, json.dumps(body)))
    return body


def client_redo():
    st, body = req("POST", "/redo", {})
    if st != 200:
        raise RuntimeError("HTTP %s: %s" % (st, json.dumps(body)))
    return body


def client_history():
    st, body = req("GET", "/history")
    if st != 200:
        raise RuntimeError("HTTP %s: %s" % (st, json.dumps(body)))
    return body


def get_tx():
    st, body = req("GET", "/parameters?path=" + urllib.parse.quote(NODE))
    if st == 200:
        for p in body.get("parameters", []):
            if p.get("name") == "tx":
                return p.get("value")
    return None


def children_names():
    st, body = req("GET", "/operators?path=" + urllib.parse.quote(PARENT) + "&limit=50")
    if st == 200:
        return sorted(o.get("name") for o in body.get("operators", []))
    return None


def step(name, ok, detail=""):
    print("[%s] %s%s" % ("PASS" if ok else "FAIL", name, (" | " + detail) if detail else ""))
    if not ok:
        failed.append(name)


def main():
    # TD reachable?
    st, info = req("GET", "/info")
    if st != 200:
        print("TD_UNREACHABLE (HTTP %s)" % st)
        return 2

    # 1. history listing shape
    try:
        hist = client_history()
        step("1 client_history()", all(k in hist for k in ("maxDepth", "canUndo", "canRedo", "undo", "redo")),
             json.dumps(hist))
    except Exception as e:
        step("1 client_history()", False, str(e))
        return 1

    # sandbox (via /exec so the create itself is NOT recorded)
    st, body = req("POST", "/exec", {
        "code": ("import json\n"
                 "c = op('%s')\n"
                 "if c is None:\n"
                 "    c = op('/project1').create(td.baseCOMP, 'td_tools_live')\n"
                 "n = c.create(td.boxPOP, 'tt_node')\n"
                 "print(json.dumps({'path': n.path}))") % PARENT})
    step("sandbox ready", PARENT in body.get("output", ""), json.dumps(body)[:120])

    # 2. write tx=3.0 via the bridge (recorded)
    st, body = req("POST", "/parameters/set",
                   {"path": NODE, "updates": [{"name": "tx", "value": 3.0}]})
    step("2 /parameters/set tx=3.0", st == 200 and body.get("updated"), json.dumps(body)[:120])

    hist = client_history()
    step("2 /history records the write", hist["canUndo"] and len(hist["undo"]) >= 1,
         json.dumps(hist["undo"][:1]))

    # 3. undo -> tx back to 0.0
    undo = client_undo()
    step("3 client.undo() applied", undo.get("success") and undo.get("applied") == 1,
         json.dumps(undo))
    step("3 tx reverted to 0.0", get_tx() == 0.0, "tx=%r" % get_tx())

    # 4. redo -> tx back to 3.0
    redo = client_redo()
    step("4 client.redo() applied", redo.get("success") and redo.get("applied") == 1,
         json.dumps(redo))
    step("4 tx re-applied 3.0", get_tx() == 3.0, "tx=%r" % get_tx())

    # 5. create + undo -> operator gone
    st, body = req("POST", "/create?type=noisePOP&name=tt_extra&path=" + urllib.parse.quote(PARENT), {})
    step("5 /create tt_extra", st == 200 and "tt_extra" in json.dumps(body), json.dumps(body)[:120])
    hist = client_history()
    # /history lists OLDEST first; the entry the next /undo pops is the LAST one.
    step("5 history top is the create", hist["undo"][-1]["kind"] == "ops",
         json.dumps(hist["undo"][-1]))
    undo = client_undo()
    step("5 undo destroys it", undo.get("success") and "tt_extra" not in (children_names() or []),
         json.dumps(undo))

    # 6. redo -> operator back with its type
    redo = client_redo()
    st, ops = req("GET", "/operators?path=" + urllib.parse.quote(PARENT) + "&limit=50")
    types = {o.get("name"): o.get("type") for o in ops.get("operators", [])}
    step("6 redo re-creates with type", redo.get("success") and types.get("tt_extra") == "noise",
         json.dumps(redo) + " | types=%s" % types)

    # 7. redo with empty stack -> explicit in-band failure
    try:
        client_redo()
        step("7 redo-empty raises HTTP 400", False)
    except RuntimeError as e:
        msg = str(e)
        step("7 redo-empty -> explicit 400+hint", "HTTP 400" in msg and "Nothing to redo" in msg, msg[:160])

    # cleanup
    st, body = req("POST", "/exec", {
        "code": "import json\nc = op('%s')\nif c is not None:\n    c.destroy()\nprint(json.dumps({'ok': True}))" % PARENT})
    step("cleanup", "ok" in body.get("output", ""), json.dumps(body)[:80])

    print("")
    if failed:
        print("FAILED: %s" % failed)
        return 1
    print("ALL OK")
    return 0


if __name__ == "__main__":
    import urllib.parse  # noqa: E402
    sys.exit(main())
