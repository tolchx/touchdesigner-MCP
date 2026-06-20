/**
 * Semantic Resolution Engine — Single Source of Truth for NL→TD Resolution
 *
 * Maps natural language prompts (in Spanish and English) to canonical
 * TouchDesigner operators, parameters, attributes, and family hints.
 *
 * This module is the canonical source for:
 *   - TYPE_SYNONYMS: 200+ word→operator type mappings
 *   - FAMILY_HINTS: trigger words → TD families (with specificity scoring)
 *   - CONCEPTS: higher-level concept→parameter/attribute mappings
 *   - PARAMETER_ALIASES, ATTRIBUTE_ALIASES, OPERATOR_HINTS
 *   - resolveOperatorType(), getBestFamily(), resolvePrompt(), resolveSemanticTerms()
 */
import { z } from "zod";
// NOTE: NetworkTemplate type stays in networkTemplates.ts to avoid circular deps.
// resolvePrompt() is defined there, combining templates + semantic resolution.

// ─── Schema ─────────────────────────────────────────────────────────────────

export const SemanticResolutionSchema = z.object({
  original: z.string(),
  normalized: z.string(),
  conceptMatches: z.array(
    z.object({
      concept: z.string(),
      canonical: z.string(),
      aliases: z.array(z.string()),
      note: z.string().optional(),
    })
  ),
  familyHints: z.array(z.enum(["POP", "TOP", "CHOP", "SOP", "DAT"])),
  parameterHints: z.array(
    z.object({
      requested: z.string(),
      canonical: z.string(),
      note: z.string().optional(),
    })
  ),
  attributeHints: z.array(
    z.object({
      requested: z.string(),
      canonical: z.string(),
      note: z.string().optional(),
    })
  ),
  operatorHints: z.array(
    z.object({
      requested: z.string(),
      canonical: z.string(),
      family: z.string().optional(),
      note: z.string().optional(),
    })
  ),
});

export type SemanticResolution = z.infer<typeof SemanticResolutionSchema>;

// ─── Knowledge Base (semantic-specific) ─────────────────────────────────────

interface Concept {
  concept: string;
  canonical: string;
  aliases: string[];
  note?: string;
}

interface ParameterAlias {
  requested: string;
  canonical: string;
  note?: string;
}

interface AttributeAlias {
  requested: string;
  canonical: string;
  note?: string;
}

interface OperatorHint {
  requested: string;
  canonical: string;
  family?: string;
  note?: string;
}

// ─── Concepts (bilingual, parameter-level) ──────────────────────────────────

