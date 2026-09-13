/**
 * td_import_toe_dir — Rebuild a TouchDesigner network from an expanded
 * Toe_Expand .toe.dir (plain-text dump), with per-node verification
 * against the dump.
 *
 * Method (verified live on TD 2025.32460, see docs/TOE_REPLICATION.md):
 *   1. Parse `<scope>/*.n` (type, tile position, inputs) and `<scope>/*.parm`
 *      (values; the real value is the LAST column of each line).
 *   2. Generate ONE /exec Python script that creates the container, operators,
 *      wires them with the verified recipe (`src.outputConnectors[0].connect(dst)`),
 *      sets parameters defensively (missing params → drift log, never fail),
 *      then cooks every node and returns per-node verification JSON.
 *      Per-node fault tolerance: unknown/uncreatable dump types land in
 *      `unsupported` and wire failures in `wire_errors` — the rest of the
 *      network is still built and verified (evidence run 2026-09-12).
 *   3. The tool compares TD's verification report against the dump and
 *      returns a per-node match table.
 *
 * Parsing notes from the real corpus:
 *   - `.n` header line is `FAMILY:type` (e.g. `POP:grid`, `TOP:noise`).
 *   - `.n` tile line: `tile x y w h` → nodeX/nodeY.
 *   - `.n` inputs block: `N\t<name>` lines between `inputs\n{` and `}`.
 *   - `.parm` lines: `name <state> <value>` separated by `?` blocks. The
 *     trailing integer is dump state, NOT the value (e.g. `pt1posx 67108928 10`
 *     → value 10). Toggles serialize like `cpureadback 0 on` → value `on`.
 *   - Param names can be stale vs the live build (Facet's `pt1pos*` does not
 *     exist on 2025.32460 linePOP) — setting is always defensive.
 */
import { z } from "zod";
import * as fs from "node:fs";
import * as path from "node:path";
import { ok, err } from "../helpers.js";
// ─── Parsers (pure, unit-testable) ──────────────────────────────────────────
const FAMILY_RE = /^(COMP|TOP|CHOP|SOP|POP|DAT|MAT|PANEL):(.+)$/;
/** Parse one `.n` file body into node info (without params). */
export function parseNFile(content, name) {
    const lines = content.split(/\r?\n/);
    let rawType = null;
    let nodeX = 0;
    let nodeY = 0;
    let display = false;
    const inputs = [];
    let inInputs = false;
    for (const raw of lines) {
        const line = raw.trim();
        if (!rawType) {
            const m = FAMILY_RE.exec(line);
            if (m) {
                rawType = line;
                continue;
            }
        }
        if (line.startsWith("tile ")) {
            const parts = line.split(/\s+/);
            nodeX = Number(parts[1]) || 0;
            nodeY = Number(parts[2]) || 0;
            continue;
        }
        if (line.startsWith("flags")) {
            display = /\bdisplay\s+on\b/.test(line);
            continue;
        }
        if (line === "inputs") {
            inInputs = true;
            continue;
        }
        if (inInputs) {
            if (line === "}" || line === "end") {
                inInputs = false;
                continue;
            }
            const parts = line.split("\t").map((p) => p.trim());
            if (parts.length >= 2 && /^\d+$/.test(parts[0])) {
                inputs[Number(parts[0])] = parts[1];
            }
        }
    }
    if (!rawType)
        return null;
    const m = FAMILY_RE.exec(rawType);
    if (!m)
        return null;
    return {
        name,
        rawType,
        family: m[1],
        opType: m[2],
        nodeX,
        nodeY,
        inputs: inputs.filter(Boolean),
        display,
        params: {},
    };
}
/**
 * Parse a `.parm` file: blocks separated by `?` lines, each real line is
 * `name <state> <value>`. The real value is the LAST column (dump state
 * integer is in the middle and is not a value).
 */
