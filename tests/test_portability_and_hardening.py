#!/usr/bin/env python3
"""Portability + hardening regression suite (no TouchDesigner required).

Covers three findings from the 2026-09-24 competitor-community audit, mapped to
this repo's own code:

1. PORTABILITY — the TD bridge and the Web2Touch relay carried absolute paths of
   one machine (``C:\\Users\\Tolch\\...``). A third party installing this project
   would get 404s on every static route, and the whole "ship it to a client"
   story dies there. The guard below fails if any of those paths comes back.
2. TRAVERSAL — a static route that resolves ``/assets/../../algo`` is a file
   disclosure bug, not a feature.
3. CODE INJECTION — the relay turns client JSON into Python source executed
   inside TouchDesigner. Values must be serialized as literals, never
   interpolated: a value containing a quote would otherwise run arbitrary code.

Run:  python -m unittest tests.test_portability_and_hardening -v
"""

from __future__ import annotations

import ast
import os
import sys
import tempfile
import unittest
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
TOE_SRC = PROJECT_ROOT / "toe" / "src"
for _p in (str(PROJECT_ROOT), str(TOE_SRC)):
    if _p not in sys.path:
        sys.path.insert(0, _p)

import w2t_codec  # noqa: E402  (path set up above)
import TouchDesignerAPI as tdapi  # noqa: E402

# ---------------------------------------------------------------------------
# 1. Portability guard
# ---------------------------------------------------------------------------

#: Files that must stay installable on someone else's machine.
SHIPPABLE = [
    PROJECT_ROOT / "toe" / "src" / "TouchDesignerAPI.py",
    PROJECT_ROOT / "w2t_server.py",
    PROJECT_ROOT / "w2t_server_async.py",
    PROJECT_ROOT / "w2t_codec.py",
]

FORBIDDEN = (
    "C:\\Users\\Tolch",
    "C:/Users/Tolch",
    "/Users/tolch",
    "Documents\\AI_Code\\Touchdesigner_MCP\\Main",
)


class TestPortabilityGuard(unittest.TestCase):
    def test_no_machine_absolute_paths_in_shippable_files(self):
        offenders = []
        for path in SHIPPABLE:
            self.assertTrue(path.is_file(), f"falta {path}")
            text = path.read_text(encoding="utf-8", errors="replace")
            for needle in FORBIDDEN:
                if needle in text:
                    offenders.append(f"{path.name}: {needle}")
        self.assertEqual(
            offenders,
            [],
            "rutas absolutas de una maquina puntual en archivos que se entregan "
            "a terceros: " + "; ".join(offenders),
        )

    def test_bridge_resolves_fix_path_relative_to_repo(self):
        text = (PROJECT_ROOT / "w2t_server.py").read_text(encoding="utf-8")
        self.assertIn("_resolve_fix_path", text)
        self.assertIn("TDMCP_ENDPOINT_FIX", text)

    def test_static_roots_prefer_env_var(self):
        with tempfile.TemporaryDirectory() as tmp:
            marker = Path(tmp) / "dashboard.html"
            marker.write_text("<html>ok</html>", encoding="utf-8")
            old = os.environ.get("TDMCP_STATIC_ROOT")
            os.environ["TDMCP_STATIC_ROOT"] = tmp
            try:
                found = tdapi._resolve_static("dashboard.html")
                self.assertIsNotNone(found, "debe resolver por TDMCP_STATIC_ROOT")
                self.assertEqual(Path(found).resolve(), marker.resolve())
            finally:
                if old is None:
                    os.environ.pop("TDMCP_STATIC_ROOT", None)
                else:
                    os.environ["TDMCP_STATIC_ROOT"] = old

    def test_missing_static_returns_none_instead_of_a_dead_path(self):
        old = os.environ.pop("TDMCP_STATIC_ROOT", None)
        try:
            self.assertIsNone(tdapi._resolve_static("no_existe_xyz.html"))
        finally:
            if old is not None:
                os.environ["TDMCP_STATIC_ROOT"] = old


# ---------------------------------------------------------------------------
# 2. Traversal guard
# ---------------------------------------------------------------------------


