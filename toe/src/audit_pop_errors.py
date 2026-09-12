# -*- coding: utf-8 -*-
"""¿Qué dicen los errores reales y por qué /verify no los ve?"""
import json
import urllib.request

CODE = '''
import json
out = {"errores": [], "verify_probe": {}}
root = op("/project1/pop_networks_live")
for cont in root.children:
    for ch in cont.children:
        e = ch.errors()
        if e:
            out["errores"].append({"nodo": cont.name + "/" + ch.name, "tipo": ch.OPType,
                                   "msg": e[:220]})
# ¿/verify ve los errores del contenedor?
try:
    e_cont = root.errors()
    out["verify_probe"]["errores_propios_del_root"] = e_cont[:200]
except Exception as ex:
    out["verify_probe"]["err"] = str(ex)[:100]
# ¿y de un hijo?
try:
    sub = root.op("particles_solver")
    out["verify_probe"]["errores_del_contenedor_particles"] = sub.errors()[:200] if sub else None
except Exception as ex:
    out["verify_probe"]["err2"] = str(ex)[:100]
print(json.dumps(out, ensure_ascii=False))
'''

data = json.dumps({"code": CODE}).encode("utf-8")
req = urllib.request.Request("http://localhost:44444/exec", data=data,
                             headers={"Content-Type": "application/json"})
with urllib.request.urlopen(req, timeout=90) as fh:
    out = json.load(fh)
txt = out.get("output", "")
if not txt.strip().startswith("{"):
    print("RAW:", txt[:800])
    raise SystemExit(1)
d = json.loads(txt)
print("=== errores reales por nodo (primeros 14) ===")
for e in d["errores"][:14]:
    print(f"  {e['nodo']:<38} [{e['tipo']}] {e['msg'][:120]}")
print(f"\ntotal nodos con error: {len(d['errores'])}")
print("\n=== por qué /verify dice healthy ===")
for k, v in d["verify_probe"].items():
    print(f"  {k}: {str(v)[:170]}")
