#!/usr/bin/env node
/**
 * Live acceptance check for td_glsl_apply (the tool's exact code path:
 * applyGlslPop from mcp/dist + real TDClient -> /exec on localhost:44444).
 *
 * Case A: shader writes P + Cd + customAttr  -> must compile cleanly.
 * Case B: shader reads the output P          -> must be rejected by
 *         pre-validation with the Regla 1 message (no TD call).
 */
const path = require("path");
const { pathToFileURL } = require("url");

const REPO = path.resolve(__dirname, "..");

async function main() {
  const { TDClient } = await import(
    pathToFileURL(path.join(REPO, "api/dist/index.js")).href
  );
  const { applyGlslPop } = await import(
    pathToFileURL(path.join(REPO, "mcp/dist/tools/glslValidate.js")).href
  );

  const client = new TDClient({ transport: "http", requestTimeout: 60000 });
  const parent = "/project1";

  const goodShader = `void main(){
    const uint id = TDIndex();
    if (id >= TDNumElements()) return;
    vec3 p = TDIn_P(0, id);
    P[id] = p;
    Cd[id] = vec4(1.0, 0.5, 0.0, 1.0);
    customAttr[id] = length(p);
}`;

  const badShader = `void main(){
    const uint id = TDIndex();
    if (id >= TDNumElements()) return;
    P[id] = P[id] * 1.001;
}`;

  console.log("=== CASE B: shader reads the output P (R1) ===");
  const bad = await applyGlslPop(client, {
    parentPath: parent,
    name: "glsl_accept_bad",
    shader: badShader,
  });
  console.log(JSON.stringify(bad, null, 2));

  console.log("=== CASE A: shader writes P + Cd + customAttr ===");
  const good = await applyGlslPop(client, {
    parentPath: parent,
    name: "glsl_accept_good",
    shader: goodShader,
  });
  console.log(JSON.stringify(good, null, 2));

  const okA = !good.isError && good.report && good.report.ok &&
    good.report.num_points > 0 && good.report.errors.length === 0;
  const okB = bad.isError === true &&
    /Regla 1/.test(bad.message || "") &&
    /TDIn_P/.test(bad.message || "");

  console.log("=== VERDICT ===");
  console.log(`caseA_compiles: ${okA}`);
  console.log(`caseB_rejected_with_regla1: ${okB}`);
  process.exit(okA && okB ? 0 : 1);
}

main().catch((e) => {
  console.error("DRIVER_ERROR:", e && e.message ? e.message : e);
  process.exit(2);
});
