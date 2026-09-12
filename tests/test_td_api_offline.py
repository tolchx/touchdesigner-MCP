#!/usr/bin/env python3
"""
Offline regression tests for toe/src/TouchDesignerAPI.py (no TouchDesigner).

Covers the bugs verified live on TouchDesigner 2025.32460 (see
docs/POPs_CORRECTIONS.md and TESTING_FINDINGS_2026-09-10.md):

1. POST /parameters/set accepted only {"path", "updates":[...]} and silently
   did nothing with the documented {"path", "params":{...}} payload. Now both
   forms are accepted and an empty request returns an explicit 400 error.
2. POST /screenshot ignored the request body, so {"path": "/..."} answered
   "No TOP output found" even for a valid cooking TOP. Now an explicit path
   in the body is captured directly.
3. GET /info read non-existent attributes (tdu.Build, tduVersion, ...) and
   returned nulls. Now it reads the real app.* properties and project.filePath.

TouchDesigner builtins (op, app, project, parent, ui) are faked via module
attributes, and handlers run on instances created without __init__.

Run:  python -m unittest tests.test_td_api_offline -v
"""

import base64
import importlib
import json
import os
import sys
import types
import unittest

# ── Ensure toe/src is importable (TouchDesignerAPI + td_utils live there) ──
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOE_SRC = os.path.join(PROJECT_ROOT, "toe", "src")
for p in (PROJECT_ROOT, TOE_SRC):
    if p not in sys.path:
        sys.path.insert(0, p)

# td_utils imports `requests` at module level; stub it if not installed so the
# extension module can be imported offline.
try:
    import requests  # noqa: F401
except ImportError:
    sys.modules.setdefault("requests", types.ModuleType("requests"))

import TouchDesignerAPI  # noqa: E402


class _FakePar:
    """Minimal stand-in for a TouchDesigner Par object."""

    def __init__(self, name, val=0.0, style="Float"):
        self.name = name
        self.val = val
        self.style = style
        self.expr = ""
        self.pulsed = False

    def eval(self):
        return self.val

    def pulse(self):
        self.pulsed = True


class _FakeOp:
    """Minimal stand-in for a TouchDesigner OP (supports .save())."""

    def __init__(self, path="/project1/out1", pars=None, optype="nullTOP"):
        self.path = path
        self.name = path.rsplit("/", 1)[-1]
        self.OPType = optype
        self.family = "TOP"
        # (filepath, bytes_written) pairs — content is snapshotted at save()
        # time because the handler deletes the temp file afterwards.
        self.save_calls = []
        par_bag = types.SimpleNamespace()
        for name, par in (pars or {}).items():
            setattr(par_bag, name, par)
        self.par = par_bag

    def save(self, filepath, *args, **kwargs):
        payload = b"\x89PNG-fake-image-data"
        with open(filepath, "wb") as f:
            f.write(payload)
        self.save_calls.append((filepath, payload))
        return True


class _OfflineAPI(TouchDesignerAPI.TouchDesignerAPI):
    """Handler host that skips __init__ and silences TD-only debug logging."""

    def __init__(self):  # noqa: D401 - deliberately does not call super().__init__
        pass

    def _debug_print(self, *args, **kwargs):
        pass


def _set_module_attr(name, value):
    """Set (or shadow) a module global, restoring the original on teardown."""
    original = getattr(TouchDesignerAPI, name, None)
    if value is None:
        if original is not None:
            delattr(TouchDesignerAPI, name)
        return original
    setattr(TouchDesignerAPI, name, value)
    return original


# ═══════════════════════════════════════════════════════════════════════════
# 1. POST /parameters/set
# ═══════════════════════════════════════════════════════════════════════════

