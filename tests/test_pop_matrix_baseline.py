#!/usr/bin/env python3
"""
Offline tests for scripts/check_pop_matrix_baseline.py — no TD, no git needed
(check()/_validate()/classify_run() are pure functions over dicts).

Covers: baseline regression, exact match, modest improvement, implausible
gain, types that stop creating, missing types, malformed JSON structures,
the git-baseline loader, and the auto-commit classifier (identical /
metadata-only / evidence-changed).
"""

import os
import sys
import unittest
from unittest import mock

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from scripts.check_pop_matrix_baseline import (  # noqa: E402
    _validate,
    check,
    classify_run,
)


def make_matrix(ok_types, *, extra_error=(), extra_singeo=(), nocreate=(),
                type_count=None, build="TouchDesigner 2025.32460"):
    """Build a matrix dict with the real schema of docs/pop_matrix.json."""
    ok_types = list(ok_types)
    nocreate = list(nocreate)
    results = [{"type": t, "created": True, "category": "ok_con_input"} for t in ok_types]
    results += [{"type": t, "created": True, "category": "error_con_input"} for t in extra_error]
    results += [{"type": t, "created": True, "category": "sin_geometria_con_input"} for t in extra_singeo]
    results += [{"type": t, "created": False, "category": "no_creable"} for t in nocreate]
    return {
        "ok_con_input_count": len(ok_types),
        "categories": {
            "ok_con_input": ok_types,
            "error_con_input": list(extra_error),
            "sin_geometria_con_input": list(extra_singeo),
            "no_creable": nocreate,
        },
        "results": results,
        "type_count": type_count if type_count is not None else len(results),
        "td_build": build,
    }


class TestCheck(unittest.TestCase):
    def setUp(self):
        # Baseline of 5 ok types (mirrors the real gate shape, scaled down)
        self.base = make_matrix(
            ["boxPOP", "gridPOP", "spherePOP", "linePOP", "noisePOP"],
            extra_error=["rayPOP"], extra_singeo=["particlePOP"], nocreate=["engineoutPOP"],
        )

    def test_equal_baseline_passes(self):
        import json as _json
        live = _json.loads(_json.dumps(self.base))  # identical copy
        self.assertEqual(check(self.base, live), [])

    def test_count_regression_fails_and_lists_lost_types(self):
        live = make_matrix(["boxPOP", "gridPOP", "spherePOP", "linePOP"],
                           extra_error=["noisePOP", "rayPOP"],
                           extra_singeo=["particlePOP"], nocreate=["engineoutPOP"])
        failures = check(self.base, live)
        self.assertEqual(len(failures), 1)
        self.assertIn("REGRESSED", failures[0])
        self.assertIn("4 < baseline 5", failures[0])
        self.assertIn("noisePOP", failures[0])

    def test_modest_improvement_passes(self):
        live = make_matrix(
            ["boxPOP", "gridPOP", "spherePOP", "linePOP", "noisePOP", "circlePOP", "torusPOP"],
            extra_error=["rayPOP"], extra_singeo=["particlePOP", "toptoPOP"],
            nocreate=["engineoutPOP"],
        )
        self.assertEqual(check(self.base, live), [])

    def test_implausible_gain_fails(self):
        ok = ["boxPOP", "gridPOP", "spherePOP", "linePOP", "noisePOP"] + \
             [f"gen{i:02d}POP" for i in range(12)]
        live = make_matrix(ok, extra_error=["rayPOP"],
                           extra_singeo=["particlePOP"], nocreate=["engineoutPOP"])
        failures = check(self.base, live)
        self.assertTrue(any("GAINED" in f for f in failures))

    def test_previously_ok_type_stops_creating(self):
        live = make_matrix(["gridPOP", "spherePOP", "linePOP", "noisePOP"],
                           extra_error=["boxPOP", "rayPOP"],
                           extra_singeo=["particlePOP"], nocreate=["engineoutPOP", "boxPOP"])
        # boxPOP: moved to no_creable AND created=False
        failures = check(self.base, live)
        self.assertTrue(any("FAIL TO CREATE" in f and "boxPOP" in f for f in failures))

    def test_missing_type_fails(self):
        live = make_matrix(["boxPOP", "gridPOP", "spherePOP", "linePOP"],
                           extra_error=["rayPOP"], extra_singeo=["particlePOP"],
                           nocreate=["engineoutPOP"])
        # noisePOP absent from results entirely (type_count shrink)
        live["results"] = [r for r in live["results"] if r["type"] != "noisePOP"]
        live["type_count"] = len(live["results"])
        live["categories"]["ok_con_input"] = ["boxPOP", "gridPOP", "spherePOP", "linePOP"]
        live["ok_con_input_count"] = 4
        failures = check(self.base, live)
        self.assertTrue(any("missing from the live run" in f for f in failures))

    def test_build_change_warns_but_still_gates(self):
        live = make_matrix(["boxPOP", "gridPOP", "spherePOP", "linePOP"],
                           extra_error=["noisePOP", "rayPOP"],
                           extra_singeo=["particlePOP"], nocreate=["engineoutPOP"],
                           build="TouchDesigner 2026.10000")
        failures = check(self.base, live)
        self.assertEqual(len(failures), 1)  # count regression still enforced
        self.assertIn("REGRESSED", failures[0])


