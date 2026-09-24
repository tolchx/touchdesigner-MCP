import { clientLogPath, getLastOkAt, getRecentCalls } from "td-api";
/**
 * Standard success response for MCP tools.
 */
export function ok(data) {
    return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
}
/**
 * Standard error response for MCP tools.
 */
export function err(error) {
    const message = typeof error === "string"
        ? error
        : error instanceof Error
            ? error.message
            : JSON.stringify(error);
    const payload = { error: message };
    // A transport failure carries an actionable envelope (kind, bridge, attempts,
    // hint). Surface it plus the client-side evidence, so the agent never has to
    // ask the user "which version?" / "do you have logs?" before acting.
    const envelope = error?.envelope;
    if (envelope) {
        payload.diagnostic = envelope;
        payload.last_ok_call = getLastOkAt();
        payload.recent_calls = getRecentCalls(5);
        payload.client_log = clientLogPath();
        payload.hint =
            "Si el problema persiste, corré td_healthchain (veredicto en vivo) y " +
                "td_report_bug para armar el reporte con evidencia.";
    }
    return {
        content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
        isError: true,
    };
}
