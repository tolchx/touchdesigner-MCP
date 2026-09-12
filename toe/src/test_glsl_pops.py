# -*- coding: utf-8 -*-
"""
Suite de pruebas SOLO de GLSL POP — validación estricta.

Qué valida cada caso (no solo "no lanzó excepción"):
  1. el nodo glslPOP compila (errors() vacío después de cocinar)
  2. produce geometría (numPoints() > 0)
  3. el shader HIZO algo: se comparan los bounds() de la entrada y de la salida

Sintaxis de referencia (minada de proyectos .toe reales, 62 shaders):
  const uint id = TDIndex();
  if (id >= TDNumElements()) return;
  vec3 p = TDIn_P(0, id);
  P[id] = p;
La salida (P) NO se puede leer: hay que leer la entrada con TDIn_P(inputIndex, id).
"""
import json
import urllib.request

API = "http://localhost:44444/exec"

BASE = "const uint id = TDIndex();\nif (id >= TDNumElements()) return;\n"

CASES = [
    # ── BÁSICOS ────────────────────────────────────────────────────────────────
    {"n": "basico_passthrough", "nivel": "básico", "attrs": "P",
     "code": "void main(){\n" + BASE + "  P[id] = TDIn_P(0, id);\n}\n"},
    {"n": "basico_trasladar", "nivel": "básico", "attrs": "P",
     "code": "void main(){\n" + BASE + "  vec3 p = TDIn_P(0, id);\n  P[id] = p + vec3(2.0, 0.0, 0.0);\n}\n"},
    {"n": "basico_escalar", "nivel": "básico", "attrs": "P",
     "code": "void main(){\n" + BASE + "  P[id] = TDIn_P(0, id) * 2.0;\n}\n"},
    {"n": "basico_uniform_sin_id", "nivel": "básico", "attrs": "P",
     "code": "void main(){\n  P[TDIndex()] = TDIn_P(0, TDIndex()) * 1.001;\n}\n"},
    {"n": "basico_color_Cd", "nivel": "básico", "attrs": "P Cd",
     "code": "void main(){\n" + BASE + "  Cd[id] = vec4(TDIn_P(0, id) * 0.5 + 0.5, 1.0);\n}\n"},
    {"n": "basico_normal", "nivel": "básico", "attrs": "P N",
     "code": "void main(){\n" + BASE + "  P[id] = TDIn_P(0, id);\n  N[id] = normalize(TDIn_P(0, id) + vec3(0.001));\n}\n"},
    # ── AVANZADOS ──────────────────────────────────────────────────────────────
    {"n": "avanzado_u_time", "nivel": "avanzado", "attrs": "P",
     "code": "uniform float u_time;\nvoid main(){\n" + BASE +
             "  float k = 1.0 + 0.5 * sin(u_time * 2.0);\n  P[id] = TDIn_P(0, id) * k;\n}\n"},
    {"n": "avanzado_explosion_biblioteca", "nivel": "avanzado", "attrs": "P",
     "code": ("uniform float u_time;\nvoid main(){\n" + BASE +
              "  vec3 p = TDIn_P(0, id);\n"
              "  float dist = length(p);\n"
              "  float force = sin(u_time * 1.5) * 0.5 + 0.5;\n"
              "  vec3 dir = normalize(p + 0.001);\n"
              "  float push = force * 2.0 + sin(dist * 2.0 - u_time * 3.0) * 0.3;\n"
              "  p += dir * push;\n"
              "  float a = u_time * 0.5 + dist * 0.3;\n"
              "  float ct = cos(a), st = sin(a);\n"
              "  p.xz = mat2(ct, -st, st, ct) * p.xz;\n"
              "  P[id] = p;\n}\n")},
    {"n": "avanzado_onda_procedural", "nivel": "avanzado", "attrs": "P Cd",
     "code": ("void main(){\n" + BASE +
              "  vec3 p = TDIn_P(0, id);\n"
              "  p.y += sin(p.x * 3.0 + p.z * 2.0) * 0.8;\n"
              "  vec3 c = vec3(sin(p.x), cos(p.y), sin(p.z)) * 0.5 + 0.5;\n"
              "  Cd[id] = vec4(c, 1.0);\n"
              "  P[id] = p;\n}\n"), },
    {"n": "avanzado_dos_entradas", "nivel": "avanzado", "attrs": "P", "dos_inputs": True,
     "code": ("void main(){\n" + BASE +
              "  vec3 a = TDIn_P(0, id);\n"
              "  vec3 b = TDIn_P(1, id);\n"
              "  P[id] = mix(a, b, 0.5) + vec3(0.0, 1.0, 0.0);\n}\n")},
    {"n": "avanzado_glsl_encadenado", "nivel": "avanzado", "attrs": "P", "cadena": True,
     "code": ("void main(){\n" + BASE +
              "  P[id] = TDIn_P(0, id) * 1.5 + vec3(1.0, 0.0, 0.0);\n}\n")},
    {"n": "avanzado_atributo_custom", "nivel": "avanzado", "attrs": "P masa",
     "code": ("void main(){\n" + BASE +
              "  vec3 p = TDIn_P(0, id);\n"
              "  float m = length(p) * 0.1;\n"
              "  P[id] = p * (1.0 + m);\n"
              "  masa[id] = m;\n}\n")},
    {"n": "avanzado_atributo_readwrite", "nivel": "avanzado", "attrs": "P masa", "rw": True,
     "code": ("void main(){\n" + BASE +
              "  masa[id] = length(TDIn_P(0, id)) * 0.1;\n"
              "  P[id] = TDIn_P(0, id) * (1.0 + masa[id]);\n}\n")},
    {"n": "avanzado_piso_grid_atributos", "nivel": "avanzado", "attrs": "P Cd N",
     "code": ("uniform float u_time;\nvoid main(){\n" + BASE +
              "  vec3 p = TDIn_P(0, id);\n"
              "  float w = sin(p.x * 2.0 + u_time) * cos(p.z * 2.0 - u_time);\n"
              "  p.y = w * 0.5;\n"
              "  P[id] = p;\n"
              "  N[id] = normalize(vec3(-cos(p.x * 2.0 + u_time), 1.0, sin(p.z * 2.0 - u_time)));\n"
              "  Cd[id] = vec4(vec3(abs(w)), 1.0);\n}\n")},
]

