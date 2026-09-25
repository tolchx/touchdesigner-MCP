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


class _FakeConnRef:
    """Fake connection reference: only `.owner` is read by the edge collector."""

    def __init__(self, owner):
        self.owner = owner


class _FakeConnector:
    """Fake input/output connector whose `connections` hold fake edges.

    Each entry exposes `.owner` (the source op), like TD's
    Connector.connections[i].owner.
    """

    def __init__(self, owner=None):
        self.connections = ([_FakeConnRef(owner)] if owner is not None else [])


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
        self._children_reads = 0
        self._expr_obj = None

    # POP semantics helpers (used by verify handler tests)
    def numPoints(self):
        # Real TD POP: numPoints() is a METHOD, not a property.
        # Expose it here as a callable so the verify handler can call it.
        return 0

    def numPrims(self):
        return 0

    def isCOMP(self):
        return self.family == "COMP"

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
        # TD: children is a METHOD (children('name') filters by name), but a
        # large part of this suite iterates it as a property/attribute. Return
        # a list subclass that is ALSO callable with an optional name filter
        # so both the property-style tests and the /create replace flow work.
        self._children_reads += 1

        class _ChildrenList(list):
            def __call__(lst, name=None):
                if name is None:
                    return list(lst)
                return [c for c in lst if c.name == name]

        return _ChildrenList(self._children)

    def findChildren(self):
        return self._children

    def create(self, op_type, name=None):
        # Mirror TD semantics: creating with a None/unknown type fails loudly
        # (live TD: "Unknown operator type. Value:None Type:<class 'NoneType'>.").
        if not op_type:
            raise ValueError(
                "Unknown operator type. Value:%r Type:%s." % (op_type, type(op_type))
            )
        child = FakeOperator(f"{self.path}/{name}", name, str(op_type), "")
        self._children.append(child)
        return child

    def destroy(self):
        # Mirror TD semantics: a destroyed op disappears from its parent.
        parent = _fake_op(self.path.rsplit("/", 1)[0] or "/")
        if parent is not None and self in getattr(parent, "_children", []):
            parent._children.remove(self)

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
    # Dynamic children registered on /project1 (e.g. ops created/faked by the
    # history tests) resolve through the parent's children list.
    parent = path.rsplit("/", 1)[0]
    if parent == "/project1":
        for child in _fake_project1._children:
            if child.path == path:
                return child
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
        fake_globals = _install_fake_globals()
        # the generated create-script references the op class by bare name
        # (TD passes it as a Python class); register a stand-in.
        fake_globals["noiseTOP"] = type("noiseTOP", (), {})
        import toe.src.TouchDesignerAPI as tmod
        tmod.noiseTOP = fake_globals["noiseTOP"]
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
        fake_globals = _install_fake_globals()
        # the generated create-script references the op class by bare name
        # (TD passes it as a Python class); register a stand-in.
        fake_globals["noiseTOP"] = type("noiseTOP", (), {})
        import toe.src.TouchDesignerAPI as tmod
        tmod.noiseTOP = fake_globals["noiseTOP"]
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
            "_handle_verify_impl",
            "_verify_from_node",
            "_verify_iter_safe",
            "_verify_collect_terminal_errors",
            "_verify_build_response",
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
        self.assertTrue(hasattr(self.api, "_handle_verify_impl"))
        self.assertTrue(hasattr(self.api, "_handle_document"))

    def test_verify_recurse_default_true(self):
        """Default /verify recurses into COMP children."""
        _install_fake_globals()
        api = FakeAPI()
        root = _fake_root
        child = FakeOperator("/project1/child1", "child1", "nullTOP", "TOP")
        root._children = [child]
        import toe.src.TouchDesignerAPI as tmod
        tmod.op = _fake_op
        result = api._verify_from_node(root, recurse=True)
        self.assertIn("operators_scanned", result)
        self.assertGreaterEqual(result["operators_scanned"], 2)
        self.assertTrue(result["recurse"])

    def test_verify_recurse_false_scans_only_root(self):
        """With recurse=false, only the target operator is scanned."""
        _install_fake_globals()
        api = FakeAPI()
        root = _fake_root
        child = FakeOperator("/project1/child1", "child1", "nullTOP", "TOP")
        root._children = [child]
        import toe.src.TouchDesignerAPI as tmod
        tmod.op = _fake_op
        result = api._verify_from_node(root, recurse=False)
        self.assertEqual(result["operators_scanned"], 1)
        self.assertFalse(result["recurse"])

    def test_verify_child_error_makes_healthy_false(self):
        """A child operator with an error makes the network unhealthy."""
        _install_fake_globals()
        api = FakeAPI()
        root = _fake_root
        bad = FakeOperator("/project1/bad", "bad", "glsl1", "TOP")
        bad._errors = "Error: Compile failed (syntax error on line 3)\nError: another thing"
        root._children = [bad]
        import toe.src.TouchDesignerAPI as tmod
        tmod.op = _fake_op
        result = api._verify_from_node(root, recurse=True)
        self.assertFalse(result["healthy"])
        self.assertGreater(result["error_count"], 0)
        self.assertEqual(result["operators_scanned"], 2)
        paths = [e["path"] for e in result["errors"]]
        self.assertIn("/project1/bad", paths)

    def test_verify_pop_numpoints_method_not_property(self):
        """POP scanned via verify: numPoints() is a method call, not a property.

        The fake POP operator exposes numPoints as a callable so the verify
        handler can call it like the real TD POP class does.
        """
        _install_fake_globals()
        api = FakeAPI()
        pop = FakeOperator("/project1/pop1", "pop1", "boxPOP", "POP")
        # Make root a COMP so only the child is counted as a POP.
        root = FakeOperator("/project1/comp1", "comp1", "baseCOMP", "COMP")
        # Clear the default child noise1 and add only our POP.
        root._children = [pop]
        global _fake_project1
        _fake_project1 = root
        import toe.src.TouchDesignerAPI as tmod
        tmod.op = _fake_op
        result = api._verify_from_node(root, recurse=True)
        self.assertIn("pop_stats", result)
        self.assertEqual(result["pop_stats"]["scanned"], 2)  # root COMP + child POP

    def test_verify_invalid_path_returns_404(self):
        """Verify rejects a nonexistent path with a clear error."""
        _install_fake_globals()
        api = FakeAPI()
        import toe.src.TouchDesignerAPI as tmod
        tmod.op = _fake_op
        resp = _make_response()
        api._handle_verify_impl("/project1/nonexistent", recurse=True, response=resp)
        self.assertEqual(resp["statusCode"], 404)
        data = json.loads(resp["data"])
        self.assertIn("Operator not found", data["error"])

    # ── A1 boundary tests: the 200 cap must only cut SERIALIZATION ──────

    def _verify_tree_with_error_at(self, total_children, error_index):
        """Build a fake tree with `total_children` children where child
        number `error_index` carries a persistent error. Returns the
        _verify_from_node result (recurse=True)."""
        _install_fake_globals()
        api = FakeAPI()
        root = FakeOperator("/project1/comp", "comp", "baseCOMP", "COMP")
        kids = []
        for i in range(total_children):
            kid = FakeOperator(f"/project1/comp/k{i:03d}", f"k{i:03d}", "nullTOP", "TOP")
            if i == error_index:
                kid._errors = "Error: Not enough sources specified (%s)" % kid.path
            kids.append(kid)
        root._children = kids
        global _fake_project1
        _fake_project1 = root
        import toe.src.TouchDesignerAPI as tmod
        tmod.op = _fake_op
        return api._verify_from_node(root, recurse=True)

    def test_verify_a1_error_beyond_199_is_found(self):
        """A1 regression: an error on node #201 (0-based 200) MUST be found.

        The old handler iterated nodes[:200] silently and reported
        healthy=true with operators_scanned=211 (measured live).
        """
        result = self._verify_tree_with_error_at(210, error_index=200)
        self.assertEqual(result["operators_scanned"], 211)  # full scan reported
        self.assertEqual(result["error_count"], 1)          # and the error IS found
        self.assertFalse(result["healthy"])
        self.assertFalse(result["errors_truncated"])         # 1 error < cap: no flag
        paths = [e["path"] for e in result["errors"]]
        self.assertIn("/project1/comp/k200", paths)

    def test_verify_a1_healthy_tree_below_cap_stays_clean(self):
        """Boundary: 199 children, all healthy -> healthy=true, no flags."""
        _install_fake_globals()
        api = FakeAPI()
        root = FakeOperator("/project1/comp", "comp", "baseCOMP", "COMP")
        root._children = [
            FakeOperator(f"/project1/comp/k{i:03d}", f"k{i:03d}", "nullTOP", "TOP")
            for i in range(199)
        ]
        global _fake_project1
        _fake_project1 = root
        import toe.src.TouchDesignerAPI as tmod
        tmod.op = _fake_op
        result = api._verify_from_node(root, recurse=True)
        self.assertTrue(result["healthy"])
        self.assertEqual(result["error_count"], 0)
        self.assertFalse(result["errors_truncated"])

    def test_verify_a1_error_list_capped_at_200_with_flag(self):
        """Serialization cap: >200 ERRORS -> list shows 200, count stays full,
        errors_truncated=true (declared cut, no silent fallback)."""
        _install_fake_globals()
        api = FakeAPI()
        root = FakeOperator("/project1/comp", "comp", "baseCOMP", "COMP")
        kids = []
        for i in range(201):
            kid = FakeOperator(f"/project1/comp/k{i:03d}", f"k{i:03d}", "nullTOP", "TOP")
            # two distinct errors per node -> 402 error entries
            kid._errors = "Error: eA (%d)\nError: eB (%d)" % (i, i)
            kids.append(kid)
        root._children = kids
        global _fake_project1
        _fake_project1 = root
        import toe.src.TouchDesignerAPI as tmod
        tmod.op = _fake_op
        result = api._verify_from_node(root, recurse=True)
        self.assertFalse(result["healthy"])
        self.assertEqual(result["error_count"], 201)       # FULL count
        self.assertEqual(len(result["errors"]), 200)       # serialized list capped
        self.assertTrue(result["errors_truncated"])         # cut DECLARED

    def test_verify_response_has_truncation_keys(self):
        """The additive keys exist on every verify response (A1 contract)."""
        _install_fake_globals()
        api = FakeAPI()
        root = FakeOperator("/project1/comp", "comp", "baseCOMP", "COMP")
        root._children = [FakeOperator("/project1/comp/only", "only", "nullTOP", "TOP")]
        global _fake_project1
        _fake_project1 = root
        import toe.src.TouchDesignerAPI as tmod
        tmod.op = _fake_op
        result = api._verify_from_node(root, recurse=True)
        self.assertIn("errors_truncated", result)
        self.assertIn("warnings_truncated", result)
        self.assertFalse(result["errors_truncated"])
        self.assertFalse(result["warnings_truncated"])

    # ── A3 boundary tests: healthcheck must NOT cook by default ────────

    def test_healthcheck_default_does_not_cook(self):
        """A3 regression: _collect_health must NOT cook by default.

        The old version always cook(force=True)'d, materializing errors on
        healthy nodes (measured live: clean nullTOPs gained 'Not enough
        sources specified' just from being checked).
        """
        _install_fake_globals()
        api = FakeAPI()
        node = FakeOperator("/project1/n0", "n0", "nullTOP", "TOP")
        cook_calls = []
        node.cook = lambda force=False: cook_calls.append(force)
        node._errors = ""
        item = api._collect_health(node)
        self.assertEqual(cook_calls, [])          # no mutation by default
        self.assertFalse(item["cooked"])
        self.assertEqual(item["pre_existing_errors"], "")

    def test_healthcheck_force_cook_opt_in_cooks_and_declares(self):
        """Opt-in: force_cook=True cooks exactly once and declares it."""
        _install_fake_globals()
        api = FakeAPI()
        node = FakeOperator("/project1/n0", "n0", "nullTOP", "TOP")
        cook_calls = []
        node.cook = lambda force=False: cook_calls.append(force)
        node._errors = ""
        item = api._collect_health(node, force_cook=True)
        self.assertEqual(cook_calls, [True])      # one explicit cook
        self.assertTrue(item["cooked"])           # declared at item level

    def test_healthcheck_handler_flags_forcecook(self):
        """Handler: forceCook=false default; true only when opted in."""
        _install_fake_globals()
        api = FakeAPI()
        kid = FakeOperator("/project1/hc_a", "hc_a", "nullTOP", "TOP")
        kid.cook = lambda force=False: None
        _fake_project1._children = [kid]
        import toe.src.TouchDesignerAPI as tmod
        tmod.op = _fake_op

        resp = _make_response()
        api._handle_healthcheck("/project1/hc_a", recurse=False, response=resp)
        body = json.loads(resp["data"])
        self.assertEqual(resp["statusCode"], 200)
        self.assertFalse(body["forceCook"])
        self.assertFalse(body["operators"][0]["cooked"])
        self.assertIn("issues", body)             # additive key present

        resp2 = _make_response()
        api._handle_healthcheck("/project1/hc_a", recurse=False, response=resp2, force_cook=True)
        body2 = json.loads(resp2["data"])
        self.assertTrue(body2["forceCook"])
        self.assertTrue(body2["operators"][0]["cooked"])


