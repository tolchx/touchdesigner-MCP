#!/usr/bin/env node
/**
 * test_spring_template.mjs — Build the spring-feedback-glsl template in live TD
 *
 * Tests that all operators from the template can be created and connected:
 *   circle POP → attribute POP → attribCreate POP → GLSL POP → feedback POP → null POP
 */

import { McpClient, ROOT } from "./test_helpers.mjs";

const SX = 100;
const SY = 200;

function pos(x, y) {
  return { position_x: SX + x, position_y: SY + y };
}

async function run() {
  const HOST = process.env.TDAPI_HOST || "localhost";
  const PORT = process.env.TDAPI_PORT || "44444";

  console.log("\n=== Test: Build spring-feedback-glsl template ===");
  console.log(`  TD Target: ${HOST}:${PORT}\n`);

  const c = new McpClient();
  let passed = 0;
  let failed = 0;

  function check(label, condition, detail = "") {
    if (condition) {
      console.log(`  ✅ ${label} ${detail}`);
      passed++;
    } else {
      console.log(`  ❌ ${label} ${detail}`);
      failed++;
    }
  }

  try {
    await c.start();
    await c.waitForReady();
    console.log("  ✅ MCP Server ready\n");
  } catch (e) {
    console.error(`  ❌ Server failed: ${e.message}`);
    c.stop();
    process.exit(1);
  }

  // Check TD connection
  const hc = await c.call("td_healthcheck", { path: "/", recurse: false }, 5000);
  if (!hc.ok || hc.data?.error) {
    console.log("  ⚠️  TouchDesigner NOT connected");
    console.log("     Start TD with MCP extension to run this test.\n");
    c.stop();
    process.exit(0);
  }
  console.log("  ✅ TouchDesigner connected\n");

  // ================================================================
  // STEP 1: Create baseCOMP container
  // ================================================================
  console.log("─── 1. Create baseCOMP container ───\n");

  const baseName = "spring_test_" + Date.now();
  const baseResult = await c.call("td_create_operator", {
    type: "baseCOMP",
    name: baseName,
    path: "/project1",
    ...pos(0, 0),
  }, 8000);
  check("Create baseCOMP", baseResult.ok, `(${baseResult.data?.name || baseResult.error})`);

  const basePath = `/project1/${baseName}`;

  // ================================================================
  // STEP 2: Create circle POP (source)
  // ================================================================
  console.log("\n─── 2. Create circle POP (source) ───\n");

  const circleResult = await c.call("td_create_operator", {
    type: "circlePOP",
    name: "circle1",
    path: basePath,
    ...pos(0, 100),
  }, 8000);
  check("Create circlePOP", circleResult.ok, `(${circleResult.data?.name || circleResult.error})`);

  // ================================================================
  // STEP 3: Create attribute POP
  // ================================================================
  console.log("\n─── 3. Create attribute POP ───\n");

  const attrResult = await c.call("td_create_operator", {
    type: "attributePOP",
    name: "attribute2",
    path: basePath,
    ...pos(0, 250),
  }, 8000);
  check("Create attributePOP", attrResult.ok, `(${attrResult.data?.name || attrResult.error})`);

  // ================================================================
  // STEP 4: Create attribCreate POP (Vel attribute)
  // ================================================================
  console.log("\n─── 4. Create attribCreate POP ───\n");

  const attribCreateResult = await c.call("td_create_operator", {
    type: "attribCreatePOP",
    name: "attrib_createVel",
    path: basePath,
    ...pos(0, 400),
  }, 8000);
  check("Create attribCreatePOP", attribCreateResult.ok, `(${attribCreateResult.data?.name || attribCreateResult.error})`);

  // ================================================================
  // STEP 5: Create GLSL POP
  // ================================================================
  console.log("\n─── 5. Create GLSL POP ───\n");

  const glslResult = await c.call("td_create_operator", {
    type: "glslPOP",
    name: "glsl1",
    path: basePath,
    ...pos(0, 550),
  }, 8000);
  check("Create glslPOP", glslResult.ok, `(${glslResult.data?.name || glslResult.error})`);

  // ================================================================
  // STEP 6: Create GLSL compute DAT
  // ================================================================
  console.log("\n─── 6. Create GLSL compute DAT ───\n");

  const glslComputeResult = await c.call("td_create_operator", {
    type: "textDAT",
    name: "glsl1_compute",
    path: basePath,
    ...pos(200, 550),
  }, 8000);
  check("Create textDAT (glsl1_compute)", glslComputeResult.ok, `(${glslComputeResult.data?.name || glslComputeResult.error})`);

  // ================================================================
  // STEP 7: Create feedback POP
  // ================================================================
  console.log("\n─── 7. Create feedback POP ───\n");

  const feedbackResult = await c.call("td_create_operator", {
    type: "feedbackPOP",
    name: "feedback1",
    path: basePath,
    ...pos(0, 700),
  }, 8000);
  check("Create feedbackPOP", feedbackResult.ok, `(${feedbackResult.data?.name || feedbackResult.error})`);

  // ================================================================
  // STEP 8: Create null POP (output)
  // ================================================================
  console.log("\n─── 8. Create null POP ───\n");

  const nullResult = await c.call("td_create_operator", {
    type: "nullPOP",
    name: "null1",
    path: basePath,
    ...pos(0, 850),
  }, 8000);
  check("Create nullPOP", nullResult.ok, `(${nullResult.data?.name || nullResult.error})`);

  // ================================================================
  // STEP 9: Connect operators
  // ================================================================
  console.log("\n─── 9. Connect operators ───\n");

  const connections = [
    ["circle1", "attribute2", "circle → attribute"],
    ["attribute2", "attrib_createVel", "attribute → attribCreate"],
    ["attrib_createVel", "glsl1", "attribCreate → glsl1"],
    ["glsl1", "feedback1", "glsl1 → feedback"],
    ["feedback1", "null1", "feedback → null"],
  ];

  for (const [src, tgt, label] of connections) {
    const r = await c.call("td_connect_nodes", {
      source_path: `${basePath}/${src}`,
      target_path: `${basePath}/${tgt}`,
    }, 5000);
    check(`Connect ${label}`, r.ok, `(${r.data?.success ? "OK" : r.error})`);
  }

  // ================================================================
  // STEP 10: Set parameters
  // ================================================================
  console.log("\n─── 10. Set parameters ───\n");

  // Set circle divisions
  const setCircleDiv = await c.call("td_pars_set", {
    path: `${basePath}/circle1`,
    updates: [{ name: "Divisions", value: 100 }],
    transactional: true,
  }, 5000);
  check("Set circle1 Divisions=100", setCircleDiv.ok, `(${setCircleDiv.data?.success ? "OK" : setCircleDiv.error})`);

  // Set attribCreate Vel attribute
  const setVel = await c.call("td_pars_set", {
    path: `${basePath}/attrib_createVel`,
    updates: [
      { name: "Name0", value: "Vel" },
      { name: "Type0", value: "Vector" },
    ],
    transactional: true,
  }, 5000);
  check("Set attribCreateVel Name=Vel, Type=Vector", setVel.ok, `(${setVel.data?.success ? "OK" : setVel.error})`);

  // ================================================================
  // STEP 11: Healthcheck the created network
  // ================================================================
  console.log("\n─── 11. Healthcheck ───\n");

  const health = await c.call("td_healthcheck", { path: basePath, recurse: true }, 8000);
  if (health.ok && health.data) {
    const issueCount = health.data.issueCount ?? health.data.operators?.filter(o => o.hasIssues)?.length ?? 0;
    check("Healthcheck", issueCount === 0, `(issues: ${issueCount})`);
    if (issueCount > 0 && health.data.operators) {
      for (const op of health.data.operators) {
        if (op.hasIssues) {
          console.log(`     ⚠️  ${op.path}: ${op.issues || "has issues"}`);
        }
      }
    }
  } else {
    check("Healthcheck", false, `(${health.error || "no data"})`);
  }

  // ================================================================
  // STEP 12: Get node detail to verify
  // ================================================================
  console.log("\n─── 12. Verify operators exist ───\n");

  const verifyOps = ["circle1", "attribute2", "attrib_createVel", "glsl1", "glsl1_compute", "feedback1", "null1"];
  for (const name of verifyOps) {
    const detail = await c.call("td_get_node_detail", { path: `${basePath}/${name}` }, 5000);
    check(`Verify ${name}`, detail.ok && detail.data, `(type: ${detail.data?.type || "?"})`);
  }

  // ================================================================
  // SUMMARY
  // ================================================================
  console.log("\n══════════════════════════════════════");
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log(`  Base path: ${basePath}`);
  console.log("══════════════════════════════════════\n");

  c.stop();
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((e) => {
  console.error(`Fatal: ${e.message}`);
  process.exit(1);
});
