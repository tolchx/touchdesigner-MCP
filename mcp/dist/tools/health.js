import { TDRequestError, clientLogPath, getCallStats, getLastOkAt, getRecentCalls, } from "td-api";
import { z } from "zod";
import { ok, err } from "../helpers.js";
/**
 * Run the four-step chain and turn it into a single verdict.
 * Duck-typed client so this is unit-testable without a running MCP server.
 */
export async function runHealthChain(client, opts = {}) {
    const path = opts.path ?? "/";
    const checks = [];
    let runtime = null;
    let hint = "";
    // Holder object: TS cannot track assignments made inside the closure above.
    const state = { connectionError: null };
    const timed = async (name, fn) => {
        const t0 = Date.now();
        try {
            const value = await fn();
            checks.push({ name, ok: true, ms: Date.now() - t0 });
            return value;
        }
        catch (e) {
            const ms = Date.now() - t0;
            if (e instanceof TDRequestError)
                state.connectionError = e;
            checks.push({
                name,
                ok: false,
                ms,
                error: e instanceof Error ? e.message.slice(0, 400) : String(e),
            });
            return undefined;
        }
    };
    // 1. Bridge answers /info — the transport itself, incl. TD build + runtime.
    const info = (await timed("bridge_info", () => client.getInfo()));
    if (info) {
        const rt = info.runtime;
        if (rt && typeof rt === "object")
            runtime = rt;
        checks[0].detail = {
            build: info.build ?? null,
            product: info.product ?? null,
            platform: info.platform ?? null,
            runtime: runtime,
        };
    }
    // 2. A real /operators read — this exercises the same path most tools use.
    const ops = (await timed("operators_read", () => client.getOperators(path)));
    if (ops) {
        checks[1].detail = {
            path,
            count: ops.count ?? (Array.isArray(ops.operators) ? ops.operators.length : undefined),
        };
    }
    // 3. Network errors/warnings at the requested scope.
    const health = (await timed("network_errors", () => client.healthcheck(path, opts.recurse ?? false)));
    if (health) {
        checks[2].detail = {
            issueCount: health.issueCount ?? (Array.isArray(health.issues) ? health.issues.length : 0),
        };
    }
    // 4. Performance snapshot (best effort — never decides the verdict alone).
    const perf = (await timed("performance", () => client.getPerf()));
    if (perf)
        checks[3].detail = { fps: perf.fps ?? null, cookTime: perf.cookTime ?? null };
    const bridgeOk = checks[0].ok;
    const readOk = checks[1].ok;
    const issues = Number(checks[2].detail?.issueCount ?? 0);
    const cooking = runtime && typeof runtime.cooking === "string" ? runtime.cooking : null;
    let verdict;
    let summary;
    if (!bridgeOk) {
        verdict = "DOWN";
        summary =
            "El bridge de TD no responde: no se puede operar el proyecto. " +
                "Los reintentos ya se agotaron (ver `evidence.recent_calls`).";
        hint = state.connectionError
            ? state.connectionError.envelope.hint
            : "Verificá que TouchDesigner esté abierto con el componente del API cargado y el puerto correcto.";
    }
    else if (!readOk) {
        verdict = "DEGRADED";
        summary =
            "El bridge responde /info pero la lectura de operadores falló: el proyecto puede " +
                "estar cerrado, sin permiso de red o colgado.";
        hint =
            state.connectionError?.envelope.hint ??
                "Revisá el textport de TD y el path consultado (por defecto '/').";
    }
    else if (cooking && cooking !== "on") {
        verdict = "DEGRADED";
        summary = `Conectado y leyendo, pero TD no está cocinando (cooking=${cooking}). Las lecturas funcionan; los cambios pueden no verse reflejados.`;
        hint = "Reactivá el cooking global en TD (o la ventana minimizada/pausa) antes de medir resultados.";
    }
    else if (issues > 0) {
        verdict = "DEGRADED";
        summary = `Cadena operativa, pero hay ${issues} error(es)/warning(s) en la red bajo '${path}'.`;
        hint = "Corregí los errores con td_get_errors antes de seguir construyendo.";
    }
    else {
        verdict = "OK";
        summary = `Cadena completa operativa: bridge, lectura y red bajo '${path}' sin errores.`;
        hint = "Todo listo; podés operar TD normalmente.";
    }
    return {
        verdict,
        summary,
        checks,
        runtime,
        evidence: {
            last_ok_call: getLastOkAt(),
            recent_calls: getRecentCalls(opts.include_calls ?? 8),
            call_stats: getCallStats(),
            client_log: clientLogPath(),
        },
        hint,
    };
}
/**
 * Render the evidence bundle as markdown. Pure function: takes the health
 * result it already computed, so the report can never disagree with the checks.
 */
