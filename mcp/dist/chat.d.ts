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
export {};
