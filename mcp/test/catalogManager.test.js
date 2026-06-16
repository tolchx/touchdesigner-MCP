/**
 * Unit tests for Catalog Manager — Family metadata, parameter styles, creation defaults
 *
 * catalogManager mixes static data (FAMILY_MAP, PARAMETER_STYLE_MAP, CREATION_DEFAULTS)
 * with dynamic catalog building from knowledge base. These tests focus on the
 * static/fallback portions that work without a live TD connection.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  FAMILY_MAP,
  PARAMETER_STYLE_MAP,
  POP_PARAMETER_STYLE,
  CREATION_DEFAULTS,
  getAllFamilies,
  getFamilyMeta,
  getFamily,
  getPaletteType,
  getParameterStyle,
  getCreationDefaults,
} from "../dist/catalogManager.js";

// ═══════════════════════════════════════════════════════════════════════════════
// Static Data: FAMILY_MAP
// ═══════════════════════════════════════════════════════════════════════════════

describe("FAMILY_MAP — Static Data", () => {
  it("should have entries for all 7 families", () => {
    const expected = ["TOP", "CHOP", "SOP", "DAT", "POP", "COMP", "MAT"];
    for (const f of expected) {
      assert.ok(
        Object.prototype.hasOwnProperty.call(FAMILY_MAP, f),
        `Missing FAMILY_MAP entry for '${f}'`
      );
    }
  });

  it("should have exactly 7 families", () => {
    assert.equal(Object.keys(FAMILY_MAP).length, 7);
  });

  it("each family should have correct pythonSuffix", () => {
    assert.equal(FAMILY_MAP.TOP.pythonSuffix, "top");
    assert.equal(FAMILY_MAP.CHOP.pythonSuffix, "chop");
    assert.equal(FAMILY_MAP.SOP.pythonSuffix, "sop");
    assert.equal(FAMILY_MAP.DAT.pythonSuffix, "dat");
    assert.equal(FAMILY_MAP.POP.pythonSuffix, "pop");
    assert.equal(FAMILY_MAP.COMP.pythonSuffix, "comp");
    assert.equal(FAMILY_MAP.MAT.pythonSuffix, "mat");
  });

  it("each family should have correct paletteType", () => {
    assert.equal(FAMILY_MAP.TOP.paletteType, "TOP");
    assert.equal(FAMILY_MAP.CHOP.paletteType, "CHOP");
    assert.equal(FAMILY_MAP.SOP.paletteType, "SOP");
    assert.equal(FAMILY_MAP.DAT.paletteType, "DAT");
    assert.equal(FAMILY_MAP.POP.paletteType, "POPs");
    assert.equal(FAMILY_MAP.COMP.paletteType, "COMP");
    assert.equal(FAMILY_MAP.MAT.paletteType, "MAT");
  });

  it("each family should have correct parameterStyle", () => {
    assert.equal(FAMILY_MAP.TOP.parameterStyle, "direct");
    assert.equal(FAMILY_MAP.CHOP.parameterStyle, "direct");
    assert.equal(FAMILY_MAP.SOP.parameterStyle, "direct");
    assert.equal(FAMILY_MAP.DAT.parameterStyle, "direct");
    assert.equal(FAMILY_MAP.POP.parameterStyle, "pop-custom");
    assert.equal(FAMILY_MAP.COMP.parameterStyle, "direct");
    assert.equal(FAMILY_MAP.MAT.parameterStyle, "direct");
  });

  it("POP should be the only family with hasExperimental=true", () => {
    for (const [family, meta] of Object.entries(FAMILY_MAP)) {
      if (family === "POP") {
        assert.ok(meta.hasExperimental, "POP should have hasExperimental=true");
      } else {
        assert.ok(
          !meta.hasExperimental,
          `${family} should have hasExperimental=false`
        );
      }
    }
  });

  it("all families should have a creationFn", () => {
    for (const [family, meta] of Object.entries(FAMILY_MAP)) {
      assert.ok(
        meta.creationFn && meta.creationFn.length > 0,
        `${family} missing creationFn`
      );
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Static Data: PARAMETER_STYLE_MAP
// ═══════════════════════════════════════════════════════════════════════════════

describe("PARAMETER_STYLE_MAP — Static Data", () => {
  it("should have entries for all 7 families", () => {
    const expected = ["TOP", "CHOP", "SOP", "DAT", "POP", "COMP", "MAT"];
    for (const f of expected) {
      assert.ok(
        Object.prototype.hasOwnProperty.call(PARAMETER_STYLE_MAP, f),
        `Missing PARAMETER_STYLE_MAP entry for '${f}'`
      );
    }
  });

  it("each family should have correct style", () => {
    assert.equal(PARAMETER_STYLE_MAP.TOP.style, "direct");
    assert.equal(PARAMETER_STYLE_MAP.CHOP.style, "direct");
    assert.equal(PARAMETER_STYLE_MAP.SOP.style, "direct");
    assert.equal(PARAMETER_STYLE_MAP.DAT.style, "direct");
    assert.equal(PARAMETER_STYLE_MAP.POP.style, "pop-custom");
    assert.equal(PARAMETER_STYLE_MAP.COMP.style, "direct");
    assert.equal(PARAMETER_STYLE_MAP.MAT.style, "direct");
  });

  it("each family should have description", () => {
    for (const [family, style] of Object.entries(PARAMETER_STYLE_MAP)) {
      assert.ok(
        style.description && style.description.length > 0,
        `${family} missing description`
      );
    }
  });

  it("each family should have setValueExample and setExpressionExample", () => {
    for (const [family, style] of Object.entries(PARAMETER_STYLE_MAP)) {
      assert.ok(
        style.setValueExample && style.setValueExample.length > 0,
        `${family} missing setValueExample`
      );
      assert.ok(
        style.setExpressionExample && style.setExpressionExample.length > 0,
        `${family} missing setExpressionExample`
      );
    }
  });

  it("only POP should have appendMethods", () => {
    for (const [family, style] of Object.entries(PARAMETER_STYLE_MAP)) {
      if (family === "POP") {
        assert.ok(
          Array.isArray(style.appendMethods),
          "POP should have appendMethods array"
        );
        assert.ok(style.appendMethods.length >= 4, "POP should have 4+ append methods");
      } else {
        assert.equal(
          style.appendMethods,
          undefined,
          `${family} should not have appendMethods`
        );
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Static Data: POP_PARAMETER_STYLE
// ═══════════════════════════════════════════════════════════════════════════════

describe("POP_PARAMETER_STYLE — Static Data", () => {
  it("should have 4 append methods", () => {
    assert.deepEqual(POP_PARAMETER_STYLE.appendMethods, [
      "appendFloat",
      "appendInt",
      "appendString",
      "appendMenu",
    ]);
  });

  it("should have signatures for all 4 methods", () => {
    const sigMethods = Object.keys(POP_PARAMETER_STYLE.signatures);
    assert.ok(sigMethods.includes("appendFloat"));
    assert.ok(sigMethods.includes("appendInt"));
    assert.ok(sigMethods.includes("appendString"));
    assert.ok(sigMethods.includes("appendMenu"));
  });

  it("should have input management with sequential chain pattern", () => {
    assert.equal(
      POP_PARAMETER_STYLE.inputManagement.pattern,
      "sequential_chain"
    );
  });

  it("should identify multi-input POPs", () => {
    assert.ok(
      POP_PARAMETER_STYLE.inputManagement.multiInputPOPs.includes("popmerge")
    );
    assert.ok(
      POP_PARAMETER_STYLE.inputManagement.multiInputPOPs.includes("popinteract")
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Static Data: CREATION_DEFAULTS
// ═══════════════════════════════════════════════════════════════════════════════

describe("CREATION_DEFAULTS — Static Data", () => {
  it("should have defaults for key TOP operators", () => {
    assert.ok(Object.prototype.hasOwnProperty.call(CREATION_DEFAULTS, "noisetop"));
    assert.ok(Object.prototype.hasOwnProperty.call(CREATION_DEFAULTS, "blurtop"));
    assert.ok(Object.prototype.hasOwnProperty.call(CREATION_DEFAULTS, "compositetop"));
    assert.ok(Object.prototype.hasOwnProperty.call(CREATION_DEFAULTS, "nulltop"));
  });

  it("should have defaults for key CHOP operators", () => {
    assert.ok(Object.prototype.hasOwnProperty.call(CREATION_DEFAULTS, "constantchop"));
    assert.ok(Object.prototype.hasOwnProperty.call(CREATION_DEFAULTS, "mathchop"));
    assert.ok(Object.prototype.hasOwnProperty.call(CREATION_DEFAULTS, "nullchop"));
  });

  it("should have defaults for key SOP operators", () => {
    assert.ok(Object.prototype.hasOwnProperty.call(CREATION_DEFAULTS, "boxsop"));
    assert.ok(Object.prototype.hasOwnProperty.call(CREATION_DEFAULTS, "spheresop"));
    assert.ok(Object.prototype.hasOwnProperty.call(CREATION_DEFAULTS, "nullsop"));
  });

  it("should have defaults for key DAT operators", () => {
    assert.ok(Object.prototype.hasOwnProperty.call(CREATION_DEFAULTS, "textdat"));
    assert.ok(Object.prototype.hasOwnProperty.call(CREATION_DEFAULTS, "tabledat"));
    assert.ok(Object.prototype.hasOwnProperty.call(CREATION_DEFAULTS, "nulldat"));
  });

  it("should have defaults for POP operators", () => {
    assert.ok(Object.prototype.hasOwnProperty.call(CREATION_DEFAULTS, "particle"));
    assert.ok(Object.prototype.hasOwnProperty.call(CREATION_DEFAULTS, "force"));
    assert.ok(Object.prototype.hasOwnProperty.call(CREATION_DEFAULTS, "gravity"));
  });

  it("should have defaults for COMP operators", () => {
    assert.ok(Object.prototype.hasOwnProperty.call(CREATION_DEFAULTS, "containercomp"));
    assert.ok(Object.prototype.hasOwnProperty.call(CREATION_DEFAULTS, "basecomp"));
    assert.ok(Object.prototype.hasOwnProperty.call(CREATION_DEFAULTS, "nullcomp"));
  });

  it("should have defaults for MAT operators", () => {
    assert.ok(Object.prototype.hasOwnProperty.call(CREATION_DEFAULTS, "phongmat"));
    assert.ok(Object.prototype.hasOwnProperty.call(CREATION_DEFAULTS, "glslmat"));
  });

  it("noisetop should have sensible defaults", () => {
    const defs = CREATION_DEFAULTS.noisetop;
    assert.equal(defs.type, "simplex");
    assert.equal(defs.amplitude, 1);
    assert.equal(defs.period, 5);
    assert.ok(defs.monochrome, true);
  });

  it("particle should have sensible defaults", () => {
    const defs = CREATION_DEFAULTS.particle;
    assert.equal(defs.lifexpect, 5);
    assert.equal(defs.maxparticles, 1000);
    assert.equal(defs.rate, 60);
    assert.ok(defs.active, true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Convenience Functions
// ═══════════════════════════════════════════════════════════════════════════════

describe("getAllFamilies", () => {
  it("should return all 7 family names", () => {
    const families = getAllFamilies();
    assert.equal(families.length, 7);
    assert.ok(families.includes("TOP"));
    assert.ok(families.includes("CHOP"));
    assert.ok(families.includes("SOP"));
    assert.ok(families.includes("DAT"));
    assert.ok(families.includes("POP"));
    assert.ok(families.includes("COMP"));
    assert.ok(families.includes("MAT"));
  });
});

describe("getFamilyMeta", () => {
  it("should return correct meta for each family", () => {
    assert.equal(getFamilyMeta("TOP").pythonSuffix, "top");
    assert.equal(getFamilyMeta("POP").parameterStyle, "pop-custom");
    assert.equal(getFamilyMeta("POP").paletteType, "POPs");
    assert.equal(getFamilyMeta("POP").hasExperimental, true);
    assert.equal(getFamilyMeta("CHOP").hasExperimental, false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Fallback Suffix-Based Functions
// ═══════════════════════════════════════════════════════════════════════════════

describe("getFamily — suffix fallback", () => {
  it("should detect family from opType suffix for known types", () => {
    assert.equal(getFamily("noiseTOP"), "TOP");
    assert.equal(getFamily("constantCHOP"), "CHOP");
    assert.equal(getFamily("sphereSOP"), "SOP");
    assert.equal(getFamily("textDAT"), "DAT");
    assert.equal(getFamily("particlePOP"), "POP");
    assert.equal(getFamily("containerCOMP"), "COMP");
    assert.equal(getFamily("phongMAT"), "MAT");
  });

  it("should be case-insensitive", () => {
    assert.equal(getFamily("NoiseTop"), "TOP");
    assert.equal(getFamily("NOISETOP"), "TOP");
  });

  it("should return undefined for unknown suffix", () => {
    assert.equal(getFamily("unknownThing"), undefined);
  });

  it("should return undefined for empty string", () => {
    assert.equal(getFamily(""), undefined);
  });
});

describe("getPaletteType — suffix fallback", () => {
  it("should detect palette type from opType suffix", () => {
    assert.equal(getPaletteType("noiseTOP"), "TOP");
    assert.equal(getPaletteType("particlePOP"), "POPs");
    assert.equal(getPaletteType("containerCOMP"), "COMP");
    assert.equal(getPaletteType("phongMAT"), "MAT");
    assert.equal(getPaletteType("textDAT"), "DAT");
  });

  it("should return 'UNKNOWN' for unrecognizable type", () => {
    assert.equal(getPaletteType("something"), "UNKNOWN");
  });

  it("should be case-insensitive", () => {
    assert.equal(getPaletteType("NOISETOP"), "TOP");
    assert.equal(getPaletteType("ParticlePop"), "POPs");
  });
});

describe("getParameterStyle", () => {
  it("should return correct style for family enum", () => {
    const topStyle = getParameterStyle("TOP");
    assert.ok(topStyle);
    assert.equal(topStyle.style, "direct");

    const popStyle = getParameterStyle("POP");
    assert.ok(popStyle);
    assert.equal(popStyle.style, "pop-custom");
    assert.ok(Array.isArray(popStyle.appendMethods));
  });

  it("should accept opType string and resolve family via getFamily", () => {
    const style = getParameterStyle("noiseTOP");
    assert.ok(style);
    assert.equal(style.style, "direct");
  });

  it("should return undefined for unknown type", () => {
    assert.equal(getParameterStyle("UNKNOWN_TYPE_XYZ"), undefined);
  });
});

describe("getCreationDefaults", () => {
  it("should return defaults for known types", () => {
    const defs = getCreationDefaults("noiseTOP");
    assert.ok(defs);
    assert.equal(defs.type, "simplex");
  });

  it("should return undefined for unknown types", () => {
    assert.equal(getCreationDefaults("nonexistentTypeTOP"), undefined);
  });

  it("should be case-insensitive", () => {
    const defs = getCreationDefaults("NOISETOP");
    assert.ok(defs);
    assert.equal(defs.type, "simplex");

    const defs2 = getCreationDefaults("BlurTOP");
    assert.ok(defs2);
    assert.equal(defs2.filter, "gaussian");
  });
});
