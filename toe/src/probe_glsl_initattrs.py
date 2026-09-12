# -*- coding: utf-8 -*-
"""
¿Cómo se declaran los atributos de salida (Cd, N) en un glslPOP?
Hipótesis: hace falta `initoutputattrs` (inicializar) además de `outputattrs`.
"""
import json
import urllib.request

CODE = r'''
import json
base = op("/project1")
if base.op("glsl_init_probe"):
    base.op("glsl_init_probe").destroy()
probe = base.create(td.baseCOMP, "glsl_init_probe")
src = probe.create(td.boxPOP, "src")
ID = "const uint id = TDIndex();\nif (id >= TDNumElements()) return;\n"

variantes = {
    "A_out_PCd":              {"out": "P Cd",     "init": "",         "cod": "Cd[id] = vec4(1.0, 0.0, 0.0, 1.0);\n  P[id] = TDIn_P(0, id);"},
    "B_out_PCd_init_PCd":     {"out": "P Cd",     "init": "P Cd",     "cod": "Cd[id] = vec4(1.0, 0.0, 0.0, 1.0);\n  P[id] = TDIn_P(0, id);"},
    "C_out_PCd_init_Cd":      {"out": "P Cd",     "init": "Cd",       "cod": "Cd[id] = vec4(1.0, 0.0, 0.0, 1.0);\n  P[id] = TDIn_P(0, id);"},
    "D_out_PN_init_PN":       {"out": "P N",      "init": "P N",      "cod": "P[id] = TDIn_P(0, id);\n  N[id] = vec3(0.0, 1.0, 0.0);"},
    "E_out_PNiCd_init_todo":  {"out": "P N Cd",   "init": "P N Cd",   "cod": "P[id] = TDIn_P(0, id);\n  N[id] = vec3(0.0, 1.0, 0.0);\n  Cd[id] = vec4(1.0, 0.5, 0.0, 1.0);"},
}
res = {}
for nombre, cfg in variantes.items():
    d = probe.create(td.textDAT, "code_" + nombre)
    d.text = "void main(){\n" + ID + "  " + cfg["cod"] + "\n}\n"
    g = probe.create(td.glslPOP, "glsl_" + nombre)
    g.par.computedat = d.name
    try:
        g.par.outputattrs = cfg["out"]
    except Exception as e:
        res[nombre] = {"error_set_outputattrs": str(e)[:80]}
        continue
    if cfg["init"]:
        try:
            g.par.initoutputattrs = cfg["init"]
        except Exception as e:
            res[nombre] = {"error_set_init": str(e)[:90]}
            continue
    src.outputConnectors[0].connect(g)
    try:
        g.cook(force=True)
    except Exception:
        pass
    log = ""
    info = probe.op("glsl_" + nombre + "_info")
    if info:
        log = info.text.replace("\n", " ")[:200]
    res[nombre] = {"out": cfg["out"], "init": cfg["init"], "compila": not g.errors(),
                   "error": g.errors()[:100], "log": log,
                   "attrs": [a.name for a in g.pointAttributes][:8] if not g.errors() else []}
print(json.dumps(res, ensure_ascii=False, default=str))
'''

data = json.dumps({"code": CODE}).encode("utf-8")
req = urllib.request.Request("http://localhost:44444/exec", data=data,
                             headers={"Content-Type": "application/json"})
with urllib.request.urlopen(req, timeout=240) as fh:
    d = json.loads(json.load(fh).get("output", "{}") or "{}")
for k, v in d.items():
    print(f"{'✔' if v.get('compila') else '✘'} {k:<24} out='{v.get('out')}' init='{v.get('init')}'")
    if not v.get("compila"):
        print(f"      {v.get('error') or v.get('log') or v.get('error_set_outputattrs') or v.get('error_set_init')}")
    elif v.get("attrs"):
        print(f"      attrs de salida: {v['attrs']}")
