/**
 * Offline tests: GLSL TOP recipes (mcp/src/tools/glslTopRecipes.ts) must pass
 * the TOP safety net (analyzeGlslTopShader in glslValidate.ts) and generate
 * valid creation code per docs/GLSL_TOP_RULES.md.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  GLSL_TOP_RECIPES,
  validateAllRecipes,
  buildGlslTopRecipeCode,
} from "../dist/tools/glslTopRecipes.js";
import { analyzeGlslTopShader } from "../dist/tools/glslValidate.js";

describe("analyzeGlslTopShader — rule detection", () => {
  it("accepts a correct minimal TOP shader", () => {
    const ok = "layout(location = 0) out vec4 fragColor;\nvoid main(){ fragColor = vec4(vUV.st, 0.0, 1.0); }";
    const a = analyzeGlslTopShader(ok);
    assert.equal(a.errors.length, 0);
    assert.equal(a.has_fragcolor_out, true);
    assert.equal(a.has_main, true);
  });

  it("flags missing fragColor declaration (Regla TOP 1)", () => {
    const bad = "void main(){ fragColor = vec4(vUV.st, 0.0, 1.0); }";
    const a = analyzeGlslTopShader(bad);
    assert.ok(a.errors.some((e) => e.includes("Regla TOP 1")));
  });

  it("flags vUV.uv with the .st/.xy fix (Regla TOP 2, probe G)", () => {
    const bad = "layout(location = 0) out vec4 fragColor;\nvoid main(){ fragColor = vec4(vUV.uv, 0.0, 1.0); }";
    const a = analyzeGlslTopShader(bad);
    assert.ok(a.errors.some((e) => e.includes("Regla TOP 2") && e.includes("vUV.uv")));
    assert.deepEqual(a.bad_uv_swizzles, ["vUV.uv"]);
  });

  it("flags vUV.uv1 and vUV.texcoord too", () => {
    for (const sw of ["vUV.uv1", "vUV.texcoord"]) {
      const bad = `layout(location = 0) out vec4 fragColor;\nvoid main(){ fragColor = vec4(${sw}, 0.0, 1.0); }`;
      const a = analyzeGlslTopShader(bad);
      assert.ok(a.bad_uv_swizzles.length === 1, sw);
    }
  });

  it("flags uniform0name usage in creation code with the vec0/const0 fix (Regla TOP 4, probe D)", () => {
    const shader = "layout(location = 0) out vec4 fragColor;\nuniform float u_scale;\nvoid main(){ fragColor = vec4(vUV.st * u_scale, 0.0, 1.0); }";
    const creation = "g.par.uniform0name = 'u_scale'";
    const a = analyzeGlslTopShader(shader, creation);
    assert.ok(a.errors.some((e) => e.includes("Regla TOP 4") && e.includes("vec0name")));
    assert.equal(a.uses_uniform0name_risk, true);
  });

  it("does NOT flag vec0name/const0name creation code", () => {
    const shader = "layout(location = 0) out vec4 fragColor;\nuniform float u_scale;\nvoid main(){ fragColor = vec4(vUV.st * u_scale, 0.0, 1.0); }";
    const creation = "g.par.const0name = 'u_scale'; g.par.const0value = 0.5";
    const a = analyzeGlslTopShader(shader, creation);
    assert.equal(a.uses_uniform0name_risk, false);
  });

  it("warns when a shader reads sTD2DInputs with vUV (feedback, Regla TOP 10)", () => {
    const shader = "layout(location = 0) out vec4 fragColor;\nvoid main(){ fragColor = texture(sTD2DInputs[0], vUV.st); }";
    const a = analyzeGlslTopShader(shader);
    assert.ok(a.warnings.some((w) => w.includes("Regla TOP 10")));
  });

  it("flags missing void main", () => {
    const bad = "layout(location = 0) out vec4 fragColor;\n// no main here";
    const a = analyzeGlslTopShader(bad);
    assert.ok(a.errors.some((e) => e.includes("void main")));
  });
});

describe("GLSL_TOP_RECIPES — the 5+2 visual recipes", () => {
  it("contains the 5 core recipes with stable ids", () => {
    const ids = GLSL_TOP_RECIPES.map((r) => r.id);
    for (const expected of [
      "top-circle-sdf",
      "top-value-noise",
      "top-fbm-layers",
      "top-grid-pattern",
      "top-uv-ripple",
      "top-feedback-trails",
      "top-reaction-diffusion",
    ]) {
      assert.ok(ids.includes(expected), expected);
    }
  });

  it("every recipe passes the TOP safety net (0 errors)", () => {
    const results = validateAllRecipes();
    for (const r of results) {
      assert.deepEqual(r.errors, [], `${r.id}: ${r.errors.join(" | ")}`);
    }
  });

  it("every recipe cites its Book of Shaders source and has a live check", () => {
    for (const r of GLSL_TOP_RECIPES) {
      assert.ok(r.bosChapter.includes("thebookofshaders.com"), r.id);
      assert.ok(r.liveCheck.length > 10, r.id);
      assert.ok(r.resolution.w > 0 && r.resolution.h > 0, r.id);
    }
  });

  it("feedback recipes are marked realtimeOnly (Regla TOP 10)", () => {
    for (const r of GLSL_TOP_RECIPES.filter((x) => x.category === "feedback")) {
      assert.equal(r.realtimeOnly, true, r.id);
    }
  });

  it("non-feedback recipes declare no texture inputs", () => {
    for (const r of GLSL_TOP_RECIPES.filter((x) => x.category !== "feedback")) {
      assert.ok(!r.glsl.includes("sTD2DInputs"), r.id);
    }
  });
});

describe("buildGlslTopRecipeCode — generated creation script", () => {
  it("uses pixeldat (never computedat) and custom resolution (Reglas TOP 4/6)", () => {
    const r = GLSL_TOP_RECIPES[0];
    const code = buildGlslTopRecipeCode(r, "/project1", "probe_t1");
    assert.ok(code.includes("par.pixeldat"));
    assert.ok(!code.includes("computedat"));
    assert.ok(code.includes('outputresolution = "custom"'));
    assert.ok(code.includes("resolutionw = 256"));
  });

  it("binds uniforms via vec0/const0 families (Regla TOP 5, probe J)", () => {
    const r = GLSL_TOP_RECIPES.find((x) => x.id === "top-value-noise");
    const code = buildGlslTopRecipeCode(r, "/project1", "probe_t2");
    assert.ok(code.includes('"vec0name"'));
    assert.ok(code.includes('"u_time"'));        assert.ok(code.includes('"vec0name"')) // const0 does NOT bind under scripted creation (live-verified);
    assert.ok(!code.includes("uniform0name"));
  });

  it("feedback recipes wire glsl→feedbackTOP→glsl", () => {
    const r = GLSL_TOP_RECIPES.find((x) => x.id === "top-feedback-trails");
    const code = buildGlslTopRecipeCode(r, "/project1", "probe_t6");
    assert.ok(code.includes("feedbackTOP"));
    assert.ok(code.includes("g.outputConnectors[0].connect(fb)"));
    assert.ok(code.includes("fb.outputConnectors[0].connect(g)"));
  });

  it("non-feedback recipes create no feedbackTOP", () => {
    const r = GLSL_TOP_RECIPES.find((x) => x.id === "top-circle-sdf");
    const code = buildGlslTopRecipeCode(r, "/project1", "probe_t1b");
    assert.ok(!code.includes("feedbackTOP"));
  });

  it("generated script is balanced (try/except + prints one JSON line)", () => {
    for (const r of GLSL_TOP_RECIPES) {
      const code = buildGlslTopRecipeCode(r, "/project1", "probe_bal");
      assert.ok(code.startsWith("import json"));
      assert.equal(code.split("try:").length, code.split("except").length, r.id);
      assert.ok(code.trimEnd().endsWith('print(json.dumps(res))'), r.id);
    }
  });
});
