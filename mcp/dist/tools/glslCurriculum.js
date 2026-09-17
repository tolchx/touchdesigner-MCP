import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { ok, err } from "../helpers.js";
const CURRICULUM_PATH = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "data", "glsl_curriculum.json");
function loadCurriculum() {
    return JSON.parse(readFileSync(CURRICULUM_PATH, "utf-8"));
}
/** Suggest a learning path: entry + transitive prereqs, TOP before POP. */
function learningPath(entries, goal) {
    const byId = new Map(entries.map((e) => [e.id, e]));
    const visited = new Set();
    const order = [];
    const visit = (id) => {
        if (visited.has(id))
            return;
        visited.add(id);
        const e = byId.get(id);
        if (!e)
            return; // dangling prereq: skip, tool reports the gap
        e.prerequisitos.forEach(visit);
        order.push(e);
    };
    visit(goal.id);
    // TOPs first (pixel concepts), then POPs (geometry application)
    order.sort((a, b) => (a.familia === b.familia ? 0 : a.familia === "TOP" ? -1 : 1));
    return order;
}
/** Keyword → entry-id hints for the "path" action. */
const GOAL_HINTS = [
    { match: /forma|shape|sdf|c[íi]rculo|anillo/i, ids: ["top-01-shapes-sdf"] },
    { match: /ruido|noise|grano|textura/i, ids: ["top-02-random-noise", "top-03-fbm-layers"] },
    { match: /org[áa]nic|nube|humo|fractal|f?bm/i, ids: ["top-03-fbm-layers"] },
    { match: /grilla|mosaico|patr[óo]n|pattern|repet/i, ids: ["top-04-patterns-grid", "top-05-patterns-matrices"] },
    { match: /onda|ripple|pulso|radial/i, ids: ["top-05-patterns-matrices", "pop-05-image-ripple"] },
    { match: /estela|trail|feedback|echo/i, ids: ["top-06-motion-feedback-trails"] },
    { match: /org[áa]nico.*evolut|reacci[óo]n|diffusion|coral/i, ids: ["top-07-generative-reaction-diffusion"] },
    { match: /imagen|image|borde|edge|blur|glow|convoluci/i, ids: ["top-08-image-processing"] },
    { match: /part[íi]cul|simulaci|fluid/i, ids: ["tdedu-gpu-pop-simulations", "pop-01-wave-displacement"] },
    { match: /colores?|color|hsv|arco[íi]ris/i, ids: ["pop-02-color-hsv"] },
    { match: /displace|geometr[íi]a|puntos|malla/i, ids: ["pop-01-wave-displacement", "pop-03-noise-displacement"] },
    { match: /espirl|v[óo]rtice|galaxia/i, ids: ["pop-04-matrices-motion"] },
];
export function registerGlslCurriculumTools(server) {
    server.registerTool("td_glsl_curriculum", {
        title: "GLSL Curriculum (BoS + td-edu)",
        description: "Query the GLSL visual curriculum knowledge base (offline, no TD): " +
            'action "list" shows every entry (id, title, family, prereqs); "get" ' +
            "returns one entry with its TD-idiom shader reference, verified node " +
            "params and cited source; \"path\" suggests an ordered learning path " +
            'for a goal like "visuales orgánicos", "efectos de imagen" or "formas básicas".',
        inputSchema: {
            action: z
                .enum(["list", "get", "path"])
                .describe("What to query from the curriculum"),
            id: z.string().optional().describe("Entry id (action=get)"),
            goal: z
                .string()
                .optional()
                .describe("Short natural-language goal (action=path)"),
        },
    }, async ({ action, id, goal }) => {
        try {
            const kb = loadCurriculum();
            const entries = kb.entries;
            if (action === "list") {
                return ok({
                    counts: kb.metadata.counts,
                    sources: kb.metadata.sources,
                    entries: entries.map((e) => ({
                        id: e.id,
                        titulo_es: e.titulo_es,
                        familia: e.familia,
                        has_shader: !!e.shader_td,
                        prerequisitos: e.prerequisitos,
                    })),
                });
            }
            if (action === "get") {
                if (!id)
                    return err("action=get requires 'id' (see action=list)");
                const e = entries.find((x) => x.id === id);
                if (!e) {
                    return err("Unknown id '" + id + "'. Available ids: " +
                        entries.map((x) => x.id).join(", "));
                }
                const missing = e.prerequisitos.filter((p) => !entries.some((x) => x.id === p));
                return ok({ entry: e, prerequisitos_faltantes: missing });
            }
            // action === "path"
            if (!goal) {
                return err('action=path requires \'goal\' (e.g. "visuales orgánicos", "efectos de imagen")');
            }
            const hits = GOAL_HINTS.filter((h) => h.match.test(goal)).flatMap((h) => h.ids);
            if (hits.length === 0) {
                return err("No curriculum match for '" + goal + "'. Try: formas, ruido, " +
                    "orgánicos, patrones, ondas, estelas/feedback, reacción-difusión, " +
                    "efectos de imagen, partículas, color.");
            }
            const chain = [...new Set(hits)].flatMap((gid) => {
                const g = entries.find((x) => x.id === gid);
                return g ? learningPath(entries, g) : [];
            });
            // de-dup preserving order
            const seen = new Set();
            const path = chain.filter((e) => seen.has(e.id) ? false : (seen.add(e.id), true));
            return ok({
                goal,
                steps: path.map((e, i) => ({
                    paso: i + 1,
                    id: e.id,
                    titulo_es: e.titulo_es,
                    familia: e.familia,
                    shader_td: e.shader_td,
                    por_que: e.concepto,
                    fuente_citada: e.fuente_citada,
                })),
                cierre: "Los shaders referenciados viven en glsl_files/ y cumplen las " +
                    "reglas de docs/GLSL_TOP_RULES.md y docs/GLSL_POP_RULES.md; " +
                    "verificalos con td_glsl_top_analyze antes de aplicarlos en TD.",
            });
        }
        catch (e) {
            return err(e);
        }
    });
}