export function buildBugReport(health, args) {
    const info = (health.checks[0].detail ?? {});
    const lines = [];
    lines.push("# TD-MCP bug report");
    lines.push("");
    lines.push(`- **generado:** ${new Date().toISOString()}`);
    lines.push(`- **síntoma:** ${args.symptoms}`);
    if (args.expected)
        lines.push(`- **esperado:** ${args.expected}`);
    lines.push(`- **veredicto de cadena:** ${health.verdict} — ${health.summary}`);
    lines.push(`- **TD build:** ${String(info.build ?? "desconocido")}`);
    lines.push(`- **plataforma:** ${String(info.platform ?? "desconocida")}`);
    lines.push(`- **bridge:** ${process.env.TDAPI_HOST ?? "localhost"}:${process.env.TDAPI_PORT ?? "44444"}`);
    lines.push(`- **node:** ${process.version} (${process.platform})`);
    lines.push(`- **runtime TD:** ${JSON.stringify(health.runtime)}`);
    lines.push(`- **última llamada OK:** ${health.evidence.last_ok_call ?? "ninguna"}`);
    lines.push(`- **log del cliente:** ${health.evidence.client_log ?? "(deshabilitado)"}`);
    lines.push("");
    lines.push("## Chequeos");
    for (const c of health.checks) {
        lines.push(`${c.ok ? "- OK" : "- FALLA"} ${c.name} (${c.ms} ms)` +
            (c.error ? ` — ${c.error}` : ""));
    }
    lines.push("");
    lines.push("## Últimas llamadas del cliente");
    lines.push("```json");
    lines.push(JSON.stringify(health.evidence.recent_calls, null, 2));
    lines.push("```");
    return lines.join("\n");
}
export function registerHealthTools(server, client) {
    // ---------------------------------------------------------------------------
    // td_healthchain — one verdict instead of five guesses
    // ---------------------------------------------------------------------------
    server.registerTool("td_healthchain", {
        title: "Chain Health Check",
        description: "LIVE end-to-end verdict of the TD chain: bridge transport, a real operator " +
            "read, network errors at scope, and cooking state. Call this FIRST when a " +
            "call fails unexpectedly, when the user says 'it doesn't connect', or at the " +
            "start of a working session — instead of asking the user for a screenshot. " +
            "Returns verdict OK | DEGRADED | DOWN plus the evidence (last successful " +
            "call, recent call log) needed to report a problem.",
        inputSchema: {
            path: z.string().optional().describe("Scope to check (default '/')"),
            recurse: z
                .boolean()
                .optional()
                .describe("Recurse into the scope when checking errors"),
            include_calls: z
                .number()
                .int()
                .min(0)
                .max(50)
                .optional()
                .describe("How many recent client calls to include (default 8)"),
        },
    }, async (args) => {
        try {
            const result = await runHealthChain(client, args);
            return ok(result);
        }
        catch (e) {
            return err(e);
        }
    });
    // ---------------------------------------------------------------------------
    // td_report_bug — evidence bundle, not "it doesn't work"
    // ---------------------------------------------------------------------------
    server.registerTool("td_report_bug", {
        title: "Build Bug Report",
        description: "Assemble a complete bug report with evidence: TD build, bridge/API version, " +
            "health verdict, the last successful call, the recent call log and the log " +
            "file path. Use when the user asks how to report a problem, or after a " +
            "failure that needs the maintainer to see what happened.",
        inputSchema: {
            symptoms: z
                .string()
                .describe("What the user observed, in their words (they can be vague)"),
            path: z.string().optional().describe("Scope involved (default '/')"),
            expected: z.string().optional().describe("What was expected to happen"),
        },
    }, async (args) => {
        try {
            const health = await runHealthChain(client, { path: args.path ?? "/" });
            return ok({
                report_markdown: buildBugReport(health, args),
                health,
            });
        }
        catch (e) {
            return err(e);
        }
    });
}
