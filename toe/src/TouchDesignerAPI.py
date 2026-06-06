"""TouchDesigner HTTP API Extension.

Provides a simple HTTP API for executing Python code and querying editor state.
"""

import json
import sys
from io import StringIO
from urllib.parse import unquote
import uuid
import queue
import traceback
import time
import contextlib

import td_utils


class TouchDesignerAPI:
    """TouchDesigner HTTP API Extension."""

    def __init__(self, ownerComp):
        self.ownerComp = ownerComp
        
        # Phase 1 & 2: Asynchronous Foundations & Queue Manager
        try:
            self.threadManager = op.TDResources.ThreadManager
        except AttributeError:
            self.threadManager = None
            
        self.clientQueue = td_utils.ClientQueueManager()
        self.activeTasks = {}  # Store active tasks by ID

    def _debug_print(self, *args, **kwargs):
        if parent().par.Debug.eval():
            print("[TDAPI]", *args, **kwargs)

    def _send_response(self, response: dict) -> dict:
        """Log and return response."""
        self._debug_print(
            f"<<< {response.get('statusCode')} {response.get('data', '')[:200]}"
        )
        return response

    def OnHTTPRequest(self, dat, request: dict, response: dict) -> dict:
        """Handle incoming HTTP requests."""
        uri = request.get("uri", "")
        method = request.get("method", "")
        pars = request.get("pars", {})

        self._debug_print(f">>> {method} {uri}", pars if pars else "")

        response["Content-Type"] = "application/json"

        # POST /execute - Python code execution
        if uri.startswith("/execute") and method == "POST":
            return self._handle_execute(request, response)

        # POST /exec - Python code execution (twozero-compatible JSON API)
        if uri.startswith("/exec") and method == "POST":
            return self._handle_exec(request, response)

        # POST /execute_async - Asynchronous execution (Phase 1 & 2)
        if uri.startswith("/execute_async") and method == "POST":
            return self._handle_execute_async(request, response)

        # GET /task_status - Poll async task status (Phase 1 & 2)
        if uri.startswith("/task_status") and method == "GET":
            task_id = pars.get("taskId", "")
            return self._handle_task_status(task_id, response)

        # GET /editor/pane - Current pane state
        if uri == "/editor/pane" and method == "GET":
            return self._handle_editor_pane(response)

        # GET /editor/selection - Selected operators
        if uri == "/editor/selection" and method == "GET":
            return self._handle_editor_selection(response)

        # GET /info - Get TouchDesigner build info
        if uri == "/info" and method == "GET":
            return self._handle_info(response)

        # GET /operators - Operators at specified path
        if uri.startswith("/operators") and method == "GET":
            path = unquote(pars.get("path", "/"))
            return self._handle_operators(path, response)

        # GET /parameters - Parameters for operator
        if uri.startswith("/parameters") and method == "GET":
            path = unquote(pars.get("path", "/"))
            names_raw = pars.get("names", "")
            names = [n.strip() for n in names_raw.split(",") if n.strip()]
            return self._handle_parameters_get(path, names, response)

        # POST /parameters/set - Set parameters transactionally
        if uri.startswith("/parameters/set") and method == "POST":
            return self._handle_parameters_set(request, response)

        # GET /connections - Connection graph for operator or children
        if uri.startswith("/connections") and method == "GET":
            path = unquote(pars.get("path", "/"))
            recurse = pars.get("recurse", "0") in ("1", "true", "True")
            return self._handle_connections(path, recurse, response)

        # GET /find - Find operators by query/name/family/type
        if uri.startswith("/find") and method == "GET":
            return self._handle_find(request, response)

        # GET /healthcheck - Validate cooks, warnings, errors
        if uri.startswith("/healthcheck") and method == "GET":
            path = unquote(pars.get("path", "/"))
            recurse = pars.get("recurse", "1") in ("1", "true", "True")
            return self._handle_healthcheck(path, recurse, response)

        # 404 for other endpoints
        response["statusCode"] = 404
        response["statusReason"] = "Not Found"
        response["data"] = json.dumps({"error": "Not Found"})
        return self._send_response(response)

    # -------------------------------------------------------------------------
    # GET /info
    # -------------------------------------------------------------------------

    def _handle_info(self, response: dict) -> dict:
        """Handle GET /info request — return TD build info."""
        try:
            info = {
                "build": None,
                "version": None,
                "commercial": None,
                "platform": None,
                "release": None,
            }
            try:
                info["build"] = str(tdu.Build)  # type: ignore
            except:
                pass
            try:
                info["version"] = str(tduVersion)  # type: ignore
            except:
                pass
            try:
                info["commercial"] = tdu.Commercial  # type: ignore
            except:
                pass
            try:
                info["platform"] = str(tdu.Platform.PC64)  # type: ignore
            except:
                pass
            try:
                info["release"] = str(tdu.Release)  # type: ignore
            except:
                pass
            # Add project info
            try:
                info["projectPath"] = project.path if hasattr(project, 'path') else None  # type: ignore
                info["projectFPS"] = project.cookRate if hasattr(project, 'cookRate') else None  # type: ignore
            except:
                pass

            response["statusCode"] = 200
            response["statusReason"] = "OK"
            response["data"] = json.dumps(info, ensure_ascii=False)
        except Exception as e:
            response["statusCode"] = 500
            response["statusReason"] = "Internal Server Error"
            response["data"] = json.dumps({"error": str(e)})

        return self._send_response(response)

    # -------------------------------------------------------------------------
    # POST /execute
    # -------------------------------------------------------------------------

    def _handle_execute(self, request: dict, response: dict) -> dict:
        """Handle POST /execute request."""
        pars = request.get("pars", {})
        from_op = unquote(pars.get("from_op", "/"))
        code = request.get("data", "")

        result = self._execute_python(code, from_op)

        response["statusCode"] = 200
        response["statusReason"] = "OK"
        response["data"] = json.dumps(result, ensure_ascii=False)
        return self._send_response(response)

    # -------------------------------------------------------------------------
    # POST /exec (twozero-compatible JSON API)
    # -------------------------------------------------------------------------

    def _handle_exec(self, request: dict, response: dict) -> dict:
        """Handle POST /exec request — twozero-compatible JSON API."""
        try:
            data = request.get("data", "")
            if isinstance(data, bytes):
                data = data.decode("utf-8")
            msg = json.loads(data)
            code = msg.get("code", "")
        except Exception:
            response["statusCode"] = 400
            response["data"] = json.dumps({"error": "Bad request"})
            return self._send_response(response)

        result = self._execute_python_robust(code)

        response["statusCode"] = 200
        response["statusReason"] = "OK"
        response["data"] = json.dumps(result, ensure_ascii=False)
        return self._send_response(response)

    def _execute_python_robust(self, code: str) -> dict:
        """Execute code with eval support and robust capture (twozero pattern)."""
        code = code.strip()
        if not code:
            return {"output": "(ok)"}

        buf = StringIO()
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
        finally:
            try:
                del globals()["__val"]
            except:
                pass

        out = buf.getvalue() or "(ok)"
        return {"output": out}

    def _execute_python(self, code: str, from_op: str) -> dict:
        """Execute Python code and return result."""
        stdout_capture = StringIO()
        stderr_capture = StringIO()
        old_stdout, old_stderr = sys.stdout, sys.stderr

        # Resolve me
        try:
            me = op(from_op)  # type: ignore
            if me is None:
                return {
                    "success": False,
                    "stdout": "",
                    "stderr": "",
                    "from_op": from_op,
                    "error": {
                        "type": "OperatorNotFoundError",
                        "message": f"Operator not found: {from_op}",
                    },
                }
        except Exception as e:
            return {
                "success": False,
                "stdout": "",
                "stderr": "",
                "from_op": from_op,
                "error": {"type": type(e).__name__, "message": str(e)},
            }

        # Execute
        try:
            sys.stdout = stdout_capture
            sys.stderr = stderr_capture

            exec_globals = {"me": me}
            exec(code, exec_globals)

            return {
                "success": True,
                "stdout": stdout_capture.getvalue(),
                "stderr": stderr_capture.getvalue(),
                "from_op": me.path,
            }
        except Exception as e:
            return {
                "success": False,
                "stdout": stdout_capture.getvalue(),
                "stderr": stderr_capture.getvalue(),
                "from_op": from_op,
                "error": {"type": type(e).__name__, "message": str(e)},
            }
        finally:
            sys.stdout = old_stdout
            sys.stderr = old_stderr

    # -------------------------------------------------------------------------
    # POST /execute_async & GET /task_status (Phase 1, 2 & 3)
    # -------------------------------------------------------------------------

    def _handle_execute_async(self, request: dict, response: dict) -> dict:
        """Phase 1 & 2: Handle POST /execute_async request using ThreadManager."""
        pars = request.get("pars", {})
        code = request.get("data", "")
        
        if not self.threadManager:
            response["statusCode"] = 501
            response["statusReason"] = "Not Implemented"
            response["data"] = json.dumps({"error": "ThreadManager not available in this TD version."})
            return self._send_response(response)

        task_id = str(uuid.uuid4())
        info = {'taskId': task_id, 'code': code, 'pars': pars, 'status': 'queued', 'result': None, 'error': None}
        self.activeTasks[task_id] = info
        self.clientQueue.Reset()

        task = self.threadManager.TDTask(
            target=self._async_worker,
            SuccessHook=self._async_success,
            ExceptHook=self._async_except,
            RefreshHook=self._async_refresh,
            args=(self, info)
        )
        self.threadManager.EnqueueTask(task)

        response["statusCode"] = 202
        response["statusReason"] = "Accepted"
        response["data"] = json.dumps({"taskId": task_id, "status": "queued"})
        return self._send_response(response)

    @staticmethod
    def _async_worker(ext, data):
        """Worker thread function (Phase 1)."""
        ext.clientQueue.AddInRefreshQueue({'taskId': data['taskId'], 'message': 'Processing...', 'color': 'busy'})
        try:
            # Phase 3 integration: Use cached session
            # This is a simulated external request to demonstrate Phase 3.
            session = td_utils.HTTPClientCache.get_session()
            
            # Example simulated heavy work
            import time
            time.sleep(1) # Simulated delay
            
            # Simulate a successful execution (in real usage, you might call LLM here)
            result = f"Async execution completed for task {data['taskId']}"
            
            with ext.clientQueue.stateLock:
                ext.clientQueue.SetSuccessPayload({'data': data, 'result': result})

        except Exception as e:
            err = traceback.format_exc()
            data['error'] = str(err)
            ext.clientQueue.AddInRefreshQueue({'taskId': data['taskId'], 'message': 'Error', 'log': data})
            raise RuntimeError(err)

    def _async_refresh(self):
        """Phase 2: Update UI or internal state from queue."""
        while not self.clientQueue.refreshPayloadQueue.empty():
            try:
                msg = self.clientQueue.refreshPayloadQueue.get(block=False)
                task_id = msg.get('taskId')
                if task_id and task_id in self.activeTasks:
                    self.activeTasks[task_id]['status'] = msg.get('message', 'busy')
                    if 'log' in msg:
                        self.activeTasks[task_id]['error'] = msg['log'].get('error')
            except queue.Empty:
                break

    def _async_success(self):
        """Phase 2: Handle successful task completion."""
        payload = self.clientQueue.GetSuccessPayload()
        if payload:
            task_id = payload['data']['taskId']
            if task_id in self.activeTasks:
                self.activeTasks[task_id]['status'] = 'done'
                self.activeTasks[task_id]['result'] = payload['result']

    def _async_except(self, *args):
        """Phase 2: Handle task error."""
        # For simplicity, we just process refresh queue to get the error message
        self._async_refresh()

    def _handle_task_status(self, task_id: str, response: dict) -> dict:
        """Phase 2: Poll async task status."""
        self._async_refresh() # Force a refresh to process any pending queue items
        
        if task_id not in self.activeTasks:
            response["statusCode"] = 404
            response["statusReason"] = "Not Found"
            response["data"] = json.dumps({"error": "Task not found."})
            return self._send_response(response)

        task_info = self.activeTasks[task_id]
        response["statusCode"] = 200
        response["statusReason"] = "OK"
        response["data"] = json.dumps(task_info)
        return self._send_response(response)

    # -------------------------------------------------------------------------
    # GET /editor/pane
    # -------------------------------------------------------------------------

    def _handle_editor_pane(self, response: dict) -> dict:
        """Handle GET /editor/pane request."""
        try:
            pane = ui.panes.current  # type: ignore
            if (
                pane is None
                or pane.type != PaneType.NETWORKEDITOR  # type: ignore
                or pane.owner is None
            ):
                result = None
            else:
                result = {
                    "networkPath": pane.owner.path,
                    "x": pane.x,
                    "y": pane.y,
                    "zoom": pane.zoom,
                }
        except Exception as e:
            response["statusCode"] = 500
            response["statusReason"] = "Internal Server Error"
            response["data"] = json.dumps({"error": str(e)})
            return self._send_response(response)

        response["statusCode"] = 200
        response["statusReason"] = "OK"
        response["data"] = json.dumps(result)
        return self._send_response(response)

    # -------------------------------------------------------------------------
    # GET /editor/selection
    # -------------------------------------------------------------------------

    def _handle_editor_selection(self, response: dict) -> dict:
        """Handle GET /editor/selection request."""
        try:
            pane = ui.panes.current  # type: ignore
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
        except Exception as e:
            response["statusCode"] = 500
            response["statusReason"] = "Internal Server Error"
            response["data"] = json.dumps({"error": str(e)})
            return self._send_response(response)

        response["statusCode"] = 200
        response["statusReason"] = "OK"
        response["data"] = json.dumps({"operators": operators})
        return self._send_response(response)

    # -------------------------------------------------------------------------
    # GET /operators
    # -------------------------------------------------------------------------

    def _handle_operators(self, path: str, response: dict) -> dict:
        """Handle GET /operators request."""
        try:
            target = op(path)  # type: ignore
            if target is None:
                response["statusCode"] = 404
                response["statusReason"] = "Not Found"
                response["data"] = json.dumps({"error": f"Operator not found: {path}"})
                return self._send_response(response)

            operators = [
                {"name": child.name, "type": child.type, "opType": child.OPType}
                for child in target.children
            ]

            response["statusCode"] = 200
            response["statusReason"] = "OK"
            response["data"] = json.dumps({"path": path, "operators": operators})
        except Exception as e:
            response["statusCode"] = 500
            response["statusReason"] = "Internal Server Error"
            response["data"] = json.dumps({"error": str(e)})

        return self._send_response(response)

    # -------------------------------------------------------------------------
    # Shared helpers
    # -------------------------------------------------------------------------

    def _iter_descendants(self, target, include_self: bool = True, max_depth: int = 99) -> list:
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

    def _parse_positive_int(self, raw_value, default: int, minimum: int = 1, maximum: int | None = None) -> int:
        try:
            value = int(raw_value)
        except Exception:
            raise ValueError(f"Expected integer value, got: {raw_value!r}")

        if value < minimum:
            raise ValueError(f"Expected integer >= {minimum}, got: {value}")
        if maximum is not None and value > maximum:
            return maximum
        return value

    # -------------------------------------------------------------------------
    # GET /parameters
    # -------------------------------------------------------------------------

    def _serialize_parameter(self, par) -> dict:
        mode = None
        try:
            mode = str(par.mode)
        except Exception:
            pass

        try:
            value = par.eval()
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

        menu_labels = []
        menu_names = []
        try:
            menu_labels = list(par.menuLabels) if hasattr(par, "menuLabels") else []
            menu_names = list(par.menuNames) if hasattr(par, "menuNames") else []
        except Exception:
            pass

        return {
            "name": par.name,
            "label": getattr(par, "label", par.name),
            "style": getattr(par, "style", None),
            "mode": mode,
            "value": value,
            "expr": expr,
            "default": getattr(par, "default", None),
            "isExpression": bool(expr),
            "isPulse": str(getattr(par, "style", "")) == "Pulse",
            "menuNames": menu_names,
            "menuLabels": menu_labels,
        }

    def _handle_parameters_get(self, path: str, names: list[str], response: dict) -> dict:
        try:
            target = op(path)  # type: ignore
            if target is None:
                response["statusCode"] = 404
                response["statusReason"] = "Not Found"
                response["data"] = json.dumps({"error": f"Operator not found: {path}"})
                return self._send_response(response)

            all_pars = list(target.pars())
            if names:
                pars_out = [self._serialize_parameter(getattr(target.par, name)) for name in names if hasattr(target.par, name)]
                missing = [name for name in names if not hasattr(target.par, name)]
            else:
                pars_out = [self._serialize_parameter(par) for par in all_pars]
                missing = []

            response["statusCode"] = 200
            response["statusReason"] = "OK"
            response["data"] = json.dumps(
                {"path": target.path, "operator": target.name, "parameters": pars_out, "missing": missing},
                ensure_ascii=False,
            )
        except Exception as e:
            response["statusCode"] = 500
            response["statusReason"] = "Internal Server Error"
            response["data"] = json.dumps({"error": str(e)})

        return self._send_response(response)

    # -------------------------------------------------------------------------
    # POST /parameters/set
    # -------------------------------------------------------------------------

    def _capture_parameter_state(self, par) -> dict:
        state = {"modeName": None, "expr": None, "value": None, "hasValue": False}
        try:
            mode = par.mode
            state["modeName"] = getattr(mode, "name", None)
            if not state["modeName"]:
                mode_text = str(mode)
                if "." in mode_text:
                    state["modeName"] = mode_text.split(".")[-1]
        except Exception:
            pass
        try:
            state["expr"] = par.expr if par.expr else None
        except Exception:
            pass
        try:
            state["value"] = par.eval()
            state["hasValue"] = True
        except Exception:
            try:
                state["value"] = par.val
                state["hasValue"] = True
            except Exception:
                state["value"] = None
        return state

    def _restore_parameter_state(self, par, state: dict) -> None:
        mode_name = state.get("modeName")
        if mode_name:
            try:
                par.mode = getattr(ParMode, mode_name)  # type: ignore # noqa: F821
            except Exception:
                pass

        expr = state.get("expr")
        if expr:
            par.expr = expr
            return

        try:
            par.expr = ""
        except Exception:
            pass

        if state.get("hasValue"):
            par.val = state.get("value")

    def _handle_parameters_set(self, request: dict, response: dict) -> dict:
        backups = {}
        target = None
        try:
            payload = json.loads(request.get("data", "") or "{}")
            path = payload.get("path", "/")
            updates = payload.get("updates", [])
            transactional = bool(payload.get("transactional", True))

            target = op(path)  # type: ignore
            if target is None:
                response["statusCode"] = 404
                response["statusReason"] = "Not Found"
                response["data"] = json.dumps({"error": f"Operator not found: {path}"})
                return self._send_response(response)

            backups = {}
            applied = []
            missing = []

            for upd in updates:
                name = upd.get("name")
                if not name or not hasattr(target.par, name):
                    missing.append(name)
                    if transactional:
                        raise ValueError(f"Parameter not found: {name}")
                    continue

                par = getattr(target.par, name)
                backups[name] = self._capture_parameter_state(par)

                if "expr" in upd and upd.get("expr") is not None:
                    par.expr = upd.get("expr")
                elif "value" in upd:
                    if str(getattr(par, "style", "")) == "Pulse" and upd.get("value"):
                        par.pulse()
                    else:
                        par.val = upd.get("value")

                applied.append(self._serialize_parameter(par))

            response["statusCode"] = 200
            response["statusReason"] = "OK"
            response["data"] = json.dumps(
                {
                    "path": target.path,
                    "updated": applied,
                    "missing": missing,
                    "transactional": transactional,
                },
                ensure_ascii=False,
            )
        except ValueError as e:
            try:
                for name, state in backups.items():
                    if hasattr(target.par, name):
                        self._restore_parameter_state(getattr(target.par, name), state)
            except Exception:
                pass
            response["statusCode"] = 400
            response["statusReason"] = "Bad Request"
            response["data"] = json.dumps({"error": str(e)})
        except Exception as e:
            try:
                for name, state in backups.items():
                    if hasattr(target.par, name):
                        self._restore_parameter_state(getattr(target.par, name), state)
            except Exception:
                pass
            response["statusCode"] = 500
            response["statusReason"] = "Internal Server Error"
            response["data"] = json.dumps({"error": str(e)})

        return self._send_response(response)

    # -------------------------------------------------------------------------
    # GET /connections
    # -------------------------------------------------------------------------

    def _serialize_operator(self, target) -> dict:
        inputs = []
        outputs = []
        try:
            for idx, item in enumerate(getattr(target, "inputs", [])):
                if item is not None:
                    inputs.append({"index": idx, "path": item.path, "name": item.name, "opType": item.OPType})
        except Exception:
            pass
        try:
            for item in getattr(target, "outputs", []):
                if item is not None:
                    outputs.append({"path": item.path, "name": item.name, "opType": item.OPType})
        except Exception:
            pass
        return {
            "path": target.path,
            "name": target.name,
            "type": target.type,
            "opType": target.OPType,
            "family": getattr(target, "family", None),
            "inputs": inputs,
            "outputs": outputs,
        }

    def _handle_connections(self, path: str, recurse: bool, response: dict) -> dict:
        try:
            target = op(path)  # type: ignore
            if target is None:
                response["statusCode"] = 404
                response["statusReason"] = "Not Found"
                response["data"] = json.dumps({"error": f"Operator not found: {path}"})
                return self._send_response(response)

            if recurse:
                nodes = self._iter_descendants(target, include_self=True)
            else:
                nodes = self._iter_descendants(target, include_self=False)
                nodes.insert(0, target)

            result = [self._serialize_operator(node) for node in nodes]

            response["statusCode"] = 200
            response["statusReason"] = "OK"
            response["data"] = json.dumps({"path": target.path, "recurse": recurse, "operators": result}, ensure_ascii=False)
        except Exception as e:
            response["statusCode"] = 500
            response["statusReason"] = "Internal Server Error"
            response["data"] = json.dumps({"error": str(e)})

        return self._send_response(response)

    # -------------------------------------------------------------------------
    # GET /find
    # -------------------------------------------------------------------------

    def _handle_find(self, request: dict, response: dict) -> dict:
        try:
            pars = request.get("pars", {})
            base_path = unquote(pars.get("path", "/"))
            query = unquote(pars.get("query", "")).strip().lower()
            name = unquote(pars.get("name", "")).strip().lower()
            family = unquote(pars.get("family", "")).strip().upper()
            op_type = unquote(pars.get("opType", "")).strip().lower()
            recursive = pars.get("recursive", "1") in ("1", "true", "True")
            limit = self._parse_positive_int(pars.get("limit", "50"), default=50, maximum=200)

            base = op(base_path)  # type: ignore
            if base is None:
                response["statusCode"] = 404
                response["statusReason"] = "Not Found"
                response["data"] = json.dumps({"error": f"Operator not found: {base_path}"})
                return self._send_response(response)

            nodes = self._iter_descendants(base, include_self=True) if recursive else [base] + self._iter_descendants(base, include_self=False)

            matches = []
            for node in nodes:
                hay = " ".join([
                    node.name,
                    getattr(node, "label", ""),
                    node.path,
                    node.type,
                    node.OPType,
                    getattr(node, "family", ""),
                ]).lower()
                if query and query not in hay:
                    continue
                if name and name not in node.name.lower():
                    continue
                if family and str(getattr(node, "family", "")).upper() != family:
                    continue
                if op_type and op_type not in {node.OPType.lower(), node.type.lower()}:
                    continue
                matches.append({
                    "path": node.path,
                    "name": node.name,
                    "type": node.type,
                    "opType": node.OPType,
                    "family": getattr(node, "family", None),
                })
                if len(matches) >= limit:
                    break

            response["statusCode"] = 200
            response["statusReason"] = "OK"
            response["data"] = json.dumps(
                {
                    "path": base.path,
                    "query": query,
                    "name": name,
                    "family": family or None,
                    "opType": op_type or None,
                    "recursive": recursive,
                    "results": matches,
                },
                ensure_ascii=False,
            )
        except ValueError as e:
            response["statusCode"] = 400
            response["statusReason"] = "Bad Request"
            response["data"] = json.dumps({"error": str(e)})
        except Exception as e:
            response["statusCode"] = 500
            response["statusReason"] = "Internal Server Error"
            response["data"] = json.dumps({"error": str(e)})

        return self._send_response(response)

    # -------------------------------------------------------------------------
    # GET /healthcheck
    # -------------------------------------------------------------------------

    def _collect_health(self, node) -> dict:
        errors = ""
        warnings = ""
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
        cook_time = None
        for attr in ("cookTime", "cpuCookTime"):
            try:
                cook_time = getattr(node, attr)
                if cook_time is not None:
                    break
            except Exception:
                pass
        return {
            "path": node.path,
            "name": node.name,
            "opType": node.OPType,
            "family": getattr(node, "family", None),
            "errors": errors,
            "warnings": warnings,
            "hasIssues": bool(errors or warnings),
            "cookTime": cook_time,
        }

    def _handle_healthcheck(self, path: str, recurse: bool, response: dict) -> dict:
        try:
            target = op(path)  # type: ignore
            if target is None:
                response["statusCode"] = 404
                response["statusReason"] = "Not Found"
                response["data"] = json.dumps({"error": f"Operator not found: {path}"})
                return self._send_response(response)

            if recurse:
                nodes = self._iter_descendants(target, include_self=True)
            else:
                nodes = [target]

            items = [self._collect_health(node) for node in nodes]
            issues = [item for item in items if item["hasIssues"]]

            response["statusCode"] = 200
            response["statusReason"] = "OK"
            response["data"] = json.dumps(
                {
                    "path": target.path,
                    "recurse": recurse,
                    "ok": len(issues) == 0,
                    "issueCount": len(issues),
                    "issues": issues,
                    "operators": items,
                },
                ensure_ascii=False,
            )
        except Exception as e:
            response["statusCode"] = 500
            response["statusReason"] = "Internal Server Error"
            response["data"] = json.dumps({"error": str(e)})

        return self._send_response(response)

    # -------------------------------------------------------------------------
    # WebSocket callbacks (empty - required by TD)
    # -------------------------------------------------------------------------

    def OnWebSocketOpen(self, dat, client, uri):
        pass

    def OnWebSocketClose(self, dat, client):
        pass

    def OnWebSocketReceiveText(self, dat, client, data):
        pass

    def OnWebSocketReceiveBinary(self, dat, client, data):
        pass

    def OnServerStart(self, dat):
        print("Server started")

    def OnServerStop(self, dat):
        print("Server stopped")


# Bind utility methods from td_utils to TouchDesignerAPI class
for _name in td_utils.__all__:
    setattr(TouchDesignerAPI, _name, getattr(td_utils, _name))
