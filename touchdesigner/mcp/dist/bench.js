#!/usr/bin/env node
import "dotenv/config";
import { pathToFileURL } from "node:url";
import { TDClient } from "td-api";
import { createLlmClientFromEnv } from "./llm.js";
import { runNaturalLanguageCommand } from "./commandRunner.js";
function parseArgs(argv) {
    const args = argv.slice(2);
    const commands = [];
    let runs = 10;
    for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (a === "--runs" || a === "-n") {
            const v = args[i + 1];
            if (v)
                runs = Number(v);
            i++;
            continue;
        }
        commands.push(a);
    }
    return { runs, commands };
}
function percentile(values, p) {
    if (values.length === 0)
        return null;
    const sorted = [...values].sort((a, b) => a - b);
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
    return sorted[idx];
}
async function main() {
    const { runs, commands } = parseArgs(process.argv);
    if (commands.length === 0) {
        throw new Error("Provide at least one command. Example: node mcp/dist/bench.js -n 30 \"Lista operadores en /\"");
    }
    const llm = createLlmClientFromEnv();
    const td = new TDClient();
    const results = [];
    for (const command of commands) {
        const llmLatencies = [];
        const tdLatencies = [];
        let errors = 0;
        for (let i = 0; i < runs; i++) {
            try {
                const r = await runNaturalLanguageCommand({ llm, td, command });
                llmLatencies.push(r.llm.latencyMs);
                tdLatencies.push(r.tdLatencyMs);
            }
            catch {
                errors++;
            }
        }
        results.push({
            command,
            runs,
            errors,
            llm: {
                p50Ms: percentile(llmLatencies, 0.5),
                p95Ms: percentile(llmLatencies, 0.95),
            },
            td: {
                p50Ms: percentile(tdLatencies, 0.5),
                p95Ms: percentile(tdLatencies, 0.95),
            },
        });
    }
    process.stdout.write(JSON.stringify({ results }, null, 2) + "\n");
}
const isEntrypoint = process.argv[1] &&
    import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntrypoint) {
    main().catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
}
