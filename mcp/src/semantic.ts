/**
 * Semantic Resolution Engine
 *
 * Maps natural language prompts (in Spanish and English) to canonical
 * TouchDesigner operators, parameters, attributes, and family hints.
 */
import { z } from "zod";

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

// ─── Knowledge Base ─────────────────────────────────────────────────────────

interface Concept {
  concept: string;
  canonical: string;
  aliases: string[];
  note?: string;
}

interface FamilyHint {
  family: string;
  aliases: string[];
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
    aliases: [
      "point scale",
      "point size",
      "size",
      "tamaño",
      "escala de punto",
    ],
  },
  {
    concept: "rotation vector",
    canonical: "Rot",
    aliases: [
      "rotation",
      "rot",
      "direccion",
      "direction",
      "orientacion",
      "orientation",
    ],
  },
  {
    concept: "point color",
    canonical: "Color",
    aliases: ["color", "cd", "colour"],
  },
  // ─── Enhanced concepts from vault Obsidian ────────────────────────────────
  {
    concept: "curl noise",
    canonical: "CurlNoise",
    aliases: [
      "curl noise",
      "curl",
      "divergence-free",
      "fluido",
      "fluid",
      "turbulencia",
    ],
    note: "Ruido libre de divergencia para simulación de fluidos en Noise POP (modo curl).",
  },
  {
    concept: "boids / flocking",
    canonical: "Boids",
    aliases: [
      "boids",
      "flocking",
      "separation",
      "alignment",
      "cohesion",
      "bandada",
    ],
    note: "Algoritmo de flocking: separation + alignment + cohesion. Implementar con Neighbor POP + Math POP.",
  },
  {
    concept: "SPH fluid",
    canonical: "SPH",
    aliases: [
      "sph",
      "fluid",
      "fluido",
      "smoothed particle hydrodynamics",
      "hidrodinámica",
    ],
    note: "Simulación de fluidos con Smoothed Particle Hydrodynamics vía GLSL POP compute.",
  },
  {
    concept: "instancing",
    canonical: "Instancing",
    aliases: [
      "instancing",
      "instance",
      "instancia",
      "copias",
      "copy sop",
      "geometry comp",
      "copy pop",
    ],
    note: "Instanciado de geometría usando geometryCOMP + copySOP o Copy POP para instanciado GPU.",
  },
  {
    concept: "audio reactive",
    canonical: "AudioReactive",
    aliases: [
      "audio reactive",
      "audio reactivo",
      "sound reactive",
      "music reactive",
      "sonido",
      "audio reactivo",
    ],
    note: "Sistemas reactivos al audio usando audioAnalysisCHOP o audioCHOP con CHOP to POP bridge.",
  },
  {
    concept: "dmx lighting",
    canonical: "DMX",
    aliases: [
      "dmx",
      "lighting",
      "iluminación",
      "art-net",
      "artnet",
      "sacn",
      "sACN",
      "dmx fixture",
    ],
    note: "Control de iluminación DMX mediante DMX Out CHOP / DMX Fixture POP / DMX Out POP.",
  },
  {
    concept: "trail / motion blur",
    canonical: "Trail",
    aliases: [
      "trail",
      "trails",
      "motion blur",
      "estela",
      "rastro",
      "persistencia",
      "trail pop",
    ],
  },
  {
    concept: "cache / playback",
    canonical: "Cache",
    aliases: [
      "cache",
      "caching",
      "playback",
      "reproducción",
      "buffer",
      "cache pop",
      "cache select pop",
    ],
  },
  {
    concept: "neighbor detection",
    canonical: "Neighbor",
    aliases: [
      "neighbor",
      "neighbour",
      "vecino",
      "proximity",
      "cerca",
      "interaction",
      "neighbor pop",
    ],
    note: "Detección de puntos vecinos para interacciones POP mediante Neighbor POP.",
  },
  {
    concept: "atomic operations",
    canonical: "Atomic",
    aliases: [
      "atomic",
      "collision",
      "colisión",
      "buffer atomico",
      "ssbo",
      "glsl atomic",
    ],
    note: "Operaciones atómicas en GLSL POP para colisiones y buffers compartidos.",
  },
  // ─── Vault concepts: Partículas ────────────────────────────────────────────
  {
    concept: "particle lifecycle",
    canonical: "ParticleLifecycle",
    aliases: [
      "particle lifecycle",
      "lifecycle",
      "normalized age",
      "normalizedage",
      "age",
      "life curve",
      "lookup curve",
    ],
    note: "Control avanzado del ciclo de vida con normalizedAge (Age/Life) + Curve POP + Lookup POP.",
  },
  {
    concept: "pre-roll particles",
    canonical: "PreRoll",
    aliases: [
      "pre-roll",
      "preroll",
      "pre roll",
      "initial simulation",
      "simulación inicial",
      "steady state",
    ],
    note: "Pre-Roll en Particle POP para simular frames antes del inicio y alcanzar estado estable.",
  },
  {
    concept: "particle emission",
    canonical: "ParticleEmission",
    aliases: [
      "emission",
      "emisión",
      "birth rate",
      "tasa de nacimiento",
      "rate",
      "emit",
    ],
    note: "Control de emisión en Particle POP: Rate (velocidad) + Life (vida máxima).",
  },
  // ─── Vault concepts: Field POP ─────────────────────────────────────────────
  {
    concept: "field weight",
    canonical: "FieldWeight",
    aliases: [
      "field weight",
      "weight",
      "peso",
      "influencia",
      "field influence",
      "dist",
      "distance to center",
    ],
    note: "Field POP calcula Weight (0 fuera, 1 dentro) y Dist (distancia al centro del campo).",
  },
  {
    concept: "field shape",
    canonical: "FieldShape",
    aliases: [
      "field shape",
      "forma de campo",
      "sphere field",
      "box field",
      "tube field",
      "capsule field",
    ],
    note: "Geometrías disponibles en Field POP: Sphere, Box, Tube, Capsule.",
  },
  // ─── Vault concepts: Copy POP ──────────────────────────────────────────────
  {
    concept: "copy pop instancing",
    canonical: "CopyPopInstancing",
    aliases: [
      "copy pop",
      "copy pop instancing",
      "multiplicar geometría",
      "multiply geometry",
      "standalone mode",
      "template mode",
    ],
    note: "Copy POP: modo Standalone (parámetros acumulativos) o modo Template (segundo input define posiciones).",
  },
  // ─── Vault concepts: Target POP ────────────────────────────────────────────
  {
    concept: "target pop / feedback loop",
    canonical: "TargetPop",
    aliases: [
      "target pop",
      "target",
      "feedback target",
      "particlesupdatepop",
      "previous frame",
      "frame anterior",
      "null pop as target",
    ],
    note: "Target POP almacena el frame anterior para Particle POP y Feedback POP. Mejor práctica: usar Null POP como target.",
  },
  // ─── Vault concepts: Lookup Texture ────────────────────────────────────────
  {
    concept: "lookup texture",
    canonical: "LookupTexture",
    aliases: [
      "lookup texture",
      "lookup texture pop",
      "uv sampling",
      "muestreo uv",
      "texture lookup",
      "color from texture",
    ],
    note: "Lookup Texture POP samples color desde un TOP y lo asigna a puntos por UV.",
  },
  // ─── Vault concepts: GPU Compute pipeline ──────────────────────────────────
  {
    concept: "gpu compute pipeline",
    canonical: "GPUCompute",
    aliases: [
      "gpu compute",
      "compute shader",
      "glsl compute",
      "cuda",
      "gpu particles",
      "gpu simulation",
    ],
    note: "Pipeline GPU-nativo: mantener operaciones dentro del dominio POP para evitar bottleneck CPU/GPU.",
  },
];

