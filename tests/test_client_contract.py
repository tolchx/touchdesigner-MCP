"""Bridge contract suite (backlog item 11): Python client <-> Python handler.

Detects DRIFT between what the clients send and what the bridge handlers
read. Two clients exist:

  - the TS TDClient (api/src/index.ts)  -> covered by mcp/test/bridgeContract.test.js
  - the stdio Python client (mcp_server_stdio.py) -> covered HERE

Both suites pivot on the SAME declarative contract: tests/bridge_contract.json.
If you change a write endpoint, update that file in the same commit or this
suite fails with a message naming the diverging field and the side that moved.

Limitations (honest scope):
  - The TS client's bodies are asserted in the Node suite over a real HTTP
    stub, not here (Python cannot see TS source as runtime behavior).
  - Handler expectations for /exec-shaped endpoints are read from THIS file's
    declared shapes plus, where meaningful, live source parsing of
    toe/src/TouchDesignerAPI.py (routing shadow test).
  - Response shapes are asserted for the endpoints whose handlers run against
    the offline fakes (behavioral); the rest are declared-only.
"""

from __future__ import annotations

import json
import os
import re
import sys
import unittest
from unittest.mock import patch

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

BRIDGE_SRC = os.path.join(REPO_ROOT, "toe", "src", "TouchDesignerAPI.py")
STDIO_SRC = os.path.join(REPO_ROOT, "mcp_server_stdio.py")
CONTRACT_PATH = os.path.join(REPO_ROOT, "tests", "bridge_contract.json")

with open(CONTRACT_PATH, "r", encoding="utf-8") as f:
    CONTRACT = json.load(f)

POSTS = CONTRACT["post_endpoints"]
BRIDGE_ONLY = CONTRACT["bridge_only_post_endpoints"]

with open(BRIDGE_SRC, "r", encoding="utf-8") as f:
    BRIDGE_SOURCE = f.read()

with open(STDIO_SRC, "r", encoding="utf-8") as f:
    STDIO_SOURCE = f.read()


def _handler_source(handler_name):
    """Extract a handler's source from the bridge, indented-body aware."""
    m = re.search(
        r"    def " + handler_name + r"\(self.*?(?=\n    def |\Z)",
        BRIDGE_SOURCE,
        re.DOTALL,
    )
    return m.group(0) if m else ""


def _handler_reads(handler_src, snippet):
    """True if the handler source contains the declared read expression."""
    return snippet.replace('\\"', '"') in handler_src


def _uri_check_re(uri):
    """Regex matching how OnHTTPRequest tests a URI (both styles used in the
    dispatcher): uri.startswith("<uri>") and uri == "<uri>"."""
    esc = re.escape(uri)
    return r'(?:uri\.startswith\("' + esc + r'"\)|uri\s*==\s*"' + esc + r'")'


# ---------------------------------------------------------------------------
# 1. Every contract POST has a real handler in the bridge
# ---------------------------------------------------------------------------


class TestContractHandlersExist(unittest.TestCase):
    def test_every_contract_post_has_a_handler(self):
        for uri, spec in POSTS.items():
            self.assertTrue(
                _handler_source(spec["handler"]),
                f"Contract declares {uri} -> {spec['handler']} but that handler "
                f"is missing from toe/src/TouchDesignerAPI.py",
            )

    def test_every_contract_post_is_routed(self):
        # The handler is routed if the dispatcher dispatches to it within a
        # few lines of the URI check for that endpoint.
        for uri, spec in POSTS.items():
            if uri == "/execute_async":
                continue  # has its own dedicated shadow test
            check = re.search(_uri_check_re(uri), BRIDGE_SOURCE)
            self.assertIsNotNone(
                check,
                f"{uri} is in the contract but OnHTTPRequest never checks for it",
            )
            window = BRIDGE_SOURCE[check.end() : check.end() + 300]
            self.assertIn(
                f"self.{spec['handler']}(",
                window,
                f"{uri} is checked in OnHTTPRequest but never dispatched to "
                f"{spec['handler']}",
            )


# ---------------------------------------------------------------------------
# 2. Routing shadow test (the /execute vs /execute_async lesson)
# ---------------------------------------------------------------------------


