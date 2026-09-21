#!/usr/bin/env python3
"""td_verify.py — watchdog de verificacion EN VIVO del TD-MCP. Silencioso, 0 tokens.

Por que existe: el loop de Freebuff solo corria la suite OFFLINE. Toda verificacion
contra TouchDesigner real quedaba como `Pendiente: bridge caido, TD_UNREACHABLE`
(items 04 y 30 del BACKLOG) porque nada levantaba TD ni corria las suites live.
Esto separa esa tarea del agente que escribe codigo: la verificacion en vivo es
mecanica, no necesita un LLM, y no necesita tocar la GUI de Freebuff.

Diseno de "watchdog silencioso": si todo esta verde NO imprime nada (stdout vacio =
el cron no_agent no entrega mensaje). Solo habla cuando hay algo que decir:
  - TD no responde            -> silencio (no es noticia, es lo normal en la mayoria de los ticks)
  - TD con build equivocado   -> ALERTA (nadie deberia correr pruebas asi)
  - suite live con fallos     -> REPORTE + exit 3
  - cambio de resultado vs la ultima corrida -> REPORTE

  python scripts/td_verify.py            # canario: solo la suite GLSL de referencia (rapida, se autolimpia)
  python scripts/td_verify.py --full     # + matriz POP completa + gate del baseline (deja sandbox en TD)
  python scripts/td_verify.py --force    # habla siempre, aunque este todo verde (para probar)
  python scripts/td_verify.py --status   # que sabe del entorno y de la ultima corrida (siempre habla)

Exit: 0 todo bien (o TD caido) · 3 hay fallos · 5 build equivocado

Autor: Hermes / Tolchx — 2026-09-20
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
SCRIPTS = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS))

try:
    from td_env import probe, classify, DEFAULT_EXPECTED_BUILD  # type: ignore
except Exception as e:  # pragma: no cover
    print(f"ERROR: no pude importar td_env.py ({e})")
    sys.exit(2)

STATE_DIR = REPO / ".freebuff_tasks"
LAST_JSON = STATE_DIR / "td_verify_last.json"

GLSL_SUITE = REPO / "toe" / "src" / "test_glsl_pops.py"
POP_MATRIX = REPO / "toe" / "src" / "test_pop_matrix.py"
BASELINE_GATE = REPO / "scripts" / "check_pop_matrix_baseline.py"

# La suite GLSL crea un sandbox y lo destruye al final ("cleanup: suite root destroyed").
# La matriz POP deja el sandbox a proposito para inspeccion visual -> solo con --full.


def run(cmd: list[str], timeout: int) -> tuple[int, str]:
    try:
        p = subprocess.run(cmd, cwd=str(REPO), capture_output=True, text=True,
                           timeout=timeout, errors="replace")
        return p.returncode, (p.stdout or "") + (p.stderr or "")
    except subprocess.TimeoutExpired:
        return 124, f"TIMEOUT tras {timeout}s"
    except Exception as e:
        return 125, f"ERROR al ejecutar: {e}"


def parse_checks(out: str) -> str:
    """'Checks: 48/48' + 'RESULTS: 14/14' -> 'checks 48/48 · casos 14/14'"""
    c = re.search(r"Checks:\s*(\d+)/(\d+)", out)
    r = re.search(r"RESULTS:\s*(\d+)/(\d+)", out)
    parts = []
    if c:
        parts.append(f"checks {c.group(1)}/{c.group(2)}")
    if r:
        parts.append(f"casos {r.group(1)}/{r.group(2)}")
    return " · ".join(parts) or "sin resumen legible"


def load_last() -> dict:
    try:
        return json.loads(LAST_JSON.read_text(encoding="utf-8"))
    except Exception:
        return {}


def save_last(data: dict) -> None:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    LAST_JSON.write_text(json.dumps(data, indent=1, ensure_ascii=False), encoding="utf-8")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--full", action="store_true",
                    help="correr tambien la matriz POP + el gate del baseline")
    ap.add_argument("--force", action="store_true", help="hablar siempre")
    ap.add_argument("--status", action="store_true", help="mostrar estado y salir")
    ap.add_argument("--expect-build", default=DEFAULT_EXPECTED_BUILD)
    args = ap.parse_args()

    info = probe()
    last = load_last()

    if args.status:
        print("== td_verify — estado ==")
        print(f"bridge      : {'responde' if info else 'NO responde'}")
        if info:
            print(f"build       : {info.get('build') or info.get('release')} "
                  f"(esperado {args.expect_build})")
            print(f"projectPath : {info.get('projectPath')}")
        print(f"ultima corr : {last.get('ts', '(ninguna)')}")
        if last:
            print(f"  veredicto : {last.get('verdict')}")
            print(f"  detalle   : {last.get('detail')}")
        return 0

    # ── TD caido: silencio (es lo normal) ────────────────────────────────────
    if not info:
        if args.force:
            print("TD no responde — nada que verificar (el loop vive en la suite offline).")
        return 0

    # ── build equivocado: alerta fuerte, nunca "verde" ──────────────────────
    verdict, code = classify(info, args.expect_build)
    if verdict == "WRONG_BUILD":
        print("TD-MCP · VERIFICACION EN VIVO: BUILD EQUIVOCADO")
        print(f"  corriendo : {info.get('build') or info.get('release')}")
        print(f"  esperado  : {args.expect_build}")
        print("  NO se corrieron las suites: la evidencia seria invalida.")
        print("  Fix: python scripts/td_env.py --restart")
        return 5

    # ── TD LIVE: correr el canario ───────────────────────────────────────────
    results: list[dict] = []

    rc, out = run([sys.executable, str(GLSL_SUITE)], timeout=600)
    glsl = {"name": "glsl_pops_reference", "rc": rc, "detail": parse_checks(out)}
    results.append(glsl)

    if args.full:
        rc_m, out_m = run([sys.executable, str(POP_MATRIX)], timeout=1800)
        m = re.search(r"ok_con_input=(\d+)\s+error_con_input=(\d+)\s+sin_geo=(\d+)"
                      r"\s+no_creable=(\d+)", out_m)
        detail = (f"ok_con_input={m.group(1)} err={m.group(2)} "
                  f"sin_geo={m.group(3)} no_creable={m.group(4)}") if m else parse_checks(out_m)
        results.append({"name": "pop_matrix", "rc": rc_m, "detail": detail})

        rc_b, out_b = run([sys.executable, str(BASELINE_GATE)], timeout=300)
        gate_line = next((l.strip() for l in out_b.splitlines()
                          if "BASELINE GATE" in l), "sin linea de gate")
        results.append({"name": "pop_matrix_baseline", "rc": rc_b, "detail": gate_line})

    failures = [r for r in results if r["rc"] != 0]
    snapshot = {"ts": dt.datetime.now().isoformat(timespec="seconds"),
                "build": info.get("build") or info.get("release"),
                "verdict": "FAIL" if failures else "PASS",
                "detail": " | ".join(f"{r['name']}: {r['detail']}" for r in results),
                "results": results}
    changed = snapshot["detail"] != last.get("detail") or snapshot["build"] != last.get("build")

    should_speak = bool(failures) or changed or args.force
    if should_speak:
        head = "FALLOS" if failures else "OK"
        print(f"TD-MCP · verificacion en vivo: {head}  ({snapshot['build']})")
        for r in results:
            mark = "FALLA" if r["rc"] != 0 else "ok"
            print(f"  [{mark}] {r['name']}: {r['detail']}")
        if failures:
            for r in failures:
                print(f"  -> {r['name']} exit={r['rc']}")
            print("  Revisar antes de commitear nada del ciclo de Freebuff.")
        elif changed:
            print("  (cambio respecto de la ultima corrida — evidencia nueva para revisar)")

    save_last(snapshot)
    return 3 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
