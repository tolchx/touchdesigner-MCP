/**
 * Regresión de GENERACIÓN DE PYTHON para lectura (api/src/index.ts).
 *
 * Los dos bugs que motivaron este archivo se encontraron el 24/09/26 probando
 * `td_measure` CONTRA TD REAL (2025.32460), con 1324 tests verdes que no los veían:
 *
 *  1. `readChop` llamaba `t.channel(name)` — que NO EXISTE en TouchDesigner
 *     (`hasattr(t,'channel') == False`) — así que devolvía `channels: {}`
 *     SIEMPRE y sin error: el llamador lo leía como "el CHOP no tiene datos".
 *     Lo que existe es `t.chan(nombre)` y `t[nombre][i]`.
 *  2. `popInspect` asignaba `t.numPoints` SIN llamarlo, pero en este build
 *     `numPoints/numPrims/numVerts` son MÉTODOS: `json.dumps` moría con
 *     "Object of type builtin_function_or_method is not JSON serializable".
 *
 * Método: se captura el código REAL que el cliente manda a `/exec` (stub loopback) y
 * se EJECUTA contra un fake mínimo del API de Python de TD — un fake FIEL (sin
 * `channel()`, con `numPoints()` como método) para que reintroducir el bug vuelva a
 * fallar. Es la semilla del arnés del ítem 52.
 *
 * Build first:  npm run build && (cd api && npx tsc)
 * Run:          node --test mcp/test/readPathCodegen.test.js
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawnSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { TDClient } from "../../api/dist/index.js";

const captured = [];

const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const parsed = body ? JSON.parse(body) : {};
    captured.push({ url: req.url, code: parsed.code ?? "" });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ output: "" }));
  });
});

let port = 0;
before(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  port = server.address().port;
});
after(() => server.close());

const client = () =>
  new TDClient({ host: "127.0.0.1", port, transport: "http", retryAttempts: 1 });

/** Código capturado, sin comentarios (citan la API vieja a propósito). */
function generatedCode() {
  return captured
    .map((c) => c.code)
    .join("\n")
    .split("\n")
    .filter((l) => !l.trim().startsWith("#"))
    .join("\n");
}

// ---------------------------------------------------------------------------
// Fake del API de Python de TD, lo mínimo para EJECUTAR el código generado
// ---------------------------------------------------------------------------

const FAKE_TD = `
import json, sys

class Chop:
    family = 'CHOP'
    OPType = 'noiseCHOP'
    numSamples = 3
    numChans = 2
    path = '/project1/chop1'
    name = 'chop1'
    def chans(self):
        return [Channel('u', [0.25, 0.5, 1.0]), Channel('v', [-1.0, 0.0, 1.0])]
    def chan(self, name):
        for c in self.chans():
            if c.name == name: return c
        return None
    def __getitem__(self, name):
        return self.chan(name)
    # OJO: sin channel() NI numChannels a propósito: en TD 2025.32460 no existen
    # (el atributo real es numChans). Si el generador usa uno de esos, debe fallar.

class Channel:
    def __init__(self, name, vals):
        self.name = name
        self._vals = vals
    def __getitem__(self, i):
        return self._vals[i]

class Pop:
    family = 'POP'
    OPType = 'linePOP'
    path = '/project1/pop1'
    name = 'pop1'
    attribs = None
    def numPoints(self): return 63      # METODO, no propiedad
    def numPrims(self): return 3
    def numVerts(self): return 66

class _Project:
    folder = '/fake'
    name = 'fake.toe'
    cookRate = 60.0
class _App:
    build = '2025.32460'
    product = 'TouchDesigner'
    osName = 'Windows'

project, app, ui, me = _Project(), _App(), None, None

def op(path):
    if path == '/project1/chop1': return Chop()
    if path == '/project1/pop1': return Pop()
    return None

def run(code):
    buf = []
    class Cap:
        def write(self, s): buf.append(s)
        def flush(self): pass
    old = sys.stdout
    sys.stdout = Cap()
    try:
        exec(compile(code, '<generated>', 'exec'), globals())
    finally:
        sys.stdout = old
    return ''.join(buf)
`;

/** Ejecuta el código generado contra el fake y devuelve el JSON parseado. */
function runInFakeTD(code) {
  const dir = mkdtempSync(join(tmpdir(), "faketd-"));
  const fakePath = join(dir, "fake_td.py");
  const codePath = join(dir, "generated.py");
  writeFileSync(fakePath, FAKE_TD, "utf-8");
  writeFileSync(codePath, code, "utf-8");
  const driver = `
import json, sys
sys.path.insert(0, ${JSON.stringify(dir)})
import fake_td
out = fake_td.run(open(${JSON.stringify(codePath)}, encoding='utf-8').read())
print('@@RESULT@@' + out.strip().split('\\n')[-1])
`;
  const r = spawnSync("python", ["-c", driver], { encoding: "utf-8" });
  const line = (r.stdout || "").split("@@RESULT@@")[1];
  if (!line) {
    throw new Error(
      `el código generado no imprimió JSON. stdout=${(r.stdout || "").slice(0, 300)} stderr=${(r.stderr || "").slice(0, 300)}`,
    );
  }
  return JSON.parse(line.trim());
}

// ---------------------------------------------------------------------------
// readChop
// ---------------------------------------------------------------------------

describe("readChop — el código generado lee canales de verdad", () => {
  it("EJECUTADO contra el fake: devuelve los valores de los canales", async () => {
    captured.length = 0;
    await client().readChop("/project1/chop1", undefined, 0, 10).catch(() => {});
    const parsed = runInFakeTD(generatedCode());
    assert.equal(parsed.success, true, JSON.stringify(parsed).slice(0, 200));
    const chans = parsed.data?.channels ?? {};
    assert.deepEqual(Object.keys(chans).sort(), ["u", "v"]);
    assert.deepEqual(chans.u, [0.25, 0.5, 1.0]);
    assert.deepEqual(chans.v, [-1.0, 0.0, 1.0]);
  });

  it("avisa en vez de mentir cuando hay canales declarados y ninguno leído", async () => {
    captured.length = 0;
    await client().readChop("/project1/chop1", ["noexiste"], 0, 10).catch(() => {});
    const parsed = runInFakeTD(generatedCode());
    // Pidió un canal que no existe: error explícito, NUNCA success con channels vacío.
    assert.equal(parsed.success, false);
    assert.match(String(parsed.error), /Read 0 channels out of/);
  });
});

// ---------------------------------------------------------------------------
// popInspect
// ---------------------------------------------------------------------------

describe("popInspect — el código generado llama a los métodos", () => {
  it("EJECUTADO contra el fake: devuelve los conteos como números", async () => {
    captured.length = 0;
    await client().popInspect("/project1/pop1").catch(() => {});
    const parsed = runInFakeTD(generatedCode());
    assert.equal(parsed.success, true, `el generador rompió json.dumps: ${JSON.stringify(parsed).slice(0, 200)}`);
    assert.equal(parsed.data.numPoints, 63);
    assert.equal(parsed.data.numPrims, 3);
    assert.equal(parsed.data.numVerts, 66);
  });
});