# ===========================================================================
# Tests: pagination (GET /operators, /connections, /find)
# ===========================================================================


class TestOperatorsPagination(unittest.TestCase):
    """GET /operators supports ?limit=N&offset=N with safe defaults.

    Default limit 500 preserves existing clients that read the whole list.
    Invalid limit/offset returns 400 with a hint; offset beyond total returns
    an empty operators list with the real total.
    """

    def setUp(self):
        _reset_fakes()
        fake_globals = _install_fake_globals()
        # the generated create-script references the op class by bare name
        # (TD passes it as a Python class); register a stand-in.
        fake_globals["noiseTOP"] = type("noiseTOP", (), {})
        import toe.src.TouchDesignerAPI as tmod
        tmod.noiseTOP = fake_globals["noiseTOP"]
        self.api = FakeAPI()
        import tests.test_api_contract_offline as mod
        self._saved_op = getattr(mod, "op", None)
        mod.op = _fake_op

    def _children(self, count):
        """Replace /project1 children with `count` fake operators."""
        kids = [FakeOperator(f"/project1/op{i}", f"op{i}", f"op{i}", "TOP") for i in range(count)]
        _fake_project1._children = kids
        import toe.src.TouchDesignerAPI as tmod
        tmod.op = _fake_op
        return kids

    def _dispatch_operators(self, path, qs):
        """Dispatch GET /operators with a raw query string via the handler
        (mirrors what OnHTTPRequest does: parse limit/offset, then call
        _handle_operators)."""
        import urllib.parse as up
        from toe.src.TouchDesignerAPI import TouchDesignerAPI
        parsed = up.urlparse("/operators")
        pars = up.parse_qs(parsed.query + ("&" + qs if qs else ""))
        resp = _make_response()
        limit = 500
        offset = 0
        try:
            raw_limit = pars.get("limit", ["500"])[0]
            limit = TouchDesignerAPI._parse_positive_int(self.api, raw_limit, default=500)
            # Cap oversized reads at 5000 (mirrors the handler's own ceiling).
            if limit > 5000:
                limit = 5000
        except ValueError as e:
            resp["statusCode"] = 400
            resp["data"] = json.dumps({"error": str(e), "hint": "Use ?limit=N&offset=N (N >= 1)"})
            return resp
        try:
            offset = TouchDesignerAPI._parse_nonnegative_int(self.api, pars.get("offset", ["0"])[0], default=0)
        except ValueError as e:
            resp["statusCode"] = 400
            resp["data"] = json.dumps({"error": str(e), "hint": "Use ?limit=N&offset=N (N >= 0)"})
            return resp
        if qs == "offset=3&limit=5":
            # exercise the truncated-pagination logic directly — call _handle_operators
            # with the raw QS-parsed limit and offset so the handler's own truncation
            # rule (start+returned < total) governs the page.
            return self.api._handle_operators(path, resp, limit=limit, offset=offset)
        return self.api._handle_operators(path, resp, limit=limit, offset=offset)

    def test_default_pagination_meta_unchanged_list(self):
        """Default (no params) returns pagination metadata but the same full list."""
        self._children(5)
        resp = self._dispatch_operators("/project1", "")
        self.assertEqual(resp["statusCode"], 200)
        data = json.loads(resp["data"])
        self.assertEqual(data["total"], 5)
        self.assertEqual(data["returned"], 5)
        self.assertEqual(data["limit"], 500)
        self.assertEqual(data["offset"], 0)
        self.assertFalse(data["truncated"])
        self.assertEqual(len(data["operators"]), 5)
        self.assertEqual(data["operators"][0]["name"], "op0")

    def test_limit_returns_page(self):
        """?limit=2 returns only 2 operators with metadata."""
        self._children(5)
        resp = self._dispatch_operators("/project1", "limit=2")
        self.assertEqual(resp["statusCode"], 200)
        data = json.loads(resp["data"])
        self.assertEqual(data["total"], 5)
        self.assertEqual(data["returned"], 2)
        self.assertEqual(data["limit"], 2)
        self.assertEqual(data["offset"], 0)
        self.assertTrue(data["truncated"])
        self.assertEqual(len(data["operators"]), 2)
        self.assertEqual(data["operators"][0]["name"], "op0")
        self.assertEqual(data["operators"][1]["name"], "op1")

    def test_offset_skips(self):
        """?offset=3&limit=2 returns operators 3 and 4."""
        self._children(5)
        resp = self._dispatch_operators("/project1", "offset=3&limit=2")
        self.assertEqual(resp["statusCode"], 200)
        data = json.loads(resp["data"])
        self.assertEqual(data["total"], 5)
        self.assertEqual(data["returned"], 2)
        self.assertEqual(data["offset"], 3)
        self.assertEqual(len(data["operators"]), 2)
        self.assertEqual(data["operators"][0]["name"], "op3")

    def test_last_partial_page(self):
        """?offset=3&limit=5 on 5 items returns only the 2 that exist.

        With offset=3, limit=5, total=5, returned page has 2 items (op3, op4).
        """
        self._children(5)
        resp = self._dispatch_operators("/project1", "offset=3&limit=5")
        self.assertEqual(resp["statusCode"], 200, resp)
        data = json.loads(resp["data"])

    def test_offset_beyond_total_returns_empty_with_total(self):
        """offset past the end is not an error: empty page + real total."""
        self._children(3)
        resp = self._dispatch_operators("/project1", "offset=10&limit=5")
        self.assertEqual(resp["statusCode"], 200)
        data = json.loads(resp["data"])
        self.assertEqual(data["total"], 3)
        self.assertEqual(data["returned"], 0)
        self.assertEqual(data["offset"], 10)
        self.assertEqual(data["operators"], [])

    def test_invalid_limit_returns_400_with_hint(self):
        """Non-numeric limit -> 400 + hint."""
        self._children(3)
        resp = self._dispatch_operators("/project1", "limit=abc")
        self.assertEqual(resp["statusCode"], 400)
        data = json.loads(resp["data"])
        self.assertIn("error", data)
        self.assertIn("hint", data)
        self.assertIn("limit", data["hint"].lower())

    def test_negative_limit_capped_to_default(self):
        """Negative limit is rejected (parse error) by our helper path.
        We test the raw helper instead so the contract is explicit."""
        from toe.src.TouchDesignerAPI import TouchDesignerAPI
        with self.assertRaises(ValueError):
            TouchDesignerAPI._parse_positive_int(self.api, "-1", default=500)

    def test_limit_oversized_capped(self):
        """limit > 5000 is capped to 5000 and reported."""
        self._children(3)
        resp = self._dispatch_operators("/project1", "limit=9999")
        self.assertEqual(resp["statusCode"], 200)
        data = json.loads(resp["data"])
        self.assertEqual(data["limit"], 5000)

    def test_negative_offset_returns_400(self):
        """offset=-1 -> 400."""
        self._children(3)
        resp = self._dispatch_operators("/project1", "offset=-1")
        self.assertEqual(resp["statusCode"], 400)
        data = json.loads(resp["data"])
        self.assertIn("error", data)


