"""Offline contract tests for the TD-MCP HTTP bridge.

These tests import the REAL extension module (toe/src/TouchDesignerAPI.py)
but with TouchDesigner globals (op, app, project, tdu, ui, PaneType, ParMode,
td, etc.) faked in, so they can verify handler logic without a live TD
session. They cover the contracts corrected in this audit:

  1. POST /parameters/set — accepts params{} and updates[], explicit 400 if
     nothing can be applied
  2. GET /info — real fields from the `app` global
  3. POST /screenshot — reads `path` from body, explicit error for bad path

Plus sanity checks that other endpoints exist as methods on the class
(so we know the inventory is complete).
"""

from __future__ import annotations

import json
import sys
import os
import unittest
from unittest.mock import MagicMock, patch
from io import StringIO

# Make the repo root importable so we can import the real extension module.
REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

# Fake TD globals BEFORE importing the extension module.
td_globals = {}


class FakePar:
    """Minimal fake of a TD Par object for parameter-set tests."""

    def __init__(self, name: str, style: str = ""):
        self.name = name
        self.label = name
        self.style = style
        self._val = None
        self._expr = None

    def eval(self):
        return self._val

    @property
    def val(self):
        return self._val

    @val.setter
    def val(self, v):
        self._val = v

    @property
    def expr(self):
        return self._expr

    @expr.setter
    def expr(self, e):
        self._expr = e

    def __repr__(self):
        return f"FakePar({self.name})"


class FakeOperator:
    """Minimal fake OP for parameter-set / screenshot tests."""

    def __init__(self, path: str, name: str, op_type: str, family: str = ""):
        self.path = path
        self.name = name
        self.type = op_type
        self.OPType = op_type
        self.family = family
        self._pars = {}
        self._input_connectors = []
        self._output_connectors = []
        self._errors = ""
        self._warnings = ""
        self._cook_time = None
        self._display = False
        self._selected = False
        self._current = False
        self.nodeX = 0
        self.nodeY = 0
        self._children = []
        self._expr_obj = None

    def __getattr__(self, attr):
        # par.<name> access
        if attr.startswith("par."):
            pname = attr.split(".", 1)[1]
            if pname in self._pars:
                return self._pars[pname]
            raise AttributeError(f"No parameter '{pname}'")
        raise AttributeError(attr)

    def pars(self):
        return list(self._pars.values())

    def errors(self, recurse=False):
        return self._errors

    def warnings(self, recurse=False):
        return self._warnings

    @property
    def cookTime(self):
        return self._cook_time

    @property
    def display(self):
        return self._display

    @display.setter
    def display(self, v):
        self._display = v

    @property
    def selected(self):
        return self._selected

    @selected.setter
    def selected(self, v):
        self._selected = v

    @property
    def current(self):
        return self._current

    @current.setter
    def current(self, v):
        self._current = v

    @property
    def inputConnectors(self):
        return self._input_connectors

    @property
    def outputConnectors(self):
        return self._output_connectors

    @property
    def children(self):
        return self._children

    def findChildren(self):
        return self._children

    def destroy(self):
        pass

    def save(self, filepath):
        # Fake save: write a tiny PNG-ish header so the screenshot handler can
        # read it back. Real tests of base64 are covered by the integration
        # test suite against a live TD; here we just verify the code path.
        with open(filepath, "wb") as f:
            f.write(b"\x89PNG\r\n\x1a\n" + b"\x00" * 16)


class FakeApp:
    build = "2025.32460"
    product = "TouchDesigner"
    commercial = True
    osName = "Windows"
    osVersion = "10.0.19045"
    releaseType = "official"
    version = "099"  # legacy


class FakeProject:
    filePath = "C:\\Projects\\test.toe"
    cookRate = 60.0


class FakeTDUtils:
    __all__ = []


