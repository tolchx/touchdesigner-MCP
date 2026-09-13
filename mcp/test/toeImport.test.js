/**
 * Offline tests for td_import_toe_dir (mcp/src/tools/toeImport.ts):
 *   - parseNFile: type/tile/flags/inputs parsing (Facet fixture)
 *   - parseParmFile: last-column value rule + `?` blocks
 *   - dumpTypeToPyClass: dump token → td class
 *   - parseToeDirScope: wires resolved from inputs
 *   - buildImportCode: the generated Python follows the VERIFIED recipe
 *     (src.outputConnectors[0].connect(dst), defensive param setting,
 *     cook + per-node verification, JSON report)
 *   - verifyAgainstDump: per-node checks vs the dump
 *
 * No TouchDesigner required. Build first: cd mcp && npm run build
 * Run: node --test test/toeImport.test.js
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  parseNFile,
  parseParmFile,
  dumpTypeToPyClass,
  parseToeDirScope,
  buildImportCode,
  verifyAgainstDump,
} from "../dist/tools/toeImport.js";

// ─── Fixture: the real Facet dump (docs/TOE_REPLICATION.md §3) ───────────────

const LINE1_N = `POP:line
tile -750 0 130 90
flags =  viewer 1 display on parlanguage 0
color 0.55 0.55 0.55
view 29 ...
end
`;

const GRID1_N = `POP:grid
tile -750 -225 130 90
flags =  viewer 1 parlanguage 0
color 0.55 0.55 0.55
view 29 ...
end
`;

const MATH1_N = `POP:math
tile -550 0 130 90
flags =  viewer 1 parlanguage 0
inputs
{
0 \tline1
}
color 0.55 0.55 0.55
view 29 ...
end
`;

const FACET2_N = `POP:facet
tile -350 -225 130 90
flags =  viewer 1 parlanguage 0
inputs
{
0 \tquantize1
}
color 0.55 0.55 0.55
view 29 ...
end
`;

const QUANTIZE1_N = `POP:quantize
tile -550 -225 130 90
flags =  viewer 1 parlanguage 0
inputs
{
0 \tgrid1
}
color 0.55 0.55 0.55
end
`;

const FACET1_N = `POP:facet
tile -350 0 130 90
flags =  picked on current on viewer 1 parlanguage 0
inputs
{
0 \tmath1
}
color 0.55 0.55 0.55
end
`;

// ─── parseNFile ──────────────────────────────────────────────────────────────

describe("parseNFile", () => {
  it("parses type, tile, display flag and inputs", () => {
    const node = parseNFile(LINE1_N, "line1");
    assert.ok(node);
    assert.equal(node.rawType, "POP:line");
    assert.equal(node.family, "POP");
    assert.equal(node.opType, "line");
    assert.equal(node.nodeX, -750);
    assert.equal(node.nodeY, 0);
    assert.equal(node.display, true); // flags line has 'display on'
    assert.deepEqual(node.inputs, []);
  });

  it("parses inputs block with TAB separators", () => {
    const node = parseNFile(MATH1_N, "math1");
    assert.ok(node);
    assert.deepEqual(node.inputs, ["line1"]);
    assert.equal(node.display, false);
  });

  it("returns null for files without a family header", () => {
    assert.equal(parseNFile("not a node file\n", "x"), null);
  });

  it("keeps multiple inputs in index order", () => {
    const multi = `POP:merge
tile 0 0 130 90
inputs
{
0 \tsrcA
1 \tsrcB
2 \tsrcC
}
end
`;
    const node = parseNFile(multi, "merge1");
    assert.deepEqual(node.inputs, ["srcA", "srcB", "srcC"]);
  });
});

// ─── parseParmFile ───────────────────────────────────────────────────────────

describe("parseParmFile", () => {
  it("takes the LAST column as the value (dump state int is not the value)", () => {
    const params = parseParmFile("?\npt1posx 67108928 10\npt1posy 67108928 5\n?");
    assert.equal(params.pt1posx, "10");
    assert.equal(params.pt1posy, "5");
  });

  it("parses menu/toggle values and skips ? separators", () => {
    const params = parseParmFile(
      "?\noperation 0 conspoints\ncpureadback 0 on\nquantize0 0 round\ncastto 0 float\n?",
    );
    assert.equal(params.operation, "conspoints");
    assert.equal(params.cpureadback, "on");
    assert.equal(params.quantize0, "round");
    assert.equal(params.castto, "float");
  });

  it("parses grid size triple", () => {
    const params = parseParmFile("?\nsize1 0 10\nsize2 0 10\nsize3 0 10\n?");
    assert.deepEqual(params, { size1: "10", size2: "10", size3: "10" });
  });
});

// ─── dumpTypeToPyClass ───────────────────────────────────────────────────────

describe("dumpTypeToPyClass", () => {
  it("maps dump tokens to td classes", () => {
    assert.equal(dumpTypeToPyClass("POP:grid"), "gridPOP");
    assert.equal(dumpTypeToPyClass("POP:facet"), "facetPOP");
    assert.equal(dumpTypeToPyClass("TOP:noise"), "noiseTOP");
    assert.equal(dumpTypeToPyClass("SOP:box"), "boxSOP");
  });

  it("returns null for PANEL entries", () => {
    assert.equal(dumpTypeToPyClass("PANEL:slider"), null);
  });
});

// ─── parseToeDirScope (real fixture directory) ──────────────────────────────

function makeFacetScopeDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "toe-facet-"));
  const files = {
    "line1.n": LINE1_N,
    "line1.parm": "?\npt1posx 67108928 10\npt1posy 67108928 5\npt1posz 67108928 0\n?",
    "math1.n": MATH1_N,
    "math1.parm": "?\nquantize0 0 round\ncastto 0 float\noutputattscope 0 P\n?",
    "facet1.n": FACET1_N,
    "facet1.parm": "?\noperation 0 conspoints\ncpureadback 0 on\n?",
    "grid1.n": GRID1_N,
    "grid1.parm": "?\nsize1 0 10\nsize2 0 10\nsize3 0 10\n?",
    "quantize1.n": QUANTIZE1_N,
    "quantize1.parm": "?\nquantize0 0 round\n?",
    "facet2.n": FACET2_N,
    "facet2.parm": "?\noperation 0 conspoints\ncpureadback 0 on\n?",
  };
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), content);
  }
  return dir;
}

describe("parseToeDirScope", () => {
  it("parses the real Facet fixture: 6 nodes, 4 wires, params attached", () => {
    const dir = makeFacetScopeDir();
    const dump = parseToeDirScope(dir);
    assert.equal(dump.scope, path.basename(dir));
    assert.equal(dump.nodes.length, 6);

    const names = dump.nodes.map((n) => n.name).sort();
    assert.deepEqual(names, ["facet1", "facet2", "grid1", "line1", "math1", "quantize1"]);

    const grid = dump.nodes.find((n) => n.name === "grid1");
    assert.deepEqual(grid.params, { size1: "10", size2: "10", size3: "10" });

    // wires from inputs blocks
    const wireSet = dump.wires.map(([s, d, i]) => `${s}[${i}]->${d}`).sort();
    assert.deepEqual(wireSet, ["grid1[0]->quantize1", "line1[0]->math1", "math1[0]->facet1", "quantize1[0]->facet2"].sort());

    fs.rmSync(dir, { recursive: true, force: true });
  });
});

// ─── buildImportCode (codegen follows the verified recipe) ──────────────────

describe("buildImportCode", () => {
  const dir = makeFacetScopeDir();
  const dump = parseToeDirScope(dir);

  it("creates a container and every node via td classes with dump positions", () => {
    const code = buildImportCode(dump, "facet_imported_test", "/project1");
    assert.ok(code.includes("parent.create(td.baseCOMP, 'facet_imported_test')"));
    assert.ok(code.includes("getattr(td, 'gridPOP', None)"));
    assert.ok(code.includes("o.nodeX = -750; o.nodeY = -225")); // grid1 tile
  });

  it("wires with the VERIFIED origin-side recipe, not /connect", () => {
    const code = buildImportCode(dump, "facet_imported_test", "/project1");
    assert.ok(code.includes("base.op('line1').outputConnectors[0].connect(base.op('math1'))"));
    // indexed input uses inputConnectors[i]
    assert.ok(
      !code.includes("inputConnectors[0]") || code.includes("outputConnectors[0]"),
    );
  });

  it("sets params defensively: hasattr guard + drift entry when missing", () => {
    const code = buildImportCode(dump, "facet_imported_test", "/project1");
    // defensive guard per param
    assert.ok(code.includes("hasattr(p.par, 'size1')"));
    assert.ok(code.includes("hasattr(p.par, 'pt1posx')"));
    // drift message for params not in the live build
    assert.ok(code.includes("'line1.pt1posx'] = 'param not in live build'"));
    // numeric literal from last column (not the dump state int)
    assert.ok(code.includes("setattr(p.par, 'pt1posx', 10)"));
    assert.ok(!code.includes("67108928"));
  });

  it("cooks and verifies every node with numPoints()/numPrims() as METHODS", () => {
    const code = buildImportCode(dump, "facet_imported_test", "/project1");
    assert.ok(code.includes("o.cook(force=True)"));
    assert.ok(code.includes("int(o.numPoints())"));
    assert.ok(code.includes("int(o.numPrims())"));
    assert.ok(code.includes("[i.name for i in o.inputs]"));
  });

  it("never interpolates raw names without quoting", () => {
    const code = buildImportCode(dump, "facet_imported_test", "/project1");
    assert.ok(!code.includes("getattr(td, gridPOP"));
  });

  it("is per-node fault tolerant: unknown types go to unsupported, not abort", () => {
    const code = buildImportCode(dump, "facet_imported_test", "/project1");
    // each create is wrapped in its own try, with a None-class guard
    assert.ok(code.includes("_cls = getattr(td, 'gridPOP', None)"));
    assert.ok(code.includes("unsupported.append('"));
    assert.ok(code.includes("'param not in live build'"));
    // the script must keep a top-level try so one bad node never kills the batch
    assert.ok(code.includes("except Exception as _ce:"));
    // wire failures are collected, never fatal
    assert.ok(code.includes("except Exception as _we:"));
    assert.ok(code.includes('"wire_errors"'));
    // no legacy failed_create key
    assert.ok(!code.includes('"failed_create"'));
  });

  it("handles a dump with an unknown type end-to-end (codegen compiles)", () => {
    const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), "toe-unknown-"));
    fs.writeFileSync(path.join(dir2, "pointgen1.n"),
      "POP:pointgen\ntile 0 0 130 90\nflags =  viewer 1 parlanguage 0\nend\n");
    fs.writeFileSync(path.join(dir2, "pointgen1.parm"), "?\nwidth 0 5\n?");
    fs.writeFileSync(path.join(dir2, "grid1.n"), GRID1_N);
    fs.writeFileSync(path.join(dir2, "grid1.parm"), "?\nsize1 0 10\nsize2 0 10\nsize3 0 10\n?");
    fs.writeFileSync(path.join(dir2, "math1.n"),
      "POP:math\ntile 0 0 130 90\nflags =  viewer 1 parlanguage 0\ninputs\n{\n0 \tpointgen1\n}\nend\n");
    const dump2 = parseToeDirScope(dir2);
    const code = buildImportCode(dump2, "unknown_test", "/project1");
    // the unknown class is looked up defensively and reported, not created
    assert.ok(code.includes("_cls = getattr(td, 'pointgenPOP', None)"));
    assert.ok(code.includes("unsupported.append('pointgen1 (pointgenPOP)')"));
    // the wire from the missing node is guarded by op() existence
    assert.ok(code.includes("if base.op('pointgen1') and base.op('math1'):"));
    // params of the unknown node are still guarded by the base.op None check
    assert.ok(code.includes("p = base.op('pointgen1')"));
    assert.ok(code.includes("if p is not None and hasattr(p.par, 'width'):"));
    fs.rmSync(dir2, { recursive: true, force: true });
  });
});

// ─── verifyAgainstDump ──────────────────────────────────────────────────────

describe("verifyAgainstDump", () => {
  const dir = makeFacetScopeDir();
  const dump = parseToeDirScope(dir);

  it("marks all_ok when TD matches the dump", () => {
    const verification = {};
    for (const n of dump.nodes) {
      verification[n.name] = {
        present: true,
        errors: "",
        numPoints: 10,
        numPrims: 3,
        inputs: n.inputs,
        nodeX: n.nodeX,
        nodeY: n.nodeY,
      };
    }
    const { checks, allOk } = verifyAgainstDump(dump, verification);
    assert.equal(checks.length, 6);
    assert.equal(allOk, true);
    assert.equal(checks.every((c) => c.checks.inputs), true);
  });

  it("flags missing nodes and input mismatches", () => {
    const verification = {
      facet2: { present: true, errors: "", inputs: ["quantize1"], nodeX: -350, nodeY: -225 },
      // everyone else missing
    };
    const { checks, allOk } = verifyAgainstDump(dump, verification);
    assert.equal(allOk, false);
    const facet2 = checks.find((c) => c.node === "facet2");
    assert.equal(facet2.checks.present, true);
    assert.equal(facet2.checks.inputs, true);
    const line1 = checks.find((c) => c.node === "line1");
    assert.equal(line1.checks.present, false);
    assert.equal(line1.errors, "missing after import");
  });

  it("reports dirty cooks via clean=false", () => {
    const verification = {
      grid1: { present: true, errors: "some error", inputs: [], nodeX: -750, nodeY: -225 },
    };
    const { checks } = verifyAgainstDump(dump, verification);
    const grid = checks.find((c) => c.node === "grid1");
    assert.equal(grid.checks.clean, false);
    assert.equal(grid.errors, "some error");
  });
});
