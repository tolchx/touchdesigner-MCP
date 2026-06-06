#!/usr/bin/env node

import { createServer } from "http";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";
import express from "express";
import { WebSocketServer } from "ws";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.WEBUI_PORT || 3333;

// ── MCP Server stdio connection ──────────────────────────────────────────────

const MCP_SCRIPT = join(__dirname, "..", "dist", "index.js");
let mcpProcess = null;
let mcpConnected = false;
let toolsList = [];
const logBuffer = [];
const MAX_LOGS = 500;
let pendingRequests = {};
let requestCounter = 0;

/**
 * Append a log entry to the circular buffer and broadcast to WS clients.
 */
function pushLog(level, message, data = null) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    data,
  };
  logBuffer.push(entry);
  if (logBuffer.length > MAX_LOGS) logBuffer.shift();
  broadcast({ type: "log", entry });
}

/**
 * Write a JSON-RPC message to the MCP process's stdin.
 */
function sendMCP(message) {
  if (!mcpProcess || !mcpProcess.stdin.writable) {
    pushLog("error", "Cannot send to MCP — process not running");
    return;
  }
  const raw = JSON.stringify(message) + "\n";
  mcpProcess.stdin.write(raw);
}

/**
 * Send a JSON-RPC request and return a promise that resolves with the response.
 */
function mcpRequest(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++requestCounter;
    pendingRequests[id] = { resolve, reject };
    sendMCP({ jsonrpc: "2.0", id, method, params });

    // Timeout after 30 seconds
    setTimeout(() => {
      if (pendingRequests[id]) {
        delete pendingRequests[id];
        reject(new Error(`MCP request timed out: ${method}`));
      }
    }, 30000);
  });
}

/**
 * Parse a single JSON-RPC message line from the MCP process.
 */
function handleMCPLine(line) {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    pushLog("warn", `Non-JSON MCP output: ${line.slice(0, 200)}`);
    return;
  }

  // Response to a pending request
  if (msg.id != null && pendingRequests[msg.id]) {
    const { resolve, reject } = pendingRequests[msg.id];
    delete pendingRequests[msg.id];
    if (msg.error) {
      reject(new Error(msg.error.message || JSON.stringify(msg.error)));
    } else {
      resolve(msg.result);
    }
    return;
  }

  // Notification (e.g., from server logging)
  if (msg.method === "notifications/message" || msg.method === "log") {
    pushLog("info", msg.params?.message || msg.params?.data || JSON.stringify(msg));
    return;
  }

  // Unknown — log it
  pushLog("debug", `MCP message: ${JSON.stringify(msg).slice(0, 300)}`);
}

/**
 * Start the MCP server as a child process connected via stdio.
 */
function startMCP() {
  if (mcpProcess) {
    pushLog("warn", "MCP process already running, killing first");
    mcpProcess.kill();
  }

  pushLog("info", `Spawning MCP server: node ${MCP_SCRIPT}`);
  mcpConnected = false;
  toolsList = [];

  mcpProcess = spawn("node", [MCP_SCRIPT], {
    cwd: join(__dirname, ".."),
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env },
  });

  let buffer = "";
  mcpProcess.stdout.on("data", (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop(); // keep incomplete line in buffer
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed) handleMCPLine(trimmed);
    }
  });

  mcpProcess.stderr.on("data", (chunk) => {
    const text = chunk.toString();
    pushLog("stderr", text.trimEnd());
  });

  mcpProcess.on("error", (err) => {
    pushLog("error", `MCP process error: ${err.message}`);
  });

  mcpProcess.on("close", (code, signal) => {
    pushLog("warn", `MCP process exited (code=${code}, signal=${signal})`);
    mcpConnected = false;
    mcpProcess = null;
    broadcast({ type: "status", connected: false, tools: 0 });

    // Auto-restart after 3 seconds
    setTimeout(startMCP, 3000);
  });

  // Wait briefly then probe capabilities
  setTimeout(probeCapabilities, 1500);
}

/**
 * Fetch the tool list from the MCP server via `tools/list`.
 */
async function probeCapabilities() {
  try {
    const result = await mcpRequest("tools/list");
    toolsList = result.tools || [];
    mcpConnected = true;
    pushLog("info", `MCP connected — ${toolsList.length} tools available`);
    broadcast({
      type: "status",
      connected: true,
      tools: toolsList.length,
      toolNames: toolsList.map((t) => t.name),
    });
  } catch (err) {
    pushLog("error", `Failed to probe MCP capabilities: ${err.message}`);
    mcpConnected = false;
    broadcast({ type: "status", connected: false, tools: 0 });
  }
}

// ── Express + WebSocket ──────────────────────────────────────────────────────

const app = express();
app.use(express.json());

// Serve static files from public/
app.use(express.static(join(__dirname, "public")));

// GET /api/status — MCP connection status
app.get("/api/status", (_req, res) => {
  res.json({
    connected: mcpConnected,
    tools: toolsList.length,
    toolNames: toolsList.map((t) => t.name),
    processAlive: mcpProcess !== null,
  });
});

// POST /api/tools/call — Execute an MCP tool
app.post("/api/tools/call", async (req, res) => {
  const { name, arguments: args } = req.body;
  if (!name) {
    return res.status(400).json({ error: "Tool name is required" });
  }

  pushLog("info", `Tool call: ${name}`, args);

  try {
    const result = await mcpRequest("tools/call", { name, arguments: args || {} });
    pushLog("info", `Tool result: ${name}`, result);
    res.json({ success: true, result });
  } catch (err) {
    pushLog("error", `Tool error: ${name} — ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/logs — Recent logs
app.get("/api/logs", (_req, res) => {
  res.json(logBuffer);
});

// Create HTTP server
const httpServer = createServer(app);

// Attach WebSocket server
const wss = new WebSocketServer({ server: httpServer });

wss.on("connection", (ws) => {
  pushLog("debug", "WebSocket client connected");

  // Send initial state
  ws.send(JSON.stringify({
    type: "status",
    connected: mcpConnected,
    tools: toolsList.length,
    toolNames: toolsList.map((t) => t.name),
  }));

  // Send recent logs
  for (const entry of logBuffer) {
    ws.send(JSON.stringify({ type: "log", entry }));
  }

  ws.on("close", () => {
    pushLog("debug", "WebSocket client disconnected");
  });

  ws.on("error", () => {});
});

/**
 * Broadcast a JSON message to all connected WebSocket clients.
 */
function broadcast(data) {
  const payload = JSON.stringify(data);
  for (const ws of wss.clients) {
    if (ws.readyState === ws.OPEN) {
      ws.send(payload);
    }
  }
}

// ── Start ────────────────────────────────────────────────────────────────────

startMCP();

httpServer.listen(PORT, () => {
  pushLog("info", `Web UI server listening on http://localhost:${PORT}`);
});
