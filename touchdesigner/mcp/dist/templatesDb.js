import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
function repoRootFromHere() {
    return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
}
async function walkMarkdown(root, acc = []) {
    const entries = await fs.readdir(root, { withFileTypes: true });
    for (const entry of entries) {
        const full = path.join(root, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === "Analisis_Maestro")
                continue;
            await walkMarkdown(full, acc);
        }
        else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
            acc.push(full);
        }
    }
    return acc;
}
function buildExcerpt(text, idx, length = 260) {
    const start = Math.max(0, idx - 120);
    const end = Math.min(text.length, idx + length);
    return text.slice(start, end).replace(/\s+/g, " ").trim();
}
export async function queryTemplates(options) {
    const limit = Math.max(1, Math.min(50, options.limit ?? 10));
    const repoRoot = repoRootFromHere();
    const toeExpand = path.join(repoRoot, "Toe_Expand");
    const files = await walkMarkdown(toeExpand);
    const q = options.search.toLowerCase().trim();
    const results = [];
    for (const file of files) {
        if (options.project && !file.toLowerCase().includes(options.project.toLowerCase()))
            continue;
        const text = await fs.readFile(file, "utf8");
        const hay = text.toLowerCase();
        const idx = hay.indexOf(q);
        if (idx === -1)
            continue;
        const rel = path.relative(toeExpand, file).split(path.sep);
        const project = rel[0] ?? "unknown";
        results.push({
            project,
            file: path.basename(file),
            fullPath: file,
            score: 1000 - idx,
            excerpt: buildExcerpt(text, idx),
        });
    }
    results.sort((a, b) => b.score - a.score);
    return {
        kind: "template_search",
        query: options.search,
        total: results.length,
        results: results.slice(0, limit),
    };
}
