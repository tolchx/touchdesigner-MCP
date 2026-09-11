#!/usr/bin/env python3
"""
Mine POP knowledge from the expanded .toe corpus — v3 (dos formatos de mapa)
===========================================================================

Los .md del corpus traen DOS formatos de mermaid:
  A) `id["nombre (FAMILIA:tipo)"]`  + aristas `a --> b`   (documentacion/01_Network_Map.md)
  B) `id[nombre (tipo)]`            sin aristas            (*_Analysis.md)

La familia se resuelve contra TD (dir(td)) cuando el mapa no la trae.
Salidas (mcp/data/pops/):
  patterns.json        — pares POP→POP, cadenas, fan-in  (empírico)
  pop_inventory.json   — qué POPs usa cada proyecto (empírico)
  glsl_library.json    — shaders GLSL POP (empírico, si hay)

Uso:
    python toe/src/mine_pop_knowledge_v3.py
"""

from __future__ import annotations

import argparse
import json
import os
import re
import time
import urllib.request
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))                 # .../Touchdesigner_MCP/Main
CORPUS = os.path.abspath(os.path.join(REPO, "..", "old", "mcp_td_v3", "Toe_Expand"))  # hermano de Main
OUT = os.path.join(REPO, "mcp", "data", "pops")
API = "http://127.0.0.1:44444"

DECL_QUOTED = re.compile(r'^\s*([A-Za-z0-9_]+)\["([^"]+)\s*\(([A-Za-z]+):([a-zA-Z0-9_]+)\)"\]')
DECL_PLAIN = re.compile(r'^\s*([A-Za-z0-9_]+)\[([^\]"]+?)\s*\(([a-zA-Z0-9_]+)\)\]')
EDGE = re.compile(r'^\s*([A-Za-z0-9_]+)\s*-->\s*([A-Za-z0-9_]+)')
GLSL_BLOCK = re.compile(r'(?:void\s+main\s*\(|TDIndex\(|TDIn_P\()', re.I)
GLSL_EXT = (".glsl", ".frag", ".vert", ".comp")
FAMILIES = ("POP", "CHOP", "TOP", "SOP", "DAT", "MAT", "COMP")


def family_map_from_td():
    """{tipo_minúscula_sin_sufijo: FAMILIA} usando dir(td) en el build vivo."""
    code = "\n".join(
        f'print("{f}:" + ",".join(sorted(n[:-len(f)].lower() for n in dir(td) if n.endswith("{f}"))))'
        for f in FAMILIES
    )
    try:
        req = urllib.request.Request(f"{API}/exec", data=json.dumps({"code": code}).encode(),
                                     headers={"Content-Type": "application/json"})
        out = json.loads(urllib.request.urlopen(req, timeout=40).read().decode()).get("output", "")
    except Exception as e:  # noqa: BLE001
        print(f"[warn] TD no disponible para resolver familias: {e}")
        return {}
    fam = {}
    for line in out.splitlines():
        if ":" not in line:
            continue
        f, rest = line.split(":", 1)
        for t in rest.split(","):
            t = t.strip()
            if t:
                fam[t] = f
    return fam


