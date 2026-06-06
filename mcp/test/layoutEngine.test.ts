/**
 * LayoutEngine + NetworkPlanner End-to-End Tests
 *
 * Ported from mcp_td_v3/tests/e2e_particle_project.ts
 * Tests anti-collision layout, role classification, chain planning,
 * MCP command generation, parallel chains, cross-chain connections,
 * stress testing, engine reset, and dry-run planning.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  LayoutEngine,
  planProject,
  planParticleSystem,
  planAudioReactive,
  getRoleForType,
  getNodeBounds,
  boundsOverlap,
  DEFAULT_CONFIG,
} from "../src/layoutEngine.js";

describe("LayoutEngine", () => {
  // ─── Role Classification ──────────────────────────────────────────────
  describe("Role Classification", () => {
    const roles: Record<string, string> = {
      spherePOP: "source",
      gridTOP: "source",
      moviefileinTOP: "source",
      constantCHOP: "source",
      beatCHOP: "source",
      noisePOP: "modifier",
      randomPOP: "modifier",
      mathCHOP: "modifier",
      transformSOP: "modifier",
      particlePOP: "solver",
      renderTOP: "output",
      nullTOP: "output",
      toptoPOP: "bridge",
      choptoPOP: "bridge",
      soptoPOP: "bridge",
    };

    for (const [type, expectedRole] of Object.entries(roles)) {
      it(`${type} → ${expectedRole}`, () => {
        assert.equal(getRoleForType(type), expectedRole);
      });
    }
  });

  // ─── AABB Collision Detection ─────────────────────────────────────────
  describe("AABB Collision Detection", () => {
    it("same position overlaps", () => {
      const b1 = getNodeBounds(0, 0, DEFAULT_CONFIG);
      const b2 = getNodeBounds(0, 0, DEFAULT_CONFIG);
      assert.ok(boundsOverlap(b1, b2));
    });

    it("300px apart does not overlap", () => {
      const b1 = getNodeBounds(0, 0, DEFAULT_CONFIG);
      const b3 = getNodeBounds(300, 0, DEFAULT_CONFIG);
      assert.ok(!boundsOverlap(b1, b3));
    });

    it("100px offset overlaps", () => {
      const b1 = getNodeBounds(0, 0, DEFAULT_CONFIG);
      const b4 = getNodeBounds(100, 0, DEFAULT_CONFIG);
      assert.ok(boundsOverlap(b1, b4));
    });

    it("250px apart does not overlap", () => {
      const b1 = getNodeBounds(0, 0, DEFAULT_CONFIG);
      const b5 = getNodeBounds(250, 0, DEFAULT_CONFIG);
      assert.ok(!boundsOverlap(b1, b5));
    });
  });

  // ─── Linear Chain ────────────────────────────────────────────────────
  describe("Linear Chain Anti-Collision (Particle System)", () => {
    it("places ≥5 nodes", () => {
      const result = planParticleSystem("spherePOP", "/project1");
      assert.ok(result.nodes.length >= 5);
    });

    it("flows left-to-right", () => {
      const result = planParticleSystem("spherePOP", "/project1");
      for (let i = 1; i < result.nodes.length; i++) {
        assert.ok(result.nodes[i].x > result.nodes[i - 1].x);
      }
    });

    it("has no collisions", () => {
      const result = planParticleSystem("spherePOP", "/project1");
      const bounds = result.nodes.map((n) =>
        getNodeBounds(n.x, n.y, DEFAULT_CONFIG)
      );
      for (let i = 0; i < bounds.length; i++) {
        for (let j = i + 1; j < bounds.length; j++) {
          assert.ok(!boundsOverlap(bounds[i], bounds[j]));
        }
      }
    });
  });

  // ─── MCP Command Generation ──────────────────────────────────────────
  describe("MCP Command Generation", () => {
    it("generates correct number of create + connect commands", () => {
      const engine = new LayoutEngine();
      const chain = [
        { name: "sphere1", type: "spherePOP" },
        { name: "noise1", type: "noisePOP" },
        { name: "particles1", type: "particlePOP" },
        { name: "render1", type: "renderTOP" },
        { name: "null1", type: "nullTOP" },
      ];
      const positioned = engine.planLinearChain(chain, 0, "/project_root");
      const commands = engine.generateMcpCommands(
        positioned,
        "/project_root"
      );
      const creates = commands.filter((c) => c.tool === "td_create_operator");
      const connects = commands.filter(
        (c) => c.tool === "td_connect_nodes"
      );
      assert.equal(creates.length, chain.length);
      assert.equal(connects.length, chain.length - 1);
    });
  });

  // ─── Parallel Chains ─────────────────────────────────────────────────
  describe("Parallel Chains (Audio Reactive)", () => {
    it("has different Y positions for parallel chains", () => {
      const result = planAudioReactive("/project1");
      const yPositions = new Set(result.nodes.map((n) => n.y));
      assert.ok(yPositions.size >= 2);
    });

    it("has no collisions across parallel chains", () => {
      const result = planAudioReactive("/project1");
      const bounds = result.nodes.map((n) =>
        getNodeBounds(n.x, n.y, DEFAULT_CONFIG)
      );
      for (let i = 0; i < bounds.length; i++) {
        for (let j = i + 1; j < bounds.length; j++) {
          assert.ok(!boundsOverlap(bounds[i], bounds[j]));
        }
      }
    });
  });

  // ─── Full Pipeline ───────────────────────────────────────────────────
  describe("Full Pipeline (3 chains)", () => {
    it("creates 8 nodes with no collisions", () => {
      const project = planProject(
        [
          [
            { name: "audio_in", type: "audioCHOP" },
            { name: "audio_norm", type: "mathCHOP" },
            { name: "audio_to_pop", type: "choptoPOP" },
          ],
          [
            { name: "source_sphere", type: "spherePOP" },
            { name: "source_noise", type: "noisePOP" },
          ],
          [
            { name: "particles", type: "particlePOP" },
            { name: "render_out", type: "renderTOP" },
            { name: "final_null", type: "nullTOP" },
          ],
        ],
        "/project_root"
      );
      assert.equal(project.nodes.length, 8);
      const bounds = project.nodes.map((n) =>
        getNodeBounds(n.x, n.y, DEFAULT_CONFIG)
      );
      for (let i = 0; i < bounds.length; i++) {
        for (let j = i + 1; j < bounds.length; j++) {
          assert.ok(!boundsOverlap(bounds[i], bounds[j]));
        }
      }
      const creates = project.commands.filter(
        (c) => c.tool === "td_create_operator"
      );
      const connects = project.commands.filter(
        (c) => c.tool === "td_connect_nodes"
      );
      assert.equal(creates.length, 8);
      assert.ok(connects.length > 0);
    });
  });

  // ─── Stress Test ─────────────────────────────────────────────────────
  describe("Stress Test — 20 Nodes Without Collision", () => {
    it("places all 20 nodes uniquely without collisions", () => {
      const engine = new LayoutEngine();
      const chain = Array.from({ length: 20 }, (_, i) => ({
        name: `s${i}`,
        type: i % 2 === 0 ? "spherePOP" : "noisePOP",
      }));
      const nodes = engine.planLinearChain(chain, 0, "/stress_test");
      assert.equal(nodes.length, 20);
      const positions = new Set(nodes.map((n) => `${n.x},${n.y}`));
      assert.equal(positions.size, 20);
      const bounds = nodes.map((n) =>
        getNodeBounds(n.x, n.y, DEFAULT_CONFIG)
      );
      for (let i = 0; i < bounds.length; i++) {
        for (let j = i + 1; j < bounds.length; j++) {
          assert.ok(!boundsOverlap(bounds[i], bounds[j]));
        }
      }
    });
  });

  // ─── Cross-Chain Connections ─────────────────────────────────────────
  describe("Cross-Chain Connection Commands", () => {
    it("generates cross-chain bridge connection", () => {
      const engine = new LayoutEngine();
      const nodes = engine.planParallelChains(
        [
          [
            { name: "audio", type: "audioCHOP" },
            { name: "norm", type: "mathCHOP" },
            { name: "bridge", type: "choptoPOP" },
          ],
          [
            { name: "source", type: "spherePOP" },
            { name: "noise", type: "noisePOP" },
          ],
        ],
        "/cross_test"
      );
      const commands = engine.generateMcpCommands(nodes, "/cross_test", [
        ["bridge", "noise"],
      ]);
      const connects = commands.filter((c) => c.tool === "td_connect_nodes");
      const hasCrossChain = connects.some(
        (c) =>
          c.params.source_path.includes("bridge") &&
          c.params.target_path.includes("noise")
      );
      assert.ok(hasCrossChain);
    });
  });

  // ─── Engine Reset ────────────────────────────────────────────────────
  describe("Engine Reset", () => {
    it("clears state between uses", () => {
      const engine = new LayoutEngine();
      engine.planLinearChain(
        [
          { name: "a", type: "spherePOP" },
          { name: "b", type: "noisePOP" },
        ],
        0,
        "/reset_test"
      );
      assert.equal(engine.getPlacedNodes().length, 2);
      engine.reset();
      assert.equal(engine.getPlacedNodes().length, 0);
      engine.planLinearChain(
        [{ name: "c", type: "spherePOP" }],
        0,
        "/reset_test"
      );
      assert.equal(engine.getPlacedNodes()[0].x, 0);
    });
  });
});
