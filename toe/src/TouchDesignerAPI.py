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

        # GET /verify - Verify network: errors, connections, cook times
        if uri == "/verify" and method == "GET":
            path = unquote(pars.get("path", "/project1"))
            return self._handle_verify(path, response)

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

        # ── NEW ENDPOINTS ─────────────────────────────────────────────────────

        # GET /get_errors - Errors and warnings (alias for healthcheck but always recursive)
        if uri.startswith("/get_errors") and method == "GET":
            path = unquote(pars.get("path", "/"))
            recurse = pars.get("recurse", "1") in ("1", "true", "True")
            return self._handle_get_errors(path, recurse, response)

        # GET /get_node_detail - Detailed operator info
        if uri.startswith("/get_node_detail") and method == "GET":
            path = unquote(pars.get("path", "/"))
            recurse = pars.get("recurse", "0") in ("1", "true", "True")
            return self._handle_get_node_detail(path, recurse, response)

        # GET /get_perf - Performance data
        if uri.startswith("/get_perf") and method == "GET":
            path = unquote(pars.get("path", "/"))
            top = pars.get("top", "20")
            return self._handle_get_perf(path, top, response)

        # GET /get_hints - Operator hints
        if uri.startswith("/get_hints") and method == "GET":
            node_type = pars.get("node_type", "")
            return self._handle_get_hints(node_type, response)

        # GET /get_focus - Current user focus
        if uri.startswith("/get_focus") and method == "GET":
            return self._handle_get_focus(response)

        # GET /get_build_compatibility - Check op type exists
        if uri.startswith("/build_compatibility") and method == "GET":
            op_type = pars.get("op_type", "")
            return self._handle_build_compatibility(op_type, response)

        # GET /release_delta - Build version changes
        if uri.startswith("/release_delta") and method == "GET":
            build_from = pars.get("build_from", "")
            build_to = pars.get("build_to", None)
            return self._handle_release_delta(build_from, build_to, response)

        # GET /spatial_context - Spatial context (*here/*this/*selected)
        if uri.startswith("/spatial_context") and method == "GET":
            return self._handle_spatial_context(response)

        # GET /pop_inspect - POP operator data
        if uri.startswith("/pop_inspect") and method == "GET":
            path = unquote(pars.get("path", ""))
            return self._handle_pop_inspect(path, response)

        # POST /create_operator - Create operator
        if uri.startswith("/create_operator") and method in ("GET", "POST"):
            return self._handle_create_operator(request, response)

        # POST /delete_operator - Delete operator
        if uri.startswith("/delete_operator") and method in ("GET", "POST"):
            path = unquote(pars.get("path", ""))
            return self._handle_delete_operator(path, response)

        # POST /connect_nodes - Connect operators
        if uri.startswith("/connect_nodes") and method in ("GET", "POST"):
            return self._handle_connect_nodes(request, response)

        # POST /disconnect - Disconnect input
        if uri.startswith("/disconnect") and method in ("GET", "POST"):
            path = unquote(pars.get("path", ""))
            input_index = int(pars.get("input_index", "0"))
            return self._handle_disconnect(path, input_index, response)

        # POST /copy_node - Copy operator
        if uri.startswith("/copy_node") and method in ("GET", "POST"):
            return self._handle_copy_node(request, response)

        # GET /screenshot - Screenshot operator
        if uri.startswith("/screenshot") and method == "GET":
            path = unquote(pars.get("path", ""))
            max_size = pars.get("max_size", None)
            return self._handle_screenshot(path, max_size, response)

        # GET /navigate_to - Navigate to operator
        if uri.startswith("/navigate_to") and method == "GET":
            path = unquote(pars.get("path", "/"))
            return self._handle_navigate_to(path, response)

        # GET /read_textport - Read textport
        if uri.startswith("/read_textport") and method == "GET":
            lines = pars.get("lines", "20")
            return self._handle_read_textport(lines, response)

        # GET /clear_textport - Clear textport
        if uri.startswith("/clear_textport") and method == "GET":
            return self._handle_clear_textport(response)

        # GET /search - Search inside TD
        if uri.startswith("/search") and method == "GET":
            return self._handle_search(request, response)

        # GET /reinit_extension - Reinit extension
        if uri.startswith("/reinit_extension") and method == "GET":
            path = unquote(pars.get("path", ""))
            return self._handle_reinit_extension(path, response)

        # GET /read_dat - Read DAT content
        if uri.startswith("/read_dat") and method == "GET":
            path = unquote(pars.get("path", ""))
            start_line = pars.get("start_line", None)
            end_line = pars.get("end_line", None)
            return self._handle_read_dat(path, start_line, end_line, response)

        # POST /write_dat - Write DAT content
        if uri.startswith("/write_dat") and method == "POST":
            return self._handle_write_dat(request, response)

        # GET /read_chop - Read CHOP data
        if uri.startswith("/read_chop") and method == "GET":
            path = unquote(pars.get("path", ""))
            channels = pars.get("channels", None)
            start = pars.get("start", None)
            end = pars.get("end", None)
            return self._handle_read_chop(path, channels, start, end, response)

        # POST /project_lifecycle - Save/load/undo/redo
        if uri.startswith("/project_lifecycle") and method in ("GET", "POST"):
            return self._handle_project_lifecycle(request, response)

        # GET /snapshot_scene - Snapshot state
        if uri.startswith("/snapshot_scene") and method == "GET":
            path = unquote(pars.get("path", "/"))
            return self._handle_snapshot_scene(path, response)

        # POST /memory_save - Save memory entry
        if uri.startswith("/memory_save") and method in ("GET", "POST"):
            return self._handle_memory_save(request, response)

        # GET /memory_recall - Recall memory entries
        if uri.startswith("/memory_recall") and method == "GET":
            query = pars.get("query", "")
            limit = pars.get("limit", "5")
            return self._handle_memory_recall(query, limit, response)

        # 404 for other endpoints
        response["statusCode"] = 404
        response["statusReason"] = "Not Found"
        response["data"] = json.dumps({"error": "Not Found"})
        return self._send_response(response)

    # -------------------------------------------------------------------------
    # GET /verify - Network verification
    # -------------------------------------------------------------------------

    def _handle_verify(self, path: str, response: dict) -> dict:
        """Verify network: check errors, connections, report summary."""
        try:
            target = op(path) if path and path != "/" else root
            all_ops = target.findChildren() if target else []
            errors = []
            for n in all_ops:
                try:
                    errs = n.errors()
                    if isinstance(errs, (list, tuple)) and len(errs) > 0:
                        errors.append({"path": n.path, "error": str(errs)})
                except:
                    pass
            connected = 0
            for n in all_ops:
                for inp in n.inputs:
                    if inp: connected += 1
            result = {
                "path": path,
                "operator_count": len(all_ops),
                "errors": errors,
                "error_count": len(errors),
                "total_connections": connected,
                "healthy": len(errors) == 0,
            }
            response["statusCode"] = 200
            response["statusReason"] = "OK"
            response["data"] = json.dumps(result, ensure_ascii=False)
            return self._send_response(response)
        except Exception as e:
            err = {"error": str(e), "traceback": traceback.format_exc()}
            response["statusCode"] = 500
            response["data"] = json.dumps(err, ensure_ascii=False)
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

    # =========================================================================
    # GET /get_errors
    # =========================================================================

    def _handle_get_errors(self, path: str, recurse: bool, response: dict) -> dict:
        """Return errors and warnings for operators."""
        return self._handle_healthcheck(path, recurse, response)

    # =========================================================================
    # GET /get_node_detail
    # =========================================================================

    def _handle_get_node_detail(self, path: str, recurse: bool, response: dict) -> dict:
        """Detailed operator info: parameters, inputs, children."""
        code = rf"""import json
t = op('{path}')
if t is None:
    print(json.dumps({{'success':False,'error':'Not found'}}))
else:
    def desc(n, d=0):
        if n is None or d>10: return None
        i = {{'path':n.path,'name':n.name,'type':n.OPType}}
        try:
            i['pars'] = [{{'name':p.name,'label':p.label,'val':p.val,'mode':str(p.mode),'expr':p.expr,'default':p.default,'style':p.style}} for p in n.pars()]
        except: pass
        try:
            i['inputs'] = [{{'index':idx,'op':c.op.name if c.op else None}} for idx,c in enumerate(n.inputConnectors)]
        except: pass
        try: i['viewer'] = n.viewer
        except: pass
        if {'True' if recurse else 'False'}:
            try: i['children'] = [desc(c,d+1) for c in n.children if c]
            except: pass
        return i
    print(json.dumps({{'success':True,'data':desc(t)}}))
"""
        result = self._execute_python_robust(code)
        response["statusCode"] = 200
        response["statusReason"] = "OK"
        response["data"] = json.dumps(result, ensure_ascii=False)
        return self._send_response(response)

    # =========================================================================
    # GET /get_perf
    # =========================================================================

    def _handle_get_perf(self, path: str, top: str, response: dict) -> dict:
        """Performance data: FPS, cook time, slowest operators."""
        code = rf"""import json
try:
    fps = project.cookRate if hasattr(project, 'cookRate') else 0
    gpu_mem = None
    try: gpu_mem = tdu.gpuMemoryUsed
    except: pass
    # Find slowest operators
    slow = []
    def walk(n, depth=0):
        if n is None or depth>20: return
        try:
            ct = n.cookTime
            if ct and ct > 1.0:
                slow.append({{'path':n.path,'name':n.name,'type':n.OPType,'cpu_ms':ct}})
        except: pass
        try:
            for c in n.children: walk(c, depth+1)
        except: pass
    walk(op('{path}'))
    slow.sort(key=lambda x: -x['cpu_ms'])
    print(json.dumps({{'success':True,'performance':{{'fps':fps,'gpuMemory':gpu_mem,'operators':slow[:int({top})]}}}}))
except Exception as e:
    print(json.dumps({{'success':False,'error':str(e)}}))
"""
        result = self._execute_python_robust(code)
        response["statusCode"] = 200
        response["statusReason"] = "OK"
        response["data"] = json.dumps(result, ensure_ascii=False)
        return self._send_response(response)

    # =========================================================================
    # GET /get_hints
    # =========================================================================

    def _handle_get_hints(self, node_type: str, response: dict) -> dict:
        """Get operator hints (delegates to knowledge base)."""
        result = {
            "success": True,
            "operatorType": node_type,
            "hint": f"Use get_param_help for parameter details on '{node_type}'."
        }
        response["statusCode"] = 200
        response["statusReason"] = "OK"
        response["data"] = json.dumps(result)
        return self._send_response(response)

    # =========================================================================
    # GET /get_focus
    # =========================================================================

    def _handle_get_focus(self, response: dict) -> dict:
        """Current user focus: active pane, selected, current operator."""
        try:
            pane = ui.panes.current
            info = {"activePane": None, "selected": [], "currentOperator": None}
            if pane:
                try:
                    info["activePane"] = {"path": pane.owner.path if pane.owner else None, "type": str(pane.type)}
                except:
                    pass
                try:
                    info["selected"] = [
                        {"path": o.path, "name": o.name, "type": o.OPType}
                        for o in pane.owner.children if o.selected or o.current
                    ]
                except:
                    pass
                try:
                    info["currentOperator"] = pane.current.path if pane.current else None
                except:
                    pass
            response["statusCode"] = 200
            response["statusReason"] = "OK"
            response["data"] = json.dumps(info)
        except Exception as e:
            response["statusCode"] = 500
            response["statusReason"] = "Internal Server Error"
            response["data"] = json.dumps({"error": str(e)})
        return self._send_response(response)

    # =========================================================================
    # GET /build_compatibility
    # =========================================================================

    def _handle_build_compatibility(self, op_type: str, response: dict) -> dict:
        """Check if operator type exists in current build."""
        code = rf"""import json
exists = False
try:
    t = op('/').create({op_type}, '_td_compat_test')
    t.destroy()
    exists = True
except:
    exists = False
print(json.dumps({{'success':True,'opType':'{op_type}','available':exists}}))
"""
        result = self._execute_python_robust(code)
        response["statusCode"] = 200
        response["statusReason"] = "OK"
        response["data"] = json.dumps(result, ensure_ascii=False)
        return self._send_response(response)

    # =========================================================================
    # GET /release_delta
    # =========================================================================

    def _handle_release_delta(self, build_from: str, build_to: str | None, response: dict) -> dict:
        """Return build version info."""
        try:
            current_build = str(tdu.Build) if hasattr(tdu, 'Build') else "unknown"
        except:
            current_build = "unknown"
        result = {
            "success": True,
            "buildFrom": build_from,
            "buildTo": build_to or current_build,
            "currentBuild": current_build,
            "note": "Release delta details require TD docs access."
        }
        response["statusCode"] = 200
        response["statusReason"] = "OK"
        response["data"] = json.dumps(result)
        return self._send_response(response)

    # =========================================================================
    # GET /spatial_context
    # =========================================================================

    def _handle_spatial_context(self, response: dict) -> dict:
        """Spatial context: *here, *this, *parent, *selected."""
        try:
            pane = ui.panes.current
            ctx = {"context": {"spatialMarkers": {"*here": "/", "*this": None, "*parent": None, "*selected": []}}}
            if pane and pane.owner:
                here_path = pane.owner.path
                ctx["context"]["spatialMarkers"]["*here"] = here_path
                try:
                    selected = [
                        {"path": o.path, "name": o.name, "type": o.OPType}
                        for o in pane.owner.children if o.selected or o.current
                    ]
                    ctx["context"]["spatialMarkers"]["*selected"] = [s["path"] for s in selected]
                    if selected:
                        ctx["context"]["spatialMarkers"]["*this"] = selected[0]["path"]
                except:
                    pass
                try:
                    ctx["context"]["spatialMarkers"]["*parent"] = op(here_path).parent().path if op(here_path) else None
                except:
                    pass
                try:
                    ctx["context"]["siblings"] = [{"path": c.path, "name": c.name, "type": c.OPType} for c in op(here_path).parent().children if c.path != here_path]
                except:
                    pass
            response["statusCode"] = 200
            response["statusReason"] = "OK"
            response["data"] = json.dumps(ctx)
        except Exception as e:
            response["statusCode"] = 500
            response["statusReason"] = "Internal Server Error"
            response["data"] = json.dumps({"error": str(e)})
        return self._send_response(response)

    # =========================================================================
    # GET /pop_inspect
    # =========================================================================

    def _handle_pop_inspect(self, path: str, response: dict) -> dict:
        """Read POP operator data: points, attributes."""
        code = rf"""import json
t = op('{path}')
if t is None:
    print(json.dumps({{'success':False,'error':'Not found'}}))
else:
    info = {{'path':t.path,'name':t.name,'type':t.OPType}}
    for attr in ['numPoints','numPrims','numVerts']:
        try: info[attr] = getattr(t, attr)
        except: pass
    try:
        attrs = []
        for a in t.attribs: attrs.append({{'name':a.name,'type':str(a.type),'size':a.size,'scope':str(a.scope)}})
        info['attributes'] = attrs
    except: pass
    print(json.dumps({{'success':True,'data':info}}))
"""
        result = self._execute_python_robust(code)
        response["statusCode"] = 200
        response["statusReason"] = "OK"
        response["data"] = json.dumps(result, ensure_ascii=False)
        return self._send_response(response)

    # =========================================================================
    # POST /create_operator
    # =========================================================================

    def _handle_create_operator(self, request: dict, response: dict) -> dict:
        """Create a new operator."""
        pars = request.get("pars", {})
        op_type = pars.get("type", "")
        name = pars.get("name", None)
        parent_path = pars.get("path", "/")
        pos_x = pars.get("position_x", None)
        pos_y = pars.get("position_y", None)

        safe_name = f"'{name}'" if name else "None"
        pos_x_code = str(pos_x) if pos_x is not None else "None"
        pos_y_code = str(pos_y) if pos_y is not None else "None"

        code = rf"""import json
try:
    t = op('{parent_path}')
    if t is None:
        print(json.dumps({{'success':False,'path':'{parent_path}','name':'','type':'','opType':'','error':'Parent not found'}}))
    else:
        n = t.create({op_type}, {safe_name})
        if {pos_x_code} is not None and {pos_y_code} is not None:
            n.nodeX = {pos_x_code}; n.nodeY = {pos_y_code}
        print(json.dumps({{'success':True,'path':n.path,'name':n.name,'type':n.type,'opType':n.OPType,'family':'','existing':False}}))
except Exception as e:
    print(json.dumps({{'success':False,'path':'','name':'','type':'','opType':'','error':str(e)}}))
"""
        result = self._execute_python_robust(code)
        response["statusCode"] = 200
        response["statusReason"] = "OK"
        response["data"] = json.dumps(result, ensure_ascii=False)
        return self._send_response(response)

    # =========================================================================
    # POST /delete_operator
    # =========================================================================

    def _handle_delete_operator(self, path: str, response: dict) -> dict:
        """Delete an operator."""
        code = rf"""import json
t = op('{path}')
if t is None:
    print(json.dumps({{'success':False,'path':'{path}','error':'Not found'}}))
else:
    t.destroy()
    print(json.dumps({{'success':True,'path':'{path}'}}))
"""
        result = self._execute_python_robust(code)
        response["statusCode"] = 200
        response["statusReason"] = "OK"
        response["data"] = json.dumps(result, ensure_ascii=False)
        return self._send_response(response)

    # =========================================================================
    # POST /connect_nodes
    # =========================================================================

    def _handle_connect_nodes(self, request: dict, response: dict) -> dict:
        """Connect two operators."""
        pars = request.get("pars", {})
        source = pars.get("source_path", "")
        target = pars.get("target_path", "")
        target_input = int(pars.get("target_input", "0"))

        code = rf"""import json
src = op('{source}'); tgt = op('{target}')
if src is None:
    print(json.dumps({{'success':False,'sourcePath':'{source}','targetPath':'{target}','sourceOutput':'output','targetInput':{target_input},'error':'Source not found'}}))
elif tgt is None:
    print(json.dumps({{'success':False,'sourcePath':'{source}','targetPath':'{target}','sourceOutput':'output','targetInput':{target_input},'error':'Target not found'}}))
else:
    tgt.inputConnectors[{target_input}].connect(src)
    print(json.dumps({{'success':True,'sourcePath':src.path,'targetPath':tgt.path,'sourceOutput':'output','targetInput':{target_input}}}))
"""
        result = self._execute_python_robust(code)
        response["statusCode"] = 200
        response["statusReason"] = "OK"
        response["data"] = json.dumps(result, ensure_ascii=False)
        return self._send_response(response)

    # =========================================================================
    # POST /disconnect
    # =========================================================================

    def _handle_disconnect(self, path: str, input_index: int, response: dict) -> dict:
        """Disconnect an input."""
        code = rf"""import json
t = op('{path}')
if t is None:
    print(json.dumps({{'success':False,'path':'{path}','error':'Not found'}}))
else:
    try:
        t.inputConnectors[{input_index}].disconnect()
        print(json.dumps({{'success':True,'path':'{path}','inputIndex':{input_index}}}))
    except Exception as e:
        print(json.dumps({{'success':False,'path':'{path}','error':str(e)}}))
"""
        result = self._execute_python_robust(code)
        response["statusCode"] = 200
        response["statusReason"] = "OK"
        response["data"] = json.dumps(result, ensure_ascii=False)
        return self._send_response(response)

    # =========================================================================
    # POST /copy_node
    # =========================================================================

    def _handle_copy_node(self, request: dict, response: dict) -> dict:
        """Copy (duplicate) an operator."""
        pars = request.get("pars", {})
        src_path = pars.get("path", "")
        dest_path = pars.get("destination", None)
        new_name = pars.get("name", None)

        dest_code = f"op('{dest_path}')" if dest_path else "t.parent()"
        name_code = f"'{new_name}'" if new_name else "None"

        code = rf"""import json
t = op('{src_path}')
if t is None:
    print(json.dumps({{'success':False,'path':'{src_path}','error':'Source not found'}}))
else:
    try:
        parent = {dest_code}
        new_op = parent.copy(t)
        if {name_code} is not None:
            new_op.name = {name_code}
        print(json.dumps({{'success':True,'sourcePath':t.path,'path':new_op.path,'name':new_op.name,'type':new_op.type}}))
    except Exception as e:
        print(json.dumps({{'success':False,'path':'{src_path}','error':str(e)}}))
"""
        result = self._execute_python_robust(code)
        response["statusCode"] = 200
        response["statusReason"] = "OK"
        response["data"] = json.dumps(result, ensure_ascii=False)
        return self._send_response(response)

    # =========================================================================
    # GET /screenshot
    # =========================================================================

    def _handle_screenshot(self, path: str, max_size: str | None, response: dict) -> dict:
        """Screenshot of an operator's output."""
        target = f"op('{path}')" if path else "me"
        resize_code = ""
        if max_size:
            try:
                ms = int(max_size)
                resize_code = rf"""
        try:
            from PIL import Image as PILImage, ImageFilter
            import io
            img_data = open(tf, 'rb').read()
            pil_img = PILImage.open(io.BytesIO(img_data))
            w, h = pil_img.size
            if w > {ms} or h > {ms}:
                if w >= h:
                    new_w = {ms}; new_h = int(h * {ms} / w)
                else:
                    new_h = {ms}; new_w = int(w * {ms} / h)
                pil_img = pil_img.resize((new_w, new_h), PILImage.LANCZOS)
                buf = io.BytesIO()
                pil_img.save(buf, format='PNG')
                b64 = base64.b64encode(buf.getvalue()).decode()
            else:
                b64 = base64.b64encode(img_data).decode()
        except ImportError:
            b64 = base64.b64encode(open(tf, 'rb').read()).decode()
"""
            except:
                pass

        if not resize_code:
            resize_code = """
        b64 = base64.b64encode(open(tf, 'rb').read()).decode()"""

        code = f"""import json,tempfile,base64,os
try:
    t = {target}
    if t is None: print(json.dumps({{'success':False,'path':'{path or "current"}','error':'Not found'}}))
    else:
        tf = tempfile.NamedTemporaryFile(suffix='.png',delete=False).name
        try:
            t.save(tf)
            {resize_code}
            print(json.dumps({{'success':True,'path':t.path,'image':b64}}))
        finally:
            try: os.unlink(tf)
            except: pass
except Exception as e:
    print(json.dumps({{'success':False,'path':'{path or "current"}','error':str(e)}}))
"""
        result = self._execute_python_robust(code)
        response["statusCode"] = 200
        response["statusReason"] = "OK"
        response["data"] = json.dumps(result, ensure_ascii=False)
        return self._send_response(response)

    # =========================================================================
    # GET /navigate_to
    # =========================================================================

    def _handle_navigate_to(self, path: str, response: dict) -> dict:
        """Navigate network editor to show an operator."""
        code = rf"""import json
try:
    pane = ui.panes.current
    t = op('{path}')
    if pane and t:
        pane.owner = t.parent()
        # Select the operator
        for child in pane.owner.children:
            if child.path == t.path:
                child.selected = True
                child.current = True
            else:
                child.selected = False
                child.current = False
        print(json.dumps({{'success':True,'navigatedTo':'{path}'}}))
    else:
        print(json.dumps({{'success':False,'error':'No pane or target'}}))
except Exception as e:
    print(json.dumps({{'success':False,'error':str(e)}}))
"""
        result = self._execute_python_robust(code)
        response["statusCode"] = 200
        response["statusReason"] = "OK"
        response["data"] = json.dumps(result, ensure_ascii=False)
        return self._send_response(response)

    # =========================================================================
    # GET /read_textport
    # =========================================================================

    def _handle_read_textport(self, lines: str, response: dict) -> dict:
        """Read last N lines from textport."""
        try:
            n = int(lines)
        except:
            n = 20
        try:
            tp = ui.textport if hasattr(ui, 'textport') else ''
            if not tp:
                # Try alternate: read from debug DAT or console
                try:
                    from io import StringIO
                    import sys
                    tp = StringIO()
                    old = sys.stdout
                    sys.stdout = tp
                    try:
                        debug.printTiming()  # no-op to trigger any output
                    except:
                        pass
                    sys.stdout = old
                    tp = tp.getvalue()
                except:
                    tp = "(textport not available via API)"
            lines_split = tp.split('\n') if tp else []
            recent = '\n'.join(lines_split[-n:])
            result = {"success": True, "content": recent, "totalLines": len(lines_split), "returned": n}
        except Exception as e:
            result = {"success": False, "error": str(e)}

        response["statusCode"] = 200
        response["statusReason"] = "OK"
        response["data"] = json.dumps(result, ensure_ascii=False)
        return self._send_response(response)

    # =========================================================================
    # GET /clear_textport
    # =========================================================================

    def _handle_clear_textport(self, response: dict) -> dict:
        """Clear the textport."""
        result = {"success": True, "note": "Console text clearing requires TD UI interaction"}
        response["statusCode"] = 200
        response["statusReason"] = "OK"
        response["data"] = json.dumps(result, ensure_ascii=False)
        return self._send_response(response)

    # =========================================================================
    # GET /search
    # =========================================================================

    def _handle_search(self, request: dict, response: dict) -> dict:
        """Search code/expressions/params in TD project."""
        pars = request.get("pars", {})
        query = pars.get("query", "").lower()
        root = pars.get("root", "/project1")
        scope = pars.get("scope", "all")
        case_sensitive = pars.get("case_sensitive", "false") in ("true", "True")
        max_results = int(pars.get("max_results", "50"))
        count_only = pars.get("count_only", "false") in ("true", "True")

        code = rf"""import json
q = '{query}'
root = op('{root}')
results = []
total = [0]
def walk(n, depth=0):
    if n is None or depth>30 or total[0]>=int({max_results}): return
    try:
        # Search parameter expressions and values
        if '{scope}' in ('all','expressions','parameters'):
            for p in n.pars():
                try:
                    if p.expr and q in p.expr.lower():
                        results.append({{'path':n.path,'param':p.name,'type':'expression','match':str(p.expr)[:100]}})
                        total[0]+=1
                except: pass
                if total[0]>=int({max_results}): return
        # Search DAT text content
        if '{scope}' in ('all','code'):
            if hasattr(n,'text') and n.text:
                for i,line in enumerate(n.text.split('\\n')):
                    if q in line.lower():
                        results.append({{'path':n.path,'type':'code','line':i+1,'match':str(line[:100])}})
                        total[0]+=1
                        if total[0]>=int({max_results}): return
    except: pass
    try:
        for c in n.children: walk(c, depth+1)
    except: pass
walk(root)
if bool({str(count_only).lower()}):
    print(json.dumps({{'success':True,'count':len(results),'results':[]}}))
else:
    print(json.dumps({{'success':True,'count':len(results),'results':results}}))
"""
        result = self._execute_python_robust(code)
        response["statusCode"] = 200
        response["statusReason"] = "OK"
        response["data"] = json.dumps(result, ensure_ascii=False)
        return self._send_response(response)

    # =========================================================================
    # GET /reinit_extension
    # =========================================================================

    def _handle_reinit_extension(self, path: str, response: dict) -> dict:
        """Reinitialize extension on a COMP."""
        code = rf"""import json
try:
    t = op('{path}')
    if t is None:
        print(json.dumps({{'success':False,'error':'Not found'}}))
    else:
        if hasattr(t, 'reinit'):
            t.reinit()
            print(json.dumps({{'success':True,'path':'{path}'}}))
        elif hasattr(t, 'cook'):
            t.cook(force=True)
            print(json.dumps({{'success':True,'path':'{path}','note':'Used force-cook instead of reinit'}}))
        else:
            print(json.dumps({{'success':False,'error':'No reinit method'}}))
except Exception as e:
    print(json.dumps({{'success':False,'error':str(e)}}))
"""
        result = self._execute_python_robust(code)
        response["statusCode"] = 200
        response["statusReason"] = "OK"
        response["data"] = json.dumps(result, ensure_ascii=False)
        return self._send_response(response)

    # =========================================================================
    # GET /read_dat
    # =========================================================================

    def _handle_read_dat(self, path: str, start_line: str | None, end_line: str | None, response: dict) -> dict:
        """Read text content from a DAT operator."""
        s = int(start_line) if start_line else None
        e = int(end_line) if end_line else None
        code = rf"""import json
t = op('{path}')
if t is None:
    print(json.dumps({{'success':False,'error':'Not found'}}))
else:
    rows = []
    for i in range(t.numRows):
        rows.append(str(t[i,0].val) if t[i,0] else '')
    content = '\\n'.join(rows)
    total = len(rows)
    if {s} is not None and {e} is not None:
        content = '\\n'.join(rows[{s}-1:{e}])
    elif {s} is not None:
        content = '\\n'.join(rows[{s}-1:])
    print(json.dumps({{'success':True,'path':t.path,'content':content,'totalLines':total}}))
"""
        result = self._execute_python_robust(code)
        response["statusCode"] = 200
        response["statusReason"] = "OK"
        response["data"] = json.dumps(result, ensure_ascii=False)
        return self._send_response(response)

    # =========================================================================
    # POST /write_dat
    # =========================================================================

    def _handle_write_dat(self, request: dict, response: dict) -> dict:
        """Write/patch text content of a DAT."""
        try:
            payload = json.loads(request.get("data", "") or "{}")
        except:
            payload = request.get("pars", {})
        path = payload.get("path", "")
        text = payload.get("text", None)
        old_text = payload.get("old_text", None)
        new_text = payload.get("new_text", None)
        replace_all = payload.get("replace_all", False)

        if text:
            # Full replacement
            code = rf"""import json
t = op('{path}')
if t is None:
    print(json.dumps({{'success':False,'error':'Not found'}}))
else:
    t.text = '''{text}'''
    print(json.dumps({{'success':True,'path':'{path}','action':'replace','length':len('''{text}''')}}))
"""
        elif old_text and new_text is not None:
            # StrReplace-style patch
            all_flag = "True" if replace_all else "False"
            code = rf"""import json
t = op('{path}')
if t is None:
    print(json.dumps({{'success':False,'error':'Not found'}}))
else:
    old = '''{old_text}'''
    new = '''{new_text}'''
    if {all_flag}:
        count = t.text.count(old)
        t.text = t.text.replace(old, new)
    else:
        count = 1
        t.text = t.text.replace(old, new, 1)
    print(json.dumps({{'success':True,'path':'{path}','action':'patch','replacements':count}}))
"""
        else:
            response["statusCode"] = 400
            response["statusReason"] = "Bad Request"
            response["data"] = json.dumps({"error": "Provide 'text' for replacement or 'old_text'+'new_text' for patching"})
            return self._send_response(response)

        result = self._execute_python_robust(code)
        response["statusCode"] = 200
        response["statusReason"] = "OK"
        response["data"] = json.dumps(result, ensure_ascii=False)
        return self._send_response(response)

    # =========================================================================
    # GET /read_chop
    # =========================================================================

    def _handle_read_chop(self, path: str, channels: str | None, start: str | None, end: str | None, response: dict) -> dict:
        """Read CHOP channel data."""
        chan_filter = f"['{channels}']" if channels else "None"
        s = str(start) if start else "None"
        e = str(end) if end else "None"

        code = rf"""import json
t = op('{path}')
if t is None:
    print(json.dumps({{'success':False,'error':'Not found'}}))
elif t.family != 'CHOP':
    print(json.dumps({{'success':False,'error':'Not a CHOP: '+str(t.OPType)}}))
else:
    try:
        chan_names = {chan_filter}
        if chan_names is None:
            chan_names = [c.name for c in t.channels()]
        result = {{}}
        for cname in chan_names:
            ch = t[cname] if hasattr(t, '__getitem__') else None
            if ch is None:
                result[cname] = []
                continue
            vals = []
            start_idx = {s} if {s} is not None else 0
            end_idx = {e} if {e} is not None else ch.numSamples
            for i in range(start_idx, min(end_idx, ch.numSamples)):
                vals.append(ch[i])
            result[cname] = vals
        print(json.dumps({{'success':True,'path':t.path,'channels':result}}))
    except Exception as e:
        print(json.dumps({{'success':False,'error':str(e)}}))
"""
        result = self._execute_python_robust(code)
        response["statusCode"] = 200
        response["statusReason"] = "OK"
        response["data"] = json.dumps(result, ensure_ascii=False)
        return self._send_response(response)

    # =========================================================================
    # POST /project_lifecycle
    # =========================================================================

    def _handle_project_lifecycle(self, request: dict, response: dict) -> dict:
        """Save, load, undo, redo project."""
        pars = request.get("pars", {})
        action = pars.get("action", "save")
        file_path = pars.get("path", None)

        actions = {
            "save": f"ui.save('{file_path}')" if file_path else "ui.save()",
            "load": f"ui.load('{file_path}')" if file_path else "ui.load()",
            "undo": "ui.undo()",
            "redo": "ui.redo()",
            "start_undo_block": "ui.startUndoBlock()",
            "end_undo_block": "ui.endUndoBlock()",
            "clear_undo": "ui.clearUndo()",
        }
        td_action = actions.get(action)
        if not td_action:
            response["statusCode"] = 400
            response["statusReason"] = "Bad Request"
            response["data"] = json.dumps({"error": f"Unknown action: {action}"})
            return self._send_response(response)

        code = f"""import json
try:
    {td_action}
    print(json.dumps({{'success':True,'action':'{action}','message':'{action} performed'}}))
except Exception as e:
    print(json.dumps({{'success':False,'action':'{action}','error':str(e)}}))
"""
        result = self._execute_python_robust(code)
        response["statusCode"] = 200
        response["statusReason"] = "OK"
        response["data"] = json.dumps(result, ensure_ascii=False)
        return self._send_response(response)

    # =========================================================================
    # GET /snapshot_scene
    # =========================================================================

    def _handle_snapshot_scene(self, path: str, response: dict) -> dict:
        """Snapshot operator state (par values, modes, expressions)."""
        code = rf"""import json
def snapshot(n):
    if n is None: return None
    info = {{'path':n.path,'name':n.name,'type':n.OPType}}
    try:
        pars = {{}}
        for p in n.pars():
            try:
                pars[p.name] = {{'val':p.val,'mode':str(p.mode),'expr':p.expr if p.isExpression else None}}
            except: pass
        info['pars'] = pars
    except: pass
    try:
        kids = []
        for c in n.children:
            s = snapshot(c)
            if s: kids.append(s)
        info['children'] = kids
    except: pass
    return info
s = snapshot(op('{path}'))
print(json.dumps({{'success':True,'snapshot':s}}))
"""
        result = self._execute_python_robust(code)
        response["statusCode"] = 200
        response["statusReason"] = "OK"
        response["data"] = json.dumps(result, ensure_ascii=False)
        return self._send_response(response)

    # =========================================================================
    # POST /memory_save
    # =========================================================================

    def _handle_memory_save(self, request: dict, response: dict) -> dict:
        """Save to TD store memory."""
        try:
            payload = json.loads(request.get("data", "") or "{}")
        except:
            payload = request.get("pars", {})
        key = payload.get("key", "")
        content = payload.get("content", "")
        tags = payload.get("tags", [])

        code = rf"""import json
store = op('/').store('_td_memory')
if store is None:
    store = {{}}
store['{key}'] = {{'content':'{content}','tags':{json.dumps(tags)},'timestamp':'{time.time()}'}}
op('/').store('_td_memory', store)
print(json.dumps({{'success':True,'key':'{key}','content':'{content}','tags':{json.dumps(tags)}}}))
"""
        result = self._execute_python_robust(code)
        response["statusCode"] = 200
        response["statusReason"] = "OK"
        response["data"] = json.dumps(result, ensure_ascii=False)
        return self._send_response(response)

    # =========================================================================
    # GET /memory_recall
    # =========================================================================

    def _handle_memory_recall(self, query: str, limit: str, response: dict) -> dict:
        """Search TD store memory."""
        try:
            lim = int(limit)
        except:
            lim = 5

        code = rf"""import json
store = op('/').store('_td_memory')
if store is None:
    print(json.dumps({{'success':True,'results':[],'total':0}}))
else:
    results = []
    q = '{query}'.lower()
    for k, v in store.items():
        if not q or q in k.lower() or q in str(v.get('content','')).lower():
            results.append({{'key':k,'content':v.get('content',''),'tags':v.get('tags',[])}})
    results = results[:{lim}]
    print(json.dumps({{'success':True,'results':results,'total':len(results)}}))
"""
        result = self._execute_python_robust(code)
        response["statusCode"] = 200
        response["statusReason"] = "OK"
        response["data"] = json.dumps(result, ensure_ascii=False)
        return self._send_response(response)

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
            # Si el valor es un objeto TD (no serializable), convertirlo a string
            if not isinstance(value, (int, float, str, bool, list, dict, tuple, type(None))):
                try:
                    value = str(value)
                except Exception:
                    value = None
        except Exception:
            try:
                value = par.val
                if not isinstance(value, (int, float, str, bool, list, dict, tuple, type(None))):
                    try:
                        value = str(value)
                    except Exception:
                        value = None
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
    # WebSocket transport (JSON-RPC over WebSocket)
    # -------------------------------------------------------------------------

    _ws_clients = set()  # Track connected WebSocket clients

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

        try:
            result = self._ws_dispatch(method, params)
            self._ws_respond(dat, client, msg_id, result=result)
        except Exception as e:
            self._ws_respond(dat, client, msg_id, error={"code": -1, "message": str(e)})

    def OnWebSocketReceiveBinary(self, dat, client, data):
        """Binary messages not supported — send error."""
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

    def _ws_dispatch(self, method: str, params: dict) -> dict:
        """Route a JSON-RPC method to the corresponding HTTP handler logic.

        Maps WebSocket method names to the same internal handler methods
        used by OnHTTPRequest, so there is zero code duplication for
        the actual operator interaction logic.
        """
        # --- Editor ---
        if method == "editor/pane":
            resp = {}
            self._handle_editor_pane(resp)
            return json.loads(resp.get("data", "{}"))

        if method == "editor/selection":
            resp = {}
            self._handle_editor_selection(resp)
            return json.loads(resp.get("data", "{}"))

        # --- Info ---
        if method == "info":
            resp = {}
            self._handle_info(resp)
            return json.loads(resp.get("data", "{}"))

        # --- Operators ---
        if method == "operators":
            path = params.get("path", "/")
            resp = {}
            self._handle_operators(path, resp)
            return json.loads(resp.get("data", "{}"))

        # --- Parameters ---
        if method == "parameters":
            path = params.get("path", "/")
            names_raw = params.get("names", "")
            names = [n.strip() for n in names_raw.split(",") if n.strip()] if names_raw else []
            resp = {}
            self._handle_parameters_get(path, names, resp)
            return json.loads(resp.get("data", "{}"))

        if method == "parameters/set":
            resp = {}
            # Build a fake request dict that _handle_parameters_set expects
            fake_request = {"data": json.dumps(params)}
            self._handle_parameters_set(fake_request, resp)
            return json.loads(resp.get("data", "{}"))

        # --- Connections ---
        if method == "connections":
            path = params.get("path", "/")
            recurse = params.get("recurse", False)
            resp = {}
            self._handle_connections(path, bool(recurse), resp)
            return json.loads(resp.get("data", "{}"))

        # --- Find ---
        if method == "find":
            fake_request = {"pars": params}
            resp = {}
            self._handle_find(fake_request, resp)
            return json.loads(resp.get("data", "{}"))

        # --- Healthcheck ---
        if method == "healthcheck":
            path = params.get("path", "/")
            recurse = params.get("recurse", True)
            resp = {}
            self._handle_healthcheck(path, bool(recurse), resp)
            return json.loads(resp.get("data", "{}"))

        # --- Execute Python (twozero-compatible) ---
        if method == "exec":
            code = params.get("code", "")
            return self._execute_python_robust(code)

        if method == "execute":
            code = params.get("code", "")
            from_op = params.get("fromOp", "/")
            return self._execute_python(code, from_op)

        # --- Async execution ---
        if method == "execute_async":
            resp = {}
            fake_request = {"data": json.dumps(params)}
            self._handle_execute_async(fake_request, resp)
            return json.loads(resp.get("data", "{}"))

        if method == "task_status":
            task_id = params.get("taskId", "")
            resp = {}
            self._handle_task_status(task_id, resp)
            return json.loads(resp.get("data", "{}"))

        # --- Unknown method ---
        raise ValueError(f"Unknown method: {method}")

    def OnServerStart(self, dat):
        print("Server started")

    def OnServerStop(self, dat):
        print("Server stopped")


# Bind utility methods from td_utils to TouchDesignerAPI class
for _name in td_utils.__all__:
    setattr(TouchDesignerAPI, _name, getattr(td_utils, _name))