class TestParametersSet(unittest.TestCase):
    def setUp(self):
        self.api = _OfflineAPI()
        self.par_amp = _FakePar("amp", val=0.5)
        self.op = _FakeOp("/project1/op1", pars={"amp": self.par_amp})
        self._orig_op = _set_module_attr("op", lambda path: self.op if path == self.op.path else None)

    def tearDown(self):
        _set_module_attr("op", self._orig_op)

    def _call(self, payload):
        response = {}
        request = {"data": json.dumps(payload)}
        result = self.api._handle_parameters_set(request, response)
        self.assertIs(result, response)
        body = json.loads(response["data"])
        return response, body

    # ── Sugerencias de parámetros (función pura, sin TD) ──────────────────

    def test_suggestions_exact_match(self):
        sug = self.api._parameter_suggestions("amp", ["amp", "phase", "freq"])
        self.assertEqual(sug, ["amp"])

    def test_suggestions_shared_prefix(self):
        sug = self.api._parameter_suggestions("phas", ["phase", "freq", "position"])
        self.assertIn("phase", sug)
        self.assertEqual(len(sug), 3)

    def test_suggestions_substring(self):
        sug = self.api._parameter_suggestions("amp", ["amp", "amplitude", "phase"])
        self.assertEqual(sug, ["amp"])

    def test_suggestions_typo_amplitud(self):
        sug = self.api._parameter_suggestions("amplitud", ["amp", "phase", "freq", "position", "rate"])
        self.assertTrue(len(sug) >= 1)
        self.assertIn("amp", sug)

    def test_suggestions_empty_request(self):
        self.assertEqual(self.api._parameter_suggestions("", ["amp"]), [])
        self.assertEqual(self.api._parameter_suggestions(None, ["amp"]), [])
        self.assertEqual(self.api._parameter_suggestions("amp", []), [])

    def test_suggestions_case_insensitive(self):
        sug = self.api._parameter_suggestions("AMP", ["amp", "phase"])
        self.assertEqual(sug, ["amp"])

    # ── Handler: aplicación y validación ─────────────────────────────────

    def test_updates_array_is_applied(self):
        """Canonical form {"path", "updates":[...]} keeps working."""
        response, body = self._call({
            "path": "/project1/op1",
            "updates": [{"name": "amp", "value": 0.9}],
        })
        self.assertEqual(response["statusCode"], 200)
        self.assertEqual(len(body["updated"]), 1)
        self.assertEqual(body.get("missing", []), [])
        self.assertEqual(body.get("invalid", []), [])
        self.assertEqual(self.par_amp.val, 0.9)

    def test_params_dict_shorthand_is_applied(self):
        """Regression: the documented {"path", "params":{...}} payload used to
        return {"updated": [], "missing": [], "transactional": true} and change
        nothing. It must now be normalized to updates[] and applied."""
        response, body = self._call({
            "path": "/project1/op1",
            "params": {"amp": 0.7},
        })
        self.assertEqual(response["statusCode"], 200)
        self.assertEqual(len(body["updated"]), 1)
        self.assertEqual(body["updated"][0]["name"], "amp")
        self.assertEqual(body.get("missing", []), [])
        self.assertEqual(body.get("invalid", []), [])
        self.assertEqual(self.par_amp.val, 0.7)

    def test_missing_both_forms_returns_explicit_error(self):
        """Regression: no updates and no params must be an explicit error,
        never a silent empty success."""
        response, body = self._call({"path": "/project1/op1"})
        self.assertEqual(response["statusCode"], 400)
        self.assertIn("error", body)
        self.assertIn("No parameter updates", body["error"])

    def test_empty_params_returns_explicit_error(self):
        response, body = self._call({"path": "/project1/op1", "params": {}})
        self.assertEqual(response["statusCode"], 400)
        self.assertIn("error", body)

    def test_empty_updates_returns_explicit_error(self):
        response, body = self._call({"path": "/project1/op1", "updates": []})
        self.assertEqual(response["statusCode"], 400)
        self.assertIn("error", body)

    def test_unknown_operator_returns_404(self):
        response, body = self._call({
            "path": "/nope",
            "updates": [{"name": "amp", "value": 1}],
        })
        self.assertEqual(response["statusCode"], 404)
        self.assertIn("Operator not found", body["error"])

    def test_unknown_param_returns_suggestions_instead_of_silent_empty(self):
        """Regression: un nombre inexistente (ej. 'amplitud') no debe ser
        ignorado en silencio. El handler debe devolver 'invalid' con sugerencias."""
        response, body = self._call({
            "path": "/project1/op1",
            "updates": [{"name": "amplitud", "value": 1}],
        })
        # Transaccional por defecto → error 400, rollback, nada aplicado.
        self.assertEqual(response["statusCode"], 400)
        self.assertIn("error", body)
        self.assertIn("amplitud", body["error"])
        self.assertIn("amp", body["error"])
        self.assertEqual(self.par_amp.val, 0.5)  # sin cambios

    def test_invalid_structure_on_unknown_param(self):
        """Con transactional=False, los válidos se aplican y los inválidos
        van en 'invalid' con sugerencias."""
        response, body = self._call({
            "path": "/project1/op1",
            "updates": [
                {"name": "amp", "value": 0.8},
                {"name": "amplitud", "value": 1},
            ],
            "transactional": False,
        })
        self.assertEqual(response["statusCode"], 200)
        # 'amp' existe → aplicado; 'amplitud' no → invalid.
        self.assertEqual(len(body["updated"]), 1)
        self.assertEqual(body["updated"][0]["name"], "amp")
        self.assertEqual(self.par_amp.val, 0.8)
        self.assertIn("invalid", body)
        invalid_names = [item["name"] for item in body["invalid"] if item["name"]]
        self.assertIn("amplitud", invalid_names)
        invalid_amp = next(item for item in body["invalid"] if item["name"] == "amplitud")
        self.assertEqual(invalid_amp["reason"], "unknown_parameter")
        self.assertIn("amp", invalid_amp["suggestions"])
        self.assertIn("note", invalid_amp)

    def test_unknown_param_with_suggestions_in_error_message(self):
        """El mensaje de error transaccional debe incluir las sugerencias.
        El fake solo tiene 'amp', así que 'ph' sugiere 'amp'."""
        response, body = self._call({
            "path": "/project1/op1",
            "updates": [{"name": "ph", "value": 1}],
        })
        self.assertEqual(response["statusCode"], 400)
        error = body["error"]
        self.assertIn("ph", error)
        self.assertIn("amp", error)
        self.assertIn("No parameters were changed", body.get("note", ""))

    def test_pulse_param_is_pulsed(self):
        par_pulse = _FakePar("cook", style="Pulse")
        self.op.par = types.SimpleNamespace(amp=self.par_amp, cook=par_pulse)
        response, body = self._call({
            "path": "/project1/op1",
            "updates": [{"name": "cook", "value": 1}],
        })
        self.assertEqual(response["statusCode"], 200)
        self.assertTrue(par_pulse.pulsed)

    def test_missing_name_in_update_reported(self):
        response, body = self._call({
            "path": "/project1/op1",
            "updates": [{"value": 1}],
            "transactional": False,
        })
        self.assertEqual(response["statusCode"], 200)
        self.assertIn("invalid", body)
        self.assertTrue(any(item.get("reason") == "missing_name" for item in body["invalid"]))


