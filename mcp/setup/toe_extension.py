"""TouchDesigner HTTP API Extension — Embedded .tox version.

Self-contained HTTP server extension for TouchDesigner that provides
a JSON API for executing Python code and querying editor state.

Drop this .tox into any TouchDesigner project and the API server
starts automatically on the configured port.

Supports both HTTP and WebSocket transports (JSON-RPC over WebSocket).
"""

import json
import sys
import traceback
import io
import urllib.parse
import contextlib


class TouchDesignerAPI:
    """TouchDesigner HTTP API Extension — embedded in .tox."""

    def __init__(self, owner_comp):
        self.owner = owner_comp
        self._cache = {}
        self._ws_clients = set()
        print(f"[TouchDesignerAPI] Inicializado en {owner_comp.path}")

    @property
    def port(self):
        """Obtiene el puerto del parámetro expuesto del Base COMP."""
        try:
            return int(self.owner.par.Port or 44444)
        except (AttributeError, ValueError, TypeError):
            return 44444

    @property
    def debug(self):
        """Obtiene el estado debug del parámetro expuesto."""
        try:
            return bool(self.owner.par.Debug)
        except (AttributeError, ValueError):
            return False

    def _debug_print(self, *args, **kwargs):
        if self.debug:
            print("[TDAPI]", *args, **kwargs)

    # =========================================================================
    # HTTP request handling
    # =========================================================================

    def handle_request(self, dat, request):
        """Maneja una petición HTTP entrante.

        Args:
            dat: El WebServer DAT que recibió la petición.
            request: Diccionario con la petición HTTP.

        Returns:
            Diccionario con respuesta HTTP.
        """
        method = request.get("method", "GET").upper()
        path = request.get("path", "/")
        body = request.get("body", "")
        headers = request.get("headers", {})

        self._debug_print(f">>> {method} {path}")

        try:
            # Rutas disponibles
            if path == "/info" or path == "/":
                return self._handle_info()
            elif path == "/exec" and method in ("POST", "PUT"):
                return self._handle_exec(body)
            elif path == "/execute_async" and method in ("POST", "PUT"):
                return self._handle_execute_async(body)
            elif path.startswith("/task_status"):
                return self._handle_task_status(path)
            elif path == "/health":
                return {"status": 200, "body": json.dumps({"status": "ok"})}
            elif path == "/editor/pane" and method == "GET":
                return self._handle_editor_pane()
            elif path == "/editor/selection" and method == "GET":
                return self._handle_editor_selection()
            elif path.startswith("/operators") and method == "GET":
                parsed = urllib.parse.urlparse(path)
                params = urllib.parse.parse_qs(parsed.query)
                op_path = urllib.parse.unquote(params.get("path", ["/"])[0])
                return self._handle_operators(op_path)
            elif path.startswith("/parameters/set") and method == "POST":
                return self._handle_parameters_set(body)
            elif path.startswith("/parameters") and method == "GET":
                parsed = urllib.parse.urlparse(path)
                params = urllib.parse.parse_qs(parsed.query)
                op_path = urllib.parse.unquote(params.get("path", ["/"])[0])
                names_raw = params.get("names", [""])[0]
                names = [n.strip() for n in names_raw.split(",") if n.strip()] if names_raw else []
                return self._handle_parameters_get(op_path, names)
            elif path.startswith("/connections") and method == "GET":
                parsed = urllib.parse.urlparse(path)
                params = urllib.parse.parse_qs(parsed.query)
                op_path = urllib.parse.unquote(params.get("path", ["/"])[0])
                recurse = params.get("recurse", ["0"])[0] in ("1", "true", "True")
                return self._handle_connections(op_path, recurse)
            elif path.startswith("/find") and method == "GET":
                parsed = urllib.parse.urlparse(path)
                params = urllib.parse.parse_qs(parsed.query)
                return self._handle_find(params)
            elif path.startswith("/healthcheck") and method == "GET":
                parsed = urllib.parse.urlparse(path)
                params = urllib.parse.parse_qs(parsed.query)
                op_path = urllib.parse.unquote(params.get("path", ["/"])[0])
                recurse = params.get("recurse", ["1"])[0] in ("1", "true", "True")
                return self._handle_healthcheck(op_path, recurse)
            else:
                return {
                    "status": 404,
                    "body": json.dumps({"error": f"Not found: {method} {path}"}),
                    "headers": {"Content-Type": "application/json"},
                }
        except Exception as e:
            if self.debug:
                traceback.print_exc()
            return {
                "status": 500,
                "body": json.dumps({"error": str(e)}),
                "headers": {"Content-Type": "application/json"},
            }

    # =========================================================================
    # HTTP handlers
    # =========================================================================

    def _handle_info(self):
        """Devuelve información del entorno TouchDesigner."""
        info = {
            "status": "ok",
            "name": "TouchDesigner MCP API",
            "version": "4.0.0",
            "port": self.port,
            "debug": self.debug,
            "websocket": True,
            "touchdesigner": {
                "build": self._get_td_build(),
                "project": str(op("/").path if op else "unknown"),
            },
        }
        return {
            "status": 200,
            "body": json.dumps(info, indent=2),
            "headers": {"Content-Type": "application/json"},
        }

    def _handle_exec(self, body):
        """Ejecuta código Python en TouchDesigner y devuelve resultado."""
        try:
            data = json.loads(body) if body else {}
        except json.JSONDecodeError:
            return {
                "status": 400,
                "body": json.dumps({"error": "Invalid JSON body"}),
                "headers": {"Content-Type": "application/json"},
            }

        code = data.get("code", "")
        from_op = data.get("fromOp", "/")

        if not code:
            return {
                "status": 400,
                "body": json.dumps({"error": "No code provided"}),
                "headers": {"Content-Type": "application/json"},
            }

        result = self._execute_python_robust(code)
        status = 200 if not result.get("error") else 500
        return {
            "status": status,
            "body": json.dumps(result),
            "headers": {"Content-Type": "application/json"},
        }

    def _execute_python_robust(self, code):
        """Execute code with eval support and robust capture (twozero pattern)."""
        code = code.strip()
        if not code:
            return {"output": "(ok)"}

        buf = io.StringIO()
        is_expr = False
        try:
            compile(code, "<mcp>", "eval")
            is_expr = True
        except SyntaxError:
            pass

        exec_code = code
        if is_expr:
            exec_code = f"__val = ({code})\nif __val is not None: print(__val)"

        try:
            with contextlib.redirect_stdout(buf), contextlib.redirect_stderr(buf):
                exec(compile(exec_code, "<mcp>", "exec"))
        except Exception:
            output = buf.getvalue()
            err = traceback.format_exc()
            return {"output": output, "error": err} if output else {"error": err}

        out = buf.getvalue() or "(ok)"
        return {"output": out}

    def _handle_execute_async(self, body):
        """Inicia ejecución asíncrona (mock, ejecuta síncrono y devuelve taskId)."""
        import uuid
        task_id = str(uuid.uuid4())
        result = self._handle_exec(body)
        self._cache[task_id] = {"status": "done", "result": result}
        return {
            "status": 200,
            "body": json.dumps({"taskId": task_id}),
            "headers": {"Content-Type": "application/json"},
        }

    def _handle_task_status(self, path):
        """Consulta estado de una tarea asíncrona."""
        parsed = urllib.parse.urlparse(path)
        params = urllib.parse.parse_qs(parsed.query)
        task_id = params.get("taskId", [None])[0]
        if not task_id:
            return {
                "status": 400,
                "body": json.dumps({"error": "Missing taskId"}),
                "headers": {"Content-Type": "application/json"},
            }
        task = self._cache.get(task_id)
        if not task:
            return {
                "status": 404,
                "body": json.dumps({"error": f"Task {task_id} not found"}),
                "headers": {"Content-Type": "application/json"},
            }
        return {
            "status": 200,
            "body": json.dumps(task),
            "headers": {"Content-Type": "application/json"},
        }

    def _handle_editor_pane(self):
        """GET /editor/pane — current pane state."""
        try:
            pane = ui.panes.current
            if pane is None or pane.owner is None:
                result = None
            else:
                result = {
                    "networkPath": pane.owner.path,
                    "x": pane.x,
                    "y": pane.y,
                    "zoom": pane.zoom,
                }
            return {
                "status": 200,
                "body": json.dumps(result),
                "headers": {"Content-Type": "application/json"},
            }
        except Exception as e:
            return {
                "status": 500,
                "body": json.dumps({"error": str(e)}),
                "headers": {"Content-Type": "application/json"},
            }

    def _handle_editor_selection(self):
        """GET /editor/selection — selected operators."""
        try:
            pane = ui.panes.current
            if pane is None or pane.owner is None:
                operators = []
            else:
                operators = [
                    {
                        "path": o.path,
                        "name": o.name,
                        "type": o.type,
                        "opType": o.OPType,
                        "family": o.family,
                    }
                    for o in pane.owner.children
                    if o.selected or o.current
                ]
            return {
                "status": 200,
                "body": json.dumps({"operators": operators}),
                "headers": {"Content-Type": "application/json"},
            }
        except Exception as e:
            return {
                "status": 500,
                "body": json.dumps({"error": str(e)}),
                "headers": {"Content-Type": "application/json"},
            }

    def _handle_operators(self, path):
        """GET /operators — list children at path."""
        try:
            target = op(path)
            if target is None:
                return {
                    "status": 404,
                    "body": json.dumps({"error": f"Operator not found: {path}"}),
                    "headers": {"Content-Type": "application/json"},
                }
            operators = [
                {"name": child.name, "type": child.type, "opType": child.OPType}
                for child in target.children
            ]
            return {
                "status": 200,
                "body": json.dumps({"path": path, "operators": operators}),
                "headers": {"Content-Type": "application/json"},
            }
        except Exception as e:
            return {
                "status": 500,
                "body": json.dumps({"error": str(e)}),
                "headers": {"Content-Type": "application/json"},
            }

    def _handle_parameters_get(self, path, names):
        """GET /parameters — read parameters."""
        try:
            target = op(path)
            if target is None:
                return {
                    "status": 404,
                    "body": json.dumps({"error": f"Operator not found: {path}"}),
                    "headers": {"Content-Type": "application/json"},
                }
            if names:
                pars_out = []
                for name in names:
                    if hasattr(target.par, name):
                        par = getattr(target.par, name)
                        pars_out.append(self._serialize_parameter(par))
            else:
                pars_out = [self._serialize_parameter(par) for par in target.pars()]
            return {
                "status": 200,
                "body": json.dumps({"path": target.path, "parameters": pars_out}, ensure_ascii=False),
                "headers": {"Content-Type": "application/json"},
            }
        except Exception as e:
            return {
                "status": 500,
                "body": json.dumps({"error": str(e)}),
                "headers": {"Content-Type": "application/json"},
            }

    def _handle_parameters_set(self, body):
        """POST /parameters/set — set parameters transactionally."""
        try:
            data = json.loads(body) if body else {}
            path = data.get("path", "/")
            updates = data.get("updates", [])
            target = op(path)
            if target is None:
                return {
                    "status": 404,
                    "body": json.dumps({"error": f"Operator not found: {path}"}),
                    "headers": {"Content-Type": "application/json"},
                }
            applied = []
            missing = []
            for upd in updates:
                name = upd.get("name")
                if not name or not hasattr(target.par, name):
                    missing.append(name)
                    continue
                par = getattr(target.par, name)
                if "expr" in upd and upd.get("expr") is not None:
                    par.expr = upd.get("expr")
                elif "value" in upd:
                    if str(getattr(par, "style", "")) == "Pulse" and upd.get("value"):
                        par.pulse()
                    else:
                        par.val = upd.get("value")
                applied.append(self._serialize_parameter(par))
            return {
                "status": 200,
                "body": json.dumps({"path": target.path, "updated": applied, "missing": missing}, ensure_ascii=False),
                "headers": {"Content-Type": "application/json"},
            }
        except Exception as e:
            return {
                "status": 500,
                "body": json.dumps({"error": str(e)}),
                "headers": {"Content-Type": "application/json"},
            }

    def _handle_connections(self, path, recurse):
        """GET /connections — connection graph."""
        try:
            target = op(path)
            if target is None:
                return {
                    "status": 404,
                    "body": json.dumps({"error": f"Operator not found: {path}"}),
                    "headers": {"Content-Type": "application/json"},
                }
            nodes = self._iter_descendants(target, include_self=recurse)
            result = [self._serialize_operator(node) for node in nodes]
            return {
                "status": 200,
                "body": json.dumps({"path": target.path, "recurse": recurse, "operators": result}, ensure_ascii=False),
                "headers": {"Content-Type": "application/json"},
            }
        except Exception as e:
            return {
                "status": 500,
                "body": json.dumps({"error": str(e)}),
                "headers": {"Content-Type": "application/json"},
            }

    def _handle_find(self, params):
        """GET /find — find operators by query."""
        try:
            base_path = urllib.parse.unquote(params.get("path", ["/"])[0])
            query = urllib.parse.unquote(params.get("query", [""])[0]).strip().lower()
            base = op(base_path)
            if base is None:
                return {
                    "status": 404,
                    "body": json.dumps({"error": f"Operator not found: {base_path}"}),
                    "headers": {"Content-Type": "application/json"},
                }
            nodes = self._iter_descendants(base, include_self=True)
            matches = []
            for node in nodes:
                hay = " ".join([
                    node.name, getattr(node, "label", ""), node.path,
                    node.type, node.OPType, getattr(node, "family", ""),
                ]).lower()
                if query and query not in hay:
                    continue
                matches.append({
                    "path": node.path, "name": node.name,
                    "type": node.type, "opType": node.OPType,
                })
                if len(matches) >= 50:
                    break
            return {
                "status": 200,
                "body": json.dumps({"results": matches}, ensure_ascii=False),
                "headers": {"Content-Type": "application/json"},
            }
        except Exception as e:
            return {
                "status": 500,
                "body": json.dumps({"error": str(e)}),
                "headers": {"Content-Type": "application/json"},
            }

    def _handle_healthcheck(self, path, recurse):
        """GET /healthcheck — validate cooks, warnings, errors."""
        try:
            target = op(path)
            if target is None:
                return {
                    "status": 404,
                    "body": json.dumps({"error": f"Operator not found: {path}"}),
                    "headers": {"Content-Type": "application/json"},
                }
            nodes = self._iter_descendants(target, include_self=True) if recurse else [target]
            items = []
            for node in nodes:
                try:
                    node.cook(force=True)
                except Exception:
                    pass
                try:
                    errors = node.errors(recurse=False)
                except Exception:
                    errors = ""
                try:
                    warnings = node.warnings(recurse=False)
                except Exception:
                    warnings = ""
                items.append({
                    "path": node.path,
                    "name": node.name,
                    "opType": node.OPType,
                    "errors": errors,
                    "warnings": warnings,
                    "hasIssues": bool(errors or warnings),
                })
            issues = [i for i in items if i["hasIssues"]]
            return {
                "status": 200,
                "body": json.dumps({
                    "path": target.path, "recurse": recurse,
                    "ok": len(issues) == 0, "issueCount": len(issues),
                    "operators": items,
                }, ensure_ascii=False),
                "headers": {"Content-Type": "application/json"},
            }
        except Exception as e:
            return {
                "status": 500,
                "body": json.dumps({"error": str(e)}),
                "headers": {"Content-Type": "application/json"},
            }

    # =========================================================================
    # Shared helpers
    # =========================================================================

    def _serialize_parameter(self, par):
        try:
            value = par.eval()
            if not isinstance(value, (int, float, str, bool, list, dict, tuple, type(None))):
                value = str(value)
        except Exception:
            try:
                value = par.val
            except Exception:
                value = None
        expr = None
        try:
            expr = par.expr if par.expr else None
        except Exception:
            pass
        return {
            "name": par.name,
            "label": getattr(par, "label", par.name),
            "style": getattr(par, "style", None),
            "value": value,
            "expr": expr,
            "default": getattr(par, "default", None),
            "isExpression": bool(expr),
            "isPulse": str(getattr(par, "style", "")) == "Pulse",
        }

    def _serialize_operator(self, target):
        inputs = []
        outputs = []
        try:
            for idx, item in enumerate(getattr(target, "inputs", [])):
                if item is not None:
                    inputs.append({"index": idx, "path": item.path, "name": item.name})
        except Exception:
            pass
        try:
            for item in getattr(target, "outputs", []):
                if item is not None:
                    outputs.append({"path": item.path, "name": item.name})
        except Exception:
            pass
        return {
            "path": target.path, "name": target.name,
            "type": target.type, "opType": target.OPType,
            "family": getattr(target, "family", None),
            "inputs": inputs, "outputs": outputs,
        }

    def _iter_descendants(self, target, include_self=True, max_depth=99):
        seen = set()
        result = []

        def walk(node, depth):
            if node is None or depth > max_depth:
                return
            node_path = getattr(node, "path", None)
            if not node_path or node_path in seen:
                return
            seen.add(node_path)
            result.append(node)
            try:
                children = list(node.children)
            except Exception:
                children = []
            for child in children:
                walk(child, depth + 1)

        if include_self:
            walk(target, 0)
        else:
            try:
                for child in list(target.children):
                    walk(child, 1)
            except Exception:
                pass
        return result

    def _get_td_build(self):
        """Obtiene el build number de TouchDesigner."""
        try:
            return str(tdu.Build)
        except Exception:
            return "unknown"

    # =========================================================================
    # WebSocket transport (JSON-RPC over WebSocket)
    # =========================================================================

    def OnWebSocketOpen(self, dat, client, uri):
        """Track new WebSocket client connections."""
        self._ws_clients.add(client)
        self._debug_print(f"WebSocket client connected: {client.id}")

    def OnWebSocketClose(self, dat, client):
        """Remove disconnected WebSocket clients."""
        self._ws_clients.discard(client)
        self._debug_print(f"WebSocket client disconnected: {client.id}")

    def OnWebSocketReceiveText(self, dat, client, data):
        """Handle incoming JSON-RPC messages over WebSocket.

        Protocol:
          Request:  {"id": 1, "method": "exec", "params": {"code": "...", "fromOp": "/"}}
          Response: {"id": 1, "result": {"output": "...", "error": null}}
          Error:    {"id": 1, "error": {"code": -1, "message": "..."}}
        """
        try:
            msg = json.loads(data)
        except Exception:
            self._ws_respond(dat, client, None, error={"code": -32700, "message": "Parse error"})
            return

        msg_id = msg.get("id")
        method = msg.get("method", "")
        params = msg.get("params", {})

        self._debug_print(f"WS << id={msg_id} method={method}")

        try:
            result = self._ws_dispatch(method, params)
            self._ws_respond(dat, client, msg_id, result=result)
        except Exception as e:
            self._debug_print(f"WS error: {e}")
            self._ws_respond(dat, client, msg_id, error={"code": -1, "message": str(e)})

    def OnWebSocketReceiveBinary(self, dat, client, data):
        """Binary messages not supported."""
        self._ws_respond(dat, client, None, error={"code": -32600, "message": "Binary messages not supported"})

    def _ws_respond(self, dat, client, msg_id, result=None, error=None):
        """Send a JSON-RPC response to a WebSocket client."""
        resp = {"id": msg_id}
        if error is not None:
            resp["error"] = error
        else:
            resp["result"] = result
        try:
            dat.sendText(client, json.dumps(resp, ensure_ascii=False))
        except Exception as e:
            self._debug_print(f"WebSocket send error: {e}")

    def _ws_dispatch(self, method, params):
        """Route a JSON-RPC method to the corresponding HTTP handler logic.

        Maps WebSocket method names to the same internal handler methods
        used by handle_request, so there is zero code duplication.
        """
        # --- Editor ---
        if method == "editor/pane":
            return self._extract_body(self._handle_editor_pane())

        if method == "editor/selection":
            return self._extract_body(self._handle_editor_selection())

        # --- Info ---
        if method == "info":
            return self._extract_body(self._handle_info())

        # --- Operators ---
        if method == "operators":
            path = params.get("path", "/")
            return self._extract_body(self._handle_operators(path))

        # --- Parameters ---
        if method == "parameters":
            path = params.get("path", "/")
            names_raw = params.get("names", "")
            names = [n.strip() for n in names_raw.split(",") if n.strip()] if names_raw else []
            return self._extract_body(self._handle_parameters_get(path, names))

        if method == "parameters/set":
            return self._extract_body(self._handle_parameters_set(json.dumps(params)))

        # --- Connections ---
        if method == "connections":
            path = params.get("path", "/")
            recurse = params.get("recurse", False)
            return self._extract_body(self._handle_connections(path, bool(recurse)))

        # --- Find ---
        if method == "find":
            find_params = {}
            for k, v in params.items():
                find_params[k] = [str(v)]
            return self._extract_body(self._handle_find(find_params))

        # --- Healthcheck ---
        if method == "healthcheck":
            path = params.get("path", "/")
            recurse = params.get("recurse", True)
            return self._extract_body(self._handle_healthcheck(path, bool(recurse)))

        # --- Execute Python (twozero-compatible) ---
        if method == "exec":
            code = params.get("code", "")
            return self._execute_python_robust(code)

        # --- Unknown method ---
        raise ValueError(f"Unknown method: {method}")

    def _extract_body(self, http_response):
        """Extract JSON body from an HTTP response dict for WebSocket transport."""
        body = http_response.get("body", "{}")
        try:
            return json.loads(body)
        except Exception:
            return {"output": body}

    # =========================================================================
    # Server lifecycle
    # =========================================================================

    def OnServerStart(self, dat):
        self._debug_print("Server started")

    def OnServerStop(self, dat):
        self._debug_print("Server stopped")


# ── Inicialización de la extensión ──────────────────────────────────────

def onStart():
    """Llamado cuando TouchDesigner inicia."""
    pass

def onEnd():
    """Llamado cuando TouchDesigner cierra."""
    pass

def onHTTPRequest(dat, request):
    """Callback del WebServer DAT — enruta peticiones a la extensión."""
    me = op("..")
    if not me:
        return {"status": 500, "body": "Component not found"}

    # Inicializar o recuperar la instancia de la API
    api = me.store("api")
    if api is None:
        api = TouchDesignerAPI(me)
        me.store("api", api)

    return api.handle_request(dat, request)
