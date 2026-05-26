import { z } from "zod";
export const SemanticResolutionSchema = z.object({
    original: z.string(),
    normalized: z.string(),
    conceptMatches: z.array(z.object({
        concept: z.string(),
        canonical: z.string(),
        aliases: z.array(z.string()),
        note: z.string().optional(),
    })),
    familyHints: z.array(z.enum(["POP", "TOP", "CHOP", "SOP", "DAT"])),
    parameterHints: z.array(z.object({
        requested: z.string(),
        canonical: z.string(),
        note: z.string().optional(),
    })),
    attributeHints: z.array(z.object({
        requested: z.string(),
        canonical: z.string(),
        note: z.string().optional(),
    })),
    operatorHints: z.array(z.object({
        requested: z.string(),
        canonical: z.string(),
        family: z.string().optional(),
        note: z.string().optional(),
    })),
});
const CONCEPTS = [
    {
        concept: "feedback loop",
        canonical: "particlesupdatepop",
        aliases: ["feedback", "feedback loop", "update loop", "solver loop", "loop de particulas"],
        note: "En sistemas POP de particulas suele resolverse al parametro que apunta al final del solver.",
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
        aliases: ["point scale", "point size", "size", "tamano", "escala de punto"],
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
];
const FAMILY_HINTS = [
    { family: "POP", aliases: ["pop", "particles", "particle system", "field", "sprinkle", "copy pop"] },
    { family: "TOP", aliases: ["top", "texture", "image", "video", "post fx", "blur", "feedback top"] },
    { family: "CHOP", aliases: ["chop", "audio", "lfo", "signal", "channel"] },
    { family: "SOP", aliases: ["sop", "geometry", "mesh", "curve", "surface"] },
    { family: "DAT", aliases: ["dat", "table", "text", "script", "python dat"] },
];
const PARAMETER_ALIASES = [
    { requested: "life", canonical: "lifeexpect / PartLife", note: "Depende del operador; en POPs puede mapear a vida esperada o atributo PartLife." },
    { requested: "size", canonical: "pointscale", note: "Alias tipico en POPs y point pipelines." },
    { requested: "feedback target", canonical: "particlesupdatepop", note: "Parametro del solver de particulas POP." },
    { requested: "radius", canonical: "radx/rady/radz o radius", note: "Varia entre operadores y versiones." },
    { requested: "res", canonical: "resolution", note: "Comun en TOPs." },
];
const ATTRIBUTE_ALIASES = [
    { requested: "p", canonical: "P / _P", note: "Posicion." },
    { requested: "n", canonical: "N / _N", note: "Normal." },
    { requested: "cd", canonical: "Color", note: "Color por punto." },
    { requested: "scale", canonical: "pointscale", note: "Escala de punto." },
];
const OPERATOR_HINTS = [
    { requested: "top to pop", canonical: "TOP to POP", family: "POP" },
    { requested: "copy", canonical: "Copy POP / Copy SOP", family: "POP/SOP" },
    { requested: "field", canonical: "Field POP", family: "POP" },
    { requested: "particle", canonical: "Particle POP", family: "POP" },
    { requested: "particles", canonical: "Particle POP", family: "POP" },
    { requested: "particulas", canonical: "Particle POP", family: "POP" },
    { requested: "noise", canonical: "Noise TOP / Noise CHOP / Noise POP", family: "TOP/CHOP/POP" },
    { requested: "limit", canonical: "Limit POP / Limit CHOP", family: "POP/CHOP" },
    { requested: "null", canonical: "Null CHOP / Null TOP / Null DAT / Null SOP / Null POP", family: "multi" },
];
function escapeRegExp(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function containsAlias(normalized, alias) {
    const pattern = `\\b${escapeRegExp(alias.toLowerCase())}\\b`;
    return new RegExp(pattern, "i").test(normalized);
}
export function resolveSemanticTerms(input) {
    const normalized = input.toLowerCase().trim();
    const conceptMatches = CONCEPTS.filter((item) => item.aliases.some((alias) => containsAlias(normalized, alias)));
    const familyHints = FAMILY_HINTS.filter((item) => item.aliases.some((alias) => containsAlias(normalized, alias))).map((item) => item.family);
    const parameterHints = PARAMETER_ALIASES.filter((item) => containsAlias(normalized, item.requested));
    const attributeHints = ATTRIBUTE_ALIASES.filter((item) => containsAlias(normalized, item.requested));
    const operatorHints = OPERATOR_HINTS.filter((item) => containsAlias(normalized, item.requested));
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
