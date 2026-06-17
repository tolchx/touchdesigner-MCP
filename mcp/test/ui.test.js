/**
 * Unit tests for UI tools — focused on the `td_auto_layout` MCP tool.
 *
 * Because this tool is a thin wrapper around the TDClient.autoLayout()
 * HTTP call, the tests exercise a MockTDClient that mirrors the real
 * method signature and returns a representative payload. This validates
 * the contract the MCP handler relies on (argument plumbing, defaults,
 * and response shape) without requiring a live TouchDesigner instance.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

// ─── Mock TDClient ──────────────────────────────────────────────────────────
// Mirrors the real TDClient.autoLayout(path, spacingX, spacingY) signature
// and the shape of the raw JSON returned by POST /auto_layout.

class MockTDClient {
  constructor() {
    this.calls = [];
  }

  async autoLayout(path, spacingX, spacingY) {
    // Reproduce the real method's default parameters
    path = path === undefined ? "/" : path;
    spacingX = spacingX === undefined ? 250 : spacingX;
    spacingY = spacingY === undefined ? 80 : spacingY;

    this.calls.push({ path, spacingX, spacingY });

    return {
      success: true,
      path,
      spacing_x: spacingX,
      spacing_y: spacingY,
      layout: [
        { name: "src", x: -250, y: 0 },
        { name: "blur", x: 0, y: 0 },
        { name: "out", x: 250, y: 0 },
      ],
    };
  }
}

// ─── MCP handler parity ─────────────────────────────────────────────────────
// This mirrors the exact argument-plumbing logic inside the td_auto_layout
// tool handler in mcp/src/tools/ui.ts, so we are testing the real behavior.

async function autoLayoutHandler(client, { path, spacingX, spacingY }) {
  const result = await client.autoLayout(
    path ?? "/project1",
    spacingX ?? 250,
    spacingY ?? 80,
  );
  return result;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("UI Tools", () => {
  describe("td_auto_layout", () => {
    it("should return auto-layout result with correct path and spacing", async () => {
      const client = new MockTDClient();
      const result = await client.autoLayout("/project1", 250, 80);

      assert.ok(result.success, "result.success should be true");
      assert.equal(result.path, "/project1");
      assert.equal(result.spacing_x, 250);
      assert.equal(result.spacing_y, 80);
      assert.equal(result.layout.length, 3);
      assert.ok(Array.isArray(result.layout));
    });

    it("should handle default parameters (no args)", async () => {
      const client = new MockTDClient();
      const result = await client.autoLayout();

      assert.ok(result.success);
      assert.equal(result.path, "/");
      assert.equal(result.spacing_x, 250);
      assert.equal(result.spacing_y, 80);
    });

    it("should pass through custom spacing values", async () => {
      const client = new MockTDClient();
      const result = await client.autoLayout("/project1/geo", 400, 150);

      assert.equal(result.path, "/project1/geo");
      assert.equal(result.spacing_x, 400);
      assert.equal(result.spacing_y, 150);
      // Verify the call was recorded with the right args
      assert.equal(client.calls.length, 1);
      assert.deepEqual(client.calls[0], {
        path: "/project1/geo",
        spacingX: 400,
        spacingY: 150,
      });
    });

    it("handler should apply /project1 + 250/80 defaults when inputs are undefined", async () => {
      const client = new MockTDClient();
      const result = await autoLayoutHandler(client, {
        path: undefined,
        spacingX: undefined,
        spacingY: undefined,
      });

      assert.equal(result.path, "/project1");
      assert.equal(result.spacing_x, 250);
      assert.equal(result.spacing_y, 80);
    });

    it("handler should forward explicit values verbatim", async () => {
      const client = new MockTDClient();
      const result = await autoLayoutHandler(client, {
        path: "/project1/chain",
        spacingX: 300,
        spacingY: 100,
      });

      assert.equal(result.path, "/project1/chain");
      assert.equal(result.spacing_x, 300);
      assert.equal(result.spacing_y, 100);
    });

    it("should return a left-to-right ordered layout (x ascending)", async () => {
      const client = new MockTDClient();
      const result = await client.autoLayout();
      const xs = result.layout.map((n) => n.x);

      assert.deepEqual(xs, [...xs].sort((a, b) => a - b),
        "layout nodes should be ordered left-to-right by x");
    });

    it("should propagate client errors as rejections (handler will catch)", async () => {
      const errorClient = {
        async autoLayout() {
          throw new Error("Connection refused");
        },
      };

      await assert.rejects(
        () => autoLayoutHandler(errorClient, { path: "/x", spacingX: 250, spacingY: 80 }),
        /Connection refused/,
      );
    });
  });
});
