import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TDClient } from "td-api";
import { z } from "zod";
import { ok, err } from "../helpers.js";

// ── Types ──────────────────────────────────────────────────────────────

interface PerfSample {
  timestamp: string;
  fps: number;
  operators: Array<{
    path: string;
    name: string;
    type: string;
    cpu_ms: number;
  }>;
}

interface Alert {
  timestamp: string;
  path: string;
  name: string;
  type: string;
  cpu_ms: number;
  threshold: number;
}

interface WatchSession {
  active: boolean;
  path: string;
  interval: number;        // ms between polls
  threshold: number;       // ms cook time alert threshold
  max_samples: number;     // circular buffer size
  history: PerfSample[];
  historyIndex: number;    // next write position in circular buffer
  historyCount: number;    // number of samples written (capped at max_samples)
  alerts: Alert[];
  timerId: ReturnType<typeof setInterval> | null;
}

// ── Session state ──────────────────────────────────────────────────────

let session: WatchSession | null = null;

/**
 * Start a new watch session, stopping any existing one first.
 */
function startSession(
  client: TDClient,
  path: string,
  intervalSec: number,
  thresholdMs: number,
  maxSamples: number,
): void {
  // Stop existing session
  stopSession();

  const intervalMs = Math.max(1000, Math.round(intervalSec * 1000));
  const history: PerfSample[] = new Array(maxSamples);

  session = {
    active: true,
    path,
    interval: intervalMs,
    threshold: thresholdMs,
    max_samples: maxSamples,
    history,
    historyIndex: 0,
    historyCount: 0,
    alerts: [],
    timerId: null,
  };

  // Take an immediate sample, then start periodic polling
  takeSample(client).catch(() => { /* swallow */ });
  session.timerId = setInterval(() => {
    takeSample(client).catch(() => { /* swallow */ });
  }, intervalMs);
}

/**
 * Stop the active watch session if one exists.
 */
function stopSession(): void {
  if (session && session.timerId !== null) {
    clearInterval(session.timerId);
  }
  session = null;
}

/**
 * Fetch a performance sample from TD and record it.
 */
async function takeSample(client: TDClient): Promise<void> {
  if (!session) return;

  try {
    const result = await client.getPerf(session.path, 20) as {
      performance?: {
        fps?: number;
        operators?: Array<{
          path: string;
          name: string;
          type: string;
          cpu_ms: number;
        }>;
      };
    };

    const perf = result?.performance;
    const fps = perf?.fps ?? 0;
    const operators = perf?.operators ?? [];

    const sample: PerfSample = {
      timestamp: new Date().toISOString(),
      fps,
      operators,
    };

    // Write into circular buffer
    session.history[session.historyIndex] = sample;
    session.historyIndex = (session.historyIndex + 1) % session.max_samples;
    if (session.historyCount < session.max_samples) {
      session.historyCount++;
    }

    // Check for threshold violations
    for (const op of operators) {
      if (op.cpu_ms > session.threshold) {
        session.alerts.push({
          timestamp: sample.timestamp,
          path: op.path,
          name: op.name,
          type: op.type,
          cpu_ms: op.cpu_ms,
          threshold: session.threshold,
        });
      }
    }
  } catch {
    // Silently skip failed samples
  }
}

/**
 * Build the snapshot response from current session state.
 * Now includes `full_history` (the complete ordered sample buffer)
 * for the agent to perform trend analysis and historical comparisons.
 */
