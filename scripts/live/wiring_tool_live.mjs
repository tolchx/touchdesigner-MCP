/**
 * Live acceptance for td_verify_wiring against the real TD bridge.
 * Self-contained: builds its own sandbox network, runs the cases, destroys it.
 * Exit codes: 0 all pass, 1 failures, 2 TD unreachable. Always exits.
 */
import { TDClient } from "../../api/dist/index.js";
import { registerWiringCheckTools } from "../../mcp/dist/tools/wiringCheck.js";

const SB = "/project1/_vt_net";
const SPEC = "srcA->nz:0,nz->mg:0,srcB->mg:1,mg->out:0";

const client = new TDClient({ host: "127.0.0.1", port: 44444, transport: "http" });
const tools = new Map();
const server = { registerTool: (name, spec, handler) => tools.set(name, { spec, handler }) };
registerWiringCheckTools(server, client);
const handler = tools.get("td_verify_wiring").handler;

function payload(res) {
  return JSON.parse(res.content[0].text);
}

const failures = [];
function check(name, cond, detail) {
  console.log((cond ? "PASS " : "FAIL ") + name + (detail ? " :: " + detail : ""));
  if (!cond) failures.push(name);
}

// Gate: TD reachable.
try {
  await client.getInfo();
} catch (e) {
  console.log("TD_UNREACHABLE:", e.message || e);
  process.exit(2);
}

// Build the sandbox network (5 POPs, mergePOP multi-input).
const build = await client.execute(`
r = op('/project1')
if op('${SB}'): op('${SB}').destroy()
net = r.create(td.baseCOMP, '_vt_net')
srcA = net.create(td.boxPOP, 'srcA'); srcA.nodeX = -300
srcB = net.create(td.boxPOP, 'srcB'); srcB.nodeX = -300; srcB.nodeY = -200
nz = net.create(td.noisePOP, 'nz'); nz.nodeX = 0
mg = net.create(td.mergePOP, 'mg'); mg.nodeX = 300
out = net.create(td.nullPOP, 'out'); out.nodeX = 600
srcA.outputConnectors[0].connect(nz)
nz.outputConnectors[0].connect(mg)
srcB.outputConnectors[0].connect(mg.inputConnectors[1])
mg.outputConnectors[0].connect(out)
print('built')
`);
if (!build.success) {
  console.log("BUILD_FAILED:", build.error ?? build);
  process.exit(1);
}

// Case 1: correct wiring -> ok:true.
const r1 = await handler({ path: SB, expect: SPEC });
const d1 = payload(r1);
check("case1 correct-wiring ok", d1.ok === true && d1.missingCount === 0,
  JSON.stringify({ ok: d1.ok, actual: d1.actual }));

// Case 2: expectation is a SUBSET (omits mg->out) -> the real edge shows up as unexpected.
const r2 = await handler({ path: SB, expect: "srcA->nz:0,nz->mg:0,srcB->mg:1" });
const d2 = payload(r2);
check("case2 extra-edge detected", d2.ok === false && d2.unexpected[0] === "mg->out:0" && d2.missing.length === 0,
  JSON.stringify({ missing: d2.missing, unexpected: d2.unexpected }));

// Case 3: break the network for real (unwire out) -> tool catches it by name.
await client.execute(`op('${SB}/out').inputConnectors[0].disconnect()\nprint('unwired')`);
const r3 = await handler({ path: SB, expect: SPEC });
const d3 = payload(r3);
check("case3 broken-net caught", d3.ok === false && d3.missing[0] === "mg->out:0",
  JSON.stringify({ missing: d3.missing, unexpected: d3.unexpected }));

// Case 4: without expectation -> explicit error, never a silent pass.
const r4 = await handler({ path: SB });
check("case4 no-expectation errors", r4.isError === true);

// Cleanup.
await client.execute(`op('${SB}').destroy()\nprint('ok')`);

console.log("");
if (failures.length) {
  console.log("FAILED:", failures);
  process.exit(1);
}
console.log("ALL OK - td_verify_wiring verified live against TD.");
process.exit(0);