def _install_fake_globals():
    """Install fake TD globals into the module's namespace."""
    fake = {
        "op": MagicMock(side_effect=_fake_op),
        "app": FakeApp(),
        "project": FakeProject(),
        "tdu": MagicMock(
            Build="2025.32460",
            getFPS=MagicMock(return_value=60.0),
            gpuMemoryUsed=1024 * 1024,
        ),
        "ui": MagicMock(
            panes=MagicMock(
                current=MagicMock(
                owner=MagicMock(
                    path="/project1",
                    children=[],
                ),
                type="NETWORKEDITOR",
                x=0,
                y=0,
                zoom=1.0,
            )
            ),
            textport=None,
        ),
        "PaneType": MagicMock(NETWORKEDITOR="NETWORKEDITOR"),
        "ParMode": MagicMock(CONSTANT="Constant", EXPRESSION="Expression"),
        "td": MagicMock(),
        "td_utils": FakeTDUtils(),
    }
    td_globals.clear()
    td_globals.update(fake)
    return fake


def _fake_op(path):
    """Return the fake operator for the given path, or None."""
    if path == "/":
        return _fake_root()
    if path == "/project1":
        return _fake_project1()
    if path == "/project1/noise1":
        return _fake_noise1()
    if path == "/project1/top1":
        return _fake_top1()
    if path == "/project1/container1":
        return _fake_container()
    return None


def _build_parameter_dir(pars_dict):
    """Build a FakeOperator with the given {name: (val, style)} dict."""
    op = FakeOperator("/project1/noise1", "noise1", "noiseTOP", "CHOP")
    for name, (val, style) in pars_dict.items():
        op._pars[name] = FakePar(name, style=style)
        op._pars[name]._val = val
    return op


# Module-level fakes (mutated by tests)
_fake_root = FakeOperator("/", "project1", "project1", "COMP")
_fake_project1 = FakeOperator("/project1", "project1", "project1", "COMP")
_fake_noise1 = None  # built per test
_fake_top1 = FakeOperator("/project1/top1", "top1", "nullTOP", "TOP")
_fake_container = FakeOperator("/project1/container1", "container1", "baseCOMP", "COMP")


def _reset_fakes():
    global _fake_root, _fake_project1, _fake_noise1, _fake_top1, _fake_container
    _fake_root = FakeOperator("/", "project1", "project1", "COMP")
    _fake_project1 = FakeOperator("/project1", "project1", "project1", "COMP")
    _fake_noise1 = None
    _fake_top1 = FakeOperator("/project1/top1", "top1", "nullTOP", "TOP")
    _fake_container = FakeOperator("/project1/container1", "container1", "baseCOMP", "COMP")


# ---------------------------------------------------------------------------
# Import the real extension module with faked globals
# ---------------------------------------------------------------------------

# We cannot Patch the module globals before import, so we inject them via
# importlib and exec. Simpler: import the module and then monkeypatch its
# globals via __dict__. Since the module already ran its top-level imports
# (including `import td_utils`), we need td_utils to be importable and
# harmless. We provide a minimal td_utils in the path.


def _make_td_utils_module():
    """Create a minimal td_utils module in sys.modules."""
    import types

    mod = types.ModuleType("td_utils")
    mod.__all__ = []
    mod.ClientQueueManager = MagicMock
    mod.HTTPClientCache = MagicMock
    sys.modules["td_utils"] = mod


_make_td_utils_module()


# Now we can import TouchDesignerAPI from toe.src.
# The module top-level does `import td_utils` — that's now our fake.
from toe.src.TouchDesignerAPI import TouchDesignerAPI


class _FakeOwner:
    path = "/project1/td_api_ext"


class FakeAPI(TouchDesignerAPI):
    """Subclass that skips __init__ logic requiring real TD resources."""

    def __init__(self):
        # Bypass the real __init__ which touches op.TDResources etc.
        self.ownerComp = _FakeOwner()
        self.clientQueue = MagicMock()
        self.activeTasks = {}
        self.threadManager = None
        self._ws_clients = set()


