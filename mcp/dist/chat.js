#!/usr/bin/env node
/**
 * Chat CLI — Natural language command interface for TouchDesigner.
 *
 * Usage:
 *   node dist/chat.js "Create a Grid SOP inside /project1"
 *
 * Environment:
 *   LLM_PROVIDER=anthropic|gemini|mock (default: anthropic)
 *   LLM_RETRY_MAX=5
 *   LLM_RETRY_BASE_MS=300
 *   LLM_RETRY_MAX_MS=5000
 *   ANTHROPIC_API_KEY=...
 *   GEMINI_API_KEY=...
 *   TDAPI_HOST=localhost
 *   TDAPI_PORT=44444
 */
import { TDClient } from "td-api";
import { createLlmClientFromEnv } from "./llm.js";
import { runNaturalLanguageCommand } from "./commandRunner.js";
async function main() {
    const prompt = process.argv.slice(2).join(" ").trim();
    if (!prompt) {
        console.error("Usage: node dist/chat.js \"<natural language command>\"");
        console.error("");
        console.error("Environment:");
        console.error("  LLM_PROVIDER=anthropic|gemini|mock (default: anthropic)");
        console.error("  TDAPI_PORT=44444 (default)");
        process.exit(1);
    }
    // Initialize clients
    const tdClient = new TDClient({
        host: process.env.TDAPI_HOST ?? "localhost",
        port: parseInt(process.env.TDAPI_PORT ?? "44444", 10),
    });
    const llm = createLlmClientFromEnv();
    // Run the command
    const result = await runNaturalLanguageCommand(tdClient, llm, prompt);
    // Output as JSON
    console.log(JSON.stringify(result, null, 2));
    // Exit with error code if something failed
    if (result.error) {
        process.exitCode = 1;
    }
}
main().catch((error) => {
    console.error(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }, null, 2));
    process.exitCode = 1;
});
