#!/usr/bin/env node
import "dotenv/config";
import readline from "node:readline";
import { TDClient } from "td-api";
import { createLlmClientFromEnv } from "./llm.js";
import { runNaturalLanguageCommand } from "./commandRunner.js";
import { pathToFileURL } from "node:url";
function getArgValue(args, name) {
    const idx = args.indexOf(name);
    if (idx === -1)
        return null;
    return args[idx + 1] ?? null;
}
function hasFlag(args, name) {
    return args.includes(name);
}
function normalizeInlineCode(value) {
    return value.replaceAll("\\n", "\n");
}
function getCommandFromArgs(argv) {
    const args = argv.slice(2);
    if (args.length === 0)
        return null;
    return args.join(" ").trim() || null;
}
async function runDirect(args) {
    const td = new TDClient();
    if (hasFlag(args, "--py")) {
        const codeRaw = getArgValue(args, "--py");
        const code = codeRaw ? normalizeInlineCode(codeRaw) : null;
        if (!code)
            throw new Error("Missing --py value");
        const fromOp = getArgValue(args, "--from") ?? "/";
        const result = await td.execute(code, fromOp);
        process.stdout.write(JSON.stringify(result, null, 2) + "\n");
        return;
    }
    const tool = getArgValue(args, "--tool");
    if (!tool) {
        throw new Error("Missing --tool value");
    }
    if (tool === "td_pane") {
        const result = await td.getPaneState();
        process.stdout.write(JSON.stringify(result, null, 2) + "\n");
        return;
    }
    if (tool === "td_selection") {
        const result = await td.getSelection();
        process.stdout.write(JSON.stringify(result, null, 2) + "\n");
        return;
    }
    if (tool === "td_operators") {
        const path = getArgValue(args, "--path") ?? "/";
        const result = await td.getOperators(path);
        process.stdout.write(JSON.stringify(result, null, 2) + "\n");
        return;
    }
    if (tool === "td_execute") {
        const codeRaw = getArgValue(args, "--code");
        const code = codeRaw ? normalizeInlineCode(codeRaw) : null;
        if (!code)
            throw new Error("Missing --code value for td_execute");
        const fromOp = getArgValue(args, "--from") ?? "/";
        const result = await td.execute(code, fromOp);
        process.stdout.write(JSON.stringify(result, null, 2) + "\n");
        return;
    }
    throw new Error(`Unsupported tool: ${tool}`);
}
async function runOne(command) {
    const llm = createLlmClientFromEnv();
    const td = new TDClient();
    const result = await runNaturalLanguageCommand({ llm, td, command });
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}
async function runInteractive() {
    const llm = createLlmClientFromEnv();
    const td = new TDClient();
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: true,
    });
    rl.setPrompt("> ");
    rl.prompt();
    rl.on("line", async (line) => {
        const command = line.trim();
        if (!command) {
            rl.prompt();
            return;
        }
        if (command === "exit" || command === "quit") {
            rl.close();
            return;
        }
        try {
            const result = await runNaturalLanguageCommand({ llm, td, command });
            process.stdout.write(JSON.stringify(result, null, 2) + "\n");
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            process.stderr.write(message + "\n");
        }
        finally {
            rl.prompt();
        }
    });
}
async function main() {
    const args = process.argv.slice(2);
    if (hasFlag(args, "--py") || hasFlag(args, "--tool")) {
        await runDirect(args);
        return;
    }
    const command = getCommandFromArgs(process.argv);
    if (command) {
        await runOne(command);
        return;
    }
    await runInteractive();
}
const isEntrypoint = process.argv[1] &&
    import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntrypoint) {
    main().catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
}
