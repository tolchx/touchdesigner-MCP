#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { createLlmClientFromEnv } from "./llm.js";
import { OpsIndexSchema, OpsOperatorDocSchema, TdFamilySchema } from "./opsDb.js";
function nowIso() {
    return new Date().toISOString();
}
function getArgValue(args, name) {
    const idx = args.indexOf(name);
    if (idx === -1)
        return null;
    return args[idx + 1] ?? null;
}
function hasFlag(args, name) {
    return args.includes(name);
}
async function fetchText(url) {
    const resp = await fetch(url, {
        headers: {
            "user-agent": "touchdesigner-mcp-opsdb/0.1",
            accept: "text/html,application/xhtml+xml",
        },
    });
    if (!resp.ok)
        throw new Error(`HTTP ${resp.status} ${resp.statusText} for ${url}`);
    return await resp.text();
}
async function tryReadLocalDocs(dirPath) {
    try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        const files = entries
            .filter((e) => e.isFile())
            .map((e) => e.name)
            .filter((name) => {
            const lower = name.toLowerCase();
            return lower.endsWith(".txt") || lower.endsWith(".md") || lower.endsWith(".markdown");
        });
        const docs = [];
        for (const name of files) {
            const full = path.join(dirPath, name);
            const text = await fs.readFile(full, "utf8");
            docs.push({ source: name, text });
        }
        return docs;
    }
    catch {
        return [];
    }
}
function extractLocalSnippets(options) {
    const snippets = [];
    const keys = options.keywords.map((k) => k.toLowerCase()).filter(Boolean);
    for (const doc of options.docs) {
        const hay = doc.text;
        const lower = hay.toLowerCase();
        for (const key of keys) {
            const idx = lower.indexOf(key);
            if (idx === -1)
                continue;
            const start = Math.max(0, idx - options.contextChars);
            const end = Math.min(hay.length, idx + key.length + options.contextChars);
            const excerpt = hay
                .slice(start, end)
                .replace(/\s+/g, " ")
                .trim();
            if (excerpt.length < 40)
                continue;
            snippets.push({ source: doc.source, excerpt });
            if (snippets.length >= options.maxSnippets)
                return snippets;
        }
    }
    return snippets;
}
function stripHtml(html) {
    const withoutScripts = html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ");
    const withBreaks = withoutScripts
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/(p|div|h1|h2|h3|h4|h5|h6|li|tr|table)>/gi, "\n");
    const withoutTags = withBreaks.replace(/<[^>]+>/g, " ");
    return withoutTags
        .replaceAll("&nbsp;", " ")
        .replaceAll("&amp;", "&")
        .replaceAll("&lt;", "<")
        .replaceAll("&gt;", ">")
        .replaceAll("&quot;", '"')
        .replaceAll("&#39;", "'")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}
