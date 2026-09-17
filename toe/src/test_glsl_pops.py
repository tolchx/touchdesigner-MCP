#!/usr/bin/env python3
"""
GLSL POP Reference Suite — live TouchDesigner (port 44444)
==========================================================

14 casos derivados de docs/GLSL_POP_RULES.md (reglas verificadas en vivo,
TD 2025.32460). Esta es la suite de referencia que hace reproducible el
conocimiento GLSL POP del repo: cada regla tiene al menos un caso que la
ejercita contra el build real, con verificación por evidencia (cook forzado,
errors(), numPoints()/numPrims() como MÉTODOS, infoDAT del compilador).

Casos:
  c01  R1 negativa : leer la salida P  -> compile failed + infoDAT presente
  c02  R1 positiva : TDIn_P(0, id)     -> compila, con puntos
  c03  R2          : patrón canónico   -> compila, numPoints == fuente
  c04  R3 negativa : escribir Cd sin crearlo -> compile failed
  c05  R3 positiva : Create Attributes (Custom/Cd/4) -> compila
  c06  R3 negativa : attr0name='Cd' directo -> compile failed (NO funciona)
  c07  R4 negativa : leer attr escrito sin readwrite -> writeonly error
  c08  R4 positiva : outputaccess='readwrite' -> compila
  c09  R5          : errors() dice "Compile failed", infoDAT tiene el log real
  c10  R6          : numPoints/numPrims son métodos -> callable + int() ok
  c11  R6 negativa : int(o.numPoints) (atributo) lanza TypeError
  c12  Patrón corpus: glsl -> glsl encadenado -> compila, puntos preservados
  c13  Ejemplo completo del doc: P + Cd + customAttr -> compila
  c14  Evidencia   : el shader transforma bounds() (+vec3(2,0,0))

Uso:
    python toe/src/test_glsl_pops.py            # corre y limpia al final
    python toe/src/test_glsl_pops.py --keep     # deja el contenedor raíz para inspección

Salida:
    - Steps [PASS]/[FAIL] por check
    - RESULTS: X/14 (compatible con el grep del orquestador)
    - docs/glsl_pops_reference.json con el detalle por caso
"""

from __future__ import annotations

import argparse
import datetime as _dt
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from td_test_harness import TDClient, TestResult  # noqa: E402

DOCS = os.path.abspath(
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "docs")
)
OUT_JSON = os.path.join(DOCS, "glsl_pops_reference.json")

PREFIX = "glsl_ref"

# ─── Shaders (una sola fuente de verdad: docs/GLSL_POP_RULES.md) ───────────

_HDR = (
    "void main(){\n"
    "  const uint id = TDIndex();\n"
    "  if (id >= TDNumElements()) return;\n"
)

SH_R1_BAD = _HDR + "  P[id] = P[id] * 1.001;\n}\n"                # R1 negativo
SH_R1_GOOD = _HDR + "  P[id] = TDIn_P(0, id) * 1.001;\n}\n"       # R1 positivo
SH_CD = (
    _HDR
    + "  vec3 p = TDIn_P(0, id);\n"
    + "  P[id] = p;\n"
    + "  Cd[id] = vec4(1.0, 0.5, 0.0, 1.0);\n"
    + "}\n"
)
SH_MASA = (
    _HDR
    + "  masa[id] = length(TDIn_P(0, id)) * 0.1;\n"
    + "  P[id] = TDIn_P(0, id) * (1.0 + masa[id]);\n"
    + "}\n"
)
SH_SYNTAX = _HDR + "  P[id] = ;\n}\n"                              # R5
SH_FULL = (
    _HDR
    + "  vec3 p = TDIn_P(0, id);\n"
    + "  P[id] = p;\n"
    + "  Cd[id] = vec4(1.0, 0.5, 0.0, 1.0);\n"
    + "  customAttr[id] = length(p);\n"
    + "}\n"
)
SH_SHIFT = _HDR + "  P[id] = TDIn_P(0, id) + vec3(2.0, 0.0, 0.0);\n}\n"  # c14
SH_CHAIN1 = _HDR + "  P[id] = TDIn_P(0, id) * 1.5;\n}\n"
SH_CHAIN2 = _HDR + "  P[id] = TDIn_P(0, id) * 1.001;\n}\n"

# ─── Check snippets (van DENTRO del script generado, tras cook + errors()) ─

