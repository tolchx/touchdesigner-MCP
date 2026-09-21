import { ok, err } from "../helpers.js";
/**
 * Bridge request-history tools (backlog item 09).
 *
 * These wrap the bridge HTTP endpoints POST /undo, POST /redo and
 * GET /history, whose server-side history records ONE entry per bridge write
 * request (/parameters/set, /create, /delete, /connect, /disconnect).
 *
 * NOT to be confused with the in-memory history tools in history.ts
 * (td_history_list/undo/clear), which snapshot scenes from the MCP process
 * and never talk to these endpoints.
 *
 * Scope notes surfaced to agents in the descriptions:
 *   - /exec is NOT recorded (arbitrary code is not reversible by the bridge)
 *   - a NEW write clears the redo branch (standard undo/redo semantics)
 *   - depth cap 50 on the bridge, FIFO discard of the oldest entry
 *   - empty history -> explicit success:false + hint (never silent)
 */
/** Parse a "_requestViaHttp" error message into the bridge's JSON body when possible. */
function parseBridgeError(e) {
    const message = e instanceof Error ? e.message : String(e);
    const m = message.match(/^HTTP (\d+) [\w\s]*: ([\s\S]+)$/);
    if (m) {
        const status = parseInt(m[1], 10);
        try {
            return { status, body: JSON.parse(m[2]), message };
        }
        catch {
            return { status, message };
        }
    }
    return { message };
}
export function registerBridgeHistoryTools(server, client) {
    // ---------------------------------------------------------------------------
    // td_undo
    // ---------------------------------------------------------------------------
    server.registerTool("td_undo", {
        title: "Undo Last Bridge Write",
        description: "Revert the most recent bridge write request (parameters/set, create, delete, connect, disconnect) via POST /undo. Each undo reverts ONE complete request. /exec code is NOT recorded. A new write clears the redo branch. History is capped at 50 entries, FIFO. Returns success:false with a hint when there is nothing to undo.",
        inputSchema: {},
    }, async () => {
        try {
            const body = await client.undo();
            return ok(body);
        }
        catch (e) {
            const parsed = parseBridgeError(e);
            // Explicit 400 from the bridge (e.g. empty history): surface the hint
            // in-band instead of raising, so agents get actionable guidance.
            if (parsed.body && parsed.body.success === false) {
                return ok({ httpStatus: parsed.status ?? null, ...parsed.body });
            }
            return err(e);
        }
    });
    // ---------------------------------------------------------------------------
    // td_redo
    // ---------------------------------------------------------------------------
    server.registerTool("td_redo", {
        title: "Redo Undone Bridge Write",
        description: "Re-apply the most recently undone bridge write via POST /redo. Only available immediately after td_undo (any new write discards the redo branch). Returns success:false with a hint when there is nothing to redo.",
        inputSchema: {},
    }, async () => {
        try {
            const body = await client.redo();
            return ok(body);
        }
        catch (e) {
            const parsed = parseBridgeError(e);
            if (parsed.body && parsed.body.success === false) {
                return ok({ httpStatus: parsed.status ?? null, ...parsed.body });
            }
            return err(e);
        }
    });
    // ---------------------------------------------------------------------------
    // td_history
    // ---------------------------------------------------------------------------
    server.registerTool("td_history", {
        title: "List Bridge Undo History",
        description: "List the bridge's reversible write operations via GET /history: one-line description per entry plus kind (parameters|ops|wiring). Shape: {maxDepth, canUndo, canRedo, undo[], redo[]}. Use td_undo to revert the newest entry.",
        inputSchema: {},
    }, async () => {
        try {
            const body = await client.history();
            return ok(body);
        }
        catch (e) {
            return err(e);
        }
    });
}
