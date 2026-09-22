#!/usr/bin/env python3
"""
Live contract check for the additive keys introduced by audit fixes A1/A3.

CI gate (nightly): a TouchDesigner whose /verify or /healthcheck responses are
missing these keys is running a stale bridge — the build FAILS.

  GET  /verify?path=/...    -> requires errors_truncated, warnings_truncated
                               (bool) alongside error_count/warning_count
  GET  /healthcheck?path=/  -> requires forceCook (bool) at response level;
                               items carry cooked + pre_existing_errors when
                               forceCook was requested

Exit codes: 0 contract OK, 1 contract broken (missing keys / bad types),
2 TD unreachable. Never invents results.

Usage:
  python scripts/live/read_contract_live.py [--path /project1]
  python scripts/live/read_contract_live.py --selftest   # offline, no TD
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


def _check_verify(payload):
    """Return list of contract problems for a /verify payload ([] = OK)."""
    problems = []
    for key in ("errors_truncated", "warnings_truncated"):
        if key not in payload:
            problems.append(f"/verify missing additive key '{key}' (A1 fix) — stale bridge?")
        elif not isinstance(payload[key], bool):
            problems.append(f"/verify '{key}' must be bool, got {type(payload[key]).__name__}")
    for key in ("error_count", "warning_count"):
        if key not in payload:
            problems.append(f"/verify missing key '{key}'")
    return problems


def _check_healthcheck(payload):
    """Return list of contract problems for a /healthcheck payload ([] = OK)."""
    problems = []
    if "forceCook" not in payload:
        problems.append("/healthcheck missing additive key 'forceCook' (A3 fix) — stale bridge?")
    elif not isinstance(payload["forceCook"], bool):
        problems.append(f"/healthcheck 'forceCook' must be bool, got {type(payload['forceCook']).__name__}")
    for key in ("ok", "issueCount", "issues"):
        if key not in payload:
            problems.append(f"/healthcheck missing key '{key}'")
    return problems


def run_selftest():
    """Validate the checker logic against canned payloads (offline)."""
    good_verify = {"error_count": 0, "warning_count": 1,
                   "errors_truncated": False, "warnings_truncated": False}
    stale_verify = {"error_count": 0, "warning_count": 0}  # pre-A1 bridge
    good_hc = {"ok": True, "issueCount": 0, "issues": [], "forceCook": False}
    stale_hc = {"ok": True, "issueCount": 0, "issues": []}  # pre-A3 bridge

    results = [
        ("POSITIVE verify (has A1 keys)", _check_verify(good_verify) == []),
        ("NEGATIVE stale verify (no A1 keys)", _check_verify(stale_verify) == [
            "/verify missing additive key 'errors_truncated' (A1 fix) — stale bridge?",
            "/verify missing additive key 'warnings_truncated' (A1 fix) — stale bridge?"]),
        ("POSITIVE healthcheck (has A3 key)", _check_healthcheck(good_hc) == []),
        ("NEGATIVE stale healthcheck (no A3 key)", _check_healthcheck(stale_hc) == [
            "/healthcheck missing additive key 'forceCook' (A3 fix) — stale bridge?"]),
        ("NEGATIVE wrong type (truncated is int)", _check_verify(
            {"error_count": 0, "warning_count": 0,
             "errors_truncated": 0, "warnings_truncated": 0}) != []),
    ]
    ok = True
    for label, passed in results:
        print(f"{'PASS ' if passed else 'FAIL '}{label}")
        ok = ok and passed
    print()
    print("ALL OK - checker logic verified." if ok else "FAILED:", [l for l, p in results if not p])
    return 0 if ok else 1


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--path", default="/project1", help="container to read (default /project1)")
    ap.add_argument("--selftest", action="store_true", help="offline checker-logic test")
    args = ap.parse_args()

    if args.selftest:
        return run_selftest()

    try:
        st, _ = req("GET", "/info")
        if st != 200:
            print("TD_UNREACHABLE: /info -> %s" % st)
            return 2
    except Exception as e:
        print("TD_UNREACHABLE: %s" % e)
        return 2

    problems = []

    st, body = req("GET", "/verify?path=%s" % args.path)
    if st != 200:
        problems.append(f"/verify returned HTTP {st}: {json.dumps(body)[:160]}")
    else:
        v = _check_verify(body)
        problems.extend(v)
        print(f"verify: error_count={body.get('error_count')} "
              f"errors_truncated={body.get('errors_truncated')} "
              f"warnings_truncated={body.get('warnings_truncated')}")

    st, body = req("GET", "/healthcheck?path=%s" % args.path)
    if st != 200:
        problems.append(f"/healthcheck returned HTTP {st}: {json.dumps(body)[:160]}")
    else:
        h = _check_healthcheck(body)
        problems.extend(h)
        print(f"healthcheck: ok={body.get('ok')} forceCook={body.get('forceCook')} "
              f"issueCount={body.get('issueCount')}")

    print()
    if problems:
        print("CONTRACT BROKEN:")
        for p in problems:
            print("  -", p)
        return 1
    print("CONTRACT OK - A1/A3 additive keys present.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
