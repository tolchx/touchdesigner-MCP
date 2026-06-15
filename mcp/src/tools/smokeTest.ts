import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TDClient } from "td-api";
import { z } from "zod";
import { ok, err } from "../helpers.js";

// ─── Smoke Test Result Types ─────────────────────────────────────────────────

interface OperatorExistsCheck {
  path: string;
  exists: boolean;
  opType?: string;
  name?: string;
}

interface ConnectionCheck {
  sourcePath: string;
  targetPath: string;
  inputIndex: number;
  connected: boolean;
  actualSource?: string;
  error?: string;
}

interface FeedbackLoopCheck {
  path: string;
  hasLoop: boolean;
  loopChain: string[];
  error?: string;
}

interface AttributeCheck {
  path: string;
  attributeName: string;
  present: boolean;
  value?: unknown;
  error?: string;
}

interface SmokeTestResult {
  ok: boolean;
  path: string;
  timestamp: string;
  tiers: {
    operatorExists: { passed: number; failed: number; total: number; details: OperatorExistsCheck[] };
    connections: { passed: number; failed: number; total: number; details: ConnectionCheck[] };
    feedbackLoops: { passed: number; failed: number; total: number; details: FeedbackLoopCheck[] };
    attributes: { passed: number; failed: number; total: number; details: AttributeCheck[] };
  };
  summary: string;
  fixSuggestions: string[];
}

// ─── Python Code Generators ──────────────────────────────────────────────────

/**
 * Build Python code to verify that operators exist at expected paths.
 */