# ═══════════════════════════════════════════════════════════════════════════
# 2. POST /screenshot
# ═══════════════════════════════════════════════════════════════════════════

class TestScreenshotPost(unittest.TestCase):
    def setUp(self):
        self.api = _OfflineAPI()
        self.op = _FakeOp("/project1/sandbox/out1")
        self._orig_op = _set_module_attr("op", lambda path: self.op if path == self.op.path else None)

    def tearDown(self):
        _set_module_attr("op", self._orig_op)

    def _call(self, payload):
        response = {}
        request = {"data": json.dumps(payload) if payload is not None else ""}
        result = self.api._handle_screenshot_post(request, response)
        self.assertIs(result, response)
        body = json.loads(response["data"])
        return response, body

    def test_explicit_path_in_body_is_captured(self):
        """Regression: a valid TOP path in the body used to be ignored and the
        handler answered "No TOP output found". The exact operator must now be
        resolved and captured."""
        response, body = self._call({"path": "/project1/sandbox/out1"})
        self.assertEqual(response["statusCode"], 200)
        self.assertTrue(body.get("success"), msg=body)
        self.assertEqual(body["path"], "/project1/sandbox/out1")
        self.assertEqual(body["format"], "png")
        self.assertEqual(len(self.op.save_calls), 1)
        filepath, payload = self.op.save_calls[0]
        self.assertTrue(filepath.endswith(".png"))
        self.assertEqual(body["image"], base64.b64encode(payload).decode())

    def test_unknown_path_reports_operator_not_found(self):
        response, body = self._call({"path": "/does/not/exist"})
        self.assertEqual(response["statusCode"], 200)
        self.assertFalse(body.get("success"))
        self.assertIn("Operator not found", body.get("error", ""))

    def test_empty_body_falls_back_without_crashing(self):
        """Without a body the legacy pane heuristic runs; offline (no ui/op
        builtins) it must degrade to a JSON error, never a crash."""
        response, body = self._call(None)
        self.assertEqual(response["statusCode"], 200)
        self.assertIn("success", body)


