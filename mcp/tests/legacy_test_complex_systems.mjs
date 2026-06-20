import { TDClient } from '../../api/dist/index.js';
const client = new TDClient();

async function buildSystem(name, nodes, connections) {
  // Create baseCOMP
  const parent = '/td_tests_container';
  try { await client.deleteOperator(parent + '/' + name); } catch(e) {}
  await new Promise(r => setTimeout(r, 300));
  
  const comp = await client.createOperator('baseCOMP', name, parent, 0, 0);
  if (!comp.success) return { error: 'COMP create failed' };
  
  const base = comp.path;
  let ok = true;
  
  // Create nodes
  for (const n of nodes) {
    const r = await client.createOperator(n.type, n.name, base, n.x, n.y);
    if (!r.success) { ok = false; console.log('  FAIL create:', n.type, n.name); }
  }
  
  // Connect
  for (const c of connections) {
    const r = await client.connectNodes(base + '/' + c.from, base + '/' + c.to, c.input || 0);
    if (!r.success) { ok = false; console.log('  FAIL connect:', c.from, '->', c.to); }
  }
  
  // Verify
  const h = await client.healthcheck(base, true);
  const issues = h.issues?.filter(i => !i.path.includes('glsl_shader') && !i.path.includes('_compute'));
  
  return { success: ok && h.ok, issues: issues?.length || 0, path: base };
}

