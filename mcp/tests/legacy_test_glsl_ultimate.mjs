import { TDClient } from '../../api/dist/index.js';
const client = new TDClient();
const BASE = '/td_tests_container/td_glsl_tests';

async function testShader(comp, code) {
  const glslP = BASE + '/' + comp + '/glsl_shader';
  const r = await client.execute('import json\nt = op("' + glslP + '")\nprint(json.dumps({"cd":str(t.par.computedat.eval())}))');
  const cd = JSON.parse(r.stdout).cd;
  await client.execute('import json\nt = op("' + cd + '")\nt.text = """' + code + '"""\nprint("ok")');
  await client.connectNodes(BASE + '/' + comp + '/source', glslP, 0);
  const h = await client.healthcheck(BASE + '/' + comp, true);
  const e = h.issues?.filter(i => i.path.includes(comp + '/glsl_shader'));
  return (h.ok && (!e || e.length === 0)) ? 'OK' : 'ERR';
}

async function test() {
  const comp = 'glsl_vortex';
  console.log('=== ULTIMATE MINIMAL TESTS ===\n');

  const tests = [
    { n: 'P.x = P.x * cr (inline)', c: 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; float r = length(P[id].xy); float cr = cos(r); P[id].x = P[id].x * cr; }' },
    { n: 'P.x = cos(r) - ref', c: 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; float r = length(P[id].xy); P[id].x = cos(r); }' },
    { n: 'P.x = P.x * 2.0', c: 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; P[id].x = P[id].x * 2.0; }' },
    { n: 'P.x = P.x * sin(r)', c: 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; float r = length(P[id].xy); float s = sin(r); P[id].x = P[id].x * s; }' },
    { n: 'P.x = P.x * cos(r)', c: 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; float r = length(P[id].xy); P[id].x = P[id].x * cos(r); }' },
    { n: 'var = P.x; P.x = var * cos(r)', c: 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; float r = length(P[id].xy); float x2 = P[id].x; P[id].x = x2 * cos(r); }' },
    { n: 'P.x = P.x * cos(r) + P.y * sin(r)', c: 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; float r = length(P[id].xy); P[id].x = P[id].x * cos(r) + P[id].y * sin(r); }' },
    { n: 'P.x = P.x*cr + P.y*sr (tmp var)', c: 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; float r = length(P[id].xy); float cr = cos(r); float sr = sin(r); P[id].x = P[id].x * cr + P[id].y * sr; }' },
  ];

  for (const t of tests) {
    const result = await testShader(comp, t.c);
    console.log(t.n + ': ' + result);
  }
}
test().catch(e => console.log('ERR:', e.message));
