/**
 * Client resilience suite — backlog: retry-on-transport-failure + client-side
 * evidence (call log).
 *
 * Context (2026-09-24): the closest comparable project's single largest
 * support cost was "it silently fails, no logs anywhere". This suite pins the
 * three behaviours that fix that class of bug:
 *
 *   1. A refused bridge is retried, and the failure is CLASSIFIED — because
 *      "nothing is listening" (safe to retry even a write) is a different
 *      problem from "the socket dropped mid-flight" (a write may have landed).
 *   2. Reads are retried on an ambiguous failure; writes are not.
 *   3. Every attempt is recorded (ring buffer + JSONL file) with the last OK
 *      call, so a report carries evidence instead of a bare "fetch failed".
 */
import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Higiene: los tests NO escriben en el log de campo del cliente
// (%TEMP%/tdmcp-client.log), porque despues el triage del loop lee ese archivo
// como señal real y encuentra las fallas provocadas por los propios tests.
process.env.TDMCP_CLIENT_LOG = join(tmpdir(), `tdmcp-client-test-${process.pid}.log`);
const {
  TDClient,
  TDRequestError,
  classifyConnectionError,
  isRetryable,
  getRecentCalls,
  getCallStats,
  getLastOkAt,
  resetDiagnostics,
  setClientLogPath,
} = await import("../../api/dist/index.js");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Port with nothing listening: bind, note the port, close. */
async function freePort() {
  const srv = http.createServer();
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const { port } = srv.address();
  await new Promise((r) => srv.close(r));
  return port;
}

function startServer(handler) {
  return new Promise((resolve) => {
    const srv = http.createServer(handler);
    srv.listen(0, "127.0.0.1", () => resolve({ srv, port: srv.address().port }));
  });
}

function mkClient(port, extra = {}) {
  return new TDClient({
    host: "127.0.0.1",
    port,
    transport: "http",
    retryAttempts: 3,
    retryBaseDelayMs: 1,
    connectionTimeout: 400,
    requestTimeout: 800,
    ...extra,
  });
}

const onlyTarget = (target, n = 50) =>
  getRecentCalls(n).filter((r) => r.target === target);

// ---------------------------------------------------------------------------
// 1. Refused bridge → retried + classified as bridge_unreachable
// ---------------------------------------------------------------------------

