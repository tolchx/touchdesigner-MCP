/**
 * Apply Network Graph — Push a planned graph to TouchDesigner
 *
 * Creates nodes, wires connections, and runs post-build verification.
 * Extracted from networkPlannerGraph.ts for single-responsibility.
 */
import { buildVerifyFix, verifyAndFixConnections } from "./buildVerifyFix.js";
/**
 * Apply a network graph to TouchDesigner: create nodes, then wire connections.
 * Creates nodes first (all must succeed), then wires in topological order
 * (sources first, then targets).
 */
export async function applyNetworkGraph(client, graph) {
    const errors = [];
    let created = 0;
    let connected = 0;
    // Map node id → TD path
    const pathMap = new Map();
    // Phase 1: Create all nodes
    for (const node of graph.nodes) {
        try {
            const result = await client.createOperator(node.opType, node.label, node.parentPath, node.x, node.y);
            const tdPath = result.path || `${node.parentPath}/${node.label}`;
            pathMap.set(node.id, tdPath);
            created++;
            // Set parameters if provided
            if (node.parameters && Object.keys(node.parameters).length > 0) {
                try {
                    const updates = Object.entries(node.parameters).map(([name, value]) => ({
                        name,
                        value,
                    }));
                    await client.setParameters(tdPath, updates);
                }
                catch (parErr) {
                    errors.push(`Params for ${node.id} (${tdPath}): ${parErr.message}`);
                }
            }
        }
        catch (e) {
            errors.push(`Create ${node.id} (${node.opType}): ${e.message}`);
        }
    }
    // Phase 2: Wire connections (topological order: sources first)
    const inDegree = new Map();
    for (const conn of graph.connections) {
        inDegree.set(conn.to, (inDegree.get(conn.to) || 0) + 1);
    }
    const sortedConns = [...graph.connections].sort((a, b) => {
        const aDeg = inDegree.get(a.to) || 0;
        const bDeg = inDegree.get(b.to) || 0;
        return aDeg - bDeg;
    });
    for (const conn of sortedConns) {
        const sourcePath = pathMap.get(conn.from);
        const targetPath = pathMap.get(conn.to);
        if (!sourcePath || !targetPath) {
            errors.push(`Connect ${conn.from}→${conn.to}: missing path`);
            continue;
        }
        try {
            await client.connectNodes(sourcePath, targetPath, conn.inputIndex);
            connected++;
        }
        catch (e) {
            errors.push(`Connect ${conn.from}→${conn.to}[${conn.inputIndex}]: ${e.message}`);
        }
    }
    // Phase 3: Verify and fix connections that failed
    if (connected < graph.connections.length) {
        const connResults = await verifyAndFixConnections(client, sortedConns
            .filter(c => pathMap.has(c.from) && pathMap.has(c.to))
            .map(c => ({
            sourcePath: pathMap.get(c.from),
            targetPath: pathMap.get(c.to),
            inputIndex: c.inputIndex,
        })));
        connected += connResults.fixed.length;
        for (const fix of connResults.fixed) {
            errors.push(`Re-wired: ${fix.fromPath}→${fix.toPath}[${fix.inputIndex}]`);
        }
    }
    // Phase 4: Run build-verify-fix on the target path
    try {
        const verify = await buildVerifyFix({
            client,
            path: graph.targetPath,
            autoFix: true,
            verifyConnections: true,
        });
        if (!verify.ok) {
            errors.push(`Post-build validation: ${verify.summary}`);
        }
    }
    catch (vErr) {
        errors.push(`Validation: ${vErr.message}`);
    }
    return {
        success: errors.length === 0,
        created,
        connected,
        errors,
    };
}
