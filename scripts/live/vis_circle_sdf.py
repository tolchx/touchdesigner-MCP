import json
res = {"recipe": "top-circle-sdf", "errors": [], "created": [], "pixels": {}, "feedback": None}
try:
    parent = op("/project1")
    if parent is None:
        raise RuntimeError("parent not found: /project1")

    def _set_par(node, pname, val):
        try:
            setattr(node.par, pname, val)
        except Exception as _e:
            res["errors"].append(str(pname) + ": " + str(_e)[:120])

    code = parent.create(td.textDAT, "vis_circle_sdf_code")
    code.text = "layout(location = 0) out vec4 fragColor;\n\nuniform float u_radius;      // const0name='u_radius', const0value=0.42\n\nvoid main() {\n    vec2 p = vUV.st - 0.5;\n    float d = length(p);\n    float c = smoothstep(u_radius, u_radius - 0.02, d);\n    fragColor = vec4(vec3(c), 1.0);\n}\n"
    res["created"].append(code.path)

    g = parent.create(td.glslTOP, "vis_circle_sdf")
    g.par.pixeldat = code.name
    g.par.outputresolution = "custom"
    g.par.resolutionw = 256
    g.par.resolutionh = 256
    _set_par(g, "const0name", "u_radius")
    _set_par(g, "const0value", 0.42)
    g.nodeX = -400
    g.nodeY = 400
    res["created"].append(g.path)

    g.cook(force=True)

    res["td_errors"] = g.errors()
    res["res"] = [g.width, g.height]
    try:
        info = parent.op(g.name + "_info")
        res["infoDAT_has_ERROR"] = bool(info and "ERROR" in info.text)
    except Exception:
        res["infoDAT_has_ERROR"] = None
    try:
        arr = g.numpyArray()
        h = arr.shape[0]; w = arr.shape[1]
        res["pixels"] = {
            "center": [round(float(v), 4) for v in arr[h // 2][w // 2][:3]],
            "corner": [round(float(v), 4) for v in arr[4][4][:3]],
            "right_edge_mid": [round(float(v), 4) for v in arr[h // 2][w - 2][:3]],
            "min": round(float(arr.min()), 4),
            "max": round(float(arr.max()), 4),
        }
    except Exception as _ne:
        res["errors"].append("numpy: " + str(_ne)[:120])
except Exception as _e:
    res["errors"].append("fatal: " + str(_e)[:200])
print(json.dumps(res))