async function test() {
  console.log('=== SISTEMAS POP COMPLEJOS ===\n');

  // TEST 1: Particle system with forces
  console.log('Test 1: Particle system with forces');
  const r1 = await buildSystem('td_pop_particles', [
    { type: 'spherePOP', name: 'source', x: 0, y: 0 },
    { type: 'noisePOP', name: 'force_noise', x: 250, y: 0 },
    { type: 'limitPOP', name: 'force_limit', x: 500, y: 0 },
    { type: 'nullPOP', name: 'out', x: 750, y: 0 },
  ], [
    { from: 'source', to: 'force_noise' },
    { from: 'force_noise', to: 'force_limit' },
    { from: 'force_limit', to: 'out' },
  ]);
  console.log('  particles:', r1.success ? 'OK' : 'FAIL', 'issues:', r1.issues);

  // TEST 2: Feedback loop
  console.log('\nTest 2: Feedback loop');
  const r2 = await buildSystem('td_pop_feedback', [
    { type: 'spherePOP', name: 'source', x: 0, y: 0 },
    { type: 'feedbackPOP', name: 'feedback', x: 250, y: 0 },
    { type: 'cachePOP', name: 'cache', x: 500, y: 0 },
    { type: 'blendPOP', name: 'blend', x: 750, y: 0 },
    { type: 'nullPOP', name: 'out', x: 1000, y: 0 },
  ], [
    { from: 'source', to: 'feedback' },
    { from: 'feedback', to: 'cache' },
    { from: 'cache', to: 'blend' },
    { from: 'blend', to: 'out' },
  ]);
  console.log('  feedback:', r2.success ? 'OK' : 'FAIL', 'issues:', r2.issues);

  // TEST 3: Grid deformation chain
  console.log('\nTest 3: Grid deformation');
  const r3 = await buildSystem('td_pop_grid', [
    { type: 'gridPOP', name: 'grid', x: 0, y: 0 },
    { type: 'noisePOP', name: 'noise', x: 250, y: 0 },
    { type: 'copyPOP', name: 'copy', x: 500, y: 0 },
    { type: 'deletePOP', name: 'delete', x: 750, y: 0 },
    { type: 'blendPOP', name: 'blend', x: 1000, y: 0 },
    { type: 'nullPOP', name: 'out', x: 1250, y: 0 },
  ], [
    { from: 'grid', to: 'noise' },
    { from: 'noise', to: 'copy' },
    { from: 'copy', to: 'delete' },
    { from: 'delete', to: 'blend' },
    { from: 'blend', to: 'out' },
  ]);
  console.log('  grid:', r3.success ? 'OK' : 'FAIL', 'issues:', r3.issues);

  // TEST 4: Attributes + math
  console.log('\nTest 4: Attributes + math');
  const r4 = await buildSystem('td_pop_attributes', [
    { type: 'spherePOP', name: 'source', x: 0, y: 0 },
    { type: 'attributePOP', name: 'attrib', x: 250, y: 0 },
    { type: 'mathPOP', name: 'math_deform', x: 500, y: 0 },
    { type: 'limitPOP', name: 'limit', x: 750, y: 0 },
    { type: 'nullPOP', name: 'out', x: 1000, y: 0 },
  ], [
    { from: 'source', to: 'attrib' },
    { from: 'attrib', to: 'math_deform' },
    { from: 'math_deform', to: 'limit' },
    { from: 'limit', to: 'out' },
  ]);
  console.log('  attributes:', r4.success ? 'OK' : 'FAIL', 'issues:', r4.issues);

  // TEST 5: Multi-chain with GLSL
  console.log('\nTest 5: Multi-chain with GLSL');
  const base5 = '/td_tests_container/td_pop_glsl_complex';
  try { await client.deleteOperator(base5); } catch(e) {}
  await new Promise(r => setTimeout(r, 300));
  const c5 = await client.createOperator('baseCOMP', 'td_pop_glsl_complex', '/td_tests_container', 0, 0);
  
  if (c5.success) {
    await client.createOperator('spherePOP', 'source', base5, 0, 0);
    await client.createOperator('noisePOP', 'force', base5, 250, 0);
    await client.createOperator('glslPOP', 'glsl_shader', base5, 500, 0);
    await client.createOperator('limitPOP', 'limit', base5, 750, 0);
    await client.createOperator('nullPOP', 'out', base5, 1000, 0);
    
    await new Promise(r => setTimeout(r, 700));
    
    // Get compute DAT and write GLSL
    const cdR = await client.execute('import json\nt = op("' + base5 + '/glsl_shader")\nprint(json.dumps({"cd":str(t.par.computedat.eval())}))');
    const cd = JSON.parse(cdR.stdout).cd;
    if (cd && cd.startsWith('/')) {
      await client.execute('import json\nt = op("' + base5 + '/glsl_shader")\nt.par.outputattrs = "P"\nprint("ok")');
      
      const shader = [
        'float n3(vec3 p) { return sin(p.x*12.9898)*sin(p.y*78.233)*sin(p.z*45.5432); }',
        'void main() {',
        '    const uint id = TDIndex(); if(id >= TDNumElements()) return;',
        '    vec3 pos = TDIn_P();',
        '    pos += vec3(n3(pos*1.5+float(id)*0.01)-0.5, n3(pos*2.0+float(id)*0.02)-0.5, 0)*0.5;',
        '    P[id] = pos;',
        '}'
      ].join('\n');
      
      await client.execute('import json\nt = op("' + cd + '")\nt.text = """' + shader + '"""\nprint("ok")');
    }
    
    await client.connectNodes(base5 + '/source', base5 + '/force', 0);
    await client.connectNodes(base5 + '/force', base5 + '/glsl_shader', 0);
    await client.connectNodes(base5 + '/glsl_shader', base5 + '/limit', 0);
    await client.connectNodes(base5 + '/limit', base5 + '/out', 0);
    
    const h5 = await client.healthcheck(base5, true);
    const e5 = h5.issues?.filter(i => i.path.includes('glsl_shader'));
    console.log('  glsl_complex:', h5.ok && (!e5 || e5.length === 0) ? 'OK' : 'FAIL', 'issues:', h5.issueCount);
  }

  // Summary
  console.log('\n=== VERIFICACION GLOBAL ===');
  const names = ['td_pop_particles','td_pop_feedback','td_pop_grid','td_pop_attributes','td_pop_glsl_complex'];
  for (const name of names) {
    const h = await client.healthcheck('/td_tests_container/' + name, true);
    console.log('  ' + name + ': ' + (h.ok ? 'OK' : 'ISSUES') + ' (' + h.issueCount + ' issues)');
    if (!h.ok && h.issues) {
      for (const i of h.issues.slice(0, 3)) {
        console.log('    ' + i.path + ': ' + (i.errors || i.warnings || '').substring(0, 100));
      }
    }
  }
  console.log('\nDONE');
}
test().catch(e => console.log('FATAL:', e.message));
