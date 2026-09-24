#!/usr/bin/env python3
"""loop_worktree.py — aislamiento por intento (worktrees de git) para el loop.

Por qué: hoy el agente escribe SIEMPRE en el árbol principal. El gate y el juez externo son la
red de seguridad, pero si un intento sale mal el árbol queda sucio y hay que limpiarlo a mano
(ya pasó: evidencia, .toe, dist). Con un worktree por intento, el worktree se descarta y el
árbol principal no se enteró.

Uso:
    python scripts/loop_worktree.py create 47          # rama loop/47 + worktree
    python scripts/loop_worktree.py list
    python scripts/loop_worktree.py status 47
    python scripts/loop_worktree.py remove 47          # borra worktree Y rama (si no está mergeada)
    python scripts/loop_worktree.py remove 47 --keep-branch

Reglas (loop-constraints.md): un worktree por intento, se descarta tras REJECT o escalado.
El trabajo válido se trae al árbol principal SOLO por commit/cherry-pick revisado, nunca por
copia de archivos a mano.
"""
from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WORKTREES = ROOT / ".loop-worktrees"


def git(*args: str, cwd: Path | None = None, check: bool = False) -> subprocess.CompletedProcess:
    return subprocess.run(["git", *args], cwd=str(cwd or ROOT), capture_output=True, text=True,
                          encoding="utf-8", errors="replace", check=check)


def wt_path(item: str) -> Path:
    return WORKTREES / f"item-{item}"


def branch(item: str) -> str:
    return f"loop/{item}"


def cmd_create(item: str) -> int:
    ruta = wt_path(item)
    if ruta.exists():
        print(f"ya existe: {ruta}")
        return 0
    WORKTREES.mkdir(exist_ok=True)
    if "loop/" in git("branch", "--list", f"*loop/{item}*").stdout:
        print(f"la rama {branch(item)} ya existe: usá `remove` o elegí otro número")
        return 2
    r = git("worktree", "add", "-b", branch(item), str(ruta), "HEAD")
    if r.returncode != 0:
        print(f"git worktree add falló:\n{r.stderr.strip()}")
        return 3
    print(f"worktree listo: {ruta}\n  rama: {branch(item)}\n  (HEAD limpio: el intento no toca el árbol principal)")
    print(f"  trabajá ahí:  cd \"{ruta}\"")
    return 0


def cmd_list(_: str = "") -> int:
    r = git("worktree", "list", "--porcelain")
    actuales = [l.split(" ", 1)[1] for l in r.stdout.splitlines() if l.startswith("worktree ")]
    propios = [p for p in actuales if ".loop-worktrees" in p]
    if not propios:
        print("sin worktrees del loop")
        return 0
    for p in propios:
        item = Path(p).name.replace("item-", "")
        sucio = git("status", "--porcelain", cwd=Path(p)).stdout.strip()
        print(f"- item {item}: {p}  ({'con cambios sin commitear' if sucio else 'limpio'})")
    return 0


def cmd_status(item: str) -> int:
    ruta = wt_path(item)
    if not ruta.exists():
        print(f"no existe el worktree del item {item}")
        return 1
    print(git("status", "--short", cwd=ruta).stdout.strip() or "(sin cambios)")
    print("--- diff vs HEAD ---")
    print(git("diff", "--stat", cwd=ruta).stdout.strip() or "(sin diff)")
    return 0


def cmd_remove(args) -> int:
    item = args.item
    ruta = wt_path(item)
    if ruta.exists():
        sucio = git("status", "--porcelain", cwd=ruta).stdout.strip()
        if sucio and not args.force:
            print("el worktree tiene cambios sin commitear. Revisá con `status`, y si de verdad\n"
                  "se descarta, corré de nuevo con --force (o commiteá primero y hacé cherry-pick).")
            return 4
        r = git("worktree", "remove", str(ruta), *(["--force"] if args.force else []))
        if r.returncode != 0:
            print(r.stderr.strip())
            return 3
    if ruta.exists():
        shutil.rmtree(ruta, ignore_errors=True)
    git("worktree", "prune")
    if not args.keep_branch:
        rama = branch(item)
        mergeada = git("branch", "--merged", "HEAD").stdout
        if rama not in mergeada:
            print(f"OJO: {rama} NO está mergeada en HEAD: no la borro (el trabajo se perdería).\n"
                  f"      si querés mantenerla: ya quedó; para borrarla: git branch -D {rama}")
        else:
            git("branch", "-d", rama)
            print(f"rama {rama} borrada (estaba mergeada)")
    print(f"item {item}: worktree descartado")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description="worktrees aislados por intento para el loop")
    sub = ap.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("create"); c.add_argument("item")
    sub.add_parser("list")
    s = sub.add_parser("status"); s.add_argument("item")
    r = sub.add_parser("remove"); r.add_argument("item")
    r.add_argument("--keep-branch", action="store_true")
    r.add_argument("--force", action="store_true")
    a = ap.parse_args()
    return {"create": lambda: cmd_create(a.item), "list": lambda: cmd_list(),
            "status": lambda: cmd_status(a.item), "remove": lambda: cmd_remove(a)}[a.cmd]()


if __name__ == "__main__":
    raise SystemExit(main())
