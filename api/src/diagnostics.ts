/**
 * Client-side diagnostics for the TD bridge client.
 *
 * Why this exists (evidence, 2026-09-24): the single largest support cost in
 * the closest comparable project (TWOZERO's Discord, 486 messages analysed)
 * was failures that were SILENT — "no textport output, no errors, it just
 * silently fails" — followed by the maintainer's question "do you have logs
 * generated anywhere?". The one report that got fixed fast carried a client
 * log line-by-line (success / success / connection dropped / TD gone).
 *
 * Responsibilities:
 *   1. Ring buffer of the last N calls (tool, path, ms, ok, kind) + last OK ts.
 *   2. Optional JSONL file so a failure can be reported with evidence.
 *   3. Classification of connection errors so the caller can decide whether a
 *      retry is safe (see `isRetryable`).
 *
 * Deliberately dependency-free and sync-writing: it must never be the reason a
 * call fails, so every write is wrapped and swallowed.
 */

import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export type TDErrorKind =
  | "bridge_unreachable"
  | "connect_reset"
  | "timeout"
  | "http_error"
  | "ws_error"
  | "unknown";

export interface CallRecord {
  ts: string;
  /** Path only (query string stripped) so records group cleanly. */
  target: string;
  method: string;
  ok: boolean;
  ms: number;
  attempt: number;
  transport: "http" | "websocket";
  kind?: TDErrorKind;
  error?: string;
}

export interface CallStats {
  total: number;
  ok: number;
  failed: number;
  byKind: Record<string, number>;
  last_ok_call: string | null;
}

// -----------------------------------------------------------------------------
// Configuration
// -----------------------------------------------------------------------------

const RING_MAX = 200;
const LOG_MAX_BYTES = 1_000_000;

let ring: CallRecord[] = [];
let lastOkAt: string | null = null;
let logPath: string | null = null;
let logResolved = false;
let logDisabled = false;
/** Path set explicitly via setClientLogPath — survives resetDiagnostics(). */
let explicitLogPath: string | null | undefined = undefined;

/**
 * Resolve the JSONL log path. Order: explicit override > TDMCP_CLIENT_LOG env >
 * `<tmpdir>/tdmcp-client.log`. `TDMCP_CLIENT_LOG=off|0|false` disables the file
 * (the in-memory ring keeps working).
 */
export function clientLogPath(): string | null {
  if (logResolved) return logPath;
  logResolved = true;
  const env = process.env.TDMCP_CLIENT_LOG;
  if (env && /^(off|0|false|no|none)$/i.test(env.trim())) {
    logDisabled = true;
    return null;
  }
  if (env && env.trim()) {
    logPath = env.trim();
    return logPath;
  }
  logPath = join(tmpdir(), "tdmcp-client.log");
  return logPath;
}

/** Force a specific log file (or `null` to disable). Also a test seam. */
export function setClientLogPath(p: string | null): void {
  logResolved = true;
  logPath = p;
  logDisabled = p === null;
  explicitLogPath = p;
}

/**
 * Clear the ring, the last-OK stamp and the stats. An explicitly configured log
 * path (setClientLogPath) is preserved — only the env-derived resolution is
 * re-evaluated on the next call.
 */
export function resetDiagnostics(): void {
  ring = [];
  lastOkAt = null;
  logResolved = false;
  if (explicitLogPath === undefined) {
    logDisabled = false;
    logPath = null;
  } else {
    logPath = explicitLogPath;
    logDisabled = explicitLogPath === null;
  }
}

// -----------------------------------------------------------------------------
// Recording
// -----------------------------------------------------------------------------

/** Path without query string — keeps records comparable across calls. */
export function safeTarget(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname;
  } catch {
    const q = url.indexOf("?");
    return q === -1 ? url : url.slice(0, q);
  }
}

/** Rotate the JSONL file when it grows past ~1 MB (one generation kept). */
function rotateIfNeeded(file: string): void {
  try {
    if (existsSync(file) && statSync(file).size > LOG_MAX_BYTES) {
      renameSync(file, file + ".1");
    }
  } catch {
    // Rotation is best-effort: never break a call over it.
  }
}

/**
 * Record one call attempt. Never throws.
 */
export function recordCall(rec: CallRecord): void {
  ring.push(rec);
  if (ring.length > RING_MAX) {
    ring = ring.slice(ring.length - RING_MAX);
  }
  if (rec.ok) lastOkAt = rec.ts;

  const file = logDisabled ? null : clientLogPath();
  if (!file) return;
  try {
    const dir = dirname(file);
    if (dir && !existsSync(dir)) mkdirSync(dir, { recursive: true });
    rotateIfNeeded(file);
    appendFileSync(file, JSON.stringify(rec) + "\n", "utf-8");
  } catch {
    // Diagnostics must never be the cause of a failure.
  }
}

/** Last `n` call records, oldest first. */
export function getRecentCalls(n = 20): CallRecord[] {
  if (n <= 0) return [];
  return ring.slice(Math.max(0, ring.length - n));
}

