import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TDClient } from "td-api";
import { z } from "zod";
import { ok, err } from "../helpers.js";

// ─── POP Validation Rules ─────────────────────────────────────────────────

interface PopRule {
  /** What this rule checks */
  name: string;
  /** Severity: 'error' blocks execution, 'warning' is advisory */
  severity: "error" | "warning";
  /** Human-readable description of the rule */
  description: string;
  /** Suggested fix when the rule is violated */
  fix: string;
}

/** Rules indexed by POP opType */
export const POP_RULES: Record<string, PopRule[]> = {
  particlePOP: [
    {
      name: "feedback_target",
      severity: "error",
      description:
        "particlePOP REQUIRES a Null POP as feedback target via the particlesupdatepop parameter",
      fix: "Create a nullPOP downstream, set particlePOP.particlesupdatepop to its name, and wire feedbackPOP from nullPOP back to particlePOP",
    },
    {
      name: "input_required",
      severity: "error",
      description: "particlePOP needs an input connection (source geometry or previous POP)",
      fix: "Connect a source POP (spherePOP, gridPOP, etc.) to particlePOP input 0",
    },
    {
      name: "birthrate_sanity",
      severity: "warning",
      description: "Extremely high birthrate (>10000/sec) will cause performance issues",
      fix: "Reduce birthrate or increase particle life to balance particle count",
    },
  ],
  feedbackPOP: [
    {
      name: "target_parameter",
      severity: "error",
      description:
        "feedbackPOP needs its 'target' parameter set to the downstream nullPOP",
      fix: "Set feedbackPOP.par.target to the name of the nullPOP that receives the feedback chain output",
    },
    {
      name: "not_self_connecting",
      severity: "warning",
      description:
        "feedbackPOP should NOT connect directly back to itself — use a nullPOP as intermediate",
      fix: "Insert a nullPOP between the last operator and feedbackPOP, then connect feedbackPOP to the chain start",
    },
  ],
  noisePOP: [
    {
      name: "input_required",
      severity: "error",
      description: "noisePOP CANNOT run without an input — it warps existing point data",
      fix: "Connect a source POP (particlePOP, spherePOP, etc.) to noisePOP input 0",
    },
  ],
  glslPOP: [
    {
      name: "attribute_alignment",
      severity: "warning",
      description:
        "glslPOP requires matching attribute declarations (P, Vel, Cd) in the GLSL shader",
      fix: "Ensure attributePOP initializes required attributes before glslPOP, and shader layout locations match",
    },
    {
      name: "input_required",
      severity: "error",
      description: "glslPOP needs an input connection for the point data to process",
      fix: "Connect a source POP or attributePOP to glslPOP input 0",
    },
  ],
  glslCreatePOP: [
    {
      name: "attribute_alignment",
      severity: "warning",
      description:
        "glslCreatePOP generates points — ensure shader outputs match expected POP attributes",
      fix: "Verify shader writes to P, Cd, and any custom attributes in the output layout",
    },
  ],
  neighborPOP: [
    {
      name: "performance_limit",
      severity: "warning",
      description:
        "neighborPOP is O(n²) — performance degrades rapidly above 100K points",
      fix: "Reduce point count, increase sortPOP bucket size, or use fieldPOP for proximity instead",
    },
    {
      name: "input_required",
      severity: "error",
      description: "neighborPOP needs an input connection to analyze neighbor relationships",
      fix: "Connect the POP chain to neighborPOP input 0",
    },
  ],
  copyPOP: [
    {
      name: "two_inputs",
      severity: "error",
      description:
        "copyPOP needs two inputs: source geometry (input 0) and template geometry (input 1)",
      fix: "Connect source POP to input 0 and template geometry (spherePOP, boxPOP, etc.) to input 1",
    },
  ],
  blendPOP: [
    {
      name: "two_inputs",
      severity: "error",
      description:
        "blendPOP needs two inputs to blend: primary chain (input 0) and secondary chain (input 1)",
      fix: "Connect primary POP chain to input 0 and secondary chain to input 1",
    },
  ],
  fieldPOP: [
    {
      name: "proximity_context",
      severity: "warning",
      description:
        "fieldPOP creates proximity fields — must be placed near attractor/repulsor geometry",
      fix: "Place fieldPOP near the geometry that defines the field influence zone",
    },
  ],
  trailPOP: [
    {
      name: "input_required",
      severity: "error",
      description: "trailPOP needs an input connection to record trail history",
      fix: "Connect the POP chain to trailPOP input 0",
    },
  ],
  deletePOP: [
    {
      name: "condition_required",
      severity: "warning",
      description:
        "deletePOP removes points — ensure a delete condition is set, otherwise it deletes ALL points",
      fix: "Set deletePOP.par.condition to a valid expression (e.g. '@age > 3')",
    },
  ],
  limitPOP: [
    {
      name: "boundary_set",
      severity: "warning",
      description: "limitPOP constrains particle positions — verify boundary parameters are set",
      fix: "Set limitPOP.par.minx/maxx/miny/maxy/minz/maxz to desired bounds",
    },
  ],
  cachePOP: [
    {
      name: "cache_size",
      severity: "warning",
      description:
        "cachePOP stores frames in memory — large caches (>256 frames) consume significant VRAM",
      fix: "Reduce cache length or resolution for large point counts",
    },
  ],
};

