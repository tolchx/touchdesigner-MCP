#!/usr/bin/env python3
"""loop_promote.py — convierte un candidato del triage en trabajo real.

El descubrimiento (`loop_triage.py`) deja candidatos con evidencia en
`loop-candidates.json`. Este script hace la parte MECÁNICA de promoverlos, para que el
agente del ciclo diario no improvise:

  1. elige el candidato de mayor peso que todavía no fue promovido,
  2. le asigna el próximo número de item libre del BACKLOG,
  3. escribe el item en `.freebuff_tasks/BACKLOG.md` (canónico) y en `docs/BACKLOG.md` (espejo),
  4. escribe un brief en la cola de Freebuff si el candidato es accionable por un agente
     (si necesita una decisión de Tolch, lo marca como tal en vez de inventar una tarea),
  5. registra la promoción en `loop-ledger.json` y la anota en `loop-run-log.md`.

Uso:
  python scripts/loop_promote.py                 # promueve el candidato de mayor peso
  python scripts/loop_promote.py --list          # muestra candidatos y su estado
  python scripts/loop_promote.py --candidate ID  # promueve uno puntual
  python scripts/loop_promote.py --dry-run       # muestra qué haría, sin escribir

Códigos de salida: 0 = promovió algo (o no había nada), 5 = solo decisiones humanas pendientes,
4 = loop pausado.
"""
from __future__ import annotations

import argparse
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CANDIDATES = ROOT / "loop-candidates.json"
LEDGER = ROOT / "loop-ledger.json"
RUNLOG = ROOT / "loop-run-log.md"
BACKLOGS = [ROOT / ".freebuff_tasks" / "BACKLOG.md", ROOT / "docs" / "BACKLOG.md"]
QUEUE = ROOT / ".freebuff_tasks" / "queue"

# Un candidato es accionable por un agente si su evidencia apunta a código o tests del repo.
ACCIONABLE = {
    "arbol-sucio": False,        # decidir qué es residuo y qué es trabajo: criterio humano
    "cola-drift": True,
    "cola-larga": False,         # priorizar es criterio humano
    "suite-node-roja": True,
    "suite-python-roja": True,
    "log-connect_reset": True,
    "log-timeout": True,
}
POR_PREFIJO = (("vivo-rojo-", True), ("vivo-pendiente-", True), ("error-sig_", True))


def accionable(cand: dict) -> bool:
    cid = cand.get("id", "")
    if cid in ACCIONABLE:
        return ACCIONABLE[cid]
    for prefijo, val in POR_PREFIJO:
        if cid.startswith(prefijo):
            return val
    return False


def pausado() -> bool:
    if (ROOT / "loop-pause-all").exists():
        return True
    st = ROOT / ".freebuff_tasks" / "STATE.md"
    return bool(st.exists() and re.search(r"^loop:\s*paused", st.read_text(encoding="utf-8", errors="replace"), re.M))


def cargar() -> dict:
    if not CANDIDATES.exists():
        return {"candidatos": [], "promovidos": {}}
    data = json.loads(CANDIDATES.read_text(encoding="utf-8"))
    data.setdefault("promovidos", {})
    return data


def guardar(data: dict) -> None:
    CANDIDATES.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def proximo_numero() -> int:
    bl = ROOT / "docs" / "BACKLOG.md"
    texto = bl.read_text(encoding="utf-8", errors="replace") if bl.exists() else ""
    nums = [int(n) for n in re.findall(r"^- \[[ x]\] (\d+)\.", texto, re.M)]
    return (max(nums) + 1) if nums else 1


def escribir_item(numero: int, cand: dict) -> None:
    ev = cand.get("evidencia")
    if isinstance(ev, list):
        ev_txt = "; ".join(str(e) for e in ev[:5])
    else:
        ev_txt = str(ev)
    linea = (f"- [ ] {numero}. **Hallado por el loop (triage automático)** — {cand['titulo']}. "
             f"Evidencia: {ev_txt}. Cómo lo detectó: `loop_triage.py` (id `{cand['id']}`, huella "
             f"`{cand.get('huella', '?')}`). Qué hacer: {cand.get('sugerencia', 'evaluar y resolver')}.")
    for bl in BACKLOGS:
        if not bl.exists():
            continue
        s = bl.read_text(encoding="utf-8")
        if cand.get("huella") and cand["huella"] in s:
            continue
        bl.write_text(s.rstrip() + "\n\n" + linea + "\n", encoding="utf-8", newline="")


