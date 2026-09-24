#!/usr/bin/env python3
"""Aceptación EN VIVO del item 46 (portabilidad + anti-traversal) contra el bridge real.

Comprueba que las rutas estáticas se resuelven SIN TDMCP_STATIC_ROOT (o sea, por
los candidatos relativos al repo/.toe, que es lo que hace portable el entregable)
y que no se puede salir de la raíz con ../ en /assets/.

Uso:  python scripts/live/twozero_http_live.py
Salida: JSON por stdout + .freebuff_tasks/evidence/twozero_http_live.json
"""
from __future__ import annotations

import json
import os
import pathlib
import urllib.error
import urllib.request

BRIDGE = "http://127.0.0.1:44444"
ROOT = pathlib.Path(__file__).resolve().parents[2]
EVID = ROOT / ".freebuff_tasks" / "evidence"

out = {"checks": []}


def get(path: str, timeout: float = 10.0):
    req = urllib.request.Request(BRIDGE + path)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read(), r.headers.get("Content-Type", "")
    except urllib.error.HTTPError as e:
        return e.code, e.read(), e.headers.get("Content-Type", "")
    except Exception as e:
        return None, str(e).encode(), ""


def rec(name, ok, detail):
    out["checks"].append({"name": name, "ok": bool(ok), "detail": detail})
    print(f"{'OK  ' if ok else 'FAIL'}  {name}  {json.dumps(detail, ensure_ascii=False)[:220]}")


print("TDMCP_STATIC_ROOT en el entorno del tester:", os.environ.get("TDMCP_STATIC_ROOT"))

# 1) /dashboard y /web2touch resuelven por candidatos relativos
for route, needle in (("/dashboard", "<html"), ("/web2touch", "<html")):
    st, body, ctype = get(route)
    txt = body.decode("utf-8", "replace")
    ok = st == 200 and needle.lower() in txt.lower() and "<h1>Not found:" not in txt
    rec(f"GET {route} sirve HTML real (sin env var)", ok, {"status": st, "bytes": len(body), "ctype": ctype, "fallback": "<h1>Not found:" in txt})

# 2) /assets/<algo.js> real
st, body, ctype = get("/web2touch")
assets = []
for token in body.decode("utf-8", "replace").split('"'):
    if token.startswith("/assets/") and token.endswith((".js", ".css")):
        assets.append(token)
    if len(assets) >= 1:
        break
if not assets:
    assets = ["/assets/app.js"]
st, body, ctype = get(assets[0])
rec(f"GET {assets[0]} sirve el asset con su MIME", st == 200 and len(body) > 0, {"status": st, "bytes": len(body), "ctype": ctype})

# 3) anti-traversal: no se puede salir de web2touch/
st, body, ctype = get("/assets/../../package.json")
txt = body.decode("utf-8", "replace")
leaked = '"name": "claude-touchdesigner"' in txt or '"dependencies"' in txt
rec("GET /assets/../../package.json NO filtra package.json", not leaked, {"status": st, "bytes": len(body), "head": txt[:120]})

# 4) el bridge sigue sano después de los intentos
st, body, _ = get("/info")
rec("GET /info sigue respondiendo", st == 200 and b"build" in body, {"status": st, "bytes": len(body)})

out["all_ok"] = all(c["ok"] for c in out["checks"])
EVID.mkdir(parents=True, exist_ok=True)
(EVID / "twozero_http_live.json").write_text(json.dumps(out, indent=2, ensure_ascii=False), encoding="utf-8")
print("\nevidence:", EVID / "twozero_http_live.json")
print("ALL_OK=", out["all_ok"])
raise SystemExit(0 if out["all_ok"] else 1)
