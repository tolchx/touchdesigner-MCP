#!/usr/bin/env node

import { pathToFileURL } from "node:url";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createTouchDesignerMcpServer } from "./server.js";

export async function runStdioMcpServer() {
  const server = await createTouchDesignerMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

const isEntrypoint =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntrypoint) {
  runStdioMcpServer().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