def parse_maps(path: str):
    try:
        txt = open(path, encoding="utf-8", errors="ignore").read()
    except OSError:
        return None, None
    if "```mermaid" not in txt:
        return None, None
    nodes, edges = {}, []
    for block in re.findall(r"```mermaid(.*?)```", txt, re.DOTALL):
        for line in block.splitlines():
            m = DECL_QUOTED.match(line)
            if m:
                nid, label, fam, otype = m.groups()
                nodes[nid] = {"name": label, "family": fam.upper(), "type": otype}
                continue
            m = DECL_PLAIN.match(line)
            if m:
                nid, label, otype = m.groups()
                nodes.setdefault(nid, {"name": label.strip(), "family": None, "type": otype})
                continue
            m = EDGE.match(line)
            if m:
                edges.append((m.group(1), m.group(2)))
    return nodes, edges


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--corpus", default=CORPUS)
    ap.add_argument("--out", default=OUT)
    args = ap.parse_args()

    t0 = time.time()
    fam = family_map_from_td()
    print(f"[fam] familias resueltas desde TD: {len(fam)} tipos  ({time.time()-t0:.1f}s)")

    md_files = []
    for root, dirs, files in os.walk(args.corpus):
        dirs[:] = [d for d in dirs if d not in ("node_modules", ".git", "__pycache__")]
        for f in files:
            if f.endswith(".md"):
                md_files.append(os.path.join(root, f))

    graphs, inventory = {}, defaultdict(Counter)
    for p in md_files:
        nodes, edges = parse_maps(p)
        if not nodes:
            continue
        proj = os.path.relpath(p, args.corpus).split(os.sep)[0]
        g = graphs.setdefault(proj, {"nodes": {}, "edges": []})
        g["nodes"].update(nodes)
        g["edges"].extend(edges)
        for n in nodes.values():
            t = (n["type"] or "").lower()
            f = n["family"] or fam.get(t)
            if f:
                inventory[proj][f"{f}:{t}"] += 1

    edge_counter, edge_projects = Counter(), defaultdict(set)
    chain_counter, fanin_counter = Counter(), Counter()
    pop_touched = set()
    for proj, g in graphs.items():
        def fam_of(nid):
            n = g["nodes"].get(nid)
            if not n:
                return None
            return n["family"] or fam.get((n["type"] or "").lower())

        proj_edges = []
        for a, b in g["edges"]:
            if fam_of(a) == "POP" and fam_of(b) == "POP":
                key = (g["nodes"][a]["type"].lower(), g["nodes"][b]["type"].lower())
                edge_counter[key] += 1
                edge_projects[key].add(proj)
                proj_edges.append(key)
                pop_touched.update(key)
        succ = defaultdict(set)
        for a, b in proj_edges:
            succ[a].add(b)
        for a, b in proj_edges:
            for c in succ.get(b, ()):
                chain_counter[(a, b, c)] += 1
        for dst, n in Counter(b for _a, b in proj_edges).items():
            if n >= 2:
                fanin_counter[dst] += 1

    patterns = {
        "source": "empírico — mapas de red de proyectos .toe reales (Toe_Expand)",
        "notNormative": "NO es documentación oficial: contrastar con la wiki (verify_pop_knowledge.py)",
        "generatedFrom": args.corpus,
        "projectsWithGraph": len(graphs),
        "popTypesTouched": len(pop_touched),
        "edges": [{"from": a, "to": b, "count": n, "projects": sorted(edge_projects[(a, b)])[:6]}
                  for (a, b), n in edge_counter.most_common()],
        "chains": [{"chain": [a, b, c], "count": n} for (a, b, c), n in chain_counter.most_common(80)],
        "fanIn": [{"type": t, "count": n} for t, n in fanin_counter.most_common(20)],
    }
    inv = {
        "source": "empírico — inventario de tipos por proyecto",
        "projects": {p: dict(c.most_common(25)) for p, c in sorted(inventory.items())},
    }

    os.makedirs(args.out, exist_ok=True)
    json.dump(patterns, open(os.path.join(args.out, "patterns.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    json.dump(inv, open(os.path.join(args.out, "pop_inventory.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)

    print(f"proyectos con grafo      : {len(graphs)}")
    print(f"pares POP->POP distintos : {len(patterns['edges'])}")
    print(f"cadenas de 3 POPs        : {len(patterns['chains'])}")
    print("\nTOP conexiones POP->POP:")
    for e in patterns["edges"][:15]:
        print(f"  {e['from']:<14} -> {e['to']:<14} x{e['count']}")
    print("\nTOP cadenas:")
    for c in patterns["chains"][:8]:
        print("  " + " -> ".join(c["chain"]) + f"   x{c['count']}")
    if not patterns["edges"]:
        print("\n[!] sin aristas POP->POP: revisar formato de los mapas")
    print(f"\n-> {args.out}  ({time.time()-t0:.1f}s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
