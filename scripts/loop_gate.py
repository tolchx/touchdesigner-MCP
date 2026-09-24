#!/usr/bin/env python3
"""loop_gate.py — enforcement mecánico de gate.yaml (no depende del criterio del agente).

Un loop que se auto-publica necesita un freno que no sea "el agente dice que está bien".
Este script mira el diff y el gate.yaml y decide ALLOW/BLOCK sin juicio humano de por medio.
También lleva el LEDGER de intentos por item, que es lo que hace cumplir el "máx 3 intentos".

Uso:
  python scripts/loop_gate.py --action commit --paths docs/BACKLOG.md mcp/src/tools/medical.ts
  python scripts/loop_gate.py --action commit          # deriva los paths de git
  python scripts/loop_gate.py --action auto-merge --paths docs/BACKLOG.md
  python scripts/loop_gate.py --action commit --no-tests
  python scripts/loop_gate.py --attempt 52             # registra un intento del item 52
  python scripts/loop_gate.py --status                 # intentos por item

Códigos de salida:
  0 = permitido
  2 = bloqueado (mirar el motivo)
  4 = loop pausado (kill switch)
  5 = cap de intentos alcanzado para ese item → escalar a humano
"""
from __future__ import annotations

import argparse
import fnmatch
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GATE = ROOT / "gate.yaml"
LEDGER = ROOT / "loop-ledger.json"
RUNLOG = ROOT / "loop-run-log.md"

MINI_YAML_KEYS = ("version", "maxFiles", "maxLines", "requireGreenTests")


# ---------------------------------------------------------------------------
# gate.yaml (parser mínimo: listas de strings + escalares, sin dependencias)
# ---------------------------------------------------------------------------

def load_gate(path: Path) -> dict:
    try:
        import yaml  # type: ignore
        return yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    except Exception:  # noqa: BLE001
        pass
    data: dict = {}
    clave = None
    for linea in path.read_text(encoding="utf-8").splitlines():
        s = linea.split("#", 1)[0].rstrip()
        if not s.strip():
            continue
        if re.match(r"^\S.*:\s*$", s):
            clave = s.split(":", 1)[0].strip()
            data[clave] = []
            continue
        m = re.match(r"^\s*-\s*[\"']?(.+?)[\"']?\s*$", s)
        if m and clave:
            data[clave].append(m.group(1))
            continue
        m = re.match(r"^(\w+):\s*(.+)$", s)
        if m:
            k, v = m.group(1), m.group(2).strip().strip('"')
            data[k] = {"true": True, "false": False}.get(v.lower(), v)
            clave = None
    return data


# ---------------------------------------------------------------------------
# Diff y comparaciones
# ---------------------------------------------------------------------------

def sh(args: list[str], timeout: int = 1800) -> tuple[int, str]:
    try:
        r = subprocess.run(args, cwd=ROOT, capture_output=True, text=True, encoding="utf-8",
                           errors="replace", timeout=timeout, shell=os.name == "nt")
        return r.returncode, (r.stdout or "") + (r.stderr or "")
    except Exception as e:  # noqa: BLE001
        return 1, f"{type(e).__name__}: {e}"


def changed_paths() -> list[str]:
    paths: set[str] = set()
    for args in (["git", "diff", "--name-only", "HEAD"], ["git", "ls-files", "--others", "--exclude-standard"]):
        code, out = sh(args)
        if code == 0:
            paths.update(p.strip() for p in out.splitlines() if p.strip())
    return sorted(paths)


def added_lines(paths: list[str]) -> int:
    code, out = sh(["git", "diff", "--numstat", "HEAD"])
    if code != 0:
        return 0
    total = 0
    for linea in out.splitlines():
        partes = linea.split("\t")
        if len(partes) >= 2 and partes[0].isdigit():
            total += int(partes[0])
    return total


def match_any(path: str, patterns: list[str]) -> str | None:
    p = path.replace("\\", "/")
    for pat in patterns or []:
        if fnmatch.fnmatch(p, pat) or fnmatch.fnmatch(p, pat.rstrip("/") + "/**") or p == pat:
            return pat
    return None


def paused() -> bool:
    if (ROOT / "loop-pause-all").exists():
        return True
    st = ROOT / "STATE.md"
    return bool(st.exists() and re.search(r"^loop:\s*paused", st.read_text(encoding="utf-8", errors="replace"), re.M))


# ---------------------------------------------------------------------------
# Ledger de intentos
# ---------------------------------------------------------------------------

def load_ledger() -> dict:
    if LEDGER.exists():
        try:
            return json.loads(LEDGER.read_text(encoding="utf-8"))
        except Exception:  # noqa: BLE001
            pass
    return {"items": {}}


