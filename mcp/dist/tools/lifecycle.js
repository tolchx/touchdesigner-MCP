import { z } from "zod";
import { ok, err } from "../helpers.js";
export function registerLifecycleTools(server, client) {
    // ---------------------------------------------------------------------------
    // td_project_lifecycle
    // ---------------------------------------------------------------------------
    server.registerTool("td_project_lifecycle", {
        title: "Project Lifecycle",
        description: "Control TouchDesigner project lifecycle: save, load, undo, redo, start/end undo block, or clear undo history.",
        inputSchema: {
            action: z
                .enum([
                "save",
                "load",
                "undo",
                "redo",
                "start_undo_block",
                "end_undo_block",
                "clear_undo",
            ])
                .describe("Lifecycle action to perform"),
            path: z
                .string()
                .optional()
                .describe("File path for save/load actions"),
        },
    }, async ({ action, path: filePath }) => {
        try {
            const result = await client.projectLifecycle(action, filePath);
            return ok(result);
        }
        catch (e) {
            return err(e);
        }
    });
    // ---------------------------------------------------------------------------
    // td_snapshot_scene
    // ---------------------------------------------------------------------------
    server.registerTool("td_snapshot_scene", {
        title: "Snapshot Scene",
        description: "Save a snapshot of an operator's state (all par values, modes, expressions) to a JSON structure. Useful before destructive changes.",
        inputSchema: {
            path: z
                .string()
                .default("/")
                .describe("Root operator path for snapshot"),
        },
    }, async ({ path: opPath }) => {
        try {
            const result = await client.snapshotScene(opPath);
            return ok(result);
        }
        catch (e) {
            return err(e);
        }
    });
    // ---------------------------------------------------------------------------
    // td_memory_save
    // ---------------------------------------------------------------------------
    server.registerTool("td_memory_save", {
        title: "Save Memory",
        description: "Save a persistent memory entry with key, content, and optional tags. Memories survive across sessions.",
        inputSchema: {
            key: z.string().describe("Unique memory key"),
            content: z.string().describe("Memory content"),
            tags: z
                .array(z.string())
                .optional()
                .describe("Optional tags for categorization"),
        },
    }, async ({ key, content, tags }) => {
        try {
            const result = await client.memorySave(key, content, tags);
            return ok(result);
        }
        catch (e) {
            return err(e);
        }
    });
    // ---------------------------------------------------------------------------
    // td_memory_recall
    // ---------------------------------------------------------------------------
    server.registerTool("td_memory_recall", {
        title: "Recall Memory",
        description: "Search saved memories by query text. Returns scored results from persistent memory store.",
        inputSchema: {
            query: z.string().describe("Search query"),
            limit: z
                .number()
                .optional()
                .default(5)
                .describe("Max results"),
        },
    }, async ({ query, limit }) => {
        try {
            const result = await client.memoryRecall(query, limit ?? 5);
            return ok(result);
        }
        catch (e) {
            return err(e);
        }
    });
}