const FAMILY_HINTS: FamilyHint[] = [
  {
    family: "POP",
    aliases: [
      "pop",
      "particles",
      "particle system",
      "field",
      "sprinkle",
      "copy pop",
    ],
  },
  {
    family: "TOP",
    aliases: [
      "top",
      "texture",
      "image",
      "video",
      "post fx",
      "blur",
      "feedback top",
    ],
  },
  {
    family: "CHOP",
    aliases: [
      "chop",
      "audio",
      "lfo",
      "signal",
      "channel",
      "analisis",
    ],
  },
  {
    family: "SOP",
    aliases: [
      "sop",
      "geometry",
      "mesh",
      "curve",
      "surface",
      "malla",
    ],
  },
  {
    family: "DAT",
    aliases: [
      "dat",
      "table",
      "text",
      "script",
      "python dat",
      "ejecutar",
    ],
  },
];

const PARAMETER_ALIASES: ParameterAlias[] = [
  {
    requested: "life",
    canonical: "lifeexpect / PartLife",
    note: "Depende del operador; en POPs puede mapear a vida esperada o atributo PartLife.",
  },
  {
    requested: "size",
    canonical: "pointscale",
    note: "Alias típico en POPs y point pipelines.",
  },
  {
    requested: "feedback target",
    canonical: "particlesupdatepop",
    note: "Parámetro del solver de partículas POP.",
  },
  {
    requested: "radius",
    canonical: "radx/rady/radz o radius",
    note: "Varía entre operadores y versiones.",
  },
  {
    requested: "res",
    canonical: "resolution",
    note: "Común en TOPs.",
  },
  {
    requested: "birth rate",
    canonical: "birthrate",
    note: "Tasa de nacimiento en Particle POP.",
  },
  {
    requested: "drag",
    canonical: "drag",
    note: "Amortiguación/aire en forces.",
  },
  {
    requested: "amplitude",
    canonical: "amplitude",
    note: "Amplitud de ruido/ondas.",
  },
  {
    requested: "frequency",
    canonical: "frequency",
    note: "Frecuencia de ruido/ondas.",
  },
  {
    requested: "pre-roll",
    canonical: "preroll",
    note: "Simular frames antes del inicio (Particle POP).",
  },
  {
    requested: "damping",
    canonical: "drag",
    note: "Amortiguación en Particle POP. Sinónimo: drag.",
  },
  {
    requested: "normalized age",
    canonical: "normalizedAge",
    note: "Edad normalizada (Age/Life) para lookup curves.",
  },
  {
    requested: "weight",
    canonical: "Weight",
    note: "Peso/influencia en Field POP (0-1).",
  },
  {
    requested: "dist",
    canonical: "Dist",
    note: "Distancia al centro del campo (Field POP).",
  },
  {
    requested: "wrap",
    canonical: "wrap",
    note: "Modo wrap para Lookup Texture POP.",
  },
  {
    requested: "filter",
    canonical: "filter",
    note: "Filtro de muestreo (Lookup Texture POP / TOPs).",
  },
  {
    requested: "partforce",
    canonical: "PartForce",
    note: "Fuerza acumulativa en Particle POP.",
  },
  {
    requested: "partvel",
    canonical: "PartVel",
    note: "Velocidad de partícula en Particle POP.",
  },
  {
    requested: "partlife",
    canonical: "PartLife",
    note: "Vida de partícula en Particle POP.",
  },
  {
    requested: "lifespan",
    canonical: "lifeexpect",
    note: "Expectativa de vida en Particle POP.",
  },
  {
    requested: "falloff",
    canonical: "falloff",
    note: "Decaimiento en campos y forces.",
  },
];