function unique(items) {
    return Array.from(new Set(items));
}
function parseCategoryOperatorsGeneric(options) {
    const linkRe = /<a\s+[^>]*href="\/([^"#?]+)"[^>]*>([^<]+)<\/a>/gi;
    const ops = [];
    const suffix = ` ${options.family}`;
    const suffixLower = suffix.toLowerCase();
    const slugSuffix = `_${options.family}`;
    for (;;) {
        const m = linkRe.exec(options.html);
        if (!m)
            break;
        const href = m[1] ?? "";
        const text = (m[2] ?? "").trim();
        if (!href.includes(slugSuffix))
            continue;
        if (href.startsWith("index.php"))
            continue;
        if (href.startsWith("Category:"))
            continue;
        if (!text.toLowerCase().includes(suffixLower))
            continue;
        ops.push({ pageSlug: href, pageTitle: text });
    }
    const dedup = new Map();
    for (const op of ops) {
        if (!dedup.has(op.pageSlug))
            dedup.set(op.pageSlug, op);
    }
    return Array.from(dedup.values()).sort((a, b) => a.pageSlug.localeCompare(b.pageSlug));
}
function normalizeTdToken(token, isFirst) {
    if (!token)
        return "";
    const lower = token.toLowerCase();
    if (isFirst)
        return lower;
    if (lower === "to")
        return "to";
    return lower[0].toUpperCase() + lower.slice(1);
}
function guessTdOpType(pageTitle, family) {
    const cleaned = pageTitle.replace(new RegExp(`\\s*${family}$`), "").trim();
    const words = cleaned.split(/\s+/).filter(Boolean);
    if (words.length === 0)
        return undefined;
    const base = words.map((word, index) => normalizeTdToken(word, index === 0)).join("");
    return `${base}${family}`;
}
function extractSection(text, startLabel, stopLabels) {
    const start = text.search(startLabel);
    if (start === -1)
        return null;
    const after = text.slice(start);
    const stopIdxs = stopLabels
        .map((re) => {
        const idx = after.search(re);
        return idx === -1 ? null : idx;
    })
        .filter((x) => x !== null);
    const stop = stopIdxs.length > 0 ? Math.min(...stopIdxs) : after.length;
    return after.slice(0, stop).trim();
}
function parseInputs(text) {
    const stopLabels = [
        /^\s*Info CHOP Channels/m,
        /^\s*Info TOP Channels/m,
        /^\s*Info SOP/m,
        /^\s*Info DAT/m,
        /^\s*TouchDesigner Build/m,
    ];
    const section = extractSection(text, /^\s*Operator Inputs/m, stopLabels);
    if (!section)
        return [];
    const lines = section.split("\n").map((l) => l.trim()).filter(Boolean);
    const inputs = [];
    for (const line of lines) {
        const m = /^Input\s+(\d+):\s*(.*)$/.exec(line);
        if (!m)
            continue;
        inputs.push({ index: parseInt(m[1], 10), description: m[2]?.trim() || undefined });
    }
    return inputs;
}
function parseAttributes(text) {
    const section = extractSection(text, /^\s*Attribute Name/m, [
        /^\s*Parameters\s+-/m,
        /^\s*Parameters -/m,
        /^\s*Operator Inputs/m,
        /^\s*TouchDesigner Build/m,
    ]);
    if (!section)
        return [];
    const lines = section.split("\n").map((l) => l.trim()).filter(Boolean);
    const attrs = [];
    for (let i = 0; i < lines.length; i++) {
        const name = lines[i];
        const type = lines[i + 1];
        const desc = lines[i + 2];
        if (!name || name === "Attribute Name")
            continue;
        if (!type || type === "Type")
            continue;
        if (!desc || desc === "Description")
            continue;
        attrs.push({ name, type, description: desc });
        i += 2;
    }
    return attrs;
}
function parseParameters(text) {
    const params = [];
    const re = /^\s*Parameters\s+-\s+(.+?)\s+Page/mg;
    for (;;) {
        const m = re.exec(text);
        if (!m)
            break;
        const page = m[1]?.trim();
        const start = m.index + m[0].length;
        const rest = text.slice(start);
        const next = rest.search(/^\s*Parameters\s+-\s+/m);
        const section = (next === -1 ? rest : rest.slice(0, next)).trim();
        const lines = section.split("\n").map((l) => l.trim()).filter(Boolean);
        for (const line of lines) {
            const pm = /^(.+?)\s{2,}([a-zA-Z0-9_]+)\s*-\s*(.+)$/.exec(line);
            if (pm) {
                params.push({
                    page,
                    label: pm[1].trim(),
                    name: pm[2].trim(),
                    description: pm[3].trim(),
                });
                continue;
            }
            const pm2 = /^(.+?)\s*-\s*(.+)$/.exec(line);
            if (pm2 && pm2[1].length > 2) {
                params.push({
                    page,
                    label: pm2[1].trim(),
                    description: pm2[2].trim(),
                });
            }
        }
    }
    return params;
}
function parseSummary(text) {
    const section = extractSection(text, /^\s*Summary/m, [
        /^\s*Attributes/m,
        /^\s*Parameters\s+-/m,
        /^\s*Operator Inputs/m,
    ]);
    if (!section)
        return undefined;
    return section
        .replace(/^\s*Summary(\[edit\])?/m, "")
        .trim()
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .slice(0, 30)
        .join("\n");
}
async function enrichWithLlm(input) {
    const llm = createLlmClientFromEnv();
    const schema = z.object({
        useCases: z.array(z.string()).default([]),
        examples: z
            .array(z.object({
            title: z.string(),
            description: z.string().optional(),
            steps: z.array(z.string()).default([]),
        }))
            .default([]),
        commonCombinations: z.array(z.object({ with: z.array(z.string()), why: z.string().optional() })).default([]),
        troubleshooting: z
            .array(z.object({ problem: z.string(), cause: z.string().optional(), fix: z.string().optional() }))
            .default([]),
    });
    const system = [
        "You are an expert TouchDesigner technical writer.",
        "Return ONLY JSON, no markdown.",
        "Do not invent parameters or inputs that are not present in the provided context.",
        "Write in Spanish.",
        "Output schema:",
        JSON.stringify(schema.shape, null, 2),
    ].join("\n");
    const user = [
        `Family: ${input.family}`,
        `Operator: ${input.pageTitle} (${input.pageSlug})`,
        "",
        "Summary:",
        input.summary ?? "",
        "",
        "Inputs:",
        JSON.stringify(input.inputs, null, 2),
        "",
        "Local notes (snippets):",
        JSON.stringify(input.localNotes, null, 2),
        "",
        "Parameters (sample):",
        JSON.stringify(input.parameters.slice(0, 80), null, 2),
    ].join("\n");
    const resp = await llm.generateText({ system, user });
    const firstBrace = resp.text.indexOf("{");
    const lastBrace = resp.text.lastIndexOf("}");
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
        throw new Error("LLM did not return JSON object");
    }
    const candidate = resp.text.slice(firstBrace, lastBrace + 1);
    return schema.parse(JSON.parse(candidate));
}
async function writeJson(filePath, data) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(data, null, 2) + "\n", "utf8");
}
export async function buildOpsDb(options) {
    const localDocs = options.localDocsDir ? await tryReadLocalDocs(options.localDocsDir) : [];
    const indexOps = [];
    for (const family of options.families) {
        const categoryUrl = options.categories[family];
        const categoryHtml = await fetchText(categoryUrl);
        const operators = parseCategoryOperatorsGeneric({ html: categoryHtml, family });
        const limited = options.limit ? operators.slice(0, options.limit) : operators;
        for (const op of limited) {
            try {
                const url = `https://docs.derivative.ca/${op.pageSlug}`;
                const html = await fetchText(url);
                const text = stripHtml(html);
                const tdOpTypeGuess = guessTdOpType(op.pageTitle, family);
                const summary = parseSummary(text);
                const inputs = parseInputs(text);
                const parameters = parseParameters(text);
                const attributes = parseAttributes(text);
                const baseName = op.pageTitle.replace(new RegExp(`\\s*${family}$`), "").trim();
                const localNotes = extractLocalSnippets({
                    docs: localDocs,
                    keywords: [op.pageTitle, baseName, op.pageSlug.replaceAll("_", " ")],
                    maxSnippets: 6,
                    contextChars: 500,
                });
                let enrich = {};
                if (options.enrich) {
                    enrich = await enrichWithLlm({
                        family,
                        pageTitle: op.pageTitle,
                        pageSlug: op.pageSlug,
                        summary,
                        parameters,
                        inputs,
                        localNotes,
                    });
                }
                const doc = OpsOperatorDocSchema.parse({
                    family,
                    pageTitle: op.pageTitle,
                    pageSlug: op.pageSlug,
                    url,
                    tdOpTypeGuess,
                    summary,
                    inputs,
                    parameters,
                    attributes,
                    localNotes,
                    useCases: enrich.useCases ?? [],
                    examples: enrich.examples ?? [],
                    commonCombinations: enrich.commonCombinations ?? [],
                    troubleshooting: enrich.troubleshooting ?? [],
                });
                indexOps.push({
                    family,
                    pageTitle: doc.pageTitle,
                    pageSlug: doc.pageSlug,
                    url: doc.url,
                    tdOpTypeGuess: doc.tdOpTypeGuess,
                    summary: doc.summary,
                });
                await writeJson(path.join(options.outDir, "operators", family, `${op.pageSlug}.json`), doc);
            }
            catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                console.error(`[opsBuild] Skip ${family}:${op.pageSlug}: ${msg}`);
                continue;
            }
        }
    }
    const index = OpsIndexSchema.parse({
        generatedAt: nowIso(),
        source: { categories: options.categories },
        operators: indexOps,
    });
    await writeJson(path.join(options.outDir, "index.json"), index);
}
async function main() {
    const args = process.argv.slice(2);
    const outDir = getArgValue(args, "--out") ?? null;
    if (!outDir)
        throw new Error("Missing --out <dir>");
    const familiesRaw = getArgValue(args, "--families");
    const families = (familiesRaw ? familiesRaw.split(",") : ["TOP", "CHOP", "SOP", "DAT"])
        .map((x) => x.trim().toUpperCase())
        .filter(Boolean);
    const parsedFamilies = z.array(TdFamilySchema).parse(families);
    const limitRaw = getArgValue(args, "--limit");
    const limit = limitRaw ? parseInt(limitRaw, 10) : undefined;
    const enrich = hasFlag(args, "--enrich");
    const localDocsDir = getArgValue(args, "--local-docs") ?? undefined;
    const categories = {
        TOP: getArgValue(args, "--category-top") ?? "https://docs.derivative.ca/Category:TOPs",
        CHOP: getArgValue(args, "--category-chop") ?? "https://docs.derivative.ca/Category:CHOPs",
        SOP: getArgValue(args, "--category-sop") ?? "https://docs.derivative.ca/Category:SOPs",
        DAT: getArgValue(args, "--category-dat") ?? "https://docs.derivative.ca/Category:DATs",
    };
    await buildOpsDb({
        outDir,
        families: parsedFamilies,
        categories,
        limit,
        enrich,
        localDocsDir,
    });
}
const isEntrypoint = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntrypoint) {
    main().catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
}
