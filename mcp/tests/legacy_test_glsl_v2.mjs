import { TDClient } from '../../api/dist/index.js';
const client = new TDClient();

async function waitForComputeDat(glslPath, maxRetries = 10) {
  for (let i = 0; i < maxRetries; i++) {
    const r = await client.execute('import json\nt = op("' + glslPath + '")\ncd = str(t.par.computedat.eval())\nprint(json.dumps({"cd":cd}))');
    if (r.success) {
      const data = JSON.parse(r.stdout);
      if (data.cd && data.cd.startsWith('/')) return data.cd;
    }
    await new Promise(r => setTimeout(r, 500));
  }
  return null;
}

async function test() {
  const base = '/td_tests_container/td_glsl_tests';
  
  // Test 1: glsl_wave (KNOWN WORKING from previous tests)
  console.log('=== TEST 1: glsl_wave (sine wave - known working) ===');
  
  // Write the simplest possible shader first
  const glslPath = base + '/glsl_wave/glsl_shader';
  
  // Wait for compute DAT
  const cd = await waitForComputeDat(glslPath);
  if (!cd) { console.log('FAIL: no compute DAT after 5s'); return; }
  console.log('compute DAT:', cd);
  
  // Set outputattrs
  await client.execute('import json\nt = op("' + glslPath + '")\nt.par.outputattrs = "P"\nprint("ok")');
  
  // Write simplest shader
  const shader = 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; float d = length(P[id].xy); P[id].z += sin(d * 3.0) * 0.3 * exp(-d * 0.3); }';
  const w = await client.execute('import json\nt = op("' + cd + '")\nt.text = """' + shader + '"""\nprint(json.dumps({"len":len(t.text)}))');
  console.log('write:', w.success ? 'OK' : 'FAIL');
  
  // Connect
  await client.connectNodes(base + '/glsl_wave/source', glslPath, 0);
  await client.connectNodes(glslPath, base + '/glsl_wave/out', 0);
  
  // Health
  const h = await client.healthcheck(base + '/glsl_wave', true);
  console.log('health:', h.ok ? 'OK' : 'ERR');
  if (!h.ok && h.issues) {
    for (const i of h.issues) console.log('  ' + i.path + ': ' + (i.errors || i.warnings || '').substring(0, 200));
  }

  // Test output data
  const outData = await client.execute('import json\nt = op("' + base + '/glsl_wave/out")\nt.cook(force=True)\nprint(json.dumps({"n":t.numPoints,"prim":t.numPrims}))');
  console.log('output:', outData.stdout);

  // Now test each remaining shader individually
  console.log('\n=== TESTING REMAINING 4 SHADERS ===');
  
  const configs = [
    { comp: 'glsl_noise', shader: 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; float n1 = sin(float(id) * 0.5) * 0.3 + 0.3; float n2 = cos(float(id) * 0.7) * 0.3 + 0.3; P[id] += vec3(n1, n2, (n1 + n2) * 0.5) * 0.4; }' },
    { comp: 'glsl_vortex', shader: 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; float r = length(P[id].xy); float cr = cos(r * 0.4); float sr = sin(r * 0.4); float cx = P[id].x * cr - P[id].y * sr; float cy = P[id].x * sr + P[id].y * cr; P[id] = vec3(cx, cy, P[id].z + sin(r * 3.0) * 0.2); }' },
    { comp: 'glsl_multinoise', shader: 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; float n1 = sin(float(id) * 0.5) * 0.5 + 0.5; float n2 = cos(float(id) * 0.7) * 0.5 + 0.5; float n3 = sin(float(id) * 0.3) * 0.5 + 0.5; P[id] += vec3(n1 - 0.5, n2 - 0.5, (n3 + n1) * 0.5 - 0.5) * 0.6; }' },
    { comp: 'glsl_twist', shader: 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; float r = length(P[id].xy); float a = atan(P[id].y, P[id].x); float cr = cos(a + r * 0.5); float sr = sin(a + r * 0.5); float cx = P[id].x * cr - P[id].y * sr; float cy = P[id].x * sr + P[id].y * cr; P[id] = vec3(cx, cy, P[id].z + sin(r * 3.0 + float(id) * 0.01) * 0.2); }' },
  ];

  for (const cfg of configs) {
    const glslP = base + '/' + cfg.comp + '/glsl_shader';
    
    // Wait for compute DAT
    const cd2 = await waitForComputeDat(glslP);
    if (!cd2) { console.log(cfg.comp + ': no compute DAT'); continue; }
    
    // Set outputattrs
    await client.execute('import json\nt = op("' + glslP + '")\nt.par.outputattrs = "P"\nprint("ok")');
    
    // Write shader
    const w2 = await client.execute('import json\nt = op("' + cd2 + '")\nt.text = """' + cfg.shader + '"""\nprint(json.dumps({"len":len(t.text)}))');
    if (!w2.success) { console.log(cfg.comp + ': write FAIL'); continue; }
    
    // Connect
    await client.connectNodes(base + '/' + cfg.comp + '/source', glslP, 0);
    await client.connectNodes(glslP, base + '/' + cfg.comp + '/out', 0);
    
    // Health
    const h2 = await client.healthcheck(base + '/' + cfg.comp, true);
    const errs = h2.issues?.filter(i => i.path.includes('glsl_shader'));
    console.log(cfg.comp + ': ' + (errs && errs.length > 0 ? 'ERR: ' + (errs[0].errors || '').substring(0, 200) : 'OK'));
  }

  console.log('\nDONE');
}
test().catch(e => console.log('FATAL:', e.message));
