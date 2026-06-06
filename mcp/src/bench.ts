#!/usr/bin/env node

/**
 * Bench CLI — Benchmark LLM → TD latency for natural language commands.
 *
 * Usage:
 *   node dist/bench.js -n 30 "List operators in /" "Get current selection"
 *
 * Options:
 *   -n <number>  Number of iterations per prompt (default: 10)
 *
 * Output:
 *   For each prompt: P50, P95, mean latency for LLM and TD calls.
 */

import { TDClient } from "td-api";
import { createLlmClientFromEnv } from "./llm.js";
import { runNaturalLanguageCommand } from "./commandRunner.js";

interface Stats {
  min: number;
  max: number;
  mean: number;
  p50: number;
  p95: number;
  failures: number;
}

function computeStats(values: number[]): Stats {
  if (values.length === 0) {
    return { min: 0, max: 0, mean: 0, p50: 0, p95: 0, failures: 0 };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  const failures = values.filter((v) => v < 0).length;

  return {
    min: sorted[0] ?? 0,
    max: sorted[sorted.length - 1] ?? 0,
    mean: sum / sorted.length,
    p50: sorted[Math.floor(sorted.length * 0.5)] ?? 0,
    p95: sorted[Math.floor(sorted.length * 0.95)] ?? 0,
    failures,
  };
}

async function main() {
  const args = process.argv.slice(2);
  let iterations = 10;

  // Parse options
  const promptArgs: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "-n" && i + 1 < args.length) {
      iterations = parseInt(args[i + 1], 10);
      i++;
    } else {
      promptArgs.push(args[i]);
    }
  }

  if (promptArgs.length === 0) {
    console.error("Usage: node dist/bench.js [-n iterations] \"prompt 1\" [\"prompt 2\" ...]");
    console.error("");
    console.error("Example: node dist/bench.js -n 30 \"List operators in /\"");
    process.exit(1);
  }

  const tdClient = new TDClient({
    host: process.env.TDAPI_HOST ?? "localhost",
    port: parseInt(process.env.TDAPI_PORT ?? "44444", 10),
  });

  const llm = createLlmClientFromEnv();

  for (const prompt of promptArgs) {
    console.log(`\nBenchmarking: "${prompt}"`);
    console.log(`  Iterations: ${iterations}`);
    console.log(`  LLM Provider: ${llm.constructor.name}`);

    const llmLatencies: number[] = [];
    const tdLatencies: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const result = await runNaturalLanguageCommand(tdClient, llm, prompt);
      llmLatencies.push(result.llm.latencyMs);
      tdLatencies.push(result.tdLatencyMs);

      if ((i + 1) % 10 === 0) {
        console.log(`  Completed ${i + 1}/${iterations}`);
      }
    }

    const llmStats = computeStats(llmLatencies);
    const tdStats = computeStats(tdLatencies);

    console.log(`\n  ┌──────────────────┬──────────┬──────────┬──────────┬──────────┬──────────┐`);
    console.log(`  │ Metric           │ Min      │ P50      │ P95      │ Max      │ Mean     │`);
    console.log(`  ├──────────────────┼──────────┼──────────┼──────────┼──────────┼──────────┤`);
    console.log(`  │ LLM Latency (ms) │ ${String(llmStats.min).padStart(8)} │ ${String(llmStats.p50).padStart(8)} │ ${String(llmStats.p95).padStart(8)} │ ${String(llmStats.max).padStart(8)} │ ${String(llmStats.mean.toFixed(1)).padStart(8)} │`);
    console.log(`  │ TD Latency (ms)  │ ${String(tdStats.min).padStart(8)} │ ${String(tdStats.p50).padStart(8)} │ ${String(tdStats.p95).padStart(8)} │ ${String(tdStats.max).padStart(8)} │ ${String(tdStats.mean.toFixed(1)).padStart(8)} │`);
    console.log(`  └──────────────────┴──────────┴──────────┴──────────┴──────────┴──────────┘`);
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
  process.exitCode = 1;
});
