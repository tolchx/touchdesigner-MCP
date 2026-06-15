/**
 * send_to_td.js — Sends a Python script to TouchDesigner via HTTP API
 * Usage: node send_to_td.js <python_file>
 *
 * Uses the /exec endpoint (JSON API) to avoid form-encoding issues.
 */
import fs from "node:fs";
import http from "node:http";

const file = process.argv[2] || "mcp/setup/build_api_network.py";
const code = fs.readFileSync(file, "utf-8");

// Use /exec endpoint which accepts JSON { code: "..." }
const payload = JSON.stringify({ code });

const hostname = process.env.TDAPI_HOST || "localhost";
const port = parseInt(process.env.TDAPI_PORT || "44444");

console.log(`Sending ${code.length} chars to ${hostname}:${port}/exec ...`);

const req = http.request(
  {
    hostname,
    port,
    path: "/exec",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(payload),
    },
  },
  (res) => {
    let body = "";
    res.on("data", (chunk) => (body += chunk));
    res.on("end", () => {
      try {
        const json = JSON.parse(body);
        if (json.output) console.log(json.output);
        if (json.error) {
          console.error("ERROR:");
          console.error(json.error);
        }
      } catch {
        console.log(body);
      }
    });
  }
);
req.on("error", (e) => {
  console.error(`Connection error: ${e.message}`);
  console.error("Make sure TouchDesigner is running with the MCP extension!");
});
req.write(payload);
req.end();
