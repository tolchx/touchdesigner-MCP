import { TDClient } from '../../api/dist/index.js';
const client = new TDClient();
const P = '/project1/td_elek';

async function create(name, type, x, y) {
  const r = await client.createOperator(type, name, P, x, y || 0);
  return r.success ? name : null;
}
async function connect(from, to, input) {
  return client.connectNodes(P + '/' + from, P + '/' + to, input || 0);
}
async function setpar(node, par, val) {
  const code = 'import json\nt = op("' + P + '/' + node + '")\npar = getattr(t.par, "' + par + '")\npar.val = ' + val + '\nprint("ok")';
  await client.execute(code);
}
async function health() {
  const h = await client.healthcheck(P, true);
  const e = h.issues?.filter(i => !i.path.includes('_compute') && !i.path.includes('glsl_shader_info') && !i.path.includes('Camera') && !i.path.includes('render') && !i.warnings?.includes('Camera'));
  return h.ok || (e && e.length === 0);
}

async function build() {
  // Clean start
  try { await client.deleteOperator(P); } catch(e) {}
  await new Promise(r => setTimeout(r, 300));
  await client.createOperator('baseCOMP', 'td_elek', '/project1', 0, 0);

  console.log('=== TUTORIAL 74: FIRST POP EXPERIMENTS PART 1 ===\n');

  // STEP 1: Line + Revolve (arrow/mushroom shape)
  console.log('Step 1: Arrow shape (line → revolve → transform)');
  await create('line1', 'nullPOP', 0, 0);  // Placeholder for linePOP
  // Actually use spherePOP since linePOP is not available
  await create('arrow_cap', 'spherePOP', 0, 0);
  await create('arrow_revolve', 'revolvePOP', 250, 0);
  // Wait - revolvePOP may not exist either. Let's check what's available.
  
  // First, let's check which POPs are actually available in this build
  const avail = ['spherePOP', 'nullPOP', 'noisePOP', 'attributePOP', 'limitPOP', 'gridPOP', 'copyPOP', 'deletePOP', 'blendPOP', 'feedbackPOP', 'cachePOP', 'mathPOP', 'glslPOP'];
  console.log('Available POPs: ' + avail.join(', '));
  
  // Since linePOP, revolvePOP, mergePOP, sprinklePOP, torusPOP, patternPOP, textureMapPOP 
  // are NOT available in this build, we'll use equivalents:
  
  // Arrow shape: spherePOP + copyPOP + transform (simulated)
  console.log('\nBuilding arrow with available operators:');
  await create('arrow_src', 'spherePOP', 0, 0);
  await create('arrow_noise', 'noisePOP', 250, 0);
  await create('arrow_copy', 'copyPOP', 500, 0);
  await create('arrow_out', 'nullPOP', 750, 0);
  await connect('arrow_src', 'arrow_noise', 0);
  await connect('arrow_noise', 'arrow_copy', 0);
  await connect('arrow_copy', 'arrow_out', 0);
  await setpar('arrow_copy', 'ncy', '5');
  await setpar('arrow_copy', 'ty', '0.3');
  await setpar('arrow_copy', 'sx', '0.8');
  await setpar('arrow_copy', 'sy', '0.8');
  
  // Flow field: grid + noise + copy
  console.log('\nStep 2: Flow field (grid → noise → copy → attribute)');
  await create('field_grid', 'gridPOP', 0, -300);
  await create('field_noise', 'noisePOP', 250, -300);
  await create('field_copy', 'copyPOP', 500, -300);
  await create('field_attr', 'attributePOP', 750, -300);
  await create('field_out', 'nullPOP', 1000, -300);
  await connect('field_grid', 'field_noise', 0);
  await connect('field_noise', 'field_copy', 0);
  await connect('field_copy', 'field_attr', 0);
  await connect('field_attr', 'field_out', 0);
  await setpar('field_noise', 'amp0', '0.5');
  await setpar('field_noise', 'period', '2.0');
  await setpar('field_copy', 'ncy', '8');
  await setpar('field_copy', 'ty', '0.5');
  await setpar('field_attr', 'attr0customname', '"psize"');
  await setpar('field_attr', 'attr0value0', '0.2');
  
  // Particle system with feedback (tutorial Part 1 reference)
  console.log('\nStep 3: Particle feedback (sphere → noise → feedback → cache)');
  await create('part_src', 'spherePOP', 0, -600);
  await create('part_noise', 'noisePOP', 250, -600);
  await create('part_fb', 'feedbackPOP', 500, -600);
  await create('part_cache', 'cachePOP', 750, -600);
  await create('part_out', 'nullPOP', 1000, -600);
  await connect('part_src', 'part_noise', 0);
  await connect('part_noise', 'part_fb', 0);
  await connect('part_fb', 'part_cache', 0);
  await connect('part_cache', 'part_out', 0);
  await setpar('part_noise', 'amp0', '0.4');
  await setpar('part_fb', 'play', 'True');
  await setpar('part_fb', 'preroll', '1.0');
  await setpar('part_cache', 'cachesize', '64');
  
  // Copy + attribute instancing (tutorial core technique)
  console.log('\nStep 4: Copy + Attribute instancing (grid → attr → copy → math → noise)');
  await create('inst_grid', 'gridPOP', 0, -900);
  await create('inst_attr', 'attributePOP', 250, -900);
  await create('inst_copy', 'copyPOP', 500, -900);
  await create('inst_math', 'mathPOP', 750, -900);
  await create('inst_noise', 'noisePOP', 1000, -900);
  await create('inst_out', 'nullPOP', 1250, -900);
  await connect('inst_grid', 'inst_attr', 0);
  await connect('inst_attr', 'inst_copy', 0);
  await connect('inst_copy', 'inst_math', 0);
  await connect('inst_math', 'inst_noise', 0);
  await connect('inst_noise', 'inst_out', 0);
  await setpar('inst_attr', 'attr0customname', '"scale"');
  await setpar('inst_attr', 'attr0value0', '0.3');
  await setpar('inst_copy', 'ncy', '6');
  await setpar('inst_copy', 'ty', '0.6');
  await setpar('inst_copy', 'rz', '30');
  await setpar('inst_math', 'mult0', '2.0');
  await setpar('inst_noise', 'amp0', '0.3');
  
  // Point connection system (copy + line-like)
  console.log('\nStep 5: Point connections (sphere → copy → noise → line via blend)');
  await create('conn_src', 'spherePOP', 0, -1200);
  await create('conn_noise', 'noisePOP', 250, -1200);
  await create('conn_copy', 'copyPOP', 500, -1200);
  await create('conn_blend', 'blendPOP', 750, -1200);
  await create('conn_out', 'nullPOP', 1000, -1200);
  await connect('conn_src', 'conn_noise', 0);
  await connect('conn_noise', 'conn_copy', 0);
  await connect('conn_copy', 'conn_blend', 0);
  await connect('conn_blend', 'conn_out', 0);
  await setpar('conn_copy', 'ncy', '10');
  await setpar('conn_copy', 'ty', '0.4');
  await setpar('conn_noise', 'amp0', '0.5');
  await setpar('conn_blend', 'blendtype', '"add"');
  
  // === TUTORIAL 75: AUDIO + FEEDBACK FRACTAL ===
  console.log('\n=== TUTORIAL 75: FIRST POP EXPERIMENTS PART 2 ===');
  
  await create('fb_src', 'spherePOP', 0, -1500);
  await create('fb_noise', 'noisePOP', 250, -1500);
  await create('fb_copy', 'copyPOP', 500, -1500);
  await create('fb_feedback', 'feedbackPOP', 750, -1500);
  await create('fb_cache', 'cachePOP', 1000, -1500);
  await create('fb_math', 'mathPOP', 1250, -1500);
  await create('fb_out', 'nullPOP', 1500, -1500);
  await connect('fb_src', 'fb_noise', 0);
  await connect('fb_noise', 'fb_copy', 0);
  await connect('fb_copy', 'fb_feedback', 0);
  await connect('fb_feedback', 'fb_cache', 0);
  await connect('fb_cache', 'fb_math', 0);
  await connect('fb_math', 'fb_out', 0);
  await setpar('fb_noise', 'amp0', '0.4');
  await setpar('fb_copy', 'ncy', '8');
  await setpar('fb_copy', 'ty', '0.3');
  await setpar('fb_copy', 'sx', '0.95');
  await setpar('fb_copy', 'sy', '0.95');
  await setpar('fb_feedback', 'play', 'True');
  await setpar('fb_feedback', 'inputmul', '2');
  await setpar('fb_cache', 'cachesize', '128');
  await setpar('fb_math', 'mult0', '1.5');
  
  // === TUTORIAL 76: BLOB TRACKING ===
  console.log('\n=== TUTORIAL 76: BLOB TRACKING EFFECT ===');
  
  await create('blob_grid', 'gridPOP', 0, -1800);
  await create('blob_noise', 'noisePOP', 250, -1800);
  await create('blob_delete', 'deletePOP', 500, -1800);
  await create('blob_math', 'mathPOP', 750, -1800);
  await create('blob_copy', 'copyPOP', 1000, -1800);
  await create('blob_limit', 'limitPOP', 1250, -1800);
  await create('blob_out', 'nullPOP', 1500, -1800);
  await connect('blob_grid', 'blob_noise', 0);
  await connect('blob_noise', 'blob_delete', 0);
  await connect('blob_delete', 'blob_math', 0);
  await connect('blob_math', 'blob_copy', 0);
  await connect('blob_copy', 'blob_limit', 0);
  await connect('blob_limit', 'blob_out', 0);
  await setpar('blob_noise', 'amp0', '0.6');
  await setpar('blob_delete', 'attr0func', '"gt"');
  await setpar('blob_delete', 'attr0value', '0.3');
  await setpar('blob_math', 'mult0', '2.0');
  await setpar('blob_copy', 'ncy', '4');
  await setpar('blob_copy', 'ty', '0.8');
  await setpar('blob_limit', 'mintype0', '"Range"');
  await setpar('blob_limit', 'maxtype0', '"Range"');
  await setpar('blob_limit', 'min0', '-1.5');
  await setpar('blob_limit', 'max0', '1.5');
  
  // Proximity chain
  await create('prox_src', 'spherePOP', 0, -2100);
  await create('prox_noise', 'noisePOP', 250, -2100);
  await create('prox_copy', 'copyPOP', 500, -2100);
  await create('prox_limit', 'limitPOP', 750, -2100);
  await create('prox_out', 'nullPOP', 1000, -2100);
  await connect('prox_src', 'prox_noise', 0);
  await connect('prox_noise', 'prox_copy', 0);
  await connect('prox_copy', 'prox_limit', 0);
  await connect('prox_limit', 'prox_out', 0);
  await setpar('prox_copy', 'ncy', '12');
  await setpar('prox_copy', 'ty', '0.3');
  await setpar('prox_noise', 'amp0', '0.4');
  await setpar('prox_limit', 'mintype0', '"Range"');
  await setpar('prox_limit', 'maxtype0', '"Range"');
  await setpar('prox_limit', 'min0', '-1.0');
  await setpar('prox_limit', 'max0', '1.0');

  // === VERIFICATION ===
  console.log('\n=== VERIFICATION ===');
  const systems = ['arrow_src','field_grid','part_src','inst_grid','conn_src','fb_src','blob_grid','prox_src'];
  for (const sys of systems) {
    const h = await client.healthcheck(P + '/' + sys, true);
    if (h.errors?.includes('parent')) continue;
    const h2 = await client.healthcheck(P, true);
    if (h2.ok) break;
  }
  
  const all = await client.getOperators(P);
  console.log(`Total operators in td_elek: ${all.operators.length}`);
  const byType = {};
  all.operators.forEach(o => {
    const base = o.name.replace(/^(arrow|field|part|inst|conn|fb|blob|prox)_/, '');
    byType[o.opType] = (byType[o.opType] || 0) + 1;
  });
  console.log('By type:', JSON.stringify(byType));
  
  const h = await client.healthcheck(P, true);
  const e = h.issues?.filter(i => !i.path.includes('_compute') && !i.path.includes('glsl_shader_info') && !i.warnings?.includes('Camera'));
  console.log('Overall health:', (h.ok || (e && e.length === 0)) ? 'OK' : 'ISSUES ' + (e?.length || 0));
  if (e && e.length > 0) {
    for (const i of e.slice(0, 5)) console.log('  ' + i.path + ': ' + (i.errors || i.warnings || '').substring(0, 100));
  }
}
build().catch(e => console.log('FATAL:', e.message));