def escribir_brief(numero: int, cand: dict) -> Path:
    QUEUE.mkdir(parents=True, exist_ok=True)
    nombre = f"{numero}_{re.sub(r'[^a-z0-9]+', '_', cand['id'].lower())[:40]}.txt"
    destino = QUEUE / nombre
    ev = cand.get("evidencia")
    ev_txt = "\n".join(f"  - {e}" for e in ev[:8]) if isinstance(ev, list) else f"  - {ev}"
    destino.write_text(f"""Trabajá en este repo (servidor MCP de TouchDesigner).

TAREA (ítem {numero} del BACKLOG): {cand['titulo']}

ESTE ÍTEM NO LO ESCRIBIÓ UN HUMANO: lo encontró el loop de descubrimiento
(`scripts/loop_triage.py`, id `{cand['id']}`, huella `{cand.get('huella')}`) leyendo señales
reales del repo. La evidencia es la que detectó el script, sin interpretación de por medio.

═══ EVIDENCIA ═══
{ev_txt}

═══ SUGERENCIA DEL TRIAGE ═══
{cand.get('sugerencia', 'evaluar y resolver')}

═══ REGLAS (loop-constraints.md) ═══
- Un ítem por corrida. No refactorices nada fuera del alcance de esta evidencia.
- Antes de proponer el fix: `npm run build`, `npm run typecheck`, `npm run ci`, la suite Node
  completa y las suites Python offline. Pegá los conteos reales.
- Prohibido deshabilitar o saltear tests para dejar CI en verde. Un test en rojo es un hallazgo.
- Si la evidencia del triage resulta ser un falso positivo, DECILO y cerrá el ítem explicando
  por qué (no lo "arregles" agregando código que no hace falta).
- Máximo 3 intentos; al cuarto se escala con el historial (loop-ledger.json).
- Nada de `raise SystemExit` ni efectos de import en código que corre dentro de TD.
- Push solo después de `python scripts/loop_gate.py --action commit --paths <archivos>`.

═══ CRITERIO DE ACEPTACIÓN ═══
El síntoma que describe la evidencia ya no se reproduce, y hay un test (o una verificación
en vivo, si TD está arriba) que lo demuestra. Sin eso, el ítem queda abierto.
""", encoding="utf-8", newline="")
    return destino


def anotar_runlog(numero: int, cand: dict, brief: Path | None, motivo: str) -> None:
    linea = (f"- {datetime.now(timezone.utc).isoformat(timespec='seconds')} | promocion | L1 | "
             f"{cand['id']} (peso {cand.get('peso')}) | {'brief ' + brief.name if brief else motivo} | "
             f"item {numero} | loop-candidates.json")
    if not RUNLOG.exists():
        RUNLOG.write_text("# loop-run-log.md\n", encoding="utf-8")
    with RUNLOG.open("a", encoding="utf-8") as fh:
        fh.write(linea + "\n")


def registrar_ledger(numero: int, cand: dict) -> None:
    l = {"items": {}}
    if LEDGER.exists():
        try:
            l = json.loads(LEDGER.read_text(encoding="utf-8"))
        except Exception:  # noqa: BLE001
            pass
    l.setdefault("items", {})[str(numero)] = {"attempts": 0, "history": [],
                                              "origen": "loop_triage", "candidato": cand["id"]}
    LEDGER.write_text(json.dumps(l, indent=2, ensure_ascii=False), encoding="utf-8")


def main() -> int:
    ap = argparse.ArgumentParser(description="Promueve un candidato del triage a item + brief")
    ap.add_argument("--candidate", help="id del candidato a promover")
    ap.add_argument("--list", action="store_true", help="listar candidatos y estado")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    if pausado():
        print("loop pausado (loop-pause-all o STATE.md)", file=os.sys.stderr)
        return 4

    data = cargar()
    candidatos = data.get("candidatos", [])
    promovidos = data.get("promovidos", {})

    if args.list:
        for c in candidatos:
            estado = "promovido" if c.get("huella") in promovidos else ("accionable" if accionable(c) else "decision humana")
            print(f"  [{c.get('peso')}] {c['id']:<28} {estado:<16} {c['titulo'][:60]}")
        return 0

    pendientes = [c for c in candidatos
                  if c.get("huella") not in promovidos and (args.candidate is None or c["id"] == args.candidate)]
    if not pendientes:
        print("no hay candidatos nuevos para promover")
        return 0

    pendientes.sort(key=lambda c: -int(c.get("peso", 0)))
    cand = pendientes[0]
    humano = not accionable(cand)
    numero = proximo_numero()

    if humano:
        print(f"decisión humana (no escribo brief): [{cand['peso']}] {cand['titulo']}")
        print(f"  id: {cand['id']} · huella: {cand.get('huella')}")
        print(f"  evidencia: {str(cand.get('evidencia'))[:300]}")
        print(f"  {cand.get('sugerencia', '')}")
        if not args.dry_run:
            escribir_item(numero, cand)
            promovidos[cand["huella"]] = {"item": numero, "accionable": False,
                                          "promovido_en": datetime.now(timezone.utc).isoformat(timespec="seconds")}
            data["promovidos"] = promovidos
            guardar(data)
            anotar_runlog(numero, cand, None, "item sin brief (decide Tolch)")
            registrar_ledger(numero, cand)
            print(f"  → item {numero} escrito en ambos BACKLOG (sin brief)")
        return 5

    if args.dry_run:
        print(f"[dry-run] promovería [{cand['peso']}] {cand['titulo']} como item {numero} + brief en la cola")
        return 0

    escribir_item(numero, cand)
    brief = escribir_brief(numero, cand)
    promovidos[cand["huella"]] = {"item": numero, "accionable": True, "brief": brief.name,
                                  "promovido_en": datetime.now(timezone.utc).isoformat(timespec="seconds")}
    data["promovidos"] = promovidos
    guardar(data)
    registrar_ledger(numero, cand)
    anotar_runlog(numero, cand, brief, "")
    print(f"promovido: [{cand['peso']}] {cand['titulo']}")
    print(f"  → item {numero} en ambos BACKLOG")
    print(f"  → brief {brief.name} en la cola")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
