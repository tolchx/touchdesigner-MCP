/**
 * glslTopRecipes — 5 visual recipes for glslTOP derived from The Book of
 * Shaders (https://thebookofshaders.com/?lan=es) concepts, rewritten in the
 * TD-verified idioms of docs/GLSL_TOP_RULES.md (commit d3e3327, live on
 * TD 2025.31760):
 *
 *   T1:  explicit `layout(location = 0) out vec4 fragColor;`
 *   T2:  vUV.swizzle is .st / .xy — never .uv (probe G)
 *   T5:  uniforms bound via vec0name + vec0valuex/y/z/w (probe J)
 *   T6:  outputresolution 'custom' + resolutionw/h is deterministic
 *   T9:  compile errors live in `<name>_info`
 *   T10: feedback does NOT advance under scripted cook(force=True) — the
 *        feedback recipes below therefore verify wiring/compilation only and
 *        are marked realtime-only for content.
 *
 * Every shader passes analyzeGlslTopShader() (the offline safety net).
 */
import { analyzeGlslTopShader } from "./glslValidate.js";
/** Shared header: T1 output declaration. */
const OUT = "layout(location = 0) out vec4 fragColor;\n";
// t1 circle_sdf — smoothstep circle, aspect-correct (Regla TOP 7 / probe I)
const T1_GLSL = `${OUT}
uniform float u_radius;      // vec0name='u_radius', vec0valuex=0.42 (const0 does NOT bind scripted)

void main() {
    vec2 p = vUV.st - 0.5;
    float d = length(p);
    float c = smoothstep(u_radius, u_radius - 0.02, d);
    fragColor = vec4(vec3(c), 1.0);
}
`;
// t2 value_noise — hash + value noise 2D, animated with u_time
const T2_GLSL = `${OUT}
uniform float u_time;        // vec0name='u_time', vec0valuex=<seconds>
uniform float u_scale;       // vec1name='u_scale', vec1valuex=8.0

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
        mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
        mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
        u.y
    );
}

void main() {
    vec2 p = vUV.st * u_scale;
    float n = noise(p + u_time);
    fragColor = vec4(vec3(n), 1.0);
}
`;
// t3 fbm_layers — 4-octave fBm over t2's noise
const T3_GLSL = `${OUT}
uniform float u_time;
uniform float u_scale;

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
        mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
        mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
        u.y
    );
}

float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
        v += a * noise(p);
        p *= 2.02;
        a *= 0.5;
    }
    return v;
}

void main() {
    vec2 q = vec2(fbm(vUV.st * u_scale + u_time),
                  fbm(vUV.st * u_scale + 5.2));
    float f = fbm(vUV.st * u_scale + 2.0 * q);
    fragColor = vec4(vec3(f), 1.0);
}
`;
// t4 grid_pattern — BoS Patterns chapter: grid lines via smoothstep
const T4_GLSL = `${OUT}
uniform float u_scale;       // grid cells across the output

float gridLine(vec2 uv, float cells) {
    vec2 g = abs(fract(uv * cells) - 0.5);
    float d = min(g.x, g.y);
    return smoothstep(0.05, 0.02, d);
}

void main() {
    float g = gridLine(vUV.st, u_scale);
    fragColor = vec4(vec3(g), 1.0);
}
`;
// t5 uv_ripple — concentric animated rings (BoS Patterns/Matrices)
const T5_GLSL = `${OUT}
uniform float u_time;
uniform float u_freq;

void main() {
    vec2 p = vUV.st - 0.5;
    float d = length(p);
    float wave = sin(d * u_freq - u_time * 2.0);
    float c = smoothstep(0.1, 0.9, wave);
    fragColor = vec4(vec3(c), 1.0);
}
`;
// t6 feedback_trails — feedback loop (wiring verified; content realtime-only, T10)
const T6_GLSL = `${OUT}
uniform float u_decay;       // vec0name='u_decay', vec0valuex=0.95

void main() {
    vec2 p = vUV.st - 0.5;
    float dot_ = smoothstep(0.06, 0.02, length(p));
    vec3 prev = texture(sTD2DInputs[0], vUV.st).rgb;
    fragColor = vec4(max(vec3(dot_), prev * u_decay), 1.0);
}
`;
// t7 reaction_diffusion — BoS Simulación chapter, single-pass approximation:
// advect/diffuse the PREVIOUS frame (feedback input) with a Laplacian kernel
// and re-inject a seed pattern. Needs real frames for meaningful evolution (T10).
const T7_GLSL = `${OUT}
uniform float u_diffusion;

void main() {
    vec2 px = vec2(1.0 / 256.0);   // 1 texel at the default 256x256 output
    vec2 uv = vUV.st;
    vec3 c  = texture(sTD2DInputs[0], uv).rgb;
    vec3 l  = texture(sTD2DInputs[0], uv - vec2(px.x, 0.0)).rgb;
    vec3 r  = texture(sTD2DInputs[0], uv + vec2(px.x, 0.0)).rgb;
    vec3 u  = texture(sTD2DInputs[0], uv - vec2(0.0, px.y)).rgb;
    vec3 d  = texture(sTD2DInputs[0], uv + vec2(0.0, px.y)).rgb;
    vec3 lap = (l + r + u + d - 4.0 * c);
    vec3 state = c + u_diffusion * lap;
    // seed: keep re-injecting a soft ring so the sim has a source
    float ring = smoothstep(0.30, 0.26, abs(length(uv - 0.5) - 0.2));
    state = mix(state, vec3(1.0), ring * 0.02);
    fragColor = vec4(clamp(state, 0.0, 1.0), 1.0);
}
`;
export const GLSL_TOP_RECIPES = [
    {
        id: "top-circle-sdf",
        title: "Círculo SDF aspect-correct",
        bosChapter: "https://thebookofshaders.com/07/?lan=es (Formas)",
        category: "shapes",
        glsl: T1_GLSL,
        uniforms: [
            { namePar: "vec0name", uniformName: "u_radius", valuePar: "vec0valuex", value: 0.42 },
        ],
        resolution: { w: 256, h: 256 },
        liveCheck: "numpyArray(): centro blanco (R>0.9), esquinas negras (R<0.1), " +
            "span horizontal ≈ span vertical (círculo, no elipse)",
    },
    {
        id: "top-value-noise",
        title: "Value noise 2D animado",
        bosChapter: "https://thebookofshaders.com/11/?lan=es (Random) / 13 (Noise)",
        category: "noise",
        glsl: T2_GLSL,
        uniforms: [
            { namePar: "vec0name", uniformName: "u_time", valuePar: "vec0valuex", value: 0.0 },
            { namePar: "vec1name", uniformName: "u_scale", valuePar: "vec1valuex", value: 8.0 },
        ],
        resolution: { w: 256, h: 256 },
        liveCheck: "numpyArray(): distribución de grises (min<0.2, max>0.8, no plano), " +
            "y cambia entre u_time=0.0 y u_time=5.0",
    },
    {
        id: "top-fbm-layers",
        title: "fBm 4 octavas con domain warp",
        bosChapter: "https://thebookofshaders.com/13/?lan=es (Noise / fBm)",
        category: "noise",
        glsl: T3_GLSL,
        uniforms: [
            { namePar: "vec0name", uniformName: "u_time", valuePar: "vec0valuex", value: 0.0 },
            { namePar: "vec1name", uniformName: "u_scale", valuePar: "vec1valuex", value: 3.0 },
        ],
        resolution: { w: 256, h: 256 },
        liveCheck: "numpyArray(): nube fractal suave (std entre 0.05 y 0.3, sin bandas duras); " +
            "compila con el loop const (GLSL ES compatible)",
    },
    {
        id: "top-grid-pattern",
        title: "Rejilla de líneas",
        bosChapter: "https://thebookofshaders.com/09/?lan=es (Patrones)",
        category: "pattern",
        glsl: T4_GLSL,
        uniforms: [
            { namePar: "vec1name", uniformName: "u_scale", valuePar: "vec1valuex", value: 8.0 },
        ],
        resolution: { w: 256, h: 256 },
        liveCheck: "numpyArray(): pico blanco en el centro de cada celda — contar cruces de " +
            "brillo a lo largo de la fila central ≈ 2*u_scale transiciones",
    },
    {
        id: "top-uv-ripple",
        title: "Anillos concéntricos animados",
        bosChapter: "https://thebookofshaders.com/09/?lan=es (Patrones) / 10 (Matrices)",
        category: "pattern",
        glsl: T5_GLSL,
        uniforms: [
            { namePar: "vec0name", uniformName: "u_time", valuePar: "vec0valuex", value: 0.0 },
            { namePar: "const0name", uniformName: "u_freq", valuePar: "const0value", value: 30.0 },
        ],
        resolution: { w: 256, h: 256 },
        liveCheck: "numpyArray(): perfil radial oscilante — muestrear a lo largo del radio " +
            "horizontal y contar máximos ≈ freq/(2π) escalado",
    },
    {
        id: "top-feedback-trails",
        title: "Estelas por feedback",
        bosChapter: "https://thebookofshaders.com/14/?lan=es (Simulación / Pingpong)",
        category: "feedback",
        glsl: T6_GLSL,
        uniforms: [
            { namePar: "vec0name", uniformName: "u_decay", valuePar: "vec0valuex", value: 0.95 },
        ],
        resolution: { w: 256, h: 256 },
        liveCheck: "WIRING ONLY en suite (Regla TOP 10: el buffer no avanza con cook scripteado): " +
            "glsl→feedback→glsl conecta sin errores de compilación. Contenido visual: solo " +
            "con frames reales de TD.",
        realtimeOnly: true,
    },
    {
        id: "top-reaction-diffusion",
        title: "Reaction-diffusion (aprox. 1 pasada)",
        bosChapter: "https://thebookofshaders.com/17/?lan=es (Simulación / Reaction diffusion)",
        category: "feedback",
        glsl: T7_GLSL,
        uniforms: [
            { namePar: "const0name", uniformName: "u_diffusion", valuePar: "const0value", value: 0.15 },
        ],
        resolution: { w: 256, h: 256 },
        liveCheck: "WIRING ONLY (T10): compila y cablea glsl→feedback→glsl sin errores; evolución " +
            "real requiere frames reales.",
        realtimeOnly: true,
    },
];
/**
 * Build ONE Python script (client.execute → /exec) that creates the recipe
 * network: shader textDAT + glslTOP with verified params (pixeldat,
 * vec0-star / const0-star uniforms), custom resolution, optional feedbackTOP loop, cooks and
 * prints a JSON report with pixel samples for the live check.
 * Python 3.9-safe.
 */
