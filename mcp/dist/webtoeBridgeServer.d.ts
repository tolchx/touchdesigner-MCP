/**
 * WebToe MCP Bridge — HTTP Server
 *
 * Exposes MCP tools as REST endpoints for the WebToe browser chat panel.
 * Three-in-one: bridged MCP tools, stateless HTTP API, and Claude Code MCP config.
 *
 * Endpoints:
 *   POST /chat           — Natural language → .webtoe.json
 *   POST /resolve        — Resolve operator names
 *   POST /generate-op    — Generate OpSpec + shader
 *   POST /list-gaps      — List WebToe coverage gaps
 *   GET  /health         — Health check
 *   GET  /openapi.json   — Self-documenting API spec
 *
 * Run:
 *   WEBTOE_PORT=3001 node mcp/dist/webtoeBridgeServer.js
 */
export {};