const CONCEPTS: Concept[] = [
  {
    concept: "feedback loop",
    canonical: "particlesupdatepop",
    aliases: [
      "feedback",
      "feedback loop",
      "update loop",
      "solver loop",
      "loop de particulas",
    ],
    note: "En sistemas POP de partículas suele resolverse al parámetro que apunta al final del solver.",
  },
  {
    concept: "field weight",
    canonical: "Weight",
    aliases: ["weight", "peso del campo", "peso", "influencia del campo", "falloff"],
  },
  {
    concept: "particle force",
    canonical: "PartForce",
    aliases: ["force", "particle force", "fuerza", "turbulencia"],
  },
  {
    concept: "particle velocity",
    canonical: "PartVel",
    aliases: ["velocity", "velocidad", "speed"],
  },
  {
    concept: "particle life",
    canonical: "PartLife",
    aliases: ["life", "lifespan", "vida", "edad", "age"],
  },
  {
    concept: "point size",
    canonical: "pointscale",
    aliases: ["point scale", "point size", "size", "tamaño", "escala de punto"],
  },
  {
    concept: "rotation vector",
    canonical: "Rot",
    aliases: ["rotation", "rot", "direccion", "direction", "orientacion", "orientation"],
  },
  {
    concept: "point color",
    canonical: "Color",
    aliases: ["color", "cd", "colour"],
  },
  {
    concept: "curl noise",
    canonical: "CurlNoise",
    aliases: ["curl noise", "curl", "divergence-free", "fluido", "fluid", "turbulencia"],
    note: "Ruido libre de divergencia para simulación de fluidos en Noise POP (modo curl).",
  },
  {
    concept: "boids / flocking",
    canonical: "Boids",
    aliases: ["boids", "flocking", "separation", "alignment", "cohesion", "bandada"],
    note: "Algoritmo de flocking: separation + alignment + cohesion.",
  },
  {
    concept: "SPH fluid",
    canonical: "SPH",
    aliases: ["sph", "fluid", "fluido", "smoothed particle hydrodynamics", "hidrodinámica"],
    note: "Simulación de fluidos con Smoothed Particle Hydrodynamics vía GLSL POP compute.",
  },
  {
    concept: "instancing",
    canonical: "Instancing",
    aliases: ["instancing", "instance", "instancia", "copias", "copy sop", "geometry comp", "copy pop"],
    note: "Instanciado de geometría usando geometryCOMP + copySOP o Copy POP.",
  },
  {
    concept: "audio reactive",
    canonical: "AudioReactive",
    aliases: ["audio reactive", "audio reactivo", "sound reactive", "music reactive", "sonido"],
    note: "Sistemas reactivos al audio usando audioAnalysisCHOP o audioCHOP.",
  },
  {
    concept: "dmx lighting",
    canonical: "DMX",
    aliases: ["dmx", "lighting", "iluminación", "art-net", "artnet", "sacn", "sACN", "dmx fixture"],
    note: "Control de iluminación DMX mediante DMX Out CHOP / DMX Fixture POP.",
  },
  {
    concept: "trail / motion blur",
    canonical: "Trail",
    aliases: ["trail", "trails", "motion blur", "estela", "rastro", "persistencia", "trail pop"],
  },
  {
    concept: "cache / playback",
    canonical: "Cache",
    aliases: ["cache", "caching", "playback", "reproducción", "buffer", "cache pop", "cache select pop"],
  },
  {
    concept: "neighbor detection",
    canonical: "Neighbor",
    aliases: ["neighbor", "neighbour", "vecino", "proximity", "cerca", "interaction", "neighbor pop"],
    note: "Detección de puntos vecinos para interacciones POP mediante Neighbor POP.",
  },
  {
    concept: "atomic operations",
    canonical: "Atomic",
    aliases: ["atomic", "collision", "colisión", "buffer atomico", "ssbo", "glsl atomic"],
    note: "Operaciones atómicas en GLSL POP para colisiones y buffers compartidos.",
  },
  {
    concept: "particle lifecycle",
    canonical: "ParticleLifecycle",
    aliases: ["particle lifecycle", "lifecycle", "normalized age", "normalizedage", "age", "life curve", "lookup curve"],
    note: "Control avanzado del ciclo de vida con normalizedAge (Age/Life) + Curve POP + Lookup POP.",
  },
  {
    concept: "pre-roll particles",
    canonical: "PreRoll",
    aliases: ["pre-roll", "preroll", "pre roll", "initial simulation", "simulación inicial", "steady state"],
    note: "Pre-Roll en Particle POP para simular frames antes del inicio.",
  },
  {
    concept: "particle emission",
    canonical: "ParticleEmission",
    aliases: ["emission", "emisión", "birth rate", "tasa de nacimiento", "rate", "emit"],
    note: "Control de emisión en Particle POP: Rate (velocidad) + Life (vida máxima).",
  },
  {
    concept: "field weight",
    canonical: "FieldWeight",
    aliases: ["field weight", "weight", "peso", "influencia", "field influence", "dist", "distance to center"],
    note: "Field POP calcula Weight (0 fuera, 1 dentro) y Dist (distancia al centro del campo).",
  },
  {
    concept: "field shape",
    canonical: "FieldShape",
    aliases: ["field shape", "forma de campo", "sphere field", "box field", "tube field", "capsule field"],
    note: "Geometrías disponibles en Field POP: Sphere, Box, Tube, Capsule.",
  },
  {
    concept: "copy pop instancing",
    canonical: "CopyPopInstancing",
    aliases: ["copy pop", "copy pop instancing", "multiplicar geometría", "multiply geometry", "standalone mode", "template mode"],
    note: "Copy POP: modo Standalone o modo Template.",
  },
  {
    concept: "target pop / feedback loop",
    canonical: "TargetPop",
    aliases: ["target pop", "target", "feedback target", "particlesupdatepop", "previous frame", "frame anterior", "null pop as target"],
    note: "Target POP almacena el frame anterior para Particle POP y Feedback POP.",
  },
  {
    concept: "lookup texture",
    canonical: "LookupTexture",
    aliases: ["lookup texture", "lookup texture pop", "uv sampling", "muestreo uv", "texture lookup", "color from texture"],
    note: "Lookup Texture POP samples color desde un TOP y lo asigna a puntos por UV.",
  },
  {
    concept: "gpu compute pipeline",
    canonical: "GPUCompute",
    aliases: ["gpu compute", "compute shader", "glsl compute", "cuda", "gpu particles", "gpu simulation"],
    note: "Pipeline GPU-nativo: mantener operaciones dentro del dominio POP.",
  },
];

// ─── Parameter Aliases ──────────────────────────────────────────────────────

const PARAMETER_ALIASES: ParameterAlias[] = [
  { requested: "life", canonical: "lifeexpect / PartLife", note: "Depende del operador." },
  { requested: "size", canonical: "pointscale", note: "Alias típico en POPs." },
  { requested: "feedback target", canonical: "particlesupdatepop", note: "Parámetro del solver POP." },
  { requested: "radius", canonical: "radx/rady/radz o radius", note: "Varía entre operadores." },
  { requested: "res", canonical: "resolution", note: "Común en TOPs." },
  { requested: "birth rate", canonical: "birthrate", note: "Tasa de nacimiento en Particle POP." },
  { requested: "drag", canonical: "drag", note: "Amortiguación/aire en forces." },
  { requested: "amplitude", canonical: "amplitude", note: "Amplitud de ruido/ondas." },
  { requested: "frequency", canonical: "frequency", note: "Frecuencia de ruido/ondas." },
  { requested: "pre-roll", canonical: "preroll", note: "Simular frames antes del inicio." },
  { requested: "damping", canonical: "drag", note: "Amortiguación en Particle POP." },
  { requested: "normalized age", canonical: "normalizedAge", note: "Edad normalizada para lookup curves." },
  { requested: "weight", canonical: "Weight", note: "Peso/influencia en Field POP (0-1)." },
  { requested: "dist", canonical: "Dist", note: "Distancia al centro del campo." },
  { requested: "wrap", canonical: "wrap", note: "Modo wrap para Lookup Texture POP." },
  { requested: "filter", canonical: "filter", note: "Filtro de muestreo." },
  { requested: "partforce", canonical: "PartForce", note: "Fuerza acumulativa en Particle POP." },
  { requested: "partvel", canonical: "PartVel", note: "Velocidad de partícula." },
  { requested: "partlife", canonical: "PartLife", note: "Vida de partícula." },
  { requested: "lifespan", canonical: "lifeexpect", note: "Expectativa de vida en Particle POP." },
  { requested: "falloff", canonical: "falloff", note: "Decaimiento en campos y forces." },
];