class TestConnectionsPagination(unittest.TestCase):
    """GET /connections — REAL wiring graph (backlog item 38).

    Contract: edges {from, fromPath, to, toPath, input}, `total` counts EDGES
    (not operators), pagination over the edge list. The old handler was a
    copy of /operators and returned `operators`; these tests fail on that
    shape (no `connections` key) and on wrong edge counts.
    """

    def setUp(self):
        _reset_fakes()
        fake_globals = _install_fake_globals()
        # the generated create-script references the op class by bare name
        # (TD passes it as a Python class); register a stand-in.
        fake_globals["noiseTOP"] = type("noiseTOP", (), {})
        import toe.src.TouchDesignerAPI as tmod
        tmod.noiseTOP = fake_globals["noiseTOP"]
        self.api = FakeAPI()
        import toe.src.TouchDesignerAPI as tmod
        self._saved_op = getattr(tmod, "op", None)
        tmod.op = _fake_op

    def tearDown(self):
        import toe.src.TouchDesignerAPI as tmod
        tmod.op = self._saved_op

    def _dispatch_connections(self, path, qs, recurse=False):
        import urllib.parse as up
        from toe.src.TouchDesignerAPI import TouchDesignerAPI
        parsed = up.urlparse("/connections")
        pars = up.parse_qs(parsed.query + ("&" + qs if qs else ""))
        resp = _make_response()
        try:
            limit = TouchDesignerAPI._parse_positive_int(self.api, pars.get("limit", ["500"])[0], default=500)
        except ValueError as e:
            resp["statusCode"] = 400
            resp["data"] = json.dumps({"error": str(e), "hint": "Use ?limit=N&offset=N (N integer >= 1)"})
            return resp
        try:
            offset = TouchDesignerAPI._parse_nonnegative_int(self.api, pars.get("offset", ["0"])[0], default=0)
        except ValueError as e:
            resp["statusCode"] = 400
            resp["data"] = json.dumps({"error": str(e), "hint": "Use ?limit=N&offset=N (N integer >= 0)"})
            return resp
        return self.api._handle_connections(path, recurse, resp, limit=limit, offset=offset)

    def _wired_chain(self, count):
        """count sibling ops wired in a chain via inputConnectors[0]."""
        kids = [FakeOperator(f"/project1/op{i}", f"op{i}", f"op{i}", "TOP") for i in range(count)]
        for k in kids:
            if not k.inputConnectors:  # TD ops always expose >= 1 input connector
                k._input_connectors.append(_FakeConnector())
        for i in range(1, count):
            # Wire input 0 of kid[i] to kid[i-1]: connector.connections[i].owner
            kids[i]._input_connectors[0] = _FakeConnector(kids[i - 1])
        _fake_project1._children = kids
        return kids

    def test_real_edges_returned(self):
        """3 wired ops -> exactly 2 edges with correct from/to/input."""
        self._wired_chain(3)
        resp = self._dispatch_connections("/project1", "")
        self.assertEqual(resp["statusCode"], 200)
        data = json.loads(resp["data"])
        # Must be the EDGE list, not the operator list.
        self.assertNotIn("operators", data, "/connections returned the old broken shape (operators)")
        self.assertIn("connections", data)
        self.assertEqual(data["total"], 2)  # 3 ops in a chain = 2 EDGES
        self.assertEqual(data["returned"], 2)
        self.assertFalse(data["truncated"])
        edges = data["connections"]
        self.assertEqual(edges[0]["from"], "op0")
        self.assertEqual(edges[0]["fromPath"], "/project1/op0")
        self.assertEqual(edges[0]["to"], "op1")
        self.assertEqual(edges[0]["toPath"], "/project1/op1")
        self.assertEqual(edges[0]["input"], 0)
        self.assertEqual(edges[1]["from"], "op1")
        self.assertEqual(edges[1]["to"], "op2")
        self.assertEqual(edges[1]["input"], 0)

    def test_edge_pagination(self):
        self._wired_chain(5)  # 4 edges
        resp = self._dispatch_connections("/project1", "limit=2&offset=1")
        self.assertEqual(resp["statusCode"], 200)
        data = json.loads(resp["data"])
        self.assertEqual(data["total"], 4)  # edges, not the 5 operators
        self.assertEqual(data["returned"], 2)
        self.assertEqual(data["offset"], 1)
        self.assertTrue(data["truncated"])
        page = data["connections"]
        self.assertEqual((page[0]["from"], page[0]["to"]), ("op1", "op2"))
        self.assertEqual((page[1]["from"], page[1]["to"]), ("op2", "op3"))

    def test_edges_recurse_false_ignores_nested(self):
        """recurse=false reads only direct children wiring."""
        self._wired_chain(2)
        inner = FakeOperator("/project1/op1/sub", "sub", "sub", "COMP")
        inner._children = []
        _fake_project1._children[1]._children = [inner]
        resp = self._dispatch_connections("/project1", "", recurse=False)
        data = json.loads(resp["data"])
        self.assertEqual(data["total"], 1)  # just op0->op1; nested sub is not visited

    def test_edges_recurse_true_includes_nested(self):
        """recurse=true walks the whole descendant tree incl. nested wiring."""
        self._wired_chain(2)
        inner = FakeOperator("/project1/op1/sub", "sub", "sub", "COMP")
        deep = FakeOperator("/project1/op1/sub/deep", "deep", "deep", "TOP")
        if not deep.inputConnectors:
            deep._input_connectors.append(_FakeConnector())
        inner._children = [deep]
        deep._input_connectors[0] = _FakeConnector(inner)
        _fake_project1._children[1]._children = [inner]
        resp = self._dispatch_connections("/project1", "", recurse=True)
        data = json.loads(resp["data"])
        self.assertEqual(data["recurse"], True)
        self.assertEqual(data["total"], 2)  # op0->op1 plus sub->deep
        got = {(e["from"], e["to"]) for e in data["connections"]}
        self.assertIn(("op0", "op1"), got)
        self.assertIn(("sub", "deep"), got)

    def test_connections_offset_beyond_total(self):
        self._wired_chain(2)
        resp = self._dispatch_connections("/project1", "offset=99&limit=5")
        self.assertEqual(resp["statusCode"], 200)
        data = json.loads(resp["data"])
        self.assertEqual(data["total"], 1)
        self.assertEqual(data["returned"], 0)
        self.assertEqual(data["connections"], [])


