#!/usr/bin/env python3
"""
Uso empírico de parámetros POP + biblioteca GLSL (acotado a los proyectos POP)
==============================================================================

El corpus tiene ~709k archivos .parm: minarlos todos es inviable. Este script
minó SOLO los proyectos POP-heavy (lista configurable) y produce:

  mcp/data/pops/param_usage.json  — parámetros realmente seteados por tipo POP
                                    (nombre + valores de ejemplo + hits)
  mcp/data/pops/glsl_library.json — shaders GLSL (del corpus + de glsl_files/ del repo)

Todo es **empírico** (proyectos reales), no normativo.

Uso:
    python toe/src/mine_pop_params_glsl.py
"""

from __future__ import annotations

import json
import os
import re
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))                     # .../Touchdesigner_MCP/Main
CORPUS = os.path.abspath(os.path.join(REPO, "..", "old", "mcp_td_v3", "Toe_Expand"))
OUT = os.path.join(REPO, "mcp", "data", "pops")
REPO_GLSL_DIR = os.path.join(REPO, "glsl_files")

POP_PROJECTS = [
    "yfx-pop-workshop-1.0.68",
    "20250823_TDSW",
    "JPOPsDev",
    "AttribManip",
    "dmxPOPExamples",
    "BlendPCSortNeighborPOPMatchIds",
    "fieldPOPtorus_Rich",
    "fieldPOPtorus_vincentGLSL",
    "GLSL Copy POP Humanoid_AnimOffsetInstances",
    "GaussianSplatting-1.0.30_POPs",
    "GaussianSplatting-1.0.42_POPs_and_Original_2",
]

PARM_LINE = re.compile(r'^([a-z][a-z0-9_]*)\s+(\d+)\s+(.*)$')
GLSL_BLOCK = re.compile(r'(?:void\s+main\s*\(|TDIndex\(|TDIn_P\()', re.I)
GLSL_EXT = (".glsl", ".frag", ".vert", ".comp")


def main() -> int:
    usage = defaultdict(Counter)
    values = defaultdict(lambda: defaultdict(Counter))
    scanned_parms = 0
    pop_types = set()

    for proj in POP_PROJECTS:
        base = os.path.join(CORPUS, proj)
        if not os.path.isdir(base):
            print(f"[skip] no existe: {proj}")
            continue
        for root, dirs, files in os.walk(base):
            dirs[:] = [d for d in dirs if d not in ("node_modules", ".git")]
            for f in files:
                if not f.endswith(".parm"):
                    continue
                ppath = os.path.join(root, f)
                npath = ppath[:-5] + ".n"
                otype = ""
                try:
                    with open(npath, encoding="utf-8", errors="ignore") as fh:
                        first = fh.readline().strip()
                except OSError:
                    continue
                # formato del .n: "FAMILIA:tipo"  (ej. POP:accumulate, TOP:noise, COMP:base)
                fam, sep, rest = first.partition(":")
                if sep != ":" or fam.strip().upper() != "POP":
                    continue
                otype = rest.strip().lower()
                if not otype:
                    continue
                pop_types.add(otype)
                scanned_parms += 1
                try:
                    for line in open(ppath, encoding="utf-8", errors="ignore"):
                        if line.startswith("?"):
                            continue
                        m = PARM_LINE.match(line)
                        if not m:
                            continue
                        pname, _i, val = m.groups()
                        val = val.strip()
                        if val in ("off", "0", "0.0", "0.00", "on", "", "0 0 0", "0 0 0 0"):
                            continue
                        usage[otype][pname] += 1
                        values[otype][pname][val[:60]] += 1
                except OSError:
                    continue

    payload = {
        "source": "empírico — archivos .parm de proyectos POP reales del corpus",
        "projects": POP_PROJECTS,
        "popFilesScanned": scanned_parms,
        "popTypesSeen": sorted(pop_types),
        "byType": {
            t: {
                "writes": sum(c.values()),
                "params": [
                    {"name": p, "hits": h, "samples": [v for v, _c in values[t][p].most_common(3)]}
                    for p, h in c.most_common(40)
                ],
            }
            for t, c in sorted(usage.items(), key=lambda kv: -sum(kv[1].values()))
        },
    }
    os.makedirs(OUT, exist_ok=True)
    json.dump(payload, open(os.path.join(OUT, "param_usage.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)

    # ── GLSL: del corpus y de la biblioteca del repo ──
    shaders = []
    for proj in POP_PROJECTS:
        base = os.path.join(CORPUS, proj)
        for root, dirs, files in os.walk(base):
            dirs[:] = [d for d in dirs if d not in ("node_modules", ".git")]
            for f in files:
                if not f.lower().endswith(GLSL_EXT):
                    continue
                p = os.path.join(root, f)
                try:
                    txt = open(p, encoding="utf-8", errors="ignore").read()
                except OSError:
                    continue
                if len(txt) > 20000:
                    continue
                shaders.append({"project": proj, "file": os.path.relpath(p, CORPUS).replace("\\", "/"),
                                "origin": "corpus .toe", "lines": txt.count("\n") + 1, "code": txt[:8000]})
    if os.path.isdir(REPO_GLSL_DIR):
        for f in sorted(os.listdir(REPO_GLSL_DIR)):
            if f.lower().endswith(".glsl"):
                txt = open(os.path.join(REPO_GLSL_DIR, f), encoding="utf-8", errors="ignore").read()
                shaders.append({"project": "repo td-mcp", "file": f"glsl_files/{f}",
                                "origin": "biblioteca del repo", "lines": txt.count("\n") + 1, "code": txt[:8000]})

    json.dump({"source": "empírico + repositorio", "count": len(shaders), "shaders": shaders},
              open(os.path.join(OUT, "glsl_library.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)

    print(f".parm POP analizados : {scanned_parms}")
    print(f"tipos POP vistos     : {len(pop_types)}")
    print(f"shaders GLSL         : {len(shaders)}")
    print("\nTOP params por tipo (muestra):")
    for t, c in sorted(usage.items(), key=lambda kv: -sum(kv[1].values()))[:6]:
        top = ", ".join(f"{p}({h})" for p, h in c.most_common(5))
        print(f"  {t:<18} {top}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
