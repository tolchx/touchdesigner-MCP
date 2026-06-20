import { TDClient } from '../../api/dist/index.js';
const client = new TDClient();
const P = '/td_tests_container';

async function setPar(path, name, value) {
  const r = await client.execute('import json\nt = op("' + path + '")\npar = getattr(t.par, "' + name + '")\npar.val = ' + value + '\nprint(json.dumps({"set":True,"name":"' + name + '","val":str(par.val)}))');
  return r.stdout || r.error?.message;
}

async function createBase(name, x, y) {
  try { await client.deleteOperator(P + '/' + name); } catch(e) {}
  await new Promise(r => setTimeout(r, 200));
  return client.createOperator('baseCOMP', name, P, x, y);
}

async function test() {
  console.log('=== EXPERIMENTOS CON PARAMETROS POP ===\n');

  // ========= TEST 1: noisePOP extreme =========
  console.log('Test 1: noisePOP parameters experiment');
  const t1 = await createBase('td_noise_exp', 0, 0);
  await client.createOperator('spherePOP', 'sphere', t1.path, 0, 0);
  await client.createOperator('noisePOP', 'noise', t1.path, 250, 0);
  await client.createOperator('nullPOP', 'out', t1.path, 500, 0);
  await client.connectNodes(t1.path + '/sphere', t1.path + '/noise', 0);
  await client.connectNodes(t1.path + '/noise', t1.path + '/out', 0);
  
  // Set noisePOP parameters: simplex 4D, seed 42, amp 0.5, period 2.0
  console.log('  default noise:', await setPar(t1.path + '/noise', 'amp0', '0.5'));
  console.log('  period 2.0:', await setPar(t1.path + '/noise', 'period', '2.0'));
  console.log('  seed 42:', await setPar(t1.path + '/noise', 'seed', '42'));
  
  const v1 = await client.healthcheck(t1.path, true);
  console.log('  status:', v1.ok ? 'OK' : 'ISSUES');

  // ========= TEST 2: mathPOP scale + offset =========
  console.log('\nTest 2: mathPOP multiply + add');
  const t2 = await createBase('td_math_exp', 0, -300);
  await client.createOperator('spherePOP', 'sphere', t2.path, 0, 0);
  await client.createOperator('mathPOP', 'math', t2.path, 250, 0);
  await client.createOperator('nullPOP', 'out', t2.path, 500, 0);
  await client.connectNodes(t2.path + '/sphere', t2.path + '/math', 0);
  await client.connectNodes(t2.path + '/math', t2.path + '/out', 0);
  
  // mathPOP: multiply P by 2.0, then add 0.5
  console.log('  preoper=mult:', await setPar(t2.path + '/math', 'preoper', '"mult"'));
  console.log('  mult=2.0:', await setPar(t2.path + '/math', 'mult0', '2.0'));
  console.log('  postadd=0.5:', await setPar(t2.path + '/math', 'postadd0', '0.5'));
  
  const v2 = await client.healthcheck(t2.path, true);
  console.log('  status:', v2.ok ? 'OK' : 'ISSUES');

  // ========= TEST 3: limitPOP + deletePOP =========
  console.log('\nTest 3: limit + delete filter');
  const t3 = await createBase('td_limit_exp', 0, -600);
  await client.createOperator('spherePOP', 'sphere', t3.path, 0, 0);
  await client.createOperator('copyPOP', 'copy', t3.path, 250, 0);
  await client.createOperator('deletePOP', 'delete', t3.path, 500, 0);
  await client.createOperator('limitPOP', 'limit', t3.path, 750, 0);
  await client.createOperator('nullPOP', 'out', t3.path, 1000, 0);
  await client.connectNodes(t3.path + '/sphere', t3.path + '/copy', 0);
  await client.connectNodes(t3.path + '/copy', t3.path + '/delete', 0);
  await client.connectNodes(t3.path + '/delete', t3.path + '/limit', 0);
  await client.connectNodes(t3.path + '/limit', t3.path + '/out', 0);
  
  // copyPOP: 3 copies on Y
  console.log('  copy ncy=3:', await setPar(t3.path + '/copy', 'ncy', '3'));
  console.log('  copy ty=2:', await setPar(t3.path + '/copy', 'ty', '2'));
  // deletePOP: delete points with P.x > 0.3
  console.log('  delete attr0inattr=P:', await setPar(t3.path + '/delete', 'attr0inattr', '"P"'));
  console.log('  delete attr0func=gt:', await setPar(t3.path + '/delete', 'attr0func', '"gt"'));
  console.log('  delete attr0value=0.3:', await setPar(t3.path + '/delete', 'attr0value', '0.3'));
  // limitPOP: constrain P.y between -1 and 1
  console.log('  limit mintype=const:', await setPar(t3.path + '/limit', 'mintype0', '"const"'));
  console.log('  limit maxtype=const:', await setPar(t3.path + '/limit', 'maxtype0', '"const"'));
  console.log('  limit min=-1:', await setPar(t3.path + '/limit', 'min0', '-1.0'));
  console.log('  limit max=1:', await setPar(t3.path + '/limit', 'max0', '1.0'));
  
  const v3 = await client.healthcheck(t3.path, true);
  console.log('  status:', v3.ok ? 'OK' : 'ISSUES');

  // ========= TEST 4: attribute + instancing =========
  console.log('\nTest 4: attributePOP + copy instancing');
  const t4 = await createBase('td_attr_exp', 0, -900);
  await client.createOperator('gridPOP', 'grid', t4.path, 0, 0);
  await client.createOperator('attributePOP', 'attr', t4.path, 250, 0);
  await client.createOperator('mathPOP', 'math', t4.path, 500, 0);
  await client.createOperator('copyPOP', 'copy', t4.path, 750, 0);
  await client.createOperator('nullPOP', 'out', t4.path, 1000, 0);
  await client.connectNodes(t4.path + '/grid', t4.path + '/attr', 0);
  await client.connectNodes(t4.path + '/attr', t4.path + '/math', 0);
  await client.connectNodes(t4.path + '/math', t4.path + '/copy', 0);
  await client.connectNodes(t4.path + '/copy', t4.path + '/out', 0);
  
  // attributePOP: create custom 'scale' attribute
  console.log('  attr custom name=myscale:', await setPar(t4.path + '/attr', 'attr0customname', '"myscale"'));
  console.log('  attr type=float:', await setPar(t4.path + '/attr', 'attr0type', '"float"'));
  console.log('  attr value=0.5:', await setPar(t4.path + '/attr', 'attr0value0', '0.5'));
  // mathPOP: multiply myscale by 2
  console.log('  math inputattrscope=myscale:', await setPar(t4.path + '/math', 'inputattrscope', '"myscale"'));
  console.log('  math mult=2:', await setPar(t4.path + '/math', 'mult0', '2.0'));
  // copyPOP: 2x2x2 grid
  console.log('  copy ncx=2:', await setPar(t4.path + '/copy', 'ncx', '2'));
  console.log('  copy ncy=2:', await setPar(t4.path + '/copy', 'ncy', '2'));
  console.log('  copy tx=2:', await setPar(t4.path + '/copy', 'tx', '2'));
  console.log('  copy ty=2:', await setPar(t4.path + '/copy', 'ty', '2'));
  
  const v4 = await client.healthcheck(t4.path, true);
  console.log('  status:', v4.ok ? 'OK' : 'ISSUES');

  // ========= TEST 5: feedback+blend with params =========
  console.log('\nTest 5: feedback + blend parameters');
  const t5 = await createBase('td_fb_exp', 0, -1200);
  await client.createOperator('spherePOP', 'sphere', t5.path, 0, 0);
  await client.createOperator('noisePOP', 'noise', t5.path, 250, 0);
  await client.createOperator('feedbackPOP', 'fb', t5.path, 500, 0);
  await client.createOperator('blendPOP', 'blend', t5.path, 750, 0);
  await client.createOperator('nullPOP', 'out', t5.path, 1000, 0);
  await client.connectNodes(t5.path + '/sphere', t5.path + '/noise', 0);
  await client.connectNodes(t5.path + '/noise', t5.path + '/fb', 0);
  await client.connectNodes(t5.path + '/fb', t5.path + '/blend', 0);
  await client.connectNodes(t5.path + '/blend', t5.path + '/out', 0);
  
  // noisePOP: high amplitude noise
  console.log('  noise amp=0.8:', await setPar(t5.path + '/noise', 'amp0', '0.8'));
  console.log('  noise period=0.5:', await setPar(t5.path + '/noise', 'period', '0.5'));
  // feedbackPOP: enable with preroll
  console.log('  fb preroll=1:', await setPar(t5.path + '/fb', 'preroll', '1.0'));
  console.log('  fb inputmul=2:', await setPar(t5.path + '/fb', 'inputmul', '2'));
  // blendPOP: additive blend
  console.log('  blend blendtype=add:', await setPar(t5.path + '/blend', 'blendtype', '"add"'));
  console.log('  blend input0weight=0.7:', await setPar(t5.path + '/blend', 'input0weight', '0.7'));
  
  const v5 = await client.healthcheck(t5.path, true);
  console.log('  status:', v5.ok ? 'OK' : 'ISSUES');

  // ========= TEST 6: CADENA MULTI-EFECTO COMPLETA =========
  console.log('\nTest 6: Multi-efecto complete chain');
  const t6 = await createBase('td_mega_chain', 0, -1500);
  await client.createOperator('gridPOP', 'grid', t6.path, 0, 0);
  await client.createOperator('noisePOP', 'noise1', t6.path, 250, 0);
  await client.createOperator('copyPOP', 'copy', t6.path, 500, 0);
  await client.createOperator('attributePOP', 'attr', t6.path, 750, 0);
  await client.createOperator('mathPOP', 'math', t6.path, 1000, 0);
  await client.createOperator('deletePOP', 'delete', t6.path, 1250, 0);
  await client.createOperator('blendPOP', 'blend', t6.path, 1500, 0);
  await client.createOperator('limitPOP', 'limit', t6.path, 1750, 0);
  await client.createOperator('nullPOP', 'out', t6.path, 2000, 0);
  
  await client.connectNodes(t6.path + '/grid', t6.path + '/noise1', 0);
  await client.connectNodes(t6.path + '/noise1', t6.path + '/copy', 0);
  await client.connectNodes(t6.path + '/copy', t6.path + '/attr', 0);
  await client.connectNodes(t6.path + '/attr', t6.path + '/math', 0);
  await client.connectNodes(t6.path + '/math', t6.path + '/delete', 0);
  await client.connectNodes(t6.path + '/delete', t6.path + '/blend', 0);
  await client.connectNodes(t6.path + '/blend', t6.path + '/limit', 0);
  await client.connectNodes(t6.path + '/limit', t6.path + '/out', 0);
  
  // Set ALL parameters:
  console.log('  noise1 amp=0.6 per=1.5:', await setPar(t6.path + '/noise1', 'amp0', '0.6'));
  await setPar(t6.path + '/noise1', 'period', '1.5');
  console.log('  copy 3x3:', await setPar(t6.path + '/copy', 'ncx', '3'));
  await setPar(t6.path + '/copy', 'ncy', '3');
  console.log('  attr custom=mysize val=0.3:', await setPar(t6.path + '/attr', 'attr0customname', '"mysize"'));
  await setPar(t6.path + '/attr', 'attr0value0', '0.3');
  console.log('  math mult=3:', await setPar(t6.path + '/math', 'mult0', '3.0'));
  console.log('  delete P.x>0.5:', await setPar(t6.path + '/delete', 'attr0inattr', '"P"'));
  await setPar(t6.path + '/delete', 'attr0func', '"gt"');
  await setPar(t6.path + '/delete', 'attr0value', '0.5');
  console.log('  blend add:', await setPar(t6.path + '/blend', 'blendtype', '"add"'));
  console.log('  limit P:[-1.5,1.5]:', await setPar(t6.path + '/limit', 'mintype0', '"const"'));
  await setPar(t6.path + '/limit', 'maxtype0', '"const"');
  await setPar(t6.path + '/limit', 'min0', '-1.5');
  await setPar(t6.path + '/limit', 'max0', '1.5');
  
  const v6 = await client.healthcheck(t6.path, true);
  console.log('  status:', v6.ok ? 'OK' : 'ISSUES');

  // ========= VERIFICACION GLOBAL =========
  console.log('\n=== VERIFICACION ===');
  const names = ['td_noise_exp','td_math_exp','td_limit_exp','td_attr_exp','td_fb_exp','td_mega_chain'];
  for (const name of names) {
    const h = await client.healthcheck(P + '/' + name, true);
    const e = h.issues?.filter(i => !i.path.includes('_compute') && !i.path.includes('glsl_shader_info') && !i.warnings?.includes('Camera'));
    console.log('  ' + name + ': ' + (h.ok || (e && e.length === 0) ? 'OK' : 'ISSUES'));
    if (!h.ok && e) {
      for (const i of e.slice(0, 2)) console.log('    ' + i.path + ': ' + (i.errors || i.warnings || '').substring(0, 100));
    }
  }
  console.log('\nDONE');
}
test().catch(e => console.log('FATAL:', e.message));