const ATTRIBUTE_ALIASES: AttributeAlias[] = [
  { requested: "p", canonical: "P / _P", note: "Posición." },
  { requested: "n", canonical: "N / _N", note: "Normal." },
  { requested: "cd", canonical: "Color", note: "Color por punto." },
  { requested: "scale", canonical: "pointscale", note: "Escala de punto." },
  { requested: "vel", canonical: "v / _V", note: "Velocidad." },
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
  { requested: "vel", canonical: "v / _V / PartVel", note: "Velocidad." },
];

const OPERATOR_HINTS: OperatorHint[] = [
  {
    requested: "top to pop",
    canonical: "TOP to POP",
    family: "POP",
  },
  {
    requested: "copy",
    canonical: "Copy POP / Copy SOP",
    family: "POP/SOP",
  },
  {
    requested: "field",
    canonical: "Field POP",
    family: "POP",
  },
  {
    requested: "particle",
    canonical: "Particle POP",
    family: "POP",
  },
  {
    requested: "particles",
    canonical: "Particle POP",
    family: "POP",
  },
  {
    requested: "particulas",
    canonical: "Particle POP",
    family: "POP",
  },
  {
    requested: "noise",
    canonical: "Noise TOP / Noise CHOP / Noise POP",
    family: "TOP/CHOP/POP",
  },
  {
    requested: "limit",
    canonical: "Limit POP / Limit CHOP",
    family: "POP/CHOP",
  },
  {
    requested: "null",
    canonical: "Null CHOP / Null TOP / Null DAT / Null SOP / Null POP",
    family: "multi",
  },
  // ─── Enhanced hints ───────────────────────────────────────────────────────
  {
    requested: "glsl",
    canonical: "GLSL TOP / GLSL POP / GLSL MAT",
    family: "TOP/POP/MAT",
  },
  {
    requested: "feedback top",
    canonical: "Feedback TOP",
    family: "TOP",
  },
  {
    requested: "feedback pop",
    canonical: "Feedback POP",
    family: "POP",
  },
  {
    requested: "sphere pop",
    canonical: "Sphere POP",
    family: "POP",
  },
  {
    requested: "grid pop",
    canonical: "Grid POP",
    family: "POP",
  },
  {
    requested: "point generator",
    canonical: "Point Generator POP",
    family: "POP",
  },
  {
    requested: "point generator pop",
    canonical: "Point Generator POP",
    family: "POP",
  },
  {
    requested: "render top",
    canonical: "Render TOP / Render Simple TOP",
    family: "TOP",
  },
  {
    requested: "geometry comp",
    canonical: "Geometry COMP",
    family: "COMP",
  },
  {
    requested: "sop to pop",
    canonical: "SOP to POP",
    family: "POP",
  },
  {
    requested: "chop to pop",
    canonical: "CHOP to POP",
    family: "POP",
  },
  {
    requested: "audio chop",
    canonical: "Audio CHOP / Audio Analysis CHOP",
    family: "CHOP",
  },
  {
    requested: "particle pop",
    canonical: "Particle POP",
    family: "POP",
  },
  {
    requested: "field pop",
    canonical: "Field POP",
    family: "POP",
  },
  {
    requested: "copy pop",
    canonical: "Copy POP",
    family: "POP",
  },
  {
    requested: "limit pop",
    canonical: "Limit POP",
    family: "POP",
  },
  {
    requested: "random pop",
    canonical: "Random POP",
    family: "POP",
  },
  {
    requested: "trail pop",
    canonical: "Trail POP",
    family: "POP",
  },
  {
    requested: "transform pop",
    canonical: "Transform POP",
    family: "POP",
  },
  {
    requested: "math pop",
    canonical: "Math POP",
    family: "POP",
  },
  {
    requested: "attribute pop",
    canonical: "Attribute POP",
    family: "POP",
  },
  {
    requested: "noise pop",
    canonical: "Noise POP",
    family: "POP",
  },
  {
    requested: "sprinkle pop",
    canonical: "Sprinkle POP",
    family: "POP",
  },
  {
    requested: "delete pop",
    canonical: "Delete POP",
    family: "POP",
  },
  {
    requested: "dmx out pop",
    canonical: "DMX Out POP",
    family: "POP",
  },
  {
    requested: "dmx fixture pop",
    canonical: "DMX Fixture POP",
    family: "POP",
  },
  {
    requested: "glsl pop",
    canonical: "GLSL POP / GLSL Create POP / GLSL Copy POP / GLSL Select POP / GLSL Advanced POP",
    family: "POP",
  },
  {
    requested: "sop to pop",
    canonical: "SOP to POP",
    family: "POP",
  },
  {
    requested: "top to pop",
    canonical: "TOP to POP",
    family: "POP",
  },
  {
    requested: "chop to pop",
    canonical: "CHOP to POP",
    family: "POP",
  },
  // ─── Confirmed POP operators (42 types from probe) ───────────────────────
  {
    requested: "null pop",
    canonical: "Null POP",
    family: "POP",
  },
  {
    requested: "sprinkle pop",
    canonical: "Sprinkle POP",
    family: "POP",
  },
  {
    requested: "grid pop",
    canonical: "Grid POP",
    family: "POP",
  },
  {
    requested: "sphere pop",
    canonical: "Sphere POP",
    family: "POP",
  },
  {
    requested: "attribute pop",
    canonical: "Attribute POP",
    family: "POP",
  },
  {
    requested: "transform pop",
    canonical: "Transform POP",
    family: "POP",
  },
  {
    requested: "trail pop",
    canonical: "Trail POP",
    family: "POP",
  },
  {
    requested: "field pop",
    canonical: "Field POP",
    family: "POP",
  },
  {
    requested: "limit pop",
    canonical: "Limit POP",
    family: "POP",
  },
  {
    requested: "math pop",
    canonical: "Math POP",
    family: "POP",
  },
  {
    requested: "sort pop",
    canonical: "Sort POP",
    family: "POP",
  },
  {
    requested: "switch pop",
    canonical: "Switch POP",
    family: "POP",
  },
  {
    requested: "select pop",
    canonical: "Select POP",
    family: "POP",
  },
  {
    requested: "merge pop",
    canonical: "Merge POP",
    family: "POP",
  },
  {
    requested: "switch pop",
    canonical: "Switch POP",
    family: "POP",
  },
  {
    requested: "neighbor pop",
    canonical: "Neighbor POP",
    family: "POP",
  },
  {
    requested: "box pop",
    canonical: "Box POP",
    family: "POP",
  },
  {
    requested: "circle pop",
    canonical: "Circle POP",
    family: "POP",
  },
  {
    requested: "tube pop",
    canonical: "Tube POP",
    family: "POP",
  },
  {
    requested: "torus pop",
    canonical: "Torus POP",
    family: "POP",
  },
  {
    requested: "point pop",
    canonical: "Point POP",
    family: "POP",
  },
  {
    requested: "line pop",
    canonical: "Line POP",
    family: "POP",
  },
];

// ─── Utils ──────────────────────────────────────────────────────────────────

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsAlias(normalized: string, alias: string): boolean {
  const pattern = `\\b${escapeRegExp(alias.toLowerCase())}\\b`;
  return new RegExp(pattern, "i").test(normalized);
}

// ─── Public API ─────────────────────────────────────────────────────────────

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
