/**
 * Contract sync guard (backlog item 57 follow-up): tests/bridge_contract.json
 * is the designated source of truth for the client diagnostics parity between
 * the TS client (api/src/diagnostics.ts) and the stdio Python client
 * (mcp_server_stdio.py). The Python parity suite reads the contract — this
 * test closes the loop on the TS side so that editing diagnostics.ts (or the
 * contract) out from under the other fails LOUDLY here.
 *
 * Checked against the COMPILED module (api/dist/diagnostics.js), i.e. what the
 * runtime actually serves:
 *   1. every parity input in the contract classifies to the expected kind via
 *      classifyConnectionError();
 *   2. every contract pattern regex accepts at least one parity input of its
 *      kind (no dead patterns) and KIND_HINTS covers exactly the contract
 *      kinds with EXACT hint text;
 *   3. isRetryable() implements the contract retry_rules;
 *   4. the in-repo generator script (tmp/ is throwaway, so the check is
 *      inline here) has nothing to regenerate: the hints extracted from
 *      diagnostics.ts source must equal the contract hints — catches
 *      hand-edits of the contract.
 *
 * Build first: cd api && npm run build
 * Run: node --test test/contractSync.test.js
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  KIND_HINTS,
  classifyConnectionError,
  isRetryable,
} from "../../api/dist/diagnostics.js";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CONTRACT = JSON.parse(
  readFileSync(join(REPO, "tests", "bridge_contract.json"), "utf-8"),
);
const DIAG_SOURCE = readFileSync(
  join(REPO, "api", "src", "diagnostics.ts"),
  "utf-8",
);

const EC = CONTRACT.error_classification;
assert.ok(EC, "bridge_contract.json is missing error_classification — regenerate it from api/src/diagnostics.ts");

// The SAME parity inputs the Python suite asserts
// (tests/test_client_contract.py TestClassificationParity.PARITY_INPUTS).
// Each input must classify identically on both clients.
const PARITY_INPUTS = [
  ["<urlopen error [Errno 111] Connection refused>", "bridge_unreachable"],
  ["connection refused by 127.0.0.1", "bridge_unreachable"],
  [
    "<urlopen error [WinError 10061] No connection could be made because " +
      "the target machine actively refused it>",
    "bridge_unreachable",
  ],
  ["[Errno 104] Connection reset by peer", "connect_reset"],
  ["socket hang up", "connect_reset"],
  ["other side closed", "connect_reset"],
  ["timed out", "timeout"],
  ["The read operation timed out", "timeout"],
  ["HTTP Error 500: Internal Server Error", "http_error"],
  ["HTTP Error 400: Bad Request", "http_error"],
  ["websocket transport failure", "ws_error"],
  ["algo raro", "unknown"],
];

describe("contract sync: classification (TS compiled vs contract)", () => {
  it("every parity input classifies to the contract kind via the TS module", () => {
    for (const [msg, expected] of PARITY_INPUTS) {
      assert.equal(
        classifyConnectionError(msg),
        expected,
        `TS classifier drift: classify(${JSON.stringify(msg)}) should be ${expected} — ` +
          `align api/src/diagnostics.ts with tests/bridge_contract.json`,
      );
    }
  });

  it("every contract pattern matches its own parity inputs (no dead patterns)", () => {
    for (const [kind, pattern] of Object.entries(EC.patterns)) {
      const rx = new RegExp(pattern, "i");
      const matching = PARITY_INPUTS.filter(([msg, k]) => k === kind && rx.test(msg.toLowerCase()));
      assert.ok(
        matching.length > 0,
        `contract pattern for '${kind}' (${pattern}) matches none of its parity inputs — ` +
          `the pattern and the parity table have drifted`,
      );
    }
  });

  it("kind inventory matches", () => {
    assert.deepEqual(
      [...EC.kinds].sort(),
      ["bridge_unreachable", "connect_reset", "http_error", "timeout", "unknown", "ws_error"],
    );
  });
});

describe("contract sync: hints (TS compiled vs contract)", () => {
  it("KIND_HINTS text equals the contract hints EXACTLY, per kind", () => {
    for (const kind of EC.kinds) {
      assert.equal(
        KIND_HINTS[kind],
        EC.hints[kind],
        `hint drift for '${kind}': diagnostics.ts and bridge_contract.json disagree — ` +
          `regenerate the contract from the TS (the TS is the original), do not hand-edit`,
      );
    }
  });

  it("KIND_HINTS has no extra kinds beyond the contract", () => {
    const extra = Object.keys(KIND_HINTS).filter((k) => !EC.kinds.includes(k));
    assert.deepEqual(
      extra, [],
      `KIND_HINTS defines kinds absent from the contract: ${extra.join(", ")} — update error_classification.kinds`,
    );
  });

  it("contract hints are still what diagnostics.ts source declares (no hand-edited contract)", () => {
    // Inline re-extraction (same regex as the one-shot generator): if this
    // fails, someone edited the contract without regenerating from the TS.
    const m = DIAG_SOURCE.match(
      /export const KIND_HINTS: Record<TDErrorKind, string> = \{([\s\S]*?)\n\};/,
    );
    assert.ok(m, "KIND_HINTS block not found in diagnostics.ts");
    for (const km of m[1].matchAll(/(\w+):\s*\n?\s*"((?:[^"\\]|\\.)*)"/g)) {
      const kind = km[1];
      const text = km[2].replace(/\\"/g, '"');
      assert.equal(
        EC.hints[kind],
        text,
        `contract hint for '${kind}' was hand-edited — regenerate error_classification from api/src/diagnostics.ts`,
      );
    }
  });
});

describe("contract sync: retry rules (TS compiled vs contract)", () => {
  const RULE_MATRIX = [
    ["bridge_unreachable", "POST", true],
    ["bridge_unreachable", "GET", true],
    ["connect_reset", "GET", true],
    ["connect_reset", "POST", false],
    ["timeout", "GET", true],
    ["timeout", "POST", false],
    ["http_error", "GET", false],
    ["http_error", "POST", false],
    ["ws_error", "GET", false],
    ["unknown", "POST", false],
  ];

  it("isRetryable implements the contract retry_rules", () => {
    for (const [kind, method, expected] of RULE_MATRIX) {
      assert.equal(
        isRetryable(kind, method),
        expected,
        `retry drift: isRetryable(${kind}, ${method}) should be ${expected}`,
      );
    }
  });

  it("every contract rule maps onto the same decision", () => {
    for (const [kind, rule] of Object.entries(EC.retry_rules)) {
      if (rule.startsWith("always")) {
        assert.ok(isRetryable(kind, "POST"), `${kind}: contract says always, TS refuses writes`);
      } else if (rule.startsWith("reads only")) {
        assert.ok(isRetryable(kind, "GET"), `${kind}: contract says reads-only, TS refuses reads`);
        assert.ok(!isRetryable(kind, "POST"), `${kind}: contract says reads-only, TS retries writes`);
      } else if (rule === "never") {
        assert.ok(!isRetryable(kind, "GET"), `${kind}: contract says never, TS retries reads`);
      }
    }
  });
});
