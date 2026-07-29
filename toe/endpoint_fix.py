"""
TouchDesigner Missing Endpoints — Standalone Implementation
==========================================================
Callable via: POST /exec with code:
    exec(compile(open("toe/endpoint_fix.py").read(), "fix", "exec"))
    result = endpoint_call("auto_layout", {"path": "/project1"})
    print(result)

DO NOT put this code inside a class — TD /exec runs in global scope.
"""

import json
import traceback

# Path to this script — must be absolute because TD's cwd != project root.
# Change this if the project is at a different location.
_FIX_PATH = r"C:\Users\Tolch\Documents\AI_Code\Touchdesigner_MCP\Main\toe\endpoint_fix.py"

# Usage from /exec:
#   exec(compile(open(r"<FIX_PATH>", encoding="utf-8").read(), "fix", "exec"))


def _collect_op_info(n):
    """Collect standardized operator info dict."""
    if n is None:
        return None
    info = {}
    try:
        info["path"] = n.path
    except:
        pass
    try:
        info["name"] = n.name
    except:
        pass
    try:
        info["type"] = n.OPType
    except:
        pass
    try:
        info["family"] = n.family
    except:
        pass
    try:
        errs = n.errors()
        info["errors"] = [str(e) for e in (errs if isinstance(errs, (list, tuple)) else [])]
    except:
        pass
    return info


# ═══════════════════════════════════════════════════════════════════════════
# ENDPOINT: /auto_layout
# ═══════════════════════════════════════════════════════════════════════════

def auto_layout(params):
    """
    Topological-sort auto-layout operators in a container.
    Params: path, spacing_x (250), spacing_y (80)
    """
    container_path = params.get("path", "/")
    spacing_x = int(params.get("spacing_x", 250))
    spacing_y = int(params.get("spacing_y", 80))

    container = op(container_path)
    if container is None:
        return {"success": False, "error": f"Container not found: {container_path}"}

    children = list(container.children)

    # Build adjacency: for each op, which inputs connect to what
    in_degree = {c: 0 for c in children}
    adj = {c: [] for c in children}

    for c in children:
        for inp in c.inputConnectors:
            for conn in inp.connections:
                src = conn.owner
                if src is not None and src in adj:
                    adj[src].append(c)
                    in_degree[c] = in_degree.get(c, 0) + 1

    # Topological sort (Kahn's algorithm)
    queue = [c for c in children if in_degree.get(c, 0) == 0]
    sorted_ops = []
    while queue:
        node = queue.pop(0)
        sorted_ops.append(node)
        for nxt in adj.get(node, []):
            in_degree[nxt] -= 1
            if in_degree[nxt] == 0:
                queue.append(nxt)

    # Add any cycles/remainder
    for c in children:
        if c not in sorted_ops:
            sorted_ops.append(c)

    # Assign depth by input depth
    depth = {}
    for c in sorted_ops:
        max_d = 0
        for inp in c.inputConnectors:
            for conn in inp.connections:
                src = conn.owner
                if src is not None and src in depth:
                    max_d = max(max_d, depth[src] + 1)
        depth[c] = max_d

    # Group by depth, assign rows within each depth
    by_depth = {}
    for c in sorted_ops:
        d = depth[c]
        by_depth.setdefault(d, []).append(c)

    positions = []
    for d in sorted(by_depth.keys()):
        row = 0
        for op_node in by_depth[d]:
            x = d * spacing_x
            y = row * spacing_y
            op_node.nodeX = x
            op_node.nodeY = y
            positions.append({
                "path": op_node.path,
                "name": op_node.name,
                "nodeX": x,
                "nodeY": y,
                "depth": d,
                "row": row,
            })
            row += 1

    return {
        "success": True,
        "container": container_path,
        "operators": positions,
        "count": len(positions),
    }


# ═══════════════════════════════════════════════════════════════════════════
# ENDPOINT: /glsl_reload
# ═══════════════════════════════════════════════════════════════════════════