class TestValidate(unittest.TestCase):
    def test_valid_matrix_passes(self):
        m = make_matrix(["boxPOP", "gridPOP"])
        _validate(m, "test")  # no exception

    def test_missing_key_fails(self):
        m = make_matrix(["boxPOP"])
        del m["ok_con_input_count"]
        with self.assertRaises(SystemExit) as cm:
            _validate(m, "test")
        self.assertIn("missing keys", str(cm.exception))

    def test_malformed_category_fails(self):
        m = make_matrix(["boxPOP"])
        m["categories"]["error_con_input"] = None
        with self.assertRaises(SystemExit) as cm:
            _validate(m, "test")
        self.assertIn("malformed", str(cm.exception))

    def test_count_mismatch_fails(self):
        m = make_matrix(["boxPOP", "gridPOP"])
        m["ok_con_input_count"] = 5
        with self.assertRaises(SystemExit) as cm:
            _validate(m, "test")
        self.assertIn("inconsistent", str(cm.exception))

    def test_results_categories_mismatch_fails(self):
        m = make_matrix(["boxPOP", "gridPOP"])
        m["results"][0]["type"] = "phantomPOP"
        with self.assertRaises(SystemExit) as cm:
            _validate(m, "test")
        self.assertIn("mismatch", str(cm.exception))


class TestClassifyRun(unittest.TestCase):
    """The auto-commit classifier: evidence fingerprint vs per-run metadata."""

    def setUp(self):
        self.base = make_matrix(
            ["boxPOP", "gridPOP", "spherePOP", "linePOP", "noisePOP"],
            extra_error=["rayPOP"], extra_singeo=["particlePOP"],
            nocreate=["engineoutPOP"],
        )

    def test_identical_copy_is_identical(self):
        import json as _json
        live = _json.loads(_json.dumps(self.base))
        self.assertEqual(classify_run(self.base, live), "identical")

    def test_metadata_only_change_is_metadata_only(self):
        import json as _json
        live = _json.loads(_json.dumps(self.base))
        live["generated_at"] = "2099-01-01T00:00:00"
        live["sandbox"] = "/project1/other_sandbox"
        self.assertEqual(classify_run(self.base, live), "metadata-only")

    def test_build_change_alone_is_metadata_only(self):
        import json as _json
        live = _json.loads(_json.dumps(self.base))
        live["td_build"] = "TouchDesigner 2026.10000"
        # Same categories — a metadata refresh even across builds, as long as
        # no type moved. (A build change WITH category moves hits the branch
        # below: evidence-changed.)
        self.assertEqual(classify_run(self.base, live), "metadata-only")

    def test_category_move_is_evidence_changed(self):
        import json as _json
        live = _json.loads(_json.dumps(self.base))
        live["results"][0]["category"] = "error_con_input"
        live["categories"]["ok_con_input"][0] = "circlePOP"
        self.assertEqual(classify_run(self.base, live), "evidence-changed")

    def test_new_or_vanished_type_is_evidence_changed(self):
        import json as _json
        live = _json.loads(_json.dumps(self.base))
        extra = dict(live["results"][0])
        extra["type"] = "brandnewPOP"
        live["results"].append(extra)
        self.assertEqual(classify_run(self.base, live), "evidence-changed")


class TestGitBaselineLoader(unittest.TestCase):
    def test_load_git_baseline_reads_head(self):
        from scripts.check_pop_matrix_baseline import _load_git_baseline
        # The committed docs/pop_matrix.json at HEAD must load; verify its
        # internal consistency instead of hardcoding a count (the matrix is
        # regenerated per TD build, e.g. 101/80 on 2025.32460, 97/89 on .31760).
        baseline = _load_git_baseline("docs/pop_matrix.json")
        self.assertGreater(baseline["ok_con_input_count"], 0)
        self.assertGreater(baseline["type_count"], 0)
        self.assertLessEqual(baseline["ok_con_input_count"], baseline["type_count"])

    def test_load_git_baseline_missing_file_exits(self):
        from scripts.check_pop_matrix_baseline import _load_git_baseline
        with self.assertRaises(SystemExit):
            _load_git_baseline("docs/definitely_not_committed.json")


if __name__ == "__main__":
    unittest.main(verbosity=2)
