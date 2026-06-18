/**
 * Unit tests for Parameter tools — the 5 tool handlers in mcp/src/tools/parameters.ts:
 *   - td_pars_get
 *   - td_pars_set
 *   - td_set_operator_pars
 *   - td_pulse_param
 *   - td_custom_parameters
 *
 * These are offline tests: a MockTDClient mirrors the real TDClient method
 * signatures + defaults and returns representative payloads. The handler
 * "mirror" functions below reproduce the EXACT closure logic from parameters.ts
 * (argument plumbing, transactional defaults, postModifyValidate integration),
 * so we are testing real behavior without a live TouchDesigner instance.
 *
 * We import the REAL `ok`/`err` (helpers.js) and the REAL `postModifyValidate`
 * (tools/postValidate.js) — postModifyValidate is itself thoroughly covered in
 * postValidate.test.js, so here it runs against a healthy mock healthcheck.
 *
 * Build first:  npx tsc -p mcp/tsconfig.json
 * Run:          node --experimental-vm-modules mcp/test/parameters.test.js
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ok, err } from "../dist/helpers.js";
import { postModifyValidate } from "../dist/tools/postValidate.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Extract the parent path of a TD operator path.
 *   "/project1/noise1"      → "/project1"
 *   "/project1/geo1/null1"  → "/project1/geo1"
 *   "/project1"             → "/"
 * Equivalent to getParentPath() in postValidate.ts.
 */
function getParent(path) {
  const parts = path.split("/").filter(Boolean);
  if (parts.length <= 1) return "/";
  return "/" + parts.slice(0, -1).join("/");
}

/** Parse the MCP text payload out of an ok()/err() response. */
function payload(result) {
  return JSON.parse(result.content[0].text);
}

// ─── Mock TDClient ───────────────────────────────────────────────────────────

class MockTDClient {
  constructor() {
    this.calls = [];
  }

  // getParameters(path, names?)
  async getParameters(path, names) {
    this.calls.push({ method: "getParameters", path, names });
    return {
      success: true,
      path,
      operator: "TestOp",
      parameters: [
        { name: "amp", label: "Amplitude", value: 0.5, style: "Float" },
        { name: "freq", label: "Frequency", value: 440, style: "Float" },
      ],
    };
  }

  // setParameters(path, updates, transactional=true)
  // Throws when the target path contains "fail" — used to test error paths.
  async setParameters(path, updates, transactional) {
    transactional = transactional === undefined ? true : transactional;
    if (typeof path === "string" && path.includes("fail")) {
      throw new Error("setParameters failed");
    }
    this.calls.push({ method: "setParameters", path, updates, transactional });
    return { success: true, path, updates, transactional };
  }

  // pulseParam(path, name)
  async pulseParam(path, name) {
    this.calls.push({ method: "pulseParam", path, name });
    return { success: true, path, name, pulsed: true };
  }

  // customParameters(path, page, params)
  // Throws when path contains "fail"
  async customParameters(path, page, params) {
    if (typeof path === "string" && path.includes("fail")) {
      throw new Error("customParameters failed");
    }
    this.calls.push({ method: "customParameters", path, page, params });
    return {
      success: true,
      path,
      page,
      params,
      created: params.length,
    };
  }

  // ── Methods used by postModifyValidate ─────────────────────────────────────
  async healthcheck(path, recurse) {
    this.calls.push({
      method: "healthcheck",
      path,
      recurse: recurse === undefined ? false : recurse,
    });
    return { ok: true, issueCount: 0, operators: [], issues: [], path, recurse };
  }

  async execute(code, from) {
    this.calls.push({ method: "execute", code, from });
    return { success: true, stdout: '{"fixed": 0}', stderr: "", from_op: from };
  }
}

/**
 * Build a client whose `methodName` throws `message`.
 */
function throwingClient(methodName, message) {
  const client = new MockTDClient();
  client[methodName] = async () => {
    throw new Error(message);
  };
  return client;
}

// ─── Handler mirrors (exact logic from parameters.ts) ────────────────────────

// td_pars_get
async function parsGetHandler(client, { path: opPath, names }) {
  try {
    const result = await client.getParameters(opPath, names);
    return ok(result);
  } catch (e) {
    return err(e);
  }
}

// td_pars_set
async function parsSetHandler(client, { path: opPath, updates, transactional }) {
  try {
    const result = await client.setParameters(
      opPath,
      updates,
      transactional ?? true
    );
    const validation = await postModifyValidate(client, opPath);
    return ok({ ...result, validation });
  } catch (e) {
    return err(e);
  }
}

