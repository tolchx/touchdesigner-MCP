#!/usr/bin/env python3
"""reconcile_backlog_queue.py — conciliacion determinista BACKLOG <-> queue <-> sent + STATE.md

Cierra el agujero que quema sesiones de Freebuff: briefs que siguen encolados para
items ya cerrados en el BACKLOG. El relay envia por orden alfabetico, asi que un brief
rancio se manda primero y se gasta una sesion en trabajo ya hecho.

Sin LLM, sin red. Salidas:
  (sin flags)  informe legible (read-only)
  --check      exit 3 si hay drift  -> usable como `script` de cron no_agent
  --apply      mueve los briefs rancios a .freebuff_tasks/stale/ y escribe STATE.md

Autor: Hermes / Tolchx — 2026-09-20
"""
from __future__ import annotations

import argparse
import datetime as dt
import re
import shutil
import subprocess
import sys
from pathlib import Path

# ── rutas ────────────────────────────────────────────────────────────────────
REPO = Path(__file__).resolve().parent.parent
TASKS = REPO / ".freebuff_tasks"
BACKLOG = TASKS / "BACKLOG.md"
BACKLOG_MIRROR = REPO / "docs" / "BACKLOG.md"
QUEUE = TASKS / "queue"
SENT = TASKS / "sent"
STALE = TASKS / "stale"
STATE = TASKS / "STATE.md"

# ── parsing ──────────────────────────────────────────────────────────────────
# "- [x] 31. GLSL TOP tooling — ..."  /  "- [ ] 07. `/diff` — ..."
ITEM_RE = re.compile(r"^\s*-\s*\[(?P<mark>[ xX])\]\s*(?P<num>\d{1,3})\.\s*(?P<title>.+?)\s*$")
# "TAREA (item 06 del BACKLOG)"  /  "(item 07)"; tolera acentos y mayusculas
REF_RE = re.compile(r"\(?\s*[ií]tem\s+(?P<num>\d{1,3})\b", re.IGNORECASE)
# lineas de trabajo pendiente de verificacion en vivo
LIVE_HINT_RE = re.compile(
    r"pendiente\s*:.*?(vivo|TD_UNREACHABLE|bridge|matriz|TD\b)"
    r"|TD_UNREACHABLE"
    r"|pendiente\s*:.*?re-?corrida",
    re.IGNORECASE | re.DOTALL,
)


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="replace")


def env_verdict() -> str:
    """Veredicto del guardian del entorno (scripts/td_env.py). Sin TD devuelve 'DOWN'."""
    td_env = REPO / "scripts" / "td_env.py"
    if not td_env.is_file():
        return "SIN GUARDIAN"
    try:
        out = subprocess.run([sys.executable, str(td_env), "--check"],
                             capture_output=True, text=True, timeout=60).stdout
        return (out.strip().splitlines() or ["?"])[0]
    except Exception as e:
        return f"ERROR ({e.__class__.__name__})"


def parse_backlog(path: Path) -> dict[int, dict]:
    """-> {num: {num, title, done, live_pending, raw}}"""
    items: dict[int, dict] = {}
    if not path.is_file():
        return items
    for line in read(path).splitlines():
        m = ITEM_RE.match(line)
        if not m:
            continue
        num = int(m.group("num"))
        done = m.group("mark").lower() == "x"
        items[num] = {
            "num": num,
            "title": m.group("title").strip(),
            "done": done,
            "live_pending": bool(done and LIVE_HINT_RE.search(line)),
            "raw": line.strip(),
        }
    return items


def brief_ref(path: Path) -> tuple[int | None, str]:
    """Numero de item del BACKLOG referenciado por un brief + como se detecto."""
    body = read(path)
    m = REF_RE.search(body[:2000])  # la referencia va en el encabezado
    if m:
        return int(m.group("num")), "cuerpo"
    # fallback: prefijo NN_ del nombre (ojo: ese NN suele ser ordinal de cola, no item)
    m = re.match(r"(\d{1,3})[_\-]", path.stem)
    if m:
        return int(m.group(1)), "nombre(aproximado)"
    return None, "sin referencia"


