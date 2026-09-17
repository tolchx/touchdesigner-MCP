#!/usr/bin/env python3
"""
Ingest the GLSL curriculum into mcp/data/glsl_curriculum.json (item 32).

Sources (license decision fixed in the scope, .freebuff_tasks/queue/32_glsl_curriculum.txt):
  - Local verified corpus first: glsl_files/*.glsl (62 shaders) and the live
    suite evidence in docs/glsl_pops_reference.json (14/14, TD 2025.31760).
    POP entries REFERENCE these files — never re-download, never duplicate code.
  - Book of Shaders (https://thebookofshaders.com/?lan=es, (c) Patricio
    Gonzalez Vivo): we take CONCEPTS AND MATH only (chapter titles, technique
    ideas) and cite the chapter per entry. Shaders are our own, written in
    verified TouchDesigner idioms (docs/GLSL_TOP_RULES.md). No porting of book
    code or prose.
  - tolchx.com/td-edu (user's own site): lesson/slide-deck titles and links
    ingested freely, always citing the lesson URL.

Deterministic: same inputs -> byte-identical output. Run with --check to
verify that a regeneration would produce no diff (CI-safe).
"""
import argparse
import datetime
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "mcp", "data", "glsl_curriculum.json")

BOS = "https://thebookofshaders.com/{chap:02d}/?lan=es"


def bos(chap):
    return "https://thebookofshaders.com/%02d/?lan=es" % int(chap)
TD_EDU = "https://tolchx.com/td-edu/"

# TD node params verified live (docs/GLSL_TOP_RULES.md v1.2 / GLSL_POP_RULES.md).
TOP_PARAMS = {
    "node": "glslTOP",
    "shader_dat": "pixeldat",
    "uniform_bind": "vec0name / vec0valuex (const0 does NOT bind scripted)",
    "resolution": "outputresolution='custom' + resolutionw/h",
}
POP_PARAMS = {
    "node": "glslPOP",
    "shader_dat": "computedat",
    "outputattrs": "P (input-existing attrs only; Create Attributes for new)",
    "readwrite": "outputaccess='readwrite' when the shader reads what it writes",
}


def glsl_path(name):
    return "glsl_files/" + name + ".glsl"


def top_entry(entry_id, titulo_es, concepto, bos_chapter, shader_name, efectos, prereq):
    """TOP entry seeded from the 7 verified recipes (mcp/src/tools/glslTopRecipes.ts)."""
    return {
        "id": entry_id,
        "titulo_es": titulo_es,
        "concepto": concepto,
        "fuente_citada": bos(bos_chapter),
        "familia": "TOP",
        "shader_td": "glsl_files/" + shader_name + ".glsl",
        "params_nodo": TOP_PARAMS,
        "efectos_visuales": efectos,
        "prerequisitos": prereq,
    }


def pop_entry(entry_id, titulo_es, concepto, shader_name, efectos, prereq, fuente):
    """POP entry referencing the verified local corpus (glsl_files/)."""
    return {
        "id": entry_id,
        "titulo_es": titulo_es,
        "concepto": concepto,
        "fuente_citada": fuente,
        "familia": "POP",
        "shader_td": glsl_path(shader_name),
        "params_nodo": POP_PARAMS,
        "efectos_visuales": efectos,
        "prerequisitos": prereq,
    }


# recipe_tN_<name>.glsl names for the 7 TOP recipe shaders, in T1..T7 order
# of mcp/src/tools/glslTopRecipes.ts (single source of truth — the ingest
# script EXTRACTS them, it never duplicates shader code).
RECIPE_SHADER_NAMES = [
    (1, "circle_sdf"),
    (2, "value_noise"),
    (3, "fbm_layers"),
    (4, "grid_pattern"),
    (5, "uv_ripple"),
    (6, "feedback_trails"),
    (7, "reaction_diffusion"),
]

