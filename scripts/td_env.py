#!/usr/bin/env python3
"""td_env.py — guardian del entorno TouchDesigner para el loop de auto-mejora del TD-MCP.

El agujero real: NADA en el repo levanta TouchDesigner. El bridge se abre a mano, asi
que toda verificacion "en vivo" queda pendiente para siempre (es el `Pendiente:` que
aparece en los items 04 y 30 del BACKLOG) y la pata live del CI nocturno nunca corre
(necesita un self-hosted runner con TD abierto).

Y un segundo agujero, encontrado al probarlo el 20/09/26: `C:\\Program Files\\Derivative\\TouchDesigner\\`
(el install SIN version) es **TouchDesigner 2023.11340**, un build viejo, mientras que
todo el conocimiento del repo (AGENTS.md, matriz POP, reglas GLSL) esta verificado sobre
**2025.32460 / 2025.31760**. Lanzar "TouchDesigner.exe" a secas corre las pruebas en vivo
contra el build equivocado -> falsos fallos y evidencia invalida. Por eso este script
ahora **elige el build por version y despues lo VERIFICA contra /info**.

  python scripts/td_env.py --check                  # solo mira (read-only, default)
  python scripts/td_env.py --list-installs          # que builds hay en la maquina
  python scripts/td_env.py --wait 240               # espera a que responda el bridge
  python scripts/td_env.py --launch                 # ABRE el build esperado con el .toe

Veredictos:
  LIVE          bridge responde Y el build coincide con el esperado   -> exit 0
  WRONG_BUILD   bridge responde pero es OTRO build                    -> exit 5
  STARTING      se lanzo, esperando el bridge                         -> exit 3
  DOWN          bridge no responde                                    -> exit 3
  exit 4 si falta el .toe o no hay ningun TouchDesigner.exe

Autor: Hermes / Tolchx — 2026-09-20
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
BRIDGE_URL = "http://127.0.0.1:44444/info"
BRIDGE_PORT = 44444

# .toe con el bridge (el MISMO que reporta /info -> projectPath)
TOE_CANDIDATES = [
    REPO / "toe" / "TouchDesignerAPI.1.toe",
    REPO / "toe" / "TouchDesignerAPI.toe",
    REPO / "toe" / "develop.toe",
]

# El build sobre el que esta verificado el conocimiento del repo (AGENTS.md, matriz POP,
# reglas GLSL). Override: --expect-build o env TD_EXPECTED_BUILD.
DEFAULT_EXPECTED_BUILD = "2025.32460"
DERIVATIVE_DIRS = [
    Path(r"C:\Program Files\Derivative"),
    Path(r"C:\Program Files\Derivative\TouchDesigner"),
    Path(os.path.expandvars(r"%LOCALAPPDATA%\Programs\Derivative")),
]

VER_RE = re.compile(r"TouchDesigner\.(\d{4}\.\d{3,5})$", re.IGNORECASE)


# ── descubrimiento de instalaciones ──────────────────────────────────────────
def discover_installs() -> list[tuple[str, Path]]:
    """-> [(build, exe)] ordenado por build DESC. 'desconocida' al final.

    El build sale del NOMBRE de la carpeta (los instaladores de TD usan
    `TouchDesigner.<build>`); la carpeta sin sufijo no declara version, asi que se
    prueba al final y hay que confirmarla contra /info.
    """
    found: dict[str, Path] = {}
    for base in DERIVATIVE_DIRS:
        if not base.is_dir():
            continue
        for d in base.iterdir():
            if not d.is_dir() or not d.name.lower().startswith("touchdesigner"):
                continue
            exe = d / "bin" / "TouchDesigner.exe"
            if not exe.is_file():
                continue
            m = VER_RE.match(d.name)
            build = m.group(1) if m else "desconocida"
            found.setdefault(build, exe)

    def key(item: tuple[str, Path]) -> tuple:
        build = item[0]
        if build == "desconocida":
            return (0,)                       # siempre al final
        nums = tuple(int(x) for x in build.split("."))
        return (1, nums)

    return sorted(found.items(), key=key, reverse=True)


def pick_exe(installs: list[tuple[str, Path]], expected: str) -> tuple[str, Path] | None:
    """Prefiere el build esperado; si no esta, el 2025 mas nuevo; si no, cualquiera."""
    for build, exe in installs:
        if build == expected:
            return build, exe
    for build, exe in installs:
        if build.startswith("2025."):
            return build, exe
    return installs[0] if installs else None


# ── bridge ───────────────────────────────────────────────────────────────────
def probe(timeout: float = 5.0) -> dict | None:
    try:
        with urllib.request.urlopen(BRIDGE_URL, timeout=timeout) as r:
            return json.loads(r.read().decode("utf-8", "replace"))
    except Exception:
        return None


def wait_for_bridge(seconds: float, interval: float = 5.0) -> dict | None:
    deadline = time.time() + seconds
    while time.time() < deadline:
        info = probe()
        if info:
            return info
        time.sleep(interval)
    return None


def first_existing(paths: list[Path]) -> Path | None:
    for p in paths:
        if p.is_file():
            return p
    return None


# ── proceso de TD ────────────────────────────────────────────────────────────
def td_running() -> bool:
    try:
        out = subprocess.run(
            ["tasklist", "/FI", "IMAGENAME eq TouchDesigner.exe", "/NH"],
            capture_output=True, text=True, timeout=20).stdout
        return "TouchDesigner.exe" in out
    except Exception:
        return False


def kill_td(timeout: float = 30.0) -> bool:
    """Cierra todos los TouchDesigner.

    Args en LISTA, nunca string: en git-bash/MSYS un `/F` se reescribe como ruta
    (`C:/.../F`) o `//F`, y taskkill falla con "Invalid argument/option".
    """
    subprocess.run(["taskkill", "/F", "/IM", "TouchDesigner.exe"],
                   capture_output=True, text=True, timeout=45,
                   check=False)
    deadline = time.time() + timeout
    while time.time() < deadline:
        if not td_running():
            return True
        time.sleep(1.5)
    return not td_running()


def classify(info: dict, expected: str) -> tuple[str, int]:
    """-> (veredicto, exit_code)"""
    build = str(info.get("build") or info.get("release") or "desconocido")
    if expected and build != expected:
        return "WRONG_BUILD", 5
    return "LIVE", 0


def report(info: dict, expected: str) -> tuple[str, int]:
    verdict, code = classify(info, expected)
    build = info.get("build") or info.get("release")
    print(verdict)
    print(f"  build: {build}"
          + (f"  (esperado {expected})" if expected else "")
          + ("" if verdict == "LIVE" else "  <-- NO correr pruebas en vivo contra este build"))
    for k in ("projectPath", "projectFPS", "release", "readCache"):
        if k in info:
            print(f"  {k}: {info[k]}")
    return verdict, code


# ── main ─────────────────────────────────────────────────────────────────────
def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--check", action="store_true", help="solo mirar (default)")
    ap.add_argument("--list-installs", action="store_true", help="listar builds instalados")
    ap.add_argument("--wait", type=float, default=0, metavar="SEG",
                    help="esperar hasta SEG segundos a que el bridge responda")
    ap.add_argument("--launch", action="store_true",
                    help="abrir TouchDesigner (el build esperado) con el .toe del bridge")
    ap.add_argument("--restart", action="store_true",
                    help="si hay un TD corriendo con el build EQUIVOCADO, cerrarlo y abrir el correcto")
    ap.add_argument("--expect-build", default=os.environ.get("TD_EXPECTED_BUILD",
                                                             DEFAULT_EXPECTED_BUILD),
                    help=f"build contra el que se valida (default {DEFAULT_EXPECTED_BUILD})")
    args = ap.parse_args()

    # --restart implica --launch: pediste reiniciar, no solo diagnosticar
    if args.restart:
        args.launch = True

    installs = discover_installs()

    if args.list_installs:
        if not installs:
            print("No encontre ninguna instalacion de TouchDesigner.")
            return 4
        print(f"Instalaciones encontradas (esperado: {args.expect_build}):")
        for build, exe in installs:
            flag = "  <-- el esperado" if build == args.expect_build else ""
            print(f"  {build:<14} {exe}{flag}")
        picked = pick_exe(installs, args.expect_build)
        print(f"\nSe usaria: {picked[0]} -> {picked[1]}" if picked else "\nNinguna usable.")
        return 0

    # 1) el bridge ya responde?
    info = probe()
    if info:
        verdict, code = report(info, args.expect_build)
        if verdict == "WRONG_BUILD" and args.restart:
            print(f"\n--restart: cerrando TouchDesigner {info.get('build')} "
                  f"y abriendo {args.expect_build}")
            if not kill_td():
                print("  no pude cerrar TouchDesigner; abortando")
                return 3
            print("  cerrado")
        else:
            return code

    # 2) no responde
    picked = pick_exe(installs, args.expect_build)
    toe = first_existing(TOE_CANDIDATES)

    if not args.launch:
        print("DOWN")
        print(f"  bridge {BRIDGE_URL} no responde")
        print(f"  build a usar    : {picked[0] + ' -> ' + str(picked[1]) if picked else 'NINGUNO'}")
        print(f"  .toe del bridge : {toe if toe else 'NO ENCONTRADO'}")
        print("  -> correr con --launch para abrirlo, o abrirlo a mano")
        return 4 if (not picked or not toe) else 3

    if not picked or not toe:
        print("ERROR: falta una instalacion usable o el .toe del bridge")
        print(f"  instalacion: {picked}")
        print(f"  .toe       : {toe}")
        return 4

    build, exe = picked
    if build != args.expect_build:
        print(f"AVISO: no encontre el build {args.expect_build}; uso {build}")
    print(f"STARTING — lanzando TouchDesigner {build} ({exe})")
    print(f"           con {toe.name}")

    # TD acepta la ruta del .toe como argumento posicional y abre ese proyecto.
    subprocess.Popen([str(exe), str(toe)], cwd=str(toe.parent),
                     creationflags=getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0))

    info = wait_for_bridge(args.wait if args.wait > 0 else 240)
    if info:
        _, code = report(info, args.expect_build)
        return code
    print("DOWN — TouchDesigner no expuso el bridge a tiempo")
    print(f"  revisar que el .toe tenga el DAT del bridge activo (puerto {BRIDGE_PORT})")
    return 3


if __name__ == "__main__":
    sys.exit(main())
