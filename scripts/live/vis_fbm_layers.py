import json
res = {"recipe": "top-fbm-layers", "errors": [], "created": [], "pixels": {}, "feedback": None}
try:
    parent = op("/project1")
    if parent is None:
        raise RuntimeError("parent not found: /project1")

    def _set_par(node, pname, val):
        try:
            setattr(node.par, pname, val)
        except Exception as _e:
            res["errors"].append(str(pname) + ": " + str(_e)[:120])

    code = parent.create(td.textDAT, "vis_fbm_layers_code")
    code.text = "layout(location = 0) out vec4 fragColor;\n\nuniform float u_time;\nuniform float u_scale;\n\nfloat hash(vec2 p) {\n    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);\n}\n\nfloat noise(vec2 p) {\n    vec2 i = floor(p);\n    vec2 f = fract(p);\n    vec2 u = f * f * (3.0 - 2.0 * f);\n    return mix(\n        mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),\n        mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),\n        u.y\n    );\n}\n\nfloat fbm(vec2 p) {\n    float v = 0.0;\n    float a = 0.5;\n    for (int i = 0; i < 4; i++) {\n        v += a * noise(p);\n        p *= 2.02;\n        a *= 0.5;\n    }\n    return v;\n}\n\nvoid main() {\n    vec2 q = vec2(fbm(vUV.st * u_scale + u_time),\n                  fbm(vUV.st * u_scale + 5.2));\n    float f = fbm(vUV.st * u_scale + 2.0 * q);\n    fragColor = vec4(vec3(f), 1.0);\n}\n"
    res["created"].append(code.path)

    g = parent.create(td.glslTOP, "vis_fbm_layers")
    g.par.pixeldat = code.name
    g.par.outputresolution = "custom"
    g.par.resolutionw = 256
    g.par.resolutionh = 256
    _set_par(g, "vec0name", "u_time")
    _set_par(g, "vec0valuex", 0)
    _set_par(g, "const0name", "u_scale")
    _set_par(g, "const0value", 3)
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
