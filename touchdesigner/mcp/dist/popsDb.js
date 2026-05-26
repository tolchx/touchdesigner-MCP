import fs from "node:fs/promises";
import { z } from "zod";
const PopsOperatorIndexItemSchema = z.object({
    pageTitle: z.string(),
    pageSlug: z.string(),
    url: z.string().url(),
    experimental: z.boolean().default(false),
    tdOpTypeGuess: z.string().optional(),
    summary: z.string().optional(),
});
export const PopsIndexSchema = z.object({
    generatedAt: z.string(),
    source: z.object({
        categoryUrl: z.string().url(),
    }),
    operators: z.array(PopsOperatorIndexItemSchema),
});
export const PopsOperatorDocSchema = z.object({
    pageTitle: z.string(),
    pageSlug: z.string(),
    url: z.string().url(),
    experimental: z.boolean().default(false),
    tdOpTypeGuess: z.string().optional(),
    summary: z.string().optional(),
    inputs: z
        .array(z.object({
        index: z.number().int().nonnegative(),
        description: z.string().optional(),
    }))
        .default([]),
    parameters: z
        .array(z.object({
        page: z.string().optional(),
        label: z.string(),
        name: z.string().optional(),
        description: z.string().optional(),
    }))
        .default([]),
    attributes: z
        .array(z.object({
        name: z.string(),
        type: z.string().optional(),
        description: z.string().optional(),
    }))
        .default([]),
    localNotes: z
        .array(z.object({
        source: z.string(),
        excerpt: z.string(),
    }))
        .default([]),
    useCases: z.array(z.string()).default([]),
    examples: z
        .array(z.object({
        title: z.string(),
        description: z.string().optional(),
        steps: z.array(z.string()).default([]),
    }))
        .default([]),
    commonCombinations: z
        .array(z.object({
        with: z.array(z.string()),
        why: z.string().optional(),
    }))
        .default([]),
    troubleshooting: z
        .array(z.object({
        problem: z.string(),
        cause: z.string().optional(),
        fix: z.string().optional(),
    }))
        .default([]),
});
function dataRootFromHere() {
    return new URL("../data/pops/", import.meta.url);
}
export async function loadPopsIndex() {
    const indexUrl = new URL("./index.json", dataRootFromHere());
    const raw = await fs.readFile(indexUrl, "utf8");
    return PopsIndexSchema.parse(JSON.parse(raw));
}
export async function loadPopsOperatorDoc(pageSlug) {
    const safe = pageSlug.replaceAll("..", "").replaceAll("\\", "/");
    const docUrl = new URL(`./operators/${safe}.json`, dataRootFromHere());
    const raw = await fs.readFile(docUrl, "utf8");
    return PopsOperatorDocSchema.parse(JSON.parse(raw));
}
export async function queryPops(options) {
    const limit = Math.max(1, Math.min(50, options.limit ?? 10));
    if (options.pageSlug) {
        const operator = await loadPopsOperatorDoc(options.pageSlug);
        return { kind: "operator", operator };
    }
    const index = await loadPopsIndex();
    const q = (options.search ?? "").trim().toLowerCase();
    if (!q) {
        return {
            kind: "search",
            results: index.operators.slice(0, limit),
            total: index.operators.length,
        };
    }
    const scored = index.operators
        .map((op) => {
        const hay = `${op.pageTitle} ${op.pageSlug} ${op.tdOpTypeGuess ?? ""} ${op.summary ?? ""}`
            .toLowerCase()
            .trim();
        const idx = hay.indexOf(q);
        const score = idx === -1 ? -1 : 1000 - idx;
        return { op, score };
    })
        .filter((x) => x.score >= 0)
        .sort((a, b) => b.score - a.score)
        .map((x) => x.op);
    return { kind: "search", results: scored.slice(0, limit), total: scored.length };
}
