import { TDClient } from '../../api/dist/index.js';
const client = new TDClient();
const BASE = '/td_tests_container';

async function test() {
  // Clean old GLSL tests and create fresh container
  try { await client.deleteOperator(BASE + '/td_glsl_tests'); } catch(e) {}
  const c = await client.createOperator('baseCOMP', 'td_glsl_tests', BASE, 0, -1200);
  console.log('Container:', c.success);

  const tests = ['glsl_noise','glsl_wave','glsl_vortex','glsl_multinoise','glsl_twist'];
  for (let i = 0; i < tests.length; i++) {
    await client.createOperator('baseCOMP', tests[i], c.path, 0, i * -300);
  }

  // Test 1: NEW BUILD - try TDIn_P(id) with argument
  console.log('\n=== TESTING NEW BUILD FEATURES ===\n');
  
  const glslPath = c.path + '/glsl_noise/glsl_shader';
  await client.createOperator('spherePOP', 'source', c.path + '/glsl_noise', 0, 0);
  await client.createOperator('nullPOP', 'out', c.path + '/glsl_noise', 500, 0);
  const g = await client.createOperator('glslPOP', 'glsl_shader', c.path + '/glsl_noise', 250, 0);
  await new Promise(r => setTimeout(r, 800));
  
  // Get compute DAT
  const cdR = await client.execute('import json\nt = op("' + glslPath + '")\nprint(json.dumps({"cd":str(t.par.computedat.eval())}))');
  const cd = JSON.parse(cdR.stdout).cd;
  console.log('compute DAT:', cd);
  
  await client.execute('import json\nt = op("' + glslPath + '")\nt.par.outputattrs = "P"\nprint("ok")');

  // Test: TDIn_P(id) with argument (new build feature)
  const testShaders = [
    { name: 'TDIn_P(id) arg', code: 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; vec3 pos = TDIn_P(id); pos.x += sin(float(id)) * 0.1; P[id] = pos; }' },
    { name: 'TDIn_P() no arg', code: 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; vec3 pos = TDIn_P(); pos.x += sin(float(id)) * 0.1; P[id] = pos; }' },
    { name: 'Vel buffer', code: 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; vec3 pos = TDIn_P(); vec3 vel = Vel[id]; pos += vel * 0.016; P[id] = pos; }' },
    { name: 'Color buffer', code: 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; vec3 pos = TDIn_P(); Color[id] = vec4(0.5+0.5*sin(pos.x), 0.2, 0.8, 1.0); P[id] = pos; }' },
    { name: 'user function', code: 'float myFunc(float x) { return x * x; } void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; vec3 pos = TDIn_P(); pos.x += myFunc(sin(float(id))) * 0.1; P[id] = pos; }' },
    { name: 'P read then write', code: 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; float x = P[id].x; P[id] = vec3(x + sin(float(id)) * 0.1, 0, 0); }' },
  ];

  for (const s of testShaders) {
    await client.execute('import json\nt = op("' + cd + '")\nt.text = """' + s.code + '"""\nprint("ok")');
    await client.connectNodes(c.path + '/glsl_noise/source', glslPath, 0);
    await client.connectNodes(glslPath, c.path + '/glsl_noise/out', 0);
    const h = await client.healthcheck(c.path + '/glsl_noise', true);
    const e = h.issues?.filter(i => i.path.includes('glsl_shader'));
    const ok = h.ok && (!e || e.length === 0);
    console.log('  ' + s.name + ': ' + (ok ? 'OK' : 'FAIL'));
    if (!ok && e) console.log('    ' + (e[0]?.errors || '').substring(0, 150));
  }

  console.log('\nDONE');
}
test().catch(e => console.log('FATAL:', e.message));
