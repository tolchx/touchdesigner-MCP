#!/usr/bin/env node
/**
 * test_helpers.mjs — Shared MCP client and helpers for all test files.
 *
 * Exports:
 *   McpClient      — JSON-RPC 2.0 client that spawns the MCP server
 *   pyConnect      — Execute a Python block via td_execute
 *   buildSystem    — Declaratively create operators + connections in a baseCOMP
 *   createBase     — Create a baseCOMP
 *   createOp       — Create an operator
 *   wire           — Wire two operators via MCP API
 *   setParams      — Set parameters on an operator
 *   healthcheck    — Run td_healthcheck
 *   ROOT / SX / SY — Shared constants
 */
import { spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverPath = resolve(__dirname, "dist/index.js");

export const HOST = process.env.TDAPI_HOST || "localhost";
export const PORT = process.env.TDAPI_PORT || "44444";
export const ROOT = "/project1";
export const SX = 280;
export const SY = 180;

// ── MCP Client ──────────────────────────────────────────────────────

export class McpClient {
  constructor() {
    this.server = null;
    this.buffer = "";
    this.pending = new Map();
    this.msgId = 1;
    this.passed = 0;
    this.failed = 0;
    this.skipped = 0;
    this.errors = [];
  }

  start() {
    return new Promise((resolve, reject) => {
      this.server = spawn("node", [serverPath], {
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env, TDAPI_HOST: HOST, TDAPI_PORT: PORT },
      });

      const timeout = setTimeout(() => {
        reject(new Error("Server start timeout (15s)"));
      }, 15000);

      this.server.stdout.on("data", (chunk) => {
        this.buffer += chunk.toString();
        const lines = this.buffer.split("\n");
        this.buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const msg = JSON.parse(line);
            if (msg.id !== undefined && this.pending.has(msg.id)) {
              this.pending.get(msg.id)(msg);
              this.pending.delete(msg.id);
            }
          } catch {}
        }
      });

      this.server.stderr.on("data", () => {});
      this.server.on("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });

      setTimeout(() => {
        clearTimeout(timeout);
        resolve();
      }, 500);
    });
  }

  async waitForReady() {
    const resp = await this.send("tools/list", {}, 10000);
    if (!resp.result?.tools) throw new Error("Server not ready");
    return resp.result.tools;
  }

  send(method, params = {}, timeoutMs = 10000) {
    const id = this.msgId++;
    const msg =
      JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n";
    this.server.stdin.write(msg);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timeout (${timeoutMs}ms) for ${method}`));
      }, timeoutMs);
      this.pending.set(id, (result) => {
        clearTimeout(timer);
        resolve(result);
      });
    });
  }

  async call(name, args = {}, timeoutMs = 10000) {
    const resp = await this.send(
      "tools/call",
      { name, arguments: args },
      timeoutMs,
    );
    if (resp.error) return { ok: false, error: resp.error.message };
    const text = resp.result?.content?.[0]?.text || "{}";
    try {
      return { ok: true, data: JSON.parse(text) };
    } catch {
      return { ok: true, data: text };
    }
  }

  async py(code, timeoutMs = 5000) {
    return this.call("td_execute", { code: code.trim() }, timeoutMs);
  }

  check(label, condition, detail = "") {
    if (condition) {
      console.log(`  ✅ ${label} ${detail}`);
      this.passed++;
    } else {
      console.log(`  ❌ ${label} ${detail}`);
      this.failed++;
      this.errors.push(label);
    }
  }

  skip(label, reason = "") {
    console.log(`  ⏭  ${label} ${reason}`);
    this.skipped++;
  }

  stop() {
    if (this.server) {
      this.server.stdin.end();
      this.server.kill();
    }
  }
}

// ── Helpers ─────────────────────────────────────────────────────────


/** Execute a Python connection block via td_execute. */
export async function pyConnect(c, code) {
  const r = await c.call("td_execute", { code: code.trim() }, 5000);
  return r.ok && r.data?.success;
}

/** Create a baseCOMP at the given path */
export async function createBase(c, name, parent, x = 50, y = 50) {
  const r = await c.call(
    "td_create_operator",
    { type: "baseCOMP", name, path: parent, position_x: x, position_y: y },
    10000,
  );
  return r.ok && !r.data?.error;
}

/** Create an operator inside a baseCOMP */
export async function createOp(c, type, name, parent, x, y) {
  const r = await c.call(
    "td_create_operator",
    { type, name, path: parent, position_x: x, position_y: y },
    10000,
  );
  return r.ok && !r.data?.error;
}

/** Wire two operators via MCP API */
export async function wire(c, src, tgt, inputIdx = 0) {
  const r = await c.call(
    "td_connect_nodes",
    { source_path: src, target_path: tgt, target_input: inputIdx },
    10000,
  );
  return r.ok && !r.data?.error;
}

/** Set parameters on an operator */
export async function setParams(c, path, updates) {
  const r = await c.call("td_pars_set", { path, updates }, 10000);
  return r.ok && !r.data?.error;
}

/** Healthcheck a system */
export async function healthcheck(c, path) {
  const r = await c.call("td_healthcheck", { path, recurse: true }, 10000);
  return { ok: r.ok && !r.data?.error, issues: r.data?.issueCount || 0 };
}

// ── Build System ────────────────────────────────────────────────────

/**
 * Build a system inside a baseCOMP.
 *
 * @param {McpClient} c       - client
 * @param {string} basePath   - baseCOMP path (e.g. "/project1/my_system")
 * @param {object} system     - system definition:
 *   - operators: [{type, name, x, y}]
 *   - connections: [[src, tgt, inputIdx?]]  — MCP API wires (same-family)
 *   - params: [{path, updates}]
 *   - pythonConnections: [{src?, tgt?, input?, param?, expr?, type?}]  — Python actions (cross-family)
 *       type: 'wire'       (default) — inputConnectors[input].connect(src)
 *       type: 'camera'               — render.par.camera = src path
 *       type: 'expression'           — tgt.par.param.expr = expr (uses basePath for tgt)
 */
export async function buildSystem(c, basePath, system, { log = true } = {}) {
  // Create baseCOMP — infer parent from basePath
  const baseName = basePath.split("/").pop();
  const parentPath = basePath.replace(/\/[^\/]*$/, "") || ROOT;
  const r = await c.call(
    "td_create_operator",
    {
      type: "baseCOMP",
      name: baseName,
      path: parentPath,
      position_x: 50,
      position_y: 50,
    },
    10000,
  );

  // Create operators
  for (const op of system.operators) {
    const cr = await c.call(
      "td_create_operator",
      {
        type: op.type,
        name: op.name,
        path: basePath,
        position_x: op.x,
        position_y: op.y,
      },
      10000,
    );
    if (log) c.check(`  Create ${op.name} (${op.type})`, cr.ok && !cr.data?.error);
  }

  // Connect nodes (same-family, via MCP API)
  for (const [src, tgt, inputIdx] of system.connections) {
    const cr = await c.call(
      "td_connect_nodes",
      {
        source_path: `${basePath}/${src}`,
        target_path: `${basePath}/${tgt}`,
        target_input: inputIdx || 0,
      },
      10000,
    );
    if (log) c.check(`  Connect ${src} -> ${tgt}`, cr.ok && !cr.data?.error);
  }

  // Cross-family connections via Python
  for (const pc of system.pythonConnections || []) {
    const inputIdx = pc.input ?? 0;
    const type = pc.type || "wire";

    if (type === "expression") {
      const tgtPath = `${basePath}/${pc.tgt}`;
      const exprStr = JSON.stringify(pc.expr);
      const ok = await pyConnect(
        c,
        `import json
try:
    t = op('${tgtPath}')
    if t:
        t.par.${pc.param}.expr = ${exprStr}
        print(json.dumps({'success':True,'expr':t.par.${pc.param}.expr}))
    else:
        print(json.dumps({'success':False,'error':'operator not found'}))
except Exception as e:
    print(json.dumps({'success':False,'error':str(e)}))`,
      );
      if (log) c.check(`  Python: ${pc.tgt}.${pc.param} = expr`, ok);
    } else if (type === "camera") {
      const srcPath = `${basePath}/${pc.src}`;
      const tgtPath = `${basePath}/${pc.tgt}`;
      const ok = await pyConnect(
        c,
        `import json
try:
    cam = op('${srcPath}')
    render = op('${tgtPath}')
    if cam and render:
        render.par.camera = cam.path
        print(json.dumps({'success':True}))
    else:
        print(json.dumps({'success':False,'error':'ops not found'}))
except Exception as e:
    print(json.dumps({'success':False,'error':str(e)}))`,
      );
      if (log) c.check(`  Python: ${pc.src} -> ${pc.tgt} (camera)`, ok);
    } else {
      const srcPath = `${basePath}/${pc.src}`;
      const tgtPath = `${basePath}/${pc.tgt}`;
      const ok = await pyConnect(
        c,
        `import json
try:
    s = op('${srcPath}')
    t = op('${tgtPath}')
    if s and t:
        t.inputConnectors[${inputIdx}].connect(s)
        print(json.dumps({'success':True}))
    else:
        print(json.dumps({'success':False,'error':'ops not found'}))
except Exception as e:
    print(json.dumps({'success':False,'error':str(e)}))`,
      );
      if (log) c.check(`  Python: ${pc.src} -> ${pc.tgt}`, ok);
    }
  }

  // Set parameters
  for (const p of system.params || []) {
    const cr = await c.call(
      "td_pars_set",
      { path: `${basePath}/${p.path}`, updates: p.updates },
      10000,
    );
    if (log) c.check(`  Params ${p.path}`, cr.ok && !cr.data?.error);
  }
}

/**
 * Verify a system: list operators, check connections, run healthcheck.
 */
export async function verifySystem(c, basePath, expectedMinOps) {
  const ops = await c.call("td_operators", { path: basePath }, 5000);
  const count = ops.data?.operators?.length || 0;
  c.check(
    `  Operator count >= ${expectedMinOps}`,
    count >= expectedMinOps,
    `(${count})`,
  );

  const conn = await c.call(
    "td_connections",
    { path: basePath, recurse: true },
    5000,
  );
  const withInputs = (conn.data?.operators || []).filter(
    (o) => o.inputs?.length > 0,
  ).length;
  c.check(`  Connections exist`, withInputs >= 1, `(${withInputs} connected)`);

  const hc = await c.call(
    "td_healthcheck",
    { path: basePath, recurse: true },
    10000,
  );
  c.check(
    `  Healthcheck OK`,
    hc.ok && !hc.data?.error,
    `(issues: ${hc.data?.issueCount || 0})`,
  );

  return { count, withInputs, hcOk: hc.ok };
}

/**
 * Delete a baseCOMP to clean up.
 */
export async function cleanupSystem(c, basePath) {
  const r = await c.call("td_delete_operator", { path: basePath }, 5000);
  c.check(`  Cleanup ${basePath}`, r.ok && !r.data?.error);
}