// ─── Attribute Aliases ──────────────────────────────────────────────────────

const ATTRIBUTE_ALIASES: AttributeAlias[] = [
  { requested: "p", canonical: "P / _P", note: "Posición." },
  { requested: "n", canonical: "N / _N", note: "Normal." },
  { requested: "cd", canonical: "Color", note: "Color por punto." },
  { requested: "scale", canonical: "pointscale", note: "Escala de punto." },
  { requested: "vel", canonical: "v / _V / PartVel", note: "Velocidad." },
  { requested: "uv", canonical: "uv", note: "Coordenadas UV." },
  { requested: "age", canonical: "age / _AGE", note: "Edad de partícula." },
  { requested: "life", canonical: "life / _LIFE", note: "Vida máxima." },
  { requested: "weight", canonical: "Weight", note: "Peso de campo (Field POP)." },
  { requested: "dist", canonical: "Dist", note: "Distancia al centro (Field POP)." },
  { requested: "alpha", canonical: "Alpha", note: "Transparencia/alfa." },
  { requested: "rot", canonical: "Rot / _ROT", note: "Rotación." },
  { requested: "pscale", canonical: "pointscale", note: "Escala de punto." },
  { requested: "width", canonical: "LineWidth", note: "Ancho de línea." },
  { requested: "force", canonical: "PartForce / _FORCE", note: "Fuerza acumulativa." },
];

// ─── Operator Hints (from semantic vault) ───────────────────────────────────

const OPERATOR_HINTS: OperatorHint[] = [
  { requested: "top to pop", canonical: "TOP to POP", family: "POP" },
  { requested: "copy", canonical: "Copy POP / Copy SOP", family: "POP/SOP" },
  { requested: "field", canonical: "Field POP", family: "POP" },
  { requested: "particle", canonical: "Particle POP", family: "POP" },
  { requested: "particles", canonical: "Particle POP", family: "POP" },
  { requested: "particulas", canonical: "Particle POP", family: "POP" },
  { requested: "noise", canonical: "Noise TOP / Noise CHOP / Noise POP", family: "TOP/CHOP/POP" },
  { requested: "limit", canonical: "Limit POP / Limit CHOP", family: "POP/CHOP" },
  { requested: "null", canonical: "Null CHOP / Null TOP / Null DAT / Null SOP / Null POP", family: "multi" },
  { requested: "glsl", canonical: "GLSL TOP / GLSL POP / GLSL MAT", family: "TOP/POP/MAT" },
  { requested: "feedback top", canonical: "Feedback TOP", family: "TOP" },
  { requested: "feedback pop", canonical: "Feedback POP", family: "POP" },
  { requested: "sphere pop", canonical: "Sphere POP", family: "POP" },
  { requested: "grid pop", canonical: "Grid POP", family: "POP" },
  { requested: "point generator", canonical: "Point Generator POP", family: "POP" },
  { requested: "render top", canonical: "Render TOP / Render Simple TOP", family: "TOP" },
  { requested: "geometry comp", canonical: "Geometry COMP", family: "COMP" },
  { requested: "sop to pop", canonical: "SOP to POP", family: "POP" },
  { requested: "chop to pop", canonical: "CHOP to POP", family: "POP" },
  { requested: "audio chop", canonical: "Audio CHOP / Audio Analysis CHOP", family: "CHOP" },
  { requested: "particle pop", canonical: "Particle POP", family: "POP" },
  { requested: "field pop", canonical: "Field POP", family: "POP" },
  { requested: "copy pop", canonical: "Copy POP", family: "POP" },
  { requested: "limit pop", canonical: "Limit POP", family: "POP" },
  { requested: "random pop", canonical: "Random POP", family: "POP" },
  { requested: "trail pop", canonical: "Trail POP", family: "POP" },
  { requested: "transform pop", canonical: "Transform POP", family: "POP" },
  { requested: "math pop", canonical: "Math POP", family: "POP" },
  { requested: "attribute pop", canonical: "Attribute POP", family: "POP" },
  { requested: "noise pop", canonical: "Noise POP", family: "POP" },
  { requested: "sprinkle pop", canonical: "Sprinkle POP", family: "POP" },
  { requested: "delete pop", canonical: "Delete POP", family: "POP" },
  { requested: "dmx out pop", canonical: "DMX Out POP", family: "POP" },
  { requested: "dmx fixture pop", canonical: "DMX Fixture POP", family: "POP" },
  { requested: "glsl pop", canonical: "GLSL POP / GLSL Create POP / GLSL Advanced POP", family: "POP" },
  { requested: "null pop", canonical: "Null POP", family: "POP" },
  { requested: "sort pop", canonical: "Sort POP", family: "POP" },
  { requested: "switch pop", canonical: "Switch POP", family: "POP" },
  { requested: "select pop", canonical: "Select POP", family: "POP" },
  { requested: "merge pop", canonical: "Merge POP", family: "POP" },
  { requested: "neighbor pop", canonical: "Neighbor POP", family: "POP" },
  { requested: "box pop", canonical: "Box POP", family: "POP" },
  { requested: "circle pop", canonical: "Circle POP", family: "POP" },
  { requested: "tube pop", canonical: "Tube POP", family: "POP" },
  { requested: "torus pop", canonical: "Torus POP", family: "POP" },
  { requested: "point pop", canonical: "Point POP", family: "POP" },
  { requested: "line pop", canonical: "Line POP", family: "POP" },
  { requested: "feedback pop", canonical: "Feedback POP", family: "POP" },
  { requested: "color pop", canonical: "Color POP", family: "POP" },
  { requested: "sprite pop", canonical: "Sprite POP", family: "POP" },
  { requested: "drag pop", canonical: "Drag POP", family: "POP" },
  { requested: "analyze pop", canonical: "Analyze POP", family: "POP" },
  { requested: "normalize pop", canonical: "Normalize POP", family: "POP" },
  { requested: "glsl create pop", canonical: "GLSL Create POP", family: "POP" },
  { requested: "glsl advanced pop", canonical: "GLSL Advanced POP", family: "POP" },
  { requested: "pattern pop", canonical: "Pattern POP", family: "POP" },
  { requested: "cache pop", canonical: "Cache POP", family: "POP" },
];

