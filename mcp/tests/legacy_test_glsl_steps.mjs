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
  return (h.ok && (!e || e.length === 0)) ? 'OK' : 'ERR';
}

async function test() {
  const comp = 'glsl_vortex';
  console.log('=== VORTEX STEP BY STEP (all use TDIn_P())===\n');
  
  const steps = [
    { n: '1. TDIn_P + length + sin', c: 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; vec3 pos = TDIn_P(); float r = length(pos.xy); P[id] = pos; P[id].z += sin(r * 3.0) * 0.2; }' },
    { n: '2. + cr,sr from r', c: 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; vec3 pos = TDIn_P(); float r = length(pos.xy); float cr = cos(r * 0.5); float sr = sin(r * 0.5); P[id] = pos; P[id].x = cr; P[id].y = sr; }' },
    { n: '3. + vec3 assign cr,sr', c: 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; vec3 pos = TDIn_P(); float r = length(pos.xy); float cr = cos(r * 0.5); float sr = sin(r * 0.5); P[id] = vec3(cr, sr, pos.z); }' },
    { n: '4. + x*cr - y*sr inline', c: 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; vec3 pos = TDIn_P(); float r = length(pos.xy); float cr = cos(r * 0.5); float sr = sin(r * 0.5); P[id] = vec3(pos.x * cr - pos.y * sr, pos.x * sr + pos.y * cr, pos.z); }' },
    { n: '5. + sin(r) on z', c: 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; vec3 pos = TDIn_P(); float r = length(pos.xy); float cr = cos(r * 0.5); float sr = sin(r * 0.5); P[id] = vec3(pos.x * cr - pos.y * sr, pos.x * sr + pos.y * cr, pos.z + sin(r * 3.0) * 0.2); }' },
  ];

  for (const s of steps) {
    const r = await testShader(comp, s.c);
    console.log(s.n + ': ' + r);
  }
}
test().catch(e => console.log('ERR:', e.message));
