import { TDClient } from '../../api/dist/index.js';
const client = new TDClient();
const BASE = '/td_tests_container/td_glsl_tests';

async function testShader(comp, code) {
  const glslP = BASE + '/' + comp + '/glsl_shader';
  const r = await client.execute('import json\nt = op("' + glslP + '")\nprint(json.dumps({"cd":str(t.par.computedat.eval())}))');
  const cd = JSON.parse(r.stdout).cd;
  await client.execute('import json\nt = op("' + cd + '")\nt.text = """' + code + '"""\nprint("ok")');
  await client.connectNodes(BASE + '/' + comp + '/source', glslP, 0);
  await client.connectNodes(glslP, BASE + '/' + comp + '/out', 0);
  const h = await client.healthcheck(BASE + '/' + comp, true);
  const e = h.issues?.filter(i => i.path.includes(comp + '/glsl_shader'));
  return (h.ok && (!e || e.length === 0)) ? 'OK' : 'ERR: ' + (e?.[0]?.errors || '').substring(0, 150);
}

async function test() {
  const comp = 'glsl_vortex';
  console.log('=== VORTEX MINIMAL TESTS ===\n');

  const tests = [
    { n: 'just P.x = x*cr', c: 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; float r = length(P[id].xy); float cr = cos(r); float x = P[id].x; P[id].x = x * cr; }' },
    { n: 'P.x = x*cr - y*sr', c: 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; float r = length(P[id].xy); float cr = cos(r); float sr = sin(r); float x = P[id].x; float y = P[id].y; P[id].x = x * cr - y * sr; }' },
    { n: 'full step-by-step', c: 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; float r = length(P[id].xy); float cr = cos(r); float sr = sin(r); float x = P[id].x; float y = P[id].y; float nx = x * cr - y * sr; float ny = x * sr + y * cr; P[id].x = nx; P[id].y = ny; P[id].z += sin(r) * 0.2; }' },
    { n: 'nx then ny inline', c: 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; float r = length(P[id].xy); float cr = cos(r); float sr = sin(r); float x = P[id].x; float y = P[id].y; P[id].x = x * cr - y * sr; P[id].y = x * sr + y * cr; P[id].z += sin(r) * 0.2; }' },
  ];

  for (const t of tests) {
    const result = await testShader(comp, t.c);
    console.log(t.n + ': ' + result);
  }
}
test().catch(e => console.log('ERR:', e.message));