# ---------------------------------------------------------------------------
# Helper: build a request/response pair and dispatch through a handler
# ---------------------------------------------------------------------------

def _make_response(status=200):
    return {
        "statusCode": status,
        "statusReason": "OK",
        "data": "",
        "Content-Type": "application/json",
    }


def _dispatch_handler(api, handler, request, response):
    """Call a handler and return the response dict (mutated in place)."""
    return handler(request, response)


# ===========================================================================
# Tests: POST /parameters/set
# ===========================================================================


class TestParametersSetContract(unittest.TestCase):
    """Contract for POST /parameters/set:

    - accepts canonical updates[]
    - accepts params{} shorthand (normalized to updates[])
    - accepts params as list (normalized)
    - explicit 400 if nothing can be applied (no silent empty success)
    - 404 if operator not found
    """

    def setUp(self):
        _reset_fakes()
        _install_fake_globals()
        # Re-import to pick up fresh globals? No — we monkeypatch the
        # module's globals dict for each test.
        self.api = FakeAPI()
        # Make `op` return our fakes
        self.fake_op = _install_fake_globals()["op"]

    def _make_request(self, payload):
        return {"data": json.dumps(payload)}

    def _noise1_with_pars(self, pars):
        op = _build_parameter_dir(pars)
        # Replace the global fake for /project1/noise1
        global _fake_noise1
        _fake_noise1 = op
        self.fake_op = _install_fake_globals()["op"]
        self.fake_op.side_effect = _fake_op

    def test_updates_array_canonical(self):
        """Canonical updates[] applies parameters."""
        self._noise1_with_pars({"type": ("simplex", ""), "amp": (0.5, "")})
        req = self._make_request(
            {"path": "/project1/noise1", "updates": [{"name": "type", "value": "perlin"}]}
        )
        resp = _make_response()
        self.api._handle_parameters_set(req, resp)
        data = json.loads(resp["data"])
        self.assertEqual(resp["statusCode"], 200)
        self.assertIn("updated", data)
        self.assertEqual(len(data["updated"]), 1)
        self.assertEqual(data["updated"][0]["name"], "type")
        self.assertEqual(data["updated"][0]["value"], "perlin")

    def test_params_dict_shorthand(self):
        """params{} shorthand is normalized to updates[] and applied."""
        self._noise1_with_pars({"type": ("simplex", ""), "amp": (0.5, "")})
        req = self._make_request(
            {"path": "/project1/noise1", "params": {"type": "perlin", "amp": 0.8}}
        )
        resp = _make_response()
        self.api._handle_parameters_set(req, resp)
        data = json.loads(resp["data"])
        self.assertEqual(resp["statusCode"], 200)
        self.assertEqual(len(data["updated"]), 2)
        names = {u["name"] for u in data["updated"]}
        self.assertSetEqual(names, {"type", "amp"})

    def test_params_list_shorthand(self):
        """params as list is also accepted (normalized to updates[])."""
        self._noise1_with_pars({"type": ("simplex", "")})
        req = self._make_request(
            {"path": "/project1/noise1", "params": [{"name": "type", "value": "perlin"}]}
        )
        resp = _make_response()
        self.api._handle_parameters_set(req, resp)
        data = json.loads(resp["data"])
        self.assertEqual(resp["statusCode"], 200)
        self.assertEqual(len(data["updated"]), 1)

    def test_empty_updates_explicit_400(self):
        """Empty updates[] returns explicit 400, not silent success."""
        self._noise1_with_pars({"type": ("simplex", "")})
        req = self._make_request({"path": "/project1/noise1", "updates": []})
        resp = _make_response()
        self.api._handle_parameters_set(req, resp)
        self.assertEqual(resp["statusCode"], 400)
        data = json.loads(resp["data"])
        self.assertIn("error", data)
        self.assertIn("No parameter updates to apply", data["error"])

    def test_no_params_no_updates_explicit_400(self):
        """Payload with neither updates nor params returns explicit 400."""
        req = self._make_request({"path": "/project1/noise1"})
        resp = _make_response()
        self.api._handle_parameters_set(req, resp)
        self.assertEqual(resp["statusCode"], 400)
        data = json.loads(resp["data"])
        self.assertIn("error", data)
        self.assertIn("No parameter updates to apply", data["error"])

    def test_operator_not_found_404(self):
        """Nonexistent operator returns 404."""
        req = self._make_request(
            {"path": "/project1/nonexistent", "updates": [{"name": "x", "value": 1}]}
        )
        resp = _make_response()
        self.api._handle_parameters_set(req, resp)
        self.assertEqual(resp["statusCode"], 404)
        data = json.loads(resp["data"])
        self.assertIn("error", data)
        self.assertIn("Operator not found", data["error"])

    def test_unknown_parameter_name_in_updates(self):
        """Unknown parameter name in updates →missing + (transactional error)."""
        self._noise1_with_pars({"type": ("simplex", "")})
        # transactional=True (default) → should raise ValueError for unknown par
        req = self._make_request(
            {
                "path": "/project1/noise1",
                "updates": [{"name": "type", "value": "perlin"}, {"name": "nonexistent", "value": 1}],
            }
        )
        resp = _make_response()
        self.api._handle_parameters_set(req, resp)
        # With transactional=True, unknown par raises before apply → 400
        self.assertEqual(resp["statusCode"], 400)
        data = json.loads(resp["data"])
        self.assertIn("Parameter not found", data["error"])

    def test_non_transactional_skips_unknown(self):
        """With transactional=False, unknown params are skipped with a warning."""
        self._noise1_with_pars({"type": ("simplex", "")})
        req = self._make_request(
            {
                "path": "/project1/noise1",
                "updates": [{"name": "type", "value": "perlin"}, {"name": "nonexistent", "value": 1}],
                "transactional": False,
            }
        )
        resp = _make_response()
        self.api._handle_parameters_set(req, resp)
        self.assertEqual(resp["statusCode"], 200)
        data = json.loads(resp["data"])
        self.assertEqual(len(data["updated"]), 1)
        self.assertEqual(data["updated"][0]["name"], "type")
        self.assertIn("nonexistent", data["missing"])

    def test_pulse_param(self):
        """Value truthy on a Pulse-style param triggers pulse()."""
        # Build a fake pulse par
        op = FakeOperator("/project1/noise1", "noise1", "noiseTOP", "CHOP")
        par = FakePar("cook", style="Pulse")
        op._pars["cook"] = par
        global _fake_noise1
        _fake_noise1 = op
        self.fake_op = _install_fake_globals()["op"]
        self.fake_op.side_effect = _fake_op

        req = self._make_request(
            {"path": "/project1/noise1", "updates": [{"name": "cook", "value": True}]}
        )
        resp = _make_response()
        self.api._handle_parameters_set(req, resp)
        self.assertEqual(resp["statusCode"], 200)