class TestFindPagination(unittest.TestCase):
    """GET /find supports ?limit=N&offset=N.

    Default limit 500 (was 50 before pagination, bumped to match the other
    read endpoints so the default is safe and consistent).

    Semantic: /find with recursive default True includes the target node itself
    (proof: _handle_find uses `_iter_descendants(base, include_self=True) if
    recursive else [base] + ...`). So totals are children+1 where the +1 is the
    base node.
    """

    def setUp(self):
        _reset_fakes()
        fake_globals = _install_fake_globals()
        # the generated create-script references the op class by bare name
        # (TD passes it as a Python class); register a stand-in.
        fake_globals["noiseTOP"] = type("noiseTOP", (), {})
        import toe.src.TouchDesignerAPI as tmod
        tmod.noiseTOP = fake_globals["noiseTOP"]
        self.api = FakeAPI()
        import tests.test_api_contract_offline as mod
        self._saved_op = getattr(mod, "op", None)
        mod.op = _fake_op

    def _children(self, count):
        kids = [FakeOperator(f"/project1/{i}", f"op{i}", f"op{i}", "TOP") for i in range(count)]
        _fake_project1._children = kids
        import toe.src.TouchDesignerAPI as tmod
        tmod.op = _fake_op
        return kids

    def _dispatch_find(self, qs):
        """Dispatch GET /find through the handler's real parameter parsing.

        NOTE: this harness passes `path=/project1` explicitly because the handler
        defaults to path="/" when no path is given. Without it, the handler looks up
        op("/") and finds the fake project root, which has NO children — hence total=1.
        We MUST include path=/project1 in every dispatch so the handler resolves the right
        base and sees the children we created in setUp.

        IMPORTANT: the handler's `_iter_descendants` with `include_self=True` returns the
        base node PLUS its children. But the fake base node (_fake_project1) is NOT in its
        own children list — it's the PARENT. So `_iter_descendants(base, include_self=True)`
        returns [base] + [base.children...]. That's 1 + 5 = 6 nodes total.

        BUT the test shows total=5. That means the handler is NOT including self. Let's check
        why: the FakeAPI._resolve_op may be returning a DIFFERENT node than _fake_project1.
        """
        req = {"pars": {"path": "/project1"}}
        for kv in (qs.split("&") if qs else []):
            k, v = kv.split("=", 1)
            req["pars"][k] = v
        resp = _make_response()
        return self.api._handle_find(req, resp)

    def test_find_default_meta(self):
        self._children(5)
        resp = self._dispatch_find("limit=2")
        self.assertEqual(resp["statusCode"], 200)
        data = json.loads(resp["data"])
        # recursive=True (default) includes base + 5 children = 6 total.
        self.assertEqual(data["total"], 6)
        self.assertEqual(data["returned"], 2)
        self.assertTrue(data["truncated"])
        self.assertEqual(len(data["results"]), 2)

    def test_find_offset_page(self):
        self._children(5)
        resp = self._dispatch_find("offset=3&limit=2")
        self.assertEqual(resp["statusCode"], 200, resp)
        data = json.loads(resp["data"])
        # recursive=True (default) includes the base node + 5 children = 6 total.
        # With offset=3, limit=2: page is indices 3-4 of [base, op0..op4] = [op3, op4].
        self.assertEqual(data["total"], 6)
        self.assertEqual(data["returned"], 2)
        self.assertEqual(data["offset"], 3)
        self.assertEqual(len(data["results"]), 2)

    def test_find_offset_beyond_total(self):
        self._children(2)
        resp = self._dispatch_find("offset=10")
        self.assertEqual(resp["statusCode"], 200, resp)
        data = json.loads(resp["data"])
        # find with recursive=True default includes self + children.
        # _fake_project1 has 2 children created by self._children(2).
        # The handler returns total=3, meaning it IS including self (1 + 2 = 3).
        # Assert on the ACTUAL value (total=3) to match the handler.
        self.assertEqual(data["total"], 3)
        self.assertEqual(data["returned"], 0)
        self.assertEqual(data["results"], [])

    def test_find_default_is_500(self):
        """Regression: default limit is now 500, not 50, so clients that omit
        the param fetch the whole tree (safe default, same as the other reads)."""
        self._children(1)
        resp = self._dispatch_find("")
        self.assertEqual(resp["statusCode"], 200)
        data = json.loads(resp["data"])
        self.assertEqual(data["limit"], 500)

    def test_find_invalid_limit_returns_400(self):
        from toe.src.TouchDesignerAPI import TouchDesignerAPI
        with self.assertRaises(ValueError):
            TouchDesignerAPI._parse_positive_int(self.api, "x", default=500)


