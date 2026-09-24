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


class _FakeConnector:
    """Fake TD connector: `connections` is a list of refs exposing `.owner`."""

    def __init__(self, owner=None):
        self.connections = []
        if owner is not None:
            self.connections.append(types.SimpleNamespace(owner=owner))


class _FakeOp:
    """Minimal stand-in for a TouchDesigner OP (supports .save())."""

    def __init__(self, path="/project1/out1", pars=None, optype="nullTOP"):
        self.path = path
        self.name = path.rsplit("/", 1)[-1]
        self.type = optype
        self.OPType = optype
        self.family = "TOP"
        # (filepath, bytes_written) pairs — content is snapshotted at save()
        # time because the handler deletes the temp file afterwards.
        self.save_calls = []
        self.children = []
        self._input_connectors = [_FakeConnector()]
        self._output_connectors = [_FakeConnector()]
        par_bag = types.SimpleNamespace()
        for name, par in (pars or {}).items():
            setattr(par_bag, name, par)
        self.par = par_bag

    @property
    def inputConnectors(self):
        return self._input_connectors

    @property
    def outputConnectors(self):
        return self._output_connectors

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
        # Shape completo — todas las claves presentes con tipos correctos.
        # "readCache" (hits/misses/entries) es aditiva desde el item 05 del backlog.
        # "runtime" + "bridge" son aditivas (auditoria TWOZERO 2026-09-24): el
        # estado de ejecución en vivo y la identidad/versión del bridge, para
        # poder distinguir "conectado" de "conectado pero TD no cocina".
        expected_keys = {
            "build", "version", "product", "commercial", "platform",
            "osVersion", "release", "projectPath", "projectFPS", "readCache",
            "runtime", "bridge",
        }
        self.assertEqual(set(info.keys()), expected_keys)
        self.assertIsInstance(info["readCache"], dict)
        self.assertEqual(
            set(info["readCache"].keys()), {"hits", "misses", "entries"})
        # Estado de ejecución: mismas claves siempre, y null honesto si TD no
        # expone la señal (nunca un valor inventado).
        self.assertEqual(
            set(info["runtime"].keys()),
            {"cooking", "cooking_source", "cooking_allowed", "timeline_play", "target_fps", "pid"},
        )
        self.assertIn(info["runtime"]["cooking"], (None, "on", "off"))
        # Identidad del bridge: versión + uptime, sin rutas de la máquina.
        self.assertEqual(info["bridge"]["component"], "TouchDesignerAPI")
        self.assertIsInstance(info["bridge"]["version"], str)
        self.assertGreaterEqual(info["bridge"]["uptime_s"], 0)
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
        self.assertEqual(info["projectPath"], "C:/Users/Tolch/Documents/AI_Code/Touchdesigner_MCP/Main/toe/TouchDesignerAPI.1.toe",
        )


# ═══════════════════════════════════════════════════════════════════════════
# 4. Pagination on GET /operators, /find, /connections
# ═══════════════════════════════════════════════════════════════════════════

