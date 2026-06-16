import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { TDClient } from "td-api";

import { ensureKnowledgeLoaded } from "./networkPlanner.js";
import { registerKnowledgeTools } from "./tools/knowledge.js";
import { registerCrudTools } from "./tools/crud.js";
import { registerParameterTools } from "./tools/parameters.js";
import { registerInspectionTools } from "./tools/inspection.js";
import { registerExecutionTools } from "./tools/execution.js";
import { registerUiTools } from "./tools/ui.js";
import { registerDataTools } from "./tools/data.js";
import { registerLifecycleTools } from "./tools/lifecycle.js";
import { registerBatchTool } from "./tools/batch.js";
import { registerKnowledgeQueryTool } from "./tools/knowledgeQuery.js";
import { registerHistoryTools } from "./tools/history.js";
import { registerWatchdogTools } from "./tools/watchdog.js";
import { registerRunnerTool } from "./tools/runner.js";
import { registerValidateTools } from "./tools/validate.js";
import { registerSmokeTestTools } from "./tools/smokeTest.js";
import { registerSyntacticCheckTools } from "./tools/syntacticCheck.js";
import { registerTdnTools } from "./tools/tdn.js";
import { registerSafeModeTools } from "./tools/safeMode.js";
import { registerEnhancedTools } from "./tools/enhanced.js";
import { registerWebtoeTools } from "./tools/webtoe.js";
import { registerPopValidationTools } from "./tools/popValidation.js";

/**
 * Pre-load the operator knowledge base on startup (non-blocking).
 * Logs a warning on failure but does not prevent the server from starting.
 */
function preloadKnowledge(): void {
  try {
    ensureKnowledgeLoaded();
  } catch (e: any) {
    console.warn("[server] Failed to pre-load knowledge base:", e.message || String(e));
  }
}

/**
 * Create a fully configured TouchDesigner MCP server with all tools registered.
 */
export async function createTouchDesignerMcpServer(
  client: TDClient = new TDClient()
): Promise<McpServer> {
  // Pre-load knowledge base asynchronously (non-blocking)
  preloadKnowledge();

  const server = new McpServer({
    name: "touchdesigner",
    version: "3.0.0",
  });

  // Register all tool domains
  registerKnowledgeTools(server, client);
  registerCrudTools(server, client);
  registerParameterTools(server, client);
  registerInspectionTools(server, client);
  registerExecutionTools(server, client);
  registerUiTools(server, client);
  registerDataTools(server, client);
  registerLifecycleTools(server, client);
  registerBatchTool(server, client);
  registerKnowledgeQueryTool(server, client);
  registerHistoryTools(server, client);
  registerWatchdogTools(server, client);
  registerRunnerTool(server, client);
  registerValidateTools(server, client);
  registerSmokeTestTools(server, client);
  registerSyntacticCheckTools(server, client);
  registerTdnTools(server, client);
  registerSafeModeTools(server, client);
  await registerEnhancedTools(server, client);
  registerWebtoeTools(server, client);
  registerPopValidationTools(server, client);

  return server;
}

/**
 * Create a fully configured TouchDesigner MCP server with connection health
 * validation and a td://status resource for offline/online mode detection.
 *
 * The `isConnected` check runs before constructing the server so the result is
 * captured eagerly.  The exposed `td://status` resource returns
 * { connected, baseUrl } which clients can read to determine the
 * online/offline mode.
 */
export async function createTouchDesignerMcpServerWithStatus(
  client: TDClient = new TDClient()
): Promise<McpServer> {
  const host = process.env.TDAPI_HOST ?? "localhost";
  const port = process.env.TDAPI_PORT ?? "44444";
  const baseUrl = `http://${host}:${port}`;

  // Quick connectivity probe (3 s timeout via client's connectionTimeout)
  const connected = await client.isConnected();

  const server = new McpServer({
    name: "touchdesigner",
    version: "3.0.0",
  });

  // Expose connection status as a static resource
  server.resource(
    "TD Status",
    "td://status",
    {
      description: `TouchDesigner connection status: connected=${connected}, baseUrl=${baseUrl}`,
      mimeType: "application/json",
    },
    async () => ({
      contents: [
        {
          uri: "td://status",
          mimeType: "application/json",
          text: JSON.stringify({ connected, baseUrl }, null, 2),
        },
      ],
    })
  );

  // Register all tool domains
  registerKnowledgeTools(server, client);
  registerCrudTools(server, client);
  registerParameterTools(server, client);
  registerInspectionTools(server, client);
  registerExecutionTools(server, client);
  registerUiTools(server, client);
  registerDataTools(server, client);
  registerLifecycleTools(server, client);
  registerBatchTool(server, client);
  registerKnowledgeQueryTool(server, client);
  registerHistoryTools(server, client);
  registerWatchdogTools(server, client);
  registerRunnerTool(server, client);
  registerValidateTools(server, client);
  registerSmokeTestTools(server, client);
  registerSyntacticCheckTools(server, client);
  registerTdnTools(server, client);
  registerSafeModeTools(server, client);
  await registerEnhancedTools(server, client);
  registerWebtoeTools(server, client);
  registerPopValidationTools(server, client);

  return server;
}