// ─── TYPE_SYNONYMS: 200+ word → operator type mappings (from networkTemplates) ──

export const TYPE_SYNONYMS: Record<string, string[]> = {
  // ── TOP: Texture Operators ────────────────────────────────────────────────
  "videodeviceinTOP": [
    "webcam", "camera", "cam", "live camera", "video input", "capture",
    "webcam feed", "live feed", "camera input", "device input",
    "usb camera", "laptop camera", "built-in camera", "webcam input",
  ],
  "noiseTOP": [
    "noise", "static", "grain", "random texture", "procedural noise",
    "noise texture", "perlin", "simplex", "noise generator",
    "random pattern", "static texture", "grain texture", "tv static",
    "white noise", "noise map", "texture noise",
  ],
  "compositeTOP": [
    "merge", "combine", "mix", "blend", "composite", "layer",
    "overlay", "add together", "multiply", "screen blend",
    "alpha blend", "image blend", "mix images", "layering",
    "compositing", "combine images", "mix textures", "blend layers",
  ],
  "blurTOP": [
    "blur", "smooth", "soften", "gaussian blur", "defocus",
    "soft focus", "blur filter", "smoothing", "soft blur",
    "out of focus", "blurry", "motion blur top", "radial blur",
  ],
  "levelTOP": [
    "level", "brightness", "contrast", "levels", "exposure",
    "gamma", "color correct", "brightness contrast", "black level",
    "white level", "gain adjust", "color adjustment",
  ],
  "transformTOP": [
    "transform", "rotate", "scale", "translate", "move",
    "warp", "skew", "flip", "mirror", "resize",
    "2d transform", "position", "rotation", "scaling", "offset",
  ],
  "feedbackTOP": [
    "feedback", "feedback loop", "video feedback", "temporal feedback",
    "frame accumulation", "feedback top", "accumulation buffer",
    "recursive feedback", "composite feedback",
  ],
  "edgeTOP": [
    "edge detect", "edge detection", "sobel", "find edges",
    "edge filter", "outline", "contour detect", "laplacian",
    "edge map", "edge highlight", "image edges",
  ],
  "chromakeyTOP": [
    "chroma key", "green screen", "blue screen", "keyer",
    "color key", "chromakey", "remove green", "remove blue",
    "key out", "chroma removal", "greenscreen key",
  ],
  "overTOP": [
    "over", "over composite", "alpha over", "front over back",
    "layer over", "place on top", "composite over", "foreground over",
  ],
  "kaleidoscopeTOP": [
    "kaleidoscope", "kaleido", "mirror effect", "radial mirror",
    "kaleidoscopic", "mirror segments", "segment mirror", "radial repeat",
  ],
  "constantTOP": [
    "constant", "solid color", "uniform", "color fill",
    "solid fill", "background color", "flat color", "uniform value",
    "time uniform", "constant value", "solid background",
  ],
  "glslTOP": [
    "glsl", "shader", "fragment shader", "glsl shader",
    "custom shader", "gpu shader", "compute shader top",
    "glsl fragment", "shader effect", "pixel shader",
  ],
  "moviefileinTOP": [
    "movie", "video", "clip", "footage", "film",
    "video file", "movie file", "media file", "mp4",
    "video input", "movie in", "video source", "footage source",
    "import video", "load movie", "play video",
  ],
  "rampTOP": [
    "ramp", "gradient", "color ramp", "gradient fill",
    "background gradient", "gradient background", "gradient ramp",
  ],
  "thresholdTOP": [
    "threshold", "binary", "threshold filter", "cutoff",
    "posterize", "binary image", "black white", "bw filter",
  ],
  "displaceTOP": [
    "displace", "displacement", "warp with map", "displacement map",
    "distort", "offset map", "uv warp", "pixel displace",
  ],
  "lookupTOP": [
    "lookup", "color lookup", "lut", "color grade",
    "lookup table", "color correction", "grade", "color map",
    "palette swap", "color transform",
  ],
  "textTOP": [
    "text", "title", "type", "font", "text overlay",
    "label", "text generator", "typography", "text render",
  ],
  "cropTOP": [
    "crop", "trim", "cut", "region of interest", "roi",
    "crop image", "image crop", "trim edges",
  ],
  "tileTOP": [
    "tile", "repeat", "mosaic", "tile pattern", "tiling",
    "repeat texture", "wrap texture",
  ],
  "resolutionTOP": [
    "resolution", "resize", "output resolution", "change resolution",
    "resample", "downsample", "scale resolution",
  ],
  "nullTOP": [
    "null", "output", "out", "final output", "render output",
    "display output", "end of chain", "terminal node",
  ],

  // ── CHOP: Channel Operators ───────────────────────────────────────────────
  "audiodeviceinCHOP": [
    "mic", "microphone", "audio input", "live audio",
    "sound input", "audio device", "mic input", "microphone input",
    "audio capture", "live mic", "line in", "audio in",
  ],
  "audiofileinCHOP": [
    "audio file", "sound file", "wav", "mp3", "audio clip",
    "music file", "song", "track", "audio source", "load audio",
    "audio playback", "sound", "audio stream", "background music",
  ],
  "audiospectrumCHOP": [
    "spectrum", "fft", "frequency", "spectral", "audio spectrum",
    "frequency analysis", "spectrum analyzer", "frequency bins",
    "fft analysis", "audio fft", "spectral analysis", "fourier",
    "frequency visualization", "audio visualizer",
  ],
  "mathCHOP": [
    "math", "arithmetic", "add", "multiply", "gain",
    "offset", "scale channels", "channel math", "signal math",
    "compute", "calculate", "math operation",
  ],
  "mergeCHOP": [
    "merge chop", "combine channels", "merge channels", "join channels",
    "channel merge", "multi merge",
  ],
  "noiseCHOP": [
    "noise chop", "signal noise", "random signal", "noise signal",
    "chop noise", "noisy signal",
  ],
  "lfoCHOP": [
    "lfo", "oscillator", "low frequency", "wave", "sine wave",
    "sawtooth", "square wave", "triangle wave", "osc",
    "waveform", "periodic", "lfo wave",
  ],
  "constantCHOP": [
    "constant chop", "fixed value", "constant value", "dc offset",
    "dc signal", "static value",
  ],
  "lagCHOP": [
    "lag", "smooth signal", "filter signal", "slew",
    "low pass", "signal smoothing", "damping", "smooth",
    "ease", "interpolate signal",
  ],
  "filterCHOP": [
    "filter", "bandpass", "highpass", "lowpass", "eq",
    "equalizer", "audio filter", "filter chop",
  ],
  "oscCHOP": [
    "oscillator", "tone", "synthesizer", "synth", "wave",
    "audio oscillator", "sound generator", "tone generator",
    "frequency generator",
  ],
  "countCHOP": [
    "count", "counter", "step", "increment", "tick",
    "frame count", "incrementor",
  ],
  "selectCHOP": [
    "select", "choose", "pick", "channel select",
    "select channel", "channel picker",
  ],
  "choptoTOP": [
    "chop to top", "convert to texture", "signal to image",
    "chop to texture", "channel to pixel", "audio to texture",
    "signal visualization", "waveform renderer",
  ],
  "nullCHOP": [
    "null chop", "chop output", "chop terminal", "channel output",
  ],

  // ── SOP: Surface Operators ────────────────────────────────────────────────
  "sphereSOP": [
    "sphere", "ball", "globe", "sphere geometry", "3d sphere",
    "sphere shape", "round shape",
  ],
  "boxSOP": [
    "box", "cube", "rectangular", "box shape", "3d box",
    "cube shape", "cuboid",
  ],
  "gridSOP": [
    "grid", "plane", "flat surface", "terrain",
    "grid surface", "plane geometry", "flat grid",
  ],
  "circleSOP": [
    "circle", "ring", "disc", "2d circle", "circular",
    "round shape sop", "circle geometry",
  ],
  "tubeSOP": [
    "tube", "cylinder", "pipe", "hollow cylinder",
    "cylindrical", "barrel",
  ],
  "torusSOP": [
    "torus", "doughnut", "donut", "ring shape",
    "torus shape", "torus geometry",
  ],
  "textSOP": [
    "text sop", "3d text", "text geometry", "extruded text",
    "3d type", "geometric text",
  ],
  "transformSOP": [
    "transform sop", "move geometry", "rotate sop", "scale sop",
    "translate sop", "3d transform",
  ],
  "noiseSOP": [
    "noise sop", "deform", "displace sop", "warp geometry",
    "deformation", "noise deformation",
  ],
  "mergeSOP": [
    "merge sop", "combine geometry", "join geometry", "sop merge",
  ],
  "nullSOP": [
    "null sop", "sop output", "geometry output", "sop terminal",
  ],

  // ── DAT: Data Operators ───────────────────────────────────────────────────
  "textDAT": [
    "text dat", "text file", "notepad", "snippet",
    "code snippet", "text block", "dat text",
  ],
  "tableDAT": [
    "table", "spreadsheet", "csv", "data table",
    "grid data", "tabular", "excel", "dat table",
    "rows columns", "data grid",
  ],
  "scriptDAT": [
    "script", "python script", "td script", "code",
    "dat script", "script dat", "python dat",
  ],
  "executeDAT": [
    "execute", "run script", "trigger script", "python execute",
    "callback", "event script", "frame script",
  ],
  "selectDAT": [
    "select dat", "query dat", "dat select", "pick dat",
  ],
  "mergeDAT": [
    "merge dat", "join dat", "combine text", "dat merge",
  ],
  "nullDAT": [
    "null dat", "dat output", "text output", "dat terminal",
  ],

  // ── POP: Particle Operators ───────────────────────────────────────────────
  "particlePOP": [
    "particle", "particles", "sim", "simulation",
    "particle system", "particle sim", "pop sim", "pop solver",
    "particle solver", "particle simulation", "point simulation",
    "particle emitter", "particle physics", "particle engine",
    "particle network", "pop network",
  ],
  "spherePOP": [
    "sphere pop", "pop sphere", "particle sphere", "birth sphere",
    "spherical source", "sphere emitter", "sphere birth",
    "round emitter",
  ],
  "gridPOP": [
    "grid pop", "pop grid", "particle grid", "grid emitter",
    "grid source", "flat emitter",
  ],
  "noisePOP": [
    "noise pop", "pop noise", "turbulence", "curl noise",
    "random force", "particle noise", "pop turbulence",
    "noise force", "chaotic force", "random motion",
    "wiggle particles", "jitter particles",
  ],
  "forcePOP": [
    "force", "gravity", "attract", "force pop",
    "gravity force", "attractor", "field force", "pop force",
    "directional force", "wind force", "push force",
  ],
  "dragPOP": [
    "drag", "damping", "air resistance", "friction",
    "slow down", "velocity damping", "drag force",
  ],
  "trailPOP": [
    "trail", "trails", "particle trail", "pop trail",
    "motion trail", "trace", "streak", "afterimage",
    "path trace", "trail geometry",
  ],
  "renderPOP": [
    "render pop", "pop render", "render particles", "pop to top",
    "particle renderer", "point render", "particle image",
  ],
  "glslPOP": [
    "glsl pop", "pop glsl", "gpu particles", "compute shader pop",
    "glsl compute", "gpu pop", "particle shader",
  ],
  "lookupPOP": [
    "lookup pop", "pop lookup", "particle lookup", "uv sample",
    "particle texture", "texture particles",
  ],
  "colorPOP": [
    "color pop", "pop color", "particle color", "point color",
    "color particles", "set particle color",
  ],
  "spritePOP": [
    "sprite", "sprite pop", "billboard", "pop sprite",
    "textured particle", "particle sprite", "sprite particle",
  ],
  "fieldPOP": [
    "field", "field pop", "pop field", "force field",
    "field force", "proximity field", "volume field",
    "spherical field", "box field", "tube field",
  ],
  "transformPOP": [
    "transform pop", "pop transform", "move particles",
    "rotate pop", "scale pop", "particle transform",
  ],
  "attributePOP": [
    "attribute", "pop attribute", "set attribute", "custom attribute",
    "particle attribute", "attribute set",
  ],
  "mergePOP": [
    "merge pop", "pop merge", "combine particles", "join particles",
    "particle merge",
  ],
  "nullPOP": [
    "null pop", "pop terminal", "pop output", "feedback target",
    "pop null", "particle null",
  ],
  "sortPOP": [
    "sort pop", "pop sort", "order particles", "particle sort",
  ],
  "selectPOP": [
    "select pop", "pop select", "filter particles", "particle select",
    "particle filter",
  ],
  "deletePOP": [
    "delete pop", "pop delete", "kill particles", "remove particles",
    "cull particles", "particle death",
  ],
  "limitPOP": [
    "limit", "limit pop", "pop limit", "restrict particles",
    "max particles", "cap particles",
  ],
  "switchPOP": [
    "switch pop", "pop switch", "switch particles", "particle switch",
  ],
  "feedbackPOP": [
    "feedback pop", "pop feedback", "particle feedback", "pop loop",
    "particle loop", "pop solver loop",
  ],
  "neighborPOP": [
    "neighbor", "neighbor pop", "pop neighbor", "proximity",
    "nearby particles", "particle neighbor", "close particles",
    "interaction", "boids", "flocking",
  ],
  "patternPOP": [
    "pattern pop", "pop pattern", "particle pattern", "pop template",
  ],
  "boxPOP": [
    "box pop", "pop box", "box emitter", "cuboid emitter",
  ],
  "circlePOP": [
    "circle pop", "pop circle", "circle emitter", "ring emitter",
  ],
  "tubePOP": [
    "tube pop", "pop tube", "cylinder emitter", "tube emitter",
  ],
  "torusPOP": [
    "torus pop", "pop torus", "donut emitter", "torus emitter",
  ],
  "linePOP": [
    "line pop", "pop line", "line emitter", "edge emitter",
  ],
  "pointPOP": [
    "point pop", "pop point", "single point", "point emitter",
    "single particle",
  ],
  "analyzePOP": [
    "analyze pop", "pop analyze", "analyze particles",
  ],
  "normalizePOP": [
    "normalize pop", "pop normalize", "normalize particles",
  ],

  // ── COMP: Component Operators ─────────────────────────────────────────────
  "containerCOMP": [
    "container", "comp", "component", "sub network",
    "group", "folder", "subnet", "subcomponent",
    "network box", "container comp",
  ],
  "baseCOMP": [
    "base", "base comp", "root", "panel", "panel comp",
    "ui container", "component base",
  ],
  "geometryCOMP": [
    "geometry comp", "geo comp", "3d container", "scene container",
    "geometry container", "3d world",
  ],
  "cameraCOMP": [
    "camera", "camera comp", "3d camera", "view camera",
    "render camera", "cam comp",
  ],
  "lightCOMP": [
    "light", "light comp", "light source", "3d light",
    "point light", "spot light", "directional light", "render light",
  ],
  "panelCOMP": [
    "panel", "ui panel", "control panel", "interface",
    "widget panel", "dashboard", "panel comp",
  ],

  // ── MAT: Material Operators ───────────────────────────────────────────────
  "phongMAT": [
    "phong", "material", "shader material", "3d material",
    "phong material", "lighting material", "shiny material",
    "surface material", "material shader",
  ],
  "constantMAT": [
    "constant material", "flat material", "unlit material",
    "solid material", "emissive material",
  ],
  "glslMAT": [
    "glsl material", "custom material", "shader material mat",
    "glsl mat", "custom shader material",
  ],
  "pbrMAT": [
    "pbr", "physically based", "pbr material",
    "physically based rendering", "realistic material",
    "metalness", "roughness material",
  ],
};