def glsl_reload(params):
    """Force recompile a GLSL shader."""
    op_path = params.get("path", "")
    t = op(op_path)
    if t is None:
        return {"success": False, "error": "Operator not found"}

    try:
        # Find the pixel/vertex/compute DAT associated with this GLSL op
        dat_path = None
        for p in t.pars():
            if p.name.lower() in ("pixeldat", "vertexdat", "computedat",
                                  "ptcomputedat", "vertcomputedat",
                                  "primcomputedat", "frag", "vert", "comp"):
                val = p.eval()
                if val is not None:
                    if isinstance(val, str):
                        dat_path = val
                        break
                    elif hasattr(val, "path"):
                        dat_path = val.path
                        break

        if not dat_path:
            for c in t.children:
                if hasattr(c, "text"):
                    dat_path = c.path
                    break

        result = {"path": t.path}
        if dat_path:
            dat = op(dat_path)
            if dat and hasattr(dat, "text"):
                result["code"] = dat.text
                result["codeLength"] = len(dat.text)
                # Force recompile by toggling bypass
                if hasattr(t, "par") and hasattr(t.par, "Bypass"):
                    t.par.bypass = True
                    t.cook(force=True)
                    t.par.bypass = False
                    t.cook(force=True)
                    result["recompiled"] = True
                else:
                    t.cook(force=True)
                    result["recompiled"] = True

                try:
                    errs = t.errors()
                    if errs:
                        if isinstance(errs, (list, tuple)):
                            result["errors"] = [str(e) for e in errs]
                        else:
                            result["errors"] = [str(errs)]
                except:
                    pass
            result["datPath"] = dat_path
        else:
            t.cook(force=True)
            result["recompiled"] = True

        result["success"] = True
        return result
    except Exception as e:
        return {"success": False, "path": op_path, "error": str(e)}


# ═══════════════════════════════════════════════════════════════════════════
# ENDPOINT: /glsl_update
# ═══════════════════════════════════════════════════════════════════════════

def glsl_update(params):
    """Atomically update GLSL code and recompile."""
    op_path = params.get("path", "")
    new_code = params.get("code", "")

    t = op(op_path)
    if t is None:
        return {"success": False, "error": "Operator not found"}

    try:
        # Find the DAT
        dat_path = None
        for p in t.pars():
            if p.name.lower() in ("pixeldat", "vertexdat", "computedat",
                                  "ptcomputedat", "vertcomputedat",
                                  "primcomputedat", "frag", "vert", "comp"):
                val = p.eval()
                if val is not None:
                    if isinstance(val, str):
                        dat_path = val
                        break
                    elif hasattr(val, "path"):
                        dat_path = val.path
                        break

        if not dat_path:
            for c in t.children:
                if hasattr(c, "text"):
                    dat_path = c.path
                    break

        if dat_path:
            dat = op(dat_path)
            if dat is not None:
                dat.text = new_code
                dat.cook(force=True)

        # Force recompile
        if hasattr(t, "par") and hasattr(t.par, "Bypass"):
            t.par.bypass = True
            t.cook(force=True)
            t.par.bypass = False
            t.cook(force=True)
        else:
            t.cook(force=True)

        # Check for errors
        errors = []
        try:
            errs = t.errors()
            if errs:
                if isinstance(errs, (list, tuple)):
                    errors = [str(e) for e in errs]
                else:
                    errors = [str(errs)]
        except:
            pass

        return {
            "success": len(errors) == 0,
            "path": t.path,
            "datPath": dat_path,
            "codeLength": len(new_code),
            "errors": errors,
        }
    except Exception as e:
        return {"success": False, "path": op_path, "error": str(e)}


# ═══════════════════════════════════════════════════════════════════════════
# ENDPOINT: /smart_connect
# ═══════════════════════════════════════════════════════════════════════════

