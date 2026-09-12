# -*- coding: utf-8 -*-
"""
Cómo se declaran Cd/N en un glslPOP (wiki oficial):
  - "Output Attributes" solo SELECCIONA atributos que YA EXISTEN en la entrada.
  - Para atributos nuevos hay que usar la página "Create Attributes" (attr0name, attr0type,
    attr0numcomps...) o crearlos aguas arriba con un attributePOP.
Probamos las dos vías.
"""
import json
import urllib.request

CODE = r'''
import json
base = op("/project1")
if base.op("glsl_create_probe"):
    base.op("glsl_create_probe").destroy()
probe = base.create(td.baseCOMP, "glsl_create_probe")
src = probe.create(td.boxPOP, "src")
ID = "const uint id = TDIndex();\nif (id >= TDNumElements()) return;\n"
COD_CD = ("void main(){\n" + ID +
          "  P[id] = TDIn_P(0, id);\n  Cd[id] = vec4(1.0, 0.5, 0.0, 1.0);\n}\n")
COD_N = ("void main(){\n" + ID +
         "  P[id] = TDIn_P(0, id);\n  N[id] = vec3(0.0, 1.0, 0.0);\n}\n")

def armar(nombre, codigo, attrs, crear=None, upstream_attr=None):
    d = probe.create(td.textDAT, "code_" + nombre)
    d.text = codigo
    g = probe.create(td.glslPOP, "glsl_" + nombre)
    g.par.computedat = d.name
    info = {}
    if crear:
        # página Create Attributes
        for par, val in crear.items():
            try:
                setattr(g.par, par, val)
            except Exception as e:
                info["err_" + par] = str(e)[:60]
    try:
        g.par.outputattrs = attrs
    except Exception as e:
        info["err_outputattrs"] = str(e)[:60]
    if upstream_attr:
        a = probe.create(td.attributePOP, "attr_" + nombre)
        a.par.attr0name = upstream_attr["name"]
        try:
            a.par.attr0numcomps = upstream_attr["comps"]
        except Exception as e:
            info["err_numcomps"] = str(e)[:60]
        src.outputConnectors[0].connect(a)
        a.outputConnectors[0].connect(g)
    else:
        src.outputConnectors[0].connect(g)
    try:
        g.cook(force=True)
    except Exception:
        pass
    lg = probe.op("glsl_" + nombre + "_info")
    return {"compila": not g.errors(), "error": g.errors()[:110],
            "log": (lg.text.replace("\n", " ")[-180:] if lg else ""),
            "attrs_salida": [x.name for x in g.pointAttributes][:8] if not g.errors() else [],
            "info": info}

res = {}
res["1_outattrs_solo_Cd"] = armar("crea1", COD_CD, "P Cd")
res["2_create_page_Cd"] = armar("crea2", COD_CD, "P Cd",
                                crear={"attr0name": "Cd", "attr0numcomps": 4})
res["3_create_page_custom_Cd"] = armar("crea3", COD_CD, "P Cd",
                                       crear={"attr0name": "Custom", "attr0customname": "Cd",
                                              "attr0numcomps": 4})
res["4_upstream_attrPOP_Cd"] = armar("crea4", COD_CD, "P Cd",
                                     upstream_attr={"name": "Cd", "comps": 4})
res["5_create_page_N"] = armar("crea5", COD_N, "P N",
                               crear={"attr0name": "N", "attr0numcomps": 3})
res["6_upstream_attrPOP_N"] = armar("crea6", COD_N, "P N",
                                    upstream_attr={"name": "N", "comps": 3})

# parámetros disponibles de la página Create Attributes
g = probe.op("glsl_crea2")
res["_pars_attr"] = [p.name for p in g.pars() if p.name.startswith("attr")]
print(json.dumps(res, ensure_ascii=False, default=str))
'''

data = json.dumps({"code": CODE}).encode("utf-8")
req = urllib.request.Request("http://localhost:44444/exec", data=data,
                             headers={"Content-Type": "application/json"})
with urllib.request.urlopen(req, timeout=240) as fh:
    d = json.loads(json.load(fh).get("output", "{}") or "{}")
for k, v in d.items():
    if k.startswith("_"):
        continue
    print(f"{'✔' if v.get('compila') else '✘'} {k:<28} attrs={v.get('attrs_salida')}")
    if not v.get("compila"):
        print(f"      {v.get('error')} | {v.get('log')[-110:]}")
    if v.get("info"):
        print(f"      info: {v['info']}")
print("\npars de Create Attributes:", d.get("_pars_attr"))
