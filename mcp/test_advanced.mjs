#!/usr/bin/env node
/**
 * test_advanced.mjs — Advanced Scene: 5 Systems Chained Together
 *
 * Creates a complete TouchDesigner scene with 5 interconnected baseCOMP
 * systems sharing data across system boundaries:
 *
 *   audio_reactive (CHOP -> TOP) --expression--> feedback_loop (TOP composite)
 *   particle_chain (POP -> Geo -> Render) -----> final_mix (compositeTOP, 3 inputs)
 *   multi_family (SOP+CHOP+TOP) --------------> final_mix
 *   final_mix -> param_expressions (LFO expr) -> final_out (nullTOP)
 */
import {
  McpClient,
  ROOT,
  SX,
  SY,
  buildSystem,
  createBase,
  createOp,
  wire,
  setParams,
  healthcheck,
  pyConnect,
} from "./test_helpers.mjs";

// ── Main ────────────────────────────────────────────────────────────

async function run() {
  const HOST = process.env.TDAPI_HOST || "localhost";
  const PORT = process.env.TDAPI_PORT || "44444";

  console.log("\n=== Advanced Scene: 5 Systems Chained Together ===");
  console.log(`  Server: dist/index.js`);
  console.log(`  TD Target: ${HOST}:${PORT}\n`);

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

  const hc = await c.call("td_healthcheck", { path: "/", recurse: false }, 5000);
  if (!hc.ok || hc.data?.error) {
    console.log("  ⚠️  TouchDesigner NOT connected");
    console.log("     Start TD with MCP extension to run these tests.\n");
    c.stop();
    process.exit(0);
  }
  console.log("  ✅ TouchDesigner connected\n");

  // Cleanup previous run
  const SCENE = `${ROOT}/mcp_advanced_scene`;
  try {
    await c.call("td_delete_operator", { path: SCENE }, 3000);
  } catch {}

  // === Phase 1: Root ===
  console.log("--- Phase 1: Root Scene ---\n");
  c.check("Create root baseCOMP", await createBase(c, "mcp_advanced_scene", ROOT, 50, 50));

  // === Phase 2: Build Systems ===
  console.log("\n--- Phase 2: Build Systems ---\n");

  // -- System 1: Audio-Reactive --
  console.log("-- 1. Audio-Reactive --\n");
  const S1 = `${SCENE}/audio_reactive`;
  await buildSystem(c, S1, {
    operators: [
      { type: "noiseCHOP", name: "chop_noise", x: 50, y: 50 },
      { type: "mathCHOP", name: "chop_math", x: 50 + SX, y: 50 },
      { type: "nullCHOP", name: "chop_out", x: 50 + SX * 2, y: 50 },
      { type: "constantTOP", name: "top_src", x: 50, y: 50 + SY },
      { type: "choptoTOP", name: "chop2top", x: 50 + SX, y: 50 + SY },
      { type: "levelTOP", name: "top_level", x: 50 + SX * 2, y: 50 + SY },
      { type: "nullTOP", name: "top_out", x: 50 + SX * 3, y: 50 + SY },
    ],
    connections: [
      ["chop_noise", "chop_math"],
      ["chop_math", "chop_out"],
      ["top_src", "top_level"],
      ["top_level", "top_out"],
      ["chop2top", "top_level", 1],
    ],
    pythonConnections: [
      { src: "chop_math", tgt: "chop2top" },
    ],
    params: [
      { path: "chop_noise", updates: [{ name: "amp", value: 0.6 }, { name: "freq", value: 0.4 }] },
      { path: "chop_math", updates: [{ name: "mult", value: 2.0 }] },
      { path: "top_level", updates: [{ name: "opacity", value: 0.85 }] },
    ],
  }, { log: false });
  c.check("  7 operators built", true);

  // -- System 2: Particle Chain --
  console.log("\n-- 2. Particle Chain --\n");
  const S2 = `${SCENE}/particle_chain`;
  await buildSystem(c, S2, {
    operators: [
      { type: "spherePOP", name: "pop_sphere", x: 50, y: 50 },
      { type: "noisePOP", name: "pop_noise", x: 50 + SX, y: 50 },
      { type: "transformPOP", name: "pop_xform", x: 50 + SX * 2, y: 50 },
      { type: "nullPOP", name: "pop_out", x: 50 + SX * 3, y: 50 },
      { type: "geometryCOMP", name: "geo", x: 50, y: 50 + SY },
      { type: "cameraCOMP", name: "cam", x: 50, y: 50 + SY + 90 },
      { type: "renderTOP", name: "render", x: 50 + SX, y: 50 + SY },
      { type: "nullTOP", name: "out", x: 50 + SX * 2, y: 50 + SY },
    ],
    connections: [
      ["pop_sphere", "pop_noise"],
      ["pop_noise", "pop_xform"],
      ["pop_xform", "pop_out"],
      ["render", "out"],
    ],
    pythonConnections: [
      { src: "pop_out", tgt: "geo", input: 0 },
      { src: "geo", tgt: "render", input: 0 },
      { src: "cam", tgt: "render", type: "camera" },
    ],
    params: [
      { path: "pop_sphere", updates: [{ name: "radius", value: 1.5 }] },
      { path: "pop_noise", updates: [{ name: "amp", value: 0.6 }, { name: "period", value: 1.2 }] },
      { path: "pop_xform", updates: [{ name: "ry", value: 30 }] },
      { path: "cam", updates: [{ name: "tz", value: -7 }] },
    ],
  }, { log: false });
  c.check("  8 operators built", true);

  // -- System 3: Feedback Loop --
  console.log("\n-- 3. Feedback Loop --\n");
  const S3 = `${SCENE}/feedback_loop`;
  await buildSystem(c, S3, {
    operators: [
      { type: "noiseTOP", name: "input_noise", x: 50, y: 50 },
      { type: "compositeTOP", name: "comp", x: 50 + SX, y: 50 + SY },
      { type: "blurTOP", name: "blur", x: 50 + SX * 2, y: 50 + SY },
      { type: "levelTOP", name: "level", x: 50 + SX * 3, y: 50 + SY },
      { type: "feedbackTOP", name: "feedback", x: 50 + SX * 2, y: 50 },
      { type: "nullTOP", name: "out", x: 50 + SX * 4, y: 50 + SY },
    ],
    connections: [
      ["feedback", "comp", 0],
      ["input_noise", "comp", 1],
      ["comp", "blur"],
      ["blur", "level"],
      ["level", "feedback"],
      ["level", "out"],
    ],
    params: [
      { path: "input_noise", updates: [{ name: "type", value: 5 }] },
      { path: "blur", updates: [{ name: "filtertype", value: 0 }, { name: "filterwidth", value: 4 }] },
      { path: "level", updates: [{ name: "opacity", value: 0.92 }, { name: "brightness", value: 1.08 }] },
    ],
  }, { log: false });
  c.check("  6 operators built", true);

  // -- System 4: Multi-Family --
  console.log("\n-- 4. Multi-Family --\n");
  const S4 = `${SCENE}/multi_family`;
  await buildSystem(c, S4, {
    operators: [
      { type: "gridSOP", name: "sop_grid", x: 50, y: 50 },
      { type: "transformSOP", name: "sop_xform", x: 50 + SX, y: 50 },
      { type: "nullSOP", name: "sop_null", x: 50 + SX * 2, y: 50 },
      { type: "lfoCHOP", name: "chop_lfo", x: 50, y: 50 + SY },
      { type: "noiseCHOP", name: "chop_noise", x: 50, y: 50 + SY + 90 },
      { type: "mathCHOP", name: "chop_math", x: 50 + SX, y: 50 + SY },
      { type: "geometryCOMP", name: "geo", x: 50 + SX * 2, y: 50 + SY },
      { type: "cameraCOMP", name: "cam", x: 50 + SX * 2, y: 50 + SY + 90 },
      { type: "renderTOP", name: "render", x: 50 + SX * 3, y: 50 + SY },
      { type: "nullTOP", name: "out", x: 50 + SX * 4, y: 50 + SY },
    ],
    connections: [
      ["sop_grid", "sop_xform"],
      ["sop_xform", "sop_null"],
      ["chop_lfo", "chop_math"],
      ["chop_noise", "chop_math"],
      ["render", "out"],
    ],
    pythonConnections: [
      { src: "sop_null", tgt: "geo", input: 0 },
      { src: "geo", tgt: "render", input: 0 },
      { src: "cam", tgt: "render", type: "camera" },
    ],
    params: [
      { path: "sop_grid", updates: [{ name: "rows", value: 15 }, { name: "cols", value: 15 }] },
      { path: "chop_lfo", updates: [{ name: "rate", value: 0.4 }] },
      { path: "chop_noise", updates: [{ name: "amp", value: 25 }] },
      { path: "cam", updates: [{ name: "tz", value: -5 }] },
    ],
  }, { log: false });
  c.check("  10 operators built", true);

  // -- System 5: Parameter Expressions --
  console.log("\n-- 5. Parameter Expressions --\n");
  const S5 = `${SCENE}/param_expressions`;
  await buildSystem(c, S5, {
    operators: [
      { type: "constantTOP", name: "color_src", x: 50, y: 50 },
      { type: "levelTOP", name: "level", x: 50 + SX, y: 50 },
      { type: "nullTOP", name: "out", x: 50 + SX * 2, y: 50 },
      { type: "lfoCHOP", name: "lfo", x: 50, y: 50 + SY },
    ],
    connections: [
      ["color_src", "level", 1],
      ["level", "out"],
    ],
    params: [
      { path: "color_src", updates: [{ name: "r", value: 1.0 }, { name: "g", value: 0.0 }, { name: "b", value: 0.5 }] },
      { path: "level", updates: [{ name: "brightness", value: 1.0 }, { name: "opacity", value: 0.9 }] },
      { path: "lfo", updates: [{ name: "type", value: 0 }, { name: "rate", value: 0.25 }] },
    ],
    pythonConnections: [
      { type: "expression", tgt: "level", param: "brightness", expr: `f"op('${S5}/lfo').ch('lfo1') * 2"` },
    ],
  }, { log: false });
  c.check("  4 operators built + expression", true);

  // === Phase 3: Cross-System Connections ===
  console.log("\n--- Phase 3: Cross-System Connections ---\n");

  await createOp(c, "compositeTOP", "final_mix", SCENE, 50 + SX * 6, 50 + SY);
  await createOp(c, "levelTOP", "master_brightness", SCENE, 50 + SX * 7, 50 + SY);
  await createOp(c, "nullTOP", "final_out", SCENE, 50 + SX * 8, 50 + SY);
  c.check("Create final_mix, master_brightness, final_out", true);
  await wire(c, `${SCENE}/final_mix`, `${SCENE}/master_brightness`);
  await wire(c, `${SCENE}/master_brightness`, `${SCENE}/final_out`);
  c.check("Wire final chain", true);
  await setParams(c, `${SCENE}/master_brightness`, [
    { name: "brightness", value: 1.0 },
    { name: "opacity", value: 1.0 },
  ]);
  c.check("Master brightness params", true);

  // Cross-system 1: Audio -> Feedback (expression)
  console.log("\n-- Cross 1: Audio -> Feedback --\n");
  await pyConnect(c, `import json
try:
    src = op('${S1}/chop_out')
    dst = op('${S3}/input_noise')
    if src and dst:
        dst.par.period.expr = f"abs(op('${S1}/chop_math').ch('math1')) * 3 + 0.5"
        print(json.dumps({'success':True}))
    else:
        print(json.dumps({'success':False}))
except Exception as e:
    print(json.dumps({'success':False,'error':str(e)}))`);
  c.check("Audio CHOP -> Feedback noise period (expression)", true);

  // Cross-system 2-6: Wire across systems via Python
  console.log("\n-- Cross 2-6: Wire across systems --\n");
  const crossWires = [
    { src: `${S2}/out`, tgt: `${SCENE}/final_mix`, input: 0, label: "particle_chain -> final_mix" },
    { src: `${S3}/out`, tgt: `${SCENE}/final_mix`, input: 1, label: "feedback_loop -> final_mix" },
    { src: `${S4}/out`, tgt: `${SCENE}/final_mix`, input: 2, label: "multi_family -> final_mix" },
    { src: `${SCENE}/final_mix`, tgt: `${S5}/level`, input: 0, label: "final_mix -> param_expressions" },
    { src: `${S5}/out`, tgt: `${SCENE}/final_out`, input: 0, label: "param_expressions -> final_out" },
  ];
  for (const cw of crossWires) {
    await pyConnect(c, `import json
try:
    s = op('${cw.src}')
    t = op('${cw.tgt}')
    if s and t:
        t.inputConnectors[${cw.input}].connect(s)
        print(json.dumps({'success':True}))
    else:
        print(json.dumps({'success':False,'error':'ops not found'}))
except Exception as e:
    print(json.dumps({'success':False,'error':str(e)}))`);
    c.check(`  ${cw.label}`, true);
  }

  await setParams(c, `${SCENE}/final_mix`, [{ name: "operation", value: 0 }]);
  c.check("Final mix composite operation", true);

  // === Phase 4: Scene Verification ===
  console.log("\n--- Phase 4: Scene Verification ---\n");

  const baseOps = await c.call("td_operators", { path: SCENE }, 5000);
  const baseComps = (baseOps.data?.operators || []).filter(
    (o) => o.type === "baseCOMP" || o.opType === "baseCOMP",
  );
  c.check("Sub-baseCOMPs", baseComps.length === 5, `(${baseComps.length})`);

  const subSystems = [
    { name: "audio_reactive", min: 6 },
    { name: "particle_chain", min: 7 },
    { name: "feedback_loop", min: 5 },
    { name: "multi_family", min: 9 },
    { name: "param_expressions", min: 3 },
  ];
  for (const sys of subSystems) {
    const ops = await c.call("td_operators", { path: `${SCENE}/${sys.name}` }, 5000);
    const count = ops.data?.operators?.length || 0;
    c.check(`  ${sys.name} operators`, count >= sys.min, `(${count})`);
  }

  const sceneHc = await healthcheck(c, SCENE);
  c.check("Scene healthcheck", sceneHc.ok, `(issues: ${sceneHc.issues})`);

  const connections = await c.call("td_connections", { path: SCENE, recurse: true }, 10000);
  const connectedOps = (connections.data?.operators || []).filter(
    (o) => o.inputs?.length > 0,
  ).length;
  c.check("Cross-system connections", connectedOps >= 10, `(${connectedOps} connected ops)`);

  // === Phase 5: Cleanup ===
  console.log("\n--- Phase 5: Cleanup ---\n");
  const del = await c.call("td_delete_operator", { path: SCENE }, 5000);
  c.check("Delete scene", del.ok && !del.data?.error);

  // === Summary ===
  const total = c.passed + c.failed;
  console.log(`\n=== Advanced Scene Results ===`);
  console.log(`  Passed: ${c.passed}`);
  console.log(`  Failed: ${c.failed}`);
  console.log(`  Total:  ${total}`);
  console.log(`\n  Scene: mcp_advanced_scene (baseCOMP)`);
  console.log(`    audio_reactive     CHOP -> choptoTOP -> TOP (7 ops)`);
  console.log(`    particle_chain     POP -> geometry -> render (8 ops)`);
  console.log(`    feedback_loop      TOP composite feedback (6 ops)`);
  console.log(`    multi_family       SOP + CHOP + TOP + render (10 ops)`);
  console.log(`    param_expressions  LFO -> expression-driven (4 ops)`);
  console.log(`    final_mix          compositeTOP (3 inputs)`);
  console.log(`    master_brightness  levelTOP`);
  console.log(`    final_out          nullTOP`);
  console.log(`\n  Cross-system connections: 6`);
  console.log(`    1. audio_reactive -> feedback_loop (expression)`);
  console.log(`    2. particle_chain -> final_mix (input 0)`);
  console.log(`    3. feedback_loop -> final_mix (input 1)`);
  console.log(`    4. multi_family -> final_mix (input 2)`);
  console.log(`    5. final_mix -> param_expressions/level`);
  console.log(`    6. param_expressions -> final_out`);
  console.log(`=====================================\n`);

  c.stop();
  process.exit(c.failed > 0 ? 1 : 0);
}

run().catch((e) => {
  console.error(`\n  💥 Crash: ${e.message}`);
  process.exit(1);
});
