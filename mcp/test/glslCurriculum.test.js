/**
 * Offline tests for the GLSL curriculum (item 32):
 *   - mcp/data/glsl_curriculum.json: unique ids, anti-plagio contract
 *     (fuente_citada always present), shader_td references exist on disk.
 *   - Every TOP shader passes analyzeGlslTopShader (imports the real
 *     analyzer — rules are never re-implemented here).
 *   - td_glsl_curriculum tool: list / get / path behavior.
 *
 * Build first: cd mcp && npm run build
 * Run: node --test test/glslCurriculum.test.js
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");

const kb = JSON.parse(
  readFileSync(join(root, "mcp/data/glsl_curriculum.json"), "utf-8")
);

const { analyzeGlslTopShader, analyzeGlslShader } = await import(
  "../dist/tools/glslValidate.js"
);
const { registerGlslCurriculumTools } = await import(
  "../dist/tools/glslCurriculum.js"
);

describe("glsl_curriculum.json — knowledge base contract", () => {
  it("has metadata with counts matching the entries", () => {
    assert.ok(kb.metadata);
    assert.equal(kb.metadata.counts.entries, kb.entries.length);
    const top = kb.entries.filter((e) => e.familia === "TOP").length;
    assert.equal(kb.metadata.counts.by_familia.TOP, top);
    assert.ok(kb.entries.length >= 10, "curriculum is substantive");
  });

  it("ids are unique and fuente_citada is always present (anti-plagio)", () => {
    const ids = kb.entries.map((e) => e.id);
    assert.equal(new Set(ids).size, ids.length, "duplicate ids");
    for (const e of kb.entries) {
      assert.ok(e.fuente_citada && e.fuente_citada.length > 10, e.id);
    }
  });

  it("BoS citations point at the real chapter URLs", () => {
    for (const e of kb.entries) {
      if (e.fuente_citada.includes("thebookofshaders.com")) {
        assert.match(e.fuente_citada, /thebookofshaders\.com\/\d{2}\/\?lan=es/, e.id);
      }
      if (e.fuente_citada.includes("td-edu")) {
        assert.match(e.fuente_citada, /https:\/\/tolchx\.com\/td-edu\//, e.id);
      }
    }
  });

  it("every shader_td exists on disk under glsl_files/", () => {
    for (const e of kb.entries) {
      assert.ok(e.shader_td, e.id + " must reference a shader");
      assert.ok(e.shader_td.startsWith("glsl_files/"), e.id);
      assert.ok(
        existsSync(join(root, e.shader_td)),
        e.id + " -> missing " + e.shader_td
      );
    }
  });

  it("every TOP shader passes the real TOP analyzer", () => {
    for (const e of kb.entries.filter((x) => x.familia === "TOP")) {
      const code = readFileSync(join(root, e.shader_td), "utf-8");
      const a = analyzeGlslTopShader(code);
      assert.deepEqual(a.errors, [], e.id + ": " + a.errors.join("; "));
    }
  });

  it("every POP shader passes the real POP analyzer (no output reads)", () => {
    for (const e of kb.entries.filter((x) => x.familia === "POP")) {
      const code = readFileSync(join(root, e.shader_td), "utf-8");
      const a = analyzeGlslShader(code);
      assert.deepEqual(
        a.errors.filter((x) => x.includes("Regla 1")),
        [],
        e.id + ": " + a.errors.join("; ")
      );
    }
  });

  it("prerequisitos reference existing ids or form a known-dangling set", () => {
    const ids = new Set(kb.entries.map((e) => e.id));
    for (const e of kb.entries) {
      for (const p of e.prerequisitos) {
        assert.ok(
          ids.has(p) || p.startsWith("tdedu-"),
          e.id + " has unknown prereq " + p
        );
      }
    }
  });
});

describe("td_glsl_curriculum tool", () => {
  const calls = [];
  const server = {
    registerTool: (name, spec, handler) => calls.push({ name, spec, handler }),
  };
  registerGlslCurriculumTools(server);
  const tool = calls.find((c) => c.name === "td_glsl_curriculum");
  const run = async (args) => {
    const res = await tool.handler(args);
    return { isError: res.isError ?? false, body: JSON.parse(res.content[0].text) };
  };

  it("is registered offline (no client argument needed)", () => {
    assert.ok(tool, "td_glsl_curriculum must be registered");
  });

  it("list returns every id with family and prereqs", async () => {
    const { isError, body } = await run({ action: "list" });
    assert.equal(isError, false);
    assert.equal(body.entries.length, kb.entries.length);
    for (const e of kb.entries) {
      assert.ok(body.entries.some((x) => x.id === e.id));
    }
  });

  it("get returns the full entry and unknown ids error with a hint", async () => {
    const okRes = await run({ action: "get", id: "top-01-shapes-sdf" });
    assert.equal(okRes.isError, false);
    assert.equal(okRes.body.entry.id, "top-01-shapes-sdf");
    assert.equal(okRes.body.entry.params_nodo.node, "glslTOP");
    assert.equal(okRes.body.entry.params_nodo.shader_dat, "pixeldat");

    const bad = await run({ action: "get", id: "nope" });
    assert.equal(bad.isError, true);
    assert.match(bad.body.error, /Available ids:/);
  });

  it("path suggests >= 2 steps for 'efectos de imagen'", async () => {
    const { isError, body } = await run({ action: "path", goal: "efectos de imagen" });
    assert.equal(isError, false);
    assert.ok(body.steps.length >= 2, "expected a chain, got " + body.steps.length);
    const ids = body.steps.map((s) => s.id);
    assert.ok(ids.includes("top-08-image-processing"));
    assert.ok(ids.includes("top-01-shapes-sdf"), "prereq chain included");
  });

  it("path resolves prereqs transitively for organic visuals", async () => {
    const { body } = await run({ action: "path", goal: "visuales orgánicos" });
    const ids = body.steps.map((s) => s.id);
    // fbm requires value noise: the chain must include both, noise first
    assert.ok(ids.includes("top-03-fbm-layers"));
    assert.ok(ids.indexOf("top-02-random-noise") < ids.indexOf("top-03-fbm-layers"));
  });

  it("path with no keyword match errors listing tryable goals", async () => {
    const bad = await run({ action: "path", goal: "zzzz" });
    assert.equal(bad.isError, true);
    assert.match(bad.body.error, /Try:/);
  });
});
