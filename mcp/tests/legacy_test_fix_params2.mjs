import { TDClient } from '../../api/dist/index.js';
const client = new TDClient();
const P = '/td_tests_container';

async function setPar(path, name, value) {
  const code = 'import json\nt = op("' + path + '")\npar = getattr(t.par, "' + name + '")\npar.val = ' + value + '\nprint(json.dumps({"set":True,"val":str(par.val)}))';
  await client.execute(code);
}

async function test() {
  // Fix Test 3: deletePOP issue - remove deletePOP, use only limitPOP
  console.log('=== FIXING SYSTEMS WITH CORRECTED PARAMETERS ===\n');
  
  // Recreate Test 3 without deletePOP (too many points from copyPOP)
  try { await client.deleteOperator(P + '/td_limit_exp'); } catch(e) {}
  await new Promise(r => setTimeout(r, 300));
  
  const t3 = await client.createOperator('baseCOMP', 'td_limit_exp', P, 0, -600);
  await client.createOperator('spherePOP', 'sphere', t3.path, 0, 0);
  await client.createOperator('copyPOP', 'copy', t3.path, 250, 0);
  await client.createOperator('limitPOP', 'limit', t3.path, 500, 0);
  await client.createOperator('nullPOP', 'out', t3.path, 750, 0);
  await client.connectNodes(t3.path + '/sphere', t3.path + '/copy', 0);
  await client.connectNodes(t3.path + '/copy', t3.path + '/limit', 0);
  await client.connectNodes(t3.path + '/limit', t3.path + '/out', 0);
  
  // copyPOP: 3 copies on Y, translate Y=1.5
  console.log('Test 3 (fixed): copyPOP with ncy=3 + translate');
  await setPar(t3.path + '/copy', 'ncy', '3');
  await setPar(t3.path + '/copy', 'ty', '1.5');
  // limitPOP: clamp P.y between -1 and 1
  await setPar(t3.path + '/limit', 'mintype0', '"Range"');  // 'Range' not 'const'!
  await setPar(t3.path + '/limit', 'maxtype0', '"Range"');
  await setPar(t3.path + '/limit', 'min0', '-1.0');
  await setPar(t3.path + '/limit', 'max0', '1.0');
  
  const v3 = await client.healthcheck(t3.path, true);
  console.log('  status:', v3.ok ? 'OK' : 'ISSUES ' + v3.issueCount);

  // Fix Test 6: same fix - remove deletePOP, use limitPOP for filtering
  try { await client.deleteOperator(P + '/td_mega_chain'); } catch(e) {}
  await new Promise(r => setTimeout(r, 300));
  
  const t6 = await client.createOperator('baseCOMP', 'td_mega_chain', P, 0, -900);
  await client.createOperator('gridPOP', 'grid', t6.path, 0, 0);
  await client.createOperator('noisePOP', 'noise', t6.path, 250, 0);
  await client.createOperator('copyPOP', 'copy', t6.path, 500, 0);
  await client.createOperator('attributePOP', 'attr', t6.path, 750, 0);
  await client.createOperator('mathPOP', 'math', t6.path, 1000, 0);
  await client.createOperator('blendPOP', 'blend', t6.path, 1250, 0);
  await client.createOperator('limitPOP', 'limit', t6.path, 1500, 0);
  await client.createOperator('nullPOP', 'out', t6.path, 1750, 0);
  
  await client.connectNodes(t6.path + '/grid', t6.path + '/noise', 0);
  await client.connectNodes(t6.path + '/noise', t6.path + '/copy', 0);
  await client.connectNodes(t6.path + '/copy', t6.path + '/attr', 0);
  await client.connectNodes(t6.path + '/attr', t6.path + '/math', 0);
  await client.connectNodes(t6.path + '/math', t6.path + '/blend', 0);
  await client.connectNodes(t6.path + '/blend', t6.path + '/limit', 0);
  await client.connectNodes(t6.path + '/limit', t6.path + '/out', 0);
  
  console.log('Test 6 (fixed): Mega chain with corrected params');
  await setPar(t6.path + '/noise', 'amp0', '0.6');
  await setPar(t6.path + '/noise', 'period', '1.5');
  await setPar(t6.path + '/copy', 'ncy', '3');
  await setPar(t6.path + '/copy', 'ty', '1.5');
  await setPar(t6.path + '/attr', 'attr0customname', '"mysize"');
  await setPar(t6.path + '/attr', 'attr0value0', '0.3');
  await setPar(t6.path + '/math', 'mult0', '3.0');
  await setPar(t6.path + '/blend', 'blendtype', '"add"');
  await setPar(t6.path + '/blend', 'input0weight', '0.7');
  await setPar(t6.path + '/limit', 'mintype0', '"Range"');
  await setPar(t6.path + '/limit', 'maxtype0', '"Range"');
  await setPar(t6.path + '/limit', 'min0', '-1.5');
  await setPar(t6.path + '/limit', 'max0', '1.5');
  
  const v6 = await client.healthcheck(t6.path, true);
  console.log('  status:', v6.ok ? 'OK' : 'ISSUES ' + v6.issueCount);
  if (v6.issues) {
    for (const i of v6.issues) console.log('    ' + i.path + ': ' + (i.errors || i.warnings || '').substring(0, 100));
  }

  // ========= VERIFICACION =========
  console.log('\n=== VERIFICACION FINAL ===');
  const names = ['td_noise_exp','td_math_exp','td_limit_exp','td_attr_exp','td_fb_exp','td_mega_chain'];
  let allOk = true;
  for (const name of names) {
    const h = await client.healthcheck(P + '/' + name, true);
    const e = h.issues?.filter(i => !i.path.includes('_compute') && !i.path.includes('glsl_shader_info') && !i.warnings?.includes('Camera'));
    const ok = h.ok || (e && e.length === 0);
    if (!ok) allOk = false;
    console.log('  ' + name + ': ' + (ok ? 'OK' : 'ISSUES'));
  }
  console.log('\n' + (allOk ? 'TODO OK' : 'ALGUNOS CON ISSUES'));
}
test().catch(e => console.log('FATAL:', e.message));
