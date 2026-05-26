#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
function hasFlag(args, name) {
    return args.includes(name);
}
function getArgValue(args, name) {
    const idx = args.indexOf(name);
    if (idx === -1)
        return null;
    return args[idx + 1] ?? null;
}
function parseFrontmatter(md) {
    if (!md.startsWith("---\n"))
        return { frontmatter: null, body: md };
    const end = md.indexOf("\n---\n", 4);
    if (end === -1)
        return { frontmatter: null, body: md };
    const frontmatter = md.slice(4, end);
    const body = md.slice(end + "\n---\n".length);
    return { frontmatter, body };
}
function requiredKey(frontmatter, key) {
    const re = new RegExp(`^${key}\\s*:`, "m");
    return re.test(frontmatter);
}
async function lintPromptFile(filePath) {
    const raw = await fs.readFile(filePath, "utf8");
    const { frontmatter, body } = parseFrontmatter(raw);
    const errors = [];
    if (!frontmatter) {
        errors.push("missing frontmatter");
        return errors;
    }
    for (const key of [
        "id",
        "title",
        "project_type",
        "complexity",
        "application",
        "touchdesigner_min_version",
        "hardware",
        "performance",
        "validation",
    ]) {
        if (!requiredKey(frontmatter, key))
            errors.push(`missing frontmatter key: ${key}`);
    }
    if (!body.includes("## Prompt maestro"))
        errors.push("missing section: ## Prompt maestro");
    if (!body.toLowerCase().includes("validación"))
        errors.push("missing validation text in body");
    return errors;
}
export async function lintPrompts(options) {
    const entries = await fs.readdir(options.promptsDir, { withFileTypes: true });
    const files = entries
        .filter((e) => e.isFile())
        .map((e) => e.name)
        .filter((n) => n.toLowerCase().endsWith(".md"))
        .sort();
    const results = [];
    for (const name of files) {
        const filePath = path.join(options.promptsDir, name);
        const errors = await lintPromptFile(filePath);
        results.push({ file: name, errors });
    }
    const failed = results.filter((r) => r.errors.length > 0);
    return { total: results.length, failed, passed: results.length - failed.length };
}
async function main() {
    const args = process.argv.slice(2);
    const promptsDir = getArgValue(args, "--dir") ?? path.join(process.cwd(), "..", "..", "prompts", "master");
    const json = hasFlag(args, "--json");
    const result = await lintPrompts({ promptsDir });
    if (json) {
        process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    }
    else {
        for (const f of result.failed) {
            process.stdout.write(`${f.file}: ${f.errors.join(", ")}\n`);
        }
        process.stdout.write(`passed ${result.passed}/${result.total}\n`);
    }
    if (result.failed.length > 0)
        process.exitCode = 1;
}
const isEntrypoint = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntrypoint) {
    main().catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
}