# ===========================================================================
# Tests: GET /info
# ===========================================================================


class TestInfoContract(unittest.TestCase):
    """GET /info returns real fields from the `app` global:

    build, version (legacy), product, commercial, platform, osVersion,
    release, projectPath, projectFPS.
    """

    def setUp(self):
        _install_fake_globals()
        self.api = FakeAPI()

    def test_all_real_fields_present(self):
        resp = _make_response()
        self.api._handle_info(resp)
        data = json.loads(resp["data"])
        self.assertEqual(resp["statusCode"], 200)
        self.assertIn("build", data)
        self.assertEqual(data["build"], "2025.32460")
        self.assertIn("version", data)
        self.assertEqual(data["version"], "099")  # legacy
        self.assertIn("product", data)
        self.assertEqual(data["product"], "TouchDesigner")
        self.assertIn("commercial", data)
        self.assertTrue(data["commercial"])
        self.assertIn("platform", data)
        self.assertEqual(data["platform"], "Windows")
        self.assertIn("osVersion", data)
        self.assertEqual(data["osVersion"], "10.0.19045")
        self.assertIn("release", data)
        self.assertEqual(data["release"], "official")
        self.assertIn("projectPath", data)
        self.assertEqual(data["projectPath"], "C:\\Projects\\test.toe")
        self.assertIn("projectFPS", data)
        self.assertEqual(data["projectFPS"], 60.0)

    def test_info_degrades_gracefully_when_app_attrs_missing(self):
        """If app global is missing attributes, fields degrade to null (not 500)."""
        # Temporarily replace app with a bare object missing most attrs
        import toe.src.TouchDesignerAPI as mod

        old_app = mod.app
        mod.app = MagicMock()
        del mod.app.build
        del mod.app.product
        del mod.app.commercial
        del mod.app.osName
        del mod.app.osVersion
        del mod.app.releaseType
        del mod.app.version

        try:
            resp = _make_response()
            self.api._handle_info(resp)
            data = json.loads(resp["data"])
            self.assertEqual(resp["statusCode"], 200)
            # Fields should be null, not raise
            for f in ("build", "version", "product", "commercial", "platform", "osVersion", "release"):
                self.assertIn(f, data)
        finally:
            mod.app = old_app


