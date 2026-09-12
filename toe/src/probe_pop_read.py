# -*- coding: utf-8 -*-
"""¿Cómo se leen los puntos de un POP desde Python de TD? (para validar de verdad)"""
import json
import urllib.request

CODE = r'''
import json
p = op("/project1/hermes_probe_pop")
out = {}
if not p:
    base = op("/project1")
    p = base.create(td.boxPOP, "hermes_probe_pop")
out["numPoints"] = int(p.numPoints())
out["attrs_lectura"] = [a for a in dir(p) if a in ("points", "pointItr", "pointAttributes", "bounds", "min", "max")]
# probar distintas formas de leer un punto
pruebas = {}
try:
    pts = p.points
    pruebas["points tipo"] = str(type(pts))
    pruebas["len(points)"] = len(pts)
    pt0 = pts[0]
    pruebas["point[0] tipo"] = str(type(pt0))
    pruebas["point[0] dir"] = [a for a in dir(pt0) if not a.startswith("_")][:14]
    for attr in ("P", "pos", "position", "x", "y", "z"):
        try:
            pruebas["pt0." + attr] = str(eval("pt0." + attr))
        except Exception as e:
            pruebas["pt0." + attr] = "ERR " + str(e)[:40]
except Exception as e:
    pruebas["points"] = "ERR " + str(e)[:80]
# ¿hay bbox?
for attr in ("bounds", "min", "max"):
    try:
        pruebas["p." + attr] = str(eval("p." + attr))
    except Exception as e:
        pruebas["p." + attr] = "ERR " + str(e)[:40]
out["pruebas"] = pruebas
print(json.dumps(out, ensure_ascii=False, default=str))
'''

data = json.dumps({"code": CODE}).encode("utf-8")
req = urllib.request.Request("http://localhost:44444/exec", data=data,
                             headers={"Content-Type": "application/json"})
with urllib.request.urlopen(req, timeout=90) as fh:
    print(json.load(fh).get("output", "")[:2000])