class TestRoutingShadows(unittest.TestCase):
    def test_execute_async_dispatched_before_execute(self):
        """startswith('/execute') also matches '/execute_async': if the
        /execute route is checked first, the async endpoint is shadowed and
        its JSON body is executed as raw Python code. This is a real drift
        found on 2026-09-22 (executeAsync's code field was never parsed)."""
        pos_exec = BRIDGE_SOURCE.index('uri.startswith("/execute")')
        pos_async = BRIDGE_SOURCE.index('uri.startswith("/execute_async")')
        self.assertLess(
            pos_async,
            pos_exec,
            "ROUTING SHADOW: '/execute_async' must be dispatched BEFORE "
            "'/execute' in OnHTTPRequest - startswith('/execute') matches "
            "'/execute_async' too, so the async POST falls into the raw-code "
            "handler and the client's {code, fromOp} JSON is never parsed",
        )

    def test_contract_endpoints_not_shadowed_by_earlier_prefix(self):
        """No contract endpoint may be shadowed by an earlier startswith()
        route with a URI that is a prefix of it."""
        routes = re.findall(
            r'uri\s*(?:\.startswith|==)\s*\(?\s*"([^"]+)"', BRIDGE_SOURCE
        )
        # Route lines, to respect method guards: a GET-only route can never
        # shadow a POST endpoint (e.g. GET /parameters vs POST /parameters/set).
        route_lines = {}
        for m in re.finditer(
            r'^.*uri\s*(?:\.startswith|==)\s*\(?\s*"([^"]+)".*$',
            BRIDGE_SOURCE,
            re.MULTILINE,
        ):
            route_lines.setdefault(m.group(1), m.group(0))
        for uri in POSTS:
            for route in routes:
                if route == uri or not uri.startswith(route):
                    continue
                line = route_lines.get(route, "")
                if 'method == "GET"' in line:
                    continue  # GET-only route cannot shadow a POST endpoint
                route_pos = BRIDGE_SOURCE.find(line)
                uri_pos = re.search(_uri_check_re(uri), BRIDGE_SOURCE).start()
                self.assertLess(
                    uri_pos,
                    route_pos,
                    f"ROUTING SHADOW: route '{route}' (checked first) is a "
                    f"prefix of contract endpoint '{uri}'",
                )


# ---------------------------------------------------------------------------
# 3. stdio Python client: what it sends vs what the contract declares
# ---------------------------------------------------------------------------


class TestStdioClientSendsContractShapes(unittest.TestCase):
    """Verify the stdio client's actual _http_post calls by patching it —
    the real client code runs, only the socket is intercepted."""

    def _capture_posts(self, tool_name, arguments):
        import mcp_server_stdio

        captured = []
        real_post = mcp_server_stdio._http_post

        def spy(path, body):
            captured.append((path, body))
            # Return a benign response so the client code completes.
            if path == "/exec":
                return {"output": "(ok)"}
            if path == "/parameters/set":
                return {
                    "path": arguments.get("path", "/"),
                    "updated": [],
                    "invalid": [],
                    "applied_with_missing_param": [],
                    "transactional": True,
                }
            return {}

        mcp_server_stdio._http_post = spy
        try:
            mcp_server_stdio._call_tool(tool_name, arguments)
        finally:
            mcp_server_stdio._http_post = real_post
        return captured

    def test_set_td_parameters_sends_updates_array(self):
        """THE drift that motivated this suite: the client must send the
        canonical {path, updates:[{name,value}]} shape."""
        posts = self._capture_posts(
            "set_td_parameters",
            {"path": "/project1/noise1", "params": {"amp": 0.5}},
        )
        self.assertEqual(len(posts), 1, "set_td_parameters must issue exactly one POST")
        uri, body = posts[0]
        self.assertEqual(uri, "/parameters/set")

        spec = POSTS["/parameters/set"]["request"]
        # Required fields present
        for field in spec["required"]:
            self.assertIn(field, body, f"client POST {uri} missing required field '{field}'")
        # Unknown fields are drift (name the field and the sides)
        for field in body:
            self.assertIn(
                field,
                spec["allowed"],
                f"CONTRACT DRIFT on {uri}: stdio client sends unknown field "
                f"'{field}' (bridge handler reads: {spec['fields']})",
            )
        # updates items must follow the declared item schema
        upd = body["updates"]
        self.assertIsInstance(upd, list)
        self.assertEqual(len(upd), 1)
        for k in upd[0]:
            self.assertIn(
                k,
                spec["fields"]["updates"]["items"]["allowed"],
                f"CONTRACT DRIFT on {uri}: updates item field '{k}' is not in "
                f"the declared schema {spec['fields']['updates']['items']['allowed']}",
            )
        self.assertEqual(upd[0]["name"], "amp")
        self.assertEqual(upd[0]["value"], 0.5)

    def test_exec_based_tools_send_code_string(self):
        for tool in ("create_td_node", "delete_td_node", "connect_td_nodes", "execute_td_python"):
            for uri, body in self._capture_posts(
                tool, {"type": "td.nullPOP", "name": "n", "parent": "/project1", "path": "/project1/n", "src": "/a", "dst": "/b", "input": 0, "code": "pass"}
            ):
                self.assertEqual(uri, "/exec", f"{tool} posts to {uri}, contract says /exec")
                spec = POSTS["/exec"]["request"]
                self.assertIn("code", body, f"{tool} must send 'code' to /exec")
                self.assertIsInstance(body["code"], str)
                for field in body:
                    self.assertIn(
                        field,
                        spec["allowed"],
                        f"CONTRACT DRIFT on /exec from {tool}: unknown field '{field}'",
                    )

    def test_screenshot_tool_sends_allowed_fields_only(self):
        posts = self._capture_posts("capture_td_screenshot", {"path": "/project1/top1"})
        self.assertEqual(len(posts), 1)
        uri, body = posts[0]
        self.assertEqual(uri, "/screenshot")
        spec = POSTS["/screenshot"]["request"]
        for field in body:
            self.assertIn(
                field,
                spec["allowed"],
                f"CONTRACT DRIFT on {uri}: stdio client sends unknown field '{field}'",
            )


