import { TDClient } from '../../api/dist/index.js';
const client = new TDClient();
const BASE = '/td_tests_container/td_glsl_tests';

async function test() {
  // Delete and recreate glsl_noise
  await client.deleteOperator(BASE + '/glsl_noise');
  await new Promise(r => setTimeout(r, 500));
  
  const c = await client.createOperator('baseCOMP', 'glsl_noise', BASE, 0, 0);
  await client.createOperator('spherePOP', 'source', c.path, 0, 0);
  await client.createOperator('nullPOP', 'out', c.path, 500, 0);
  await client.createOperator('glslPOP', 'glsl_shader', c.path, 250, 0);
  await new Promise(r => setTimeout(r, 700));
  
  // Get cd
  const cdR = await client.execute('import json\nt = op("' + c.path + '/glsl_shader")\nprint(json.dumps({"cd":str(t.par.computedat.eval())}))');
  const cd = JSON.parse(cdR.stdout).cd;
  console.log('CD:', cd);
  
  await client.execute('import json\nt = op("' + c.path + '/glsl_shader")\nt.par.outputattrs = "P"\nprint("ok")');
  
  // Test same shader that works on others
  const code = 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; vec3 pos = TDIn_P(); pos.z += 0.01; P[id] = pos; }';
  await client.execute('import json\nt = op("' + cd + '")\nt.text = """' + code + '"""\nprint("ok")');
  await client.connectNodes(c.path + '/source', c.path + '/glsl_shader', 0);
  await client.connectNodes(c.path + '/glsl_shader', c.path + '/out', 0);
  const h = await client.healthcheck(c.path, true);
  const e = h.issues?.filter(i => i.path.includes(c.path + '/glsl_shader'));
  console.log('FRESH glsl_noise: ' + (h.ok && (!e || e.length === 0) ? 'OK' : 'FAIL'));
  
  // Now test the full noise shader
  const noiseCode = 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; vec3 pos = TDIn_P(); float n = sin(float(id)*0.5+pos.x*2.0)*0.3+0.3; float n2 = cos(float(id)*0.7+pos.y*3.0)*0.3+0.3; P[id] = pos + vec3(n,n2,(n+n2)*0.5)*0.4; }';
  await client.execute('import json\nt = op("' + cd + '")\nt.text = """' + noiseCode + '"""\nprint("ok")');
  const h2 = await client.healthcheck(c.path, true);
  const e2 = h2.issues?.filter(i => i.path.includes(c.path + '/glsl_shader'));
  console.log('noise shader: ' + (h2.ok && (!e2 || e2.length === 0) ? 'OK' : 'FAIL'));
  if (!h2.ok && e2) console.log('  ' + (e2[0]?.errors || '').substring(0, 200));
}
test().catch(e => console.log('ERR:', e.message));