// ─── Cross-Family Connection Rules ────────────────────────────────────────

export const INVALID_CROSS_FAMILY: Record<string, string[]> = {
  POP: ["SOP", "TOP", "CHOP", "DAT"],
  SOP: ["POP"],
  TOP: ["POP"],
  CHOP: ["POP"],
  DAT: ["POP"],
};

export const VALID_BRIDGES: Record<string, string> = {
  POP_to_SOP: "renderPOP or geometryCOMP",
  SOP_to_POP: "attributePOP or geometryCOMP",
  POP_to_TOP: "renderPOP → nullTOP",
  TOP_to_POP: "choptoTOP → attributePOP",
  POP_to_CHOP: "chopToPOP or selectCHOP",
  CHOP_to_POP: "selectCHOP → attributePOP",
  POP_to_DAT: "not directly supported — use renderTOP → DAT",
  DAT_to_POP: "not directly supported — use tableDAT → parameter expression",
};

// ─── POP Attribute Requirements ──────────────────────────────────────────

export const ATTRIBUTE_RULES: Record<string, string[]> = {
  particlePOP: ["P"],
  noisePOP: ["P"],
  forcePOP: ["P"],
  turbulencePOP: ["P", "Vel"],
  dragPOP: ["P", "Vel"],
  trailPOP: ["P"],
  renderPOP: ["P"],
  neighborPOP: ["P"],
  spritePOP: ["P", "pscale"],
  colorPOP: ["P"],
  glslPOP: ["P"],
  glslCreatePOP: ["P"],
  lookupPOP: ["P"],
  copyPOP: ["P", "pscale"],
  fieldPOP: ["P"],
  deletePOP: ["P"],
  limitPOP: ["P"],
  sortPOP: ["P"],
  normalizePOP: ["P"],
  transformPOP: ["P"],
};

// ─── Python Code Generators ──────────────────────────────────────────────

/**
 * Build Python code to detect all POP operators in a network and return
 * their types, connections, and parameter states.
 */
