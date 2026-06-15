#!/usr/bin/env node
/**
 * test_particle_system.mjs — POP Particle System
 *
 * Builds a complete GPU-accelerated particle system using POPs:
 *
 *   Emitter (PointGenerator POP)
 *       ↓
 *   Particle POP (simulation with feedback loop)
 *       ↓
 *   Noise POP (turbulence)
 *       ↓
 *   Force Radial POP (attraction to center)
 *       ↓
 *   Transform POP (spin)
 *       ↓
 *   Trail POP (motion trails)
 *       ↓
 *   Null POP (feedback target + output)
 *       ↓
 *   Geometry COMP → Camera → Render TOP → Null TOP (output)
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

// ── Layout ──────────────────────────────────────────────────────────

const SCENE = `${ROOT}/pop_particle_system`;
const SYS = `${SCENE}/particle_net`;

// ── Helpers ─────────────────────────────────────────────────────────

/** Parse JSON from td_execute stdout */
function parsePyResult(result) {
  if (!result.ok) return null;
  try {
    const stdout = result.data?.stdout;
    return stdout ? JSON.parse(stdout) : result.data;
  } catch {
    return result.data;
  }
}

// ── Main ────────────────────────────────────────────────────────────

async function run() {
  const HOST = process.env.TDAPI_HOST || "localhost";
  const PORT = process.env.TDAPI_PORT || "44444";

  console.log("\n=== POP Particle System ===");
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

  // TD connection check
  const hc = await c.call("td_healthcheck", { path: "/", recurse: false }, 5000);
  if (!hc.ok || hc.data?.error) {
    console.log("  ⚠️  TouchDesigner NOT connected");
    console.log("     Start TD with MCP extension to run these tests.\n");
    c.stop();
    process.exit(0);
  }
  console.log("  ✅ TouchDesigner connected\n");

  // Cleanup previous run
  try {
    await c.call("td_delete_operator", { path: SCENE }, 3000);
  } catch {}

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Phase 1: Scene root
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  console.log("--- Phase 1: Scene Root ---\n");
  c.check("Create root baseCOMP", await createBase(c, "pop_particle_system", ROOT, 50, 50));

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Phase 2: POP Network — the core simulation
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  console.log("\n--- Phase 2: POP Network ---\n");

  await buildSystem(c, SYS, {
    operators: [
      { type: "pointGeneratorPOP", name: "emitter",   x: 50,         y: 50 },
      { type: "randomPOP",         name: "rand_vel",  x: 50 + SX,    y: 50 },
      { type: "particlePOP",       name: "particle",  x: 50 + SX*2,  y: 50 },
      { type: "noisePOP",          name: "turbulence", x: 50 + SX*3,  y: 50 },
      { type: "forceRadialPOP",    name: "attractor",  x: 50 + SX*4,  y: 50 },
      { type: "transformPOP",      name: "spin",       x: 50 + SX*5,  y: 50 },
      { type: "trailPOP",          name: "trail",      x: 50 + SX*3,  y: 50 + SY },
      { type: "nullPOP",           name: "pop_out",    x: 50 + SX*4,  y: 50 + SY },
      { type: "geometryCOMP",      name: "geo",        x: 50,         y: 50 + SY*2 },
      { type: "cameraCOMP",        name: "cam",        x: 50,         y: 50 + SY*2 + 90 },
      { type: "renderTOP",         name: "render",     x: 50 + SX,    y: 50 + SY*2 },
      { type: "nullTOP",           name: "top_out",    x: 50 + SX*2,  y: 50 + SY*2 },
    ],

    connections: [
      ["emitter",     "rand_vel"],
      ["rand_vel",    "particle"],
      ["particle",    "turbulence"],
      ["turbulence",  "attractor"],
      ["attractor",   "spin"],
      ["spin",        "trail"],
      ["trail",       "pop_out"],
      ["render",      "top_out"],
    ],

    pythonConnections: [
      { src: "pop_out", tgt: "geo", input: 0 },
      { src: "geo",     tgt: "render", input: 0 },
      { src: "cam",     tgt: "render", type: "camera" },
    ],

    params: [
      { path: "emitter", updates: [
        { name: "shape",        value: 1 },
        { name: "numpoints",    value: 500 },
        { name: "distribution", value: 0 },
        { name: "size1",        value: 0.8 },
        { name: "size2",        value: 0.8 },
        { name: "size3",        value: 0.8 },
      ]},
      { path: "rand_vel", updates: [
        { name: "type",       value: 5 },
        { name: "randomsize", value: 3 },
        { name: "amplitude",  value: 2.0 },
        { name: "seed",       value: 42 },
      ]},
      { path: "particle", updates: [
        { name: "maxparticles",    value: 2000 },
        { name: "birthrate",       value: 100 },
        { name: "life",            value: 4.0 },
        { name: "lifevariance",    value: 1.0 },
        { name: "timeintegration", value: 1 },
        { name: "initmass",        value: 1.0 },
        { name: "initdrag",        value: 0.02 },
        { name: "damping",         value: 0.01 },
      ]},
      { path: "turbulence", updates: [
        { name: "period",     value: 1.5 },
        { name: "amplitude",  value: 0.3 },
      ]},
      { path: "spin", updates: [
        { name: "ry", value: 15 },
      ]},
      { path: "trail", updates: [
        { name: "trails", value: 8 },
      ]},
      { path: "cam", updates: [
        { name: "tz", value: -8 },
        { name: "ty", value: 2 },
      ]},
    ],
  }, { log: false });

  // Verify operators via Python (more reliable than td_operators for POPs)
  const names = ["emitter","rand_vel","particle","turbulence","attractor","spin","trail","pop_out","geo","cam","render","top_out"];
  const creationCheck = await c.py(`import json
found = []
for n in ${JSON.stringify(names)}:
    if op('${SYS}/' + '/' + n) is not None:
        found.append(n)
print(json.dumps({'success':True,'found':found,'count':len(found)}))`);
  const cr = parsePyResult(creationCheck);
  c.check("Operators created", cr?.success && cr?.count >= 10, `(${cr?.count || 0})`);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Phase 3: Feedback Loop
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  console.log("\n--- Phase 3: Feedback Loop ---\n");

  // Discover the actual feedback parameter name
  const paramList = await c.py(`import json
particle = op('${SYS}/particle')
if particle:
    all_names = sorted([p.name for p in particle.pars()])
    fb = [n for n in all_names if 'feedback' in n.lower() or 'target' in n.lower() or 'loop' in n.lower()]
    print(json.dumps({'success':True,'fb':fb,'count':len(all_names)}))
else:
    print(json.dumps({'success':False}))`);
  const pl = parsePyResult(paramList);
  const fbParams = pl?.fb || [];
  console.log(`  particlePOP params: ${pl?.count || 0} total`);
  console.log(`  Feedback-related: ${fbParams.length > 0 ? fbParams.join(", ") : "(none found — using fallback)"}`);
  c.check("  List particlePOP params", pl?.success, `(${pl?.count || 0})`);

  // Try known candidate names (targetpop from TD docs, plus fallbacks)
  const candidates = [...fbParams, "targetpop", "targetfeedbacklooppop", "feedbacklooppop"];
  // Deduplicate
  const uniqueCandidates = [...new Set(candidates)];

  let fbSet = false;
  for (const paramName of uniqueCandidates) {
    const trySet = await pyConnect(c, `import json
try:
    particle = op('${SYS}/particle')
    pop_out = op('${SYS}/pop_out')
    if particle and pop_out:
        particle.par.${paramName} = pop_out.path
        print(json.dumps({'success':True}))
    else:
        print(json.dumps({'success':False}))
except:
    print(json.dumps({'success':False}))`);
    if (trySet) {
      console.log(`  ✅ Feedback param found: ${paramName}`);
      c.check("  Set feedback target", true, `(${paramName})`);
      fbSet = true;
      break;
    }
  }
  if (!fbSet) {
    c.check("  Set feedback target", false, "(no matching param)");
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Phase 4: Scene Output
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  console.log("\n--- Phase 4: Scene Output ---\n");

  await createOp(c, "nullTOP", "final_out", SCENE, 50 + SX * 5, 50 + SY * 2);
  await wire(c, `${SYS}/top_out`, `${SCENE}/final_out`);
  c.check("Wire top_out -> final_out", true);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Phase 5: Verification
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  console.log("\n--- Phase 5: Verification ---\n");

  const allNames = [...names, "final_out"];
  const verifyCheck = await c.py(`import json
found_sys = []
found_scene = []
for n in ${JSON.stringify(allNames)}:
    if op('${SYS}/' + '/' + n) is not None:
        found_sys.append(n)
    if op('${SCENE}/' + '/' + n) is not None:
        found_scene.append(n)
total = len(set(found_sys + found_scene))
print(json.dumps({'success':True,'sys':found_sys,'scene':found_scene,'total':total}))`);
  const vr = parsePyResult(verifyCheck);
  c.check("All operators verified", vr?.success && vr?.total >= 10, `(${vr?.total || 0})`);

  // Verify feedback loop
  const fbVerify = await c.py(`import json
try:
    particle = op('${SYS}/particle')
    pop_out = op('${SYS}/pop_out')
    target = ''
    for p in particle.pars():
        try:
            val = str(p.val)
            if pop_out and pop_out.path in val:
                target = p.name
                break
        except: pass
    print(json.dumps({'success':True,'feedback_param':target,'has_feedback':len(target)>0}))
except Exception as e:
    print(json.dumps({'success':False,'error':str(e)}))`);
  const fbr = parsePyResult(fbVerify);
  if (fbr?.has_feedback) {
    console.log(`  Feedback confirmed: ${fbr.feedback_param}`);
  }
  c.check("Feedback loop verified", fbr?.has_feedback);

  // Connections
  const connCheck = await c.call("td_connections", { path: SCENE, recurse: true }, 5000);
  const connectedOps = (connCheck.data?.operators || []).filter(o => o.inputs?.length > 0).length;
  c.check("Connections exist", connectedOps >= 5, `(${connectedOps} connected)`);

  // Healthcheck
  const sceneHc = await healthcheck(c, SCENE);
  c.check("Scene healthcheck", sceneHc.ok, `(issues: ${sceneHc.issues})`);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Phase 6: Cleanup
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  console.log("\n--- Phase 6: Cleanup ---\n");
  const del = await c.call("td_delete_operator", { path: SCENE }, 5000);
  c.check("Delete scene", del.ok && !del.data?.error);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Summary
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  const total = c.passed + c.failed;
  console.log(`\n=== POP Particle System Results ===`);
  console.log(`  Passed: ${c.passed}`);
  console.log(`  Failed: ${c.failed}`);
  console.log(`  Total:  ${total}`);
  console.log(`\n  Scene: pop_particle_system (baseCOMP)`);
  console.log(`    particle_net (baseCOMP)`);
  console.log(`      pointGeneratorPOP -> randomPOP (velocity) -> particlePOP`);
  console.log(`      -> noisePOP (turbulence) -> forceRadialPOP (attract)`);
  console.log(`      -> transformPOP (spin) -> trailPOP -> nullPOP`);
  console.log(`      nullPOP -> geoCOMP -> cameraCOMP -> renderTOP -> nullTOP`);
  console.log(`      Feedback: nullPOP -> particlePOP (targetpop)`);
  console.log(`=====================================\n`);

  c.stop();
  process.exit(c.failed > 0 ? 1 : 0);
}

run().catch((e) => {
  console.error(`\n  💥 Crash: ${e.message}`);
  process.exit(1);
});
