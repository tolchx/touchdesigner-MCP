/**
 * Regresión de GENERACIÓN DE PYTHON para lectura (api/src/index.ts).
 *
 * Los dos bugs que motivaron este archivo se encontraron el 24/09/26 probando
 * `td_measure` CONTRA TD REAL (2025.32460), no offline:
 *
 *  1. `readChop` llamaba `t.channel(name)` — que NO EXISTE en TouchDesigner
 *     (`hasattr(t,'channel') == False`) — así que devolvía `channels: {}`
 *     SIEMPRE y sin error: el llamador lo leía como "el CHOP no tiene datos".
 *     Lo que existe es `t.chan(nombre)` y `t[nombre][i]`.
 *  2. `popInspect` asignaba `t.numPoints` SIN llamarlo, pero en este build
 *     `numPoints/numPrims/numVerts` son MÉTODOS: `json.dumps` moría con
 *     "Object of type builtin_function_or_method is not JSON serializable".
 *
 * Acá se captura el código real que el cliente manda a `/exec` (stub loopback) y
 * se verifica que use la API correcta. No reemplaza la prueba en vivo: la
 * protege de volver atrás.
 *
 * Build first:  npm run build
 * Run:          node --test mcp/test/readPathCodegen.test.js
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

import { TDClient } from "../../api/dist/index.js";

const captured = [];

const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const parsed = body ? JSON.parse(body) : {};
    captured.push({ url: req.url, code: parsed.code ?? "" });
    res.writeHead(200, { "Content-Type": "application/json" });
    // /exec responde con el output impreso por el código Python.
    res.end(JSON.stringify({ output: JSON.stringify({ success: true, data: {} }) }));
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

/**
 * Código ejecutable, sin comentarios: los comentarios del generador CITAN a
 * propósito la API vieja para explicar el bug, y no deben hacer fallar el test.
 */
function executableCode() {
  return captured
    .map((c) => c.code)
    .join("\n")
    .split("\n")
    .filter((l) => !l.trim().startsWith("#"))
    .join("\n");
}

describe("readChop — el código generado usa la API real de TD", () => {
  it("usa t.chan(nombre), nunca t.channel(...)", async () => {
    captured.length = 0;
    await client().readChop("/project1/chop1", ["u", "v"], 0, 10).catch(() => {});
    const code = executableCode();
    assert.ok(code.length > 0, "no se capturó el código de /exec");
    assert.match(code, /t\.chan\(/, "debe usar chan(), que es la API que existe");
    assert.ok(
      !/t\.channel\(/.test(code),
      "t.channel() no existe en TD: reintroducirlo devuelve channels:{} en silencio",
    );
  });

  it("avisa en vez de mentir cuando hay canales declarados y ninguno leído", async () => {
    captured.length = 0;
    await client().readChop("/project1/chop1", undefined, 0, 10).catch(() => {});
    const code = executableCode();
    // El guard pide numChannels > 0 y channels vacío => error explícito.
    assert.match(code, /Read 0 channels out of/);
    assert.match(code, /'success':False/);
  });
});

describe("popInspect — el código generado llama a los métodos", () => {
  it("numPoints/numPrims/numVerts se llaman si son callables", async () => {
    captured.length = 0;
    await client().popInspect("/project1/pop1").catch(() => {});
    const code = executableCode();
    assert.ok(code.length > 0, "no se capturó el código de /exec");
    assert.match(code, /callable\(/, "debe detectar métodos con callable()");
    assert.ok(
      !/info\[attr\] = getattr\(t, attr\)/.test(code),
      "asignar el método sin llamarlo rompe json.dumps (bug del 24/09/26)",
    );
    assert.match(code, /attribs/);
  });
});
