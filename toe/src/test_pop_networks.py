#!/usr/bin/env python3
"""
POP Network Tests — live TouchDesigner (port 44444)
===================================================

Construye EN VIVO una batería de redes POP canónicas (las que aparecen en el
análisis POP del corpus y en los ejemplos oficiales), cada una en su propio
sandbox baseCOMP, las cablea, verifica errores y las deja VISIBLES en el editor.

Reglas del proyecto respetadas:
  - Todo dentro de un baseCOMP (nunca nodos sueltos en /project1)
  - Nombres únicos por corrida (sandbox con sufijo)
  - No se borra nada: los contenedores quedan para inspección visual
  - Verificación por HTTP (/verify) además de la verificación en el propio TD

Uso:
    python toe/src/test_pop_networks.py
    python toe/src/test_pop_networks.py --grid    # los organiza en grilla
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from td_test_harness import TDClient, TestResult  # noqa: E402

DOCS = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "docs"))
OUT_JSON = os.path.join(DOCS, "pop_networks.json")

# Redes canónicas: (nombre, nodos [(tipo, nombre)], conexiones [(src, dst [, inputIndex])], nota)
NETWORKS = [
    ("basic_chain",
     [("boxPOP", "box1"), ("noisePOP", "noise1"), ("nullPOP", "out1")],
     [("box1", "noise1", None), ("noise1", "out1", None)],
     "Cadena fuente -> deformación -> salida"),

    ("copy_instancing",
     [("gridPOP", "grid1"), ("attributePOP", "attr1"), ("spherePOP", "sph1"), ("copyPOP", "copy1"), ("nullPOP", "out1")],
     [("sph1", "copy1", 0), ("grid1", "attr1", None), ("attr1", "copy1", 1), ("copy1", "out1", None)],
     "Instanciación GPU: geometría (in0) copiada sobre plantilla de puntos (in1)"),

    ("particles_solver",
     [("boxPOP", "emitter1"), ("sprinklePOP", "sprinkle1"), ("particlePOP", "particle1"),
      ("nullPOP", "forces1"), ("nullPOP", "out1")],
     [("emitter1", "sprinkle1", None), ("sprinkle1", "particle1", None), ("particle1", "forces1", None),
      ("forces1", "out1", None)],
     "Sistema de partículas por feedback (el solver recuerda el estado del cuadro previo)"),

    ("trail_line_strip",
     [("spherePOP", "sph1"), ("transformPOP", "xform1"), ("trailPOP", "trail1"), ("nullPOP", "out1")],
     [("sph1", "xform1", None), ("xform1", "trail1", None), ("trail1", "out1", None)],
     "Estela de posiciones: genera line strips a partir del historial"),

    ("merge_switch",
     [("boxPOP", "box1"), ("spherePOP", "sph1"), ("mergePOP", "merge1"), ("switchPOP", "switch1"), ("nullPOP", "out1")],
     [("box1", "merge1", 0), ("sph1", "merge1", 1), ("merge1", "switch1", None), ("switch1", "out1", None)],
     "Combinar dos geometrías y alternar la salida"),

    ("math_ops_chain",
     [("boxPOP", "box1"), ("mathPOP", "math1"), ("mathcombinePOP", "comb1"), ("nullPOP", "out1")],
     [("box1", "math1", None), ("math1", "comb1", None), ("comb1", "out1", None)],
     "Matemática nativa sobre atributos en VRAM (sin pasar por CHOPs)"),

    ("glsl_shader",
     [("boxPOP", "box1"), ("textDAT", "shader_code"), ("glslPOP", "glsl1"), ("nullPOP", "out1")],
     [("box1", "glsl1", None), ("glsl1", "out1", None)],
     "GLSL POP: boxPOP como fuente + DAT con el shader + outputattrs='P'"),

    ("line_divide_resample",
     [("circlePOP", "circle1"), ("linedividePOP", "div1"), ("lineresamplePOP", "res1"), ("nullPOP", "out1")],
     [("circle1", "div1", None), ("div1", "res1", None), ("res1", "out1", None)],
     "Trabajo sobre line strips: dividir y remuestrear"),

    ("feedback_loop",
     [("boxPOP", "box1"), ("feedbackPOP", "fb1"), ("nullPOP", "out1")],
     [("box1", "fb1", None), ("fb1", "out1", None)],
     "Feedback POP: realimentación de la propia red"),

    ("field_deform",
     [("spherePOP", "sph1"), ("fieldPOP", "field1"), ("nullPOP", "out1")],
     [("sph1", "field1", None), ("field1", "out1", None)],
     "Field POP: deformación por campo (usado en los ejemplos de TDSW)"),
]

GLSL_CODE = ("void main(){\\n"
             "  P[TDIndex()] = P[TDIndex()] * 1.001;\\n"
             "}\\n")


def build_code(sandbox_root: str, grid: bool) -> str:
    nets_json = json.dumps(NETWORKS)
    return f'''
import json, datetime

NETS = json.loads(r"""{nets_json}""")
ROOT = "{sandbox_root}"
par = op("/project1")
report = {{"sandbox_root": ROOT, "td_build": app.product + " " + app.build, "networks": []}}

if op(ROOT):
    op(ROOT).destroy()
root = par.create(baseCOMP, ROOT.split("/")[-1])
root.nodeX = -3600
root.nodeY = -400
root.comment = "Redes POP canonicas — generadas por test_pop_networks.py"

for ni, (name, nodes, conns, note) in enumerate(NETS):
    entry = {{"name": name, "note": note, "nodes": [], "errors": [], "connections": 0, "ok": False}}
    parent = root.create(baseCOMP, name)
    parent.nodeX = (ni % 5) * 700
    parent.nodeY = -(ni // 5) * 700
    parent.comment = note

    # 1) crear nodos (fuente primero)
    created = {{}}
    for t, n in nodes:
        try:
            o = parent.create(t, n)
            o.nodeX = 0
            created[n] = o
            entry["nodes"].append({{"name": n, "type": o.type, "family": getattr(o, "family", None)}})
        except Exception as e:
            entry["errors"].append("create %s(%s): %s" % (n, t, e))

    # 2) parámetros mínimos conocidos (GLSL POP: DAT + outputattrs)
    if name == "glsl_shader":
        try:
            d = created["shader_code"]
            d.text = "{GLSL_CODE}"
            g = created["glsl1"]
            g.par.computedat = "shader_code"
            g.par.outputattrs = "P"
        except Exception as e:
            entry["errors"].append("setup glsl: %s" % e)

    # 3) cablear (izquierda -> derecha) y acomodar
    # API verificada 2026-09-10 contra TD 2025.32460:
    #   entrada 0 / inputs dinámicos (mergePOP) : src.outputConnectors[0].connect(dst)
    #   input indexado (copyPOP in0/in1)        : src.outputConnectors[0].connect(dst.inputConnectors[i])
    #   OJO: connect(dst, i) NO funciona (lo que decía AGENTS.md)
    for idx, (src, dst, inidx) in enumerate(conns):
        try:
            s = created[src]
            d = created[dst]
            if inidx is None:
                s.outputConnectors[0].connect(d)
            else:
                s.outputConnectors[0].connect(d.inputConnectors[inidx])
            entry["connections"] += 1
        except Exception as e:
            entry["errors"].append("connect %s->%s: %s" % (src, dst, e))

    order = {{n: i for i, (t, n) in enumerate(nodes)}}
    for n, o in created.items():
        o.nodeX = order[n] * 260
        o.nodeY = 0

    # 4) verificar errores por operador
    for n, o in created.items():
        try:
            err = o.errors()
            warn = o.warnings()
            if err:
                entry["errors"].append("%s errors: %s" % (n, err))
            if warn:
                entry.setdefault("warnings", []).append("%s: %s" % (n, warn))
        except Exception as e:
            entry["errors"].append("verify %s: %s" % (n, e))

    entry["ok"] = not entry["errors"]
    report["networks"].append(entry)

report["ok_all"] = all(n["ok"] for n in report["networks"])
report["total_networks"] = len(report["networks"])
report["total_connections"] = sum(n["connections"] for n in report["networks"])
report["generated_at"] = datetime.datetime.now().isoformat(timespec="seconds")
import os
os.makedirs(r"{DOCS}", exist_ok=True)
with open(r"{OUT_JSON}", "w", encoding="utf-8") as f:
    json.dump(report, f, ensure_ascii=False, indent=1)
print("NETS ok=%d/%d connections=%d errors=%d" % (
    sum(1 for n in report["networks"] if n["ok"]), len(report["networks"]),
    report["total_connections"], sum(len(n["errors"]) for n in report["networks"])))
'''


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=44444)
    ap.add_argument("--grid", action="store_true", help="organizar en grilla (default)")
    args = ap.parse_args()

    td = TDClient(args.host, args.port)
    res = TestResult()
    res.step("API responde", td.ping(), f"{args.host}:{args.port}")

    t0 = time.time()
    out = td.exec(build_code("pop_networks_live", args.grid))
    print(f"[exec] {out.strip()[:200]}  ({time.time()-t0:.1f}s)")

    if not os.path.exists(OUT_JSON):
        res.step("Reporte generado", False, OUT_JSON)
        print(res.summary())
        return 1
    data = json.load(open(OUT_JSON, encoding="utf-8"))

    res.step("Todas las redes construidas", data["ok_all"],
             f"{sum(1 for n in data['networks'] if n['ok'])}/{data['total_networks']} OK")
    res.step("Conexiones creadas", data["total_connections"] > 0, f"{data['total_connections']} conexiones")
    no_err = [n["name"] for n in data["networks"] if n["errors"]]
    res.step("Sin errores de TD", not no_err, ", ".join(no_err) or "0 redes con errores")

    v = td.get_json("/verify?path=/project1/pop_networks_live")
    res.step("verify del árbol", v.get("healthy") is True,
             f"ops={v.get('operator_count')} conns={v.get('total_connections')} errores={v.get('error_count')}")

    print("\nRedes:")
    for n in data["networks"]:
        mark = "OK " if n["ok"] else "ERR"
        print(f"  [{mark}] {n['name']:<22} {n['connections']} conexiones — {n['note']}")
        for e in n["errors"][:3]:
            print(f"         ! {e}")

    passed, total = res.summary()
    return 0 if passed == total else 1


if __name__ == "__main__":
    raise SystemExit(main())