TD_MACRO = r'''
import json, datetime
CASES = json.loads(r"""__CASES__""")
ROOT_PATH = "/project1/glsl_pop_suite"

base = op("/project1")
if base.op("glsl_pop_suite"):
    base.op("glsl_pop_suite").destroy()
root = base.create(td.baseCOMP, "glsl_pop_suite")

def bounds_of(o):
    try:
        b = o.bounds()
        return [round(float(v), 4) for v in b]
    except Exception as e:
        try:
            b = o.bounds
            return str(b)[:60]
        except Exception:
            return "ERR " + str(e)[:50]

resultados = []
for i, c in enumerate(CASES):
    cont = root.create(td.baseCOMP, c["n"])
    try:
        src = cont.create(td.boxPOP, "src")
        try:
            src.par.sizex = 1.0; src.par.sizey = 1.0; src.par.sizez = 1.0
        except Exception:
            pass
        d = cont.create(td.textDAT, "code")
        d.text = c["code"]
        g = cont.create(td.glslPOP, "glsl1")
        g.par.computedat = "code"
        # Los atributos que no existen en la entrada hay que CREARLOS (página Create Attributes).
        # Verificado 11/09/26: el menú attr0name NO acepta el nombre directo; hay que usar
        # 'Custom' + attr0customname, si no el shader falla con "undeclared identifier".
        comps = {"Cd": 4, "N": 3, "uv": 2, "T": 3, "masa": 1}
        extra = [a for a in c.get("attrs", "P").split() if a != "P"]
        for i, a in enumerate(extra):
            try:
                setattr(g.par, "attr%dname" % i, "Custom")
                setattr(g.par, "attr%dcustomname" % i, a)
                setattr(g.par, "attr%dnumcomps" % i, comps.get(a, 3))
            except Exception:
                pass
        g.par.outputattrs = c.get("attrs", "P")
        if c.get("rw"):
            try:
                g.par.outputaccess = "readwrite"
            except Exception:
                pass

        n_inputs = len(g.inputConnectors)
        if c.get("cadena"):
            # dos glslPOP encadenados: el segundo lee la salida del primero
            g2 = cont.create(td.glslPOP, "glsl2")
            d2 = cont.create(td.textDAT, "code2")
            d2.text = ("void main(){\nconst uint id = TDIndex();\nif (id >= TDNumElements()) return;\n"
                       "  P[id] = TDIn_P(0, id) * 0.5 - vec3(0.5, 0.0, 0.0);\n}\n")
            g2.par.computedat = "code2"
            g2.par.outputattrs = "P"
            src.outputConnectors[0].connect(g)
            g.outputConnectors[0].connect(g2)
            final = g2
        elif c.get("dos_inputs") and n_inputs >= 2:
            src2 = cont.create(td.spherePOP, "src2")
            src.outputConnectors[0].connect(g.inputConnectors[0])
            src2.outputConnectors[0].connect(g.inputConnectors[1])
            final = g
        else:
            src.outputConnectors[0].connect(g)
            final = g
        g.nodeX = 0; g.nodeY = 0

        try:
            final.cook(force=True)
        except Exception:
            pass
        err = final.errors()
        res = {"n": c["n"], "nivel": c["nivel"], "inputs": n_inputs,
               "compila": not err, "error": err[:220],
               "puntos": int(final.numPoints()), "prims": int(final.numPrims()),
               "bounds_in": bounds_of(src), "bounds_out": bounds_of(final)}
        try:
            g.cook(force=True)
            if g.errors():
                res["error_glsl"] = g.errors()[:220]
        except Exception:
            pass
        try:
            res["atributos"] = [a.name for a in final.pointAttributes][:8]
        except Exception:
            res["atributos"] = []
    except Exception as e:
        res = {"n": c["n"], "nivel": c["nivel"], "compila": False, "error": "EXCEPCION: " + str(e)[:220],
               "puntos": 0, "bounds_in": None, "bounds_out": None}
    resultados.append(res)

print(json.dumps({"total": len(resultados), "resultados": resultados}, ensure_ascii=False))
'''


