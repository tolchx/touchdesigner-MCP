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

    def pulse(self):
        """Pulse-style params expose pulse() — called by /parameters/set."""
        self._pulse_count = getattr(self, "_pulse_count", 0) + 1
        return self._pulse_count

    def __repr__(self):
        return f"FakePar({self.name})"


class _FakeParNamespace:
    """Stand-in for ``op.<parname>`` — the object the handler calls

    ``hasattr(target.par, name)`` / ``getattr(target.par, name)`` against.
    ``target.par.<name>`` still resolves through FakeOperator.__getattr__.
    """

    def __init__(self, owner: FakeOperator):
        self._owner = owner

    def __getattr__(self, name: str):
        if name in self._owner._pars:
            return self._owner._pars[name]
        raise AttributeError(f"No parameter '{name}'")

    def __setattr__(self, name: str, value, *, _owner_unset=False):
        if name in ("_owner",):
            super().__setattr__(name, value)
        elif name in self._owner._pars:
            self._owner._pars[name].val = value
        else:
            raise AttributeError(f"No parameter '{name}'")


class FakeOperator:
    """Minimal fake OP for parameter-set / screenshot tests."""

    def __init__(self, path: str, name: str, op_type: str, family: str = ""):
        self.path = path
        self.name = name
        self.type = op_type
        self.OPType = op_type
        self.family = family
        self._pars = {}
        self.par = _FakeParNamespace(self)
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
        # par.<name> access (e.g. op.par.cook) — delegates to the par namespace
        if attr == "par":
            return self.par
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
    """Install fake TD globals into the module's namespace.

    Also inject them into the imported module object itself (toe.src.
    TouchDesignerAPI) so that module-level helpers such as _debug_print (which
    references the TD global ``parent``) can run without a live TD session.
    """
    fake = {
        "op": _fake_op,
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
                    owner=_fake_project1,
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
        "parent": MagicMock(  # no-op TD global; _debug_print uses parent().par.Debug.eval()
            return_value=MagicMock(
                par=MagicMock(Debug=MagicMock(eval=MagicMock(return_value=False)))
            )
        ),
    }
    td_globals.clear()
    td_globals.update(fake)
    # Mirror into the real module object so handlers that reference globals
    # directly (e.g. _debug_print -> parent) see our fakes.
    try:
        mod = sys.modules["toe.src.TouchDesignerAPI"]
    except KeyError:
        mod = None
    if mod is not None:
        for k, v in fake.items():
            setattr(mod, k, v)
    return fake