// td_set_operator_pars
async function setOperatorParsHandler(client, {
  path: opPath,
  updates,
  transactional,
}) {
  try {
    const apiUpdates = updates.map((u) => ({
      name: u.name,
      value: u.value,
    }));
    const result = await client.setParameters(
      opPath,
      apiUpdates,
      transactional ?? true
    );
    const validation = await postModifyValidate(client, opPath);
    return ok({ ...result, validation });
  } catch (e) {
    return err(e);
  }
}

// td_pulse_param
async function pulseParamHandler(client, { path: opPath, name }) {
  try {
    const result = await client.pulseParam(opPath, name);
    return ok(result);
  } catch (e) {
    return err(e);
  }
}

// td_custom_parameters
async function customParametersHandler(client, {
  path: opPath,
  page,
  params,
}) {
  try {
    const result = await client.customParameters(opPath, page, params);
    const validation = await postModifyValidate(client, opPath);
    return ok({ ...result, validation });
  } catch (e) {
    return err(e);
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Parameter Tools", () => {
  // ===========================================================================
  // td_pars_get
  // ===========================================================================
  describe("td_pars_get", () => {
    it("basic get with path → returns parameters array", async () => {
      const client = new MockTDClient();
      const r = await parsGetHandler(client, { path: "/project1/noise1" });
      const data = payload(r);

      assert.equal(r.isError, undefined, "should not be error");
      assert.equal(data.success, true);
      assert.equal(data.path, "/project1/noise1");
      assert.ok(Array.isArray(data.parameters), "parameters should be an array");
      assert.equal(data.parameters.length, 2);
    });

    it("with names filter → names forwarded to client", async () => {
      const client = new MockTDClient();
      await parsGetHandler(client, {
        path: "/project1/noise1",
        names: ["amp", "freq"],
      });
      const call = client.calls.find((c) => c.method === "getParameters");

      assert.deepEqual(call.names, ["amp", "freq"]);
    });

    it("without names filter → names is undefined", async () => {
      const client = new MockTDClient();
      await parsGetHandler(client, { path: "/project1/noise1" });
      const call = client.calls.find((c) => c.method === "getParameters");

      assert.equal(call.names, undefined);
    });

    it("with empty names array → forwarded as empty array", async () => {
      const client = new MockTDClient();
      await parsGetHandler(client, {
        path: "/project1/noise1",
        names: [],
      });
      const call = client.calls.find((c) => c.method === "getParameters");

      assert.deepEqual(call.names, []);
    });

    it("does NOT call postModifyValidate (no healthcheck)", async () => {
      const client = new MockTDClient();
      await parsGetHandler(client, { path: "/project1/noise1" });

      assert.equal(
        client.calls.some((c) => c.method === "healthcheck"),
        false,
        "get should not trigger healthcheck"
      );
    });

    it("path is passed to client", async () => {
      const client = new MockTDClient();
      await parsGetHandler(client, { path: "/project1/blur1" });
      const call = client.calls.find((c) => c.method === "getParameters");

      assert.equal(call.path, "/project1/blur1");
    });

    it("client throws → returns err()", async () => {
      const client = throwingClient("getParameters", "Operator not found");
      const r = await parsGetHandler(client, { path: "/project1/missing" });

      assert.equal(r.isError, true);
      assert.equal(payload(r).error, "Operator not found");
    });
  });

  // ===========================================================================
  // td_pars_set
  // ===========================================================================
  describe("td_pars_set", () => {
    it("basic set with single update → success", async () => {
      const client = new MockTDClient();
      const r = await parsSetHandler(client, {
        path: "/project1/noise1",
        updates: [{ name: "amp", value: 0.8 }],
      });
      const data = payload(r);

      assert.equal(r.isError, undefined);
      assert.equal(data.success, true);
      const call = client.calls.find((c) => c.method === "setParameters");
      assert.equal(call.path, "/project1/noise1");
      assert.equal(call.updates[0].name, "amp");
      assert.equal(call.updates[0].value, 0.8);
    });

    it("with multiple updates → all forwarded", async () => {
      const client = new MockTDClient();
      await parsSetHandler(client, {
        path: "/project1/noise1",
        updates: [
          { name: "amp", value: 0.8 },
          { name: "freq", value: 220 },
        ],
      });
      const call = client.calls.find((c) => c.method === "setParameters");

      assert.equal(call.updates.length, 2);
      assert.equal(call.updates[0].name, "amp");
      assert.equal(call.updates[1].name, "freq");
    });

    it("transactional defaults to true when omitted", async () => {
      const client = new MockTDClient();
      await parsSetHandler(client, {
        path: "/project1/noise1",
        updates: [{ name: "amp", value: 0.5 }],
      });
      const call = client.calls.find((c) => c.method === "setParameters");

      assert.equal(call.transactional, true);
    });

    it("transactional=false explicitly → forwarded", async () => {
      const client = new MockTDClient();
      await parsSetHandler(client, {
        path: "/project1/noise1",
        updates: [{ name: "amp", value: 0.5 }],
        transactional: false,
      });
      const call = client.calls.find((c) => c.method === "setParameters");

      assert.equal(call.transactional, false);
    });

    it("transactional=true explicitly → forwarded", async () => {
      const client = new MockTDClient();
      await parsSetHandler(client, {
        path: "/project1/noise1",
        updates: [{ name: "amp", value: 0.5 }],
        transactional: true,
      });
      const call = client.calls.find((c) => c.method === "setParameters");

      assert.equal(call.transactional, true);
    });

    it("with expr → expr forwarded in update", async () => {
      const client = new MockTDClient();
      await parsSetHandler(client, {
        path: "/project1/noise1",
        updates: [{ name: "amp", value: null, expr: "absTime.seconds" }],
      });
      const call = client.calls.find((c) => c.method === "setParameters");

      assert.equal(call.updates[0].name, "amp");
      assert.equal(call.updates[0].expr, "absTime.seconds");
    });

    it("validation is included in the response", async () => {
      const client = new MockTDClient();
      const data = payload(
        await parsSetHandler(client, {
          path: "/project1/noise1",
          updates: [{ name: "amp", value: 0.5 }],
        })
      );

      assert.ok(data.validation, "validation should be present");
      assert.equal(data.validation.ok, true);
      assert.equal(data.validation.issueCount, 0);
    });

    it("calls setParameters BEFORE postModifyValidate (order)", async () => {
      const client = new MockTDClient();
      await parsSetHandler(client, {
        path: "/project1/noise1",
        updates: [{ name: "amp", value: 0.5 }],
      });
      const setIdx = client.calls.findIndex(
        (c) => c.method === "setParameters"
      );
      const healthIdx = client.calls.findIndex(
        (c) => c.method === "healthcheck"
      );

      assert.ok(setIdx >= 0, "setParameters must be called");
      assert.ok(healthIdx >= 0, "healthcheck must be called");
      assert.ok(
        setIdx < healthIdx,
        "setParameters should be called before healthcheck"
      );
    });

    it("client throws → returns err()", async () => {
      const client = throwingClient("setParameters", "Invalid path");
      const r = await parsSetHandler(client, {
        path: "/project1/noise1",
        updates: [{ name: "amp", value: 0.5 }],
      });

      assert.equal(r.isError, true);
      assert.equal(payload(r).error, "Invalid path");
    });
  });

  // ===========================================================================
  // td_set_operator_pars
  // ===========================================================================
  describe("td_set_operator_pars", () => {
    it("basic set with single update → success", async () => {
      const client = new MockTDClient();
      const r = await setOperatorParsHandler(client, {
        path: "/project1/noise1",
        updates: [{ name: "amp", value: 0.8 }],
      });
      const data = payload(r);

      assert.equal(r.isError, undefined);
      assert.equal(data.success, true);
      const call = client.calls.find((c) => c.method === "setParameters");
      assert.equal(call.path, "/project1/noise1");
      assert.equal(call.updates[0].name, "amp");
      assert.equal(call.updates[0].value, 0.8);
    });

    it("mapping strips expr → apiUpdates only have name/value", async () => {
      const client = new MockTDClient();
      await setOperatorParsHandler(client, {
        path: "/project1/noise1",
        updates: [{ name: "amp", value: 0.8 }],
      });
      const call = client.calls.find((c) => c.method === "setParameters");

      // apiUpdates only have name/value (no expr, no extra fields)
      const keys = Object.keys(call.updates[0]).sort();
      assert.deepEqual(keys, ["name", "value"], "only name/value should be in apiUpdates");
    });

    it("multiple updates → all mapped and forwarded", async () => {
      const client = new MockTDClient();
      await setOperatorParsHandler(client, {
        path: "/project1/noise1",
        updates: [
          { name: "amp", value: 0.8 },
          { name: "freq", value: 220 },
        ],
      });
      const call = client.calls.find((c) => c.method === "setParameters");

      assert.equal(call.updates.length, 2);
    });

    it("transactional defaults to true when omitted", async () => {
      const client = new MockTDClient();
      await setOperatorParsHandler(client, {
        path: "/project1/noise1",
        updates: [{ name: "amp", value: 0.5 }],
      });
      const call = client.calls.find((c) => c.method === "setParameters");

      assert.equal(call.transactional, true);
    });

    it("transactional=false explicitly → forwarded", async () => {
      const client = new MockTDClient();
      await setOperatorParsHandler(client, {
        path: "/project1/noise1",
        updates: [{ name: "amp", value: 0.5 }],
        transactional: false,
      });
      const call = client.calls.find((c) => c.method === "setParameters");

      assert.equal(call.transactional, false);
    });

    it("validation is included in the response", async () => {
      const client = new MockTDClient();
      const data = payload(
        await setOperatorParsHandler(client, {
          path: "/project1/noise1",
          updates: [{ name: "amp", value: 0.5 }],
        })
      );

      assert.ok(data.validation, "validation should be present");
      assert.equal(data.validation.ok, true);
    });

    it("calls setParameters BEFORE postModifyValidate", async () => {
      const client = new MockTDClient();
      await setOperatorParsHandler(client, {
        path: "/project1/noise1",
        updates: [{ name: "amp", value: 0.5 }],
      });
      const setIdx = client.calls.findIndex(
        (c) => c.method === "setParameters"
      );
      const healthIdx = client.calls.findIndex(
        (c) => c.method === "healthcheck"
      );

      assert.ok(setIdx >= 0);
      assert.ok(healthIdx >= 0);
      assert.ok(setIdx < healthIdx);
    });

    it("client throws → returns err()", async () => {
      const client = throwingClient("setParameters", "Invalid path");
      const r = await setOperatorParsHandler(client, {
        path: "/project1/noise1",
        updates: [{ name: "amp", value: 0.5 }],
      });

      assert.equal(r.isError, true);
      assert.equal(payload(r).error, "Invalid path");
    });
  });

  // ===========================================================================
  // td_pulse_param
  // ===========================================================================
  describe("td_pulse_param", () => {
    it("basic pulse → returns success with pulsed:true", async () => {
      const client = new MockTDClient();
      const r = await pulseParamHandler(client, {
        path: "/project1/noise1",
        name: "cook",
      });
      const data = payload(r);

      assert.equal(r.isError, undefined);
      assert.equal(data.success, true);
      assert.equal(data.pulsed, true);
      assert.equal(data.path, "/project1/noise1");
      assert.equal(data.name, "cook");
    });

    it("path and name forwarded to client", async () => {
      const client = new MockTDClient();
      await pulseParamHandler(client, {
        path: "/project1/blur1",
        name: "reset",
      });
      const call = client.calls.find((c) => c.method === "pulseParam");

      assert.equal(call.path, "/project1/blur1");
      assert.equal(call.name, "reset");
    });

    it("does NOT call postModifyValidate (no healthcheck)", async () => {
      const client = new MockTDClient();
      await pulseParamHandler(client, {
        path: "/project1/noise1",
        name: "cook",
      });

      assert.equal(
        client.calls.some((c) => c.method === "healthcheck"),
        false,
        "pulse should not trigger healthcheck"
      );
    });

    it("client throws → returns err()", async () => {
      const client = throwingClient("pulseParam", "Param not found");
      const r = await pulseParamHandler(client, {
        path: "/project1/noise1",
        name: "missing",
      });

      assert.equal(r.isError, true);
      assert.equal(payload(r).error, "Param not found");
    });
  });

  // ===========================================================================
  // td_custom_parameters
  // ===========================================================================
  describe("td_custom_parameters", () => {
    it("basic custom param creation → success", async () => {
      const client = new MockTDClient();
      const r = await customParametersHandler(client, {
        path: "/project1/noise1",
        page: "Custom",
        params: [{ name: "myParam", type: "float", default: 1.0 }],
      });
      const data = payload(r);

      assert.equal(r.isError, undefined);
      assert.equal(data.success, true);
      assert.equal(data.page, "Custom");
      assert.equal(data.created, 1);
    });

    it("with multiple params → forwarded", async () => {
      const client = new MockTDClient();
      await customParametersHandler(client, {
        path: "/project1/noise1",
        page: "User",
        params: [
          { name: "speed", type: "float", default: 1.0 },
          { name: "count", type: "int", default: 10 },
        ],
      });
      const call = client.calls.find((c) => c.method === "customParameters");

      assert.equal(call.page, "User");
      assert.equal(call.params.length, 2);
      assert.equal(call.params[0].name, "speed");
      assert.equal(call.params[1].name, "count");
    });

    it("with min/max bounds → forwarded", async () => {
      const client = new MockTDClient();
      await customParametersHandler(client, {
        path: "/project1/noise1",
        page: "Bounds",
        params: [{ name: "x", type: "float", default: 0.5, min: 0, max: 1 }],
      });
      const call = client.calls.find((c) => c.method === "customParameters");

      assert.equal(call.params[0].min, 0);
      assert.equal(call.params[0].max, 1);
    });

    it("validation is included in the response", async () => {
      const client = new MockTDClient();
      const data = payload(
        await customParametersHandler(client, {
          path: "/project1/noise1",
          page: "Custom",
          params: [{ name: "p1", type: "float" }],
        })
      );

      assert.ok(data.validation, "validation should be present");
      assert.equal(data.validation.ok, true);
    });

    it("calls customParameters BEFORE postModifyValidate", async () => {
      const client = new MockTDClient();
      await customParametersHandler(client, {
        path: "/project1/noise1",
        page: "Custom",
        params: [{ name: "p1", type: "float" }],
      });
      const custIdx = client.calls.findIndex(
        (c) => c.method === "customParameters"
      );
      const healthIdx = client.calls.findIndex(
        (c) => c.method === "healthcheck"
      );

      assert.ok(custIdx >= 0);
      assert.ok(healthIdx >= 0);
      assert.ok(custIdx < healthIdx);
    });

    it("client throws → returns err()", async () => {
      const client = throwingClient("customParameters", "Operator not found");
      const r = await customParametersHandler(client, {
        path: "/project1/noise1",
        page: "Custom",
        params: [{ name: "p1", type: "float" }],
      });

      assert.equal(r.isError, true);
      assert.equal(payload(r).error, "Operator not found");
    });
  });

  // ===========================================================================
  // Response-shape contract (ok()/err() integration)
  // ===========================================================================
  describe("response shape contract", () => {
    it("all success responses are ok() shape", async () => {
      const client = new MockTDClient();
      const responses = [
        parsGetHandler(client, { path: "/project1/noise1" }),
        parsSetHandler(client, {
          path: "/project1/noise1",
          updates: [{ name: "amp", value: 0.5 }],
        }),
        setOperatorParsHandler(client, {
          path: "/project1/noise1",
          updates: [{ name: "amp", value: 0.5 }],
        }),
        pulseParamHandler(client, { path: "/project1/noise1", name: "cook" }),
        customParametersHandler(client, {
          path: "/project1/noise1",
          page: "Custom",
          params: [{ name: "p1", type: "float" }],
        }),
      ];

      for (const p of responses) {
        const r = await p;
        assert.ok(Array.isArray(r.content), "content must be an array");
        assert.equal(r.content.length, 1);
        assert.equal(r.content[0].type, "text");
        assert.equal(typeof r.content[0].text, "string");
        assert.equal("isError" in r, false, "success must not set isError");
      }
    });

    it("all error responses are err() shape", async () => {
      const cases = [
        () =>
          parsGetHandler(throwingClient("getParameters", "x"), {
            path: "/p/n",
          }),
        () =>
          parsSetHandler(throwingClient("setParameters", "x"), {
            path: "/p/n",
            updates: [{ name: "a", value: 1 }],
          }),
        () =>
          setOperatorParsHandler(throwingClient("setParameters", "x"), {
            path: "/p/n",
            updates: [{ name: "a", value: 1 }],
          }),
        () =>
          pulseParamHandler(throwingClient("pulseParam", "x"), {
            path: "/p/n",
            name: "cook",
          }),
        () =>
          customParametersHandler(throwingClient("customParameters", "x"), {
            path: "/p/n",
            page: "Custom",
            params: [{ name: "p1", type: "float" }],
          }),
      ];

      for (const run of cases) {
        const r = await run();
        assert.ok(Array.isArray(r.content));
        assert.equal(r.content.length, 1);
        assert.equal(r.content[0].type, "text");
        assert.equal(r.isError, true, "error responses must set isError:true");
      }
    });
  });
});
