import { TDClient } from '../../api/dist/index.js';
const client = new TDClient();
const BASE = '/td_tests_container/td_glsl_tests';

async function testShader(comp, shaderCode) {
  const glslP = BASE + '/' + comp + '/glsl_shader';
  const cdR = await client.execute('import json\nt = op("' + glslP + '")\nprint(json.dumps({"cd":str(t.par.computedat.eval())}))');
  if (!cdR.success) return 'no cd';
  const cd = JSON.parse(cdR.stdout).cd;
  if (!cd || !cd.startsWith('/')) return 'bad cd';
  await client.execute('import json\nt = op("' + cd + '")\nt.text = """' + shaderCode + '"""\nprint("ok")');
  const h = await client.healthcheck(BASE + '/' + comp, true);
  const errs = h.issues?.filter(i => i.path.includes(comp + '/glsl_shader'));
  if (errs && errs.length > 0) return 'ERR: ' + (errs[0].errors || '').substring(0, 200);
  return 'OK';
}

async function test() {
  console.log('=== DEEPER ISOLATION ===\n');
  const comp = 'glsl_vortex';
  
  const variants = [
    { name: 'cr*cr assign', code: 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; float r = length(P[id].xy); float cr = cos(r * 0.4); float sr = sin(r * 0.4); P[id].x = cr * P[id].x - sr * P[id].y; }' },
    { name: 'cx assign partial', code: 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; float r = length(P[id].xy); float cr = cos(r * 0.4); float sr = sin(r * 0.4); P[id].x = P[id].x * cr - P[id].y * sr; }' },
    { name: 'full cx assign', code: 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; float r = length(P[id].xy); float cr = cos(r * 0.4); float sr = sin(r * 0.4); P[id] = vec3(P[id].x * cr - P[id].y * sr, P[id].x * sr + P[id].y * cr, P[id].z); }' },
    { name: 'P.z += sin(r)', code: 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; float r = length(P[id].xy); P[id].z += sin(r * 3.0) * 0.2; P[id].x += 0.01; }' },
    { name: 'sin(r)+assign P.x', code: 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; float r = length(P[id].xy); float s = sin(r * 3.0); P[id].x += s * 0.2; }' },
    { name: 'sin(r)+assign P', code: 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; float r = length(P[id].xy); float s = sin(r * 3.0); P[id] = vec3(s, 0, 0); }' },
    { name: 'cr*sr assign P', code: 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; float r = length(P[id].xy); float cr = cos(r); float sr = sin(r); P[id] = vec3(cr, sr, 0); }' },
    { name: 'P.xy rotate test', code: 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; float r = length(P[id].xy); float cr = cos(r * 0.5); float sr = sin(r * 0.5); float x = P[id].x; float y = P[id].y; P[id].x = x * cr - y * sr; P[id].y = x * sr + y * cr; }' },
  ];

  for (const v of variants) {
    const r = await testShader(comp, v.code);
    console.log(v.name + ': ' + r);
  }
}
test().catch(e => console.log('ERR:', e.message));
