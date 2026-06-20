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
  console.log('=== READ-AFTER-WRITE FIX TEST ===\n');
  const comp = 'glsl_vortex';
  
  const variants = [
    { name: 'tmp vars THEN assign P', code: 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; float r = length(P[id].xy); float cr = cos(r * 0.5); float sr = sin(r * 0.5); float x = P[id].x; float y = P[id].y; float nx = x * cr - y * sr; float ny = x * sr + y * cr; P[id] = vec3(nx, ny, P[id].z); }' },
    { name: 'tmp vars + wave', code: 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; float r = length(P[id].xy); float cr = cos(r * 0.5); float sr = sin(r * 0.5); float x = P[id].x; float y = P[id].y; float nx = x * cr - y * sr; float ny = x * sr + y * cr; float wz = P[id].z + sin(r * 3.0) * 0.2; P[id] = vec3(nx, ny, wz); }' },
    { name: 'tmp vars + atan', code: 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; float r = length(P[id].xy); float a = atan(P[id].y, P[id].x); float cr = cos(a + r * 0.5); float sr = sin(a + r * 0.5); float x = P[id].x; float y = P[id].y; float nx = x * cr - y * sr; float ny = x * sr + y * cr; P[id] = vec3(nx, ny, P[id].z + sin(r * 3.0 + float(id) * 0.01) * 0.2); }' },
    { name: 'twist with tmp vars', code: 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; float r = length(P[id].xy); float a = atan(P[id].y, P[id].x); float cr = cos(a + r * 0.5); float sr = sin(a + r * 0.5); float x = P[id].x; float y = P[id].y; float nx = x * cr - y * sr; float ny = x * sr + y * cr; float wave = sin(r * 4.0 + float(id) * 0.01) * 0.3; P[id] = vec3(nx + wave * 0.5, ny + wave * 0.3, wave); }' },
  ];

  for (const v of variants) {
    const r = await testShader(comp, v.code);
    console.log(v.name + ': ' + r);
  }
  
  // Also test the twist variant
  console.log('\n=== TESTING ON glsl_twist ===');
  const comp2 = 'glsl_twist';
  
  const twists = [
    { name: 'twist tmp vars', code: 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; float r = length(P[id].xy); float a = atan(P[id].y, P[id].x); float cr = cos(a + r * 0.5); float sr = sin(a + r * 0.5); float x = P[id].x; float y = P[id].y; float nx = x * cr - y * sr; float ny = x * sr + y * cr; float wz = P[id].z + sin(r * 3.0 + float(id) * 0.01) * 0.2; P[id] = vec3(nx, ny, wz); }' },
  ];
  
  for (const v of twists) {
    const r = await testShader(comp2, v.code);
    console.log(v.name + ': ' + r);
  }
}
test().catch(e => console.log('ERR:', e.message));
