/**
 * Offline tests for the GLSL write-path safety net (mcp/src/tools/glslValidate.ts):
 *   - analyzeGlslShader: R1 output-read rejection, R3 create-attrs, R4 readwrite
 *   - buildGlslApplyCode: generated Python follows the verified recipe
 *   - applyGlslPop: pre-validation blocks without TD; infoDAT log surfaced on
 *     compile failure; success path reports geometry
 *
 * No TouchDesigner required. Build first: cd mcp && npm run build
 * Run: node --test test/glslValidate.test.js
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  analyzeGlslShader,
  buildCreateAttrParams,
  preValidateShader,
  buildGlslApplyCode,
  applyGlslPop,
} from "../dist/tools/glslValidate.js";

const OK_HEADER = `void main(){
    const uint id = TDIndex();
    if (id >= TDNumElements()) return;
`;

describe("analyzeGlslShader", () => {
  it("P displacement from input: no create attrs, no readwrite, canonical pattern", () => {
    const a = analyzeGlslShader(OK_HEADER + `    P[id] = TDIn_P(0, id) * 1.001;\n}`);
    assert.deepEqual(a.writes, ["P"]);
    assert.deepEqual(a.needs_create_attrs, []);
    assert.equal(a.needs_readwrite, false);
    assert.equal(a.errors.length, 0);
    assert.equal(a.has_tdindex_pattern, true);
  });

  it("P read after write is a BLOCKING R1 error with the fix", () => {
    const a = analyzeGlslShader(OK_HEADER + `    P[id] = P[id] * 1.001;\n}`);
    assert.equal(a.errors.length, 1);
    assert.match(a.errors[0], /Regla 1/);
    assert.match(a.errors[0], /TDIn_P/);
    // and pre-validation refuses it
    const blocking = preValidateShader(OK_HEADER + `    P[id] = P[id] * 1.001;\n}`);
    assert.ok(Array.isArray(blocking) && blocking.length === 1);
  });

  it("custom attribute (masa) gets Create Attributes params with numcomps=1", () => {
    const a = analyzeGlslShader(OK_HEADER + `    masa[id] = length(TDIn_P(0, id)) * 0.1;\n}`);
    assert.deepEqual(a.needs_create_attrs, ["masa"]);
    assert.equal(a.create_attr_params[0].attr, "masa");
    assert.equal(a.create_attr_params[0].params.attr0name, "Custom");
    assert.equal(a.create_attr_params[0].params.attr0customname, "masa");
    assert.equal(a.create_attr_params[0].params.attr0numcomps, 1);
  });

  it("readwrite needed when shader reads an attr it writes (R4)", () => {
    const a = analyzeGlslShader(
      OK_HEADER +
        `    masa[id] = length(TDIn_P(0, id)) * 0.1;\n    P[id] = TDIn_P(0, id) * (1.0 + masa[id]);\n}`
    );
    assert.equal(a.needs_readwrite, true);
    assert.equal(a.errors.length, 0); // masa read is fine with readwrite; P not read
  });

  it("missing main() is a blocking error", () => {
    const a = analyzeGlslShader(`P[id] = TDIn_P(0, id);`);
    assert.ok(a.errors.some((e) => e.includes("void main()")));
  });

  it("reading an undeclared attr only warns", () => {
    const a = analyzeGlslShader(OK_HEADER + `    P[id] = TDIn_P(0, id) + vel[id];\n}`);
    assert.ok(a.warnings.some((w) => w.includes("vel")));
    assert.equal(a.errors.length, 0);
  });
});

describe("buildCreateAttrParams", () => {
  it("Cd=4, uv=2, unknown=1, attr0name is always Custom", () => {
    assert.equal(buildCreateAttrParams("Cd").attr0numcomps, 4);
    assert.equal(buildCreateAttrParams("uv").attr0numcomps, 2);
    assert.equal(buildCreateAttrParams("customAttr").attr0numcomps, 1);
    assert.equal(buildCreateAttrParams("Cd").attr0name, "Custom");
  });
});

describe("buildGlslApplyCode", () => {
  const RW_SHADER =
    OK_HEADER +
    `    masa[id] = length(TDIn_P(0, id)) * 0.1;\n    P[id] = TDIn_P(0, id) * (1.0 + masa[id]);\n}`;

  it("includes computedat, outputattrs, Create Attributes for masa, readwrite", () => {
    const code = buildGlslApplyCode({
      parentPath: "/project1",
      name: "glsl_1",
      shader: RW_SHADER,
      sourcePath: "/project1/box1",
    });
    assert.match(code, /computedat/);
    assert.match(code, /outputattrs/);
    assert.match(code, /attr0name', "Custom"/);
    assert.match(code, /attr0customname', "masa"/);
    assert.match(code, /attr0numcomps', 1/);
    assert.match(code, /outputaccess', 'readwrite'/);
    assert.match(code, /src\.outputConnectors\[0\]\.connect\(glsl\)/);
    assert.match(code, /glsl\.cook\(force=True\)/);
    assert.match(code, /_info/); // R5 infoDAT lookup
    assert.match(code, /print\(json\.dumps\(_out\)\)/);
  });

  it("no readwrite line when not needed; no connect without sourcePath", () => {
    const code = buildGlslApplyCode({
      parentPath: "/project1",
      name: "glsl_1",
      shader: OK_HEADER + `    P[id] = TDIn_P(0, id);\n}`,
    });
    assert.doesNotMatch(code, /outputaccess/);
    assert.doesNotMatch(code, /outputConnectors/);
  });

  it("generated Python is syntactically valid (ast.parse)", () => {
    // Spawn python once to validate the generated script's syntax.
    const code = buildGlslApplyCode({
      parentPath: "/project1",
      name: "glsl_1",
      shader: RW_SHADER,
      sourcePath: "/project1/box1",
    });
    const out = execFileSync("python", ["-c", `import ast,sys; ast.parse(sys.argv[1]); print("SYNTAX_OK")`, code], {
      encoding: "utf8",
    });
    assert.match(out, /SYNTAX_OK/);
  });
});

describe("applyGlslPop", () => {
  const makeClient = (stdout) => ({
    execute: async (_code) => ({ success: true, stdout }),
  });

  it("R1 shader is rejected WITHOUT calling TD", async () => {
    let called = 0;
    const client = {
      execute: async () => {
        called++;
        return { success: true, stdout: "" };
      },
    };
    const res = await applyGlslPop(client, {
      parentPath: "/project1",
      name: "x",
      shader: OK_HEADER + `    P[id] = P[id] * 2.0;\n}`,
    });
    assert.equal(called, 0);
    assert.equal(res.isError, true);
    assert.match(res.message, /Regla 1/);
    assert.match(res.message, /TDIn_P/);
  });

  it("compile failure surfaces the infoDAT log in the error", async () => {
    const stdout = JSON.stringify({
      ok: false,
      path: "/project1/glsl_1",
      errors: ["Compile failed"],
      warnings: [],
      skipped: [],
      shader_info: "'*' : can't read from writeonly object",
      num_points: null,
      num_prims: null,
    });
    const res = await applyGlslPop(makeClient(stdout), {
      parentPath: "/project1",
      name: "glsl_1",
      shader: OK_HEADER + `    P[id] = TDIn_P(0, id);\n}`,
    });
    assert.equal(res.isError, true);
    assert.match(res.message, /Compile failed/);
    assert.match(res.message, /writeonly object/);
  });

  it("success reports geometry and skipped params", async () => {
    const stdout = JSON.stringify({
      ok: true,
      path: "/project1/glsl_1",
      errors: [],
      warnings: [],
      skipped: ["attr1name (param not in build)"],
      shader_info: null,
      num_points: 100,
      num_prims: 1,
    });
    const res = await applyGlslPop(makeClient(stdout), {
      parentPath: "/project1",
      name: "glsl_1",
      shader: OK_HEADER + `    P[id] = TDIn_P(0, id);\n}`,
    });
    assert.equal(res.isError, undefined);
    assert.match(res.message, /100 puntos/);
    assert.match(res.message, /attr1name/);
  });

  it("unparseable stdout is an explicit error, not silence", async () => {
    const res = await applyGlslPop(makeClient("total garbage"), {
      parentPath: "/project1",
      name: "glsl_1",
      shader: OK_HEADER + `    P[id] = TDIn_P(0, id);\n}`,
    });
    assert.equal(res.isError, true);
    assert.match(res.message, /No se pudo interpretar/);
  });

  it("generated script embeds the rule-16 wiring check only when sourcePath is given", async () => {
    let withSrc = "";
    let withoutSrc = "";
    const client = {
      execute: async (code) => {
        withSrc = code;
        return {
          success: true,
          stdout: JSON.stringify({
            ok: true, path: "/project1/glsl_1", errors: [], warnings: [],
            skipped: [], shader_info: null, num_points: 10, num_prims: 1,
          }),
        };
      },
    };
    await applyGlslPop(client, {
      parentPath: "/project1",
      name: "glsl_1",
      shader: OK_HEADER + `    P[id] = TDIn_P(0, id);\n}`,
      sourcePath: "/project1/box_src",
    });
    assert.match(withSrc, /Wiring check failed \(rule 16\)/);
    assert.match(withSrc, /_wiring\["ok"\]/);
    // Without a source there is no expected edge, so no embedded check.
    await applyGlslPop(client, {
      parentPath: "/project1",
      name: "glsl_2",
      shader: OK_HEADER + `    P[id] = TDIn_P(0, id);\n}`,
    });
    withoutSrc = withSrc;
    assert.match(withSrc, /no sourcePath given/);
    assert.doesNotMatch(withSrc, /_wiring\["ok"\]/);
  });

  it("surfaces embedded wiring failure in the success message", async () => {
    const stdout = JSON.stringify({
      ok: true, path: "/project1/glsl_1", errors: [],
      warnings: ["Wiring check failed (rule 16): expected /project1/box_src -> /project1/glsl_1 :0 | actual: []"],
      skipped: [], shader_info: null, num_points: 10, num_prims: 1,
      wiring: {
        ok: false,
        expected: "/project1/box_src -> /project1/glsl_1 :0",
        actual: [],
      },
    });
    const res = await applyGlslPop(makeClient(stdout), {
      parentPath: "|/project1",
      name: "glsl_1",
      shader: OK_HEADER + `    P[id] = TDIn_P(0, id);\n}`,
    });
    assert.equal(res.isError, undefined);
    assert.match(res.message, /WIRING CHECK FAILED/);
    assert.match(res.message, /rule 16/);
  });

  it("reports wiring OK when the embedded check passes", async () => {
    const stdout = JSON.stringify({
      ok: true, path: "/project1/glsl_1", errors: [], warnings: [],
      skipped: [], shader_info: null, num_points: 10, num_prims: 1,
      wiring: { ok: true, expected: "/project1/box_src -> /project1/glsl_1 :0", actual: [{ from: "box_src", to: "glsl_1", input: 0 }] },
    });
    const res = await applyGlslPop(makeClient(stdout), {
      parentPath: "/project1",
      name: "glsl_1",
      shader: OK_HEADER + `    P[id] = TDIn_P(0, id);\n}`,
    });
    assert.equal(res.isError, undefined);
    assert.match(res.message, /Wiring OK/);
  });
});