# ---------------------------------------------------------------------------
# 4. stdio client must not reference contract endpoints wrongly
# ---------------------------------------------------------------------------


class TestStdioInventory(unittest.TestCase):
    def test_every_stdio_post_targets_a_contracted_or_bridge_only_route(self):
        # Extract literal first-args of _http_post in the client.
        posts = re.findall(r'_http_post\(\s*"([^"]+)"', STDIO_SOURCE)
        self.assertTrue(posts, "could not parse _http_post calls from mcp_server_stdio.py")
        known = set(POSTS) | set(BRIDGE_ONLY)
        for uri in posts:
            base = uri.split("?")[0]
            self.assertIn(
                base,
                known,
                f"mcp_server_stdio.py posts to '{uri}' which is neither in the "
                f"contract (tests/bridge_contract.json post_endpoints) nor in "
                f"bridge_only_post_endpoints - declare it",
            )

    def test_contract_stdio_clients_exist_in_source(self):
        """If the contract says a stdio tool posts to an endpoint, the client
        source must contain that _http_post."""
        for uri, spec in POSTS.items():
            if not spec["clients"]["stdio"]:
                continue
            self.assertIn(
                '_http_post("%s"' % uri,
                STDIO_SOURCE,
                f"Contract says stdio client uses {uri} but mcp_server_stdio.py "
                f"no longer posts there - update the contract or the client",
            )


# ---------------------------------------------------------------------------
# 5. Behavioral: handler parses the contract shape (offline fakes)
# ---------------------------------------------------------------------------