export function buildPopScanCode(rootPath: string): string {
  const safePath = rootPath.replace(/'/g, "\\'");
  return `
import json

def scan_pop_network(root_path):
    target = op('${safePath}')
    if target is None:
        return {"error": "Path not found: ${safePath}"}

    pops = []
    def walk(node, depth=0):
        if node is None or depth > 30:
            return
        try:
            if hasattr(node, 'OPType') and node.OPType and 'POP' in node.OPType:
                info = {
                    "path": node.path,
                    "name": node.name,
                    "opType": node.OPType,
                    "hasInput": False,
                    "inputCount": 0,
                    "inputSources": [],
                    "parameters": {},
                }
                # Check inputs
                try:
                    for ic in node.inputConnectors:
                        info["inputCount"] += 1
                        try:
                            for conn in ic.connections:
                                if conn.owner:
                                    info["hasInput"] = True
                                    info["inputSources"].append({
                                        "path": conn.owner.path,
                                        "opType": conn.owner.OPType if hasattr(conn.owner, 'OPType') else "?",
                                    })
                        except:
                            pass
                except:
                    pass

                # Check key parameters
                try:
                    for par in node.pars():
                        pname = par.name
                        if pname in ('birthrate', 'lifeexpect', 'maxparticles',
                                     'particlesupdatepop', 'target', 'length',
                                     'amp0', 'freq0', 'substeps',
                                     'condition', 'mode', 'measure'):
                            info["parameters"][pname] = par.val
                except:
                    pass

                pops.append(info)
        except:
            pass
        try:
            for child in node.children:
                walk(child, depth + 1)
        except:
            pass

    walk(target)
    return {"pops": pops, "count": len(pops)}

result = scan_pop_network('${safePath}')
print(json.dumps(result))
`;
}

/**
 * Build Python code to validate cross-family connections.
 */
export function buildCrossFamilyCheckCode(rootPath: string): string {
  const safePath = rootPath.replace(/'/g, "\\'");
  return `
import json

def check_cross_family(root_path):
    target = op('${safePath}')
    if target is None:
        return {"error": "Path not found"}

    violations = []
    def walk(node, depth=0):
        if node is None or depth > 30:
            return
        try:
            if hasattr(node, 'inputConnectors'):
                src_family = ""
                try:
                    ot = node.OPType
                    if ot:
                        for suffix in ('TOP', 'CHOP', 'SOP', 'DAT', 'POP', 'COMP'):
                            if ot.endswith(suffix):
                                src_family = suffix
                                break
                except:
                    pass

                for idx, ic in enumerate(node.inputConnectors):
                    try:
                        for conn in ic.connections:
                            if conn.owner:
                                tgt_family = ""
                                try:
                                    tot = conn.owner.OPType
                                    if tot:
                                        for suffix in ('TOP', 'CHOP', 'SOP', 'DAT', 'POP', 'COMP'):
                                            if tot.endswith(suffix):
                                                tgt_family = suffix
                                                break
                                except:
                                    pass

                                if src_family and tgt_family and src_family != tgt_family:
                                    violations.append({
                                        "source": conn.owner.path,
                                        "sourceFamily": tgt_family,
                                        "target": node.path,
                                        "targetFamily": src_family,
                                        "inputIndex": idx,
                                        "isInvalid": src_family == "POP" or tgt_family == "POP",
                                    })
                    except:
                        pass
        except:
            pass
        try:
            for child in node.children:
                walk(child, depth + 1)
        except:
            pass

    walk(target)
    return {"violations": violations, "count": len(violations)}

result = check_cross_family('${safePath}')
print(json.dumps(result))
`;
}

// ─── Tool Registration ───────────────────────────────────────────────────

export function registerPopValidationTools(server: McpServer, client: TDClient) {
  // ── td_pop_validate ──────────────────────────────────────────────────────
  server.registerTool(
    "td_pop_validate",
    {
      title: "POP Network Validation",
      description:
        "Validate a POP (Particle Operator) network for common errors: " +
        "feedback loop integrity, input requirements, attribute alignment, " +
        "cross-family connection safety, and performance constraints. " +
        "Checks particlePOP feedback targets, noisePOP input requirements, " +
        "glslPOP attribute declarations, neighborPOP performance limits, " +
        "copyPOP/blendPOP dual-input needs, and POP→SOP/TOP/CHOP/DAT " +
        "connection validity. Returns structured violations with fix suggestions.",
      inputSchema: {
        path: z
          .string()
          .describe("Root path of the POP network to validate (e.g. '/project1/mySystem')"),
        check_cross_family: z
          .boolean()
          .optional()
          .default(true)
          .describe("Also check for invalid cross-family connections (POP→SOP, etc.)"),
        check_attributes: z
          .boolean()
          .optional()
          .default(true)
          .describe("Verify that required attributes (P, Vel, Cd) are present"),
      },
    },
    async ({ path: rootPath, check_cross_family, check_attributes }) => {
      try {
        const result: any = {
          path: rootPath,
          ok: true,
          violations: [],
          popSummary: [],
          fixSuggestions: [],
        };

        // ── Step 1: Scan POP network ──
        const scanCode = buildPopScanCode(rootPath);
        const scanResult = await client.execute(scanCode, "/");
        let scanData: any;
        try {
          scanData = JSON.parse(scanResult.stdout || "{}");
        } catch {
          scanData = { pops: [], count: 0 };
        }

        if (scanData.error) {
          result.ok = false;
          result.violations.push({
            severity: "error",
            rule: "network_exists",
            message: scanData.error,
            fix: "Verify the path exists and contains POP operators",
          });
          return ok(result);
        }

        result.popSummary = scanData.pops || [];

        // ── Step 2: Apply POP-specific rules ──
        for (const pop of scanData.pops || []) {
          const opType = pop.opType;
          const rules = POP_RULES[opType] || [];

          for (const rule of rules) {
            let violated = false;
            let detail = "";

            switch (rule.name) {
              case "feedback_target":
                if (
                  opType === "particlePOP" &&
                  (!pop.parameters.particlesupdatepop ||
                    pop.parameters.particlesupdatepop === "")
                ) {
                  violated = true;
                  detail = "particlesupdatepop parameter is not set";
                }
                break;

              case "input_required":
              case "two_inputs":
                if (!pop.hasInput) {
                  violated = true;
                  detail = "No input connection detected";
                } else if (
                  rule.name === "two_inputs" &&
                  pop.inputCount < 2
                ) {
                  violated = true;
                  detail = `Only ${pop.inputCount} input(s) connected, needs 2`;
                }
                break;

              case "target_parameter":
                if (
                  opType === "feedbackPOP" &&
                  (!pop.parameters.target || pop.parameters.target === "")
                ) {
                  violated = true;
                  detail = "target parameter is not set";
                }
                break;

              case "not_self_connecting":
                if (opType === "feedbackPOP" && pop.hasInput) {
                  const selfRef = pop.inputSources.some(
                    (s: any) => s.path === pop.path,
                  );
                  if (selfRef) {
                    violated = true;
                    detail = "feedbackPOP connects directly back to itself";
                  }
                }
                break;

              case "birthrate_sanity":
                if (
                  pop.parameters.birthrate &&
                  pop.parameters.birthrate > 10000
                ) {
                  violated = true;
                  detail = `birthrate is ${pop.parameters.birthrate} (>10000/sec)`;
                }
                break;

              case "performance_limit":
                if (
                  opType === "neighborPOP" &&
                  pop.parameters.measure === "all"
                ) {
                  violated = true;
                  detail = "measuring all neighbors is O(n²)";
                }
                break;

              case "attribute_alignment":
              case "condition_required":
              case "boundary_set":
              case "cache_size":
              case "proximity_context":
                // These are advisory — always report as warnings
                violated = true;
                detail = rule.description;
                break;
            }

            if (violated) {
              result.violations.push({
                severity: rule.severity,
                rule: rule.name,
                opType,
                path: pop.path,
                message: detail || rule.description,
                fix: rule.fix,
              });
              result.fixSuggestions.push(
                `[${rule.severity.toUpperCase()}] ${pop.path} (${opType}): ${rule.fix}`,
              );
              if (rule.severity === "error") result.ok = false;
            }
          }
        }

        // ── Step 3: Cross-family connection check ──
        if (check_cross_family) {
          const cfCode = buildCrossFamilyCheckCode(rootPath);
          const cfResult = await client.execute(cfCode, "/");
          let cfData: any;
          try {
            cfData = JSON.parse(cfResult.stdout || "{}");
          } catch {
            cfData = { violations: [], count: 0 };
          }

          for (const v of cfData.violations || []) {
            if (v.isInvalid) {
              const bridge = VALID_BRIDGES[`${v.sourceFamily}_to_${v.targetFamily}`]
                || VALID_BRIDGES[`${v.targetFamily}_to_${v.sourceFamily}`]
                || "use an adapter operator";
              result.violations.push({
                severity: "error",
                rule: "cross_family_connection",
                path: `${v.source} → ${v.target}`,
                message: `Invalid connection: ${v.sourceFamily} → ${v.targetFamily} on input[${v.inputIndex}]`,
                fix: `Bridge with ${bridge}`,
              });
              result.fixSuggestions.push(
                `[ERROR] ${v.source} (${v.sourceFamily}) → ${v.target} (${v.targetFamily}): use ${bridge}`,
              );
              result.ok = false;
            }
          }
        }

        // ── Step 4: Attribute presence check ──
        if (check_attributes) {
          const requiredAttrs: Array<{ path: string; attribute: string }> = [];
          for (const pop of scanData.pops || []) {
            const attrs = ATTRIBUTE_RULES[pop.opType] || [];
            for (const attr of attrs) {
              requiredAttrs.push({ path: pop.path, attribute: attr });
            }
          }

          if (requiredAttrs.length > 0) {
            // Use existing attribute check code pattern
            const safeChecks = requiredAttrs.map((c) => ({
              p: c.path.replace(/'/g, "\\'"),
              a: c.attribute.replace(/'/g, "\\'"),
            }));

            const attrCode = `
import json
results = []
checks = [${safeChecks.map((c) => `{\"p\":\"${c.p}\",\"a\":\"${c.a}\"}`).join(", ")}]
for c in checks:
    t = op(c["p"])
    if t is None:
        results.append({"path": c["p"], "attribute": c["a"], "present": False, "error": "Operator not found"})
        continue
    found = False
    try:
        for par in t.pars():
            if par.name == c["a"]:
                found = True
                break
    except:
        pass
    if not found:
        try:
            if hasattr(t, 'points') and callable(t.points):
                pts = t.points(c["a"])
                if pts is not None:
                    found = True
        except:
            pass
    if not found:
        try:
            if hasattr(t, 'chans'):
                for ch in t.chans():
                    if ch.name == c["a"]:
                        found = True
                        break
        except:
            pass
    results.append({"path": c["p"], "attribute": c["a"], "present": found})
print(json.dumps(results))
`;
            const attrResult = await client.execute(attrCode, "/");
            let attrData: any[];
            try {
              attrData = JSON.parse(attrResult.stdout || "[]");
            } catch {
              attrData = [];
            }

            for (const r of attrData) {
              if (!r.present) {
                result.violations.push({
                  severity: "warning",
                  rule: "missing_attribute",
                  path: r.path,
                  message: `Missing attribute '${r.attribute}' — required by ${r.path.split("/").pop()}`,
                  fix: `Add attributePOP before this operator to initialize '${r.attribute}'`,
                });
                result.fixSuggestions.push(
                  `[WARNING] ${r.path}: missing attribute '${r.attribute}' — add attributePOP to initialize`,
                );
              }
            }
          }
        }

        // ── Summary ──
        const errors = result.violations.filter(
          (v: any) => v.severity === "error",
        ).length;
        const warnings = result.violations.filter(
          (v: any) => v.severity === "warning",
        ).length;

        if (result.popSummary.length === 0) {
          result.summary =
            "ℹ️ No POP operators found at the specified path.";
        } else if (errors === 0 && warnings === 0) {
          result.summary = `✅ POP network OK — ${result.popSummary.length} POPs validated, no issues found.`;
        } else if (errors === 0) {
          result.summary = `⚠️ ${warnings} warning(s) in ${result.popSummary.length} POPs — network functional but review suggestions.`;
        } else {
          result.summary = `❌ ${errors} error(s), ${warnings} warning(s) in ${result.popSummary.length} POPs — fix errors before running.`;
        }

        return ok(result);
      } catch (e: any) {
        return err(e);
      }
    },
  );
}
