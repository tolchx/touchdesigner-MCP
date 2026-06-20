import { TDClient } from '../../api/dist/index.js';
const client = new TDClient();
const P = '/td_tests_container';

async function createBase(name, x, y) {
  try { await client.deleteOperator(P + '/' + name); } catch(e) {}
  await new Promise(r => setTimeout(r, 200));
  return client.createOperator('baseCOMP', name, P, x, y);
}

async function makeNode(type, name, parent, x, y) {
  const r = await client.createOperator(type, name, parent, x, y);
  if (!r.success) console.log('  FAIL create:', type, name);
  return r;
}

async function link(fromPath, toPath, input) {
  const r = await client.connectNodes(fromPath, toPath, input || 0);
  if (!r.success) console.log('  FAIL connect:', fromPath, '->', toPath);
  return r;
}

async function verify(path) {
  const h = await client.healthcheck(path, true);
  const e = h.issues?.filter(i => !i.path.includes('_compute') && !i.path.includes('glsl_shader_info'));
  return { ok: h.ok && (!e || e.length === 0), issues: e?.length || 0 };
}

async function test() {
  console.log('=== NUEVOS SISTEMAS POP CON MCP v2.2 ===\n');

  // ========= TEST 1: Pipeline de render completo =========
  console.log('Test 1: POP → SOP → Render pipeline');
  const t1 = await createBase('td_render_pipeline', 0, 0);

  // Crear POP chain
  await makeNode('spherePOP', 'pop_source', t1.path, 0, 0);
  await makeNode('noisePOP', 'pop_noise', t1.path, 250, 0);
  await makeNode('nullPOP', 'pop_out', t1.path, 500, 0);
  await link(t1.path + '/pop_source', t1.path + '/pop_noise', 0);
  await link(t1.path + '/pop_noise', t1.path + '/pop_out', 0);
  
  // SOP to POP conversion via SOPtoPOP
  await makeNode('nullSOP', 'sop_out', t1.path, 750, 0);
  
  // Geometry COMP for rendering
  await makeNode('geometryCOMP', 'geo', t1.path, 1000, 0);
  
  // Conectar POP → SOP → Geo
  await link(t1.path + '/pop_out', t1.path + '/sop_out', 0);
  await link(t1.path + '/sop_out', t1.path + '/geo', 0);
  
  // Render TOP
  await makeNode('renderTOP', 'render', t1.path, 1250, 0);
  await makeNode('nullTOP', 'output', t1.path, 1500, 0);
  await link(t1.path + '/geo', t1.path + '/render', 0);
  await link(t1.path + '/render', t1.path + '/output', 0);
  
  const v1 = await verify(t1.path);
  console.log('  render_pipeline:', v1.ok ? 'OK' : 'ISSUES', '(' + v1.issues + ')');

  // ========= TEST 2: CHOP to POP =========
  console.log('\nTest 2: CHOP → POP data conversion');
  const t2 = await createBase('td_chop_to_pop', 0, -400);
  
  await makeNode('lfoCHOP', 'lfo', t2.path, 0, 0);
  await makeNode('nullCHOP', 'chop_out', t2.path, 250, 0);
  await makeNode('noisePOP', 'pop_noise', t2.path, 0, -200);
  await makeNode('nullPOP', 'pop_out', t2.path, 250, -200);
  await link(t2.path + '/lfo', t2.path + '/chop_out', 0);
  await link(t2.path + '/pop_noise', t2.path + '/pop_out', 0);
  
  const v2 = await verify(t2.path);
  console.log('  chop_to_pop:', v2.ok ? 'OK' : 'ISSUES', '(' + v2.issues + ')');

  // ========= TEST 3: Feedback + Copy loop =========
  console.log('\nTest 3: Feedback + Copy + Blend loop');
  const t3 = await createBase('td_feedback_loop', 0, -800);
  
  await makeNode('spherePOP', 'source', t3.path, 0, 0);
  await makeNode('noisePOP', 'force', t3.path, 250, 0);
  await makeNode('feedbackPOP', 'fb', t3.path, 500, 0);
  await makeNode('copyPOP', 'copy', t3.path, 750, 0);
  await makeNode('cachePOP', 'cache', t3.path, 1000, 0);
  await makeNode('blendPOP', 'blend', t3.path, 1250, 0);
  await makeNode('nullPOP', 'out', t3.path, 1500, 0);
  
  await link(t3.path + '/source', t3.path + '/force', 0);
  await link(t3.path + '/force', t3.path + '/fb', 0);
  await link(t3.path + '/fb', t3.path + '/copy', 0);
  await link(t3.path + '/copy', t3.path + '/cache', 0);
  await link(t3.path + '/cache', t3.path + '/blend', 0);
  await link(t3.path + '/blend', t3.path + '/out', 0);
  
  const v3 = await verify(t3.path);
  console.log('  feedback_loop:', v3.ok ? 'OK' : 'ISSUES', '(' + v3.issues + ')');

  // ========= TEST 4: Grid + GLSL + Noise deformación =========
  console.log('\nTest 4: Grid + GLSL + Noise complex deformation');
  const t4 = await createBase('td_glsl_deform', 0, -1200);
  
  await makeNode('gridPOP', 'grid', t4.path, 0, 0);
  await makeNode('copyPOP', 'copy', t4.path, 250, 0);
  await makeNode('noisePOP', 'noise', t4.path, 500, 0);
  await makeNode('glslPOP', 'glsl', t4.path, 750, 0);
  await makeNode('attributePOP', 'attr', t4.path, 1000, 0);
  await makeNode('limitPOP', 'limit', t4.path, 1250, 0);
  await makeNode('nullPOP', 'out', t4.path, 1500, 0);
  
  await link(t4.path + '/grid', t4.path + '/copy', 0);
  await link(t4.path + '/copy', t4.path + '/noise', 0);
  await link(t4.path + '/noise', t4.path + '/glsl', 0);
  await link(t4.path + '/glsl', t4.path + '/attr', 0);
  await link(t4.path + '/attr', t4.path + '/limit', 0);
  await link(t4.path + '/limit', t4.path + '/out', 0);
  
  // Esperar compute DAT y escribir GLSL
  await new Promise(r => setTimeout(r, 700));
  const cdR = await client.execute('import json\nt = op("' + t4.path + '/glsl")\nprint(json.dumps({"cd":str(t.par.computedat.eval())}))');
  const cd = JSON.parse(cdR.stdout).cd;
  if (cd && cd.startsWith('/')) {
    await client.execute('import json\nt = op("' + t4.path + '/glsl")\nt.par.outputattrs = "P"\nprint("ok")');
    const shader = [
      'void main() {',
      '    const uint id = TDIndex(); if(id >= TDNumElements()) return;',
      '    vec3 pos = TDIn_P();',
      '    float r = length(pos.xy);',
      '    float wave = sin(r * 4.0 + float(id) * 0.01) * 0.3;',
      '    float spiral = sin(r * 2.0 + atan(pos.y, pos.x) * 3.0 + float(id) * 0.02) * 0.2;',
      '    P[id] = pos + vec3(spiral, spiral * 0.5, wave);',
      '}'
    ].join('\n');
    await client.execute('import json\nt = op("' + cd + '")\nt.text = """' + shader + '"""\nprint("ok")');
  }
  
  const v4 = await verify(t4.path);
  console.log('  glsl_deform:', v4.ok ? 'OK' : 'ISSUES', '(' + v4.issues + ')');
  if (!v4.ok) {
    const h4 = await client.healthcheck(t4.path, true);
    for (const i of h4.issues || []) {
      if (i.path.includes(t4.path)) console.log('    ' + i.path + ': ' + (i.errors || '').substring(0, 120));
    }
  }

  // ========= TEST 5: Múltiples entradas GLSL POP =========
  console.log('\nTest 5: Multi-input GLSL POP (TDIn1_P)');
  const t5 = await createBase('td_multi_input', 0, -1600);
  
  await makeNode('spherePOP', 'input_a', t5.path, 0, 0);
  await makeNode('gridPOP', 'input_b', t5.path, 0, -200);
  await makeNode('mergePOP', 'merge', t5.path, 250, -100);
  await makeNode('glslPOP', 'glsl', t5.path, 500, -100);
  await makeNode('nullPOP', 'out', t5.path, 750, -100);
  
  await link(t5.path + '/input_a', t5.path + '/merge', 0);
  await link(t5.path + '/input_b', t5.path + '/merge', 1);
  await link(t5.path + '/merge', t5.path + '/glsl', 0);
  await link(t5.path + '/glsl', t5.path + '/out', 0);
  
  // Esperar compute DAT del glsl y escribir shader
  await new Promise(r => setTimeout(r, 700));
  const cdR5 = await client.execute('import json\nt = op("' + t5.path + '/glsl")\nprint(json.dumps({"cd":str(t.par.computedat.eval())}))');
  const cd5 = JSON.parse(cdR5.stdout).cd;
  if (cd5 && cd5.startsWith('/')) {
    await client.execute('import json\nt = op("' + t5.path + '/glsl")\nt.par.outputattrs = "P"\nprint("ok")');
    const s = 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; vec3 pos = TDIn_P(); pos.x += sin(float(id) * 0.3) * 0.1; P[id] = pos; }';
    await client.execute('import json\nt = op("' + cd5 + '")\nt.text = """' + s + '"""\nprint("ok")');
  }
  
  const v5 = await verify(t5.path);
  console.log('  multi_input:', v5.ok ? 'OK' : 'ISSUES', '(' + v5.issues + ')');

  // ========= TEST 6: Jerarquía con outPOP =========
  console.log('\nTest 6: POP outPOP hierarchy (nested COMPs)');
  const t6 = await createBase('td_hierarchy', 0, -2000);
  
  // Nivel 1: inner system
  await makeNode('baseCOMP', 'inner', t6.path, 0, 0);
  await makeNode('spherePOP', 'source', t6.path + '/inner', 0, 0);
  await makeNode('noisePOP', 'force', t6.path + '/inner', 250, 0);
  await makeNode('outPOP', 'output', t6.path + '/inner', 500, 0);
  await link(t6.path + '/inner/source', t6.path + '/inner/force', 0);
  await link(t6.path + '/inner/force', t6.path + '/inner/output', 0);
  
  // Nivel 2: outer sees inner\'s outPOP
  await makeNode('nullPOP', 'final', t6.path, 250, 0);
  await link(t6.path + '/inner', t6.path + '/final', 0);
  
  const v6 = await verify(t6.path);
  console.log('  hierarchy:', v6.ok ? 'OK' : 'ISSUES', '(' + v6.issues + ')');

  // ========= VERIFICACION GLOBAL =========
  console.log('\n=== VERIFICACION GLOBAL ===');
  const names = ['td_render_pipeline','td_chop_to_pop','td_feedback_loop','td_glsl_deform','td_multi_input','td_hierarchy'];
  for (const name of names) {
    const h = await client.healthcheck(P + '/' + name, true);
    const e = h.issues?.filter(i => !i.path.includes('_compute') && !i.path.includes('glsl_shader_info'));
    const ok = h.ok && (!e || e.length === 0);
    console.log('  ' + name + ': ' + (ok ? 'OK' : 'ISSUES') + ' (' + (e?.length || 0) + ' issues)');
    if (!ok && e) {
      for (const i of e.slice(0, 2)) {
        console.log('    ' + i.path + ': ' + (i.errors || i.warnings || '').substring(0, 100));
      }
    }
  }
  console.log('\nDONE');
}
test().catch(e => console.log('FATAL:', e.message));
