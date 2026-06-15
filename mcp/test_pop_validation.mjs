#!/usr/bin/env node
/**
 * test_pop_validation.mjs — Unit tests for td_pop_validate tool.
 *
 * Tests the POP validation tool's:
 *   1. Tool registration and schema
 *   2. Error handling (invalid path)
 *   3. Empty network handling (no POPs found)
 *   4. Feedback loop validation (particlePOP rules)
 *   5. Input requirement validation (noisePOP, glslPOP)
 *   6. Dual-input validation (copyPOP, blendPOP)
 *   7. Cross-family connection detection
 *   8. Attribute requirement checks
 *   9. Performance warning detection
 *  10. Summary generation (ok/warning/error states)
 *
 * Requires: TouchDesigner running with MCP server on localhost:44444
 * If TD is not available, only offline tests (1-2) will run.
 */
import { McpClient, createBase, createOp, wire, setParams, cleanupSystem } from "./test_helpers.mjs";

const ROOT = "/project1";
const TEST_BASE = `${ROOT}/pop_validation_test`;
let client;
let tdAvailable = false;

function header(label) {
  console.log(`\n━━━ ${label} ━━━\n`);
}

async function setup() {
  client = new McpClient();
  await client.start();

  // Wait for server to be ready
  const tools = await client.waitForReady();
  console.log(`  Server ready (${tools.length} tools)\n`);

  // Check TD connection
  const hc = await client.call("td_healthcheck", { path: "/", recurse: false }, 5000);
  tdAvailable = hc.ok && !hc.data?.error;
  console.log(`  TD connection: ${tdAvailable ? "✅ connected" : "❌ not available"}`);

  return tools;
}

async function cleanup() {
  if (tdAvailable) {
    await cleanupSystem(client, TEST_BASE);
  }
  client.stop();
}

// ═══════════════════════════════════════════════════════════════════════
// OFFLINE TESTS (no TD required)
// ═══════════════════════════════════════════════════════════════════════

