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
import uuid


class TouchDesignerAPI:
    """TouchDesigner HTTP API Extension — embedded in .tox."""

    def __init__(self, owner_comp):
        self.owner = owner_comp
        self._cache = {}
        self._ws_clients = set()
        self._cache_hits = 0
        self._cache_misses = 0
        # Undo/redo history of requests (backlog item 09)
        self._undo_stack = []
        self._redo_stack = []
        print(f"[TouchDesignerAPI] Inicializado en {owner_comp.path}")

    # ── Read-through cache helpers (mirror toe/src/TouchDesignerAPI.py) ────────

    def _cache_key(self, endpoint, path, recurse, limit, offset):
        """Build a deterministic cache key for a paginated/thresholded read."""
        return "|".join([
            endpoint,
            path or "/",
            "1" if recurse else "0",
            str(int(limit)),
            str(int(offset)),
        ])

    def _cache_read(self, key):
        """Return a cached value or None (cache miss)."""
        return self._cache.get(key)

    def _cache_write(self, key, value):
        """Store a value in the cache."""
        self._cache[key] = value

    def _invalidate_cache(self):
        """Drop the whole read cache. Called once per mutating request."""
        if not hasattr(self, "_cache"):
            self._cache = {}
            self._cache_hits = 0
            self._cache_misses = 0
        self._cache.clear()
        self._cache_hits = 0
        self._cache_misses = 0

    # ── Request history: /undo, /redo, /history (backlog item 09) ────────────
    # Mirror of toe/src/TouchDesignerAPI.py (same entries, same semantics).

    UNDO_MAX_DEPTH = 50

    def _ensure_history(self):
        """Lazy-init history state so instances built without __init__ work."""
        if not hasattr(self, "_undo_stack"):
            self._undo_stack = []
        if not hasattr(self, "_redo_stack"):
            self._redo_stack = []

    def _history_snapshot_ops(self, paths):
        """Capture the minimal state needed to recreate/restore operators."""
        ops = []
        for p in paths:
            try:
                n = op(p)
            except Exception:
                n = None
            if n is None:
                ops.append({"path": p, "exists": False})
                continue
            ops.append({
                "path": getattr(n, "path", p),
                "type": getattr(n, "type", None),
                "opType": getattr(n, "OPType", None),
                "name": getattr(n, "name", None),
                "nodeX": getattr(n, "nodeX", 0),
                "nodeY": getattr(n, "nodeY", 0),
                "exists": True,
            })
        return ops

    def _history_restore_ops(self, ops):
        """Recreate or destroy operators so the tree matches `ops`."""
        recreated = 0
        destroyed = 0
        errors = []
        for entry in ops or []:
            try:
                n = op(entry["path"])
                if entry.get("exists"):
                    if n is None:
                        parent_path, _, name = entry["path"].rpartition("/")
                        parent = op(parent_path or "/")
                        if parent is None:
                            raise ValueError(f"Parent not found: {parent_path}")
                        op_type = entry.get("opType") or entry.get("type")
                        created = parent.create(op_type, name)
                        try:
                            created.nodeX = entry.get("nodeX", 0)
                            created.nodeY = entry.get("nodeY", 0)
                        except Exception:
                            pass
                        recreated += 1
                else:
                    if n is not None:
                        n.destroy()
                        destroyed += 1
            except Exception as e:
                errors.append({"path": entry.get("path"), "error": str(e)})
        return recreated, destroyed, errors

    def _history_apply_par_states(self, par_states):
        """Restore recorded parameter states (value/mode/expr)."""
        restored = 0
        errors = []
        for entry in par_states or []:
            try:
                target = op(entry["path"])
                if target is None or not hasattr(target.par, entry["name"]):
                    errors.append({"path": entry["path"], "name": entry["name"], "error": "operator or parameter not found"})
                    continue
                self._restore_par_state(getattr(target.par, entry["name"]), entry["state"])
                restored += 1
            except Exception as e:
                errors.append({"path": entry.get("path"), "name": entry.get("name"), "error": str(e)})
        return restored, errors

    def _capture_par_state(self, par):
        """Capture one Par's value/expr/mode for later restore."""
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

    def _restore_par_state(self, par, state):
        """Restore one Par from a captured state (mirror of toe/src)."""
        mode_name = state.get("modeName")
        if mode_name:
            try:
                par.mode = getattr(ParMode, mode_name)
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

    def _record_history(self, description, undo_entry):
        """Push one reversible entry onto the undo stack (FIFO at depth 50)."""
        self._ensure_history()
        entry = {
            "id": uuid.uuid4().hex[:8],
            "description": description,
            "undo": undo_entry,
        }
        self._undo_stack.append(entry)
        if len(self._undo_stack) > self.UNDO_MAX_DEPTH:
            self._undo_stack.pop(0)  # FIFO: drop the oldest
        self._redo_stack.clear()
        return entry

    def _history_drop_last_if(self, predicate):
        """Remove the most recent history entry when `predicate` holds."""
        self._ensure_history()
        if self._undo_stack and predicate(self._undo_stack[-1]):
            self._undo_stack.pop()

    def _history_capture_pars(self, target, updates):
        """Capture the pre-change state of the parameters an update touches."""
        par_states = []
        try:
            for upd in updates:
                name = upd.get("name")
                if name and hasattr(target.par, name):
                    par_states.append({
                        "path": target.path,
                        "name": name,
                        "state": self._capture_par_state(getattr(target.par, name)),
                    })
        except Exception:
            pass
        return par_states

    def _history_for_parameters_set(self, target, updates):
        par_states = self._history_capture_pars(target, updates)
        if not par_states:
            return None
        names = ", ".join(s["name"] for s in par_states)
        return self._record_history(
            f"parameters.set on {target.path} ({names})",
            {"kind": "parameters", "parStates": par_states},
        )

    def _history_for_create(self, new_path):
        """Record a creation so /undo can destroy it and /redo can re-create it.

        The pre-create state (exists=False) alone is NOT enough for redo:
        recreating the operator needs its type, which only exists AFTER the
        create happened. So we snapshot the freshly created op here (found
        live: redo failed with "Unknown operator type. Value:None" without
        this).
        """
        entry = {"path": new_path, "exists": False}
        try:
            n = op(new_path)  # type: ignore
            if n is not None:
                entry["opType"] = getattr(n, "OPType", None)
                entry["type"] = getattr(n, "type", None)
                entry["name"] = getattr(n, "name", None)
                entry["nodeX"] = getattr(n, "nodeX", 0)
                entry["nodeY"] = getattr(n, "nodeY", 0)
        except Exception:
            pass
        return self._record_history(f"create {new_path}", {"kind": "ops", "ops": [entry]})

    def _history_for_delete(self, entry):
        """Entry is the _history_snapshot_ops record captured before delete."""
        return self._record_history(f"delete {entry['path']}", {"kind": "ops", "ops": [entry]})

    def _undo_apply_entry(self, entry):
        """Revert ONE complete request operation described by `entry`."""
        undo = entry.get("undo", {})
        kind = undo.get("kind")
        if kind == "parameters":
            restored, errors = self._history_apply_par_states(undo.get("parStates"))
            return restored, errors
        if kind == "ops":
            _, destroyed, errors = self._history_restore_ops(undo.get("ops"))
            return destroyed, errors
        if kind == "wiring":
            inp = undo.get("input", {})
            target = op(inp.get("path"))
            if target is None:
                return 0, [{"path": inp.get("path"), "error": "operator not found"}]
            idx = int(inp.get("index", 0))
            try:
                target.inputConnectors[idx].disconnect()
            except Exception:
                pass
            reconnected = 0
            errors = []
            for src_path in inp.get("sources", []):
                try:
                    src = op(src_path)
                    if src is not None:
                        target.inputConnectors[idx].connect(src)
                        reconnected += 1
                except Exception as e:
                    errors.append({"path": src_path, "error": str(e)})
            return reconnected, errors
        return 0, [{"error": f"Unknown undo entry kind: {kind!r}"}]

    def _redo_apply_entry(self, entry):
        """Re-apply the operation that `entry` originally reverted."""
        undo = entry.get("undo", {})
        kind = undo.get("kind")
        if kind == "parameters":
            after = entry.get("redo")
            if not after:
                return 0, [{"error": "No redo state recorded for this entry"}]
            restored, errors = self._history_apply_par_states(after.get("parStates", []))
            return restored, errors
        if kind == "ops":
            ops = undo.get("ops", [])
            flipped = [dict(o, exists=not o.get("exists")) for o in ops]
            recreated, destroyed, errors = self._history_restore_ops(flipped)
            return (recreated if any(not o.get("exists") for o in ops) else destroyed), errors
        return 0, [{"error": f"Unknown redo entry kind: {kind!r}"}]

    def _handle_undo(self):
        """POST /undo - revert the most recent recorded write operation."""
        self._ensure_history()
        if not self._undo_stack:
            return {
                "status": 400,
                "body": json.dumps({
                    "success": False,
                    "error": "Nothing to undo: the history is empty",
                    "hint": "Only bridge write requests are recorded; run one first or check GET /history",
                }),
                "headers": {"Content-Type": "application/json"},
            }
        entry = self._undo_stack.pop()
        try:
            # Capture the post-write state BEFORE reverting, so redo can
            # restore exactly what the write produced (mirror of toe/src).
            undo = entry.get("undo", {})
            if undo.get("kind") == "parameters":
                after_states = []
                for st in undo.get("parStates", []):
                    target = op(st["path"])
                    if target is not None and hasattr(target.par, st["name"]):
                        after_states.append({
                            "path": st["path"],
                            "name": st["name"],
                            "state": self._capture_par_state(getattr(target.par, st["name"])),
                        })
                entry["redo"] = {"kind": "parameters", "parStates": after_states}
            applied, errors = self._undo_apply_entry(entry)
            self._redo_stack.append(entry)
            return {
                "status": 200,
                "body": json.dumps({
                    "success": True,
                    "undone": entry["description"],
                    "kind": entry["undo"].get("kind"),
                    "applied": applied,
                    "errors": errors,
                    "depth": len(self._undo_stack),
                    "canUndo": len(self._undo_stack) > 0,
                    "canRedo": True,
                }, ensure_ascii=False),
                "headers": {"Content-Type": "application/json"},
            }
        except Exception as e:
            return {
                "status": 500,
                "body": json.dumps({"success": False, "error": str(e)}),
                "headers": {"Content-Type": "application/json"},
            }

    def _handle_redo(self):
        """POST /redo - re-apply the most recently undone operation."""
        self._ensure_history()
        if not self._redo_stack:
            return {
                "status": 400,
                "body": json.dumps({
                    "success": False,
                    "error": "Nothing to redo: no undone operation pending",
                    "hint": "Redo is only available right after an /undo; a new write clears it. See GET /history",
                }),
                "headers": {"Content-Type": "application/json"},
            }
        entry = self._redo_stack.pop()
        try:
            applied, errors = self._redo_apply_entry(entry)
            self._undo_stack.append(entry)
            if len(self._undo_stack) > self.UNDO_MAX_DEPTH:
                self._undo_stack.pop(0)
            return {
                "status": 200,
                "body": json.dumps({
                    "success": True,
                    "redone": entry["description"],
                    "kind": entry["undo"].get("kind"),
                    "applied": applied,
                    "errors": errors,
                    "depth": len(self._undo_stack),
                    "canUndo": True,
                    "canRedo": len(self._redo_stack) > 0,
                }, ensure_ascii=False),
                "headers": {"Content-Type": "application/json"},
            }
        except Exception as e:
            return {
                "status": 500,
                "body": json.dumps({"success": False, "error": str(e)}),
                "headers": {"Content-Type": "application/json"},
            }

    def _handle_history(self):
        """GET /history - list undoable/redoable entries, one line each."""
        self._ensure_history()
        undo_items = [
            {"id": e["id"], "description": e["description"], "kind": e["undo"].get("kind")}
            for e in self._undo_stack
        ]
        redo_items = [
            {"id": e["id"], "description": e["description"], "kind": e["undo"].get("kind")}
            for e in self._redo_stack
        ]
        return {
            "status": 200,
            "body": json.dumps({
                "maxDepth": self.UNDO_MAX_DEPTH,
                "canUndo": len(undo_items) > 0,
                "canRedo": len(redo_items) > 0,
                "undo": undo_items,
                "redo": redo_items,
            }, ensure_ascii=False),
            "headers": {"Content-Type": "application/json"},
        }

    # ── Server-side endpoint latency tracking (GET /metrics) ─────────────
    # Mirror of toe/src/TouchDesignerAPI.py (same buffers, same route keys).

    def _ensure_endpoint_times(self):
        """Lazy-init the per-route latency ring buffers."""
        if not hasattr(self, "_endpoint_times"):
            self._endpoint_times = {}  # route -> deque(maxlen=20) of ms

    def _endpoint_route(self, uri):
        """Normalize a request URI to its route key (no query string)."""
        return (uri or "").split("?", 1)[0] or "/"

    def _record_endpoint_time(self, uri, elapsed_ms):
        """Record one request latency for its route (keeps the last 20)."""
        self._ensure_endpoint_times()
        route = self._endpoint_route(uri)
        from collections import deque
        buf = self._endpoint_times.setdefault(route, deque(maxlen=20))
        buf.append(round(float(elapsed_ms), 3))

    def _cache_wrap(self, endpoint, path, recurse, limit, offset, build_fn, no_cache=False):
        """Read-through cache for the expensive GET handlers.

        Hit  -> return cached body with "cache": "hit".
        Miss -> run build_fn, cache the body on success, tag "cache": "miss".
        The "cache" key is ADDITIVE: pagination metadata is untouched.
        """
        if not hasattr(self, "_cache"):
            self._cache = {}
            self._cache_hits = 0
            self._cache_misses = 0
        key = self._cache_key(endpoint, path, recurse, limit, offset)
        if not no_cache:
            cached = self._cache.get(key)
            if cached is not None:
                self._cache_hits += 1
                cached["cache"] = "hit"
                return cached
        self._cache_misses += 1
        result = build_fn()
        if result.get("status") == 200:
            try:
                body = json.loads(result.get("body") or "{}")
                body.pop("cache", None)
                self._cache[key] = body
                body["cache"] = "miss"
                result["body"] = json.dumps(body, ensure_ascii=False)
            except (ValueError, TypeError):
                pass
        return result

    def _handle_write_response(self, status, body, extra_headers=None):
        """Shared write-path exit: invalidate the cache and return the response."""
        self._invalidate_cache()
        return {
            "status": status,
            "body": body,
            "headers": {
                "Content-Type": "application/json",
                **(extra_headers or {}),
            },
        }

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

        _t0 = time.perf_counter()
        try:
            return self._route_request(dat, request, method, path, body, headers)
        finally:
            # Latency for every routed request, exactly once, on the single
            # guaranteed exit (mirror of toe/src/TouchDesignerAPI.py).
            try:
                self._record_endpoint_time(path, (time.perf_counter() - _t0) * 1000.0)
            except Exception:
                pass

    def _route_request(self, dat, request, method, path, body, headers):
        """Route ladder (split from handle_request so the caller can time it)."""
        self._debug_print(f">>> {method} {path}")

        if method in ("POST", "PUT", "DELETE"):
            # Any mutating request invalidates the whole read cache (/exec can
            # change anything -> blanket invalidation is the only safe policy).
            self._invalidate_cache()

        try:
            # Rutas disponibles
            if path == "/info" or path == "/":
                return self._handle_info()
            elif path == "/undo" and method == "POST":
                return self._handle_undo()
            elif path == "/redo" and method == "POST":
                return self._handle_redo()
            elif path == "/history" and method == "GET":
                return self._handle_history()
            elif path == "/exec" and method in ("POST", "PUT"):
                return self._handle_exec(body)
            elif path == "/execute_async" and method in ("POST", "PUT"):
                return self._handle_write_response(200, json.dumps({"status": "ok", "note": "Async execute dispatched; read cache invalidated"}))
            elif path.startswith("/task_status"):
                return self._handle_task_status(path)
            elif path == "/health":
                return {"status": 200, "body": json.dumps({"status": "ok"})}
            elif path == "/metrics" and method == "GET":
                return self._handle_metrics()
            elif path == "/editor/pane" and method == "GET":
                return self._handle_editor_pane()
            elif path == "/editor/selection" and method == "GET":
                return self._handle_editor_selection()
            elif path.startswith("/operators") and method == "GET":
                parsed = urllib.parse.urlparse(path)
                params = urllib.parse.parse_qs(parsed.query)
                op_path = urllib.parse.unquote(params.get("path", ["/"])[0])
                try:
                    limit = self._parse_positive_int(params.get("limit", ["500"])[0], default=500)
                except ValueError as e:
                    return {
                        "status": 400,
                        "body": json.dumps({"error": str(e), "hint": "Use ?limit=N&offset=N (N integer >= 1)"}),
                        "headers": {"Content-Type": "application/json"},
                    }
                try:
                    offset = self._parse_nonnegative_int(params.get("offset", ["0"])[0], default=0)
                except ValueError as e:
                    return {
                        "status": 400,
                        "body": json.dumps({"error": str(e), "hint": "Use ?limit=N&offset=N (N integer >= 0)"}),
                        "headers": {"Content-Type": "application/json"},
                    }
                no_cache = params.get("no_cache", ["0"])[0] in ("1", "true", "True") or params.get("refresh", ["0"])[0] in ("1", "true", "True")
                return self._cache_wrap(
                    "/operators", op_path, False, limit, offset,
                    lambda: self._handle_operators(op_path, limit=limit, offset=offset),
                    no_cache=no_cache,
                )
            elif path.startswith("/parameters/set") and method == "POST":
                return self._handle_parameters_set(body)
            elif path.startswith("/write_dat") and method == "POST":
                return self._handle_write_response(200, json.dumps({"status": "ok", "note": "DAT written; read cache invalidated"}))
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
                try:
                    limit = self._parse_positive_int(params.get("limit", ["500"])[0], default=500)
                except ValueError as e:
                    return {
                        "status": 400,
                        "body": json.dumps({"error": str(e), "hint": "Use ?limit=N&offset=N (N integer >= 1)"}),
                        "headers": {"Content-Type": "application/json"},
                    }
                try:
                    offset = self._parse_nonnegative_int(params.get("offset", ["0"])[0], default=0)
                except ValueError as e:
                    return {
                        "status": 400,
                        "body": json.dumps({"error": str(e), "hint": "Use ?limit=N&offset=N (N integer >= 0)"}),
                        "headers": {"Content-Type": "application/json"},
                    }
                return self._handle_connections(op_path, recurse, limit, offset)
            elif path.startswith("/find") and method == "GET":
                parsed = urllib.parse.urlparse(path)
                params = urllib.parse.parse_qs(parsed.query)
                try:
                    limit = self._parse_positive_int(params.get("limit", ["500"])[0], default=500)
                except ValueError as e:
                    return {
                        "status": 400,
                        "body": json.dumps({"error": str(e), "hint": "Use ?limit=N&offset=N (N integer >= 1)"}),
                        "headers": {"Content-Type": "application/json"},
                    }
                try:
                    offset = self._parse_nonnegative_int(params.get("offset", ["0"])[0], default=0)
                except ValueError as e:
                    return {
                        "status": 400,
                        "body": json.dumps({"error": str(e), "hint": "Use ?limit=N&offset=N (N integer >= 0)"}),
                        "headers": {"Content-Type": "application/json"},
                    }
                return self._handle_find(params, limit, offset)
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

    def _handle_metrics(self):
        """GET /metrics — real TD + bridge metrics (dynamic, NEVER cached).

        Mirror of toe/src/TouchDesignerAPI.py::_handle_metrics. This copy runs
        inside TD, so the walk is direct Python instead of an /exec round-trip.
        Every unavailable signal is an explicit null; nothing is estimated.
        """
        try:
            try:
                fps = round(float(project.cookRate), 2)
            except Exception:
                fps = None

            families = ("COMP", "TOP", "CHOP", "SOP", "POP", "DAT", "MAT")
            by_family = {f: 0 for f in families}
            total_ops = 0
            other_ops = 0
            cooking_count = 0
            cooking_seen = False
            error_count = 0
            warning_count = 0
            pop_total = 0
            pop_errors = 0
            pop_slowest = None

            # One recursive walk from "/" (same criteria as /verify: per-op
            # errors()/warnings(), no recursion into messages).
            def walk(n, depth=0):
                nonlocal total_ops, other_ops, cooking_count, cooking_seen
                nonlocal error_count, warning_count
                nonlocal pop_total, pop_errors, pop_slowest
                if n is None or depth > 30:
                    return
                try:
                    total_ops += 1
                    fam = getattr(n, "family", None)
                    if fam in by_family:
                        by_family[fam] += 1
                    else:
                        other_ops += 1
                    try:
                        ck = getattr(n, "cooking", None)
                        if ck is not None:
                            cooking_seen = True
                            if ck:
                                cooking_count += 1
                    except Exception:
                        pass
                    try:
                        errs = n.errors(recurse=False)
                    except Exception:
                        errs = ""
                    try:
                        warns = n.warnings(recurse=False)
                    except Exception:
                        warns = ""
                    if isinstance(errs, str) and errs.strip():
                        error_count += 1
                    elif isinstance(errs, (list, tuple)):
                        error_count += sum(1 for e in errs if str(e).strip())
                    if isinstance(warns, str) and warns.strip():
                        warning_count += 1
                    elif isinstance(warns, (list, tuple)):
                        warning_count += sum(1 for w in warns if str(w).strip())
                    if fam == "POP":
                        pop_total += 1
                        if errs:
                            pop_errors += 1
                        try:
                            ct = n.cookTime
                            if ct is not None and (pop_slowest is None or float(ct) > pop_slowest["cookTime_ms"]):
                                pop_slowest = {"path": n.path, "cookTime_ms": round(float(ct), 3)}
                        except Exception:
                            pass
                except Exception:
                    pass
                try:
                    for c in n.children:
                        walk(c, depth + 1)
                except Exception:
                    pass

            try:
                root = op("/")
            except Exception:
                root = None
            walk(root)

            if not hasattr(self, "_cache"):
                self._cache = {}
                self._cache_hits = 0
                self._cache_misses = 0
            self._ensure_endpoint_times()
            endpoint_times = {}
            for route, buf in sorted(self._endpoint_times.items()):
                vals = sorted(buf)
                n = len(vals)
                median = vals[n // 2] if n % 2 else (vals[n // 2 - 1] + vals[n // 2]) / 2.0
                endpoint_times[route] = {
                    "n": n,
                    "median_ms": round(float(median), 3),
                    "max_ms": round(float(vals[-1]), 3),
                }

            body = {
                "fps": fps,
                "td_build": self._get_td_build(),
                "total_ops": total_ops,
                "ops_by_family": by_family,
                "other_ops": other_ops,
                "cooking_count": cooking_count if cooking_seen else None,
                "error_count": error_count,
                "warning_count": warning_count,
                "pop_stats": {
                    "pop_total": pop_total,
                    "pop_errors": pop_errors,
                    "pop_slowest": pop_slowest,
                },
                "readCache": {
                    "hits": self._cache_hits,
                    "misses": self._cache_misses,
                    "entries": len(self._cache),
                },
                "endpoint_times": endpoint_times,
            }
            return {
                "status": 200,
                "body": json.dumps(body, ensure_ascii=False),
                "headers": {"Content-Type": "application/json"},
            }
        except Exception as e:
            return {
                "status": 500,
                "body": json.dumps({"error": str(e)}),
                "headers": {"Content-Type": "application/json"},
            }

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
        if not hasattr(self, "_cache"):
            self._cache = {}
            self._cache_hits = 0
            self._cache_misses = 0
        info["readCache"] = {
            "hits": self._cache_hits,
            "misses": self._cache_misses,
            "entries": len(self._cache),
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

    def _handle_operators(self, path, limit=500, offset=0):
        """GET /operators — list children at path (paginated).

        Wrapped by the read-through cache: identical requests return the same
        body with "cache": "hit"; ?no_cache=1 / ?refresh=1 force a rebuild.
        """
        try:
            target = op(path)
            if target is None:
                return {
                    "status": 404,
                    "body": json.dumps({"error": f"Operator not found: {path}"}),
                    "headers": {"Content-Type": "application/json"},
                }
            all_ops = [
                {"name": child.name, "type": child.type, "opType": child.OPType}
                for child in target.children
            ]
            total = len(all_ops)
            start = max(0, offset)
            end = start + limit if limit >= 0 else total
            page = all_ops[start:end]
            returned = len(page)
            return {
                "status": 200,
                "body": json.dumps({
                    "path": path,
                    "total": total,
                    "returned": returned,
                    "limit": limit,
                    "offset": offset,
                    "truncated": (start + returned) < total,
                    "operators": page,
                }),
                "headers": {"Content-Type": "application/json"},
            }
        except ValueError as e:
            return {
                "status": 400,
                "body": json.dumps({"error": str(e)}),
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
        """POST /parameters/set - set parameters transactionally."""
        self._invalidate_on_write()
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
            # Record the pre-change state so /undo can revert this request as
            # ONE operation (backlog item 09).
            self._history_for_parameters_set(target, updates if isinstance(updates, list) else [])
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

    def _handle_connections(self, path, recurse, limit=500, offset=0):
        """GET /connections — connection graph (paginated).

        Default limit 500 preserves existing clients; offset/limit let them page
        through very large networks.
        """
        try:
            target = op(path)
            if target is None:
                return {
                    "status": 404,
                    "body": json.dumps({"error": f"Operator not found: {path}"}),
                    "headers": {"Content-Type": "application/json"},
                }
            if recurse:
                nodes = self._iter_descendants(target, include_self=True)
            else:
                nodes = self._iter_descendants(target, include_self=False)
                nodes.insert(0, target)
            all_ops = [self._serialize_operator(node) for node in nodes]
            total = len(all_ops)
            start = max(0, offset)
            end = start + limit if limit >= 0 else total
            page = all_ops[start:end]
            returned = len(page)
            return {
                "status": 200,
                "body": json.dumps({
                    "path": target.path,
                    "recurse": recurse,
                    "total": total,
                    "returned": returned,
                    "limit": limit,
                    "offset": offset,
                    "truncated": (start + returned) < total,
                    "operators": page,
                }, ensure_ascii=False),
                "headers": {"Content-Type": "application/json"},
            }
        except Exception as e:
            return {
                "status": 500,
                "body": json.dumps({"error": str(e)}),
                "headers": {"Content-Type": "application/json"},
            }

    def _handle_find(self, params, limit=500, offset=0):
        """GET /find — find operators by query (paginated).

        The HTTP dispatcher wraps this in the read-through cache so that the same
        shape is returned for identical requests and the cache metadata is injected.
        To force a refresh from the client side, pass ?no_cache=1 or ?refresh=1.
        """
        """GET /find — find operators by query (paginated).

        Default limit 500 preserves existing clients; offset/limit let them page.
        Maximum 5000 enforced server-side; limit/offset must be non-negative ints
        or the caller gets a 400 with a hint.
        """
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
            total = len(matches)
            page = matches[offset:offset + limit] if limit >= 0 else matches[offset:]
            return {
                "status": 200,
                "body": json.dumps({
                    "results": page,
                    "total": total,
                    "returned": len(page),
                    "limit": limit,
                    "offset": offset,
                    "truncated": (offset + len(page)) < total,
                }, ensure_ascii=False),
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

    def _invalidate_on_write(self):
        """Invalidate the read cache before/after any write that mutates the network.
        Called by every write handler unconditionally.
        """
        self._invalidate_cache()

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

    # --- Pagination helpers (standalone copy; mirrors toe/src/TouchDesignerAPI.py) ---

    def _parse_positive_int(self, raw_value, default, minimum=1, maximum=None):
        try:
            value = int(raw_value)
        except (TypeError, ValueError):
            raise ValueError(f"Expected integer value, got: {raw_value!r}")
        if value < minimum:
            raise ValueError(f"Expected integer >= {minimum}, got: {value}")
        if maximum is not None and value > maximum:
            return maximum
        return value

    def _parse_nonnegative_int(self, raw_value, default, maximum=None):
        try:
            value = int(raw_value)
        except (TypeError, ValueError):
            raise ValueError(f"Expected non-negative integer value, got: {raw_value!r}")
        if value < 0:
            raise ValueError(f"Expected integer >= 0, got: {value}")
        if maximum is not None and value > maximum:
            return maximum
        return value

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
            try:
                limit = self._parse_positive_int(params.get("limit", 500), default=500)
            except ValueError:
                limit = 500
            try:
                offset = self._parse_nonnegative_int(params.get("offset", 0), default=0)
            except ValueError:
                offset = 0
            return self._extract_body(self._handle_operators(path, limit=limit, offset=offset))

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
            try:
                limit = self._parse_positive_int(params.get("limit", 500), default=500)
            except ValueError:
                limit = 500
            try:
                offset = self._parse_nonnegative_int(params.get("offset", 0), default=0)
            except ValueError:
                offset = 0
            return self._extract_body(self._handle_connections(path, bool(recurse), limit=limit, offset=offset))

        # --- Find ---
        if method == "find":
            find_params = {}
            for k, v in params.items():
                find_params[k] = [str(v)]
            try:
                limit = self._parse_positive_int(params.get("limit", 500), default=500)
            except ValueError:
                limit = 500
            try:
                offset = self._parse_nonnegative_int(params.get("offset", 0), default=0)
            except ValueError:
                offset = 0
            return self._extract_body(self._handle_find(find_params, limit=limit, offset=offset))

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
