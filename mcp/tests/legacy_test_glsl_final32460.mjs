import { TDClient } from '../../api/dist/index.js';
const client = new TDClient();
const BASE = '/td_tests_container/td_glsl_tests';

async function recreateAndTest(name, code) {
  try { await client.deleteOperator(BASE + '/' + name); } catch(e) {}
  await new Promise(r => setTimeout(r, 400));
  
  const c = await client.createOperator('baseCOMP', name, BASE, 0, 0);
  await client.createOperator('spherePOP', 'source', c.path, 0, 0);
  await client.createOperator('nullPOP', 'out', c.path, 500, 0);
  await client.createOperator('glslPOP', 'glsl_shader', c.path, 250, 0);
  await new Promise(r => setTimeout(r, 700));
  
  const cdR = await client.execute('import json\nt = op("' + c.path + '/glsl_shader")\nprint(json.dumps({"cd":str(t.par.computedat.eval())}))');
  const cd = JSON.parse(cdR.stdout).cd;
  if (!cd || !cd.startsWith('/')) return 'NO_CD';
  
  await client.execute('import json\nt = op("' + c.path + '/glsl_shader")\nt.par.outputattrs = "P"\nprint("ok")');
  await client.execute('import json\nt = op("' + cd + '")\nt.text = """' + code + '"""\nprint("ok")');
  await client.connectNodes(c.path + '/source', c.path + '/glsl_shader', 0);
  await client.connectNodes(c.path + '/glsl_shader', c.path + '/out', 0);
  const h = await client.healthcheck(c.path, true);
  const e = h.issues?.filter(i => i.path.includes(c.path + '/glsl_shader'));
  return (h.ok && (!e || e.length === 0)) ? 'OK' : 'FAIL: ' + (e?.[0]?.errors || '').substring(0, 150);
}

async function test() {
  console.log('=== RECREATING AND TESTING ALL 5 ===\n');

  const s1 = 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; vec3 pos = TDIn_P(); float n = sin(float(id)*0.5+pos.x*2.0)*0.3+0.3; float n2 = cos(float(id)*0.7+pos.y*3.0)*0.3+0.3; P[id] = pos + vec3(n,n2,(n+n2)*0.5)*0.4; }';
  console.log('glsl_noise:', await recreateAndTest('glsl_noise', s1));

  const s2 = 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; vec3 pos = TDIn_P(); float d = length(pos.xy); pos.z += sin(d * 3.0) * 0.3 * exp(-d * 0.3); P[id] = pos; }';
  console.log('glsl_wave:', await recreateAndTest('glsl_wave', s2));

  const s3 = 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; vec3 pos = TDIn_P(); float r = length(pos.xy); float cr = cos(r * 0.5); float sr = sin(r * 0.5); P[id] = vec3(pos.x*cr-pos.y*sr, pos.x*sr+pos.y*cr, pos.z+sin(r*3.0)*0.2); }';
  console.log('glsl_vortex:', await recreateAndTest('glsl_vortex', s3));

  const s4 = 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; vec3 pos = TDIn_P(); float n1 = sin(pos.x*1.5+float(id)*0.01)*0.5+0.5; float n2 = cos(pos.y*2.0+float(id)*0.02)*0.5+0.5; float n3 = sin(pos.x*3.0+pos.y*2.0+float(id)*0.03)*0.5+0.5; P[id] = pos+vec3(n1-0.5,n2-0.5,(n3+n1)*0.5-0.5)*0.6; }';
  console.log('glsl_multinoise:', await recreateAndTest('glsl_multinoise', s4));

  const s5 = 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; vec3 pos = TDIn_P(); float r = length(pos.xy); float a = atan(pos.y, pos.x); float cr = cos(a+r*0.5); float sr = sin(a+r*0.5); P[id] = vec3(pos.x*cr-pos.y*sr, pos.x*sr+pos.y*cr, pos.z+sin(r*3.0+float(id)*0.01)*0.2); }';
  console.log('glsl_twist:', await recreateAndTest('glsl_twist', s5));

  console.log('\n=== VERIFICACION FINAL (build 2025.32460) ===');
  for (const name of ['glsl_noise','glsl_wave','glsl_vortex','glsl_multinoise','glsl_twist']) {
    const h = await client.healthcheck(BASE + '/' + name, true);
    const e = h.issues?.filter(i => i.path.includes(name + '/glsl_shader'));
    console.log('  ' + name + ': ' + (h.ok && (!e || e.length === 0) ? 'OK' : 'FAIL'));
  }
  console.log('\nDONE');
}
test().catch(e => console.log('FATAL:', e.message));