class TestHandlerBehaviorAgainstContract(unittest.TestCase):
    """Run the REAL handlers against the REAL client bodies (no sockets) and
    assert the response contract — this is where the /parameters/set silent
    empty-success would have been caught."""

    @classmethod
    def setUpClass(cls):
        # Import the real bridge module with faked TD globals (same pattern as
        # tests/test_api_contract_offline.py).
        import tests.test_api_contract_offline as h

        h._reset_fakes()
        h._install_fake_globals()
        cls.harness = h
        cls.api = h.FakeAPI()

    def _post(self, handler_name, payload):
        req = {"data": json.dumps(payload)}
        resp = {
            "statusCode": 200,
            "statusReason": "OK",
            "data": "",
            "Content-Type": "application/json",
        }
        getattr(self.api, handler_name)(req, resp)
        return resp

    def test_parameters_set_params_dict_still_accepted(self):
        """The documented params{} shorthand must still apply (regression for
        the original silent drift)."""
        self.harness._fake_noise1 = self.harness._build_parameter_dir(
            {"type": ("simplex", ""), "amp": (0.5, "")}
        ) if hasattr(self.harness, "_build_parameter_dir") else self.harness._fake_noise1
        # Fall back to the harness' own helper used by its tests:
        if not hasattr(self.harness, "_build_parameter_dir"):
            self.skipTest("harness helper missing")
        resp = self._post(
            "_handle_parameters_set",
            {"path": "/project1/noise1", "params": {"type": "perlin"}},
        )
        self.assertEqual(resp["statusCode"], 200, msg=f"resp={resp}")
        data = json.loads(resp["data"])
        self.assertEqual(len(data["updated"]), 1)
        self.assertEqual(data["updated"][0]["name"], "type")

    def test_parameters_set_updates_array_canonical(self):
        """The canonical updates[] shape the stdio client sends must APPLY.
        This is the test that catches a handler regression to the historical
        drift state (handler that only read the documented-but-wrong shape
        and silently returned updated:[])."""
        resp = self._post(
            "_handle_parameters_set",
            {"path": "/project1/noise1", "updates": [{"name": "amp", "value": 0.9}]},
        )
        self.assertEqual(resp["statusCode"], 200, msg=f"resp={resp}")
        data = json.loads(resp["data"])
        self.assertEqual(len(data["updated"]), 1, msg=f"SILENT DRIFT: {data}")
        self.assertEqual(data["updated"][0]["name"], "amp")

    def test_parameters_set_empty_updates_is_explicit_400(self):
        resp = self._post("_handle_parameters_set", {"path": "/project1/noise1"})
        self.assertEqual(resp["statusCode"], 400, msg=f"resp={resp}")
        data = json.loads(resp["data"])
        self.assertIn("error", data)

    def test_parameters_set_unknown_field_is_not_silent(self):
        """A body with NEITHER updates nor params must 400 — never a silent
        empty success (the original drift's failure mode)."""
        resp = self._post("_handle_parameters_set", {"path": "/project1/noise1", "par": {"amp": 1}})
        self.assertEqual(resp["statusCode"], 400, msg=f"resp={resp}")

    def test_exec_response_shape(self):
        resp = self._post("_handle_exec", {"code": "print(1+1)"})
        self.assertEqual(resp["statusCode"], 200)
        data = json.loads(resp["data"])
        for key in POSTS["/exec"]["response"]["keys"]:
            self.assertIn(key, data, f"/exec response missing '{key}'")
        self.assertEqual(data["output"].strip(), "2")

    def test_execute_async_accepts_json_envelope(self):
        """The TS client posts {code, fromOp}; the handler must accept the
        envelope (ThreadManager None -> 501 is fine in offline fakes; what
        must NOT happen is treating the JSON as raw code)."""
        payload = json.dumps({"code": "print('x')", "fromOp": "/"})
        req = {"data": payload}
        resp = {
            "statusCode": 200,
            "statusReason": "OK",
            "data": "",
            "Content-Type": "application/json",
        }
        self.api._handle_execute_async(req, resp)
        # Offline: threadManager is None -> explicit 501, NOT a raw-code exec.
        self.assertEqual(resp["statusCode"], 501, msg=f"resp={resp}")

    def _fresh_api(self):
        h = self.harness
        h._reset_fakes()
        h._install_fake_globals()
        return h.FakeAPI()

    def test_undo_redo_empty_history_explicit_error(self):
        # Fresh instance: /parameters_set tests above record history, and an
        # undoable entry answering 200 would be CORRECT behavior there.
        api = self._fresh_api()
        resp = {
            "statusCode": 200,
            "statusReason": "OK",
            "data": "",
            "Content-Type": "application/json",
        }
        api._handle_undo({}, resp)
        self.assertEqual(resp["statusCode"], 400)
        data = json.loads(resp["data"])
        self.assertFalse(data["success"])
        self.assertIn("hint", data)
        resp2 = {
            "statusCode": 200,
            "statusReason": "OK",
            "data": "",
            "Content-Type": "application/json",
        }
        api._handle_redo({}, resp2)
        self.assertEqual(resp2["statusCode"], 400)
        data2 = json.loads(resp2["data"])
        self.assertFalse(data2["success"])
        self.assertIn("hint", data2)

    def test_history_shape(self):
        resp = {
            "statusCode": 200,
            "statusReason": "OK",
            "data": "",
            "Content-Type": "application/json",
        }
        self.api._handle_history(resp)
        self.assertEqual(resp["statusCode"], 200)
        data = json.loads(resp["data"])
        for key in ("maxDepth", "canUndo", "canRedo", "undo", "redo"):
            self.assertIn(key, data, f"/history response missing '{key}'")


if __name__ == "__main__":
    unittest.main(verbosity=2)
