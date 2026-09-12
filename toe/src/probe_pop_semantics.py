# -*- coding: utf-8 -*-
"""¿numPoints es el atributo correcto? Prueba limpia: un boxPOP recién creado."""
import json
import urllib.request

CODE = '''
import json
# 1) atributos que expone la clase POP
props = [a for a in dir(td.boxPOP) if any(k in a.lower() for k in ("point", "vertex", "prim", "attrib"))]
print("ATRIBUTOS_POP:", json.dumps(props[:40]))

# 2) boxPOP limpio en /project1
base = op("/project1")
if base.op("hermes_probe_pop"):
    base.op("hermes_probe_pop").destroy()
probe = base.create(td.boxPOP, "hermes_probe_pop")
res = {"tipo": probe.OPType, "errores": probe.errors()}
for attr in ("numPoints", "numVertices", "numPrims", "numAllPoints", "pointCount"):
    try:
        res[attr] = int(eval("probe." + attr))
    except Exception as e:
        res[attr] = "ERR: " + str(e)[:60]
res["display"] = bool(probe.display)
res["render"] = bool(probe.render)
print("PROBE:", json.dumps(res, ensure_ascii=False))

# 3) ¿y el boxPOP que ya está dentro de la red de test?
t = op("/project1/pop_networks_live/basic_chain/box1")
if t:
    r2 = {"tipo": t.OPType, "errores": t.errors(), "display": bool(t.display), "render": bool(t.render)}
    for attr in ("numPoints", "numVertices", "numPrims"):
        try:
            r2[attr] = int(eval("t." + attr))
        except Exception as e:
            r2[attr] = "ERR: " + str(e)[:60]
    try:
        r2["pars_conocidos"] = [p.name for p in t.pars()][:14]
    except Exception as e:
        r2["pars_conocidos"] = "ERR " + str(e)[:60]
    print("TEST_BOX:", json.dumps(r2, ensure_ascii=False))

# 4) forzar cook explícito
try:
    probe.cook(force=True)
    print("TRAS COOK:", int(probe.numPoints))
except Exception as e:
    print("COOK ERR:", str(e)[:100])
'''

data = json.dumps({"code": CODE}).encode("utf-8")
req = urllib.request.Request("http://localhost:44444/exec", data=data,
                             headers={"Content-Type": "application/json"})
with urllib.request.urlopen(req, timeout=60) as fh:
    out = json.load(fh)
print(out.get("output", out)[:2500])