# ═══════════════════════════════════════════════════════════════════════════
# 3. GET /info
# ═══════════════════════════════════════════════════════════════════════════

class TestInfo(unittest.TestCase):
    def setUp(self):
        self.api = _OfflineAPI()
        self.app = types.SimpleNamespace(
            build="2025.32460",
            version="099",
            product="TouchDesigner",
            commercial=1,
            osName="Windows",
            osVersion="10 64 Bit",
            releaseType="official",
        )
        self.project = types.SimpleNamespace(
            filePath="C:/projects/demo.toe",
            cookRate=60.0,
        )
        self._orig_app = _set_module_attr("app", self.app)
        self._orig_project = _set_module_attr("project", self.project)

    def tearDown(self):
        _set_module_attr("app", self._orig_app)
        _set_module_attr("project", self._orig_project)

    def _call(self):
        response = {}
        result = self.api._handle_info(response)
        self.assertIs(result, response)
        return response, json.loads(response["data"])

    def test_real_app_properties_are_reported(self):
        """Regression: build/version/commercial/platform/release/projectPath
        used to be null because the handler read non-existent attributes."""
        response, info = self._call()
        self.assertEqual(response["statusCode"], 200)
        # Shape completo — todas las claves presentes con tipos correctos
        expected_keys = {
            "build", "version", "product", "commercial", "platform",
            "osVersion", "release", "projectPath", "projectFPS",
        }
        self.assertEqual(set(info.keys()), expected_keys)
        self.assertIsInstance(info["build"], str)
        self.assertIsInstance(info["product"], str)
        self.assertIsInstance(info["commercial"], bool)
        self.assertIsInstance(info["platform"], str)
        self.assertIsInstance(info["release"], str)
        self.assertIsInstance(info["projectPath"], str)
        self.assertIsInstance(info["projectFPS"], float)
        # Valores derivados en el mock (filePath y release existen)
        self.assertEqual(info["build"], "2025.32460")
        self.assertEqual(info["product"], "TouchDesigner")
        self.assertTrue(info["commercial"])
        self.assertEqual(info["platform"], "Windows")
        self.assertEqual(info["release"], "official")
        self.assertEqual(info["projectPath"], "C:/projects/demo.toe")
        self.assertEqual(info["projectFPS"], 60.0)

    def test_missing_attributes_degrade_to_null_not_500(self):
        self.app = types.SimpleNamespace()
        self.project = types.SimpleNamespace()
        _set_module_attr("app", self.app)
        _set_module_attr("project", self.project)
        response, info = self._call()
        self.assertEqual(response["statusCode"], 200)
        self.assertIsNone(info["build"])
        self.assertIsNone(info["platform"])
        self.assertIsNone(info["projectPath"])

    def test_release_and_projectpath_derived_when_attrs_missing(self):
        """TD 2025.32460: app.release y project.filePath no existen, pero se
        pueden derivar de app.build y project.folder+project.name. El handler
        debe devolver valores reales sin inventar."""
        self.app = types.SimpleNamespace(
            build="2025.32460",
            version="099",
            product="TouchDesigner",
            commercial=1,
            osName="Windows",
            osVersion="10",
        )
        self.project = types.SimpleNamespace(
            name="TouchDesignerAPI.1.toe",
            folder="C:/Users/Tolch/Documents/AI_Code/Touchdesigner_MCP/Main/toe",
            cookRate=60.0,
        )
        _set_module_attr("app", self.app)
        _set_module_attr("project", self.project)
        response, info = self._call()
        self.assertEqual(response["statusCode"], 200)
        self.assertEqual(info["build"], "2025.32460")
        # release derivado de app.build (ya que app.release no existe)
        self.assertEqual(info["release"], "2025.32460")
        # projectPath derivado de project.folder + project.name
        self.assertEqual(
            info["projectPath"],
            "C:/Users/Tolch/Documents/AI_Code/Touchdesigner_MCP/Main/toe/TouchDesignerAPI.1.toe",
        )


if __name__ == "__main__":
    unittest.main()
