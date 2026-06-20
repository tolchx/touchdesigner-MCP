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
export {};
