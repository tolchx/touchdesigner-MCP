# -*- coding: utf-8 -*-
"""Aísla por qué fallan los shaders que escriben Cd/N y busca el log de compilación."""
import json
import urllib.request

CODE = r'''
import json
cont = op("/project1/glsl_pop_suite/basico_color_Cd")
out = {}
# 1) ¿TD dejó algún DAT con el log de compilación?
out["hijos"] = [(c.name, c.OPType) for c in cont.children]
for c in cont.children:
    if c.family == "DAT" and c.name != "code":
        out["log_dat"] = {"nombre": c.name, "texto": c.text[:600]}
# 2) ¿la op expone el log?
g = cont.op("glsl1")
for attr in ("errors", "warnings", "info", "compileerrors"):
    try:
        v = eval("g." + attr)
        out["g." + attr] = str(v() if callable(v) else v)[:300]
    except Exception as e:
        pass
out["pars_glsl"] = [p.name for p in g.pars()][:22]

# 3) bisect: mismo shader mínimo probando cada atributo por separado
base = op("/project1")
if base.op("glsl_attr_probe"):
    base.op("glsl_attr_probe").destroy()
probe = base.create(td.baseCOMP, "glsl_attr_probe")
src = probe.create(td.boxPOP, "src")
ID = "const uint id = TDIndex();\nif (id >= TDNumElements()) return;\n"
variantes = {
    "solo_P":           ("P",      "void main(){\n" + ID + "  P[id] = TDIn_P(0, id);\n}\n"),
    "solo_Cd":          ("P Cd",   "void main(){\n" + ID + "  Cd[id] = vec4(1.0, 0.0, 0.0, 1.0);\n}\n"),
    "P_y_Cd":           ("P Cd",   "void main(){\n" + ID + "  P[id] = TDIn_P(0, id);\n  Cd[id] = vec4(1.0, 0.0, 0.0, 1.0);\n}\n"),
    "Cd_desde_vec3":    ("P Cd",   "void main(){\n" + ID + "  vec3 c = TDIn_P(0, id) * 0.5 + 0.5;\n  Cd[id] = vec4(c, 1.0);\n}\n"),
    "solo_N":           ("P N",    "void main(){\n" + ID + "  N[id] = vec3(0.0, 1.0, 0.0);\n}\n"),
    "N_desde_normalize":("P N",    "void main(){\n" + ID + "  P[id] = TDIn_P(0, id);\n  N[id] = normalize(vec3(TDIn_P(0, id)));\n}\n"),
}
res = {}
for nombre, (attrs, codigo) in variantes.items():
    d = probe.create(td.textDAT, "code_" + nombre)
    d.text = codigo
    g = probe.create(td.glslPOP, "glsl_" + nombre)
    g.par.computedat = d.name
    g.par.outputattrs = attrs
    src.outputConnectors[0].connect(g)
    try:
        g.cook(force=True)
    except Exception:
        pass
    res[nombre] = {"attrs_pedidos": attrs, "compila": not g.errors(), "error": g.errors()[:120]}
out["variantes"] = res
print(json.dumps(out, ensure_ascii=False, default=str))
'''

data = json.dumps({"code": CODE}).encode("utf-8")
req = urllib.request.Request("http://localhost:44444/exec", data=data,
                             headers={"Content-Type": "application/json"})
with urllib.request.urlopen(req, timeout=180) as fh:
    d = json.loads(json.load(fh).get("output", "{}") or "{}")
print("hijos del contenedor:", d.get("hijos"))
print("log DAT:", json.dumps(d.get("log_dat"), ensure_ascii=False)[:400])
print("pars del glslPOP:", d.get("pars_glsl"))
print("\n=== bisect de atributos ===")
for k, v in (d.get("variantes") or {}).items():
    print(f"  {'✔' if v['compila'] else '✘'} {k:<20} attrs='{v['attrs_pedidos']}' {v['error'][:90]}")