export function buildGlslTopRecipeCode(recipe, parentPath, prefix) {
    const shaderLiteral = JSON.stringify(recipe.glsl);
    const safePrefix = sanitizeNodeName(prefix);
    const uniLines = (nodeVar, indent) => recipe.uniforms
        .map((u) => `${indent}_set_par(${nodeVar}, ${JSON.stringify(u.namePar)}, ${JSON.stringify(u.uniformName)})\n` +
        `${indent}_set_par(${nodeVar}, ${JSON.stringify(u.valuePar)}, ${JSON.stringify(u.value)})`)
        .join("\n");
    const feedbackBlock = recipe.realtimeOnly
        ? `
    try:
        fb = parent.create(td.feedbackTOP, ${JSON.stringify(safePrefix + "_fb")})
        g.outputConnectors[0].connect(fb)
        fb.outputConnectors[0].connect(g)
        res["feedback"] = "wired (content realtime-only, Regla TOP 10)"
    except Exception as _fwe:
        res["feedback"] = "wire error: " + str(_fwe)[:120]`
        : "";
    return `import json
res = {"recipe": ${JSON.stringify(recipe.id)}, "errors": [], "created": [], "pixels": {}, "feedback": None}
try:
    parent = op(${JSON.stringify(parentPath)})
    if parent is None:
        raise RuntimeError("parent not found: ${parentPath}")

    def _set_par(node, pname, val):
        try:
            setattr(node.par, pname, val)
        except Exception as _e:
            res["errors"].append(str(pname) + ": " + str(_e)[:120])

    code = parent.create(td.textDAT, ${JSON.stringify(safePrefix + "_code")})
    code.text = ${shaderLiteral}
    res["created"].append(code.path)

    g = parent.create(td.glslTOP, ${JSON.stringify(safePrefix)})
    g.par.pixeldat = code.name
    g.par.outputresolution = "custom"
    g.par.resolutionw = ${recipe.resolution.w}
    g.par.resolutionh = ${recipe.resolution.h}
${uniLines("g", "    ")}
    g.nodeX = -400
    g.nodeY = 400
    res["created"].append(g.path)
${feedbackBlock}
    g.cook(force=True)

    res["td_errors"] = g.errors()
    res["res"] = [g.width, g.height]
    try:
        info = parent.op(g.name + "_info")
        res["infoDAT_has_ERROR"] = bool(info and "ERROR" in info.text)
    except Exception:
        res["infoDAT_has_ERROR"] = None
    try:
        arr = g.numpyArray()
        h = arr.shape[0]; w = arr.shape[1]
        res["pixels"] = {
            "center": [round(float(v), 4) for v in arr[h // 2][w // 2][:3]],
            "corner": [round(float(v), 4) for v in arr[4][4][:3]],
            "right_edge_mid": [round(float(v), 4) for v in arr[h // 2][w - 2][:3]],
            "min": round(float(arr.min()), 4),
            "max": round(float(arr.max()), 4),
        }
        # NEVER-BLACK POLICY (GLSL_TOP_RULES v1.3): a scripted first cook can
        # (non-deterministically) leave the glslTOP with a stale/black buffer
        # even though the shader is valid (td_errors empty, infoDAT clean).
        # Verified 2026-09-17 with 80+ probe creations: condition is NOT
        # reproducible by creation order (DAT/uniform/resolution variants all
        # render), so the builder treats it as a transient render-state issue
        # and repairs IN PLACE, cheapest step first:
        #   1. re-cook after re-writing pixeldat (touches the DAT reference)
        #   2. full destroy + recreate with populated DAT (v1.1 workaround)
        # The guarantee is the final rendered pixel check, not the order.
        if arr.max() <= 0.001 and not res["td_errors"] and not res.get("infoDAT_has_ERROR"):
            res["stale_first_cook"] = True
            g.par.pixeldat = code.name
            g.cook(force=True)
            arr = g.numpyArray()
        if arr.max() <= 0.001 and not res["td_errors"] and not res.get("infoDAT_has_ERROR"):
            gname = g.name
            g.destroy()
            g2 = parent.create(td.glslTOP, gname)
            g2.par.pixeldat = code.name
            g2.par.outputresolution = "custom"
            g2.par.resolutionw = ${recipe.resolution.w}
            g2.par.resolutionh = ${recipe.resolution.h}
${uniLines("g2", "            ")}
            g2.nodeX = -400
            g2.nodeY = 400
            g2.cook(force=True)
            arr2 = g2.numpyArray()
            if arr2.max() > 0.001:
                h2 = arr2.shape[0]; w2 = arr2.shape[1]
                res["pixels"] = {
                    "center": [round(float(v), 4) for v in arr2[h2 // 2][w2 // 2][:3]],
                    "corner": [round(float(v), 4) for v in arr2[4][4][:3]],
                    "right_edge_mid": [round(float(v), 4) for v in arr2[h2 // 2][w2 - 2][:3]],
                    "min": round(float(arr2.min()), 4),
                    "max": round(float(arr2.max()), 4),
                }
                res["recreated"] = True
            else:
                res["errors"].append("never-black policy exhausted: still black after re-cook + recreate")

    except Exception as _ne:
        res["errors"].append("numpy: " + str(_ne)[:120])
except Exception as _e:
    res["errors"].append("fatal: " + str(_e)[:200])
print(json.dumps(res))
`;
}
/** Offline gate: every recipe must pass the TOP safety net. */
export function validateAllRecipes() {
    return GLSL_TOP_RECIPES.map((r) => ({
        id: r.id,
        errors: analyzeGlslTopShader(r.glsl).errors,
    }));
}
/** TD node names: alphanumerics + underscore only. */
export function sanitizeNodeName(id) {
    return id.replace(/[^a-zA-Z0-9_]/g, "_");
}
