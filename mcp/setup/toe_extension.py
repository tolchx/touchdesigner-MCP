"""TouchDesigner HTTP API Extension — Embedded .tox version.

Self-contained HTTP server extension for TouchDesigner that provides
a JSON API for executing Python code and querying editor state.

Drop this .tox into any TouchDesigner project and the API server
starts automatically on the configured port.
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

        if self.debug:
            print(f"[TDAPI] {method} {path}")

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

    def _handle_info(self):
        """Devuelve información del entorno TouchDesigner."""
        import subprocess
        info = {
            "status": "ok",
            "name": "TouchDesigner MCP API",
            "version": "3.0.0",
            "port": self.port,
            "debug": self.debug,
            "touchdesigner": {
                "build": self._get_td_build(),
                "project": str(op("/").path if op else "unknown"),
            },
        }
        try:
            import subprocess
            result = subprocess.run(
                ["node", "--version"],
                capture_output=True, text=True, timeout=5
            )
            info["nodejs"] = result.stdout.strip() if result.returncode == 0 else "not found"
        except Exception:
            info["nodejs"] = "not available"

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

        stdout_capture = io.StringIO()
        stderr_capture = io.StringIO()
        error_text = ""

        try:
            # Navegar al op de origen si se especifica
            if from_op and from_op != "/":
                try:
                    target = op(from_op)
                    if target:
                        # Cambiar contexto de ejecución
                        pass
                except Exception:
                    pass

            with contextlib.redirect_stdout(stdout_capture),                      contextlib.redirect_stderr(stderr_capture):
                exec(code, {"op": op, "me": self.owner, "td": td, "tdu": tdu,
                             "parent": self.owner.parent, "debug": self.debug,
                             "port": self.port, "__builtins__": __builtins__})

        except Exception as e:
            error_text = traceback.format_exc()
            if self.debug:
                print(f"[TDAPI] Error ejecutando código:")
                print(error_text)

        result = {
            "output": stdout_capture.getvalue(),
            "error": error_text or (stderr_capture.getvalue() or None),
        }

        return {
            "status": 200 if not error_text else 500,
            "body": json.dumps(result),
            "headers": {"Content-Type": "application/json"},
        }

    def _handle_execute_async(self, body):
        """Inicia ejecución asíncrona (mock, ejecuta síncrono y devuelve taskId)."""
        import uuid
        task_id = str(uuid.uuid4())
        result = self._handle_exec(body)

        # Guardar resultado para consulta posterior
        self._cache[task_id] = {
            "status": "done",
            "result": result,
        }

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

    def _get_td_build(self):
        """Obtiene el build number de TouchDesigner."""
        try:
            import subprocess
            result = subprocess.run(
                ["TouchDesigner", "--version"],
                capture_output=True, text=True, timeout=5
            )
            return result.stdout.strip() or "unknown"
        except Exception:
            return "TouchDesigner (build unknown)"


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
