# -*- coding: utf-8 -*-
"""Auditoría REAL (corregida): numPoints() es método en la clase POP de TD."""
import json
import urllib.request

CODE = '''
import json
res = []
root = op("/project1/pop_networks_live")

def contar(p):
    d = {"op": p.name, "tipo": p.OPType, "err": len(p.errors())}
    for attr in ("numPoints", "numPrims"):
        try:
            d[attr] = int(eval("p." + attr + "()"))
        except Exception as e:
            d[attr] = "ERR:" + str(e)[:40]
    try:
        d["attrs"] = [a.name for a in p.pointAttributes][:6]
    except Exception:
        d["attrs"] = []
    return d

for cont in root.children:
    pops = [c for c in cont.children if c.family == "POP"]
    det = [contar(p) for p in pops]
    pts = sum(x["numPoints"] for x in det if isinstance(x["numPoints"], int))
    prims = sum(x["numPrims"] for x in det if isinstance(x["numPrims"], int))
    salidas = [x for x in det if isinstance(x["numPoints"], int) and x["numPoints"] > 0]
    res.append({"red": cont.name, "pops": len(pops), "puntos_totales": pts, "prims_totales": prims,
                "pops_con_geometria": len(salidas), "errores": sum(x["err"] for x in det), "detalle": det})

# probe limpio
base = op("/project1")
p2 = base.op("hermes_probe_pop")
extra = None
if p2:
    extra = {"numPoints": int(p2.numPoints()), "numPrims": int(p2.numPrims())}

print(json.dumps({"redes": res, "probe_boxPOP": extra}, ensure_ascii=False))
'''

data = json.dumps({"code": CODE}).encode("utf-8")
req = urllib.request.Request("http://localhost:44444/exec", data=data,
                             headers={"Content-Type": "application/json"})
with urllib.request.urlopen(req, timeout=120) as fh:
    out = json.load(fh)
txt = out.get("output", "")
if not txt.strip().startswith("{"):
    print("RAW:", txt[:900])
    raise SystemExit(1)
d = json.loads(txt)
print("probe boxPOP limpio:", d["probe_boxPOP"])
print()
for r in d["redes"]:
    ok = r["puntos_totales"] > 0 and r["errores"] == 0
    print(f"{'OK  ' if ok else '⚠️  '}{r['red']:<22} pops={r['pops']:<3} puntos={r['puntos_totales']:<7} "
          f"prims={r['prims_totales']:<7} con_geo={r['pops_con_geometria']}/{r['pops']} err={r['errores']}")
print("\n=== POPs sin geometría (los sospechosos) ===")
for r in d["redes"]:
    vacios = [f"{x['op']}({x['tipo']})" for x in r["detalle"]
              if isinstance(x["numPoints"], int) and x["numPoints"] == 0]
    if vacios:
        print(f"  {r['red']}: {vacios}")