class TestPagination(unittest.TestCase):
    """Safe default pagination (limit=500) on the three large read endpoints.

    - existing keys preserved, pagination metadata added
    - invalid limit/offset -> 400 with a hint
    - offset beyond total -> empty list + real total
    - oversized limit capped to 5000
    """

    def setUp(self):
        self.api = _OfflineAPI()
        # A fake /project1 whose .children is our 6 fake ops.
        self.project1 = _FakeOp("/project1", optype="project1")
        self.project1.OPType = "project1"
        self.project1.type = "project1"
        self.children = [
            _FakeOp(f"/project1/op{i}", optype=f"op{i}") for i in range(6)
        ]
        self.project1.children = self.children
        self._orig_op = _set_module_attr(
            "op",
            lambda path: (
                self.project1 if path in ("/project1", "/") else
                (self.children[int(path.rsplit("/", 1)[-1][3:]) - 1]
                 if path.startswith("/project1/op") and len(path.rsplit("/", 1)[-1]) > 3
                 else None)
            ),
        )

    def tearDown(self):
        _set_module_attr("op", self._orig_op)

    # ── small helper: build a HTTP request dict the way OnHTTPRequest does ──

    def _query_request(self, qs):
        """Return a request dict that OnHTTPRequest would produce for the given
        query string (parse_qs -> pars dict)."""
        import urllib.parse as up
        parsed = up.urlparse("/operators")
        return {"pars": up.parse_qs(parsed.query + ("&" + qs if qs else ""))}

    def _wire_chain(self):
        """Wire op0->op1->...->op5 through input 0 (5 edges over 6 ops)."""
        for i in range(1, len(self.children)):
            self.children[i]._input_connectors[0] = _FakeConnector(self.children[i - 1])

    def _dispatch_connections(self, qs, recurse=False):
        """Parse limit/offset the way OnHTTPRequest does, then call the handler."""
        import TouchDesignerAPI as tmod
        response = {}
        limit = tmod.TouchDesignerAPI._parse_positive_int(
            self.api, self._query_request(qs)["pars"].get("limit", ["500"])[0], default=500)
        offset = tmod.TouchDesignerAPI._parse_nonnegative_int(
            self.api, self._query_request(qs)["pars"].get("offset", ["0"])[0], default=0)
        return self.api._handle_connections(self._get_path(), recurse, response,
                                            limit=limit, offset=offset)

    def _find_request(self, qs):
        """Build the `pars` dict as _handle_find expects it (scalar strings,
        matching OnHTTPRequest's urllib.parse_qs -> single-element unwrap)."""
        import urllib.parse as up
        parsed = up.urlparse("/find?" + qs)
        raw = up.parse_qs(parsed.query)
        find_params = {}
        for k, v in raw.items():
            find_params[k] = v[0] if len(v) == 1 else v
        return find_params

    # ── GET /find ──────────────────────────────────────────────────────────

    def test_find_default_meta(self):
        """find includes base in recursive=True default, so total = children+1."""
        response = {}
        find_params = self._find_request("")
        result = self.api._handle_find({"pars": find_params}, response)
        self.assertEqual(result["statusCode"], 200)
        body = json.loads(result["data"])
        self.assertEqual(body["total"], 7)  # 6 children + self (recursive default True)
        self.assertEqual(body["returned"], 7)
        self.assertEqual(body["limit"], 500)
        self.assertEqual(body["offset"], 0)
        self.assertFalse(body["truncated"])
        self.assertEqual(len(body["results"]), 7)

    def test_find_paginated(self):
        """find total includes self (recursive default), so 6 children + self = 7."""
        response = {}
        find_params = self._find_request_with_path("limit=2&offset=3")
        result = self.api._handle_find({"pars": find_params}, response)
        self.assertEqual(result["statusCode"], 200)
        body = json.loads(result["data"])
        self.assertEqual(body["total"], 7)
        self.assertEqual(body["returned"], 2)
        self.assertEqual(body["offset"], 3)
        self.assertTrue(body["truncated"])

    def test_find_offset_beyond_total(self):
        """offset beyond include-self total returns empty + real total."""
        response = {}
        find_params = self._find_request_with_path("offset=99")
        result = self.api._handle_find({"pars": find_params}, response)
        self.assertEqual(result["statusCode"], 200)
        body = json.loads(result["data"])
        self.assertEqual(body["total"], 7)
        self.assertEqual(body["returned"], 0)
        self.assertEqual(body["results"], [])

    def _find_request_with_path(self, qs):
        """Build a find pars dict with path=/project1 already included,
        mirroring what OnHTTPRequest produces when the URL is /find?path=/project1&..."""
        import urllib.parse as up
        full_qs = ("path=" + up.quote(self._get_path(), safe="") + "&" + qs) if qs else ("path=" + up.quote(self._get_path(), safe=""))
        parsed = up.urlparse("/find?" + full_qs)
        raw = up.parse_qs(parsed.query)
        find_params = {}
        for k, v in raw.items():
            find_params[k] = v[0] if len(v) == 1 else v
        assert find_params.get("path") == self._get_path(), (
            "find_params path mismatch:", find_params.get("path"))
        return find_params

    # ── GET /connections — REAL wiring graph (backlog item 38) ──────────

    def test_connections_default_meta(self):
        self._wire_chain()
        result = self._dispatch_connections("")
        self.assertEqual(result["statusCode"], 200)
        body = json.loads(result["data"])
        self.assertNotIn("operators", body, "old broken shape: operators instead of edges")
        self.assertIn("connections", body)
        self.assertEqual(body["total"], 5)  # 6 chained ops = 5 EDGES
        self.assertEqual(body["returned"], 5)
        self.assertEqual(body["limit"], 500)
        self.assertEqual(body["offset"], 0)
        self.assertFalse(body["truncated"])
        self.assertEqual(body["connections"][0]["from"], "op0")
        self.assertEqual(body["connections"][0]["to"], "op1")
        self.assertEqual(body["connections"][0]["input"], 0)

    def test_connections_paginated(self):
        self._wire_chain()
        result = self._dispatch_connections("limit=2&offset=1")
        self.assertEqual(result["statusCode"], 200)
        body = json.loads(result["data"])
        self.assertEqual(body["total"], 5)  # edges, not the 6 operators
        self.assertEqual(body["returned"], 2)
        self.assertEqual(body["offset"], 1)
        self.assertTrue(body["truncated"])
        page = body["connections"]
        self.assertEqual((page[0]["from"], page[0]["to"]), ("op1", "op2"))
        self.assertEqual((page[1]["from"], page[1]["to"]), ("op2", "op3"))

    def test_connections_offset_beyond_total(self):
        self._wire_chain()
        result = self._dispatch_connections("offset=99&limit=5")
        self.assertEqual(result["statusCode"], 200)
        body = json.loads(result["data"])
        self.assertEqual(body["total"], 5)
        self.assertEqual(body["returned"], 0)
        self.assertEqual(body["connections"], [])

    def _get_path(self):
        """Parent path that contains self.children."""
        return "/project1"

    def _path_for_op(self, idx):
        """Path of child idx (used by find, which resolves op(idx) per name)."""
        return f"/project1/op{idx}"

    # ── GET /operators ────────────────────────────────────────────────────

    def test_operators_default_meta(self):
        response = {}
        request = self._query_request("")
        import TouchDesignerAPI as tmod
        path = self._get_path()
        try:
            limit = tmod.TouchDesignerAPI._parse_positive_int(
                self.api, request["pars"].get("limit", ["500"])[0], default=500)
        except ValueError as e:
            response["statusCode"] = 400
            response["data"] = json.dumps({"error": str(e), "hint": ""})
            return
        try:
            offset = tmod.TouchDesignerAPI._parse_nonnegative_int(
                self.api, request["pars"].get("offset", ["0"])[0], default=0)
        except ValueError as e:
            response["statusCode"] = 400
            response["data"] = json.dumps({"error": str(e), "hint": ""})
            return
        result = self.api._handle_operators(path, response, limit=limit, offset=offset)
        self.assertEqual(result["statusCode"], 200)
        body = json.loads(result["data"])
        self.assertEqual(body["total"], 6)
        self.assertEqual(body["returned"], 6)
        self.assertEqual(body["limit"], 500)
        self.assertEqual(body["offset"], 0)
        self.assertFalse(body["truncated"])
        self.assertEqual(len(body["operators"]), 6)

    def test_operators_paginated_page(self):
        response = {}
        request = self._query_request("limit=3&offset=2")
        import TouchDesignerAPI as tmod
        path = self._get_path()
        limit = tmod.TouchDesignerAPI._parse_positive_int(
            self.api, request["pars"].get("limit", ["500"])[0], default=500)
        offset = tmod.TouchDesignerAPI._parse_nonnegative_int(
            self.api, request["pars"].get("offset", ["0"])[0], default=0)
        result = self.api._handle_operators(path, response, limit=limit, offset=offset)
        self.assertEqual(result["statusCode"], 200)
        body = json.loads(result["data"])
        self.assertEqual(body["total"], 6)
        self.assertEqual(body["returned"], 3)
        self.assertEqual(body["offset"], 2)
        self.assertTrue(body["truncated"])
        self.assertEqual(body["operators"][0]["name"], "op2")

    def test_operators_offset_beyond_total(self):
        response = {}
        request = self._query_request("offset=99&limit=5")
        import TouchDesignerAPI as tmod
        path = self._get_path()
        limit = tmod.TouchDesignerAPI._parse_positive_int(
            self.api, request["pars"].get("limit", ["500"])[0], default=500)
        offset = tmod.TouchDesignerAPI._parse_nonnegative_int(
            self.api, request["pars"].get("offset", ["0"])[0], default=0)
        result = self.api._handle_operators(path, response, limit=limit, offset=offset)
        self.assertEqual(result["statusCode"], 200)
        body = json.loads(result["data"])
        self.assertEqual(body["total"], 6)
        self.assertEqual(body["returned"], 0)
        self.assertEqual(body["operators"], [])

    def test_operators_oversized_limit_capped(self):
        """limit > 5000 is capped to 5000 server-side and reported as 5000.

        The handler's own route path caps via _parse_positive_int(maximum=5000),
        so we test that route path (not a direct handler call with a raw 9999).
        """
        response = {}
        request = self._query_request("limit=9999")
        import TouchDesignerAPI as tmod
        path = self._get_path()
        parsed_limit = tmod.TouchDesignerAPI._parse_positive_int(
            self.api, request["pars"].get("limit", ["500"])[0], default=500, maximum=5000)
        parsed_offset = tmod.TouchDesignerAPI._parse_nonnegative_int(
            self.api, request["pars"].get("offset", ["0"])[0], default=0)
        result = self.api._handle_operators(path, response, limit=parsed_limit, offset=parsed_offset)
        self.assertEqual(result["statusCode"], 200)
        body = json.loads(result["data"])
        self.assertEqual(body["limit"], 5000)

    def test_operators_invalid_limit_is_400_via_helper(self):
        import TouchDesignerAPI as tmod
        with self.assertRaises(ValueError):
            tmod.TouchDesignerAPI._parse_positive_int(self.api, "abc", default=500)

    def test_operators_negative_offset_is_400_via_helper(self):
        import TouchDesignerAPI as tmod
        with self.assertRaises(ValueError):
            tmod.TouchDesignerAPI._parse_nonnegative_int(self.api, "-1", default=0)

    # ── GET /find ──────────────────────────────────────────────────────────

    def test_find_default_meta(self):
        # find resolves base via op(base_path) then iterates descendants —
        # our op() fake returns self.project1 for /project1, whose children
        # are the fake ops. With recursive default True, base is included,
        # so total = children + 1.
        response = {}
        find_params = self._find_request("")
        find_params["path"] = self._get_path()
        result = self.api._handle_find({"pars": find_params}, response)
        self.assertEqual(result["statusCode"], 200)
        body = json.loads(result["data"])
        # 6 children + self (recursive default True) = 7 total
        self.assertEqual(body["total"], 7)
        self.assertEqual(body["returned"], 7)
        self.assertEqual(body["limit"], 500)
        self.assertEqual(body["offset"], 0)
        self.assertFalse(body["truncated"])
        self.assertEqual(len(body["results"]), 7)

    def test_find_paginated(self):
        """With recursive default True, find totals self+children; a limit=2
        & offset=3 page should return only 2 results (indices 3,4)."""
        import urllib.parse as up
        response = {}
        full_qs = "path=/project1&limit=2&offset=3"
        parsed = up.urlparse("/find?" + full_qs)
        raw = up.parse_qs(parsed.query)
        find_params = {}
        for k, v in raw.items():
            find_params[k] = v[0] if len(v) == 1 else v
        result = self.api._handle_find({"pars": find_params}, response)
        self.assertEqual(result["statusCode"], 200)
        body = json.loads(result["data"])
        self.assertEqual(body["total"], 7)   # 6 children + self
        self.assertEqual(body["returned"], 2)
        self.assertEqual(body["offset"], 3)
        self.assertTrue(body["truncated"])
        self.assertEqual(body["results"][0]["name"], "op2")  # index 3 in [self,op0..op5]
        self.assertEqual(body["results"][1]["name"], "op3")  # index 4

    def test_find_offset_beyond_total(self):
        import urllib.parse as up
        response = {}
        find_params = self._find_request("offset=99")
        result = self.api._handle_find({"pars": find_params}, response)
        self.assertEqual(result["statusCode"], 200)


    # ── GET /connections — REAL wiring graph (backlog item 38) ──────────

    def test_connections_default_meta(self):
        self._wire_chain()
        result = self._dispatch_connections("")
        self.assertEqual(result["statusCode"], 200)
        body = json.loads(result["data"])
        self.assertNotIn("operators", body, "old broken shape: operators instead of edges")
        self.assertIn("connections", body)
        self.assertEqual(body["total"], 5)  # 6 chained ops = 5 EDGES
        self.assertEqual(body["returned"], 5)
        self.assertEqual(body["limit"], 500)
        self.assertEqual(body["offset"], 0)
        self.assertFalse(body["truncated"])
        self.assertEqual(body["connections"][0]["from"], "op0")
        self.assertEqual(body["connections"][0]["to"], "op1")
        self.assertEqual(body["connections"][0]["input"], 0)

    def test_connections_paginated(self):
        self._wire_chain()
        result = self._dispatch_connections("limit=2&offset=1")
        self.assertEqual(result["statusCode"], 200)
        body = json.loads(result["data"])
        self.assertEqual(body["total"], 5)  # edges, not the 6 operators
        self.assertEqual(body["returned"], 2)
        self.assertEqual(body["offset"], 1)
        self.assertTrue(body["truncated"])
        page = body["connections"]
        self.assertEqual((page[0]["from"], page[0]["to"]), ("op1", "op2"))
        self.assertEqual((page[1]["from"], page[1]["to"]), ("op2", "op3"))

    def test_connections_offset_beyond_total(self):
        self._wire_chain()
        result = self._dispatch_connections("offset=99&limit=5")
        self.assertEqual(result["statusCode"], 200)
        body = json.loads(result["data"])
        self.assertEqual(body["total"], 5)
        self.assertEqual(body["returned"], 0)
        self.assertEqual(body["connections"], [])