class TestTraversalGuard(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        (self.root / "assets").mkdir()
        (self.root / "assets" / "app.js").write_text("console.log(1)", encoding="utf-8")
        (self.root / "index.html").write_text("<html>", encoding="utf-8")
        self.secret = self.root.parent / "secreto_fuera_del_root.txt"
        self.secret.write_text("SECRETO", encoding="utf-8")

    def tearDown(self):
        try:
            self.secret.unlink()
        except OSError:
            pass
        self._tmp.cleanup()

    def test_serves_file_inside_root(self):
        got = tdapi._safe_static(self.root, "/assets/app.js")
        self.assertIsNotNone(got)
        self.assertTrue(got.endswith("app.js"))

    def test_refuses_parent_traversal(self):
        self.assertIsNone(tdapi._safe_static(self.root, "/assets/../../etc/passwd"))
        self.assertIsNone(tdapi._safe_static(self.root, "/../secreto_fuera_del_root.txt"))

    def test_refuses_nul_and_empty(self):
        self.assertIsNone(tdapi._safe_static(self.root, "/assets/app.js\x00.png"))
        self.assertIsNone(tdapi._safe_static(self.root, ""))
        self.assertIsNone(tdapi._safe_static(self.root, "/"))

    def test_refuses_directory(self):
        self.assertIsNone(tdapi._safe_static(self.root, "/assets"))

    def test_w2t_codec_shares_the_same_rule(self):
        self.assertIsNotNone(w2t_codec.safe_static_path(self.root, "/assets/app.js"))
        self.assertIsNone(w2t_codec.safe_static_path(self.root, "/../secreto_fuera_del_root.txt"))
        self.assertIsNone(w2t_codec.safe_static_path(self.root, "/assets/../../../etc/hosts"))


# ---------------------------------------------------------------------------
# 3. Code-injection guard
# ---------------------------------------------------------------------------


class TestW2tCodecInjection(unittest.TestCase):
    def test_py_str_escapes_quotes_and_backslashes(self):
        self.assertEqual(w2t_codec.py_str('a"b'), '"a\\"b"')
        self.assertEqual(w2t_codec.py_str("a\\b"), '"a\\\\b"')
        self.assertEqual(w2t_codec.py_str("line\nbreak"), '"line\\nbreak"')

    def test_sanitize_id_strips_dangerous_chars(self):
        self.assertEqual(w2t_codec.sanitize_id('x"; import os #'), "x import os ")
        self.assertEqual(w2t_codec.sanitize_id("a\nb"), "ab")

    def test_hostile_value_cannot_break_out_of_the_literal(self):
        """The generated code must stay inert for ANY client payload.

        The proof: parse the generated source and read the literal back. If a
        value could escape its quotes, the AST would contain extra statements
        (or the literal would differ from the input).
        """
        hostile = '"); __import__("os").system("echo pwned"); ("'
        code = w2t_codec.build_neon_upsert_code(
            {"id": "k1", "type": "t", "value": hostile, "timestamp": "1"}
        )

        tree = ast.parse(code)
        # Structure unchanged: imports, assignment, loop, if — no injected calls.
        call_names = [
            node.func.id
            for node in ast.walk(tree)
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Name)
        ]
        self.assertNotIn("__import__", call_names)
        self.assertNotIn("system", call_names)

        # The hostile payload survives as DATA, byte for byte.
        assigns = {
            node.targets[0].id: node.value.value
            for node in ast.walk(tree)
            if isinstance(node, ast.Assign)
            and isinstance(node.targets[0], ast.Name)
            and isinstance(node.value, ast.Constant)
        }
        self.assertEqual(assigns["cval"], hostile)

    def test_newline_in_value_does_not_create_a_statement(self):
        code = w2t_codec.build_neon_upsert_code(
            {"id": "k", "type": "t", "value": "a\nimport os\nos.system('x')"}
        )
        tree = ast.parse(code)
        self.assertNotIn(
            "__import__",
            [
                n.func.id
                for n in ast.walk(tree)
                if isinstance(n, ast.Call) and isinstance(n.func, ast.Name)
            ],
        )
        self.assertIn("import json", code)

    def test_no_raw_format_interpolation_left_in_the_async_relay(self):
        text = (PROJECT_ROOT / "w2t_server_async.py").read_text(encoding="utf-8")
        self.assertIn("build_neon_upsert_code", text)
        self.assertNotIn('cval=\\"{}\\"', text, "quedó interpolación cruda")


# ---------------------------------------------------------------------------
# 4. Runtime probe (honest null instead of a lying indicator)
# ---------------------------------------------------------------------------


class _FakeApp:
    def __init__(self, **kw):
        for k, v in kw.items():
            setattr(self, k, v)


class TestProbeRuntime(unittest.TestCase):
    def test_reports_cooking_off(self):
        rt = tdapi.probe_runtime(_FakeApp(cooking=False, fps=60))
        self.assertEqual(rt["cooking"], "off")
        self.assertEqual(rt["cooking_source"], "app.cooking")
        self.assertEqual(rt["fps"], 60.0)

    def test_reports_cooking_on(self):
        rt = tdapi.probe_runtime(_FakeApp(cooking=True))
        self.assertEqual(rt["cooking"], "on")

    def test_unknown_stays_null_never_invented(self):
        rt = tdapi.probe_runtime(_FakeApp())
        self.assertIsNone(rt["cooking"])
        self.assertIsNone(rt["cooking_source"])
        self.assertIsNone(rt["timeline_play"])
        self.assertIn("pid", rt)

    def test_always_returns_the_same_keys(self):
        keys = set(tdapi.probe_runtime(_FakeApp()).keys())
        self.assertEqual(
            keys,
            {"cooking", "cooking_source", "timeline_play", "fps", "pid"},
        )


if __name__ == "__main__":
    unittest.main()