// ─── Family Hints (with specificity scoring) ────────────────────────────────

export interface FamilyHintEntry {
  family: "TOP" | "CHOP" | "SOP" | "DAT" | "POP" | "COMP" | "MAT";
  /** Higher = more specific; used for tie-breaking */
  specificity: number;
  /** Words that suggest this family */
  aliases: string[];
}

export const FAMILY_HINTS: FamilyHintEntry[] = [
  {
    family: "TOP",
    specificity: 10,
    aliases: [
      "TOP", "texture", "image", "video", "post fx", "postfx",
      "blur", "feedback top", "composite", "glsl top", "kaleidoscope",
      "chroma key", "green screen", "glow", "bloom", "edge detect",
      "transform top", "level top", "crop", "tile", "ramp",
      "movie", "footage", "clip", "webcam", "camera",
      "constant top", "noise top", "text top", "null top",
      "render top", "lookup top", "displace", "threshold",
      "resolution top", "mono", "rgb key", "hsv",
    ],
  },
  {
    family: "CHOP",
    specificity: 10,
    aliases: [
      "CHOP", "audio", "sound", "signal", "channel",
      "waveform", "lfo", "oscillator", "frequency", "spectrum",
      "fft", "filter", "mixer", "volume", "mic",
      "microphone", "music", "beat", "audio reactive",
      "sound reactive", "audio analysis", "envelope",
      "audio device", "audio file", "wav", "mp3",
      "lag", "slew", "dc offset", "osc", "count",
      "timer", "speed chop", "merge chop", "math chop",
      "noise chop", "constant chop", "null chop",
      "chop to top", "chop to pop",
    ],
  },
  {
    family: "SOP",
    specificity: 10,
    aliases: [
      "SOP", "geometry", "mesh", "surface", "curve",
      "3d model", "polygon", "vertex", "shape",
      "sphere sop", "box sop", "grid sop", "tube sop",
      "torus sop", "circle sop", "text sop", "transform sop",
      "noise sop", "deform", "extrude", "subdivide",
      "boolean sop", "merge sop", "null sop",
      "sop to pop", "line sop", "point sop",
    ],
  },
  {
    family: "DAT",
    specificity: 10,
    aliases: [
      "DAT", "table", "text dat", "script", "python dat",
      "execute dat", "csv", "spreadsheet", "data table",
      "data grid", "rows columns", "database", "select dat",
      "merge dat", "null dat", "callback", "event script",
      "frame script", "web dat", "json dat", "xml dat",
    ],
  },
  {
    family: "POP",
    specificity: 10,
    aliases: [
      "POP", "particle", "particles", "simulation", "pop sim",
      "pop solver", "particle system", "point simulation",
      "emitter", "birth", "force pop", "noise pop",
      "trail pop", "render pop", "glsl pop", "compute pop",
      "gpu particles", "feedback pop", "sphere pop", "grid pop",
      "sprinkle", "copy pop", "field pop", "attribute pop",
      "sort pop", "select pop", "merge pop", "null pop",
      "boids", "flocking", "neighbor pop", "curl noise pop",
      "color pop", "sprite pop", "drag pop", "turbulence pop",
      "chop to pop", "sop to pop", "top to pop",
    ],
  },
  {
    family: "COMP",
    specificity: 10,
    aliases: [
      "COMP", "container", "component", "sub network",
      "panel", "camera comp", "light comp", "geometry comp",
      "base comp", "3d scene", "layout", "control panel",
      "ui panel", "widget", "dashboard",
    ],
  },
  {
    family: "MAT",
    specificity: 10,
    aliases: [
      "MAT", "material", "shader", "phong", "pbr",
      "constant material", "glsl mat", "lighting material",
      "surface shader", "physically based", "roughness",
      "metalness", "specular", "diffuse", "emissive",
    ],
  },
];

