#!/usr/bin/env python3
"""
Verify POP knowledge against the OFFICIAL TouchDesigner wiki
============================================================

Objetivo: que NADA de lo que guardemos como conocimiento POP quede sin validar.
Cruza tres fuentes y marca cada dato con su origen:

  A. WIKI OFICIAL  (docs.derivative.ca, MediaWiki API)  → fuente autoritativa
  B. LIVE TD       (docs/pop_matrix.json, generado hoy por test_pop_matrix.py) → comportamiento real
  C. CORPUS .toe   (mcp/data/pops/patterns.json, param_usage.json, glsl_library.json) → empírico

Chequeos:
  1. Lista de POPs: wiki (Category:POPs) vs live (dir(td) en TD) → faltantes en cada lado
  2. Páginas de wiki sin operador en el build actual, y POPs sin documentación oficial
  3. Parámetros: los documentados en la wiki vs los nombres reales (eval) del build vivo
  4. Estado experimental: marcado por la wiki ({{Experimental}} / "Experimental")
  5. Fuentes GLSL: que las funciones usadas (TDIndex, TDIn_P, ...) estén en la doc oficial de GLSL POP

Salidas:
  docs/POPs_VALIDATION.md
  mcp/data/pops/validation.json
  mcp/data/pops/wiki_category.json  (cache de la lista oficial)

Uso:
    python toe/src/verify_pop_knowledge.py [--offline]
"""

from __future__ import annotations

import argparse
import ast
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
DOCS = os.path.join(REPO, "docs")
POPS_DATA = os.path.join(REPO, "mcp", "data", "pops")

MATRIX_JSON = os.path.join(DOCS, "pop_matrix.json")
WIKI_CACHE = os.path.join(POPS_DATA, "wiki_category.json")
VALIDATION_JSON = os.path.join(POPS_DATA, "validation.json")
VALIDATION_MD = os.path.join(DOCS, "POPs_VALIDATION.md")

API = "https://docs.derivative.ca/api.php"
UA = {"User-Agent": "td-mcp-knowledge-validator/1.0"}

# Nombres especiales de página → clase de operador en TD
SPECIAL = {
    "chop to pop": "choptoPOP",
    "dat to pop": "dattoPOP",
    "top to pop": "toptoPOP",
    "sop to pop": "soptoPOP",
    "chop to pop": "choptoPOP",
    "dmx out pop": "dmxoutPOP",
    "dmx fixture pop": "dmxfixturePOP",
    "cplusplus pop": "cplusplusPOP",
    "glsl advanced pop": "glsladvancedPOP",
    "glsl copy pop": "glslcopyPOP",
    "glsl select pop": "glslselectPOP",
    "glsl create pop": "glslcreatePOP",
    "glsl pop": "glslPOP",
    "file in pop": "fileinPOP",
    "file out pop": "fileoutPOP",
    "import select pop": "importselectPOP",
    "lookup texture pop": "lookuptexturePOP",
    "lookup attribute pop": "lookupattributePOP",
    "lookup channel pop": "lookupchannelPOP",
    "math combine pop": "mathcombinePOP",
    "math mix pop": "mathmixPOP",
    "oak select pop": "oakselectPOP",
    "point file in pop": "pointfileinPOP",
    "point generator pop": "pointgeneratorPOP",
    "cache select pop": "cacheselectPOP",
    "cache blend pop": "cacheblendPOP",
    "attribute combine pop": "attributecombinePOP",
    "attribute convert pop": "attributeconvertPOP",
    "line break pop": "linebreakPOP",
    "line divide pop": "linedividePOP",
    "line metrics pop": "linemetricsPOP",
    "line resample pop": "lineresamplePOP",
    "line smooth pop": "linesmoothPOP",
    "line thick pop": "linethickPOP",
    "force radial pop": "forceradialPOP",
    "engine out pop": "engineoutPOP",
    "skin deform pop": "skindeformPOP",
    "texture map pop": "texturemapPOP",
}


def norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", s.lower())


def page_to_type(title: str) -> str:
    t = title.strip().lower()
    if t in SPECIAL:
        return SPECIAL[t]
    if t.endswith(" pop"):
        return norm(t[:-4]) + "POP"
    return norm(t)


def fetch_json(url: str, timeout: int = 40):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8", "replace"))