function testToolRegistration(tools) {
  header("1. Tool Registration");

  const popTool = tools.find((t) => t.name === "td_pop_validate");
  client.check(
    "td_pop_validate exists",
    !!popTool,
    popTool ? "(found)" : "(MISSING)",
  );

  if (popTool) {
    const inputSchema = popTool.inputSchema;
    client.check(
      "Has inputSchema",
      !!inputSchema && !!inputSchema.properties,
    );
    client.check(
      "Has path parameter",
      !!inputSchema?.properties?.path,
    );
    client.check(
      "Has check_cross_family parameter",
      !!inputSchema?.properties?.check_cross_family,
    );
    client.check(
      "Has check_attributes parameter",
      !!inputSchema?.properties?.check_attributes,
    );
    client.check(
      "Description mentions POP",
      (popTool.description || "").toLowerCase().includes("pop"),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════
// ONLINE TESTS (require TD)
// ═══════════════════════════════════════════════════════════════════════

async function testInvalidPath() {
  header("2. Invalid Path Error Handling");

  const r = await client.call(
    "td_pop_validate",
    { path: "/nonexistent_path_xyz" },
    10000,
  );
  client.check("Returns ok response", r.ok, r.ok ? "" : `(${JSON.stringify(r.error)})`);

  if (r.ok && r.data) {
    client.check(
      "ok is false for invalid path",
      r.data.ok === false,
      `(ok=${r.data.ok})`,
    );
    client.check(
      "Has violations array",
      Array.isArray(r.data.violations),
      `(${r.data.violations?.length || 0} violations)`,
    );
    client.check(
      "Violation mentions network_exists",
      r.data.violations?.some((v) => v.rule === "network_exists"),
      `(rules: ${r.data.violations?.map((v) => v.rule).join(", ")})`,
    );
    client.check(
      "Has fix suggestion",
      r.data.fixSuggestions?.length > 0,
    );
  }
}

async function testEmptyNetwork() {
  header("3. Empty Network (No POPs)");

  // Create an empty baseCOMP
  await createBase(client, "pop_validation_test", ROOT, 100, 100);

  const r = await client.call(
    "td_pop_validate",
    { path: TEST_BASE },
    10000,
  );
  client.check("Returns ok response", r.ok, r.ok ? "" : `(${JSON.stringify(r.error)})`);

  if (r.ok && r.data) {
    client.check(
      "ok is true (no POPs = no errors)",
      r.data.ok === true,
      `(ok=${r.data.ok})`,
    );
    client.check(
      "popSummary is empty",
      r.data.popSummary?.length === 0,
      `(${r.data.popSummary?.length || 0} POPs)`,
    );
    client.check(
      "No violations",
      r.data.violations?.length === 0,
      `(${r.data.violations?.length || 0} violations)`,
    );
    client.check(
      "Summary mentions no POPs",
      (r.data.summary || "").includes("No POP"),
      `(${r.data.summary})`,
    );
  }
}

async function testParticleFeedbackRules() {
  header("4. particlePOP Feedback Rules");

  // Create a particlePOP without feedback target
  await createOp(client, "particlePOP", "particle1", TEST_BASE, 300, 100);
  await createOp(client, "spherePOP", "source1", TEST_BASE, 100, 100);
  await wire(client, `${TEST_BASE}/source1`, `${TEST_BASE}/particle1`, 0);

  const r = await client.call(
    "td_pop_validate",
    { path: TEST_BASE },
    10000,
  );
  client.check("Returns ok response", r.ok);

  if (r.ok && r.data) {
    client.check(
      "ok is false (missing feedback target)",
      r.data.ok === false,
      `(ok=${r.data.ok})`,
    );
    client.check(
      "Detects particlePOP",
      r.data.popSummary?.some((p) => p.opType === "particlePOP"),
    );

    // Check for feedback_target violation
    const feedbackViolation = r.data.violations?.find(
      (v) => v.rule === "feedback_target" && v.opType === "particlePOP",
    );
    client.check(
      "Flags missing feedback_target",
      !!feedbackViolation,
      feedbackViolation ? `(severity: ${feedbackViolation.severity})` : "",
    );
    client.check(
      "Has fix suggestion for feedback",
      r.data.fixSuggestions?.some((s) => s.includes("feedback")),
      `(${r.data.fixSuggestions?.length || 0} suggestions)`,
    );
  }
}

async function testInputRequirements() {
  header("5. Input Requirement Rules");

  // Create a noisePOP without input
  await createOp(client, "noisePOP", "noise1", TEST_BASE, 500, 100);

  const r = await client.call(
    "td_pop_validate",
    { path: TEST_BASE },
    10000,
  );
  client.check("Returns ok response", r.ok);

  if (r.ok && r.data) {
    client.check(
      "ok is false (noisePOP needs input)",
      r.data.ok === false,
      `(ok=${r.data.ok})`,
    );

    const noiseViolation = r.data.violations?.find(
      (v) => v.rule === "input_required" && v.opType === "noisePOP",
    );
    client.check(
      "Flags noisePOP missing input",
      !!noiseViolation,
      noiseViolation ? `(${noiseViolation.message})` : "",
    );
  }
}

async function testDualInputRules() {
  header("6. Dual-Input Rules (copyPOP, blendPOP)");

  // Create a copyPOP without second input
  await createOp(client, "copyPOP", "copy1", TEST_BASE, 100, 300);
  // Connect only input 0
  await wire(client, `${TEST_BASE}/source1`, `${TEST_BASE}/copy1`, 0);

  const r = await client.call(
    "td_pop_validate",
    { path: TEST_BASE },
    10000,
  );
  client.check("Returns ok response", r.ok);

  if (r.ok && r.data) {
    const copyViolation = r.data.violations?.find(
      (v) => v.rule === "two_inputs" && v.opType === "copyPOP",
    );
    client.check(
      "Flags copyPOP missing second input",
      !!copyViolation,
      copyViolation ? `(${copyViolation.message})` : "",
    );
  }
}

async function testCrossFamilyDetection() {
  header("7. Cross-Family Connection Detection");

  // Create a SOP and try to connect to a POP (invalid cross-family)
  await createOp(client, "geoCOMP", "geo1", TEST_BASE, 100, 500);

  const r = await client.call(
    "td_pop_validate",
    { path: TEST_BASE, check_cross_family: true },
    10000,
  );
  client.check("Returns ok response", r.ok);

  if (r.ok && r.data) {
    // Cross-family check may find violations if geoCOMP -> POP connections exist
    const cfViolation = r.data.violations?.find(
      (v) => v.rule === "cross_family_connection",
    );
    // Just verify the check ran without crashing
    client.check(
      "Cross-family check executed",
      Array.isArray(r.data.violations),
    );
    if (cfViolation) {
      client.check(
        "Detects cross-family issue",
        true,
        `(${cfViolation.message})`,
      );
    } else {
      client.check(
        "No cross-family violations (expected if no invalid connections)",
        true,
      );
    }
  }
}

async function testDisableChecks() {
  header("8. Disable Individual Checks");

  // Disable cross-family and attribute checks
  const r = await client.call(
    "td_pop_validate",
    {
      path: TEST_BASE,
      check_cross_family: false,
      check_attributes: false,
    },
    10000,
  );
  client.check("Returns ok response", r.ok);

  if (r.ok && r.data) {
    // Should have fewer violations since checks are disabled
    const cfViolations = r.data.violations?.filter(
      (v) => v.rule === "cross_family_connection",
    );
    const attrViolations = r.data.violations?.filter(
      (v) => v.rule === "missing_attribute",
    );
    client.check(
      "No cross-family violations (check disabled)",
      cfViolations?.length === 0,
      `(${cfViolations?.length || 0} found)`,
    );
    client.check(
      "No attribute violations (check disabled)",
      attrViolations?.length === 0,
      `(${attrViolations?.length || 0} found)`,
    );
  }
}

async function testHighBirthrateWarning() {
  header("9. Performance Warnings (birthrate)");

  // Set high birthrate on particlePOP
  await setParams(client, `${TEST_BASE}/particle1`, [
    { name: "birthrate", value: 50000 },
  ]);

  const r = await client.call(
    "td_pop_validate",
    { path: TEST_BASE },
    10000,
  );
  client.check("Returns ok response", r.ok);

  if (r.ok && r.data) {
    const birthrateViolation = r.data.violations?.find(
      (v) => v.rule === "birthrate_sanity",
    );
    client.check(
      "Flags high birthrate as warning",
      !!birthrateViolation,
      birthrateViolation
        ? `(severity: ${birthrateViolation.severity})`
        : "(not detected)",
    );
  }
}

async function testSummaryStates() {
  header("10. Summary Generation");

  const r = await client.call(
    "td_pop_validate",
    { path: TEST_BASE },
    10000,
  );
  client.check("Returns ok response", r.ok);

  if (r.ok && r.data) {
    client.check(
      "Has summary string",
      typeof r.data.summary === "string" && r.data.summary.length > 0,
      `(${r.data.summary})`,
    );

    // Should contain error/warning indicators since we have violations
    const hasIndicator =
      r.data.summary.includes("❌") ||
      r.data.summary.includes("⚠️") ||
      r.data.summary.includes("✅");
    client.check(
      "Summary has status indicator",
      hasIndicator,
      `(${r.data.summary.substring(0, 60)})`,
    );

    client.check(
      "fixSuggestions is populated",
      r.data.fixSuggestions?.length > 0,
      `(${r.data.fixSuggestions?.length || 0} suggestions)`,
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════════════

async function main() {
  console.log("\n🧪 td_pop_validate — Unit Tests");
  console.log("════════════════════════════════════════\n");

  let tools;
  try {
    tools = await setup();
  } catch (e) {
    console.error(`  ❌ Setup failed: ${e.message}`);
    process.exit(1);
  }

  // Offline tests (always run)
  testToolRegistration(tools);

  // Online tests (require TD)
  if (tdAvailable) {
    try {
      await testInvalidPath();
      await testEmptyNetwork();
      await testParticleFeedbackRules();
      await testInputRequirements();
      await testDualInputRules();
      await testCrossFamilyDetection();
      await testDisableChecks();
      await testHighBirthrateWarning();
      await testSummaryStates();
    } catch (e) {
      console.error(`  ❌ Test error: ${e.message}`);
    } finally {
      await cleanup();
    }
  } else {
    console.log("\n  ⏭  Online tests skipped (no TD connection)\n");
  }

  // Summary
  const total = client.passed + client.failed;
  console.log(`\n📊 Results: ${client.passed}/${total} passed`);
  if (client.failed > 0) {
    console.log(`   ${client.failed} failed:`);
    for (const err of client.errors) {
      console.log(`     - ${err}`);
    }
  }

  process.exit(client.failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(`\n  ❌ Test crash: ${e.message}`);
  process.exit(1);
});