# ═════════════════════════════════════════════════════════════════════════
# Read-through cache (backlog item 05): GET /operators + GET /verify
# ═════════════════════════════════════════════════════════════════════════

class TestReadCache(unittest.TestCase):
    """Cache semantics for the two expensive GET endpoints.

    - identical reads hit the cache and do NOT re-traverse (op-call counter
      stays flat between the two calls)
    - every mutating request (POST/PUT/DELETE) invalidates the whole cache,
      so the next read is a miss and reflects the change (no stale data)
    - ?no_cache=1 / ?refresh=1 skip the lookup but refresh the entry
    - pagination metadata is identical between hit and miss (additive key only)
    """

    def setUp(self):
        self.api = _OfflineAPI()
        self.project1 = _FakeOp("/project1", optype="project1")
        self.project1.children = [
            _FakeOp(f"/project1/op{i}", optype=f"op{i}") for i in range(5)
        ]
        self._orig_op = _set_module_attr("op", lambda path: self.project1 if path in ("/project1", "/") else None)
        # lazy-init the cache state exactly like the live extension would
        self.api._invalidate_cache()

    def tearDown(self):
        _set_module_attr("op", self._orig_op)

    def _get_operators(self):
        response = {}
        result = self.api._handle_operators("/project1", response)
        self.assertEqual(result["statusCode"], 200)
        return json.loads(result["data"])

    def _wrap_operators(self, no_cache=False):
        """Route through the same read-through wrapper OnHTTPRequest uses."""
        response = {}
        result = self.api._cache_wrap(
            "/operators", "/project1", False, 500, 0,
            lambda: self.api._handle_operators("/project1", response),
            response, no_cache=no_cache,
        )
        self.assertEqual(result["statusCode"], 200)
        return json.loads(result["data"])

    def test_second_identical_read_is_hit_without_retraversal(self):
        """Two identical reads: first miss, second hit, traversal happens once."""
        calls = {"n": 0}

        class _CountingList(list):
            def __iter__(self):
                calls["n"] += 1
                return list.__iter__(self)

        self.project1.children = _CountingList(self.project1.children)
        first = self._wrap_operators()
        self.assertEqual(first["cache"], "miss")
        self.assertEqual(calls["n"], 1)
        second = self._wrap_operators()
        self.assertEqual(second["cache"], "hit")
        self.assertEqual(calls["n"], 1, "cache hit must not re-traverse children")

    def test_hit_body_matches_miss_body(self):
        """Pagination metadata is identical between miss and hit."""
        first = self._wrap_operators()
        second = self._wrap_operators()
        self.assertEqual(first["cache"], "miss")
        self.assertEqual(second["cache"], "hit")
        for key in ("path", "total", "returned", "limit", "offset", "truncated", "operators"):
            self.assertEqual(first[key], second[key], key)

    def test_post_invalidates_and_next_read_reflects_change(self):
        """A write (any POST/PUT/DELETE) drops the cache: next read is a miss
        and shows the new operator (no stale data)."""
        first = self._wrap_operators()
        self.assertEqual(first["cache"], "miss")
        self.assertEqual(first["total"], 5)

        self.project1.children.append(_FakeOp("/project1/opNEW", optype="opNEW"))

        # Simulate exactly what OnHTTPRequest does for every mutating request.
        self.api._invalidate_cache()

        second = self._wrap_operators()
        self.assertEqual(second["cache"], "miss", "write must invalidate the cached entry")
        self.assertEqual(second["total"], 6)
        self.assertTrue(any(op["name"] == "opNEW" for op in second["operators"]))

    def test_no_cache_flag_forces_rebuild_and_refreshes_entry(self):
        """?no_cache=1 skips the lookup, rebuilds, and refreshes the entry so
        the following plain read is a hit with fresh data."""
        first = self._wrap_operators()
        self.assertEqual(first["cache"], "miss")

        self.project1.children.append(_FakeOp("/project1/opNEW", optype="opNEW"))
        self.api._invalidate_cache()

        # Warm the cache again (miss), then force-refresh.
        warmed = self._wrap_operators()
        self.assertEqual(warmed["cache"], "miss")
        self.assertEqual(warmed["total"], 6)

        self.project1.children.append(_FakeOp("/project1/opNEW2", optype="opNEW2"))
        refreshed = self._wrap_operators(no_cache=True)
        self.assertEqual(refreshed["cache"], "miss")
        self.assertEqual(refreshed["total"], 7)

        # The forced refresh replaced the entry: next plain read is a hit.
        after = self._wrap_operators()
        self.assertEqual(after["cache"], "hit")
        self.assertEqual(after["total"], 7)

    def test_error_responses_are_never_cached(self):
        """A 404 read is not stored; fixing the path makes the next read a miss
        that succeeds (no cached error)."""
        response = {}
        result = self.api._handle_operators("/project1/missing", response)
        self.assertEqual(result["statusCode"], 404)
        # The 404 came from the handler directly (no wrap), so the cache must
        # still be empty for that key.
        key = self.api._cache_key("/operators", "/project1/missing", False, 500, 0)
        self.assertNotIn(key, self.api._cache)

    def test_ensure_cache_lazy_init(self):
        """Instances built without __init__ still get cache state on first use."""
        bare = _OfflineAPI()
        self.assertFalse(hasattr(bare, "_cache"))
        bare._invalidate_cache()
        self.assertEqual(bare._cache, {})
        self.assertEqual(bare._cache_hits, 0)
        self.assertEqual(bare._cache_misses, 0)


