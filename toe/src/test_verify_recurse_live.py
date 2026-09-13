# -*- coding: utf-8 -*-
"""
Prueba DEFINITIVA de la tarea 11: /verify debe detectar un error DENTRO de un contenedor.
Antes del fix devolvía healthy=true con error_count=0 (falso OK).
"""
import json
import urllib.request

API = "http://localhost:44444"

# 1) crear a propósito un contenedor con un nodo roto (glslPOP con shader inválido)
SETUP = r'''
import json
base = op("/project1")
if base.op("verify_recurse_test"):
    base.op("verify_recurse_test").destroy()
c = base.create(td.baseCOMP, "verify_recurse_test")
sub = c.create(td.baseCOMP, "anidado")          # un nivel más adentro
src = sub.create(td.boxPOP, "src")
d = sub.create(td.textDAT, "code")
d.text = "void main(){ P[TDIndex()] = P[TDIndex()] * 2.0; }\n"   # lee la salida -> no compila
g = sub.create(td.glslPOP, "glsl_roto")
g.par.computedat = "code"
g.par.outputattrs = "P"
src.outputConnectors[0].connect(g)
try:
    g.cook(force=True)
except Exception:
    pass
print(json.dumps({"error_del_nodo": g.errors()[:120]}))
'''


def post(path, payload):
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(API + path, data=data, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=120) as fh:
        return fh.read().decode("utf-8", "replace")


def get(path):
    with urllib.request.urlopen(API + path, timeout=120) as fh:
        return fh.read().decode("utf-8", "replace")


print("1) preparando un contenedor con un error adentro...")
print("   ", post("/exec", {"code": SETUP})[:200])

print("\n2) /verify RECURSIVO (path del contenedor padre):")
raw = get("/verify?path=/project1/verify_recurse_test")
print("   ", raw[:700])

print("\n3) /verify SIN recursión (recurse=false):")
try:
    raw2 = get("/verify?path=/project1/verify_recurse_test&recurse=false")
    print("   ", raw2[:400])
except Exception as exc:  # noqa: BLE001
    print("    (no soporta recurse=false o dio error:", str(exc)[:80], ")")

print("\n4) limpieza")
print("   ", post("/exec", {"code": "op('/project1/verify_recurse_test').destroy()\nprint('borrado')"} )[:100])