def extract_recipe_shaders():
    """Extract T1..T7 GLSL from glslTopRecipes.ts into glsl_files/.

    Deterministic: parses the template literals (expanding the shared ${OUT}
    header) and writes recipe_tN_<name>.glsl. Returns the list of written
    paths (only those whose content changed)."""
    ts_path = os.path.join(ROOT, "mcp", "src", "tools", "glslTopRecipes.ts")
    with open(ts_path, encoding="utf-8") as f:
        ts = f.read()
    out_m = re.search(r'const OUT = ("[^"]+\\n");', ts)
    if not out_m:
        raise SystemExit("could not locate OUT header in " + ts_path)
    out_header = json.loads(out_m.group(1))
    written = []
    for num, name in RECIPE_SHADER_NAMES:
        m = re.search(
            r'const T%d_GLSL = `([^`]+)`;' % num, ts, re.S)
        if not m:
            raise SystemExit("could not locate T%d_GLSL in %s" % (num, ts_path))
        glsl = m.group(1).replace("${OUT}", out_header)
        # normalize: strip trailing blank lines, keep a single trailing newline
        glsl = glsl.rstrip("\n") + "\n"
        dst = os.path.join(ROOT, "glsl_files",
                           "recipe_t%d_%s.glsl" % (num, name))
        current = open(dst, encoding="utf-8").read() if os.path.exists(dst) else None
        if current != glsl:
            with open(dst, "w", encoding="utf-8", newline="\n") as f:
                f.write(glsl)
            written.append(dst)
    return written