# ═════════════════════════════════════════════════════════════════════════
# 9. GET /metrics — bridge + project metrics
# ═════════════════════════════════════════════════════════════════════════

class _MetricsOp(_FakeOp):
    """Fake op with the extra signals /metrics reads (family, cooking,
    errors/warnings, cookTime, children)."""

    def __init__(self, path, optype="nullTOP", family="TOP", children=None,
                 errors="", warnings="", cooktime=None, cooking=None):
        super().__init__(path, optype=optype)
        self.family = family
        self.children = list(children or [])
        self._errors = errors
        self._warnings = warnings
        self._cooktime = cooktime
        if cooking is not None:
            self.cooking = cooking

    def errors(self, recurse=False):
        return self._errors

    def warnings(self, recurse=False):
        return self._warnings

    @property
    def cookTime(self):
        return self._cooktime


class TestMetrics(unittest.TestCase):
    """GET /metrics — the single-walk metrics handler.

    Semantics (mirror of toe/src/TouchDesignerAPI.py::_handle_metrics):
    - one recursive walk from "/" collects counts by family, error/warning
      counts (same per-op criteria as /verify), pop_stats with slowest POP
    - `cooking_count` is best-effort: null unless at least one op exposes the
      attribute (it does NOT exist on POPs in TD 2025.31760)
    - endpoint_times keeps the last 20 latencies per route
    - the payload is never cached (dynamic by nature)
    """

    def setUp(self):
        self.api = _OfflineAPI()

    def _build_tree(self):
        pops = [
            _MetricsOp("/project1/g/box", "box", "POP", cooktime=1.5),
            _MetricsOp("/project1/g/bad", "glsl", "POP", errors="Compile failed", cooktime=9.25),
            _MetricsOp("/project1/g/pts", "particle", "POP", cooking=True, cooktime=0.4),
        ]
        geo = _MetricsOp("/project1/g", "geo", "COMP", children=pops)
        tops = [
            _MetricsOp("/project1/t/noise", "noise", "TOP", warnings="deprecated"),
            _MetricsOp("/project1/t/blur", "blur", "TOP"),
        ]
        root = _MetricsOp("/project1", "project1", "COMP", children=[geo] + tops)
        return root

    def _call_metrics(self, root):
        response = {}
        result = self.api._handle_metrics(response)
        self.assertEqual(response["statusCode"], 200)
        self.assertIs(result, response)
        return json.loads(response["data"])

    def test_shape_has_all_fixed_keys(self):
        root = self._build_tree()
        self._orig_op = _set_module_attr("op", lambda path: root if path == "/" else None)
        try:
            data = self._call_metrics(root)
        finally:
            _set_module_attr("op", self._orig_op)
        expected = {
            "fps", "td_build", "total_ops", "ops_by_family", "other_ops",
            "cooking_count", "error_count", "warning_count", "pop_stats",
            "readCache", "endpoint_times",
            # A5: declared depth cutoff (walk cap observability)
            "max_depth", "deepest_visited", "walk_truncated",
        }
        self.assertEqual(set(data.keys()), expected)
        # Untruncated tree: no cut, and the field reports null, not 0.
        self.assertIsNone(data["deepest_visited"])
        self.assertIs(data["walk_truncated"], False)
        self.assertEqual(data["max_depth"], 30)

    def test_walk_counts_families_and_errors(self):
        root = self._build_tree()
        self._orig_op = _set_module_attr("op", lambda path: root if path == "/" else None)
        try:
            data = self._call_metrics(root)
        finally:
            _set_module_attr("op", self._orig_op)
        # /project1 + geo + 3 POPs + 2 TOPs = 7
        self.assertEqual(data["total_ops"], 7)
        self.assertEqual(data["ops_by_family"]["POP"], 3)
        self.assertEqual(data["ops_by_family"]["TOP"], 2)
        self.assertEqual(data["ops_by_family"]["COMP"], 2)
        self.assertEqual(data["error_count"], 1)
        self.assertEqual(data["warning_count"], 1)
        self.assertEqual(data["pop_stats"]["pop_total"], 3)
        self.assertEqual(data["pop_stats"]["pop_errors"], 1)
        self.assertEqual(data["pop_stats"]["pop_slowest"],
                         {"path": "/project1/g/bad", "cookTime_ms": 9.25})

    def test_cooking_count_null_when_no_op_exposes_it(self):
        root = _MetricsOp("/project1", "project1", "COMP", children=[
            _MetricsOp("/project1/a", "box", "POP"),
        ])
        self._orig_op = _set_module_attr("op", lambda path: root if path == "/" else None)
        try:
            data = self._call_metrics(root)
        finally:
            _set_module_attr("op", self._orig_op)
        self.assertIsNone(data["cooking_count"],
                          "no op exposed `cooking` -> explicit null, not 0")

    def test_cooking_count_counted_when_exposed(self):
        root = self._build_tree()
        self._orig_op = _set_module_attr("op", lambda path: root if path == "/" else None)
        try:
            data = self._call_metrics(root)
        finally:
            _set_module_attr("op", self._orig_op)
        self.assertEqual(data["cooking_count"], 1)  # only the particle op

    def test_fps_null_without_project(self):
        root = _MetricsOp("/project1", "project1", "COMP")
        self._orig_op = _set_module_attr("op", lambda path: root if path == "/" else None)
        self._orig_project = _set_module_attr("project", types.SimpleNamespace())
        try:
            data = self._call_metrics(root)
        finally:
            _set_module_attr("op", self._orig_op)
            _set_module_attr("project", self._orig_project)
        self.assertIsNone(data["fps"])

    def test_fps_from_project_cookrate(self):
        root = _MetricsOp("/project1", "project1", "COMP")
        self._orig_op = _set_module_attr("op", lambda path: root if path == "/" else None)
        self._orig_project = _set_module_attr(
            "project", types.SimpleNamespace(cookRate=59.94))
        try:
            data = self._call_metrics(root)
        finally:
            _set_module_attr("op", self._orig_op)
            _set_module_attr("project", self._orig_project)
        self.assertEqual(data["fps"], 59.94)

    def test_endpoint_times_recorded_and_summarized(self):
        self.api._record_endpoint_time("/operators?path=/a&limit=1", 10.0)
        self.api._record_endpoint_time("/operators?path=/b", 30.0)
        self.api._record_endpoint_time("/operators", 20.0)  # same route, no query
        self.api._record_endpoint_time("/verify", 5.0)
        root = _MetricsOp("/project1", "project1", "COMP")
        self._orig_op = _set_module_attr("op", lambda path: root if path == "/" else None)
        try:
            data = self._call_metrics(root)
        finally:
            _set_module_attr("op", self._orig_op)
        et = data["endpoint_times"]
        self.assertEqual(set(et.keys()), {"/operators", "/verify"})
        self.assertEqual(et["/operators"]["n"], 3)
        self.assertEqual(et["/operators"]["median_ms"], 20.0)
        self.assertEqual(et["/operators"]["max_ms"], 30.0)
        self.assertEqual(et["/verify"]["n"], 1)

    def test_endpoint_times_ring_buffer_keeps_last_20(self):
        for i in range(25):
            self.api._record_endpoint_time("/x", float(i))
        self.api._ensure_endpoint_times()
        buf = self.api._endpoint_times["/x"]
        self.assertEqual(len(buf), 20)
        self.assertEqual(min(buf), 5.0)  # oldest kept value is #5 (0..4 dropped)

    def test_walk_truncated_reports_declared_cap(self):
        """A5: a tree deeper than the cap sets walk_truncated + deepest_visited."""
        # Chain of nested COMPs: /p0 -> /p0/p1 -> ... -> /p0/p31 (depth 32).
        node = _MetricsOp("/project1/p0", "p0", "COMP")
        root = node
        for i in range(1, 32):
            child = _MetricsOp(f"/project1/p0/p{i}", f"p{i}", "COMP")
            node.children = [child]
            node = child
        # Error at depth 32 — beyond the cap, must NOT be counted.
        node._errors = "beyond cap"
        self._orig_op = _set_module_attr("op", lambda path: root if path == "/" else None)
        try:
            data = self._call_metrics(root)
        finally:
            _set_module_attr("op", self._orig_op)
        self.assertIs(data["walk_truncated"], True)
        self.assertEqual(data["deepest_visited"], 31)
        self.assertEqual(data["max_depth"], 30)
        # The op beyond the cap is invisible to the counts (declared cutoff,
        # not silent): total counted = root + p1..p30 = 31 (p31 at depth 31 > 30).
        self.assertEqual(data["total_ops"], 31)
        self.assertEqual(data["error_count"], 0)

    def test_metrics_is_not_cached(self):
        root = _MetricsOp("/project1", "project1", "COMP")
        self._orig_op = _set_module_attr("op", lambda path: root if path == "/" else None)
        try:
            self._call_metrics(root)
            self._call_metrics(root)
        finally:
            _set_module_attr("op", self._orig_op)
        self.assertEqual(self.api._cache, {}, "/metrics must bypass the read cache")


if __name__ == "__main__":
    unittest.main()