def classify(items: dict[int, dict]) -> list[dict]:
    rows: list[dict] = []
    for d, kind in ((QUEUE, "cola"), (SENT, "enviado")):
        if not d.is_dir():
            continue
        for f in sorted(d.iterdir()):
            if not f.is_file() or f.name.startswith("."):
                continue
            num, how = brief_ref(f)
            it = items.get(num) if num is not None else None
            if it is None:
                verdict = "HUERFANO"
            elif it["done"]:
                verdict = "RANCIO"      # el item ya esta [x]
            elif how.startswith("nombre"):
                verdict = "DUDA"        # referencia solo por nombre de archivo
            else:
                verdict = "OK"
            rows.append({
                "dir": kind, "file": f, "name": f.name, "num": num,
                "how": how, "verdict": verdict, "title": it["title"] if it else "",
            })
    return rows


# ── STATE.md ─────────────────────────────────────────────────────────────────
def write_state(items: dict[int, dict], rows: list[dict], applied: bool) -> None:
    now = dt.datetime.now().isoformat(timespec="seconds")
    queued = [r for r in rows if r["dir"] == "cola"]
    live = [it for it in items.values() if it["live_pending"]]
    open_items = [it for it in items.values() if not it["done"]]
    done_items = [it for it in items.values() if it["done"]]

    L: list[str] = []
    L.append("# STATE.md — TD-MCP (generado por scripts/reconcile_backlog_queue.py)")
    L.append("")
    stale_q = [r for r in rows if r["verdict"] == "RANCIO" and r["dir"] == "cola"]
    stale_s = [r for r in rows if r["verdict"] == "RANCIO" and r["dir"] == "enviado"]
    L.append(f"Last run: {now}")
    L.append(f"Backlog: {len(done_items)}/{len(items)} items cerrados · "
             f"cola: {len(queued)} briefs · drift en cola: {len(stale_q)}"
             + (f" · rancios en historial (sent/): {len(stale_s)}" if stale_s else ""))
    env = env_verdict()
    L.append(f"Entorno TD: {env}  (guardián: scripts/td_env.py)")
    L.append("")
    L.append("## Bloqueado por entorno (necesita TD en vivo)")
    L.append("")
    if live:
        for it in sorted(live, key=lambda x: x["num"]):
            L.append(f"- **{it['num']:02d}.** {it['title'][:110]}")
        L.append("")
        if env == "LIVE":
            L.append("> Entorno LIVE: estas verificaciones YA se pueden correr — "
                     "no quedan bloqueadas, quedan por correr.")
        else:
            L.append(f"> Entorno {env}: estas verificaciones NO pueden correr ahora. "
                     "Levantar TD con `python scripts/td_env.py --launch` "
                     "(o `--restart` si hay otro build abierto)."
                     " Nada en el repo lo hacía solo antes de esto.")
    else:
        L.append("- (ninguno detectado por el parser)")
    L.append("")
    L.append("## Alta prioridad (backlog abierto)")
    L.append("")
    for it in sorted(open_items, key=lambda x: x["num"]):
        L.append(f"- [ ] {it['num']:02d}. {it['title'][:110]}")
    L.append("")
    L.append("## Cola de Freebuff")
    L.append("")
    if queued:
        for r in queued:
            flag = {"OK": "OK", "RANCIO": "RANCIO — item ya cerrado",
                    "HUERFANO": "SIN REFERENCIA", "DUDA": "revisar"}[r["verdict"]]
            L.append(f"- `{r['name']}` -> item {r['num']} [{flag}]")
    else:
        L.append("- (vacia)")
    L.append("")
    L.append("## Resuelto recientemente")
    L.append("")
    for it in sorted(done_items, key=lambda x: x["num"])[-8:]:
        L.append(f"- [x] {it['num']:02d}. {it['title'][:100]}")
    L.append("")
    L.append("## Acciones del humano")
    L.append("")
    if applied:
        L.append("- (vacio)")
    else:
        L.append("- Correr `--apply` para mover los briefs rancios y congelar este estado.")
    L.append("")
    STATE.write_text("\n".join(L), encoding="utf-8")