function buildOperatorExistsCode(paths: string[]): string {
  const safePaths = paths.map((p) => p.replace(/'/g, "\\'"));
  return `
import json
results = []
paths = [${safePaths.map((p) => `'${p}'`).join(", ")}]
for p in paths:
    t = op(p)
    if t is None:
        results.append({"path": p, "exists": False})
    else:
        results.append({
            "path": p,
            "exists": True,
            "opType": t.OPType if hasattr(t, 'OPType') else "?",
            "name": t.name if hasattr(t, 'name') else "?",
        })
print(json.dumps(results))
`;
}

/**
 * Build Python code to verify connections between operators.
 */
function buildConnectionCheckCode(
  connections: Array<{
    sourcePath: string;
    targetPath: string;
    inputIndex: number;
  }>,
): string {
  const safeConns = connections.map((c) => ({
    s: c.sourcePath.replace(/'/g, "\\'"),
    t: c.targetPath.replace(/'/g, "\\'"),
    i: c.inputIndex,
  }));

  return `
import json
results = []
conns = [${safeConns.map((c) => `{"s":"${c.s}","t":"${c.t}","i":${c.i}}`).join(", ")}]
for c in conns:
    tgt = op(c["t"])
    if tgt is None:
        results.append({"sourcePath": c["s"], "targetPath": c["t"], "inputIndex": c["i"], "connected": False, "error": "Target not found"})
        continue
    try:
        ic = tgt.inputConnectors
        if len(ic) <= c["i"]:
            results.append({"sourcePath": c["s"], "targetPath": c["t"], "inputIndex": c["i"], "connected": False, "error": "Input index " + str(c["i"]) + " out of range (has " + str(len(ic)) + ")"})
            continue
        conns = ic[c["i"]].connections
        if conns and len(conns) > 0:
            actual = conns[0].owner.path
            connected = actual == c["s"]
            results.append({"sourcePath": c["s"], "targetPath": c["t"], "inputIndex": c["i"], "connected": connected, "actualSource": actual, "error": None if connected else "Expected " + c["s"] + " but got " + actual})
        else:
            results.append({"sourcePath": c["s"], "targetPath": c["t"], "inputIndex": c["i"], "connected": False, "error": "No connection on input " + str(c["i"])})
    except Exception as e:
        results.append({"sourcePath": c["s"], "targetPath": c["t"], "inputIndex": c["i"], "connected": False, "error": str(e)})
print(json.dumps(results))
`;
}

/**
 * Build Python code to detect feedback loops starting from a given path.
 */
function buildFeedbackLoopCode(
  paths: string[],
): string {
  const safePaths = paths.map((p) => p.replace(/'/g, "\\'"));
  return `
import json
results = []
targets = [${safePaths.map((p) => `'${p}'`).join(", ")}]
for start_path in targets:
    start = op(start_path)
    if start is None:
        results.append({"path": start_path, "hasLoop": False, "loopChain": [], "error": "Operator not found"})
        continue
    # Walk upstream from the start operator looking for cycles
    visited = set()
    stack = [start]
    chain = []
    found_loop = False
    loop_chain = []
    depth = 0
    while stack and depth < 100:
        node = stack.pop()
        if node is None or node.path in visited:
            if node and node.path in chain:
                idx = chain.index(node.path)
                loop_chain = chain[idx:] + [node.path]
                found_loop = True
            break
        visited.add(node.path)
        chain.append(node.path)
        # Follow input connections upstream
        try:
            for ic in node.inputConnectors:
                try:
                    for conn in ic.connections:
                        if conn.owner and conn.owner.path not in visited:
                            stack.append(conn.owner)
                except:
                    pass
        except:
            pass
        depth += 1
    results.append({"path": start_path, "hasLoop": found_loop, "loopChain": loop_chain})
print(json.dumps(results))
`;
}

/**
 * Build Python code to check that mandatory attributes exist on operators.
 */
function buildAttributeCheckCode(
  checks: Array<{ path: string; attributeName: string }>,
): string {
  const safeChecks = checks.map((c) => ({
    p: c.path.replace(/'/g, "\\'"),
    a: c.attributeName.replace(/'/g, "\\'"),
  }));

  return `
import json
results = []
checks = [${safeChecks.map((c) => `{"p":"${c.p}","a":"${c.a}"}`).join(", ")}]
for c in checks:
    t = op(c["p"])
    if t is None:
        results.append({"path": c["p"], "attributeName": c["a"], "present": False, "error": "Operator not found"})
        continue
    found = False
    val = None
    # Check pars (custom parameters)
    try:
        for par in t.pars():
            if par.name == c["a"]:
                found = True
                val = par.val
                break
    except:
        pass
    # Check attributes on POP/SOP
    if not found:
        try:
            if hasattr(t, 'points') and callable(t.points):
                pts = t.points(c["a"])
                if pts is not None:
                    found = True
                    val = str(pts)[:100]
        except:
            pass
    # Check CHOP channels
    if not found:
        try:
            if hasattr(t, 'chans'):
                for ch in t.chans():
                    if ch.name == c["a"]:
                        found = True
                        val = ch.val
                        break
        except:
            pass
    results.append({"path": c["p"], "attributeName": c["a"], "present": found, "value": val})
print(json.dumps(results))
`;
}

// ─── Tool Registration ───────────────────────────────────────────────────────

export function registerSmokeTestTools(server: McpServer, client: TDClient) {
  // ---------------------------------------------------------------------------
  // td_smoke_test
  // ---------------------------------------------------------------------------
  server.registerTool(
    "td_smoke_test",
    {
      title: "Functional Smoke Test",
      description:
        "Run functional smoke tests on a TouchDesigner network after building. " +
        "Verifies: (1) operators exist at expected paths, (2) connections are wired correctly, " +
        "(3) feedback loops are intact, (4) mandatory attributes are present. " +
        "Returns a structured report with pass/fail per tier and fix suggestions.",
      inputSchema: {
        path: z
          .string()
          .describe("Root path of the network to test (e.g. '/project1/mySystem')"),
        expected_operators: z
          .array(z.string())
          .optional()
          .describe(
            "List of operator paths that must exist (e.g. ['/project1/mySystem/noise1', '/project1/mySystem/null1'])",
          ),
        expected_connections: z
          .array(
            z.object({
              source: z.string().describe("Source operator path"),
              target: z.string().describe("Target operator path"),
              input: z.number().optional().default(0).describe("Input index (default 0)"),
            }),
          )
          .optional()
          .describe("Connections that must be wired"),
        check_feedback_loops: z
          .array(z.string())
          .optional()
          .describe(
            "Operator paths where feedback loops should exist (e.g. feedback POPs, nullPOP feedback targets)",
          ),
        check_attributes: z
          .array(
            z.object({
              path: z.string().describe("Operator path"),
              attribute: z.string().describe("Attribute name (e.g. 'P', 'Cd', 'PartVel')"),
            }),
          )
          .optional()
          .describe("Mandatory attributes that must be present on operators"),
      },
    },
    async ({
      path: rootPath,
      expected_operators,
      expected_connections,
      check_feedback_loops,
      check_attributes,
    }) => {
      try {
        const result: SmokeTestResult = {
          ok: true,
          path: rootPath,
          timestamp: new Date().toISOString(),
          tiers: {
            operatorExists: {
              passed: 0,
              failed: 0,
              total: 0,
              details: [],
            },
            connections: {
              passed: 0,
              failed: 0,
              total: 0,
              details: [],
            },
            feedbackLoops: {
              passed: 0,
              failed: 0,
              total: 0,
              details: [],
            },
            attributes: {
              passed: 0,
              failed: 0,
              total: 0,
              details: [],
            },
          },
          summary: "",
          fixSuggestions: [],
        };

        // ── Tier 3a: Operator Existence ──
        const opPaths = expected_operators ?? [];
        if (opPaths.length > 0) {
          const code = buildOperatorExistsCode(opPaths);
          const execResult = await client.execute(code, "/");
          try {
            const opResults: OperatorExistsCheck[] = JSON.parse(
              (execResult as any)?.output || "[]",
            );
            result.tiers.operatorExists.total = opResults.length;
            result.tiers.operatorExists.details = opResults;
            for (const r of opResults) {
              if (r.exists) result.tiers.operatorExists.passed++;
              else {
                result.tiers.operatorExists.failed++;
                result.ok = false;
                result.fixSuggestions.push(
                  `Create missing operator at '${r.path}' — operator was expected but not found`,
                );
              }
            }
          } catch {
            result.tiers.operatorExists.total = opPaths.length;
            result.tiers.operatorExists.failed = opPaths.length;
            result.ok = false;
          }
        }

        // ── Tier 3b: Connection Verification ──
        const connections = expected_connections ?? [];
        if (connections.length > 0) {
          const connDefs = connections.map((c) => ({
            sourcePath: c.source,
            targetPath: c.target,
            inputIndex: c.input ?? 0,
          }));
          const code = buildConnectionCheckCode(connDefs);
          const execResult = await client.execute(code, "/");
          try {
            const connResults: ConnectionCheck[] = JSON.parse(
              (execResult as any)?.output || "[]",
            );
            result.tiers.connections.total = connResults.length;
            result.tiers.connections.details = connResults;
            for (const r of connResults) {
              if (r.connected) result.tiers.connections.passed++;
              else {
                result.tiers.connections.failed++;
                result.ok = false;
                result.fixSuggestions.push(
                  `Fix connection: ${r.sourcePath} → ${r.targetPath} input[${r.inputIndex}]: ${r.error || "not connected"}`,
                );
              }
            }
          } catch {
            result.tiers.connections.total = connections.length;
            result.tiers.connections.failed = connections.length;
            result.ok = false;
          }
        }

        // ── Tier 3c: Feedback Loop Detection ──
        const loopPaths = check_feedback_loops ?? [];
        if (loopPaths.length > 0) {
          const code = buildFeedbackLoopCode(loopPaths);
          const execResult = await client.execute(code, "/");
          try {
            const loopResults: FeedbackLoopCheck[] = JSON.parse(
              (execResult as any)?.output || "[]",
            );
            result.tiers.feedbackLoops.total = loopResults.length;
            result.tiers.feedbackLoops.details = loopResults;
            for (const r of loopResults) {
              if (r.hasLoop) result.tiers.feedbackLoops.passed++;
              else {
                result.tiers.feedbackLoops.failed++;
                result.ok = false;
                result.fixSuggestions.push(
                  `Feedback loop broken at '${r.path}' — no upstream cycle detected`,
                );
              }
            }
          } catch {
            result.tiers.feedbackLoops.total = loopPaths.length;
            result.tiers.feedbackLoops.failed = loopPaths.length;
            result.ok = false;
          }
        }

        // ── Tier 3d: Mandatory Attribute Check ──
        const attrChecks = check_attributes ?? [];
        if (attrChecks.length > 0) {
          const code = buildAttributeCheckCode(
            attrChecks.map((c) => ({ path: c.path, attributeName: c.attribute })),
          );
          const execResult = await client.execute(code, "/");
          try {
            const attrResults: AttributeCheck[] = JSON.parse(
              (execResult as any)?.output || "[]",
            );
            result.tiers.attributes.total = attrResults.length;
            result.tiers.attributes.details = attrResults;
            for (const r of attrResults) {
              if (r.present) result.tiers.attributes.passed++;
              else {
                result.tiers.attributes.failed++;
                result.ok = false;
                result.fixSuggestions.push(
                  `Missing attribute '${r.attributeName}' on '${r.path}'${r.error ? `: ${r.error}` : ""}`,
                );
              }
            }
          } catch {
            result.tiers.attributes.total = attrChecks.length;
            result.tiers.attributes.failed = attrChecks.length;
            result.ok = false;
          }
        }

        // ── Tier 3e: Auto-detect POP attributes (improvement #5) ──
        // If no explicit attribute checks were provided, auto-detect based on POP operators in the network
        const POP_ATTRIBUTE_RULES: Record<string, string[]> = {
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
          copyPOP: ["P", "pscale"],
          fieldPOP: ["P"],
          deletePOP: ["P"],
          limitPOP: ["P"],
          sortPOP: ["P"],
          normalizePOP: ["P"],
          transformPOP: ["P"],
        };
        if (attrChecks.length === 0 && opPaths.length > 0) {
          // Scan for POPs in the network and auto-generate attribute checks
          try {
            const safeRoot = rootPath.replace(/'/g, "\\'");
            const scanCode = `
import json
result = []
target = op('${safeRoot}')
if target:
    def walk(n, d=0):
        if n is None or d > 30: return
        try:
            if hasattr(n, 'OPType') and n.OPType and 'POP' in n.OPType:
                result.append({'path': n.path, 'opType': n.OPType})
        except: pass
        try:
            for c in n.children: walk(c, d+1)
        except: pass
    walk(target)
print(json.dumps(result))
`;
            const scanResult = await client.execute(scanCode, "/");
            const pops: Array<{ path: string; opType: string }> = JSON.parse((scanResult as any)?.output || "[]");
            const autoAttrs: Array<{ path: string; attributeName: string }> = [];
            for (const pop of pops) {
              const required = POP_ATTRIBUTE_RULES[pop.opType] || [];
              for (const attr of required) {
                autoAttrs.push({ path: pop.path, attributeName: attr });
              }
            }
            if (autoAttrs.length > 0) {
              const autoCode = buildAttributeCheckCode(autoAttrs);
              const autoResult = await client.execute(autoCode, "/");
              try {
                const autoResults: AttributeCheck[] = JSON.parse((autoResult as any)?.output || "[]");
                result.tiers.attributes.total += autoResults.length;
                result.tiers.attributes.details.push(...autoResults);
                for (const r of autoResults) {
                  if (r.present) result.tiers.attributes.passed++;
                  else {
                    result.tiers.attributes.failed++;
                    result.ok = false;
                    result.fixSuggestions.push(
                      `Missing POP attribute '${r.attributeName}' on '${r.path}' — add attributePOP to initialize`,
                    );
                  }
                }
              } catch { /* parse failed — skip auto-check */ }
            }
          } catch { /* scan failed — skip auto-check */ }
        }

        // ── Summary ──
        const totalPassed =
          result.tiers.operatorExists.passed +
          result.tiers.connections.passed +
          result.tiers.feedbackLoops.passed +
          result.tiers.attributes.passed;
        const totalFailed =
          result.tiers.operatorExists.failed +
          result.tiers.connections.failed +
          result.tiers.feedbackLoops.failed +
          result.tiers.attributes.failed;
        const totalChecks =
          result.tiers.operatorExists.total +
          result.tiers.connections.total +
          result.tiers.feedbackLoops.total +
          result.tiers.attributes.total;

        if (totalChecks === 0) {
          result.summary =
            "ℹ️ No smoke test checks specified. Provide expected_operators, expected_connections, check_feedback_loops, or check_attributes.";
        } else if (result.ok) {
          result.summary = `✅ All ${totalChecks} smoke test checks passed (${totalPassed}/${totalChecks}).`;
        } else {
          result.summary =
            `❌ ${totalFailed}/${totalChecks} smoke test check(s) failed. ` +
            `${result.fixSuggestions.length} fix suggestion(s) available.`;
        }

        return ok(result);
      } catch (e: any) {
        return err(e);
      }
    },
  );
}