/** ISO timestamp of the last successful call, or null if none happened yet. */
export function getLastOkAt(): string | null {
  return lastOkAt;
}

export function getCallStats(): CallStats {
  const byKind: Record<string, number> = {};
  let ok = 0;
  for (const r of ring) {
    if (r.ok) ok++;
    else byKind[r.kind ?? "unknown"] = (byKind[r.kind ?? "unknown"] ?? 0) + 1;
  }
  return {
    total: ring.length,
    ok,
    failed: ring.length - ok,
    byKind,
    last_ok_call: lastOkAt,
  };
}

// -----------------------------------------------------------------------------
// Error classification
// -----------------------------------------------------------------------------

/**
 * Classify a transport error. The distinction that matters to callers is
 * whether the request could have reached TD at all:
 *
 *   bridge_unreachable — DNS/refused/route error: the request NEVER left the
 *                        client, so retrying is safe even for writes.
 *   connect_reset      — the socket dropped after being established: a write
 *                        MAY have executed. Retry only reads.
 *   timeout            — same uncertainty as connect_reset.
 *   http_error         — TD answered with a non-2xx status: a real answer, not
 *                        a transport problem. Never retry.
 */
export function classifyConnectionError(e: unknown): TDErrorKind {
  const msg = errorMessage(e).toLowerCase();

  if (/timed out|timeout|aborted|abort/.test(msg)) return "timeout";
  // "HTTP Error 500" is urllib's spelling (the stdio Python client); undici
  // spells it "HTTP 500 ...". Both are a real bridge answer: never retried.
  if (/http \d{3}|http error \d{3}/.test(msg)) return "http_error";
  // Socket-level resets are checked BEFORE the generic "fetch failed" wording:
  // undici wraps the real code in `cause`, so "fetch failed ECONNRESET" means
  // the connection WAS established and then dropped — a write may have landed.
  // "errno 104"/"connection reset" are urllib's spellings of the same thing.
  if (
    /econnreset|socket hang up|connection dropped|epipe|other side closed|premature close|terminated|errno 104|connection reset|winerror 10054/.test(
      msg,
    )
  ) {
    return "connect_reset";
  }
  if (
    /econnrefused|enotfound|eaddrnotavail|ehostunreach|enetunreach|fetch failed|unable to connect|connection refused|could not connect|errno 111|winerror 10061|actively refused/.test(
      msg,
    )
  ) {
    return "bridge_unreachable";
  }
  if (/websocket/.test(msg)) return "ws_error";
  return "unknown";
}

export function errorMessage(e: unknown, depth = 0): string {
  if (depth > 3) return "";
  if (e instanceof Error) {
    // Walk the cause chain: undici reports "fetch failed" and hides the real
    // socket code (ECONNREFUSED vs ECONNRESET) one level down. That distinction
    // decides whether retrying a write is safe, so it must not be lost.
    const cause = (e as { cause?: unknown }).cause;
    const tail =
      cause && cause !== e ? " " + errorMessage(cause, depth + 1) : "";
    return e.message + tail;
  }
  if (typeof e === "string") return e;
  if (e && typeof e === "object") {
    const code = (e as { code?: unknown }).code;
    const msg = (e as { message?: unknown }).message;
    const parts = [code, msg].filter(Boolean).map(String);
    if (parts.length) return parts.join(" ");
  }
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

/** Is it worth trying again? `requestReallyHappened` encodes the uncertainty
 *  rule above: only reads may be retried when the socket was already open. */
export function isRetryable(kind: TDErrorKind, method: string): boolean {
  const m = (method || "GET").toUpperCase();
  const isRead = m === "GET" || m === "HEAD";
  if (kind === "bridge_unreachable") return true; // never reached TD
  if (kind === "connect_reset" || kind === "timeout") return isRead;
  return false;
}

/** Human-readable, actionable hint per kind. */
export const KIND_HINTS: Record<TDErrorKind, string> = {
  bridge_unreachable:
    "El bridge de TD no está escuchando. Verificá que TD esté abierto, que el componente del API esté cargado y que el puerto sea el correcto (Settings → MCP). Si acabás de abrir TD, reintentá en unos segundos.",
  connect_reset:
    "La conexión se cortó con el socket ya abierto: TD puede haberse cerrado, congelado o quedado sin cocinar. Revisá el estado de TD antes de reintentar una escritura (pudo haberse aplicado).",
  timeout:
    "El bridge no respondió dentro del timeout. Suele ser TD ocupado u operación pesada: acotá el scope (path/limit) antes de reintentar.",
  http_error:
    "TD respondió con un error HTTP: es una respuesta real, no un problema de conexión. Leé el mensaje del bridge y corregí la llamada.",
  ws_error:
    "Falló el transporte WebSocket. Si el modo es 'auto' el cliente reintenta por HTTP; si es 'websocket', revisá que ese transporte esté disponible.",
  unknown: "Error no clasificado del transporte. Adjuntá el log del cliente al reportar.",
};
