#!/usr/bin/env python3
"""
Build the POP knowledge base (repo + Obsidian + MCP knowledge brain)
===================================================================

Fusiona las tres fuentes y emite artefactos **etiquetados por origen**:

  wiki oficial   → docs.derivative.ca (autoritativa)
  live TD        → docs/pop_matrix.json (comportamiento real del build instalado)
  corpus .toe    → mcp/data/pops/{patterns,param_usage,glsl_library}.json (empírico)

Salidas:
  1. mcp/data/pops/knowledge/pop_operators.json   (por operador, con fuentes por campo)
  2. mcp/data/pops/knowledge/pop_index.json       (resumen + patrones validados)
  3. docs/POPs_KNOWLEDGE.md                       (documento maestro legible)
  4. Vault Obsidian: 🎛️ TouchDesigner/POPs/*.md  (índice, matriz, patrones, params, GLSL)
  5. knowledge_brain.db (FTS5) — filas con trustTier 'live-verified' / 'empirical'

Uso:
    python toe/src/build_pop_knowledge.py
    python toe/src/build_pop_knowledge.py --no-db      # sin tocar el FTS
    python toe/src/build_pop_knowledge.py --no-vault   # sin escribir en Obsidian
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sqlite3
import sys
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
DOCS = os.path.join(REPO, "docs")
POPS_DATA = os.path.join(REPO, "mcp", "data", "pops")
KB_DIR = os.path.join(POPS_DATA, "knowledge")
KB_DB = os.path.join(REPO, "mcp", "data", "knowledge_brain.db")
VAULT_POPS = r"E:\obsidian-vault\🎛️ TouchDesigner\POPs"

DRIVE_GROUPS = [
    ("Generadores / fuentes", ["boxPOP", "spherePOP", "gridPOP", "circlePOP", "linePOP", "rectanglePOP",
                               "tubePOP", "curvePOP", "planePOP", "pointPOP", "pointgeneratorPOP",
                               "sprinklePOP", "patternPOP", "randomPOP", "textPOP", "torusPOP",
                               "revolvePOP", "extrudePOP", "fileinPOP", "pointfileinPOP", "alembicinPOP",
                               "toptoPOP", "choptoPOP", "dattoPOP", "soptoPOP", "cplusplusPOP",
                               "glslPOP", "glsladvancedPOP", "glslcopyPOP", "glslselectPOP"]),
    ("Modificadores", ["noisePOP", "transformPOP", "mathPOP", "mathcombinePOP", "mathmixPOP", "trigPOP",
                       "limitPOP", "normalizePOP", "rerangePOP", "quantizePOP", "twistPOP", "facetPOP",
                       "subdividePOP", "normalPOP", "colorPOP", "attributePOP", "attributecombinePOP",
                       "attributeconvertPOP", "lookupattributePOP", "lookupchannelPOP", "lookuptexturePOP",
                       "texturemapPOP", "convertPOP", "triangulatePOP", "polygonizePOP", "projectionPOP",
                       "rayPOP", "revolvePOP", "skindeformPOP", "topologyPOP", "dimensionPOP", "histogramPOP"]),
    ("Combinadores / flujo", ["mergePOP", "copyPOP", "blendPOP", "switchPOP", "selectPOP", "groupPOP",
                              "deletePOP", "sortPOP", "cachePOP", "cacheblendPOP", "cacheselectPOP",
                              "feedbackPOP", "importselectPOP", "oakselectPOP", "neighborPOP",
                              "proximityPOP", "connectivityPOP", "analyzePOP", "primitivePOP",
                              "trailPOP", "particlePOP", "forceradialPOP", "phaserPOP", "skinPOP",
                              "accumulatePOP", "linebreakPOP", "linedividePOP", "linemetricsPOP",
                              "lineresamplePOP", "linesmoothPOP", "tracePOP", "zedPOP"]),
    ("I/O y dispositivos", ["nullPOP", "inPOP", "outPOP", "fileoutPOP", "alembicoutPOP",
                            "dmxoutPOP", "dmxfixturePOP", "engineoutPOP"]),
]


def load_json(path, default=None):
    if os.path.exists(path):
        return json.load(open(path, encoding="utf-8"))
    return default


def norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-db", action="store_true")
    ap.add_argument("--no-vault", action="store_true")
    args = ap.parse_args()

    matrix = load_json(os.path.join(DOCS, "pop_matrix.json"))
    if not matrix:
        print("FALTA docs/pop_matrix.json — corré test_pop_matrix.py primero")
        return 2
    validation = load_json(os.path.join(POPS_DATA, "validation.json"), {})
    patterns = load_json(os.path.join(POPS_DATA, "patterns.json"), {})
    param_usage = load_json(os.path.join(POPS_DATA, "param_usage.json"), {})
    glsl_lib = load_json(os.path.join(POPS_DATA, "glsl_library.json"), {})

    wiki_pages = {v: k for k, v in ((t, norm(t[:-4]) + "POP") for t in validation.get("only_wiki", []))}  # aux
    wiki_category = load_json(os.path.join(POPS_DATA, "wiki_category.json"), {})
    titles = wiki_category.get("titles", [])
    special = {"chop to pop": "choptoPOP", "dat to pop": "dattoPOP", "top to pop": "toptoPOP",
               "sop to pop": "soptoPOP", "point file in pop": "pointfileinPOP"}
    title_by_type = {}
    for t in titles:
        low = t.strip().lower()
        ttype = special.get(low, norm(low[:-4]) + "POP" if low.endswith(" pop") else norm(low))
        title_by_type[ttype] = t

    param_report = {r["type"]: r for r in validation.get("param_report", [])}
    usage_by_type = param_usage.get("byType", {})

    operators = []
    for r in matrix["results"]:
        t = r["type"]
        live_params = [p["name"] for p in r.get("params", [])]
        wiki_title = title_by_type.get(t)
        pr = param_report.get(t, {})
        u = usage_by_type.get(t.replace("POP", "pop").lower(), {}) or usage_by_type.get(t, {})
        operators.append({
            "type": t,
            "name": r.get("name"),
            "family": r.get("family"),
            "created_live": r.get("created"),
            "create_error": r.get("error"),
            "inputs": r.get("inputs"),
            "outputs": r.get("outputs"),
            "param_count": r.get("param_count"),
            "errors": r.get("errors"),
            "warnings": r.get("warnings"),
            "live_params": live_params,
            "wiki": {
                "page": wiki_title,
                "url": f"https://docs.derivative.ca/{wiki_title.replace(' ', '_')}" if wiki_title else None,
                "documented": wiki_title is not None,
                "param_match_pct": pr.get("match_pct"),
                "wiki_params_total": pr.get("wiki_params"),
                "params_confirmados": pr.get("matched"),
                "params_drift_doc_sin_build": pr.get("wiki_only_drift", []),
                "param_mapping": pr.get("mapping", []),
            },
            "empirical_usage": {
                "writes": u.get("writes"),
                "top_params": [p["name"] for p in u.get("params", [])[:12]],
            },
            "sources": {
                "existence": "live TD + wiki oficial" if wiki_title else "live TD (sin página en la wiki)",
                "params": "live TD (nombres eval reales)",
                "usage": "corpus .toe (empírico)",
            },
        })

    by_type = {o["type"]: o for o in operators}
    documented = sum(1 for o in operators if o["wiki"]["documented"])

    index = {
        "td_build": matrix.get("td_build"),
        "generated_from": {
            "live": "docs/pop_matrix.json",
            "wiki": validation.get("sources", {}).get("wiki"),
            "corpus": patterns.get("generatedFrom"),
        },
        "counts": {
            "pop_types_live": len(operators),
            "created_ok": sum(1 for o in operators if o["created_live"]),
            "documented_in_wiki": documented,
            "undocumented": len(operators) - documented,
            "wiki_pages_total": len(titles),
            "patterns_pop_to_pop": len(patterns.get("edges", [])),
            "chains": len(patterns.get("chains", [])),
            "glsl_snippets": glsl_lib.get("count", 0),
            "params_wiki_totales": validation.get("param_coverage", {}).get("params_wiki_totales", 0),
            "params_confirmados": validation.get("param_coverage", {}).get("params_confirmados_en_build", 0),
            "params_drift": validation.get("param_coverage", {}).get("params_documentados_ausentes_en_build", 0),
        },
        "undocumented_in_wiki": [o["type"] for o in operators if not o["wiki"]["documented"]],
        "top_patterns": patterns.get("edges", [])[:40],
        "top_chains": patterns.get("chains", [])[:25],
        "fan_in": patterns.get("fanIn", []),
        "trust_tiers": {
            "oficial": "docs.derivative.ca (wiki)",
            "live-verified": "probado contra TD en vivo",
            "empirico": "extraído de proyectos .toe reales — no normativo",
        },
    }

    os.makedirs(KB_DIR, exist_ok=True)
    json.dump({"index": index, "operators": operators}, open(os.path.join(KB_DIR, "pop_operators.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    json.dump(index, open(os.path.join(KB_DIR, "pop_index.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)

    # ── documento maestro ──
    M = ["# Conocimiento POP — validado y con fuentes\n",
         f"- Build validado: **{matrix.get('td_build')}** · POPs creados en vivo: **{index['counts']['created_ok']}/{len(operators)}**",
         f"- Documentados en la wiki oficial: **{documented}** · sin página oficial: **{len(operators) - documented}**",
         f"- Patrones POP→POP extraídos de proyectos reales: **{index['counts']['patterns_pop_to_pop']}** · GLSL indexados: **{index['counts']['glsl_snippets']}**\n",
         "> **Regla:** cada dato lleva su fuente. `oficial` = wiki Derivative · `live-verified` = probado contra TD real · `empirico` = extraído de .toe (no normativo).\n",
         "## POPs por grupo funcional (con parámetros reales)\n"]

    for group, members in DRIVE_GROUPS:
        present = [m for m in members if m in by_type]
        if not present:
            continue
        M.append(f"### {group}\n")
        M.append("| POP | wiki | params | in/out | usos en corpus |")
        M.append("|---|---|---|---|---|")
        for t in present:
            o = by_type[t]
            M.append(f"| `{t}` | {'✅' if o['wiki']['documented'] else '—'} | {o['param_count']} | {o['inputs']}/{o['outputs']} | {o['empirical_usage']['writes'] or 0} |")
        M.append("")

    M.append("## Patrones de conexión POP→POP (empírico, de proyectos reales)\n")
    M.append("| desde | hacia | veces | proyectos de ejemplo |")
    M.append("|---|---|---|---|")
    for e in patterns.get("edges", [])[:30]:
        M.append(f"| `{e['from']}` | `{e['to']}` | {e['count']} | {', '.join(e['projects'][:3])} |")
    M.append("\n## Cadenas de 3 POPs (empírico)\n")
    for c in patterns.get("chains", [])[:15]:
        M.append("- " + " → ".join(f"`{x}`" for x in c["chain"]) + f"  (x{c['count']})")
    M.append("\n## GLSL POP\n")
    M.append(f"- Shaders indexados del corpus: **{glsl_lib.get('count', 0)}**")
    M.append(f"- Biblioteca propia del repo: `glsl_files/*.glsl`")
    M.append("- Regla verificada: GLSL POP necesita entrada POP (p.ej. `boxPOP`) y `outputattrs='P'`\n")
    open(os.path.join(DOCS, "POPs_KNOWLEDGE.md"), "w", encoding="utf-8").write("\n".join(M))

    # ── Obsidian ──
    if not args.no_vault:
        try:
            os.makedirs(VAULT_POPS, exist_ok=True)
            idx = ["---", "tags: [touchdesigner, pops, knowledge]", f"td_build: {matrix.get('td_build')}", "---", "",
                   "# 🎛️ POPs — Índice de conocimiento", "",
                   "> Base validada contra la wiki oficial + TD en vivo + 102 proyectos .toe reales.", "",
                   "- [[POPs — Matriz validada]] — los POPs del build, con params reales y cobertura de wiki",
                   "- [[POPs — Patrones de conexión]] — cómo se conectan los POPs en proyectos reales",
                   "- [[POPs — Parámetros reales]] — nombres eval por operador (los que usa el MCP)",
                   "- [[POPs — GLSL biblioteca]] — shaders reutilizables",
                   "- [[POPs — Reglas y pitfalls]] — reglas verificadas", "",
                   "## Cómo leer esta base", "",
                   "| etiqueta | significa |", "|---|---|",
                   "| `oficial` | documentado en docs.derivative.ca |",
                   "| `live-verified` | probado contra TouchDesigner real (2025.32460) |",
                   "| `empírico` | extraído de proyectos .toe — indica práctica, no obligación |", ""]
            open(os.path.join(VAULT_POPS, "POPs — Índice.md"), "w", encoding="utf-8").write("\n".join(idx))

            mat = ["---", "tags: [touchdesigner, pops]", "---", "", "# POPs — Matriz validada", "",
                   f"Build: **{matrix.get('td_build')}** · {index['counts']['created_ok']}/{len(operators)} creados en vivo · {documented} con página oficial", "",
                   "| POP | wiki | params | in/out | usos corpus |", "|---|---|---|---|---|"]
            for o in sorted(operators, key=lambda o: o["type"]):
                mat.append(f"| `{o['type']}` | {'✅' if o['wiki']['documented'] else '—'} | {o['param_count']} | {o['inputs']}/{o['outputs']} | {o['empirical_usage']['writes'] or 0} |")
            mat.append("\nSin página oficial: " + (", ".join(f"`{t}`" for t in index["undocumented_in_wiki"]) or "—"))
            open(os.path.join(VAULT_POPS, "POPs — Matriz validada.md"), "w", encoding="utf-8").write("\n".join(mat))

            pat = ["---", "tags: [touchdesigner, pops, patterns]", "---", "", "# POPs — Patrones de conexión", "",
                   "> Fuente: **empírica** — conexiones POP→POP detectadas en 102 proyectos .toe descomprimidos.", "",
                   "```mermaid", "graph LR"]
            for e in patterns.get("edges", [])[:18]:
                pat.append(f'    {e["from"]}["{e["from"]}"] -->|{e["count"]}| {e["to"]}["{e["to"]}"]')
            pat += ["```", "", "## Pares más frecuentes", "", "| desde | hacia | veces | ejemplo |", "|---|---|---|---|"]
            for e in patterns.get("edges", [])[:30]:
                pat.append(f"| `{e['from']}` | `{e['to']}` | {e['count']} | {', '.join(e['projects'][:2])} |")
            pat += ["", "## Cadenas de 3 saltos", ""]
            for c in patterns.get("chains", [])[:20]:
                pat.append("- " + " → ".join(f"`{x}`" for x in c["chain"]) + f" (x{c['count']})")
            pat += ["", "## Fan-in (POPs que reciben 2+ entradas POP)", ""]
            for f in patterns.get("fanIn", [])[:12]:
                pat.append(f"- `{f['type']}` — en {f['count']} redes")
            open(os.path.join(VAULT_POPS, "POPs — Patrones de conexión.md"), "w", encoding="utf-8").write("\n".join(pat))

            par = ["---", "tags: [touchdesigner, pops, params]", "---", "", "# POPs — Parámetros reales (nombres eval)", "",
                   "> **live-verified** (leídos del build instalado) + **oficial** (plantillas `{{Parameter}}` de la wiki: `parLabel` + `parName`) + **empírico** (los que realmente se setean en proyectos).",
                   "> Para setear por API/MCP: `POST /parameters/set` con `{\"updates\":[{\"name\":...,\"value\":...}]}`.", "",
                   "## Cobertura", "",
                   f"- Parámetros documentados en la wiki (POPs presentes en el build): **{index['counts'].get('params_wiki_totales', 0)}**",
                   f"- Confirmados en este build: **{index['counts'].get('params_confirmados', 0)}**",
                   f"- Documentados pero ausentes en el build (drift): **{index['counts'].get('params_drift', 0)}** — no usarlos sin probar", ""]
            for o in sorted(operators, key=lambda o: -(o["empirical_usage"]["writes"] or 0))[:25]:
                if not o["param_count"]:
                    continue
                par.append(f"### `{o['type']}` — {o['param_count']} params en el build · {o['wiki']['params_confirmados'] or 0} mapeados contra la wiki")
                if o["wiki"]["param_mapping"]:
                    par.append("")
                    par.append("| label (wiki) | nombre eval | label en el build |")
                    par.append("|---|---|---|")
                    for m in o["wiki"]["param_mapping"][:14]:
                        par.append(f"| {m.get('wiki_label')} | `{m.get('eval')}` | {m.get('live_label')} |")
                if o["wiki"]["params_drift_doc_sin_build"]:
                    par.append("")
                    par.append("⚠️ Documentados en la wiki pero **ausentes** en este build: " +
                               ", ".join(f"`{x}`" for x in o["wiki"]["params_drift_doc_sin_build"][:8]))
                if o["empirical_usage"]["top_params"]:
                    par.append("")
                    par.append("Más usados en proyectos reales: " + ", ".join(f"`{p}`" for p in o["empirical_usage"]["top_params"]))
                par.append("")
            open(os.path.join(VAULT_POPS, "POPs — Parámetros reales.md"), "w", encoding="utf-8").write("\n".join(par))

            gl = ["---", "tags: [touchdesigner, pops, glsl]", "---", "", "# POPs — GLSL biblioteca", "",
                  f"Shaders indexados del corpus: **{glsl_lib.get('count', 0)}**. Biblioteca del repo: `glsl_files/`.", ""]
            for s in glsl_lib.get("shaders", [])[:12]:
                gl += [f"## {s['file']}", f"*proyecto: {s['project']} · {s['lines']} líneas*", "", "```glsl", s["code"][:1500], "```", ""]
            open(os.path.join(VAULT_POPS, "POPs — GLSL biblioteca.md"), "w", encoding="utf-8").write("\n".join(gl))

            print(f"Vault: {VAULT_POPS} ({len(os.listdir(VAULT_POPS))} notas)")
        except Exception as e:  # noqa: BLE001
            print(f"[warn] vault no escrito: {type(e).__name__}: {e}")

    # ── knowledge brain (FTS5) ──
    if not args.no_db and os.path.exists(KB_DB):
        try:
            con = sqlite3.connect(KB_DB)
            cur = con.cursor()
            cur.execute("DELETE FROM docs WHERE sourceType IN ('pop-live','pop-pattern','pop-glsl')")
            rows = []
            for o in operators:
                mapping_str = "; ".join(
                    f"{m.get('wiki_label')}->{m.get('eval')}" for m in (o["wiki"]["param_mapping"] or [])[:8]
                )
                drift_str = ", ".join(o["wiki"]["params_drift_doc_sin_build"][:10])
                body = (
                    f"POP {o['type']} ({o['wiki']['page'] or 'sin página oficial'}). "
                    f"Familia {o['family']}. Entradas {o['inputs']}, salidas {o['outputs']}, {o['param_count']} parámetros. "
                    f"Verificado en vivo en TouchDesigner {matrix.get('td_build')}: creado={o['created_live']}, errores={o['errors']}. "
                    f"Nombres de parámetros reales (eval): {', '.join(o['live_params'][:60])}. "
                    f"Parámetros más usados en proyectos reales: {', '.join(o['empirical_usage']['top_params'] or [])}. "
                    f"Mapeo wiki->eval (muestra): {mapping_str}. "
                    f"Documentados sin build (drift): {drift_str}. "
                    f"Fuentes: wiki oficial {o['wiki']['url'] or '-'} + live TD + corpus .toe."
                )
                rows.append((o["type"], "POP", o["wiki"]["page"] or o["type"], (o["wiki"]["page"] or "").replace(" ", "_"),
                             o["wiki"]["url"] or "", f"POP {o['type']} validado en vivo ({o['param_count']} params)",
                             "live-verified", "pop-live", body))
            for e in patterns.get("edges", [])[:200]:
                chain = f"{e['from']} -> {e['to']}"
                body = (f"Patrón de conexión POP (empírico): {chain}. Detectado {e['count']} veces en proyectos reales: "
                        f"{', '.join(e['projects'][:6])}. Fuente: corpus .toe descomprimido (no normativo; validar contra la wiki).")
                rows.append((chain, "POP", f"Patrón {chain}", f"pattern_{e['from']}_{e['to']}", "",
                             f"Conexión POP→POP frecuente ({e['count']}x)", "empirical", "pop-pattern", body))
            for c in patterns.get("chains", [])[:80]:
                ch = " -> ".join(c["chain"])
                rows.append((ch, "POP", f"Cadena {ch}", f"chain_{'_'.join(c['chain'])}", "",
                             f"Cadena de 3 POPs ({c['count']}x)", "empirical", "pop-pattern",
                             f"Cadena POP empírica: {ch}. Aparece {c['count']} veces en los proyectos analizados."))
            for s in glsl_lib.get("shaders", [])[:120]:
                rows.append((s["file"], "POP", f"GLSL POP {s['file']}", s["file"].replace("/", "_"), "",
                             f"Shader GLSL POP de {s['project']}", "empirical", "pop-glsl",
                             f"Shader GLSL POP ({s['lines']} líneas) del proyecto {s['project']}. Código: {s['code'][:3000]}"))
            cur.executemany("INSERT INTO docs (name, family, pageTitle, pageSlug, url, summary, trustTier, sourceType, body) VALUES (?,?,?,?,?,?,?,?,?)", rows)
            con.commit()
            total = cur.execute("SELECT COUNT(*) FROM docs WHERE sourceType LIKE 'pop-%'").fetchone()[0]
            hit = cur.execute("SELECT COUNT(*) FROM docs WHERE docs MATCH 'noisePOP'").fetchone()[0]
            con.close()
            print(f"knowledge_brain: +{len(rows)} filas POP (total pop-* = {total}, prueba FTS 'noisePOP' → {hit})")
        except Exception as e:  # noqa: BLE001
            print(f"[warn] FTS no actualizado: {type(e).__name__}: {e}")

    print(f"\nOK · operadores={len(operators)} (wiki={documented}, sin doc={len(operators)-documented})")
    print(f"     patrones={index['counts']['patterns_pop_to_pop']} · cadenas={index['counts']['chains']} · glsl={index['counts']['glsl_snippets']}")
    print(f"     json → {KB_DIR}")
    print(f"     doc  → {os.path.join(DOCS, 'POPs_KNOWLEDGE.md')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