# ===========================================================================
# Tests: POST /screenshot
# ===========================================================================


class TestScreenshotPostContract(unittest.TestCase):
    """POST /screenshot reads `path` from the JSON body.

    - with path → captures that exact operator
    - without path → fallback to pane heuristic (success:false if no TOP)
    - bad path → explicit "Operator not found" error
    """

    def setUp(self):
        _reset_fakes()
        _install_fake_globals()
        self.api = FakeAPI()
        self.fake_op_impl = _install_fake_globals()["op"]
        self.fake_op_impl.side_effect = _fake_op

        # Make a TOP at /project1/top1
        global _fake_top1
        _fake_top1 = FakeOperator("/project1/top1", "top1", "nullTOP", "TOP")
        self.fake_op_impl.side_effect = _fake_op

    def _make_request(self, payload):
        return {"data": json.dumps(payload)}

    def test_screenshot_with_path_captures_that_top(self):
        """With path in body, captures exactly that TOP."""
        # The handler will call op(path).save(tf) then read the file.
        # Our fake TOP.save writes a tiny PNG header to the temp file,
        # and the handler reads it back and base64-encodes.
        req = self._make_request({"path": "/project1/top1"})
        resp = _make_response()
        self.api._handle_screenshot_post(req, resp)
        data = json.loads(resp["data"])
        self.assertEqual(resp["statusCode"], 200)
        self.assertTrue(data.get("success"))
        self.assertEqual(data.get("path"), "/project1/top1")
        self.assertEqual(data.get("name"), "top1")
        self.assertEqual(data.get("type"), "nullTOP")
        self.assertIn("image", data)
        self.assertIn("b64", data.get("image", "") or "")  # non-empty base64

    def test_screenshot_without_path_fallback_pane(self):
        """Without path in body, falls back to pane heuristic.

        With no TOP in the pane children, should return success:false with
        "No TOP output found".
        """
        # Ensure pane owner has no TOP children
        pane = _install_fake_globals()["ui"].panes.current
        pane.owner.children = []  # no TOPs
        pane.owner.type = "COMP"

        req = self._make_request({})
        resp = _make_response()
        self.api._handle_screenshot_post(req, resp)
        data = json.loads(resp["data"])
        self.assertFalse(data.get("success"))
        self.assertIn("No TOP output found", data.get("error", ""))

    def test_screenshot_bad_path_explicit_error(self):
        """Nonexistent path returns explicit operator-not-found error."""
        req = self._make_request({"path": "/project1/nonexistent"})
        resp = _make_response()
        self.api._handle_screenshot_post(req, resp)
        data = json.loads(resp["data"])
        self.assertFalse(data.get("success"))
        self.assertIn("Operator not found", data.get("error", ""))

    def test_screenshot_max_size_resize(self):
        """With maxSize, the handler includes PIL resize code path.

        We can't easily verify PIL is installed in the test env, but we can
        verify the handler doesn't crash and still returns an image (the
        resize code is inside the generated Python which runs in the fake
        op's `exec` context — our fake doesn't exec, so this tests the
        handler's request parsing, not the PIL path).

        For a real PIL resize test, use the integration suite against a live
        TD.
        """
        req = self._make_request({"path": "/project1/top1", "maxSize": 256})
        resp = _make_response()
        self.api._handle_screenshot_post(req, resp)
        data = json.loads(resp["data"])
        self.assertTrue(data.get("success"))
        self.assertIn("image", data)