def save_ledger(l: dict) -> None:
    LEDGER.write_text(json.dumps(l, indent=2, ensure_ascii=False), encoding="utf-8")


def register_attempt(item: str, max_attempts: int = 3) -> int:
    l = load_ledger()
    reg = l["items"].setdefault(item, {"attempts": 0, "history": []})
    reg["attempts"] += 1
    reg["history"].append(datetime.now(timezone.utc).isoformat(timespec="seconds"))
    reg["history"] = reg["history"][-20:]
    save_ledger(l)
    print(f"item {item}: intento {reg['attempts']} de {max_attempts}")
    if reg["attempts"] > max_attempts:
        print(f"CAP ALCANZADO: {reg['attempts']} intentos en '{item}'. Escalar a humano con el historial: {reg['history']}")
        return 5
    return 0


def append_runlog(texto: str) -> None:
    if not RUNLOG.exists():
        RUNLOG.write_text("# loop-run-log.md\n", encoding="utf-8")
    with RUNLOG.open("a", encoding="utf-8") as fh:
        fh.write(texto if texto.endswith("\n") else texto + "\n")


# ---------------------------------------------------------------------------
# Gate
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# Juez externo (jev) — presente en el proceso, sin volverse dependencia
# ---------------------------------------------------------------------------

JUDGE = os.path.join(os.environ.get("LOCALAPPDATA", ""), "hermes", "scripts", "jev_audit_diff.py")


def run_judge(brief: str | None) -> tuple[bool, dict, str]:
    """Corre el juez externo sobre el árbol. Devuelve (permite, veredicto, motivo).

    Regla de Tolch (advisory, no dependencia): si el juez NO está disponible
    (sin saldo, sin red, script ausente) el loop SIGUE, avisando. Lo que sí
    frena es un veredicto NEGATIVO: naturaleza que no sea trabajo real, o
    debilita alta. El detalle queda en loop-ledger.json.
    """
    if not os.path.isfile(JUDGE):
        return True, {"estado": "no_disponible"}, "juez no encontrado: se sigue (advisory)"
    cmd = ["python", JUDGE, "--repo", str(ROOT), "--json"]
    if brief:
        cmd += ["--brief", brief]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8",
                           errors="replace", timeout=900)
        v = json.loads((r.stdout or "").strip() or "{}")
    except Exception as e:  # timeout, JSON roto, lo que sea
        return True, {"estado": "error", "detalle": str(e)[:200]}, f"juez no concluyó ({e}): se sigue (advisory)"

    naturaleza = str(v.get("naturaleza") or "").lower()
    debilita = float(v.get("debilita") or 0.0)
    corresponde = v.get("corresponde_al_brief")

    motivos = []
    if "no_" in naturaleza or naturaleza in ("", "ruido") or "evidencia" in naturaleza:
        motivos.append(f"la naturaleza juzgada no es trabajo real ('{naturaleza}')")
    if debilita >= 0.6:
        motivos.append(f"debilita {debilita} (>= 0.6): el diff empeora el repo")
    if corresponde is not None and float(corresponde) < 0.2:
        motivos.append(f"corresponde_al_brief {corresponde} (< 0.2): no parece ser la tarea pedida")
    permite = not motivos
    return permite, v, ("; ".join(motivos) if motivos else f"veredicto {v.get('veredicto')} · {naturaleza} · debilita {debilita}")


def run_tests() -> tuple[bool, dict]:
    """Suites verdes antes de dejar pasar un commit. Devuelve (ok, detalle)."""
    res: dict = {}
    ok = True
    pasos = [
        ("typecheck", ["npm", "run", "typecheck"], ROOT),
        ("node", ["node", "--test", "test/*.test.js"], ROOT / "mcp"),
        ("python", ["python", "-m", "unittest",
                    "tests.test_td_api_offline", "tests.test_api_contract_offline",
                    "tests.test_client_contract", "tests.test_glsl_pop_offline",
                    "tests.test_helpers", "tests.test_mcp_server_stdio",
                    "tests.test_pop_matrix_baseline", "tests.test_portability_and_hardening",
                    "tests.test_comprehension_td"], ROOT),
    ]
    for nombre, cmd, cwd in pasos:
        try:
            r = subprocess.run(cmd, cwd=str(cwd), capture_output=True, text=True,
                               encoding="utf-8", errors="replace", timeout=1800,
                               shell=os.name == "nt")
            salida = (r.stdout or "") + (r.stderr or "")
            code = r.returncode
        except Exception as e:  # noqa: BLE001
            code, salida = 1, f"{type(e).__name__}: {e}"
        res[nombre] = {"exit": code,
                       "resumen": ("ok" if code == 0 else salida.strip().splitlines()[-8:])}
        if code != 0:
            ok = False
    return ok, res


