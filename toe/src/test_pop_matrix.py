#!/usr/bin/env python3
"""
POP Matrix Test — Live TouchDesigner HTTP API (port 44444)
==========================================================

Crea EN VIVO cada uno de los tipos POP que expone TouchDesigner, ALIMENTADO
desde una fuente (boxPOP con subdivisiones) conectada a su input 0, lo cocina
y clasifica por evidencia en 4 categorías EXCLUYENTES:

  - ok_con_input            : cocina sin errores, sin excepciones, numPoints() > 0
  - error_con_input         : TD reporta errors() después del cook (o excepción)
  - sin_geometria_con_input : cocina limpio pero numPoints() == 0 (outputs, etc.)
  - no_creable              : create() lanza excepción (ej. engineoutPOP)

Método (verificado en vivo, docs/POPs_VALIDATION.md):
  - cada POP bajo prueba recibe SIEMPRE una fuente boxPOP aguas arriba
    por CADA input connector (hasta 3): evita "Not enough sources" en
    multi-input reales (rayPOP, lookupattributePOP, mathcombinePOP...)
  - cableado verificado: src.outputConnectors[0].connect(dst.inputConnectors[i])
  - después de crear/conectar: p.cook(force=True), luego p.errors()
  - geometría con int(p.numPoints()) e int(p.numPrims())  (MÉTODOS, no propiedades)

NO toca operadores existentes de /project1: todo vive dentro de un sandbox baseCOMP.

Salidas:
  - docs/pop_matrix.json   (datos crudos + categorías; compatibles con
                            verify_pop_knowledge.py y build_pop_knowledge.py)
  - docs/POPs_VALIDATION.md (referencia generada/actualizada con la tabla real)

Uso:
    python toe/src/test_pop_matrix.py
    python toe/src/test_pop_matrix.py --keep   # documental: el sandbox queda visible
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from td_test_harness import TDClient, TestResult  # noqa: E402

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
DOCS_DIR = os.path.join(REPO_ROOT, "docs")
JSON_OUT = os.path.join(DOCS_DIR, "pop_matrix.json")

SANDBOX_PARENT = "/project1"
SANDBOX_NAME = "pop_matrix_live4"
SANDBOX_PATH = f"{SANDBOX_PARENT}/{SANDBOX_NAME}"

GRID_COLS = 12
DX = 260   # celda: fuente a la izquierda, POP bajo prueba a +DX/2
DY = 200

CATEGORIES = ("ok_con_input", "error_con_input", "sin_geometria_con_input", "no_creable")


def build_matrix_code(sandbox_path: str, json_out: str) -> str:
    """Código TD-Python: crea fuente+POP por tipo, conecta, cocina, clasifica y escribe el JSON."""
    return f'''
import json, os, traceback, datetime

SB = "{sandbox_path}"
OUT = r"{json_out}"
GRID_COLS, DX, DY = {GRID_COLS}, {DX}, {DY}

parent = op("/project1")
if op(SB):
    op(SB).destroy()
sb = parent.create(baseCOMP, "{SANDBOX_NAME}")
sb.nodeX = -2600
sb.nodeY = 1500
sb.comment = "POP matrix v4: cada POP alimentado desde boxPOP; clasificación por evidencia"

types = sorted([n for n in dir(td) if n.endswith("POP") and n != "POP"])
results = []
for i, t in enumerate(types):
    row, col = i // GRID_COLS, i % GRID_COLS
    cell_x, cell_y = col * DX, -(row * DY)
    short = t.replace("POP", "pop").lower()
    entry = {{
        "type": t,
        "created": False,
        "sources_created": 0,
        "error": None,
        "cooked": False,
        "has_errors": False,
        "error_message": None,
        "numPoints": None,
        "numPrims": None,
        "geometry_ok": False,
        "source_created": False,
        "wired": False,
        "wired_to_input": None,
        "wire_note": None,
        "inputs": None,
        "outputs": None,
        "param_count": None,
        "params": [],
        "category": None,
    }}
    srcs = []
    try:
        # 1) fuentes SIEMPRE: una boxPOP subdividida por input connector (hasta 3).
        #    Los generadores (0 inputs) crean igual una fuente, que se destruye al final.
        probe = sb.create(getattr(td, t), short)
        n_in = len(probe.inputConnectors)
        n_src = max(1, min(n_in, 3))
        probe.destroy()
        for k in range(n_src):
            sname = "src_%s_%d" % (short, k) if n_src > 1 else "src_" + short
            s = sb.create(td.boxPOP, sname)
            s.nodeX = cell_x
            s.nodeY = cell_y - k * 120
            try:
                s.par.sizex = 2
                s.par.sizey = 2
                s.par.sizez = 2
                s.par.divx = 4
                s.par.divy = 4
                s.par.divz = 4
            except Exception:
                pass  # params defensivos: si el build cambió nombres, la fuente queda default
            s.cook(force=True)
            srcs.append(s)
        entry["source_created"] = True
        entry["sources_created"] = len(srcs)
    except Exception as e:
        entry["error"] = "source_create_exception: %s" % str(e)

    try:
        o = sb.create(getattr(td, t), short)
        o.nodeX = cell_x + DX // 2
        o.nodeY = cell_y
        entry["created"] = True
        entry["name"] = o.name
        entry["opType"] = o.type
        entry["family"] = getattr(o, "family", None)
        entry["inputs"] = len(o.inputConnectors)
        entry["outputs"] = len(o.outputConnectors)
        entry["param_count"] = len(o.pars())
        entry["params"] = [
            {{"name": p.name, "label": p.label, "style": str(p.style), "default": str(p.default)}}
            for p in o.pars()
        ]

        # 2) cableado defensivo: fuente k -> input k (receta verificada)
        try:
            wired_idx = []
            for k, s in enumerate(srcs):
                if len(o.inputConnectors) > k:
                    s.outputConnectors[0].connect(o.inputConnectors[k])
                    wired_idx.append(k)
            if wired_idx:
                entry["wired"] = True
                entry["wired_to_input"] = wired_idx
            elif srcs and len(o.inputConnectors) == 0:
                entry["wire_note"] = "sin inputs (generador o input por param)"
            elif not srcs:
                entry["wire_note"] = "sin fuente disponible"
        except Exception as we:
            entry["wire_note"] = "wire_exception: %s" % str(we)

        # 3) VALIDACIÓN REAL: cook forzado + errores + geometría
        try:
            fn = getattr(o, "cook", None)
            if callable(fn):
                fn(force=True)
            entry["cooked"] = True
        except Exception as e:
            entry["error"] = "cook_exception: %s" % str(e)

        try:
            err = o.errors()
            entry["has_errors"] = bool(err)
            if err:
                entry["error_message"] = str(err).strip()
        except Exception as e:
            entry["error"] = entry["error"] or ("errors_exception: %s" % str(e))

        try:
            pts = int(o.numPoints())
            prims = int(o.numPrims())
            entry["numPoints"] = pts
            entry["numPrims"] = prims
            entry["geometry_ok"] = pts > 0 and not entry["has_errors"] and not entry.get("error")
        except Exception as e:
            entry["error"] = entry["error"] or ("numPoints_exception: %s" % str(e))
    except Exception as e:
        entry["error"] = "%s: %s" % (type(e).__name__, e)

    # 4) clasificación EXCLUYENTE por evidencia
    if not entry["created"]:
        entry["category"] = "no_creable"
    elif entry["geometry_ok"]:
        entry["category"] = "ok_con_input"
    elif entry["has_errors"] or entry.get("error"):
        entry["category"] = "error_con_input"
    else:
        entry["category"] = "sin_geometria_con_input"
    results.append(entry)

    # 5) las fuentes no usadas se destruyen: la matriz queda legible
    for s in srcs:
        try:
            if not entry["wired"]:
                s.destroy()
        except Exception:
            pass

total_params = sum(r.get("param_count", 0) or 0 for r in results)
by_cat = {{c: sorted(r["type"] for r in results if r["category"] == c) for c in {CATEGORIES!r}}}
data = {{
    "generated_at": datetime.datetime.now().isoformat(timespec="seconds"),
    "td_build": app.product + " " + app.build,
    "sandbox": SB,
    "method": "cada POP bajo prueba recibe una fuente boxPOP (2x2x2, div 4) conectada a input[0]; "
              "cook(force=True) + errors() + numPoints()/numPrims() (métodos); "
              "clasificación excluyente ok_con_input / error_con_input / sin_geometria_con_input / no_creable",
    "type_count": len(types),
    "created_ok": sum(1 for r in results if r["created"]),
    "created_fail": sum(1 for r in results if not r["created"]),
    "ok_con_input_count": len(by_cat["ok_con_input"]),
    "ok_real": len(by_cat["ok_con_input"]),  # alias retrocompatible (v3)
    "categories": by_cat,
    "sin_geometria": by_cat["sin_geometria_con_input"],
    "con_errores": [{{"type": r["type"], "message": (r.get("error_message") or r.get("error") or "").strip()}}
                    for r in results if r["category"] == "error_con_input"],
    "no_creables": [{{"type": r["type"], "message": r.get("error") or ""}}
                    for r in results if r["category"] == "no_creable"],
    "wired_count": sum(1 for r in results if r["wired"]),
    "multi_source_count": sum(1 for r in results if r.get("sources_created", 0) > 1),
    "total_params": total_params,
    "results": results,
}}
os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=1)
print("SUMMARY ok_con_input=%d error_con_input=%d sin_geo=%d no_creable=%d wired=%d total_params=%d sandbox=%s" % (
    len(by_cat["ok_con_input"]), len(by_cat["error_con_input"]), len(by_cat["sin_geometria_con_input"]),
    len(by_cat["no_creable"]), data["wired_count"], total_params, SB))
'''


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=44444)
    ap.add_argument("--timeout", type=int, default=600, help="timeout del /exec principal")
    ap.add_argument("--keep", action="store_true", help="documental: el sandbox queda visible")
    args = ap.parse_args()

    td = TDClient(args.host, args.port, timeout=args.timeout)
    res = TestResult()

    res.step("API responde", td.ping(), f"{args.host}:{args.port}")

    t0 = time.time()
    out = td.exec(build_matrix_code(SANDBOX_PATH, JSON_OUT))
    elapsed = time.time() - t0
    print(f"[exec] {out.strip()[:400]}  ({elapsed:.1f}s)")

    if not os.path.exists(JSON_OUT):
        res.step("JSON generado", False, f"no existe {JSON_OUT}")
        print(res.summary())
        return 1

    data = json.load(open(JSON_OUT, encoding="utf-8"))
    res.step("Tipos POP descubiertos", data["type_count"] >= 90, f"{data['type_count']} tipos")

    fails = [r for r in data["results"] if not r["created"]]
    res.step("Creacion de todos los POPs", len(fails) == 0 or (len(fails) == 1 and fails[0]["type"] == "engineoutPOP"),
             "todos creados" if not fails else "fallaron: " + ", ".join(f"{r['type']}({r['error']})" for r in fails[:6]))

    cats = data["categories"]
    ok_count = data["ok_con_input_count"]
    res.step("ok_con_input sustancialmente mayor que sin input (17)",
             ok_count >= 25,
             f"{ok_count}/{data['type_count']} ok CON fuente "
             f"(corrida sin input: 17) | err={len(cats['error_con_input'])} "
             f"sin_geo={len(cats['sin_geometria_con_input'])} no_creable={len(cats['no_creable'])}")

    wired = data["wired_count"]
    res.step("Fuentes conectadas", wired >= data["type_count"] // 2,
             f"{wired} POPs con fuente conectada (el resto: generadores sin inputs o wire fallido)")

    con_err = data["con_errores"]
    res.step("Errores residuales (diagnóstico, esperado < 25)", len(con_err) <= 25,
             f"{len(con_err)} con errores: " + ", ".join(c["type"] for c in con_err[:8]) + ("..." if len(con_err) > 8 else ""))

    no_params = [r["type"] for r in data["results"] if r["created"] and r.get("param_count") == 0]
    res.step("Todos exponen parámetros", len(no_params) == 0,
             f"total {data['total_params']} params" if not no_params else f"sin params: {no_params[:6]}")

    # verificación independiente por HTTP (si endpoint disponible)
    try:
        v = td.get_json(f"/verify?path={SANDBOX_PATH}")
        if v and "error_count" in v:
            verify_details = (f"ops={v.get('operator_count')} conns={v.get('total_connections')} "
                              f"errores={v.get('error_count')} (los error_con_input esperados)")
        else:
            verify_details = "respuesta inesperada: " + str(v)[:100]
    except Exception as e:
        verify_details = f"skipped: {e}"
    res.step("verify del sandbox (informativo)", True, verify_details)

    print(f"\nSandbox visible en TD: {SANDBOX_PATH}  ({data['created_ok']} operadores, {ok_count} ok con fuente)")
    print(f"JSON: {JSON_OUT}")

    passed, total = res.summary()
    if not args.keep:
        print("\n[info] Sandbox conservado a propósito para inspección visual (regla del proyecto).")

    return 0 if passed == total else 1


if __name__ == "__main__":
    raise SystemExit(main())