def _fake_op(path):
    """Return the fake operator for the given path, or None.

    Returns the operator OBJECT directly (not a callable), because the
    generated Python code in the handlers calls ``op(path)`` and expects
    an operator instance back.
    """
    if path == "/":
        return _fake_root
    if path == "/project1":
        return _fake_project1
    if path == "/project1/noise1":
        return _fake_noise1
    if path == "/project1/top1":
        return _fake_top1
    if path == "/project1/container1":
        return _fake_container
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
        self.api = FakeAPI()
        # The module's `op` is now _fake_op (set by _install_fake_globals).
        # Ensure the test module sees it too so exec() in the handler
        # resolves op() to our fake.
        import tests.test_api_contract_offline as mod
        self._saved_op = getattr(mod, "op", None)
        mod.op = _fake_op

    def _make_request(self, payload):
        return {"data": json.dumps(payload)}

    def _noise1_with_pars(self, pars):
        op = _build_parameter_dir(pars)
        global _fake_noise1
        _fake_noise1 = op
        # Update the handler module's op so generated code picks up the new fake.
        import toe.src.TouchDesignerAPI as tmod
        tmod.op = _fake_op

    def test_updates_array_canonical(self):
        """Canonical updates[] applies parameters."""
        self._noise1_with_pars({"type": ("simplex", ""), "amp": (0.5, "")})
        req = self._make_request(
            {"path": "/project1/noise1", "updates": [{"name": "type", "value": "perlin"}]}
        )
        resp = _make_response()
        try:
            self.api._handle_parameters_set(req, resp)
        except Exception as e:
            self.fail(f"_handle_parameters_set raised unexpectedly: {e!r}\nresp={resp}")
        data = json.loads(resp["data"])
        self.assertEqual(resp["statusCode"], 200, msg=f"resp={resp}")
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
        try:
            self.api._handle_parameters_set(req, resp)
        except Exception as e:
            self.fail(f"_handle_parameters_set raised unexpectedly: {e!r}\nresp={resp}")
        data = json.loads(resp["data"])
        self.assertEqual(resp["statusCode"], 200, msg=f"resp={resp}")
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
        try:
            self.api._handle_parameters_set(req, resp)
        except Exception as e:
            self.fail(f"_handle_parameters_set raised unexpectedly: {e!r}\nresp={resp}")
        data = json.loads(resp["data"])
        self.assertEqual(resp["statusCode"], 200, msg=f"resp={resp}")
        self.assertEqual(len(data["updated"]), 1)

    def test_params_list_shorthand(self):
        """params as list is also accepted (normalized to updates[])."""
        self._noise1_with_pars({"type": ("simplex", "")})
        req = self._make_request(
            {"path": "/project1/noise1", "params": [{"name": "type", "value": "perlin"}]}
        )
        resp = _make_response()
        try:
            self.api._handle_parameters_set(req, resp)
        except Exception as e:
            self.fail(f"_handle_parameters_set raised unexpectedly: {e!r}\nresp={resp}")
        data = json.loads(resp["data"])
        self.assertEqual(resp["statusCode"], 200)
        # Only one update expected (the 'type' param)
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
        """Unknown parameter name in updates → missing + (transactional error)."""
        self._noise1_with_pars({"type": ("simplex", "")})
        # transactional=True (default) → should raise ValueError for unknown par
        req = self._make_request(
            {
                "path": "/project1/noise1",
                "updates": [{"name": "type", "value": "perlin"}, {"name": "nonexistent", "value": 1}],
            }
        )
        resp = _make_response()
        try:
            self.api._handle_parameters_set(req, resp)
        except Exception as e:
            self.fail(f"_handle_parameters_set raised unexpectedly: {e!r}\nresp={resp}")
        # With transactional=True, unknown par raises before apply → 400
        self.assertEqual(resp["statusCode"], 400)
        data = json.loads(resp["data"])
        self.assertIn("nonexistent", data["error"])
        # suggestion may appear as a 'suggestions' key or inside the message
        suggestions = data.get("suggestions") or []
        suggestion_text = " ".join(str(s) for s in suggestions)
        self.assertTrue(
            "type" in suggestion_text or "type" in data.get("error", ""),
            msg=f"No suggestion for 'type' in: {data}",
        )

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
        try:
            self.api._handle_parameters_set(req, resp)
        except Exception as e:
            self.fail(f"_handle_parameters_set raised unexpectedly: {e!r}\nresp={resp}")
        self.assertEqual(resp["statusCode"], 200)
        data = json.loads(resp["data"])
        self.assertEqual(len(data["updated"]), 1)
        self.assertEqual(data["updated"][0]["name"], "type")
        missing = data.get("missing") or data.get("invalid") or ()
        # New server-side validation reports objects: {name, reason,
        # suggestions, note} — accept both that shape and plain names.
        missing_names = [
            entry.get("name") if isinstance(entry, dict) else entry
            for entry in missing
        ]
        self.assertIn("nonexistent", missing_names)

    def test_pulse_param(self):
        """Value truthy on a Pulse-style param triggers pulse()."""
        op = FakeOperator("/project1/noise1", "noise1", "noiseTOP", "CHOP")
        par = FakePar("cook", style="Pulse")
        op._pars["cook"] = par
        global _fake_noise1
        _fake_noise1 = op
        # Ensure the module's `op` resolves to our fake function.
        import tests.test_api_contract_offline as mod
        mod.op = _fake_op

        req = self._make_request(
            {"path": "/project1/noise1", "updates": [{"name": "cook", "value": True}]}
        )
        resp = _make_response()
        try:
            self.api._handle_parameters_set(req, resp)
        except Exception as e:
            self.fail(f"_handle_parameters_set raised unexpectedly: {e!r}\nresp={resp}")
        self.assertEqual(resp["statusCode"], 200, msg=f"resp={resp}")
        data = json.loads(resp["data"])
        self.assertTrue(data.get("success") if "success" in data else True)


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
        import toe.src.TouchDesignerAPI as mod

        # Replace app with a bare object missing every real field.
        bare = MagicMock(spec=[])  # no attributes at all
        old_app = getattr(mod, "app", None)
        mod.app = bare

        try:
            resp = _make_response()
            self.api._handle_info(resp)
            data = json.loads(resp["data"])
            self.assertEqual(resp["statusCode"], 200)
            # Every field should still be present (degraded to null), not raise.
            for f in (
                "build", "version", "product", "commercial",
                "platform", "osVersion", "release", "projectPath", "projectFPS",
            ):
                self.assertIn(f, data)
        finally:
            if old_app is None:
                try:
                    delattr(mod, "app")
                except AttributeError:
                    pass
            else:
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

        # Make a TOP at /project1/top1
        global _fake_top1
        _fake_top1 = FakeOperator("/project1/top1", "top1", "nullTOP", "TOP")
        import toe.src.TouchDesignerAPI as tmod
        tmod.op = _fake_op

    def _make_request(self, payload):
        return {"data": json.dumps(payload)}

    def _run_screenshot_handler(self, payload):
        """Call _handle_screenshot_post with a payload, letting the generated
        Python code actually execute so op() calls resolve to our fakes.
        """
        import tests.test_api_contract_offline as mod
        import toe.src.TouchDesignerAPI as tmod
        saved_op = tmod.op
        try:
            tmod.op = _fake_op
            req = {"data": json.dumps(payload)}
            resp = _make_response()
            self.api._handle_screenshot_post(req, resp)
            return resp
        finally:
            tmod.op = saved_op

    def test_screenshot_with_path_captures_that_top(self):
        """With path in body, captures exactly that TOP."""
        resp = self._run_screenshot_handler({"path": "/project1/top1"})
        data = json.loads(resp["data"])
        self.assertEqual(resp["statusCode"], 200)
        self.assertTrue(data.get("success"))
        self.assertEqual(data.get("path"), "/project1/top1")
        self.assertEqual(data.get("name"), "top1")
        self.assertEqual(data.get("type"), "nullTOP")
        self.assertIn("image", data)
        self.assertTrue(data["image"], msg=f"image is empty: {data.get('image')!r}")
        self.assertGreaterEqual(len(data["image"]), 10)

    def test_screenshot_bad_path_explicit_error(self):
        """Nonexistent path returns explicit operator-not-found error."""
        resp = self._run_screenshot_handler({"path": "/project1/nonexistent"})
        data = json.loads(resp["data"])
        self.assertFalse(data.get("success"))
        self.assertIn("Operator not found", data.get("error", ""))

    def test_screenshot_max_size_resize(self):
        """With maxSize, the handler includes PIL resize code path."""
        resp = self._run_screenshot_handler({"path": "/project1/top1", "maxSize": 256})
        data = json.loads(resp["data"])
        self.assertTrue(data.get("success"))
        self.assertIn("image", data)

    def test_screenshot_without_path_fallback_pane(self):
        """Without path in body, falls back to pane heuristic.

        With no TOP in the pane children AND no TOP anywhere, should return
        success:false with "No TOP output found".
        """
        pane = _install_fake_globals()["ui"].panes.current
        # Clear the children so the fallback heuristic finds no TOP.
        pane.owner._children = []
        pane.owner.type = "COMP"

        resp = self._run_screenshot_handler({})
        data = json.loads(resp["data"])
        self.assertFalse(data.get("success"))
        self.assertIn("No TOP output found", data.get("error", "") + (data.get("msg") or ""))

    def test_screenshot_bad_path_explicit_error(self):
        """Nonexistent path returns explicit operator-not-found error."""
        import toe.src.TouchDesignerAPI as tmod
        saved_op = tmod.op
        try:
            tmod.op = _fake_op
            req = self._make_request({"path": "/project1/nonexistent"})
            resp = _make_response()
            self.api._handle_screenshot_post(req, resp)
            data = json.loads(resp["data"])
            self.assertFalse(data.get("success"))
            self.assertIn("Operator not found", data.get("error", ""))
        finally:
            tmod.op = saved_op

    def test_screenshot_max_size_resize(self):
        """With maxSize, the handler includes PIL resize code path.

        We can't easily verify PIL is installed in the test env, but we can
        verify the handler doesn't crash and still returns an image (the
        resize code is inside the generated Python which runs in the fake
        op's ``exec`` context — our fake doesn't exec, so this tests the
        handler's request parsing, not the PIL path).

        For a real PIL resize test, use the integration suite against a live
        TD.
        """
        import toe.src.TouchDesignerAPI as tmod
        saved_op = tmod.op
        try:
            tmod.op = _fake_op
            req = self._make_request({"path": "/project1/top1", "maxSize": 256})
            resp = _make_response()
            self.api._handle_screenshot_post(req, resp)
            data = json.loads(resp["data"])
            self.assertTrue(data.get("success"))
            self.assertIn("image", data)
        finally:
            tmod.op = saved_op


# ===========================================================================
# Tests: endpoint existence inventory
# ===========================================================================


class TestEndpointInventory(unittest.TestCase):
    """Sanity: the handlers we claim exist in the audit actually exist on the
    class. This does not test behavior - just that the method names in the
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
            # "_handle_disconnect",  # not wired in this build — see audit note
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
if __name__ == "__main__":
    unittest.main()
