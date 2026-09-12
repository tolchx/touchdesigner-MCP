# -*- coding: utf-8 -*-
"""¿Por qué falla el shader? Prueba A/B del código GLSL en vivo."""
import json
import urllib.request

CODE = r'''
import json
g = op("/project1/pop_networks_live4/glsl_shader/glsl1")
d = op("/project1/pop_networks_live4/glsl_shader/shader_code")
res = {}

def prueba(nombre, codigo):
    d.text = codigo
    try:
        g.cook(force=True)
    except Exception:
        pass
    res[nombre] = {"errores": g.errors()[:160], "puntos": int(g.numPoints())}

# A) el shader actual del test (escribe y lee P)
prueba("actual (P x 1.001)", "void main(){\n  P[TDIndex()] = P[TDIndex()] * 1.001;\n}\n")

# B) leyendo la ENTRADA con TDIn_P (lo que dice AGENTS.md)
prueba("TDIn_P(0,i) x 1.001", "void main(){\n  P[TDIndex()] = TDIn_P(0, TDIndex()) * 1.001;\n}\n")

# C) desplazamiento real sobre la entrada
prueba("offset en X sobre TDIn_P", "void main(){\n  int i = TDIndex();\n  vec3 p = TDIn_P(0, i);\n  P[i] = vec4(p.x + 0.5, p.y, p.z, 1.0);\n}\n")

print(json.dumps(res, ensure_ascii=False))
'''

data = json.dumps({"code": CODE}).encode("utf-8")
req = urllib.request.Request("http://localhost:44444/exec", data=data,
                             headers={"Content-Type": "application/json"})
with urllib.request.urlopen(req, timeout=90) as fh:
    out = json.load(fh)
txt = out.get("output", "")
if not txt.strip().startswith("{"):
    print("RAW:", txt[:900])
    raise SystemExit(1)
for k, v in json.loads(txt).items():
    estado = "COMPILA ✔" if not v["errores"] else "FALLA ✘"
    print(f"{estado}  {k:<26} puntos={v['puntos']:<5} {v['errores'][:90]}")