def smart_connect(params):
    """Create and auto-wire between ops."""
    source_path = params.get("source", "") or params.get("src", "")
    dest_path = params.get("destination", "") or params.get("dst", "")
    op_type = params.get("type", "") or params.get("target_type", "")

    src = op(source_path) if source_path else None
    dst = op(dest_path) if dest_path else None

    if src is None and dst is None:
        return {"success": False, "error": "At least one of source or destination required"}

    try:
        parent = dst.parent() if dst else src.parent()
        src_family = src.family if src else None
        dst_family = dst.family if dst else None

        # Determine compatible type
        use_type = op_type
        if not use_type:
            if src_family == "TOP" or dst_family == "TOP":
                use_type = "nullTOP"
            elif src_family == "CHOP" or dst_family == "CHOP":
                use_type = "nullCHOP"
            elif src_family == "SOP" or dst_family == "SOP":
                use_type = "nullSOP"
            elif src_family == "POP" or dst_family == "POP":
                use_type = "nullPOP"
            elif src_family == "MAT" or dst_family == "MAT":
                use_type = "nullMAT"
            else:
                use_type = "nullCHOP"

        name = params.get("name", None)
        new_op = parent.create(getattr(td, use_type), name)

        # Position between source and destination
        if src and dst:
            new_op.nodeX = (src.nodeX + dst.nodeX) // 2
            new_op.nodeY = (src.nodeY + dst.nodeY) // 2
        elif src:
            new_op.nodeX = src.nodeX + 200
            new_op.nodeY = src.nodeY
        elif dst:
            new_op.nodeX = dst.nodeX - 200
            new_op.nodeY = dst.nodeY

        # Auto-wire
        if src:
            new_op.inputConnectors[0].connect(src)
        if dst:
            dst.inputConnectors[0].connect(new_op)

        return {
            "success": True,
            "path": new_op.path,
            "name": new_op.name,
            "type": new_op.OPType,
            "nodeX": new_op.nodeX,
            "nodeY": new_op.nodeY,
            "sourcePath": src.path if src else None,
            "destPath": dst.path if dst else None,
            "wired": bool(src) and bool(dst),
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


# ═══════════════════════════════════════════════════════════════════════════
# ENDPOINT: /pop_inspect
# ═══════════════════════════════════════════════════════════════════════════

def pop_inspect(params):
    """Read POP operator data: points, attributes."""
    path = params.get("path", "")
    t = op(path)
    if t is None:
        return {"success": False, "error": "Not found"}

    info = {"path": t.path, "name": t.name, "type": t.OPType}
    for attr_name in ["numPoints", "numPrims", "numVerts"]:
        try:
            info[attr_name] = int(getattr(t, attr_name))
        except:
            pass
    try:
        attrs = []
        for a in t.attribs:
            attrs.append({
                "name": str(a.name),
                "type": str(a.type),
                "size": int(a.size),
                "scope": str(a.scope),
            })
        info["attributes"] = attrs
    except Exception as e:
        info["attributes_error"] = str(e)
    return {"success": True, "data": info}


# ═══════════════════════════════════════════════════════════════════════════
# ENDPOINT: /get_node_detail
# ═══════════════════════════════════════════════════════════════════════════

def get_node_detail(params):
    """Detailed operator info: parameters, inputs, children."""
    path = params.get("path", "")
    recurse = params.get("recurse", False)
    t = op(path)
    if t is None:
        return {"success": False, "error": "Not found"}

    def desc(n, d=0):
        if n is None or d > 10:
            return None
        i = {"path": n.path, "name": n.name, "type": n.OPType}
        try:
            i["pars"] = [
                {
                    "name": p.name,
                    "label": p.label,
                    "val": p.val,
                    "mode": str(p.mode),
                    "expr": p.expr,
                    "default": p.default,
                    "style": p.style,
                }
                for p in n.pars()
            ]
        except:
            pass
        try:
            i["inputs"] = [
                {"index": idx, "op": c.op.name if c.op else None}
                for idx, c in enumerate(n.inputConnectors)
            ]
        except:
            pass
        try:
            i["viewer"] = n.viewer
        except:
            pass
        if recurse:
            try:
                i["children"] = [desc(c, d + 1) for c in n.children if c]
            except:
                pass
        return i

    return {"success": True, "data": desc(t)}


# ═══════════════════════════════════════════════════════════════════════════
# Dispatcher
# ═══════════════════════════════════════════════════════════════════════════

_HANDLERS = {
    "auto_layout": auto_layout,
    "glsl_reload": glsl_reload,
    "glsl_update": glsl_update,
    "smart_connect": smart_connect,
    "pop_inspect": pop_inspect,
    "get_node_detail": get_node_detail,
}


def endpoint_call(name, params=None):
    """Call an endpoint by name with params dict.
    
    Usage from TD /exec:
        exec(compile(open("toe/endpoint_fix.py").read(), "fix", "exec"))
        result = endpoint_call("auto_layout", {"path": "/project1"})
        print(json.dumps(result))
    """
    if params is None:
        params = {}
    handler = _HANDLERS.get(name)
    if handler is None:
        return {"success": False, "error": f"Unknown endpoint: {name}"}
    try:
        return handler(params)
    except Exception as e:
        return {"success": False, "error": str(e), "traceback": traceback.format_exc()}
