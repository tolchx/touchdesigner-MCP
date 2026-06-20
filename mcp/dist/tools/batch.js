import { z } from "zod";
import { ok, err } from "../helpers.js";
let cachedRegistry = null;
function getToolRegistry(client) {
    if (cachedRegistry)
        return cachedRegistry;
    const registry = new Map();
    const bind = (name, method) => {
        if (typeof method === "function") {
            registry.set(name, method.bind(client));
        }
    };
    // Bind all TDClient methods by name
    bind("execute", client.execute);
    bind("getPaneState", client.getPaneState);
    bind("getSelection", client.getSelection);
    bind("getOperators", client.getOperators);
    bind("getParameters", client.getParameters);
    bind("setParameters", client.setParameters);
    bind("getConnections", client.getConnections);
    bind("findOperators", client.findOperators);
    bind("healthcheck", client.healthcheck);
    bind("getErrors", client.getErrors);
    bind("getInfo", client.getInfo);
    bind("getFocus", client.getFocus);
    bind("getPerf", client.getPerf);
    bind("createOperator", client.createOperator);
    bind("deleteOperator", client.deleteOperator);
    bind("connectNodes", client.connectNodes);
    bind("disconnect", client.disconnect);
    bind("copyNode", client.copyNode);
    bind("screenshot", client.screenshot);
    bind("getScreenshots", client.getScreenshots);
    bind("projectLifecycle", client.projectLifecycle);
    bind("popInspect", client.popInspect);
    bind("getNodeDetail", client.getNodeDetail);
    bind("getHints", client.getHints);
    bind("getBuildCompatibility", client.getBuildCompatibility);
    bind("getReleaseDelta", client.getReleaseDelta);
    bind("snapshotScene", client.snapshotScene);
    bind("readDat", client.readDat);
    bind("writeDat", client.writeDat);
    bind("readChop", client.readChop);
    bind("searchInTD", client.searchInTD);
    bind("navigateTo", client.navigateTo);
    bind("reinitExtension", client.reinitExtension);
    bind("pulseParam", client.pulseParam);
    bind("customParameters", client.customParameters);
    bind("readTextport", client.readTextport);
    bind("clearTextport", client.clearTextport);
    bind("memorySave", client.memorySave);
    bind("memoryRecall", client.memoryRecall);
    bind("searchOfficialDocs", client.searchOfficialDocs);
    cachedRegistry = registry;
    return registry;
}
export function registerBatchTool(server, client) {
    server.registerTool("tool_batch", {
        title: "Batch Tools",
        description: "Execute multiple tool calls in a single batch. Runs tools sequentially and returns all results together. Max 8 tools per batch.",
        inputSchema: {
            tools: z
                .array(z.object({
                name: z
                    .string()
                    .describe("Tool name (e.g. 'getNodeDetail', 'execute')"),
                args: z
                    .record(z.unknown())
                    .optional()
                    .default({})
                    .describe("Named arguments object for the tool"),
            }))
                .max(8)
                .describe("Array of tool calls to batch"),
        },
    }, async ({ tools }) => {
        try {
            const registry = getToolRegistry(client);
            const results = [];
            for (const tool of tools) {
                const handler = registry.get(tool.name);
                if (!handler) {
                    results.push({
                        name: tool.name,
                        success: false,
                        error: `Unknown tool: ${tool.name}. Available: ${Array.from(registry.keys()).join(", ")}`,
                    });
                    continue;
                }
                try {
                    const result = await handler(tool.args ?? {});
                    results.push({ name: tool.name, success: true, result });
                }
                catch (e) {
                    results.push({
                        name: tool.name,
                        success: false,
                        error: e instanceof Error ? e.message : String(e),
                    });
                }
            }
            return ok({ success: true, results });
        }
        catch (e) {
            return err(e);
        }
    });
}