// ─── Utility Functions ──────────────────────────────────────────────────────

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsAlias(normalized: string, alias: string): boolean {
  const pattern = `\\b${escapeRegExp(alias.toLowerCase())}\\b`;
  return new RegExp(pattern, "i").test(normalized);
}

function wordCount(normalizedPrompt: string, word: string): number {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`\\b${escaped}\\b`, "gi");
  const matches = normalizedPrompt.match(regex);
  return matches ? matches.length : 0;
}

// ─── resolveSemanticTerms (bilingual, concept-level) ────────────────────────

export function resolveSemanticTerms(input: string): SemanticResolution {
  const normalized = input.toLowerCase().trim();

  const conceptMatches = CONCEPTS.filter((item) =>
    item.aliases.some((alias) => containsAlias(normalized, alias))
  );

  const familyHints = FAMILY_HINTS.filter((item) =>
    item.aliases.some((alias) => containsAlias(normalized, alias))
  ).map((item) => item.family) as SemanticResolution["familyHints"];

  const parameterHints = PARAMETER_ALIASES.filter((item) =>
    containsAlias(normalized, item.requested)
  );

  const attributeHints = ATTRIBUTE_ALIASES.filter((item) =>
    containsAlias(normalized, item.requested)
  );

  const operatorHints = OPERATOR_HINTS.filter((item) =>
    containsAlias(normalized, item.requested)
  );

  return SemanticResolutionSchema.parse({
    original: input,
    normalized,
    conceptMatches,
    familyHints,
    parameterHints,
    attributeHints,
    operatorHints,
  });
}