# ── main ─────────────────────────────────────────────────────────────────────
def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--check", action="store_true", help="exit 3 si hay drift")
    ap.add_argument("--apply", action="store_true", help="mueve rancios y escribe STATE.md")
    args = ap.parse_args()

    items = parse_backlog(BACKLOG)
    if not items:
        print(f"ERROR: no pude leer items de {BACKLOG}")
        return 2

    rows = classify(items)
    # RANCIO solo es peligroso si sigue EN LA COLA; en sent/ es historial inofensivo.
    stale_queue = [r for r in rows if r["verdict"] == "RANCIO" and r["dir"] == "cola"]
    stale_sent = [r for r in rows if r["verdict"] == "RANCIO" and r["dir"] == "enviado"]
    stale = stale_queue + stale_sent
    orphans_queue = [r for r in rows if r["verdict"] == "HUERFANO" and r["dir"] == "cola"]
    orphans = [r for r in rows if r["verdict"] == "HUERFANO"]
    duda = [r for r in rows if r["verdict"] == "DUDA" and r["dir"] == "cola"]
    queued = [r for r in rows if r["dir"] == "cola"]

    print(f"BACKLOG: {len(items)} items · {sum(1 for i in items.values() if i['done'])} cerrados")
    print(f"Cola: {len(queued)} briefs · enviados: {sum(1 for r in rows if r['dir'] == 'enviado')}")
    print()

    if stale_queue:
        print(f"DRIFT: {len(stale_queue)} brief(s) ENCOLADOS para items YA CERRADOS")
        for r in stale_queue:
            print(f"  ! cola/{r['name']} -> item {r['num']} ({r['title'][:60]}) "
                  f"[detectado por {r['how']}]")
        print("  -> el relay los manda PRIMERO (orden alfabetico) y gasta Freebucks")
    else:
        print("Cola sana: ningun brief encolado apunta a un item cerrado.")
    if stale_sent:
        print(f"\n({len(stale_sent)} brief(s) rancios ya en sent/ — historial, no se tocan)")
    if orphans:
        print(f"\n{len(orphans)} brief(s) sin referencia a item:")
        for r in orphans:
            print(f"  ? {r['dir']}/{r['name']}")
    if duda:
        print(f"\n{len(duda)} brief(s) EN COLA con referencia solo por nombre de archivo (revisar a mano):")
        for r in duda:
            print(f"  ~ {r['dir']}/{r['name']} -> item {r['num']} (abierto)")

    live = [i for i in items.values() if i["live_pending"]]
    print(f"\nItems cerrados pero con verificacion EN VIVO pendiente: {len(live)}")
    for i in sorted(live, key=lambda x: x["num"]):
        print(f"  - {i['num']:02d}. {i['title'][:70]}")

    if args.apply:
        STALE.mkdir(parents=True, exist_ok=True)
        moved = 0
        for r in stale_queue:
            shutil.move(str(r["file"]), str(STALE / r["name"]))
            moved += 1
        # re-clasificar: STATE.md tiene que reflejar la cola DESPUES del movimiento
        rows = classify(items)
        write_state(items, rows, applied=True)
        print(f"\nAPPLY: {moved} brief(s) movidos a .freebuff_tasks/stale/ "
              f"(nada borrado) · STATE.md escrito")

    if args.check and (stale_queue or orphans_queue):
        return 3
    return 0


if __name__ == "__main__":
    sys.exit(main())