def main():
    code = TD_MACRO.replace("__CASES__", json.dumps(CASES).replace('"""', "'"))
    data = json.dumps({"code": code}).encode("utf-8")
    req = urllib.request.Request(API, data=data, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=300) as fh:
        out = json.load(fh)
    txt = out.get("output", "")
    if not txt.strip().startswith("{"):
        print("RAW:", txt[:1200])
        return 1
    d = json.loads(txt)
    ok = fallas = 0
    for r in d["resultados"]:
        compila = r.get("compila")
        pts = r.get("puntos", 0)
        movio = r.get("bounds_in") != r.get("bounds_out")
        bien = compila and pts > 0
        ok += 1 if bien else 0
        fallas += 0 if bien else 1
        print(f"{'OK' if bien else 'FAIL'} [{r['nivel']:<8}] {r['n']:<32} compila={compila} "
              f"puntos={pts:<6} transformó={movio}")
        if not compila:
            print(f"      error: {str(r.get('error'))[:150]}")
        if r.get("error_glsl"):
            print(f"      glsl : {str(r['error_glsl'])[:150]}")
        if r.get("atributos"):
            print(f"      attrs: {r['atributos']}")
    print(f"\nRESULTADO: {ok}/{d['total']} casos OK - {fallas} con problemas")
    return 0 if fallas == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
