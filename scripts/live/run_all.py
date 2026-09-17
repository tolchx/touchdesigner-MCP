#!/usr/bin/env python3
"""Live runner: post each generated recipe script to /exec, collect reports."""
import glob
import json
import os
import sys
import urllib.request

BASE = "http://127.0.0.1:44444"


def post_exec(code: str) -> dict:
    req = urllib.request.Request(
        BASE + "/exec",
        data=json.dumps({"code": code}).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read().decode())


def main() -> int:
    scripts = sorted(glob.glob(os.path.join(os.path.dirname(__file__), "vis_*.py")))
    reports = {}
    rc = 0
    for path in scripts:
        name = os.path.basename(path)
        code = open(path, encoding="utf-8").read()
        try:
            res = post_exec(code)
            out = res.get("output", "")
            reports[name] = json.loads(out) if out.strip() else res
        except Exception as e:
            reports[name] = {"error": str(e)[:200]}
            rc = 1
        r = reports[name]
        if "error" in r or r.get("errors") or r.get("td_errors") or r.get("infoDAT_has_ERROR"):
            rc = 1
        print("== %s ==" % name)
        print(json.dumps(r, indent=1)[:900])
    with open(os.path.join(os.path.dirname(__file__), "live_reports.json"), "w", encoding="utf-8") as f:
        json.dump(reports, f, indent=1)
    return rc


if __name__ == "__main__":
    sys.exit(main())
