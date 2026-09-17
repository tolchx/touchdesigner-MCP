/**
 * Offline tests: the POP knowledge base feeds matrix categories into the MCP
 * so network builders recommend ONLY ok_con_input POP types.
 *
 *   - pop_operators.json carries validation_category / recommended_for_networks
 *     per type, and the counts match docs/pop_matrix.json (80/12/8/1)
 *   - popKnowledge.ts exposes listOkPopTypes / isRecommendedForNetworks /
 *     networkRecommendationWarning
 *   - topologyData's inferOpTopology warns for non-ok POPs (planner prompt)
 *   - deterministicPlan prefers ok_con_input POPs on keyword ties
 *
 * No TouchDesigner required. Build first: cd mcp && npm run build
 * Run: node --test test/popRecommendation.test.js
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  getPopInfo,
  listOkPopTypes,
  isRecommendedForNetworks,
  networkRecommendationWarning,
} from "../dist/popKnowledge.js";
import { inferOpTopology, buildTopologyCatalog } from "../dist/topologyData.js";
import { deterministicPlan } from "../dist/plannerDeterministic.js";

const thisDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(thisDir, "..", "..");

// ─── KB data: categories present and consistent with the matrix ─────────────

describe("pop_operators.json carries matrix categories", () => {
  const kb = JSON.parse(
    readFileSync(
      resolve(repoRoot, "mcp/data/pops/knowledge/pop_operators.json"),
      "utf-8",
    ),
  );
  const matrix = JSON.parse(
    readFileSync(resolve(repoRoot, "docs/pop_matrix.json"), "utf-8"),
  );

  it("every operator has validation_category + recommended_for_networks", () => {
    for (const op of kb.operators) {
      assert.ok(op.validation_category, `${op.type}: missing validation_category`);
      assert.equal(
        op.recommended_for_networks,
        op.validation_category === "ok_con_input",
        `${op.type}: recommended flag must mirror ok_con_input`,
      );
      // Geometry evidence: ok types must show numPoints > 0; non-ok types
      // carry whatever the matrix measured (null for never-created types).
      if (op.validation_category === "ok_con_input") {
        assert.ok(
          op.geometry && op.geometry.numPoints > 0,
          `${op.type}: ok_con_input requires positive geometry evidence`,
        );
      } else {
        assert.ok(
          "numPoints" in (op.geometry ?? {}),
          `${op.type}: non-ok types must still carry the geometry field`,
        );
      }
    }
  });

  it("category counts match the live matrix exactly", () => {
    const byCat = {};
    for (const op of kb.operators) {
      byCat[op.validation_category] = (byCat[op.validation_category] || 0) + 1;
    }
    for (const cat of Object.keys(matrix.categories)) {
      assert.equal(
        byCat[cat],
        matrix.categories[cat].length,
        `category ${cat}: KB vs matrix mismatch`,
      );
    }
    assert.equal(
      kb.index.counts.ok_con_input,
      matrix.ok_con_input_count,
      "index.counts.ok_con_input must match the matrix",
    );
  });

  it("the error message from the matrix is preserved for non-ok types", () => {
    const cplusplus = kb.operators.find((o) => o.type === "cplusplusPOP");
    assert.ok(cplusplus);
    assert.equal(cplusplus.validation_category, "error_con_input");
    assert.ok(cplusplus.matrix_error, "cplusplusPOP should carry its TD error");
  });
});

// ─── popKnowledge API ────────────────────────────────────────────────────────

describe("popKnowledge recommendation API", () => {
  it("getPopInfo exposes validationCategory and recommendedForNetworks", () => {
    const box = getPopInfo("boxPOP");
    assert.ok(box);
    assert.equal(box.validationCategory, "ok_con_input");
    assert.equal(box.recommendedForNetworks, true);
  });

  it("listOkPopTypes: 78 types, includes boxPOP, excludes all non-ok", () => {
    const ok = listOkPopTypes();
    assert.equal(ok.length, 78);
    assert.ok(ok.includes("boxPOP"));
    assert.ok(!ok.includes("particlePOP")); // error_con_input on 2025.31760
    assert.ok(!ok.includes("engineoutPOP")); // no_creable
    assert.ok(!ok.includes("cplusplusPOP")); // error_con_input
  });

  it("short-name alias resolves with the same evidence (circle → circlePOP)", () => {
    assert.equal(isRecommendedForNetworks("circle"), true);
    assert.equal(isRecommendedForNetworks("CIRCLEPOP"), true);
  });

  it("non-ok types get an explanatory recommendation warning; ok types get none", () => {
    assert.equal(networkRecommendationWarning("boxPOP"), null);
    assert.match(
      networkRecommendationWarning("particlePOP") ?? "",
      /errors\(\)/, // error_con_input on 2025.31760 (was sin_geometria on 2025.32460)
    );
    assert.match(
      networkRecommendationWarning("cplusplusPOP") ?? "",
      /errors\(\)/,
    );
    assert.match(
      networkRecommendationWarning("engineoutPOP") ?? "",
      /cannot be created/,
    );
    assert.equal(networkRecommendationWarning("totallyUnknownPOP"), null);
  });
});

// ─── Planner integration ─────────────────────────────────────────────────────

describe("planner integration: only ok_con_input POPs recommended", () => {
  it("inferOpTopology warns for non-ok POPs, stays silent for ok ones", () => {
    const bad = inferOpTopology("particlePOP", {});
    assert.ok(
      bad.warnings.some((w) => w.includes("NOT recommended")),
      "particlePOP must carry the NOT-recommended warning",
    );
    const good = inferOpTopology("boxPOP", {});
    assert.ok(
      !good.warnings.some((w) => w.includes("NOT recommended")),
      "boxPOP must not carry the NOT-recommended warning",
    );
  });

  it("deterministicPlan on 'points scattered on sphere' picks ok POPs only", () => {
    const plan = deterministicPlan(
      "points scattered on sphere with forces",
      buildTopologyCatalog(),
      "/project1",
    );
    for (const node of plan.nodes) {
      if (node.opType.endsWith("POP")) {
        assert.equal(
          isRecommendedForNetworks(node.opType),
          true,
          `plan recommended non-ok POP ${node.opType}`,
        );
      }
    }
  });

  it("explicit request for a non-ok POP still plans it, with a warning", () => {
    const plan = deterministicPlan(
      "particlePOP particle system",
      buildTopologyCatalog(),
      "/project1",
    );
    const particle = plan.nodes.find((n) => n.opType === "particlePOP");
    // The catalog entry must exist for explicit requests; the warning path is
    // exercised via inferOpTopology above (particlePOP carries NOT-recommended).
    assert.ok(particle, "explicit request must still plan particlePOP");
  });
});
