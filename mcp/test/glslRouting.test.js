/**
 * Offline tests: GLSL POP templates/recipes route through the td_glsl_apply
 * safety net (mcp/src/tools/glslValidate.ts):
 *   - pop-box-glsl-chain's pythonBuilder embeds shaders that PASS the analyzer
 *     (R1/R2 compliant, deterministic geometry), and its python is valid.
 *   - builderRecipes' glsl-top-shader gotchas point at the safety net and the
 *     POP/TOP distinction.
 *   - applyGlslPop composes with the template: applying the template's shader
 *     through the tool's code path compiles cleanly (fake client asserts the
 *     generated script creates the shader DATs and sets computedat).
 *
 * No TouchDesigner required. Build first: cd mcp && npm run build
 * Run: node --test test/glslRouting.test.js
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

import { getTemplateByName } from "../dist/networkTemplates.js";
import { getRecipe } from "../dist/builderRecipes.js";
import { analyzeGlslShader, applyGlslPop } from "../dist/tools/glslValidate.js";

const PY_STRING = /"""([\s\S]*?)"""/g;

describe("pop-box-glsl-chain template", () => {
  const tmpl = getTemplateByName("pop-box-glsl-chain");
  it("exists in the template registry (via popTemplatesAsNetworkTemplates)", () => {
    assert.ok(tmpl, "pop-box-glsl-chain not found in getTemplateByName");
    assert.ok(
      tmpl.operators.some((o) => o.opType === "glslPOP"),
      "template must contain glslPOP operators",
    );
  });

  it("pythonBuilder declares shader DATs and sets computedat for both passes", () => {
    assert.ok(tmpl, "template missing");
    const py = tmpl.pythonBuilder;
    assert.match(py, /textDAT, 'glsl_1_code'/);
    assert.match(py, /textDAT, 'glsl_2_code'/);
    assert.match(py, /glsl1\.par\.computedat = shader1\.name/);
    assert.match(py, /glsl2\.par\.computedat = shader2\.name/);
    assert.match(py, /glsl1\.par\.outputattrs = 'P'/);
    // DATs must be created BEFORE computedat is set (recipe gotcha order)
    assert.ok(
      py.indexOf("textDAT, 'glsl_1_code'") < py.indexOf("glsl1.par.computedat"),
      "shader DAT must be created before computedat is set",
    );
  });

  it("pythonBuilder has no dangling computedat references", () => {
    assert.ok(tmpl, "template missing");
    const py = tmpl.pythonBuilder;
    for (const m of py.matchAll(/computedat = (\S+)/g)) {
      const ref = m[1];
      // must reference an actual variable defined earlier, not a bare string
      assert.match(ref, /^shader\d\.name$/, `computedat set to non-variable: ${ref}`);
    }
  });
});

describe("template-embedded shaders pass the analyzer", () => {
  const tmpl = getTemplateByName("pop-box-glsl-chain");

  it("every shader in pythonBuilder: zero blocking errors, canonical pattern", () => {
    assert.ok(tmpl, "template missing");
    const shaders = [...tmpl.pythonBuilder.matchAll(PY_STRING)].map((m) => m[1]);
    assert.ok(shaders.length >= 2, `expected >=2 embedded shaders, found ${shaders.length}`);
    for (const [i, shader] of shaders.entries()) {
      const a = analyzeGlslShader(shader);
      assert.deepEqual(a.errors, [], `shader ${i}: blocking errors: ${a.errors}`);
      assert.equal(a.has_tdindex_pattern, true, `shader ${i}: missing R2 guard`);
      assert.ok(a.writes.includes("P"), `shader ${i}: does not write P`);
      // Deterministic geometry: reads input, not output (R1)
      assert.ok(
        a.reads.length === 0 || !a.reads.includes("P"),
        `shader ${i}: reads the output P`,
      );
    }
  });

  it("generated python (with shaders) is syntactically valid", () => {
    assert.ok(tmpl, "template missing");
    const py = tmpl.pythonBuilder;
    // Strip the module-level invocation so ast.parse validates the defs only
    // (op()/td.* don't exist at parse time — but they're only Name nodes, so
    // the whole file parses fine; we validate as-is).
    const out = execFileSync(
      "python",
      ["-c", "import ast,sys; ast.parse(sys.argv[1]); print('PY_OK')", py],
      { encoding: "utf8" },
    );
    assert.match(out, /PY_OK/);
  });
});

describe("builderRecipes glsl-top-shader points at the safety net", () => {
  const recipe = getRecipe("glsl-top-shader");

  it("recipe exists and its gotchas mention the POP rules doc", () => {
    assert.ok(recipe, "glsl-top-shader recipe missing");
    const gotchas = recipe.gotchas.join("\n");
    assert.match(gotchas, /GLSL_POP_RULES\.md/);
  });

  it("gotchas distinguish glslTOP from glslPOP", () => {
    const gotchas = recipe.gotchas.join("\n");
    assert.match(gotchas, /glslTOP \(PIXEL shader\)/);
    assert.match(gotchas, /glslPOP/);
  });

  it("gotchas recommend td_glsl_apply for GLSL POPs", () => {
    const gotchas = recipe.gotchas.join("\n");
    assert.match(gotchas, /td_glsl_apply/);
    assert.match(gotchas, /td_glsl_analyze/);
  });
});

describe("applyGlslPop composes with the template", () => {
  const tmpl = getTemplateByName("pop-box-glsl-chain");

  it("template's pass-1 shader applies cleanly: script creates DAT then glslPOP", async () => {
    assert.ok(tmpl, "template missing");
    const shaders = [...tmpl.pythonBuilder.matchAll(PY_STRING)].map((m) => m[1]);
    const shader = shaders[0];
    let captured = "";
    const client = {
      execute: async (code) => {
        captured = code;
        return {
          success: true,
          stdout: JSON.stringify({
            ok: true,
            path: "/project1/glsl_1",
            errors: [],
            warnings: [],
            skipped: [],
            shader_info: null,
            num_points: 100,
            num_prims: 6,
          }),
        };
      },
    };
    const res = await applyGlslPop(client, {
      parentPath: "/project1",
      name: "glsl_1",
      shader,
      sourcePath: "/project1/box_src",
    });
    assert.equal(res.isError, undefined);
    assert.match(res.message, /compila|puntos/);
    // The tool's script must create the textDAT BEFORE the glslPOP (same
    // ordering rule the template's builder now follows)
    const datPos = captured.indexOf("_code\"");
    const glslPos = captured.indexOf("td.glslPOP");
    assert.ok(datPos >= 0 && glslPos > datPos, "DAT must be created before glslPOP");
    assert.match(captured, /src\.outputConnectors\[0\]\.connect\(glsl\)/);
  });
});
