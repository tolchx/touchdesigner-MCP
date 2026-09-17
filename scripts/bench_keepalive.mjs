/**
 * Live benchmark: per-request latency against the TD bridge (port 44444).
 *   A) global fetch + "localhost"      (the old default — DNS stall expected)
 *   B) global fetch + "127.0.0.1"      (normalized host, fresh conn per call)
 *   C) TDClient HTTP path (keep-alive) (undici agent + 127.0.0.1, pooled socket)
 * Median of N per case. Requires TD running with the API on 44444.
 */
import { TDClient } from "../api/dist/index.js";

const PORT = 44444;
const N = 7;

async function timeOnce(fn) {
  const t0 = performance.now();
  await fn();
  return performance.now() - t0;
}

function median(arr) {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

async function caseA_localhost() {
  const r = await fetch(`http://localhost:${PORT}/info`);
  await r.json();
}

async function caseB_loopback() {
  const r = await fetch(`http://127.0.0.1:${PORT}/info`);
  await r.json();
}

const client = new TDClient({ transport: "http" });
async function caseC_keepalive() {
  // isConnected uses the HTTP path; or use /exec POST which is the common call.
  await client.execute("pass");
}

const cases = [
  ["A localhost (old default)", caseA_localhost],
  ["B 127.0.0.1 (raw fetch)", caseB_loopback],
  ["C TDClient keep-alive", caseC_keepalive],
];

console.log(`TD bridge benchmark — ${N} iterations per case, median reported\n`);
for (const [label, fn] of cases) {
  // warmup (2 calls, not counted) so each case pays its setup cost upfront
  try {
    await fn();
    await fn();
  } catch (e) {
    console.error(`${label}: FAILED warmup — ${e.message}`);
    continue;
  }
  const times = [];
  for (let i = 0; i < N; i++) {
    times.push(await timeOnce(fn));
  }
  console.log(
    `${label.padEnd(28)} median ${median(times).toFixed(1).padStart(7)} ms   ` +
      `min ${Math.min(...times).toFixed(1)} ms   max ${Math.max(...times).toFixed(1)} ms`,
  );
}
console.log("\n(Note: TD's webserver quantizes responses to the frame clock (~16.7 ms @ 60fps);");
console.log(" differences below one frame are within noise — compare case A against B/C.)");