CHK_FAIL = """    _check('compile_failed_as_expected', bool(errs), errs)
    info = _find_info(glsl, root)
    _check('infodat_present', bool(info), (info or '')[:200])
"""

CHK_CLEAN = """    _check('no_errors', not errs, errs)
    try:
        pts = int(glsl.numPoints())
    except Exception:
        pts = -1
    _check('has_points', pts > 0, pts)
"""

CHK_POINTS_MATCH = """    try:
        spts = int(src.numPoints())
    except Exception:
        spts = -1
    _check('points_match_source', pts == spts and spts > 0, "%s -> %s" % (spts, pts))
"""

CHK_WRITEONLY = """    _check('writeonly_in_info', bool(info) and 'writeonly' in info.lower(), (info or '')[:200])
"""

CHK_R5 = """    _check('errors_report_compile', bool(errs) and 'compile' in errs.lower(), errs)
    info = _find_info(glsl, root)
    _check('infodat_richer', bool(info) and len(info) > len(errs or ''), (info or '')[:200])
"""

CHK_METHOD = """    _check('numPoints_callable', callable(glsl.numPoints), str(type(glsl.numPoints)))
    try:
        n = int(glsl.numPoints())
    except Exception as e:
        n = -1
        _check('numPoints_int', False, str(e))
    _check('numPoints_int', n > 0, n)
    try:
        npr = int(glsl.numPrims())
    except Exception as e:
        npr = -1
        _check('numPrims_int', False, str(e))
    _check('numPrims_int', npr > 0, npr)
"""

CHK_ATTR_NOT_NUM = """    raised = False
    try:
        int(glsl.numPoints)
    except Exception:
        raised = True
    _check('attr_int_raises', raised, 'int(glsl.numPoints) no debe funcionar')
    _check('attr_is_builtin', 'builtin' in str(type(glsl.numPoints)), str(type(glsl.numPoints)))
"""

CHK_BOUNDS = """    def _flat(v, acc=None):
        if acc is None:
            acc = []
        try:
            for x in v:
                _flat(x, acc)
        except TypeError:
            try:
                acc.append(float(v))
            except Exception:
                pass
        return acc
    raw = ''
    try:
        raw = repr(glsl.bounds())
    except Exception as e:
        raw = str(e)
    try:
        bs = _flat(src.bounds())
        bo = _flat(glsl.bounds())
    except Exception:
        bs, bo = [], []
    _check('bounds_available', bool(bs) and bool(bo), "src=%s out=%s raw=%s" % (bs[:3] if bs else '?', bo[:3] if bo else '?', raw[:80]))
    if bs and bo:
        # Compare centers: _flat() includes size components, so max() over the
        # flat list can equal exactly (e.g. max_out=2.5 vs max_src=1.0+1.5),
        # making a strict '>' flip to False on the boundary. Center shift of
        # exactly +2.0 in X is deterministic and unambiguous.
        _check('bounds_shifted', abs(bo[6] - bs[6] - 2.0) < 0.01, "center src=%.4f out=%.4f (flat[6])" % (bs[6], bo[6]))
"""


# ─── Generación del cuerpo de cada caso ───────────────────────────────────


def build_body(
    shader: str,
    name: str = "glsl1",
    outputattrs: str = "P",
    attrs: list[tuple[str, str, int]] | None = None,
    attr_lines: list[str] | None = None,
    extra_pars: dict | None = None,
    checks: str = "",
) -> str:
    """Cuerpo estándar: boxPOP fuente + textDAT + glslPOP + cook + checks."""
    lines = [
        "    src = root.create(td.boxPOP, 'src')",
        "    code = root.create(td.textDAT, 'shader_code')",
        f"    code.text = {shader!r}",
        f"    glsl = root.create(td.glslPOP, {name!r})",
        "    glsl.par.computedat = code.name",
        f"    glsl.par.outputattrs = {outputattrs!r}",
    ]
    for i, (aname, acustom, acomps) in enumerate(attrs or []):
        lines.append(f"    glsl.par.attr{i}name = {aname!r}")
        lines.append(f"    glsl.par.attr{i}customname = {acustom!r}")
        lines.append(f"    glsl.par.attr{i}numcomps = {acomps}")
    lines.extend(attr_lines or [])
    for k, v in (extra_pars or {}).items():
        lines.append(f"    glsl.par.{k} = {v!r}")
    lines.append("    src.outputConnectors[0].connect(glsl)")
    lines.append("    glsl.cook(force=True)")
    lines.append("    errs = glsl.errors()")
    lines.append(checks.rstrip())
    return "\n".join(lines) + "\n"