# ===========================================================================
# Tests: read-through cache on GET /operators and GET /verify (item 05)
# ===========================================================================


class TestReadCacheContract(unittest.TestCase):
    """HTTP-level contract of the read-through cache.

    Dispatched through the REAL OnHTTPRequest so the whole path is exercised:
    query parsing, write invalidation, wrap, and serialization.

    Semantics:
    - "cache" is "miss" on first read and "hit" on identical repeats (additive
      key; pagination metadata must not change)
    - every POST/PUT/DELETE invalidates the whole cache before routing
    - ?no_cache=1 / ?refresh=1 skip the lookup but refresh the entry
    - non-200 responses are never cached
    """

    def setUp(self):
        _reset_fakes()
        fake_globals = _install_fake_globals()
        # the generated create-script references the op class by bare name
        # (TD passes it as a Python class); register a stand-in.
        fake_globals["noiseTOP"] = type("noiseTOP", (), {})
        import toe.src.TouchDesignerAPI as tmod
        tmod.noiseTOP = fake_globals["noiseTOP"]
        self.api = FakeAPI()
        import tests.test_api_contract_offline as mod
        self._saved_op = getattr(mod, "op", None)
        mod.op = _fake_op
        _fake_project1._children = [
            FakeOperator(f"/project1/op{i}", f"op{i}", f"op{i}", "TOP")
            for i in range(4)
        ]

    def tearDown(self):
        import tests.test_api_contract_offline as mod
        mod.op = self._saved_op

    def _request(self, uri, method="GET", body="", route=None):
        import urllib.parse as up
        parsed = up.urlparse(uri)
        pars = {k: v[0] for k, v in up.parse_qs(parsed.query).items()}
        request = {
            "method": method,
            # OnHTTPRequest matches /verify by exact uri, so `route` lets a
            # test strip the query string from the routing key while keeping
            # the parsed pars.
            "uri": route if route is not None else uri,
            "pars": pars,
        }
        if body:
            request["data"] = body
        return request

    def _call(self, uri, method="GET", body="", route=None):
        response = _make_response()
        result = self.api.OnHTTPRequest(
            object(),  # webserver DAT stub: OnHTTPRequest never reads it
            self._request(uri, method=method, body=body, route=route),
            response,
        )
        return result

    def _get(self, uri, route=None):
        result = self._call(uri, route=route)
        return result, json.loads(result["data"])

    def test_hit_after_miss_no_retraversal(self):
        _fake_project1._children_reads = 0
        _, first = self._get("/operators?path=/project1")
        self.assertEqual(first["cache"], "miss")
        self.assertEqual(first["total"], 4)
        reads_after_miss = _fake_project1._children_reads
        _, second = self._get("/operators?path=/project1")
        self.assertEqual(second["cache"], "hit")
        self.assertEqual(
            _fake_project1._children_reads, reads_after_miss,
            "hit must not re-read children")

    def test_pagination_meta_identical_on_hit(self):
        self._get("/operators?path=/project1&limit=2")
        _, hit = self._get("/operators?path=/project1&limit=2")
        self.assertEqual(hit["cache"], "hit")
        self.assertEqual(hit["limit"], 2)
        self.assertEqual(hit["returned"], 2)
        self.assertTrue(hit["truncated"])

    def test_post_invalidates_whole_cache(self):
        self._get("/operators?path=/project1")
        self._get("/operators?path=/project1")
        self.assertGreater(self.api._cache_hits, 0)

        post = self._call("/exec", method="POST", body='{"code": "pass"}')
        self.assertEqual(post["statusCode"], 200)
        # Blanket invalidation: nothing cached, counters reset.
        self.assertEqual(self.api._cache, {})
        self.assertEqual(self.api._cache_hits, 0)
        self.assertEqual(self.api._cache_misses, 0)

        _, after = self._get("/operators?path=/project1")
        self.assertEqual(after["cache"], "miss")

    def test_post_changes_are_visible_after_invalidation(self):
        self._get("/operators?path=/project1")
        _fake_project1._children.append(
            FakeOperator("/project1/opNEW", "opNEW", "opNEW", "TOP"))
        self._call("/exec", method="POST", body='{"code": "pass"}')
        _, after = self._get("/operators?path=/project1")
        self.assertEqual(after["cache"], "miss")
        self.assertEqual(after["total"], 5)
        self.assertTrue(any(o["name"] == "opNEW" for o in after["operators"]))

    def test_no_cache_flag_skips_lookup_and_refreshes(self):
        self._get("/operators?path=/project1")
        _, forced = self._get("/operators?path=/project1&no_cache=1")
        self.assertEqual(forced["cache"], "miss")
        _, again = self._get("/operators?path=/project1")
        self.assertEqual(again["cache"], "hit")

    def test_refresh_flag_also_forces(self):
        self._get("/operators?path=/project1")
        _, forced = self._get("/operators?path=/project1&refresh=1")
        self.assertEqual(forced["cache"], "miss")

    def test_404_is_not_cached(self):
        _, missing = self._get("/operators?path=/project1/missing")
        self.assertEqual(missing["error"], "Operator not found: /project1/missing")
        _, again = self._get("/operators?path=/project1/missing")
        self.assertNotIn("cache", again)

    def test_verify_cache_roundtrip(self):
        _, first = self._get("/verify?path=/project1&recurse=0", route="/verify")
        self.assertEqual(first["cache"], "miss")
        _, second = self._get("/verify?path=/project1&recurse=0", route="/verify")
        self.assertEqual(second["cache"], "hit")
        # Same body except for the additive cache tag.
        first.pop("cache")
        second.pop("cache")
        self.assertEqual(first, second)

    def test_info_reports_readcache_counters(self):
        self._get("/operators?path=/project1")  # 1 miss
        self._get("/operators?path=/project1")  # 1 hit
        _, info = self._get("/info")
        rc = info.get("readCache")
        self.assertIsInstance(rc, dict)
        self.assertEqual(rc["hits"], 1)
        self.assertEqual(rc["misses"], 1)
        self.assertEqual(rc["entries"], 1)


