#!/usr/bin/env python3
"""
Baseline gate for the live POP matrix (nightly TD run).

Compares a freshly generated docs/pop_matrix.json against the GIT baseline
(the version committed at HEAD, read via `git show HEAD:docs/pop_matrix.json`
— never the working tree, so the comparison is stable while CI regenerates
the file). Fails CI when the live-evidence metric regresses:

  PRIMARY GATE
    results[].category == "ok_con_input"  →  ok_con_input_count

    A type stops being ok_con_input when it no longer cooks clean with a real
    boxPOP source per input (numPoints() > 0, errors() empty) — the "false
    green" the matrix v5 method exists to prevent.

  FAILS on:
    - ok_con_input drops below the baseline count (regression)
    - ok_con_input GAINS more than +10 (suspicious run — likely a broken
      gate, e.g. errors() not actually read after cook)
    - a type present in the baseline's ok_con_input list now fails to CREATE
      (type_count drop / no_creable) — hard signal, TD build changed shape
    - malformed or truncated JSON (must fail loudly, not pass silently)

  PASSes (with warning) when:
    - the live JSON is missing but SKIP_LIVE_REQUIRED=1 (explicit skip)
    - the TD build string changed AND ok_con_input did not regress — a new
      build legitimately reshuffles categories; count stability is still
      enforced

Exit codes: 0 pass · 1 gate failure · 2 harness/usage error.

Usage:
    python scripts/check_pop_matrix_baseline.py
    python scripts/check_pop_matrix_baseline.py --live docs/pop_matrix.json
    SKIP_LIVE_REQUIRED=1 python scripts/check_pop_matrix_baseline.py   # offline CI
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys

DEFAULT_MATRIX = "docs/pop_matrix.json"
MAX_OK_GAIN = 10


def _load_git_baseline(path: str) -> dict:
    """Read the matrix from git HEAD (the committed baseline)."""
    try:
        out = subprocess.run(
            ["git", "show", f"HEAD:{path}"],
            capture_output=True, text=True, check=True, encoding="utf-8",
        ).stdout
        return json.loads(out)
    except (subprocess.CalledProcessError, FileNotFoundError) as e:
        raise SystemExit(
            f"ERROR: cannot read baseline from git HEAD:{path} — {e}. "
            "Commit docs/pop_matrix.json first (that is the baseline)."
        )
    except json.JSONDecodeError as e:
        raise SystemExit(f"ERROR: baseline at HEAD:{path} is not valid JSON — {e}")


def _load_live(path: str, skip_env: str) -> dict | None:
    """Read the freshly generated matrix; None when explicitly skipped."""
    if not os.path.exists(path):
        if os.environ.get(skip_env) == "1":
            return None
        raise SystemExit(
            f"ERROR: live matrix {path} not found. Run "
            "`python toe/src/test_pop_matrix.py` first, or set "
            f"{skip_env}=1 to skip the live gate explicitly."
        )
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def _validate(d: dict, label: str) -> None:
    """Structural checks — a truncated run must fail loudly."""
    required = ["ok_con_input_count", "categories", "results", "type_count", "td_build"]
    missing = [k for k in required if k not in d]
    if missing:
        raise SystemExit(
            f"ERROR: {label} matrix is missing keys {missing} — regenerate it "
            "with `python toe/src/test_pop_matrix.py`."
        )
    cats = d["categories"]
    for cat in ("ok_con_input", "error_con_input", "sin_geometria_con_input", "no_creable"):
        if cat not in cats or not isinstance(cats[cat], list):
            raise SystemExit(
                f"ERROR: {label} matrix has malformed categories.{cat} — regenerate it."
            )
    n_ok = len(cats["ok_con_input"])
    if n_ok != d["ok_con_input_count"]:
        raise SystemExit(
            f"ERROR: {label} matrix inconsistent: ok_con_input_count="
            f"{d['ok_con_input_count']} but categories.ok_con_input has {n_ok} entries."
        )
    types = {r.get("type") for r in d["results"]}
    if types != {t for cat in cats.values() for t in cat}:
        raise SystemExit(
            f"ERROR: {label} matrix results/categories mismatch — regenerate it."
        )


def check(baseline: dict, live: dict) -> list[str]:
    """Return a list of failure reasons (empty = pass). Warnings printed separately."""
    failures: list[str] = []

    base_n = baseline["ok_con_input_count"]
    live_n = live["ok_con_input_count"]

    print(f"baseline (git HEAD): ok_con_input={base_n} types={baseline['type_count']} "
          f"build={baseline.get('td_build', '?')}")
    print(f"live               : ok_con_input={live_n} types={live['type_count']} "
          f"build={live.get('td_build', '?')}")

    build_changed = baseline.get("td_build") != live.get("td_build")
    if build_changed:
        print(f"WARNING: TD build changed "
              f"({baseline.get('td_build', '?')} -> {live.get('td_build', '?')}); "
              "category reshuffling is expected, count stability still enforced")

    # Primary gate: count regression
    if live_n < base_n:
        lost = sorted(set(baseline["categories"]["ok_con_input"])
                      - set(live["categories"]["ok_con_input"]))
        failures.append(
            f"ok_con_input REGRESSED: {live_n} < baseline {base_n}. "
            f"Lost from baseline: {', '.join(lost) if lost else '(none)'}"
        )

    # Sanity: implausible gain (probably a broken gate, e.g. errors() unread)
    if live_n > base_n + MAX_OK_GAIN:
        gained = sorted(set(live["categories"]["ok_con_input"])
                        - set(baseline["categories"]["ok_con_input"]))
        failures.append(
            f"ok_con_input GAINED {live_n - base_n} (>{MAX_OK_GAIN}) vs baseline "
            f"{base_n}: suspicious run. Newly 'ok': "
            f"{', '.join(gained) if gained else '(none)'}. "
            "Check that the run actually reads errors() after cook(force=True)."
        )

    # Hard signal: a previously-ok type that no longer even creates
    base_ok = set(baseline["categories"]["ok_con_input"])
    live_nocreate = (set(live["categories"]["no_creable"])
                     | {r.get("type") for r in live["results"]
                        if not r.get("created", True)})
    vanished = sorted(base_ok & live_nocreate)
    if vanished:
        failures.append(
            f"types previously ok_con_input now FAIL TO CREATE: {', '.join(vanished)} "
            "(hard regression — TD build likely changed shape)"
        )

    # Types lost entirely (build shrink)
    base_types = {r.get("type") for r in baseline["results"]}
    live_types = {r.get("type") for r in live["results"]}
    missing_types = sorted(base_types - live_types)
    if missing_types:
        failures.append(
            f"POP types present at baseline are missing from the live run: "
            f"{', '.join(missing_types)}"
        )

    return failures


def main() -> int:
    ap = argparse.ArgumentParser(description="Gate the nightly POP matrix run against the git baseline.")
    ap.add_argument("--live", default=DEFAULT_MATRIX,
                    help="freshly generated matrix (default: docs/pop_matrix.json)")
    ap.add_argument("--baseline-path", default=DEFAULT_MATRIX,
                    help="repo-relative path read from git HEAD for the baseline")
    args = ap.parse_args()

    baseline = _load_git_baseline(args.baseline_path)
    _validate(baseline, "baseline")
    live = _load_live(args.live, "SKIP_LIVE_REQUIRED")
    if live is None:
        print("SKIP_LIVE_REQUIRED=1 — live gate skipped (offline run).")
        print("POP MATRIX BASELINE GATE: SKIPPED")
        return 0
    _validate(live, "live")

    failures = check(baseline, live)
    if failures:
        print("\nPOP MATRIX BASELINE GATE: FAIL")
        for f in failures:
            # ASCII-only output: Windows consoles (cp1252/GBK) crash on Unicode glyphs
            print(f"  FAIL: {f}")
        return 1

    live_n = live["ok_con_input_count"]
    base_n = baseline["ok_con_input_count"]
    print("\nPOP MATRIX BASELINE GATE: PASS "
          f"(ok_con_input {live_n} vs baseline {base_n})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
