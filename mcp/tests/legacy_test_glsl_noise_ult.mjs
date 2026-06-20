import { TDClient } from '../../api/dist/index.js';
const client = new TDClient();
const BASE = '/td_tests_container/td_glsl_tests';

async function testShader(comp, code) {
  const glslP = BASE + '/' + comp + '/glsl_shader';
  const cdR = await client.execute('import json\nt = op("' + glslP + '")\nprint(json.dumps({"cd":str(t.par.computedat.eval())}))');
  const cd = JSON.parse(cdR.stdout).cd;
  await client.execute('import json\nt = op("' + glslP + '")\nt.par.outputattrs = "P"\nprint("ok")');
  await client.execute('import json\nt = op("' + cd + '")\nt.text = """' + code + '"""\nprint("ok")');
  await client.connectNodes(BASE + '/' + comp + '/source', glslP, 0);
  await client.connectNodes(glslP, BASE + '/' + comp + '/out', 0);
  const h = await client.healthcheck(BASE + '/' + comp, true);
  const e = h.issues?.filter(i => i.path.includes(comp + '/glsl_shader'));
  return (h.ok && (!e || e.length === 0)) ? 'OK' : 'FAIL';
}

async function test() {
  const comp = 'glsl_noise';
  console.log('=== NOISE ULTIMATE TESTS ===\n');
  
  const tests = [
    { n: 'just pos.x += 0.01', c: 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; vec3 pos = TDIn_P(); pos.x += 0.01; P[id] = pos; }' },
    { n: 'pos.x += sin(id)', c: 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; vec3 pos = TDIn_P(); pos.x += sin(float(id)*0.5)*0.1; P[id] = pos; }' },
    { n: 'pos.x += sin(pos.y)', c: 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; vec3 pos = TDIn_P(); pos.x += sin(pos.y)*0.1; P[id] = pos; }' },
    { n: 'pos += vec3(sin(pos.y))', c: 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; vec3 pos = TDIn_P(); pos += vec3(sin(pos.y))*0.1; P[id] = pos; }' },
    { n: 'pos.x += sin(1.0)', c: 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; vec3 pos = TDIn_P(); pos.x += sin(1.0)*0.1; P[id] = pos; }' },
    { n: 'pos += vec3(sin(pos))*0.1', c: 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; vec3 pos = TDIn_P(); pos += vec3(sin(pos))*0.1; P[id] = pos; }' },
    { n: 'fract(sin(...))', c: 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; vec3 pos = TDIn_P(); float n = sin(pos.x*12.9898+pos.y*78.233); n = fract(n); P[id] = pos + vec3(n)*0.3; }' },
  ];

  for (const t of tests) {
    const r = await testShader(comp, t.c);
    console.log(t.n + ': ' + r);
  }
}
test().catch(e => console.log('ERR:', e.message));