def fetch_text(url: str, timeout: int = 40) -> str:
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8", "replace")


def wiki_category(offline: bool):
    if offline and os.path.exists(WIKI_CACHE):
        return json.load(open(WIKI_CACHE, encoding="utf-8"))
    data = fetch_json(f"{API}?action=query&list=categorymembers&cmtitle=Category:POPs&cmlimit=500&format=json")
    members = [m["title"] for m in data.get("query", {}).get("categorymembers", [])]
    out = {"fetched_from": f"{API}?action=query&list=categorymembers&cmtitle=Category:POPs", "titles": members}
    os.makedirs(POPS_DATA, exist_ok=True)
    json.dump(out, open(WIKI_CACHE, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    return out


def wiki_page_info(title: str):
    """Trae categorías, flag experimental y lista de parámetros desde la wiki."""
    q = urllib.parse.quote(title)
    info = {"title": title}
    try:
        d = fetch_json(f"{API}?action=parse&page={q}&prop=wikitext|categories&format=json&redirects=1")
        parse = d.get("parse", {})
        wt = parse.get("wikitext", {}).get("*", "")
        cats = [c.get("*", "") for c in parse.get("categories", [])]
        info["url"] = f"https://docs.derivative.ca/{q.replace('%20', '_')}"
        info["experimental"] = bool(re.search(r"\{\{\s*Experimental|Experimental\b", wt, re.I))
        info["categories"] = cats
        # parámetros: filas de tabla wiki con {{Parameter|...}} o |name=
        params = set()
        for m in re.finditer(r"\{\{\s*Parameter\s*\|([^}]{0,400})", wt, re.I):
            body = m.group(1)
            nm = re.search(r"name\s*=\s*([^|}\n]+)", body, re.I)
            if nm:
                params.add(nm.group(1).strip())
        for m in re.finditer(r"\|\s*parname\s*=\s*([^|}\n]+)", wt, re.I):
            params.add(m.group(1).strip())
        info["wiki_params"] = sorted(params)
        info["wikitext_len"] = len(wt)
    except Exception as e:  # noqa: BLE001
        info["error"] = f"{type(e).__name__}: {e}"
    return info


def sample_validate(titles, n=6):
    """Valida una muestra de páginas contra la wiki en vivo (detecta scrape viejo)."""
    out = []
    for t in titles[:n]:
        out.append(wiki_page_info(t))
    return out


def probe_types_in_td(types):
    """Pregunta a TD (API :44444) si cada tipo existe como clase y si es creable por nombre."""
    if not types:
        return {}
    code = "res = {}\n" \
           "sb = op('/project1').op('wiki_probe') or op('/project1').create(baseCOMP, 'wiki_probe')\n"
    for t in types:
        code += (
            f"try:\n"
            f"    _o = sb.create('{t}', '{t.lower()}')\n"
            f"    res['{t}'] = {{'clase_td': hasattr(td, '{t}'), 'creable_por_nombre': True}}\n"
            f"    _o.destroy()\n"
            f"except Exception as _e:\n"
            f"    res['{t}'] = {{'clase_td': hasattr(td, '{t}'), 'creable_por_nombre': False, 'error': str(_e)[:120]}}\n"
        )
    code += "print(res)"
    try:
        body = json.dumps({"code": code}).encode()
        req = urllib.request.Request("http://127.0.0.1:44444/exec", data=body,
                                     headers={"Content-Type": "application/json"})
        raw = urllib.request.urlopen(req, timeout=60).read().decode("utf-8", "replace")
        out = json.loads(raw).get("output", "").strip()
        return ast.literal_eval(out) if out.startswith("{") else {"_raw": out}
    except Exception as e:  # noqa: BLE001
        return {"_error": f"{type(e).__name__}: {e}"}


def fetch_wiki_params(titles, cache_path, refresh=False, delay=0.25):
    """Baja de la wiki oficial (plantillas {{Parameter}}) el mapeo label↔nombre eval por POP.

    La plantilla trae |parLabel=Mode y |parName=mode — el mapeo autoritativo.
    Cachea a cache_path con fecha; usar refresh=True para forzar.
    """
    if os.path.exists(cache_path) and not refresh:
        return json.load(open(cache_path, encoding="utf-8"))
    out = {"fetched_from": API, "params_by_page": {}}
    for title in titles:
        try:
            q = urllib.parse.quote(title)
            d = fetch_json(f"{API}?action=parse&page={q}&prop=wikitext&format=json&redirects=1")
            wt = d.get("parse", {}).get("wikitext", {}).get("*", "")
            entries = []
            for m in re.finditer(r"\{\{Parameter\b(.*?)\}\}", wt, re.S):
                body = m.group(1)
                nm = re.search(r"\|\s*parName\s*=\s*([^\n|}]+)", body)
                lb = re.search(r"\|\s*parLabel\s*=\s*([^\n|}]+)", body)
                tp = re.search(r"\|\s*parType\s*=\s*([^\n|}]+)", body)
                if nm:
                    entries.append({
                        "eval": nm.group(1).strip(),
                        "label": (lb.group(1).strip() if lb else ""),
                        "type": (tp.group(1).strip() if tp else ""),
                    })
            out["params_by_page"][title] = entries
        except Exception as e:  # noqa: BLE001
            out["params_by_page"][title] = {"error": f"{type(e).__name__}: {e}"}
        time.sleep(delay)
    out["fetched_at"] = time.strftime("%Y-%m-%d %H:%M:%S")
    json.dump(out, open(cache_path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--offline", action="store_true", help="usar cache de la lista de la wiki")
    ap.add_argument("--samples", type=int, default=6, help="páginas a re-verificar en vivo")
    ap.add_argument("--refresh-wiki", action="store_true", help="forzar re-descarga de parámetros desde la wiki")
    args = ap.parse_args()

    if not os.path.exists(MATRIX_JSON):
        print(f"FALTA {MATRIX_JSON}: corré primero test_pop_matrix.py contra TD")
        return 2

    matrix = json.load(open(MATRIX_JSON, encoding="utf-8"))
    live = {r["type"]: r for r in matrix["results"]}
    live_types = set(live)

    cat = wiki_category(args.offline)
    wiki_titles = cat["titles"]
    wiki_map = {page_to_type(t): t for t in wiki_titles}
    wiki_types = set(wiki_map)

    # scrape offline del repo (junio 2026) para comparar params
    scrape = {}
    ops_dir = os.path.join(POPS_DATA, "operators")
    if os.path.isdir(ops_dir):
        for f in os.listdir(ops_dir):
            if f.endswith(".json"):
                d = json.load(open(os.path.join(ops_dir, f), encoding="utf-8"))
                guess = d.get("tdOpTypeGuess")
                if guess:
                    scrape[guess] = d

    only_live = sorted(t for t in live_types - wiki_types)
    only_wiki = sorted(t for t in wiki_types - live_types)
    both = sorted(live_types & wiki_types)

    # ── parámetros: fuente autoritativa = plantillas de la wiki (parLabel + parName) ──
    wiki_params_cache = fetch_wiki_params(wiki_titles, os.path.join(POPS_DATA, "wiki_params.json"),
                                          refresh=args.refresh_wiki)
    wpp = wiki_params_cache.get("params_by_page", {})

    param_report = []
    for t in both:
        lv = live[t]
        title = wiki_map.get(t)
        entries = wpp.get(title) if title else None
        if isinstance(entries, dict) or entries is None:
            entries = []
        wiki_names = {}
        for e in entries:
            if e.get("eval"):
                wiki_names[norm(e["eval"])] = e
        live_names = {norm(p["name"]): p for p in lv.get("params", [])}
        mapping, matched = [], 0
        for k, e in wiki_names.items():
            if k in live_names:
                p = live_names[k]
                mapping.append({"wiki_label": e.get("label"), "eval": p["name"], "live_label": p.get("label"),
                                "wiki_type": e.get("type"), "live_style": p.get("style"),
                                "default": p.get("default")})
                matched += 1
        wiki_only = sorted(e["eval"] for k, e in wiki_names.items() if k not in live_names)
        live_only = sorted(live_names[k]["name"] for k in set(live_names) - set(wiki_names))
        param_report.append({
            "type": t,
            "wiki_page": title,
            "wiki_params": len(wiki_names),
            "live_params": len(live_names),
            "matched": matched,
            "match_pct": round(100 * matched / max(1, len(wiki_names)), 1) if wiki_names else None,
            "wiki_only_drift": wiki_only[:15],       # documentado pero ausente en ESTE build
            "live_only_count": len(live_only),
            "live_only_sample": live_only[:10],
            "mapping": mapping,
        })

    # verificación en vivo de una muestra de páginas
    samples = sample_validate([wiki_map[t] for t in both[:args.samples]], args.samples)

    # sondeo en vivo de los tipos dudosos (solo-wiki y los que fallaron al crear)
    probe_targets = list(only_wiki) + ["engineoutPOP"]
    probe = probe_types_in_td(probe_targets)

    # GLSL: funciones usadas en nuestra biblioteca vs doc oficial
    glsl_lib = os.path.join(POPS_DATA, "glsl_library.json")
    glsl_used = Counter()
    if os.path.exists(glsl_lib):
        for s in json.load(open(glsl_lib, encoding="utf-8")).get("shaders", []):
            for fn in ("TDIndex", "TDIn_P", "TDOut_P", "TDPointCount", "TDInputPointCount",
                       "TDIn_N", "TDIn_Cd", "TDIn_PartVel", "TDInputNumPoints", "TDNumPoints"):
                if fn in s["code"]:
                    glsl_used[fn] += 1
    glsl_doc = wiki_page_info("GLSL POP")
    glsl_doc_text = ""
    try:
        glsl_doc_text = fetch_text("https://docs.derivative.ca/Write_a_GLSL_POP")[:4000]
    except Exception:  # noqa: BLE001
        pass
    glsl_functions_documented = sorted({fn for fn in glsl_used if fn in glsl_doc_text})

    result = {
        "sources": {
            "wiki": cat["fetched_from"],
            "live_matrix": MATRIX_JSON,
            "live_td_build": matrix.get("td_build"),
        },
        "counts": {
            "wiki_pages": len(wiki_titles),
            "live_types": len(live_types),
            "matched": len(both),
            "only_live": len(only_live),
            "only_wiki": len(only_wiki),
        },
        "only_live": [{"type": t, "created_ok": live[t]["created"], "params": live[t].get("param_count")} for t in only_live],
        "only_wiki": only_wiki,
        "probe_en_vivo": probe,
        "param_report": sorted(param_report, key=lambda r: (r["match_pct"] is not None, r["match_pct"] or 0)),
        "param_coverage": {
            "pops_con_mapeo": sum(1 for r in param_report if r["matched"]),
            "params_wiki_totales": sum(r["wiki_params"] for r in param_report),
            "params_confirmados_en_build": sum(r["matched"] for r in param_report),
            "params_documentados_ausentes_en_build": sum(len(r["wiki_only_drift"]) for r in param_report),
        },
        "wiki_samples": samples,
        "glsl": {
            "functions_used": dict(glsl_used),
            "documented_in_WP_Page": glsl_functions_documented,
            "glsl_pop_page_found": "error" not in glsl_doc,
            "glsl_pop_experimental": glsl_doc.get("experimental"),
        },
    }

    os.makedirs(POPS_DATA, exist_ok=True)
    json.dump(result, open(VALIDATION_JSON, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

    # ── reporte markdown ──
    L = []
    L.append("# Validación del conocimiento POP contra la wiki oficial\n")
    L.append(f"- **TD build vivo:** {matrix.get('td_build')} · **POPs creados en vivo:** {matrix['created_ok']}/{matrix['type_count']}")
    L.append(f"- **Fuente oficial:** `{cat['fetched_from']}` → **{len(wiki_titles)} páginas** en Category:POPs")
    L.append(f"- Cruce: **{len(both)} POPs coinciden**, {len(only_live)} solo en TD, {len(only_wiki)} solo en la wiki\n")
    L.append("## POPs presentes en TouchDesigner pero SIN página en la wiki\n")
    if only_live:
        L.append("| tipo TD | creado en vivo | params reales |")
        L.append("|---|---|---|")
        for t in only_live:
            r = live[t]
            L.append(f"| `{t}` | {'✅' if r['created'] else '❌'} | {r.get('param_count', '-')} |")
        L.append("\n> Marcados como **no documentados oficialmente al día de hoy** — no inferir su comportamiento: probarlos en vivo.")
    else:
        L.append("_Ninguno: todos los POPs del build tienen página oficial._")
    L.append("\n## Páginas de la wiki sin operador en el build actual\n")
    L.append(", ".join(f"`{t}`" for t in only_wiki) if only_wiki else "_Ninguna._")
    L.append("\n### Sondeo en vivo de esos tipos (¿existen en el build?)\n")
    L.append("| tipo | clase en `td` | creable por nombre | nota |")
    L.append("|---|---|---|---|")
    for t, v in (probe or {}).items():
        if t.startswith("_"):
            continue
        L.append(f"| `{t}` | {'sí' if v.get('clase_td') else 'no'} | {'sí' if v.get('creable_por_nombre') else 'no'} | {v.get('error', '—')} |")
    L.append("\n> Interpretación: *clase no / creable no* = el build instalado no tiene ese operador (la wiki puede ir adelante del build). *clase sí / creable no* = existe pero `create()` no lo acepta en un baseCOMP (requiere contexto propio).")
    pc = result["param_coverage"]
    L.append("\n## Cobertura de parámetros (wiki oficial ↔ build instalado)\n")
    L.append(f"Fuente autoritativa: plantillas `{{{{Parameter}}}}` de la wiki (`parLabel` + `parName`). Cache: `mcp/data/pops/wiki_params.json` ({wiki_params_cache.get('fetched_at', '?')}).\n")
    L.append(f"- Parámetros documentados (POPs en común): **{pc['params_wiki_totales']}**")
    L.append(f"- Confirmados en el build: **{pc['params_confirmados_en_build']}**")
    L.append(f"- Documentados pero **ausentes en este build**: **{pc['params_documentados_ausentes_en_build']}** → son *drift*, no usarlos sin verificar\n")
    L.append("| POP | params wiki | confirmados en build | drift (doc sin build) |")
    L.append("|---|---|---|---|")
    for r in result["param_report"][:18]:
        L.append(f"| {r['wiki_page'] or r['type']} | {r['wiki_params']} | {r['matched']} | {', '.join(r['wiki_only_drift'][:3]) or '—'} |")
    L.append("\n### Ejemplo de mapeo verificado (Triangulate POP)\n")
    ex = next((r for r in result["param_report"] if r["type"].startswith("triangulate")), None)
    if ex and ex.get("mapping"):
        L.append("| label wiki | nombre eval (build) | label en el build | tipo wiki | estilo build |")
        L.append("|---|---|---|---|---|")
        for m in ex["mapping"][:10]:
            L.append(f"| {m['wiki_label']} | `{m['eval']}` | {m['live_label']} | {m['wiki_type']} | {m['live_style']} |")
    L.append("\n## Verificación en vivo de páginas de la wiki (muestra)\n")
    L.append("| página | categorías | experimental | params de wiki detectados |")
    L.append("|---|---|---|---|")
    for s in samples:
        L.append(f"| {s['title']} | {', '.join(s.get('categories', [])) or '—'} | {'sí' if s.get('experimental') else 'no'} | {len(s.get('wiki_params', []))} |")
    L.append("\n## GLSL POP\n")
    L.append(f"- Funciones usadas por nuestra biblioteca: {', '.join(f'`{k}`' for k in glsl_used) or '—'}")
    L.append(f"- Confirmadas en la doc oficial (*Write a GLSL POP*): {', '.join(f'`{k}`' for k in glsl_functions_documented) or '—'}")
    L.append(f"- Página GLSL POP accesible: {'sí' if result['glsl']['glsl_pop_page_found'] else 'no'}")
    L.append("\n## Regla de oro para el conocimiento guardado\n")
    L.append("Cada dato POP se etiqueta con su fuente: **wiki oficial** (autoritativa) · **live TD** (comportamiento real del build) · **corpus .toe** (empírico, no normativo). Sin etiqueta → no se guarda.")
    open(VALIDATION_MD, "w", encoding="utf-8").write("\n".join(L))

    print(f"wiki={len(wiki_titles)} live={len(live_types)} match={len(both)} only_live={len(only_live)} only_wiki={len(only_wiki)}")
    print(f"solo en TD: {', '.join(only_live[:15])}")
    print(f"solo en wiki: {', '.join(only_wiki[:15])}")
    print(f"GLSL: usadas={list(glsl_used)} documentadas={glsl_functions_documented}")
    print(f"-> {VALIDATION_MD}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