function buildSnapshot(): {
  running: boolean;
  alerts: Alert[];
  history_length: number;
  current_fps: number;
  slowest: Array<{ path: string; name: string; type: string; cpu_ms: number }>;
  full_history: PerfSample[];
} {
  if (!session) {
    return {
      running: false,
      alerts: [],
      history_length: 0,
      current_fps: 0,
      slowest: [],
      full_history: [],
    };
  }

  // Collect samples from circular buffer in chronological order
  const samples: PerfSample[] = [];
  if (session.historyCount < session.max_samples) {
    // Not yet filled the buffer
    for (let i = 0; i < session.historyCount; i++) {
      samples.push(session.history[i]);
    }
  } else {
    // Full circular buffer — start at historyIndex
    for (let i = 0; i < session.max_samples; i++) {
      const idx = (session.historyIndex + i) % session.max_samples;
      samples.push(session.history[idx]);
    }
  }

  // Latest FPS
  const latest = samples[samples.length - 1];
  const currentFps = latest?.fps ?? 0;

  // Aggregate slowest operators across recent samples (last 5 or all if fewer)
  const recentCount = Math.min(5, samples.length);
  const recentSamples = samples.slice(-recentCount);
  const opMap = new Map<string, { path: string; name: string; type: string; cpu_ms: number }>();
  for (const s of recentSamples) {
    for (const op of s.operators) {
      const existing = opMap.get(op.path);
      if (!existing || op.cpu_ms > existing.cpu_ms) {
        opMap.set(op.path, { path: op.path, name: op.name, type: op.type, cpu_ms: op.cpu_ms });
      }
    }
  }
  const slowest = Array.from(opMap.values())
    .sort((a, b) => b.cpu_ms - a.cpu_ms)
    .slice(0, 20);

  return {
    running: session.active,
    alerts: session.alerts.slice(-50), // keep last 50 alerts in response
    history_length: session.historyCount,
    current_fps: currentFps,
    slowest,
    full_history: samples, // ← mejora 4: histórico acumulado completo
  };
}

// ── Registered tool ────────────────────────────────────────────────────

export function registerWatchdogTools(server: McpServer, client: TDClient) {
  // ---------------------------------------------------------------------------
  // td_watch — real-time performance monitoring
  // ---------------------------------------------------------------------------
  server.registerTool(
    "td_watch",
    {
      title: "Watch Performance",
      description:
        "Start or stop real-time performance monitoring in TouchDesigner. " +
        "When started, polls getPerf() every `interval` seconds, accumulates samples " +
        "in a circular buffer, and alerts when any operator exceeds `threshold` ms cook time. " +
        "Call without arguments to get the current snapshot of the running watch.",
      inputSchema: {
        path: z
          .string()
          .optional()
          .default("/")
          .describe("Operator path to monitor (default: '/')"),
        interval: z
          .number()
          .optional()
          .default(5)
          .describe("Polling interval in seconds (minimum 1, default 5)"),
        threshold: z
          .number()
          .optional()
          .default(50)
          .describe("Cook time threshold in ms to trigger an alert (default: 50)"),
        max_samples: z
          .number()
          .int()
          .min(1)
          .max(3600)
          .optional()
          .default(60)
          .describe("Max samples in circular history buffer (default: 60)"),
        action: z
          .enum(["start", "stop", "snapshot"])
          .optional()
          .default("snapshot")
          .describe(
            "'start' begins monitoring, 'stop' ends it, 'snapshot' returns current state (default: snapshot)",
          ),
      },
    },
    async ({ path, interval, threshold, max_samples, action }) => {
      try {
        const resolvedPath = path ?? "/";
        const resolvedInterval = interval ?? 5;
        const resolvedThreshold = threshold ?? 50;
        const resolvedMaxSamples = max_samples ?? 60;

        switch (action) {
          case "start":
            startSession(client, resolvedPath, resolvedInterval, resolvedThreshold, resolvedMaxSamples);
            return ok({
              message: `Started performance watch on "${resolvedPath}" (interval=${resolvedInterval}s, threshold=${resolvedThreshold}ms, max_samples=${resolvedMaxSamples})`,
              ...buildSnapshot(),
            });

          case "stop":
            stopSession();
            return ok({
              message: "Performance watch stopped.",
              running: false,
              alerts: [],
              history_length: 0,
              current_fps: 0,
              slowest: [],
            });

          case "snapshot":
          default:
            return ok(buildSnapshot());
        }
      } catch (e: any) {
        return err(e);
      }
    },
  );
}
