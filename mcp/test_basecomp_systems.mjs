#!/usr/bin/env node
/**
 * test_basecomp_systems.mjs — Base COMP Node System Builder
 *
 * Creates and verifies complex node systems inside a baseCOMP:
 *   1. Audio-Reactive System (CHOP → TOP pipeline)
 *   2. Particle System (POP chain + render)
 *   3. Feedback Loop System (TOP feedback chain)
 *   4. Multi-Family System (CHOPs + TOPs + SOPs connected)
 *   5. Parameter Expression System (cross-operator expressions)
 *
 * Each system is created inside its own baseCOMP, verified with
 * healthcheck/connections, then cleaned up.
 */
import {
  McpClient,
  ROOT,
  SX,
  SY,
  buildSystem,
  verifySystem,
  cleanupSystem,
} from "./test_helpers.mjs";

// ── Main ────────────────────────────────────────────────────────────

async function run() {
  const HOST = process.env.TDAPI_HOST || "localhost";
  const PORT = process.env.TDAPI_PORT || "44444";

  console.log("\n🧊 Base COMP Node System Builder");
  console.log("═══════════════════════════════════════════════════");
  console.log(`  Server: dist/index.js`);
  console.log(`  TD Target: ${HOST}:${PORT}`);
  console.log("═══════════════════════════════════════════════════\n");

  const c = new McpClient();

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
    console.log("  ⚠️  TouchDesigner NOT connected. Online tests skipped.");
    console.log("     Start TD with MCP extension to run these tests.\n");
    c.stop();
    process.exit(0);
  }
  console.log("  ✅ TouchDesigner connected\n");

  // Cleanup any leftover test systems
  const systems = [
    "sys_audio_reactive",
    "sys_particle_chain",
    "sys_feedback_loop",
    "sys_multi_family",
    "sys_param_expressions",
  ];
  for (const s of systems) {
    try {
      await c.call("td_delete_operator", { path: `${ROOT}/${s}` }, 3000);
    } catch {}
  }

  // ══════════════════════════════════════════════════════════════════
  // System 1: Audio-Reactive (CHOP → TOP)
  // ══════════════════════════════════════════════════════════════════
  console.log("━━━ System 1: Audio-Reactive Pipeline ━━━\n");
  console.log("  CHOP chain: noiseCHOP → mathCHOP → nullCHOP");
  console.log("  TOP chain:  constantTOP → levelTOP → nullTOP");
  console.log("  Cross:      mathCHOP → choptoTOP → levelTOP\n");

  const BASE_AR = `${ROOT}/sys_audio_reactive`;
  await buildSystem(c, BASE_AR, {
    operators: [
      // CHOP chain
      { type: "noiseCHOP", name: "chop_noise", x: 50, y: 50 },
      { type: "mathCHOP", name: "chop_math", x: 50 + SX, y: 50 },
      { type: "nullCHOP", name: "chop_null", x: 50 + SX * 2, y: 50 },
      // TOP chain
      { type: "constantTOP", name: "top_src", x: 50, y: 50 + SY },
      { type: "choptoTOP", name: "chop2top", x: 50 + SX, y: 50 },
      { type: "levelTOP", name: "top_level", x: 50 + SX * 2, y: 50 + SY },
      { type: "nullTOP", name: "top_out", x: 50 + SX * 3, y: 50 + SY },
    ],
    connections: [
      ["chop_noise", "chop_math"],
      ["chop_math", "chop_null"],
      ["top_src", "top_level"],
      ["top_level", "top_out"],
      // choptoTOP → levelTOP (same-family TOP→TOP)
      ["chop2top", "top_level"],
    ],
    pythonConnections: [
      { src: "chop_math", tgt: "chop2top" },
    ],
    params: [
      { path: "chop_noise", updates: [{ name: "amp", value: 0.5 }, { name: "freq", value: 0.3 }] },
      { path: "chop_math", updates: [{ name: "mult", value: 1.5 }] },
      { path: "top_level", updates: [{ name: "opacity", value: 0.8 }] },
    ],
  });

  await verifySystem(c, BASE_AR, 6);

  // ══════════════════════════════════════════════════════════════════
  // System 2: Particle Chain (POP → Geometry → Render)
  // ══════════════════════════════════════════════════════════════════
  console.log("\n━━━ System 2: Particle Chain ━━━\n");
  console.log("  POP chain: spherePOP → noisePOP → transformPOP → nullPOP");
  console.log("  Render:    geometryCOMP → renderTOP → nullTOP");
  console.log("  Camera:    cameraCOMP -> renderTOP (parameter, not wire)\n");

  const BASE_PC = `${ROOT}/sys_particle_chain`;
  await buildSystem(c, BASE_PC, {
    operators: [
      // POP chain
      { type: "spherePOP", name: "pop_sphere", x: 50, y: 50 },
      { type: "noisePOP", name: "pop_noise", x: 50 + SX, y: 50 },
      { type: "transformPOP", name: "pop_xform", x: 50 + SX * 2, y: 50 },
      { type: "nullPOP", name: "pop_out", x: 50 + SX * 3, y: 50 },
      // Render pipeline
      { type: "geometryCOMP", name: "geo", x: 50, y: 50 + SY },
      { type: "cameraCOMP", name: "cam", x: 50, y: 50 + SY + 90 },
      { type: "renderTOP", name: "render", x: 50 + SX, y: 50 + SY },
      { type: "nullTOP", name: "out", x: 50 + SX * 2, y: 50 + SY },
    ],
    connections: [
      // POP chain
      ["pop_sphere", "pop_noise"],
      ["pop_noise", "pop_xform"],
      ["pop_xform", "pop_out"],
      // render → out
      ["render", "out"],
    ],
    pythonConnections: [
      { src: "pop_out", tgt: "geo", input: 0 },
      { src: "geo", tgt: "render", input: 0 },
      { src: "cam", tgt: "render", type: "camera" },
    ],
    params: [
      { path: "pop_sphere", updates: [{ name: "radius", value: 2 }] },
      { path: "pop_noise", updates: [{ name: "amp", value: 0.8 }, { name: "period", value: 1.0 }] },
      { path: "pop_xform", updates: [{ name: "ry", value: 45 }] },
      { path: "cam", updates: [{ name: "tz", value: -8 }] },
    ],
  });

  await verifySystem(c, BASE_PC, 8);

  // ══════════════════════════════════════════════════════════════════
  // System 3: Feedback Loop (TOP feedback chain)
  // ══════════════════════════════════════════════════════════════════
  console.log("\n━━━ System 3: Feedback Loop ━━━\n");
  console.log("  TOP chain: compositeTOP → blurTOP → levelTOP → feedbackTOP");
  console.log("  Input:     noiseTOP → compositeTOP (input 1)");
  console.log("  Output:    feedbackTOP → nullTOP\n");

  const BASE_FL = `${ROOT}/sys_feedback_loop`;
  await buildSystem(c, BASE_FL, {
    operators: [
      { type: "noiseTOP", name: "input_noise", x: 50, y: 50 },
      { type: "compositeTOP", name: "comp", x: 50 + SX, y: 50 + SY },
      { type: "blurTOP", name: "blur", x: 50 + SX * 2, y: 50 + SY },
      { type: "levelTOP", name: "level", x: 50 + SX * 3, y: 50 + SY },
      { type: "feedbackTOP", name: "feedback", x: 50 + SX * 2, y: 50 },
      { type: "nullTOP", name: "out", x: 50 + SX * 4, y: 50 + SY },
    ],
    connections: [
      // Feedback → composite (input 0 = feedback)
      ["feedback", "comp", 0],
      // noise → composite (input 1 = overlay)
      ["input_noise", "comp", 1],
      // Main chain
      ["comp", "blur"],
      ["blur", "level"],
      ["level", "feedback"],
      ["level", "out"],
    ],
    params: [
      { path: "input_noise", updates: [{ name: "type", value: 5 }] },
      { path: "blur", updates: [{ name: "filtertype", value: 0 }, { name: "filterwidth", value: 5 }] },
      { path: "level", updates: [{ name: "opacity", value: 0.95 }, { name: "brightness", value: 1.05 }] },
    ],
  });

  await verifySystem(c, BASE_FL, 6);

  // ══════════════════════════════════════════════════════════════════
  // System 4: Multi-Family (CHOPs + TOPs + SOPs)
  // ══════════════════════════════════════════════════════════════════
  console.log("\n━━━ System 4: Multi-Family System ━━━\n");
  console.log("  SOP: gridSOP → transformSOP → nullSOP → geometryCOMP");
  console.log("  CHOP: lfoCHOP + noiseCHOP → mathCHOP");
  console.log("  TOP: renderTOP → nullTOP");
  console.log("  Cross-family: SOP->geo, geo->render, cam->render\n");

  const BASE_MF = `${ROOT}/sys_multi_family`;
  await buildSystem(c, BASE_MF, {
    operators: [
      // SOP chain
      { type: "gridSOP", name: "sop_grid", x: 50, y: 50 },
      { type: "transformSOP", name: "sop_xform", x: 50 + SX, y: 50 },
      { type: "nullSOP", name: "sop_null", x: 50 + SX * 2, y: 50 },
      // CHOP chain
      { type: "lfoCHOP", name: "chop_lfo", x: 50, y: 50 + SY },
      { type: "noiseCHOP", name: "chop_noise", x: 50, y: 50 + SY + 90 },
      { type: "mathCHOP", name: "chop_math", x: 50 + SX, y: 50 + SY },
      // Render
      { type: "geometryCOMP", name: "geo", x: 50 + SX * 2, y: 50 + SY },
      { type: "cameraCOMP", name: "cam", x: 50 + SX * 2, y: 50 + SY + 90 },
      { type: "renderTOP", name: "render", x: 50 + SX * 3, y: 50 + SY },
      { type: "nullTOP", name: "out", x: 50 + SX * 4, y: 50 + SY },
    ],
    connections: [
      // SOP chain
      ["sop_grid", "sop_xform"],
      ["sop_xform", "sop_null"],
      // CHOP chain
      ["chop_lfo", "chop_math"],
      ["chop_noise", "chop_math"],
      // Render
      ["render", "out"],
    ],
    pythonConnections: [
      { src: "sop_null", tgt: "geo", input: 0 },
      { src: "geo", tgt: "render", input: 0 },
      { src: "cam", tgt: "render", type: "camera" },
    ],
    params: [
      { path: "sop_grid", updates: [{ name: "rows", value: 20 }, { name: "cols", value: 20 }] },
      { path: "chop_lfo", updates: [{ name: "rate", value: 0.5 }] },
      { path: "chop_noise", updates: [{ name: "amp", value: 30 }] },
      { path: "cam", updates: [{ name: "tz", value: -6 }] },
    ],
  });

  await verifySystem(c, BASE_MF, 10);

  // ══════════════════════════════════════════════════════════════════
  // System 5: Parameter Expressions (cross-operator expressions)
  // ══════════════════════════════════════════════════════════════════
  console.log("\n━━━ System 5: Parameter Expressions ━━━\n");
  console.log("  constantTOP with expression-driven parameters");
  console.log("  CHOP export driving TOP parameters\n");

  const BASE_PE = `${ROOT}/sys_param_expressions`;
  await buildSystem(c, BASE_PE, {
    operators: [
      { type: "constantTOP", name: "color_src", x: 50, y: 50 },
      { type: "levelTOP", name: "level", x: 50 + SX, y: 50 },
      { type: "nullTOP", name: "out", x: 50 + SX * 2, y: 50 },
      { type: "lfoCHOP", name: "lfo", x: 50, y: 50 + SY },
    ],
    connections: [
      ["color_src", "level"],
      ["level", "out"],
    ],
    pythonConnections: [
      { type: "expression", tgt: "level", param: "brightness", expr: `f"op('${BASE_PE}/lfo').ch('lfo1') * 2"` },
    ],
    params: [
      { path: "color_src", updates: [
        { name: "r", value: 1.0 },
        { name: "g", value: 0.0 },
        { name: "b", value: 0.5 },
      ]},
      { path: "level", updates: [
        { name: "brightness", value: 1.2 },
        { name: "opacity", value: 0.9 },
      ]},
      { path: "lfo", updates: [
        { name: "type", value: 0 }, // sine
        { name: "rate", value: 0.3 },
      ]},
    ],
  });

  await verifySystem(c, BASE_PE, 4);

  // ══════════════════════════════════════════════════════════════════
  // Summary
  // ══════════════════════════════════════════════════════════════════

  // Final overview: list all test systems
  console.log("\n━━━ Final Overview ━━━\n");
  try {
    const allOps = await c.call("td_operators", { path: ROOT }, 5000);
    const sysOps = (allOps.data?.operators || []).filter(
      (o) => systems.some((s) => o.name === s),
    );
    c.check("All 5 baseCOMPs exist", sysOps.length === 5, `(${sysOps.length})`);
  } catch (e) {
    c.check("Final overview", false, `(${e.message})`);
  }

  // Cleanup all systems
  console.log("\n━━━ Cleanup ━━━\n");
  for (const s of systems) {
    await cleanupSystem(c, `${ROOT}/${s}`);
  }

  // Summary
  const total = c.passed + c.failed;
  console.log(`\n═══════════════════════════════════════════════════`);
  console.log(`  📊 Base COMP Systems Results`);
  console.log(`     ✅ Passed: ${c.passed}`);
  console.log(`     ❌ Failed: ${c.failed}`);
  console.log(`     📋 Total:  ${total}`);
  console.log(`\n  Systems created:`);
  console.log(`    1. Audio-Reactive (CHOP → TOP)`);
  console.log(`    2. Particle Chain (POP → Geometry → Render)`);
  console.log(`    3. Feedback Loop (TOP composite chain)`);
  console.log(`    4. Multi-Family (SOP + CHOP + TOP + COMP)`);
  console.log(`    5. Parameter Expressions (cross-operator)`);
  console.log(`═══════════════════════════════════════════════════\n`);

  c.stop();
  process.exit(c.failed > 0 ? 1 : 0);
}

run().catch((e) => {
  console.error(`\n  💥 Crash: ${e.message}`);
  process.exit(1);
});