def build_entries():
    e = []

    # ── TOP seeds: the 7 live-verified recipes of item 31 (glslTopRecipes.ts) ──
    e.append(top_entry(
        "top-01-shapes-sdf",
        "Formas básicas con SDF (círculo)",
        "Una forma es una distancia: mide cuánto falta para el borde y suaviza "
        "con smoothstep. El aspect ratio se corrige multiplicando p.x por la "
        "proporción (Regla TOP 7) para que el círculo no sea elipse.",
        "07",
        "recipe_t1_circle_sdf",
        ["círculos y anillos nítidos", "máscaras para mezclar capas", "botones y HUD"],
        [],
    ))
    e.append(top_entry(
        "top-02-random-noise",
        "Ruido de valor (random + interpolación)",
        "Random por celda + interpolación suave = textura orgánica sin "
        "repeticiones visibles. Es el ladrillo de casi todo visual procedural.",
        "11",
        "recipe_t2_value_noise",
        ["texturas de grano", "variación orgánica de brillo", "semilla de displacements"],
        ["top-01-shapes-sdf"],
    ))
    e.append(top_entry(
        "top-03-fbm-layers",
        "fBm: ruido fractal en capas (domain warp)",
        "Sumar octavas de ruido (freq ×2, amp ×0.5) simula la autosimilitud de "
        "la naturaleza. Desplazar la entrada con otro ruido (domain warp) rompe "
        "la simetría y genera nubes creíbles.",
        "13",
        "recipe_t3_fbm_layers",
        ["nubes y humo", "terrenos", "máscaras orgánicas"],
        ["top-02-random-noise"],
    ))
    e.append(top_entry(
        "top-04-patterns-grid",
        "Patrones: grillas y multiplicidad",
        "fract() repite el espacio en celdas; dentro de cada celda dibujás lo "
        "que quieras. La base de matrices, mosaicos y toda retícula visual.",
        "09",
        "recipe_t4_grid_pattern",
        ["grillas y mosaicos", "LED walls", "texturas repetibles"],
        ["top-01-shapes-sdf"],
    ))
    e.append(top_entry(
        "top-05-patterns-matrices",
        "Matrices: ondas radiales y coordenadas",
        "La distancia al centro convertida en fase (sin(d*k - t)) produce "
        "anillos que viajan: el patrón más leído desde el Book of Shaders.",
        "09",
        "recipe_t5_uv_ripple",
        ["ripples y ondas", "pulso radial sincronizable con audio"],
        ["top-01-shapes-sdf"],
    ))
    e.append({
        "id": "top-06-motion-feedback-trails",
        "titulo_es": "Movimiento: estelas con feedback",
        "concepto": "El frame anterior vuelve a entrar como input: mezclarlo "
        "con un decaimiento produce estelas. En TD el loop es glslTOP ↔ "
        "feedbackTOP. El contenido evoluciona solo con frames reales (Regla "
        "TOP 10: el swap del buffer no se compromete con cook(force=True)).",
        "fuente_citada": bos(13),
        "familia": "TOP",
        "shader_td": "glsl_files/recipe_t6_feedback_trails.glsl",
        "params_nodo": dict(TOP_PARAMS, feedback="glslTOP -> feedbackTOP -> glslTOP; realtime-only"),
        "efectos_visuales": ["estelas de partículas", "motion blur creativo", "echo visuals"],
        "prerequisitos": ["top-01-shapes-sdf"],
    })
    e.append({
        "id": "top-07-generative-reaction-diffusion",
        "titulo_es": "Generativos: reacción-difusión (aprox. 1 pasada)",
        "concepto": "Dos 'químicos' que se difunden y reaccionan generan "
        "texturas de organismo. La aproximación de una pasada advecta el frame "
        "previo con un laplaciano: en TD realimenta con feedbackTOP y evoluciona "
        "en frames reales (Regla TOP 10).",
        "fuente_citada": bos(13),
        "familia": "TOP",
        "shader_td": "glsl_files/recipe_t7_reaction_diffusion.glsl",
        "params_nodo": dict(TOP_PARAMS, feedback="glslTOP -> feedbackTOP -> glslTOP; realtime-only"),
        "efectos_visuales": ["pieles orgánicas", "corales y manchas", "texturas evolutivas"],
        "prerequisitos": ["top-03-fbm-layers", "top-06-motion-feedback-trails"],
    })

    # ── td-edu (own site): slide decks relevant to the GLSL path ──
    e.append({
        "id": "tdedu-glsl-pop-compute",
        "titulo_es": "GLSL POP: shaders compute (td-edu)",
        "concepto": "Slide deck 'GLSL POP Compute Shaders': kernels GPU y "
        "manipulación directa de atributos. Es el puente entre los conceptos "
        "TOP (píxel) y POP (punto): mismas matemáticas, distinto target.",
        "fuente_citada": TD_EDU + "notebooklm/slider.html (deck GLSL POP Compute Shaders, slides-experimentales/glsl-pop-compute-shaders.pdf)",
        "familia": "POP",
        "shader_td": glsl_path("pop_01_wave"),
        "params_nodo": POP_PARAMS,
        "efectos_visuales": ["displacement de puntos en GPU", "base para simular en POPs"],
        "prerequisitos": ["top-01-shapes-sdf"],
    })
    e.append({
        "id": "tdedu-gpu-pop-simulations",
        "titulo_es": "Simulaciones GPU con POPs (td-edu)",
        "concepto": "Deck 'GPU POP Simulations': fluidos, partículas y "
        "dinámica de cuerpos corriendo en POPs. Conectar con el feedback TOP "
        "para entender el patrón ping-pong en dos familias.",
        "fuente_citada": TD_EDU + "notebooklm/slider.html (deck GPU POP Simulations)",
        "familia": "POP",
        "shader_td": glsl_path("pop_05_feedback"),
        "params_nodo": POP_PARAMS,
        "efectos_visuales": ["partículas con fuerzas", "simulaciones estables"],
        "prerequisitos": ["tdedu-glsl-pop-compute", "top-06-motion-feedback-trails"],
    })

    # ── POP corpus: reference the 62 verified glsl_files (no duplication) ──
    e.append(pop_entry(
        "pop-01-wave-displacement",
        "Desplazamiento sinusoidal (POP)",
        "Mover cada punto con senos dependientes de su posición y el tiempo: "
        "el 'hola mundo' del displacement en glslPOP.",
        "pop_01_wave",
        ["olas en mallas", "respiración de superficies"],
        ["tdedu-glsl-pop-compute"],
        "corpus local verificado (glsl_files/, suite 14/14 TD 2025.31760)",
    ))
    e.append(pop_entry(
        "pop-02-color-hsv",
        "Color por posición: ciclo de matiz (POP)",
        "Convertir posición en fase de matiz y animarla: colorear geometría "
        "sin texturas, con la fórmula HSV->RGB de mat4.",
        "pop_10_color_cycle",
        ["arcoíris por posición", "degradados animados en Cd"],
        ["pop-01-wave-displacement"],
        "corpus local verificado (glsl_files/, suite 14/14 TD 2025.31760)",
    ))
    e.append(pop_entry(
        "pop-03-noise-displacement",
        "Ruido simplex y fBm en geometría (POP)",
        "El mismo fBm del TOP aplicado a P: nubes volumétricas de puntos. "
        "TDSimplexNoise ya está disponible en TD; el loop de octavas es igual.",
        "pop_07_fractal",
        ["terrenos de puntos", "deformación orgánica de mallas"],
        ["pop-01-wave-displacement", "top-03-fbm-layers"],
        "corpus local verificado (glsl_files/, suite 14/14 TD 2025.31760)",
    ))
    e.append(pop_entry(
        "pop-04-matrices-motion",
        "Matrices en 3D: espiral y vórtice (POP)",
        "atan() da el ángulo de cada punto; rotarlo según el radio crea "
        "vórtices. Es la sección Matrices del libro aplicada a geometría.",
        "pop_03_spiral",
        ["remolinos", "galaxias", "transiciones en espiral"],
        ["pop-01-wave-displacement"],
        "corpus local verificado (glsl_files/, suite 14/14 TD 2025.31760)",
    ))
    e.append(pop_entry(
        "pop-05-image-ripple",
        "Movimiento: ondas radiales en puntos (POP)",
        "Anillos que viajan desde el centro desplazando P: el ripple TOP "
        "traducido a geometría, útil para impactos y pulsos.",
        "pop_09_ripple",
        ["ondas de choque", "pulsos radiales sincronizados"],
        ["pop-01-wave-displacement", "top-05-patterns-matrices"],
        "corpus local verificado (glsl_files/, suite 14/14 TD 2025.31760)",
    ))

    # ── TOP corpus: image-processing chain (Sobel etc.) ──
    e.append({
        "id": "top-08-image-processing",
        "titulo_es": "Procesamiento de imagen: convoluciones (Sobel)",
        "concepto": "Leer el vecindario del píxel con uTD2DInfos[0].res.zw como "
        "paso y combinar con pesos produce blur, bordes y glow. El corpus ya "
        "tiene la cadena completa verificada.",
        "fuente_citada": bos(5),
        "familia": "TOP",
        "shader_td": "glsl_files/top_edge_detect.glsl",
        "params_nodo": dict(TOP_PARAMS, input="sTD2DInputs[0] + uTD2DInfos[0].res.zw como texel step"),
        "efectos_visuales": ["detección de bordes", "blur", "glow compuesto"],
        "prerequisitos": ["top-01-shapes-sdf"],
    })

    return e


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--check", action="store_true",
                    help="verify the committed JSON matches a fresh regeneration (exit 1 on diff)")
    args = ap.parse_args()

    extract_recipe_shaders()
    entries = build_entries()
    ids = [x["id"] for x in entries]
    assert len(ids) == len(set(ids)), "duplicate ids: " + str(
        [i for i in ids if ids.count(i) > 1])
    for x in entries:
        assert x.get("fuente_citada"), "missing fuente_citada: " + x["id"]
        shader = x.get("shader_td")
        if shader and not shader.startswith("glsl_files/"):
            raise SystemExit("shader_td must reference glsl_files/: " + x["id"])

    doc = {
        "metadata": {
            "generated_at": "2026-09-17",
            "td_build": "TouchDesigner 2025.31760",
            "sources": [
                "glsl_files/ (62 shaders locales verificados, suite 14/14)",
                "docs/glsl_pops_reference.json (evidencia de suite en vivo)",
                "https://thebookofshaders.com/?lan=es (conceptos y matemática, citados por capítulo)",
                "https://tolchx.com/td-edu/ (lecciones y slide decks propios)",
            ],
            "counts": {
                "entries": len(entries),
                "by_familia": {
                    f: sum(1 for x in entries if x["familia"] == f)
                    for f in ("TOP", "POP")
                },
            },
        },
        "entries": sorted(entries, key=lambda x: x["id"]),
    }

    payload = json.dumps(doc, ensure_ascii=False, indent=2, sort_keys=True) + "\n"

    if args.check:
        with open(OUT, encoding="utf-8") as f:
            current = f.read()
        if current != payload:
            print("CHECK FAILED: mcp/data/glsl_curriculum.json is stale — "
                  "regenerate with: python scripts/ingest_glsl_curriculum.py")
            sys.exit(1)
        print("CHECK OK:", OUT, "is deterministic and current.")
        return

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8", newline="\n") as f:
        f.write(payload)
    print("wrote", OUT, "with", len(entries), "entries:",
          doc["metadata"]["counts"]["by_familia"])


if __name__ == "__main__":
    main()