// ─── TYPE_SYNONYMS Resolution Functions ─────────────────────────────────────

/**
 * Normalize a prompt for matching.
 */
function normalizePrompt(prompt: string): string {
  return prompt
    .toLowerCase()
    .replace(/[.,!?;:"'()[\]{}\\/\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Resolve a natural-language phrase to the best-matching TD operator type.
 * Multi-word synonyms get a bonus so "green screen" beats a lone "green".
 */
export function resolveOperatorType(prompt: string): string {
  const norm = normalizePrompt(prompt);
  if (!norm) return "";

  const scores: Array<{ opType: string; score: number }> = [];

  for (const [opType, aliases] of Object.entries(TYPE_SYNONYMS)) {
    let score = 0;
    for (const alias of aliases) {
      const aliasNorm = alias.toLowerCase();
      const hits = wordCount(norm, aliasNorm);
      if (hits > 0) {
        const wordBonus = aliasNorm.includes(" ") ? 3 : 1;
        score += hits * wordBonus;
      }
    }
    if (score > 0) {
      scores.push({ opType, score });
    }
  }

  scores.sort((a, b) => b.score - a.score);
  return scores.length > 0 ? scores[0].opType : "";
}

/**
 * Resolve ALL matching operator types from a prompt, ranked by score.
 */
export function resolveAllOperatorTypes(
  prompt: string,
  topN: number = 5,
): Array<{ opType: string; score: number }> {
  const norm = normalizePrompt(prompt);
  if (!norm) return [];

  const scores: Array<{ opType: string; score: number }> = [];

  for (const [opType, aliases] of Object.entries(TYPE_SYNONYMS)) {
    let score = 0;
    for (const alias of aliases) {
      const aliasNorm = alias.toLowerCase();
      const hits = wordCount(norm, aliasNorm);
      if (hits > 0) {
        const wordBonus = aliasNorm.includes(" ") ? 3 : 1;
        score += hits * wordBonus;
      }
    }
    if (score > 0) {
      scores.push({ opType, score });
    }
  }

  scores.sort((a, b) => b.score - a.score);
  return scores.slice(0, Math.max(1, topN));
}

/**
 * Infer the most likely TD operator family from a prompt.
 */
export function getBestFamily(prompt: string): string {
  const norm = normalizePrompt(prompt);
  if (!norm) return "unknown";

  const scores: Array<{ family: string; score: number; specificity: number }> = [];

  for (const hint of FAMILY_HINTS) {
    let score = 0;
    for (const alias of hint.aliases) {
      const aliasNorm = alias.toLowerCase();
      const hits = wordCount(norm, aliasNorm);
      if (hits > 0) {
        const wordBonus = aliasNorm.includes(" ") ? 3 : 1;
        score += hits * wordBonus;
      }
    }
    if (score > 0) {
      scores.push({ family: hint.family, score, specificity: hint.specificity });
    }
  }

  if (scores.length === 0) return "unknown";

  scores.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.specificity - a.specificity;
  });

  return scores[0].family;
}

/**
 * Get all matching families ranked by confidence.
 */
export function getAllFamilies(
  prompt: string,
): Array<{ family: string; score: number; specificity: number }> {
  const norm = normalizePrompt(prompt);
  if (!norm) return [];

  const scores: Array<{ family: string; score: number; specificity: number }> = [];

  for (const hint of FAMILY_HINTS) {
    let score = 0;
    for (const alias of hint.aliases) {
      const aliasNorm = alias.toLowerCase();
      const hits = wordCount(norm, aliasNorm);
      if (hits > 0) {
        const wordBonus = aliasNorm.includes(" ") ? 3 : 1;
        score += hits * wordBonus;
      }
    }
    if (score > 0) {
      scores.push({ family: hint.family, score, specificity: hint.specificity });
    }
  }

  scores.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.specificity - a.specificity;
  });

  return scores;
}

// NOTE: resolvePrompt() and PromptResolution live in networkTemplates.ts
// to avoid circular dependency (it needs the NetworkTemplate type).