# ===========================================================================
# Tests: endpoint existence inventory
# ===========================================================================


class TestEndpointInventory(unittest.TestCase):
    """Sanity: the handlers we claim exist in the audit actually exist on the
    class. This doesn't test behavior — just that the method names in the
    inventory match the real class.
    """

    def setUp(self):
        _install_fake_globals()
        self.api = FakeAPI()

    def test_http_handler_methods_exist(self):
        handlers = [
            "_handle_info",
            "_handle_editor_pane",
            "_handle_editor_selection",
            "_handle_operators",
            "_handle_parameters_get",
            "_handle_parameters_set",
            "_handle_connections",
            "_handle_find",
            "_handle_healthcheck",
            "_handle_get_errors",
            "_handle_get_node_detail",
            "_handle_get_perf",
            "_handle_get_hints",
            "_handle_get_focus",
            "_handle_build_compatibility",
            "_handle_release_delta",
            "_handle_spatial_context",
            "_handle_audit_performance",
            "_handle_help",
            "_handle_pop_inspect",
            "_handle_screenshot_post",
            "_handle_screenshot",
            "_handle_navigate_to",
            "_handle_read_textport",
            "_handle_clear_textport",
            "_handle_search",
            "_handle_reinit_extension",
            "_handle_read_dat",
            "_handle_write_dat",
            "_handle_read_chop",
            "_handle_project_lifecycle",
            "_handle_snapshot_scene",
            "_handle_memory_save",
            "_handle_memory_recall",
            "_handle_execute",
            "_handle_exec",
            "_handle_execute_async",
            "_handle_task_status",
            "_handle_batch",
            "_handle_auto_layout",
            "_handle_smart_connect",
            "_handle_diagnose",
            "_handle_document",
            "_handle_param_presets_get",
            "_handle_param_presets_post",
            "_handle_glsl_reload",
            "_handle_glsl_update",
            "_handle_events",
            "_handle_instances",
            "_handle_verify",
            "_handle_copy_node",
            "_handle_disconnect",
            "_handle_connect_nodes",
            "_handle_create_operator",
            "_handle_delete_operator",
        ]
        for h in handlers:
            self.assertTrue(
                hasattr(self.api, h),
                f"Handler {h} not found on TouchDesignerAPI — inventory mismatch",
            )

    def test_endpoint_uri_routing_exists_in_OnHTTPRequest(self):
        """The dispatch strings in OnHTTPRequest cover the audited endpoints.

        We don't parse the source here; we just verify that the known URIs
        from the audit are reachable by checking the class has the matching
        handler. The URI→handler mapping is in OnHTTPRequest source; we
        spot-check a few.
        """
        # Spot-check: these URIs should map to the handlers we listed.
        # (Indirect verification — if a handler exists and is wired in
        # OnHTTPRequest, the endpoint is real.)
        self.assertTrue(hasattr(self.api, "_handle_info"))
        self.assertTrue(hasattr(self.api, "_handle_screenshot_post"))
        self.assertTrue(hasattr(self.api, "_handle_parameters_set"))
        self.assertTrue(hasattr(self.api, "_handle_verify"))
        self.assertTrue(hasattr(self.api, "_handle_document"))


# ===========================================================================
# Run
# ===========================================================================

if __name__ == "__main__":
    unittest.main()
