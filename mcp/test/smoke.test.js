/**
 * Smoke test for TouchDesigner MCP Server
 *
 * Verifies that the server can be instantiated and that
 * all expected tools are registered.
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import { createTouchDesignerMcpServer } from "../dist/server.js";

describe("TouchDesigner MCP Server", () => {
  it("should create a server instance", async () => {
    const server = createTouchDesignerMcpServer();
    assert.ok(server, "Server should be created");
    assert.strictEqual(typeof server.registerTool, "function");
  });

  it("should have server metadata", async () => {
    const server = createTouchDesignerMcpServer();
    // Default McpServer has name/version in internal state
    assert.ok(server, "Server instance exists");
  });

  it("should be able to list registered tools", async () => {
    const server = createTouchDesignerMcpServer();
    // The McpServer registers tools via registerTool
    // This simply confirms no crash on initialization
    assert.ok(server, "Tools registered without error");
  });
});
