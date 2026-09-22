import { z } from "zod";
import { ok, err } from "../helpers.js";
/** Parse "srcA->nz:0,nz->mg:0,srcB->mg:1" into a set of expected edges. */
export function parseEdgeSpec(spec) {
    const edges = [];
    for (const part of spec.split(",")) {
        const trimmed = part.trim();
        if (!trimmed)
            continue;
        const m = trimmed.match(/^(.+?)->(.+?):(\d+)$/);
        if (!m) {
            throw new Error(`Invalid edge spec part "${trimmed}". Expected "from->to:input" (e.g. "srcA->nz:0"), full spec: "${spec}"`);
        }
        edges.push({ from: m[1].trim(), to: m[2].trim(), input: parseInt(m[3], 10) });
    }
    if (edges.length === 0) {
        throw new Error(`Edge spec produced no edges: "${spec}"`);
    }
    return edges;
}
/** Format an edge as "from->to:input" for compact reporting. */
export function formatEdge(e) {
    return `${e.from}->${e.to}:${e.input}`;
}
function edgeKey(e) {
    return `${e.from}|${e.to}|${e.input}`;
}
/** Core comparison: expected vs real edge set (from /connections). */
export function verifyWiring(path, expected, actualEdges) {
    const expectedKeys = new Set(expected.map(edgeKey));
    const actualKeys = new Set(actualEdges.map(edgeKey));
    const missing = expected.filter((e) => !actualKeys.has(edgeKey(e)));
    const unexpected = actualEdges.filter((e) => !expectedKeys.has(edgeKey(e)));
    const actual = [...actualEdges]
        .sort((a, b) => a.from.localeCompare(b.from) || a.input - b.input || a.to.localeCompare(b.to))
        .map(formatEdge);
    return {
        path,
        ok: missing.length === 0 && unexpected.length === 0,
        totalEdges: actualEdges.length,
        missing: missing.map(formatEdge),
        unexpected: unexpected.map(formatEdge),
        actual,
    };
}
export function registerWiringCheckTools(server, client) {
    server.registerTool("td_verify_wiring", {
        title: "Verify Wiring",
        description: "Post-build wiring check (AGENTS.md rule 16): verify a freshly built network's real TouchDesigner wiring via GET /connections instead of trusting build output. Expected edges are compared as a set of (from, to, input); missing wires, missing outputs and wrong input indices are all reported by name.",
        inputSchema: {
            path: z.string().describe("Container path whose children's wiring is checked (e.g. /project1/my_net)"),
            expect: z
                .string()
                .optional()
                .describe('Expected edges as "from->to:input" pairs: "srcA->nz:0,nz->mg:0,srcB->mg:1,mg->out:0" (names are matched against the edge from/to fields)'),
            edges: z
                .array(z.object({
                from: z.string(),
                to: z.string(),
                input: z.number().int().min(0),
            }))
                .optional()
                .describe("Alternative structured form of the expected edges"),
            recurse: z
                .boolean()
                .optional()
                .default(true)
                .describe("Include nested container wiring (default true, matches /connections?recurse=1)"),
        },
    }, async ({ path: containerPath, expect, edges, recurse }) => {
        try {
            let expected;
            try {
                expected = expect ? parseEdgeSpec(expect) : (edges ?? []);
            }
            catch (e) {
                return err(new Error(`Bad expected-edges input: ${e.message}`));
            }
            if (expected.length === 0) {
                return err(new Error("No expected edges given: pass expect=\"from->to:input,...\" or edges=[{from,to,input}]"));
            }
            const conn = await client.getConnections(containerPath, recurse ?? true);
            const result = verifyWiring(containerPath, expected, conn.connections ?? []);
            return ok({
                ...result,
                missingCount: result.missing.length,
                unexpectedCount: result.unexpected.length,
                hint: result.ok
                    ? "Wiring matches the expectation exactly."
                    : "Compare with AGENTS.md rule 12 (multi-input wiring) and fix the named edges, then re-run this check.",
            });
        }
        catch (e) {
            return err(e);
        }
    });
}
