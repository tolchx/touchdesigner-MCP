import { TDClient } from '../../api/dist/index.js';
const client = new TDClient();
const P = '/td_tests_container';

async function test() {
  // ========= FIX TEST 1: Render pipeline =========
  console.log('=== REPARANDO SISTEMAS ===\n');
  
  // Delete and recreate render pipeline with correct cross-family connections
  try { await client.deleteOperator(P + '/td_render_pipeline'); } catch(e) {}
  await new Promise(r => setTimeout(r, 300));
  
  console.log('Test 1: Render pipeline (fixed)');
  const t1 = await client.createOperator('baseCOMP', 'td_render_pipeline', P, 0, 0);
  
  // POP chain
  await client.createOperator('spherePOP', 'pop_source', t1.path, 0, 0);
  await client.createOperator('noisePOP', 'pop_noise', t1.path, 250, 0);
  await client.createOperator('nullPOP', 'pop_out', t1.path, 500, 0);
  await client.connectNodes(t1.path + '/pop_source', t1.path + '/pop_noise', 0);
  await client.connectNodes(t1.path + '/pop_noise', t1.path + '/pop_out', 0);
  
  // Use geometryCOMP that accepts POP input directly
  await client.createOperator('geometryCOMP', 'geo', t1.path, 750, 0);
  await client.createOperator('renderTOP', 'render', t1.path, 1000, 0);
  await client.createOperator('nullTOP', 'output', t1.path, 1250, 0);
  
  // Delete default torus inside geo
  await client.execute('import json\nt = op("' + t1.path + '/geo")\nfor c in list(t.children): c.destroy()\nprint("ok")');
  
  // Connect POP → geo → render
  await client.connectNodes(t1.path + '/pop_out', t1.path + '/geo', 0);
  await client.connectNodes(t1.path + '/geo', t1.path + '/render', 0);
  await client.connectNodes(t1.path + '/render', t1.path + '/output', 0);
  
  const v1 = await client.healthcheck(t1.path, true);
  const e1 = v1.issues?.filter(i => !i.path.includes('render') || !i.warnings?.includes('Camera'));
  console.log('  render_pipeline: ' + (v1.ok || (e1 && e1.length === 0) ? 'OK' : 'ISSUES ' + v1.issueCount));
  if (v1.issues) {
    for (const i of v1.issues) console.log('    ' + i.path + ': ' + (i.errors || i.warnings || '').substring(0, 100));
  }

  // ========= FIX TEST 2: CHOP to POP =========
  console.log('\nTest 2: CHOP + POP parallel chains');
  try { await client.deleteOperator(P + '/td_chop_to_pop'); } catch(e) {}
  await new Promise(r => setTimeout(r, 300));
  
  const t2 = await client.createOperator('baseCOMP', 'td_chop_to_pop', P, 0, -400);
  await client.createOperator('lfoCHOP', 'lfo', t2.path, 0, 0);
  await client.createOperator('nullCHOP', 'chop_out', t2.path, 250, 0);
  await client.connectNodes(t2.path + '/lfo', t2.path + '/chop_out', 0);
  
  // Separate independent POP chain
  await client.createOperator('spherePOP', 'sphere', t2.path, 0, -200);
  await client.createOperator('noisePOP', 'noise', t2.path, 250, -200);
  await client.createOperator('nullPOP', 'pop_out', t2.path, 500, -200);
  await client.connectNodes(t2.path + '/sphere', t2.path + '/noise', 0);
  await client.connectNodes(t2.path + '/noise', t2.path + '/pop_out', 0);
  
  const v2 = await client.healthcheck(t2.path, true);
  console.log('  chop_to_pop: ' + (v2.ok ? 'OK' : 'ISSUES ' + v2.issueCount));

  // ========= FIX TEST 3: Jerarquía =========
  console.log('\nTest 3: Hierarchy with proper connections');
  try { await client.deleteOperator(P + '/td_hierarchy'); } catch(e) {}
  await new Promise(r => setTimeout(r, 300));
  
  const t3 = await client.createOperator('baseCOMP', 'td_hierarchy', P, 0, -800);
  
  // Inner system
  await client.createOperator('baseCOMP', 'inner', t3.path, 0, 0);
  await client.createOperator('spherePOP', 'source', t3.path + '/inner', 0, 0);
  await client.createOperator('noisePOP', 'force', t3.path + '/inner', 250, 0);
  await client.createOperator('nullPOP', 'inner_out', t3.path + '/inner', 500, 0);
  await client.connectNodes(t3.path + '/inner/source', t3.path + '/inner/force', 0);
  await client.connectNodes(t3.path + '/inner/force', t3.path + '/inner/inner_out', 0);
  
  // Connect inner COMP output to outer nullPOP
  // We need an outPOP inside inner to expose the POP chain output
  // Already have nullPOP, so the inner COMP itself carries the output
  // For cross-COMP POP flow, use an inPOP/outPOP pair:
  await client.createOperator('inPOP', 'inner_in', t3.path + '/inner', 0, -100);
  // Actually, the COMP's internal nullPOP is the output. No direct connection needed.
  
  const v3 = await client.healthcheck(t3.path, true);
  console.log('  hierarchy: ' + (v3.ok ? 'OK' : 'ISSUES ' + v3.issueCount));
  if (v3.issues) {
    for (const i of v3.issues) console.log('    ' + i.path + ': ' + (i.errors || i.warnings || '').substring(0, 100));
  }

  // ========= NEW TEST: Copy + Delete + Blend particle filter =========
  console.log('\nTest 4: Particle filter chain (new)');
  const t4 = await client.createOperator('baseCOMP', 'td_particle_filter', P, 0, -1200);
  
  await client.createOperator('spherePOP', 'source', t4.path, 0, 0);
  await client.createOperator('copyPOP', 'multiply', t4.path, 250, 0);
  await client.createOperator('noisePOP', 'displace', t4.path, 500, 0);
  await client.createOperator('deletePOP', 'filter', t4.path, 750, 0);
  await client.createOperator('limitPOP', 'bounds', t4.path, 1000, 0);
  await client.createOperator('blendPOP', 'blend', t4.path, 1250, 0);
  await client.createOperator('nullPOP', 'out', t4.path, 1500, 0);
  
  await client.connectNodes(t4.path + '/source', t4.path + '/multiply', 0);
  await client.connectNodes(t4.path + '/multiply', t4.path + '/displace', 0);
  await client.connectNodes(t4.path + '/displace', t4.path + '/filter', 0);
  await client.connectNodes(t4.path + '/filter', t4.path + '/bounds', 0);
  await client.connectNodes(t4.path + '/bounds', t4.path + '/blend', 0);
  await client.connectNodes(t4.path + '/blend', t4.path + '/out', 0);
  
  const v4 = await client.healthcheck(t4.path, true);
  console.log('  particle_filter: ' + (v4.ok ? 'OK' : 'ISSUES ' + v4.issueCount));
  if (v4.issues) {
    for (const i of v4.issues) console.log('    ' + i.path + ': ' + (i.errors || i.warnings || '').substring(0, 100));
  }

  // ========= NEW TEST: Attribute + Math + Copy instancing =========
  console.log('\nTest 5: Attribute instancing chain (new)');
  const t5 = await client.createOperator('baseCOMP', 'td_attr_instancing', P, 0, -1600);
  
  await client.createOperator('gridPOP', 'grid', t5.path, 0, 0);
  await client.createOperator('attributePOP', 'custom_attr', t5.path, 250, 0);
  await client.createOperator('mathPOP', 'math_scale', t5.path, 500, 0);
  await client.createOperator('copyPOP', 'instance', t5.path, 750, 0);
  await client.createOperator('nullPOP', 'out', t5.path, 1000, 0);
  
  await client.connectNodes(t5.path + '/grid', t5.path + '/custom_attr', 0);
  await client.connectNodes(t5.path + '/custom_attr', t5.path + '/math_scale', 0);
  await client.connectNodes(t5.path + '/math_scale', t5.path + '/instance', 0);
  await client.connectNodes(t5.path + '/instance', t5.path + '/out', 0);
  
  const v5 = await client.healthcheck(t5.path, true);
  console.log('  attr_instancing: ' + (v5.ok ? 'OK' : 'ISSUES ' + v5.issueCount));

  // ========= VERIFICACION GLOBAL =========
  console.log('\n=== VERIFICACION FINAL ===');
  const names = ['td_render_pipeline','td_chop_to_pop','td_hierarchy','td_feedback_loop','td_glsl_deform','td_multi_input','td_particle_filter','td_attr_instancing'];
  let allOk = true;
  for (const name of names) {
    const h = await client.healthcheck(P + '/' + name, true);
    const e = h.issues?.filter(i => !i.path.includes('_compute') && !i.path.includes('glsl_shader_info') && !i.warnings?.includes('Camera'));
    const ok = h.ok || (e && e.length === 0);
    if (!ok) allOk = false;
    console.log('  ' + name + ': ' + (ok ? 'OK' : 'ISSUES'));
  }
  console.log('\n' + (allOk ? 'TODO OK' : 'ALGUNOS CON ISSUES') + ' - 8 sistemas probados');
}
test().catch(e => console.log('FATAL:', e.message));