BODY_CHAIN = """    src = root.create(td.boxPOP, 'src')
    code1 = root.create(td.textDAT, 'code1')
    code1.text = %(sh1)r
    code2 = root.create(td.textDAT, 'code2')
    code2.text = %(sh2)r
    g1 = root.create(td.glslPOP, 'glsl1')
    g1.par.computedat = code1.name
    g1.par.outputattrs = 'P'
    g2 = root.create(td.glslPOP, 'glsl2')
    g2.par.computedat = code2.name
    g2.par.outputattrs = 'P'
    src.outputConnectors[0].connect(g1)
    g1.outputConnectors[0].connect(g2)
    g1.cook(force=True)
    g2.cook(force=True)
    e1 = g1.errors()
    e2 = g2.errors()
    _check('glsl1_clean', not e1, e1)
    _check('glsl2_clean', not e2, e2)
    try:
        ps = int(src.numPoints())
    except Exception:
        ps = -1
    try:
        p2 = int(g2.numPoints())
    except Exception:
        p2 = -1
    _check('points_preserved', ps > 0 and p2 == ps, "%%s -> %%s" %% (ps, p2))
""" % {"sh1": SH_CHAIN1, "sh2": SH_CHAIN2}

CASES: list[tuple[str, str]] = [
    ("c01_r1_output_read_fails", build_body(SH_R1_BAD, checks=CHK_FAIL)),
    ("c02_r1_input_read_compiles", build_body(SH_R1_GOOD, checks=CHK_CLEAN)),
    ("c03_r2_canonical_pattern", build_body(SH_R1_GOOD, checks=CHK_CLEAN + CHK_POINTS_MATCH)),
    ("c04_r3_new_attr_without_create_fails", build_body(SH_CD, checks=CHK_FAIL)),
    ("c05_r3_create_attrs_Cd_compiles", build_body(SH_CD, attrs=[("Custom", "Cd", 4)], checks=CHK_CLEAN)),
    ("c06_r3_attr0name_direct_fails", build_body(SH_CD, attr_lines=[
        "    glsl.par.attr0name = 'Cd'",
        "    glsl.par.attr0numcomps = 4",
    ], checks=CHK_FAIL)),
    ("c07_r4_writeonly_read_fails", build_body(
        SH_MASA, attrs=[("Custom", "masa", 1)], checks=CHK_FAIL + CHK_WRITEONLY)),
    ("c08_r4_readwrite_compiles", build_body(
        SH_MASA, attrs=[("Custom", "masa", 1)],
        extra_pars={"outputaccess": "readwrite"}, checks=CHK_CLEAN)),
    ("c09_r5_infodat_has_real_error", build_body(SH_SYNTAX, checks=CHK_R5)),
    ("c10_r6_numpoints_is_method", build_body(SH_R1_GOOD, checks=CHK_METHOD)),
    ("c11_r6_numpoints_attr_not_number", build_body(SH_R1_GOOD, checks=CHK_ATTR_NOT_NUM)),
    ("c12_chained_glsl_glsl", BODY_CHAIN),
    ("c13_full_example_P_Cd_custom", build_body(
        SH_FULL, attrs=[("Custom", "Cd", 4), ("Custom", "customAttr", 1)], checks=CHK_CLEAN)),
    ("c14_bounds_displacement", build_body(SH_SHIFT, checks=CHK_BOUNDS)),
]

assert len(CASES) == 14, f"esperados 14 casos, hay {len(CASES)}"

# ─── Plantilla del script /exec por caso ──────────────────────────────────

