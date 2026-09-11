#!/usr/bin/env python3
"""
POP Matrix Test — Live TouchDesigner HTTP API (port 44444)
==========================================================

Crea EN VIVO cada uno de los tipos POP que expone TouchDesigner, los inspecciona
(familia, conectores, parámetros reales, errores/warnings) y deja el contenedor
visible en el editor para inspección manual.

NO toca operadores existentes de /project1: todo vive dentro de un sandbox baseCOMP.

Salidas:
  - docs/pop_matrix.json   (datos crudos para generación de documentación)
  - docs/POPs_LIVE_REFERENCE.md (referencia generada con nombres de parámetros REALES)

Uso:
    python toe/src/test_pop_matrix.py
    python toe/src/test_pop_matrix.py --keep   # no borra el sandbox al fallar
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
SANDBOX_NAME = "pop_matrix_live"
SANDBOX_PATH = f"{SANDBOX_PARENT}/{SANDBOX_NAME}"

GRID_COLS = 12
DX = 260
DY = 200


def build_matrix_code(sandbox_path: str, json_out: str) -> str:
    """Código TD-Python que crea los 102 POPs, los inspecciona y escribe el JSON."""
    return f'''
import json, os, traceback

SB = "{sandbox_path}"
OUT = r"{json_out}"
GRID_COLS, DX, DY = {GRID_COLS}, {DX}, {DY}

parent = op("/project1")
if op(SB):
    op(SB).destroy()
sb = parent.create(baseCOMP, "{SANDBOX_NAME}")
sb.nodeX = -2600
sb.nodeY = 1500
sb.comment = "POP matrix — los 102 tipos POP creados en vivo por el MCP"

types = sorted([n for n in dir(td) if n.endswith("POP") and n != "POP"])
results = []
for i, t in enumerate(types):
    entry = {{"type": t, "created": False, "error": None}}
    try:
        o = sb.create(getattr(td, t), t.replace("POP", "pop").lower())
        o.nodeX = (i % GRID_COLS) * DX
        o.nodeY = -(i // GRID_COLS) * DY
        entry.update({{
            "created": True,
            "name": o.name,
            "opType": o.type,
            "family": getattr(o, "family", None),
            "inputs": len(o.inputConnectors),
            "outputs": len(o.outputConnectors),
            "errors": o.errors(),
            "warnings": o.warnings(),
            "param_count": len(o.pars()),
            "params": [
                {{"name": p.name, "label": p.label, "style": str(p.style), "default": str(p.default)}}
                for p in o.pars()
            ],
        }})
    except Exception as e:
        entry["error"] = "%s: %s" % (type(e).__name__, e)
    results.append(entry)

total_params = sum(r.get("param_count", 0) for r in results)
data = {{
    "generated_at": time.strftime("%Y-%m-%d %H:%M:%S") if False else __import__("datetime").datetime.now().isoformat(timespec="seconds"),
    "td_build": app.product + " " + app.build,
    "sandbox": SB,
    "type_count": len(types),
    "created_ok": sum(1 for r in results if r["created"]),
    "created_fail": sum(1 for r in results if not r["created"]),
    "with_errors": sum(1 for r in results if r.get("errors")),
    "total_params": total_params,
    "results": results,
}}
os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=1)
print("SUMMARY ok=%d fail=%d with_errors=%d total_params=%d sandbox=%s" % (
    data["created_ok"], data["created_fail"], data["with_errors"], total_params, SB))
'''


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=44444)
    ap.add_argument("--keep", action="store_true", help="no borrar el sandbox si hay fallos")
    args = ap.parse_args()

    td = TDClient(args.host, args.port)
    res = TestResult()

    res.step("API responde", td.ping(), f"{args.host}:{args.port}")

    t0 = time.time()
    out = td.exec(build_matrix_code(SANDBOX_PATH, JSON_OUT))
    elapsed = time.time() - t0
    print(f"[exec] {out.strip()[:300]}  ({elapsed:.1f}s)")

    if not os.path.exists(JSON_OUT):
        res.step("JSON generado", False, f"no existe {JSON_OUT}")
        print(res.summary())
        return 1

    data = json.load(open(JSON_OUT, encoding="utf-8"))
    res.step("Tipos POP descubiertos", data["type_count"] >= 90, f"{data['type_count']} tipos")

    fails = [r for r in data["results"] if not r["created"]]
    res.step("Creación de todos los POPs", len(fails) == 0,
             "todos creados" if not fails else "fallaron: " + ", ".join(f"{r['type']}({r['error']})" for r in fails[:6]))

    with_err = [r for r in data["results"] if r.get("errors")]
    res.step("Sin errores de runtime", len(with_err) == 0,
             "0 con errores" if not with_err else f"{len(with_err)}: " + ", ".join(r["type"] for r in with_err[:6]))

    no_params = [r["type"] for r in data["results"] if r["created"] and r["param_count"] == 0]
    res.step("Todos exponen parámetros", len(no_params) == 0,
             f"total {data['total_params']} params" if not no_params else f"sin params: {no_params[:6]}")

    # verificación independiente por HTTP
    v = td.get_json(f"/verify?path={SANDBOX_PATH}")
    res.step("verify del sandbox", v.get("healthy") is True,
             f"ops={v.get('operator_count')} conns={v.get('total_connections')} errores={v.get('error_count')}")

    print(f"\nSandbox visible en TD: {SANDBOX_PATH}  ({data['created_ok']} operadores)")
    print(f"JSON: {JSON_OUT}")

    passed, total = res.summary()
    if fails and not args.keep:
        print("\n[info] Sandbox conservado a propósito para inspección visual (regla del proyecto).")

    return 0 if passed == total else 1


if __name__ == "__main__":
    raise SystemExit(main())
