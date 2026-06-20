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
  const errs = h.issues?.filter(i => i.path.includes('glsl_shader'));
  if (errs && errs.length > 0) return 'ERR: ' + (errs[0].errors || '').substring(0, 200);
  return 'OK';
}

async function test() {
  console.log('=== ISOLATING atan AND COMPLEX SIN/COS ===\n');
  
  const comp = 'glsl_vortex';

  const variants = [
    { name: '1. atan(P.y, P.x) only', code: 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; float a = atan(P[id].y, P[id].x); P[id].x = a; }' },
    { name: '2. cos(atan result)', code: 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; float a = atan(P[id].y, P[id].x); float ca = cos(a); P[id].x = ca; }' },
    { name: '3. sin(atan result)', code: 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; float a = atan(P[id].y, P[id].x); float sa = sin(a); P[id].x = sa; }' },
    { name: '4. cos(a + r)', code: 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; float a = atan(P[id].y, P[id].x); float r = length(P[id].xy); float ca = cos(a + r); P[id].x = ca; }' },
    { name: '5. full vortex NO atan', code: 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; float r = length(P[id].xy); float cr = cos(r * 0.4); float sr = sin(r * 0.4); float cx = P[id].x * cr - P[id].y * sr; float cy = P[id].x * sr + P[id].y * cr; P[id] = vec3(cx, cy, P[id].z + sin(r * 3.0) * 0.2); }' },
    { name: '6. atan + full calc', code: 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; float r = length(P[id].xy); float a = atan(P[id].y, P[id].x); float cr = cos(a + r * 0.5); float sr = sin(a + r * 0.5); float cx = P[id].x * cr - P[id].y * sr; float cy = P[id].x * sr + P[id].y * cr; P[id] = vec3(cx, cy, P[id].z); }' },
  ];

  for (const v of variants) {
    const r = await testShader(comp, v.code);
    console.log(v.name + ': ' + r);
  }
}
test().catch(e => console.log('ERR:', e.message));