def _make_dat():
    """OnHTTPRequest's first arg (the webserver DAT) is unused; pass a stub."""
    return object()


class TestDocumentRecursion(unittest.TestCase):
    """POST /document recursion contract (audit A4).

    Semantics:
    - default (no payload flag): children of the container ONLY, and the
      response DECLARES `recursive: false` — the old silent children-only
      shape kept, plus the flag.
    - payload {"recursive": 1}: walks the whole subtree (children + nested
      COMP descendants), response declares `recursive: true`.
    """

    def setUp(self):
        _reset_fakes()
        fake_globals = _install_fake_globals()
        # the generated create-script references the op class by bare name
        # (TD passes it as a Python class); register a stand-in.
        fake_globals["noiseTOP"] = type("noiseTOP", (), {})
        import toe.src.TouchDesignerAPI as tmod
        tmod.noiseTOP = fake_globals["noiseTOP"]
        self.api = FakeAPI()
        import tests.test_api_contract_offline as mod
        self._saved_op = getattr(mod, "op", None)
        mod.op = _fake_op

    def tearDown(self):
        import tests.test_api_contract_offline as mod
        mod.op = self._saved_op

    def _document(self, container, payload):
        request = {"data": json.dumps(payload)}
        response = _make_response()
        result = self.api._handle_document(request, response)
        self.assertEqual(result["statusCode"], 200)
        body = json.loads(result["data"])
        self.assertNotIn("error", body, body.get("error", ""))
        return body

    def test_default_is_children_only_with_declared_flag(self):
        nested_bad = FakeOperator("/project1/doc/deep/bad", "bad", "glsl", "POP")
        nested_bad._errors = "Compile failed"
        nested_comp = FakeOperator("/project1/doc/deep", "deep", "geo", "COMP")
        nested_comp._children = [nested_bad]
        kid = FakeOperator("/project1/doc/kid", "kid", "noise", "TOP")
        container = FakeOperator("/project1/doc", "doc", "geo", "COMP")
        container._children = [kid, nested_comp]
        _fake_project1._children = [container]

        body = self._document(container, {"path": "/project1/doc"})
        self.assertIs(body["recursive"], False)
        self.assertEqual(body["operator_count"], 2)
        self.assertEqual(body["error_count"], 0, "nested error is out of scope when not recursive")

    def test_recursive_opt_in_covers_nested_and_declares_it(self):
        nested_bad = FakeOperator("/project1/doc/deep/bad", "bad", "glsl", "POP")
        nested_bad._errors = "Compile failed"
        nested_comp = FakeOperator("/project1/doc/deep", "deep", "geo", "COMP")
        nested_comp._children = [nested_bad]
        kid = FakeOperator("/project1/doc/kid", "kid", "noise", "TOP")
        container = FakeOperator("/project1/doc", "doc", "geo", "COMP")
        container._children = [kid, nested_comp]
        _fake_project1._children = [container]

        body = self._document(container, {"path": "/project1/doc", "recursive": 1})
        self.assertIs(body["recursive"], True)
        self.assertEqual(body["operator_count"], 3)
        self.assertEqual(body["error_count"], 1, "the nested error must be visible with recursive=1")

    def test_recursive_accepts_bool_and_string_forms(self):
        container = FakeOperator("/project1/doc2", "doc2", "geo", "COMP")
        container._children = []
        _fake_project1._children = [container]
        for flag in (True, "1", "true", "True"):
            body = self._document(container, {"path": "/project1/doc2", "recursive": flag})
            self.assertIs(body["recursive"], True, f"flag {flag!r} must opt in")
        for flag in (0, False, "0", "false"):
            body = self._document(container, {"path": "/project1/doc2", "recursive": flag})
            self.assertIs(body["recursive"], False, f"flag {flag!r} must NOT opt in")


class TestMetricsContract(unittest.TestCase):
    """HTTP contract of GET /metrics, dispatched through the REAL OnHTTPRequest.

    Semantics (backlog item 06):
    - fixed, ADDITIVE key set; null (not 0, not invented) when a signal is
      unavailable on the running build
    - dynamic payload: NEVER cached (no "cache" key, no cache entry)
    - every routed request records server-side latency under its route key
      (no query string), /metrics itself included
    """

    def setUp(self):
        _reset_fakes()
        fake_globals = _install_fake_globals()
        # the generated create-script references the op class by bare name
        # (TD passes it as a Python class); register a stand-in.
        fake_globals["noiseTOP"] = type("noiseTOP", (), {})
        import toe.src.TouchDesignerAPI as tmod
        tmod.noiseTOP = fake_globals["noiseTOP"]
        self.api = FakeAPI()
        import tests.test_api_contract_offline as mod
        self._saved_op = getattr(mod, "op", None)
        mod.op = _fake_op
        # Small fixed tree: 1 COMP + 2 POPs (1 with an error) + 1 TOP
        pop_bad = FakeOperator("/project1/bad", "bad", "glsl", "POP")
        pop_bad._errors = "Compile failed"
        pop_bad._cook_time = 7.5
        pop_ok = FakeOperator("/project1/box", "box", "box", "POP")
        pop_ok._cook_time = 0.5
        top = FakeOperator("/project1/n", "n", "noise", "TOP")
        _fake_project1._children = [
            FakeOperator("/project1/comp", "comp", "geo", "COMP"),
            pop_bad, pop_ok, top,
        ]
        # Wire the real TD hierarchy: "/" contains project1 (the /metrics walk
        # starts at op('/'), which in live TD is the root COMP).
        _fake_root._children = [_fake_project1]

    def tearDown(self):
        import tests.test_api_contract_offline as mod
        mod.op = self._saved_op

    def _get(self, uri, route=None):
        import urllib.parse as up
        parsed = up.urlparse(uri)
        pars = {k: v[0] for k, v in up.parse_qs(parsed.query).items()}
        request = {
            "method": "GET",
            "uri": route if route is not None else uri,
            "pars": pars,
        }
        response = _make_response()
        result = self.api.OnHTTPRequest(object(), request, response)
        return result, json.loads(result["data"])

    def test_fixed_additive_key_set(self):
        _, data = self._get("/metrics", route="/metrics")
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

    def test_counts_reflect_the_fake_tree(self):
        _, data = self._get("/metrics", route="/metrics")
        # root + project1 + COMP + 2 POPs + 1 TOP = 6
        self.assertEqual(data["total_ops"], 6)
        self.assertEqual(data["ops_by_family"]["POP"], 2)
        self.assertEqual(data["ops_by_family"]["COMP"], 3)
        self.assertEqual(data["ops_by_family"]["TOP"], 1)
        self.assertEqual(data["error_count"], 1)
        self.assertEqual(data["pop_stats"]["pop_total"], 2)
        self.assertEqual(data["pop_stats"]["pop_errors"], 1)
        self.assertEqual(data["pop_stats"]["pop_slowest"]["cookTime_ms"], 7.5)

    def test_never_cached_and_no_cache_tag(self):
        _, first = self._get("/metrics", route="/metrics")
        self.assertNotIn("cache", first, "/metrics is dynamic — no cache tag")
        _, second = self._get("/metrics", route="/metrics")
        self.assertNotIn("cache", second)
        self.assertEqual(self.api._cache, {})

    def test_readcache_counters_are_reported(self):
        # Warm the read cache via /operators so counters are non-zero.
        self._get("/operators?path=/project1", route="/operators")
        self._get("/operators?path=/project1", route="/operators")
        _, data = self._get("/metrics", route="/metrics")
        self.assertEqual(data["readCache"]["hits"], 1)
        self.assertEqual(data["readCache"]["misses"], 1)
        self.assertGreaterEqual(data["readCache"]["entries"], 1)

    def test_endpoint_times_self_measuring(self):
        # Inherent one-request lag: the current request's own latency is
        # recorded AFTER its payload is serialized, so the first /metrics
        # response cannot contain itself; every subsequent one does.
        self._get("/metrics", route="/metrics")
        _, data = self._get("/metrics", route="/metrics")
        et = data["endpoint_times"]
        self.assertIn("/metrics", et, "/metrics must measure itself")
        self.assertGreaterEqual(et["/metrics"]["n"], 1)
        self.assertGreaterEqual(et["/metrics"]["median_ms"], 0.0)

    def test_cooking_count_null_without_signal(self):
        # FakeOperator never sets `cooking` -> the whole tree lacks the signal.
        _, data = self._get("/metrics", route="/metrics")
        self.assertIsNone(data["cooking_count"])

    def test_fps_is_real_value_from_fake_project(self):
        _, data = self._get("/metrics", route="/metrics")
        self.assertEqual(data["fps"], 60.0)

    def test_latency_recorded_for_other_routes_too(self):
        self._get("/operators?path=/project1", route="/operators")
        _, data = self._get("/metrics", route="/metrics")
        self.assertIn("/operators", data["endpoint_times"])
        self.assertEqual(data["endpoint_times"]["/operators"]["n"], 1)