describe("bridge caído", () => {
  let port;
  before(async () => {
    port = await freePort();
  });
  beforeEach(() => {
    setClientLogPath(null); // in-memory only for these assertions
    resetDiagnostics();
  });

  it("reintenta una lectura y clasifica como bridge_unreachable", async () => {
    const client = mkClient(port);
    await assert.rejects(
      () => client.getInfo(),
      (e) => {
        assert.ok(e instanceof TDRequestError, "debe ser TDRequestError");
        assert.equal(e.envelope.kind, "bridge_unreachable");
        assert.equal(e.envelope.attempts, 3, "usa los 3 intentos");
        assert.equal(e.envelope.bridge, `127.0.0.1:${port}`);
        assert.equal(e.envelope.transport, "http");
        assert.equal(e.envelope.method, "GET");
        assert.equal(e.envelope.target, "/info");
        assert.equal(e.envelope.benign, false);
        assert.equal(e.envelope.last_ok_call, null, "no hubo llamadas OK");
        assert.match(e.envelope.hint, /bridge|TD/i);
        // el mensaje incluye el contexto para que un reporte sea autosuficiente
        assert.match(e.message, /kind=bridge_unreachable/);
        assert.match(e.message, /last_ok=never/);
        return true;
      },
    );

    const calls = onlyTarget("/info");
    assert.equal(calls.length, 3, "3 intentos registrados");
    assert.deepEqual(
      calls.map((c) => c.attempt),
      [1, 2, 3],
    );
    assert.ok(
      calls.every((c) => !c.ok && c.kind === "bridge_unreachable"),
      "todos los intentos quedan como fallo clasificado",
    );
    assert.equal(getLastOkAt(), null);
    assert.equal(getCallStats().byKind.bridge_unreachable, 3);
  });

  it("reintenta también una escritura: la request nunca llegó a TD", async () => {
    const client = mkClient(port);
    await assert.rejects(() => client.execute("1 + 1"));
    const calls = onlyTarget("/exec");
    assert.equal(calls.length, 3, "write reintentada porque el socket nunca abrió");
    assert.equal(calls[0].method, "POST");
  });

  it("no reintenta una vez que TD respondió con error HTTP", async () => {
    const { srv, port: p } = await startServer((_req, res) => {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "boom" }));
    });
    try {
      const client = mkClient(p);
      await assert.rejects(
        () => client.getInfo(),
        (e) => {
          assert.equal(e.envelope.kind, "http_error");
          assert.equal(e.envelope.attempts, 1, "una respuesta real no se reintenta");
          return true;
        },
      );
      assert.equal(onlyTarget("/info").length, 1);
    } finally {
      await new Promise((r) => srv.close(r));
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Socket abierto y cortado → ambiguo: se reintenta solo la lectura
// ---------------------------------------------------------------------------

describe("socket cortado a mitad de camino", () => {
  let srv;
  let port;
  before(async () => {
    ({ srv, port } = await startServer((req) => {
      req.socket.destroy();
    }));
  });
  after(async () => {
    await new Promise((r) => srv.close(r));
  });
  beforeEach(() => {
    setClientLogPath(null);
    resetDiagnostics();
  });

  it("la lectura se reintenta y se clasifica como connect_reset", async () => {
    const client = mkClient(port);
    await assert.rejects(
      () => client.getInfo(),
      (e) => {
        assert.equal(e.envelope.kind, "connect_reset");
        assert.equal(e.envelope.attempts, 3);
        return true;
      },
    );
  });

  it("la escritura NO se reintenta (pudo haberse aplicado)", async () => {
    const client = mkClient(port);
    await assert.rejects(
      () => client.execute("op('/').name"),
      (e) => {
        assert.equal(e.envelope.kind, "connect_reset");
        assert.equal(e.envelope.attempts, 1, "una sola chance para escrituras ambiguas");
        return true;
      },
    );
    assert.equal(onlyTarget("/exec").length, 1);
  });
});

// ---------------------------------------------------------------------------
// 3. Éxito: log, last_ok y estado de conexión
// ---------------------------------------------------------------------------

describe("llamada exitosa", () => {
  let srv;
  let port;
  let logFile;

  before(async () => {
    ({ srv, port } = await startServer((req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          build: "2025.32460",
          product: "TouchDesigner",
          platform: "Windows",
        }),
      );
    }));
    logFile = join(mkdtempSync(join(tmpdir(), "tdmcp-log-")), "client.log");
  });
  after(async () => {
    await new Promise((r) => srv.close(r));
  });
  beforeEach(() => {
    resetDiagnostics();
    setClientLogPath(logFile);
  });

  it("registra la llamada, marca last_ok y deja evidencia en el archivo", async () => {
    const client = mkClient(port);
    const info = await client.getInfo();
    assert.equal(info.build, "2025.32460");

    const calls = onlyTarget("/info");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].ok, true);
    assert.equal(calls[0].attempt, 1);
    assert.equal(calls[0].ms >= 0, true);
    assert.ok(getLastOkAt(), "last_ok_call queda seteado");
    assert.equal(client.isConnectedCached, true);

    assert.ok(existsSync(logFile), "el archivo de log existe");
    const lines = readFileSync(logFile, "utf-8").trim().split("\n");
    const last = JSON.parse(lines[lines.length - 1]);
    assert.equal(last.target, "/info");
    assert.equal(last.ok, true);
    assert.equal(last.transport, "http");
  });

  it("un fallo posterior invalida el estado 'connected' (indicador que no miente)", async () => {
    const client = mkClient(port);
    await client.getInfo();
    assert.equal(client.isConnectedCached, true);

    const dead = mkClient(await freePort());
    await assert.rejects(() => dead.getInfo());
    assert.equal(dead.isConnectedCached, false);
  });
});

// ---------------------------------------------------------------------------
// 4. Clasificación pura (tabla de decisión)
// ---------------------------------------------------------------------------

describe("clasificación y decisión de reintento", () => {
  it("clasifica códigos de socket anidados en cause (undici)", () => {
    const refused = new Error("fetch failed", {
      cause: Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:44444"), {
        code: "ECONNREFUSED",
      }),
    });
    assert.equal(classifyConnectionError(refused), "bridge_unreachable");

    const reset = new Error("fetch failed", {
      cause: new Error("other side closed"),
    });
    assert.equal(classifyConnectionError(reset), "connect_reset");

    assert.equal(classifyConnectionError(new Error("Request timed out after 30000ms")), "timeout");
    assert.equal(classifyConnectionError(new Error("HTTP 500 Internal Server Error: boom")), "http_error");
    assert.equal(classifyConnectionError(new Error("algo raro")), "unknown");
  });

  it("regla de reintento por tipo de método", () => {
    assert.equal(isRetryable("bridge_unreachable", "POST"), true);
    assert.equal(isRetryable("bridge_unreachable", "GET"), true);
    assert.equal(isRetryable("connect_reset", "GET"), true);
    assert.equal(isRetryable("connect_reset", "POST"), false);
    assert.equal(isRetryable("timeout", "GET"), true);
    assert.equal(isRetryable("timeout", "POST"), false);
    assert.equal(isRetryable("http_error", "GET"), false);
    assert.equal(isRetryable("http_error", "POST"), false);
  });
});