export function parseParmFile(content) {
    const params = {};
    for (const raw of content.split(/\r?\n/)) {
        const line = raw.trim();
        if (!line || line === "?")
            continue;
        const parts = line.split(/\s+/);
        if (parts.length < 2)
            continue;
        const name = parts[0];
        // value = last column; with 3+ columns skip the state integer in between
        const value = parts.length >= 3 ? parts[parts.length - 1] : "";
        params[name] = value;
    }
    return params;
}
/** Convert dump type token to a TD Python class name, e.g. "POP:grid" → "gridPOP". */
export function dumpTypeToPyClass(rawType) {
    const m = FAMILY_RE.exec(rawType.trim());
    if (!m)
        return null;
    const family = m[1];
    if (family === "PANEL")
        return null; // panel comps are not created this way
    const base = m[2];
    return `${base}${family}`;
}
/**
 * Build the full dump for one scope directory of a .toe.dir.
 * `scopeDir` is e.g. `<project>.toe.dir/project1`.
 */
export function parseToeDirScope(scopeDir) {
    const dump = { scope: path.basename(scopeDir), nodes: [], wires: [] };
    const files = fs.readdirSync(scopeDir);
    for (const f of files) {
        if (!f.endsWith(".n"))
            continue;
        const name = f.slice(0, -2);
        const node = parseNFile(fs.readFileSync(path.join(scopeDir, f), "utf8"), name);
        if (!node)
            continue;
        const parmPath = path.join(scopeDir, `${name}.parm`);
        if (fs.existsSync(parmPath)) {
            node.params = parseParmFile(fs.readFileSync(parmPath, "utf8"));
        }
        dump.nodes.push(node);
    }
    // wires from inputs (relative names within the same scope)
    for (const node of dump.nodes) {
        node.inputs.forEach((srcName, idx) => {
            if (dump.nodes.some((n) => n.name === srcName)) {
                dump.wires.push([srcName, node.name, idx]);
            }
        });
    }
    return dump;
}
// ─── Python codegen (verified recipe from docs/TOE_REPLICATION.md §5) ───────
function pyStr(v) {
    return `'${v.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}
export function buildImportCode(dump, containerName, parentPath) {
    const containerPath = `${parentPath}/${containerName}`;
    const pyClassOf = new Map(dump.nodes.map((n) => [n.name, dumpTypeToPyClass(n.rawType)]));
    // Per-node fault tolerance (evidence run 2026-09-12): an unknown dump type
    // (e.g. POP:pointgen in current builds) must NOT abort the whole import —
    // it lands in `unsupported` and the rest of the network is still built.
    const createLines = dump.nodes
        .map((n) => {
        const cls = pyClassOf.get(n.name) ?? "null";
        return `    try:\n` +
            `        _cls = getattr(td, ${pyStr(cls)}, None)\n` +
            `        if _cls is None:\n` +
            `            unsupported.append(${pyStr(`${n.name} (${cls ?? "?"})`)})\n` +
            `        else:\n` +
            `            o = base.create(_cls, ${pyStr(n.name)})\n` +
            `            o.nodeX = ${n.nodeX}; o.nodeY = ${n.nodeY}\n` +
            `            created.append(o.name)\n` +
            `    except Exception as _ce:\n` +
            `        unsupported.append(${pyStr(n.name)} + ': ' + str(_ce)[:80])`;
    })
        .join("\n");
    const wireLines = dump.wires
        .map(([src, dst, idx]) => {
        const conn = idx === 0
            ? `base.op(${pyStr(dst)})`
            : `base.op(${pyStr(dst)}).inputConnectors[${idx}]`;
        return `    if base.op(${pyStr(src)}) and base.op(${pyStr(dst)}):\n` +
            `        try:\n` +
            `            base.op(${pyStr(src)}).outputConnectors[0].connect(${conn})\n` +
            `            wired.append(${pyStr(`${src}->${dst}`)})\n` +
            `        except Exception as _we:\n` +
            `            wire_errors.append(${pyStr(`${src}->${dst}`)} + ': ' + str(_we)[:80])`;
    })
        .join("\n");
    // Defensive param setting: only settable params are touched; everything
    // else lands in drift with the exact param name.
    const paramLines = [];
    for (const n of dump.nodes) {
        for (const [pname, rawVal] of Object.entries(n.params)) {
            const num = Number(rawVal);
            const lit = rawVal !== "" && Number.isFinite(num) ? String(num) : pyStr(rawVal);
            paramLines.push(`    p = base.op(${pyStr(n.name)})\n` +
                `    if p is not None and hasattr(p.par, ${pyStr(pname)}):\n` +
                `        try:\n` +
                `            setattr(p.par, ${pyStr(pname)}, ${lit})\n` +
                `            set_params.append(p.name + '.' + ${pyStr(pname)})\n` +
                `        except Exception as _e:\n` +
                `            drift[p.name + '.' + ${pyStr(pname)}] = 'set failed: ' + str(_e)[:80]\n` +
                `    else:\n` +
                `        drift[${pyStr(`${n.name}.${pname}`)}] = 'param not in live build'`);
        }
    }
    const verifyNames = dump.nodes.map((n) => pyStr(n.name)).join(", ");
    // Flat structure: everything lives at one indent level inside `try:` so
    // no template concatenation can glue a block into the wrong branch.
    return `import json
res = {"container": None, "created": [], "unsupported": [], "wired": [], "wire_errors": [], "set_params": [], "drift": {}, "verification": {}}
try:
    parent = op(${pyStr(parentPath)})
    if parent is None:
        raise RuntimeError('parent not found: ${parentPath}')
    base = parent.create(td.baseCOMP, ${pyStr(containerName)})
    res["container"] = base.path
    created = res["created"]; unsupported = res["unsupported"]
    wired = res["wired"]; wire_errors = res["wire_errors"]
    set_params = res["set_params"]; drift = res["drift"]
${createLines}
${wireLines}
${paramLines.join("\n")}
    for nm in [${verifyNames}]:
        o = base.op(nm)
        if o is None:
            res["verification"][nm] = {"present": False}
            continue
        o.cook(force=True)
        v = {"present": True, "errors": o.errors() or ""}
        try:
            v["numPoints"] = int(o.numPoints())
            v["numPrims"] = int(o.numPrims())
        except Exception:
            pass
        try:
            v["inputs"] = [i.name for i in o.inputs]
        except Exception:
            v["inputs"] = []
        v["nodeX"] = int(o.nodeX); v["nodeY"] = int(o.nodeY)
        res["verification"][nm] = v
except Exception as _e:
    res["error"] = str(_e)[:400]
print(json.dumps(res))
`;
}
/** Compare TD's per-node verification payload against the dump. Pure function. */
export function verifyAgainstDump(dump, verification) {
    const checks = [];
    for (const n of dump.nodes) {
        const v = verification[n.name];
        if (!v || v.present === false) {
            checks.push({
                node: n.name,
                checks: { present: false, type: false, position: false, inputs: false, clean: false },
                geometry: { numPoints: null, numPrims: null },
                errors: "missing after import",
            });
            continue;
        }
        const expectedInputs = n.inputs.filter((i) => dump.nodes.some((d) => d.name === i));
        const gotInputs = Array.isArray(v.inputs) ? v.inputs : [];
        checks.push({
            node: n.name,
            checks: {
                present: true,
                type: true, // type is enforced at create time via td class
                position: Number(v.nodeX) === n.nodeX && Number(v.nodeY) === n.nodeY,
                inputs: expectedInputs.length === gotInputs.length &&
                    expectedInputs.every((s, i) => gotInputs[i] === s),
                clean: (v.errors ?? "") === "",
            },
            geometry: {
                numPoints: typeof v.numPoints === "number" ? v.numPoints : null,
                numPrims: typeof v.numPrims === "number" ? v.numPrims : null,
            },
            errors: v.errors ?? "",
        });
    }
    const allOk = checks.every((c) => c.checks.present && c.checks.inputs && c.checks.clean);
    const geometrySignature = {};
    for (const c of checks)
        geometrySignature[c.node] = c.geometry;
    return { checks, allOk, geometrySignature };
}
// ─── MCP tool registration ──────────────────────────────────────────────────
export function registerToeImportTools(server, client) {
    server.registerTool("td_import_toe_dir", {
        title: "Import Toe_Expand .toe.dir network",
        description: "Rebuild a TouchDesigner network from an expanded Toe_Expand .toe.dir " +
            "(plain-text dump). Parses *.n/*.parm in the chosen scope, generates one " +
            "/exec batch that creates the container + operators, wires them with the " +
            "verified recipe (src.outputConnectors[0].connect(dst)), sets params " +
            "defensively (missing params → drift log), cooks everything and verifies " +
            "each node against the dump (presence, position, inputs, clean cook, " +
            "geometry). Requires a live TD connection.",
        inputSchema: {
            toe_dir: z.string().describe("Absolute path to the .toe.dir directory (e.g. C:/.../Facet.toe.dir)"),
            scope: z.string().optional().default("project1")
                .describe("Subdirectory of the .toe.dir to import (network name), e.g. 'project1'"),
            container_name: z.string().optional()
                .describe("Name of the baseCOMP container to create. Default: <scope>_imported_<timestamp>"),
            parent_path: z.string().optional().default("/project1")
                .describe("Where to create the import container"),
        },
    }, async ({ toe_dir, scope, container_name, parent_path }) => {
        try {
            const scopeDir = path.join(toe_dir, scope || "project1");
            if (!fs.existsSync(scopeDir)) {
                return err(new Error(`Scope directory not found: ${scopeDir}`));
            }
            const dump = parseToeDirScope(scopeDir);
            if (dump.nodes.length === 0) {
                return err(new Error(`No .n files parsed in ${scopeDir}`));
            }
            const now = new Date();
            const pad = (v) => String(v).padStart(2, "0");
            const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
            const name = container_name ||
                `${(scope || "imported").toLowerCase()}_imported_${stamp}`;
            const code = buildImportCode(dump, name, parent_path || "/project1");
            const result = await client.execute(code);
            if (!result.success) {
                return err(new Error(`TD exec failed: ${result.stderr || "unknown"}`));
            }
            // The /exec handler prints our JSON as the script's stdout.
            let payload = null;
            try {
                payload = JSON.parse(result.stdout.trim());
            }
            catch {
                return err(new Error(`Could not parse TD verification output: ${result.stdout.slice(0, 300)}`));
            }
            if (payload.error) {
                return err(new Error(`TD import error: ${payload.error}`));
            }
            const verdict = verifyAgainstDump(dump, payload.verification ?? {});
            return ok({
                container: payload.container,
                dump: {
                    scope: dump.scope,
                    nodes: dump.nodes.map((n) => ({
                        name: n.name, type: n.rawType, position: [n.nodeX, n.nodeY],
                        inputs: n.inputs, params: Object.keys(n.params).length,
                    })),
                    wires: dump.wires.map(([s, d, i]) => `${s}[${i}]->${d}`),
                },
                created: payload.created ?? [],
                unsupported: payload.unsupported ?? [],
                wired: payload.wired ?? [],
                wire_errors: payload.wire_errors ?? [],
                params_set: (payload.set_params ?? []).length,
                drift: payload.drift ?? {},
                verification: {
                    all_ok: verdict.allOk,
                    per_node: verdict.checks,
                    geometry_signature: verdict.geometrySignature,
                },
                next_steps: verdict.allOk
                    ? "Network replicated and verified against the dump."
                    : "Review verification.per_node — some checks failed vs the dump.",
            });
        }
        catch (e) {
            return err(e);
        }
    });
}