def main() -> int:
    ap = argparse.ArgumentParser(description="Gate mecánico del loop del TD-MCP")
    ap.add_argument("--action", choices=["commit", "auto-merge"], default="commit")
    ap.add_argument("--paths", nargs="*", default=None)
    ap.add_argument("--no-tests", action="store_true")
    ap.add_argument("--judge", dest="judge", action="store_true", default=True,
                    help="corre el juez externo (jev) sobre el arbol; por defecto ON")
    ap.add_argument("--no-judge", dest="judge", action="store_false",
                    help="saltea el juez externo (queda registrado en el ledger)")
    ap.add_argument("--brief-file", metavar="ARCHIVO", default=None,
                    help="brief enviado, para que el juez evalue el alcance")
    ap.add_argument("--attempt", metavar="ITEM", help="registrar un intento del item")
    ap.add_argument("--max-attempts", type=int, default=3)
    ap.add_argument("--status", action="store_true", help="intentos por item")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    if paused():
        print("loop pausado (loop-pause-all o STATE.md) — el gate no deja pasar nada", file=sys.stderr)
        return 4

    if args.status:
        l = load_ledger()
        print(json.dumps(l, indent=2, ensure_ascii=False) if args.json
              else "\n".join(f"  item {k}: {v['attempts']} intento(s)" for k, v in l["items"].items()) or "  (sin intentos registrados)")
        return 0

    if args.attempt:
        return register_attempt(args.attempt, args.max_attempts)

    if not GATE.exists():
        print("no existe gate.yaml: sin gate no hay auto-publicación", file=sys.stderr)
        return 2
    gate = load_gate(GATE)

    paths = args.paths if args.paths else changed_paths()
    paths = [p for p in paths if p.strip()]
    if not paths:
        print("ALLOW (no hay cambios que revisar)")
        return 0

    motivos: list[str] = []
    denylist = list(gate.get("denylist") or [])
    allowlist = list(gate.get("autoMergeAllowlist") or [])
    max_files = int(gate.get("maxFiles") or 999)
    max_lines = int(gate.get("maxLines") or 10**9)

    for p in paths:
        hit = match_any(p, denylist)
        if hit:
            motivos.append(f"'{p}' está en la denylist (patrón '{hit}'): requiere revisión humana explícita")
        if args.action == "auto-merge" and not match_any(p, allowlist):
            motivos.append(f"'{p}' no está en el allowlist de auto-merge")

    if len(paths) > max_files:
        motivos.append(f"{len(paths)} archivos > maxFiles={max_files}: cambio demasiado grande para auto-publicar")
    lineas = added_lines(paths)
    if lineas > max_lines:
        motivos.append(f"{lineas} líneas agregadas > maxLines={max_lines}")

    if not motivos and args.judge:
        permite, v, motivo = run_judge(args.brief_file)
        judge_info = {"veredicto": v.get("veredicto"), "naturaleza": v.get("naturaleza"),
                      "debilita": v.get("debilita"), "corresponde_al_brief": v.get("corresponde_al_brief"),
                      "costo_usd": v.get("costo_usd"), "motivo": motivo}
        print(("  \u2714 juez externo (jev): " if permite else "  \u2716 juez externo (jev): BLOQUEA — ") + motivo)
        if not permite:
            motivos.append(f"juez externo (jev): {motivo}")
    else:
        judge_info = {"estado": "salteado" if args.judge else "apagado"}

    tests_info = None
    if not motivos and gate.get("requireGreenTests", True) and not args.no_tests:
        ok, tests_info = run_tests()
        if not ok:
            motivos.append("las suites no están verdes (ver detalle)")

    veredicto = "BLOCK" if motivos else "ALLOW"
    resumen = {"veredicto": veredicto, "accion": args.action, "judge": judge_info, "archivos": len(paths),
               "lineas_agregadas": lineas, "motivos": motivos, "tests": tests_info, "paths": paths[:20]}
    if args.json:
        print(json.dumps(resumen, indent=2, ensure_ascii=False))
    else:
        print(f"{veredicto} · acción={args.action} · {len(paths)} archivo(s), {lineas} línea(s) agregadas")
        for m in motivos:
            print(f"  ✖ {m}")
        if not motivos:
            print("  ✔ dentro de gate.yaml (denylist, maxFiles/maxLines, allowlist, suites verdes)")

    if veredicto == "ALLOW":
        append_runlog(f"- {datetime.now(timezone.utc).isoformat(timespec='seconds')} | gate | — | {args.action} sobre {len(paths)} archivo(s) | ALLOW | gate.yaml")
        return 0
    append_runlog(f"- {datetime.now(timezone.utc).isoformat(timespec='seconds')} | gate | — | {args.action} sobre {len(paths)} archivo(s) | BLOCK: {'; '.join(motivos)[:200]} | gate.yaml")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
