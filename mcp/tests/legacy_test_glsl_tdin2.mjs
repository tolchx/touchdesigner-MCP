import { TDClient } from '../../api/dist/index.js';
const client = new TDClient();
const BASE = '/td_tests_container/td_glsl_tests';

async function writeShader(comp, code) {
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
  console.log('=== TESTING TDIn_P VARIANTS ===\n');
  
  const variants = [
    { n: 'TDIn_P() no arg', c: 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; vec3 pos = TDIn_P(); float r = length(pos.xy); float cr = cos(r * 0.5); float sr = sin(r * 0.5); float x = pos.x; float y = pos.y; P[id] = vec3(x * cr - y * sr, x * sr + y * cr, pos.z + sin(r * 3.0) * 0.2); }' },
    { n: 'P[id] vec3 assign (works before)', c: 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; P[id] = vec3(P[id].x * cos(1.0) - P[id].y * sin(1.0), P[id].x * sin(1.0) + P[id].y * cos(1.0), P[id].z); }' },
    { n: 'read local, write P', c: 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; vec3 p = vec3(1.0, 2.0, 3.0); P[id] = p; }' },
    { n: 'vec3 from func then P=', c: 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; float x = P[id].x; P[id] = vec3(x, 0, 0); }' },
  ];

  for (const v of variants) {
    const r = await writeShader(comp, v.c);
    console.log(v.n + ': ' + r);
  }
}
test().catch(e => console.log('ERR:', e.message));