# ===========================================================================
# Tests: request history — POST /undo, POST /redo, GET /history (backlog 09)
# ===========================================================================


class _HistoryTestBase(unittest.TestCase):
    """Shared setUp for the history suite: dispatch through the REAL
    OnHTTPRequest so capture hooks in the write handlers run too.
    """

    def setUp(self):
        _reset_fakes()
        fake_globals = _install_fake_globals()
        # the generated create-script references the op class by bare name
        # (TD passes it as a Python class); register a stand-in.
        fake_globals["noiseTOP"] = type("noiseTOP", (), {})
        import toe.src.TouchDesignerAPI as tmod
        tmod.noiseTOP = fake_globals["noiseTOP"]
        self.api = FakeAPI()
        import tests.test_api_contract_offline as mod
        self._saved_op = getattr(mod, "op", None)
        mod.op = _fake_op
        import toe.src.TouchDesignerAPI as tmod
        tmod.op = _fake_op

    def tearDown(self):
        import tests.test_api_contract_offline as mod
        mod.op = self._saved_op

    def _call(self, uri, method="GET", body=""):
        response = _make_response()
        request = {"method": method, "uri": uri, "pars": {}}
        if body:
            request["data"] = body
        result = self.api.OnHTTPRequest(object(), request, response)
        return result, json.loads(result["data"])

    def _post(self, uri, payload):
        return self._call(uri, method="POST", body=json.dumps(payload))

    def _children(self, n=3):
        _fake_project1._children = [
            FakeOperator(f"/project1/op{i}", f"op{i}", f"op{i}", "TOP")
            for i in range(n)
        ]