CASE_TEMPLATE = """import json
_out = {"case": %(case_id)r, "ok": False, "errors": [], "checks": []}

def _check(name, cond, detail=""):
    _out["checks"].append({"name": name, "ok": bool(cond), "detail": str(detail)[:300]})
    return bool(cond)

def _find_info(glsl, root):
    cands = []
    try:
        cands.append(op(glsl.path + '/' + glsl.name + '_info'))
    except Exception:
        pass
    try:
        cands.append(op(root.path + '/' + glsl.name + '_info'))
    except Exception:
        pass
    for cont in (glsl, root):
        try:
            for ch in cont.children:
                if ch.name == glsl.name + '_info':
                    cands.append(ch)
        except Exception:
            pass
    for c in cands:
        if c is not None:
            try:
                t = c.text
            except Exception:
                t = None
            if t:
                return t
    return None

try:
    parent = op(%(suite_root)r)
    if parent is None:
        raise RuntimeError('suite root missing: ' + %(suite_root)r)
    old = op(parent.path + '/' + %(case_name)r)
    if old is not None:
        old.destroy()
    root = parent.create(baseCOMP, %(case_name)r)
    root.comment = 'GLSL POP reference case: ' + %(case_id)r
%(body)s
    _out["ok"] = all(c["ok"] for c in _out["checks"]) and not _out["errors"]
except Exception as e:
    _out["errors"].append(str(e))
print(json.dumps(_out))
"""


def build_case_script(case_id: str, case_name: str, suite_root: str, body: str) -> str:
    return CASE_TEMPLATE % {
        "case_id": case_id,
        "case_name": case_name,
        "suite_root": suite_root,
        "body": body.rstrip("\n"),
    }


# ─── Main ─────────────────────────────────────────────────────────────────


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--keep", action="store_true",
                    help="dejar el contenedor raíz de la suite en /project1")
    args = ap.parse_args()

    td = TDClient(timeout=60)
    if not td.ping():
        print("TD no responde en http://127.0.0.1:44444 — no se puede correr la suite en vivo.")
        print("RESULT: TD_UNREACHABLE")
        return 3

    res = TestResult()
    ts = _dt.datetime.now().strftime("%Y%m%d_%H%M%S")
    suite_root = f"/project1/{PREFIX}_{ts}"

    # Contenedor raíz de la suite (idempotente: destruye un homónimo previo)
    try:
        td.exec("o = op(%r); o.destroy() if o is not None else None" % suite_root)
        td.exec("op('/project1').create(baseCOMP, %r)" % suite_root.split("/")[-1])
        res.step("create_suite_root", True, suite_root)
    except Exception as e:
        res.step("create_suite_root", False, str(e))
        return 1

    try:
        td_build = td.exec("print(app.product + ' ' + app.build)").strip()
    except Exception:
        td_build = "unknown"
    print(f"TD build: {td_build}")

    results: list[dict] = []
    for case_id, body in CASES:
        script = build_case_script(case_id, case_id, suite_root, body)
        try:
            raw = td.exec(script)
            data = json.loads(raw.strip().splitlines()[-1])
        except Exception as e:
            data = {"case": case_id, "ok": False, "errors": [str(e)], "checks": []}
        results.append(data)
        for chk in data.get("checks", []):
            res.step(f"{case_id}:{chk['name']}", chk["ok"], chk.get("detail", ""))
        res.step(f"{case_id}:case_ok", bool(data.get("ok")),
                 "; ".join(data.get("errors", [])) or "all checks passed")

    passed = sum(1 for r in results if r.get("ok"))
    total = len(CASES)

    # Reporte versionable
    report = {
        "timestamp": ts,
        "td_build": td_build,
        "suite_root": suite_root,
        "source": "docs/GLSL_POP_RULES.md",
        "passed": passed,
        "total": total,
        "cases": results,
    }
    try:
        os.makedirs(DOCS, exist_ok=True)
        with open(OUT_JSON, "w", encoding="utf-8") as f:
            json.dump(report, f, indent=2, ensure_ascii=False)
        print(f"JSON: {OUT_JSON}")
    except Exception as e:
        print(f"WARN: no se pudo escribir {OUT_JSON}: {e}")

    # Cleanup (siempre seguro)
    if not args.keep:
        try:
            td.exec("c = op(%r); c.destroy() if c is not None else None" % suite_root)
            gone = td.exec(
                "print('GONE' if op(%r) is None else 'STILL_HERE')" % suite_root
            ).strip()
            res.step("cleanup", gone == "GONE",
                     "suite root destroyed" if gone == "GONE" else f"container still present ({gone})")
        except Exception as e:
            res.step("cleanup", False, str(e))
    else:
        res.step("cleanup", True, f"--keep: contenedor conservado en {suite_root}")

    p, t = res.summary()
    print(f"Checks: {p}/{t}")
    print(f"RESULTS: {passed}/{total}")
    return 0 if passed == total else 1


if __name__ == "__main__":
    sys.exit(main())
