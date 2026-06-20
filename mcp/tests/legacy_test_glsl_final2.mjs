import { TDClient } from '../../api/dist/index.js';
const client = new TDClient();
const BASE = '/td_tests_container/td_glsl_tests';

async function writeAndCheck(comp, shader) {
  const glslP = BASE + '/' + comp + '/glsl_shader';
  const r = await client.execute('import json\nt = op("' + glslP + '")\nprint(json.dumps({"cd":str(t.par.computedat.eval())}))');
  const cd = JSON.parse(r.stdout).cd;
  if (!cd || !cd.startsWith('/')) return 'NO_CD';
  
  await client.execute('import json\nt = op("' + cd + '")\nt.text = """' + shader + '"""\nprint("ok")');
  await client.connectNodes(BASE + '/' + comp + '/source', glslP, 0);
  await client.connectNodes(glslP, BASE + '/' + comp + '/out', 0);
  
  const h = await client.healthcheck(BASE + '/' + comp, true);
  const errs = h.issues?.filter(i => i.path.includes(comp + '/glsl_shader'));
  if (errs && errs.length > 0) return 'ERR';
  return 'OK';
}

async function test() {
  console.log('=== FINAL GLSL SHADERS (ALL VERIFIED PATTERNS) ===\n');

  // Shader 1: Noise via float(id) + P.x
  const s1 = 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; float n1 = sin(float(id) * 0.5) * 0.3 + 0.3; float n2 = cos(float(id) * 0.7) * 0.3 + 0.3; P[id] += vec3(n1, n2, (n1 + n2) * 0.5) * 0.4; }';
  const r1 = await writeAndCheck('glsl_noise', s1);
  console.log('1. glsl_noise (via float(id)):', r1);

  // Shader 2: Sine wave (KNOWN WORKING)
  const s2 = 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; float d = length(P[id].xy); float w = sin(d * 3.0) * 0.3 * exp(-d * 0.3); P[id].z += w; }';
  const r2 = await writeAndCheck('glsl_wave', s2);
  console.log('2. glsl_wave (sine):', r2);

  // Shader 3: Vortex - SINGLE vec3 assignment with temp vars
  const s3 = 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; float r = length(P[id].xy); float cr = cos(r * 0.5); float sr = sin(r * 0.5); float x = P[id].x; float y = P[id].y; float nx = x * cr - y * sr; float ny = x * sr + y * cr; P[id] = vec3(nx, ny, P[id].z + sin(r * 3.0) * 0.2); }';
  const r3 = await writeAndCheck('glsl_vortex', s3);
  console.log('3. glsl_vortex:', r3);
  if (r3 !== 'OK') {
    // Fallback: simpler vortex without ny computation
    const s3b = 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; float r = length(P[id].xy); float cr = cos(r * 0.5); float sr = sin(r * 0.5); P[id] = vec3(P[id].x * cr - P[id].y * sr, P[id].x * sr + P[id].y * cr, P[id].z + sin(r * 3.0) * 0.2); }';
    const r3b = await writeAndCheck('glsl_vortex', s3b);
    console.log('   fallback:', r3b);
  }

  // Shader 4: Multi-noise via float(id)
  const s4 = 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; float n1 = sin(float(id) * 0.5) * 0.5 + 0.5; float n2 = cos(float(id) * 0.7) * 0.5 + 0.5; float n3 = sin(float(id) * 0.3) * 0.5 + 0.5; P[id] += vec3(n1 - 0.5, n2 - 0.5, (n3 + n1) * 0.5 - 0.5) * 0.6; }';
  const r4 = await writeAndCheck('glsl_multinoise', s4);
  console.log('4. glsl_multinoise:', r4);

  // Shader 5: Twist/wave via vec3 assign with temp vars
  const s5 = 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; float r = length(P[id].xy); float cr = cos(r * 0.5); float sr = sin(r * 0.5); float x = P[id].x; float y = P[id].y; float nx = x * cr - y * sr; float ny = x * sr + y * cr; float wz = P[id].z + sin(r * 3.0 + float(id) * 0.01) * 0.2; P[id] = vec3(nx, ny, wz); }';
  const r5 = await writeAndCheck('glsl_twist', s5);
  console.log('5. glsl_twist:', r5);
  if (r5 !== 'OK') {
    // Fallback without temp vars
    const s5b = 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; float r = length(P[id].xy); float cr = cos(r * 0.5); float sr = sin(r * 0.5); P[id] = vec3(P[id].x * cr - P[id].y * sr, P[id].x * sr + P[id].y * cr, P[id].z + sin(r * 3.0 + float(id) * 0.01) * 0.2); }';
    const r5b = await writeAndCheck('glsl_twist', s5b);
    console.log('   fallback:', r5b);
  }

  console.log('\n=== FINAL VERIFICATION ===');
  for (const name of ['glsl_noise','glsl_wave','glsl_vortex','glsl_multinoise','glsl_twist']) {
    const h = await client.healthcheck(BASE + '/' + name, true);
    const status = h.ok ? 'OK' : 'HAS ISSUES';
    const errs = h.issues?.filter(i => i.path.includes(name + '/glsl_shader'));
    console.log('  ' + name + ': ' + status + (errs?.length ? ' (' + errs[0].errors?.substring(0,80) + ')' : ''));
  }

  console.log('\nDONE');
}
test().catch(e => console.log('FATAL:', e.message));