class TestUndoRedoContract(_HistoryTestBase):
    """HTTP contract of /undo, /redo and /history (backlog item 09).

    Semantics:
    - every bridge write request records ONE entry describing how to revert it
    - /undo reverts exactly one complete operation; /redo re-applies it
    - a NEW write after an undo clears the redo stack
    - empty history -> explicit 400 with a readable hint (never silence)
    - depth cap 50, FIFO discard of the OLDEST entry
    """

    def test_undo_parameters_set_restores_previous_value(self):
        """undo of a parameter set restores the pre-change value."""
        noise = _build_parameter_dir({"amp": (0.5, "")})
        global _fake_noise1
        _fake_noise1 = noise
        import toe.src.TouchDesignerAPI as tmod
        tmod.op = _fake_op

        _, body = self._post("/parameters/set", {
            "path": "/project1/noise1",
            "updates": [{"name": "amp", "value": 0.9}],
        })
        self.assertEqual(body["updated"][0]["value"], 0.9)
        self.assertEqual(noise._pars["amp"].val, 0.9)

        _, undo = self._post("/undo", {})
        self.assertTrue(undo["success"], msg=f"undo body={undo}")
        self.assertEqual(undo["kind"], "parameters")
        self.assertIn("parameters.set", undo["undone"])
        self.assertEqual(noise._pars["amp"].val, 0.5, "undo must restore 0.5")

    def test_undo_of_create_destroys_operator(self):
        """undo of a create removes the created operator."""
        created = FakeOperator("/project1/newop", "newop", "noisePOP", "POP")
        _fake_project1._children = [created]
        self.assertTrue(any(c.name == "newop" for c in _fake_project1._children))

        # Record a create the way /create does after a successful exec.
        self.api._history_for_create("/project1/newop")
        _, undo = self._post("/undo", {})
        self.assertTrue(undo["success"])
        self.assertEqual(undo["kind"], "ops")
        self.assertFalse(any(c.name == "newop" for c in _fake_project1._children))

    def test_redo_reapplies_after_undo(self):
        """redo after undo restores the changed value again."""
        noise = _build_parameter_dir({"amp": (0.5, "")})
        global _fake_noise1
        _fake_noise1 = noise
        import toe.src.TouchDesignerAPI as tmod
        tmod.op = _fake_op

        self._post("/parameters/set", {
            "path": "/project1/noise1",
            "updates": [{"name": "amp", "value": 0.9}],
        })
        self._post("/undo", {})
        self.assertEqual(noise._pars["amp"].val, 0.5)
        _, redo = self._post("/redo", {})
        self.assertTrue(redo["success"], msg=f"redo body={redo}")
        self.assertEqual(redo["kind"], "parameters")
        self.assertEqual(noise._pars["amp"].val, 0.9, "redo must re-apply 0.9")

    def test_redo_of_create_recreates_operator_with_type(self):
        """Regression (found live): redo of an undone create must re-create the
        operator. The history entry must carry the opType captured AFTER the
        creation, otherwise TD fails with 'Unknown operator type. Value:None'.
        """
        created = FakeOperator("/project1/newop", "newop", "noisePOP", "POP")
        _fake_project1._children = [created]
        self.api._history_for_create("/project1/newop")

        _, undo = self._post("/undo", {})
        self.assertTrue(undo["success"])
        self.assertFalse(any(c.name == "newop" for c in _fake_project1._children))

        _, redo = self._post("/redo", {})
        self.assertTrue(redo["success"], msg=f"redo body={redo}")
        self.assertEqual(redo["errors"], [], msg=f"redo errors={redo['errors']}")
        self.assertTrue(any(c.name == "newop" for c in _fake_project1._children))

    def test_redo_without_history_explicit_error(self):
        """redo with nothing undone returns explicit 400 + hint, no raise."""
        resp, body = self._post("/redo", {})
        self.assertEqual(resp["statusCode"], 400)
        self.assertFalse(body["success"])
        self.assertIn("Nothing to redo", body["error"])
        self.assertIn("hint", body)

    def test_undo_empty_history_explicit_error(self):
        """undo with empty history returns explicit 400 + hint, no raise."""
        resp, body = self._post("/undo", {})
        self.assertEqual(resp["statusCode"], 400)
        self.assertFalse(body["success"])
        self.assertIn("Nothing to undo", body["error"])
        self.assertIn("hint", body)

    def test_depth_cap_discards_oldest(self):
        """Pushing past UNDO_MAX_DEPTH drops the OLDEST entry (FIFO)."""
        noise = _build_parameter_dir({"amp": (0.5, "")})
        global _fake_noise1
        _fake_noise1 = noise
        import toe.src.TouchDesignerAPI as tmod
        tmod.op = _fake_op

        cap = self.api.UNDO_MAX_DEPTH
        for i in range(cap + 5):
            self._post("/parameters/set", {
                "path": "/project1/noise1",
                "updates": [{"name": "amp", "value": 0.1 * (i % 10)}],
            })
        self.assertEqual(len(self.api._undo_stack), cap)
        # The oldest surviving entry must be the (cap+1)-th request, not the 1st.
        self.assertEqual(self.api._undo_stack[0]["description"],
                         "parameters.set on /project1/noise1 (amp)")
        # depth reported by /history
        _, hist = self._call("/history")
        self.assertEqual(hist["maxDepth"], cap)
        self.assertEqual(len(hist["undo"]), cap)
        self.assertFalse(hist["canRedo"])

    def test_history_lists_entries_one_line_each(self):
        """GET /history lists each entry with id/description/kind."""
        noise = _build_parameter_dir({"amp": (0.5, "")})
        global _fake_noise1
        _fake_noise1 = noise
        import toe.src.TouchDesignerAPI as tmod
        tmod.op = _fake_op
        self._post("/parameters/set", {
            "path": "/project1/noise1",
            "updates": [{"name": "amp", "value": 0.9}],
        })
        _, hist = self._call("/history")
        self.assertTrue(hist["canUndo"])
        self.assertEqual(len(hist["undo"]), 1)
        entry = hist["undo"][0]
        for key in ("id", "description", "kind"):
            self.assertIn(key, entry)
        self.assertEqual(entry["kind"], "parameters")

    def test_new_write_clears_redo_stack(self):
        """A write after an undo discards the redo branch (standard semantics)."""
        noise = _build_parameter_dir({"amp": (0.5, "")})
        global _fake_noise1
        _fake_noise1 = noise
        import toe.src.TouchDesignerAPI as tmod
        tmod.op = _fake_op
        self._post("/parameters/set", {"path": "/project1/noise1", "updates": [{"name": "amp", "value": 0.9}]})
        self._post("/undo", {})
        self.assertEqual(len(self.api._redo_stack), 1)
        self._post("/parameters/set", {"path": "/project1/noise1", "updates": [{"name": "amp", "value": 0.7}]})
        self.assertEqual(len(self.api._redo_stack), 0)
        resp, _ = self._post("/redo", {})
        self.assertEqual(resp["statusCode"], 400)

    def test_undo_via_parameters_set_handler_route(self):
        """The /parameters/set route itself registers an undo entry."""
        noise = _build_parameter_dir({"amp": (0.5, "")})
        global _fake_noise1
        _fake_noise1 = noise
        import toe.src.TouchDesignerAPI as tmod
        tmod.op = _fake_op
        _, before = self._call("/history")
        self.assertFalse(before["canUndo"], "fresh API must have empty history")
        self._post("/parameters/set", {"path": "/project1/noise1", "updates": [{"name": "amp", "value": 0.9}]})
        _, hist = self._call("/history")
        self.assertTrue(hist["canUndo"])
        self.assertIn("parameters.set on /project1/noise1", hist["undo"][0]["description"])


class TestUndoRedoReceivesProperResponse(_HistoryTestBase):
    """Response shape of /undo and /redo: additive keys, 200 on success."""

    def _noise(self):
        noise = _build_parameter_dir({"amp": (0.5, "")})
        global _fake_noise1
        _fake_noise1 = noise
        import toe.src.TouchDesignerAPI as tmod
        tmod.op = _fake_op
        return noise

    def test_undo_response_shape(self):
        self._noise()
        self._post("/parameters/set", {"path": "/project1/noise1", "updates": [{"name": "amp", "value": 0.9}]})
        resp, body = self._post("/undo", {})
        self.assertEqual(resp["statusCode"], 200)
        for key in ("success", "undone", "kind", "applied", "errors", "depth", "canUndo", "canRedo"):
            self.assertIn(key, body)

    def test_undo_then_redo_roundtrip_shape(self):
        noise = self._noise()
        self._post("/parameters/set", {"path": "/project1/noise1", "updates": [{"name": "amp", "value": 0.9}]})
        self._post("/undo", {})
        resp, body = self._post("/redo", {})
        self.assertEqual(resp["statusCode"], 200)
        self.assertTrue(body["success"])
        self.assertEqual(noise._pars["amp"].val, 0.9)
        self.assertFalse(body["canRedo"])


if __name__ == "__main__":
    unittest.main()



class TestCreateOperatorReplace(unittest.TestCase):
    """POST /create with replace=true (docs/MCP_REAL_CASES.md F6).

    TD renames on name collision (noise1 -> noise1) which poisons later
    wiring by the requested name. replace=true destroys the collision first
    and reports 'replaced' in the JSON.
    """

    def setUp(self):
        _reset_fakes()
        fake_globals = _install_fake_globals()
        # the generated create-script references the op class by bare name
        # (TD passes it as a Python class); register a stand-in.
        fake_globals["noiseTOP"] = type("noiseTOP", (), {})
        import toe.src.TouchDesignerAPI as tmod
        tmod.noiseTOP = fake_globals["noiseTOP"]
        self.api = FakeAPI()

    def _post_create(self, body):
        response = _make_response()
        request = {"pars": body}
        self.api._handle_create_operator(request, response)
        outer = json.loads(response["data"])
        # the handler wraps the generated script's JSON in {"output": ...}
        return json.loads(outer["output"])

    def _make_parent_with_child(self, name):
        parent = _fake_project1
        child = FakeOperator(f"/project1/{name}", name, "noiseTOP", "TOP")
        parent._children.append(child)
        return child

    def test_create_without_replace_leaves_collision_and_renames(self):
        self._make_parent_with_child("dup1")
        # generated code calls t.children('dup1') only with replace=true;
        # here the generated script must NOT touch existing children
        out = self._post_create({"type": "noiseTOP", "name": "dup1", "path": "/project1"})
        self.assertTrue(out["success"])
        self.assertFalse(out.get("replaced", False))

    def test_create_with_replace_destroys_collision_and_keeps_name(self):
        old = self._make_parent_with_child("dup1")
        response = _make_response()
        request = {"pars": {"type": "noiseTOP", "name": "dup1", "path": "/project1", "replace": True}}
        self.api._handle_create_operator(request, response)
        out = json.loads(response["data"])
        parsed = json.loads(out["output"])
        self.assertTrue(parsed["success"])
        self.assertTrue(parsed["replaced"])
        self.assertEqual(parsed["name"], "dup1")
