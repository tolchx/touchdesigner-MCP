import { TDClient } from '../../api/dist/index.js';
const client = new TDClient();
const P = '/td_tests_container';

async function makeSystem(name, opts, row) {
  // opts = { type chain, params set, description }
  const baseY = row * -250;
  try { await client.deleteOperator(P + '/' + name); } catch(e) {}
  await new Promise(r => setTimeout(r, 150));
  
  const comp = await client.createOperator('baseCOMP', name, P, 0, baseY);
  if (!comp.success) return { error: 'create failed' };
  
  const BP = comp.path;
  let x = 0;
  const created = [];
  
  for (const step of opts.chain) {
    const r = await client.createOperator(step.type, step.name, BP, x, 0);
    if (r.success) created.push(step.name);
    x += 250;
  }
  
  // Connect sequentially
  for (let i = 1; i < created.length; i++) {
    await client.connectNodes(BP + '/' + created[i-1], BP + '/' + created[i], 0);
  }
  
  // Set parameters
  if (opts.params) {
    for (const [node, pars] of Object.entries(opts.params)) {
      for (const [par, val] of Object.entries(pars)) {
        const code = 'import json\nt = op("' + BP + '/' + node + '")\npar = getattr(t.par, "' + par + '")\npar.val = ' + val + '\nprint("ok")';
        await client.execute(code);
      }
    }
  }
  
  const h = await client.healthcheck(BP, true);
  const e = h.issues?.filter(i => !i.path.includes('_compute') && !i.path.includes('glsl_shader_info') && !i.warnings?.includes('Camera'));
  return { ok: h.ok || (e && e.length === 0), issues: e?.length || 0 };
}

async function test() {
  console.log('=== CREANDO 30 SISTEMAS POP ===\n');
  
  const systems = [
    // ROW 0: Noise variations
    { name: 'pop_noise_heavy', chain: [{type:'spherePOP',name:'src'},{type:'noisePOP',name:'noise'},{type:'nullPOP',name:'out'}],
      params: {'noise':{amp0:'0.8',period:'3.0',seed:'99'}}, desc:'Strong noise displacement' },
    { name: 'pop_noise_fine', chain: [{type:'spherePOP',name:'src'},{type:'noisePOP',name:'noise'},{type:'nullPOP',name:'out'}],
      params: {'noise':{amp0:'0.1',period:'0.5',seed:'42'}}, desc:'Fine detail noise' },
    { name: 'pop_noise_warp', chain: [{type:'spherePOP',name:'src'},{type:'noisePOP',name:'n1'},{type:'noisePOP',name:'n2'},{type:'nullPOP',name:'out'}],
      params: {'n1':{amp0:'0.6',period:'1.0'},'n2':{amp0:'0.3',period:'2.5'}}, desc:'Double noise warp' },
    { name: 'pop_noise_sparse', chain: [{type:'spherePOP',name:'src'},{type:'noisePOP',name:'noise'},{type:'nullPOP',name:'out'}],
      params: {'noise':{type:'"sparse"',amp0:'0.5',seed:'7'}}, desc:'Sparse convolution noise' },
    { name: 'pop_noise_alligator', chain: [{type:'spherePOP',name:'src'},{type:'noisePOP',name:'noise'},{type:'nullPOP',name:'out'}],
      params: {'noise':{type:'"alligator"',amp0:'0.4'}}, desc:'Alligator cell noise' },
    // ROW 1: Math transforms
    { name: 'pop_math_scale2x', chain: [{type:'spherePOP',name:'src'},{type:'mathPOP',name:'math'},{type:'nullPOP',name:'out'}],
      params: {'math':{mult0:'2.0',postadd0:'0.0'}}, desc:'2x scale' },
    { name: 'pop_math_scale05', chain: [{type:'spherePOP',name:'src'},{type:'mathPOP',name:'math'},{type:'nullPOP',name:'out'}],
      params: {'math':{mult0:'0.5',postadd0:'0.0'}}, desc:'0.5x scale' },
    { name: 'pop_math_offset', chain: [{type:'spherePOP',name:'src'},{type:'mathPOP',name:'math'},{type:'nullPOP',name:'out'}],
      params: {'math':{mult0:'1.0',postadd0:'1.5'}}, desc:'Translate +1.5' },
    { name: 'pop_math_negate', chain: [{type:'spherePOP',name:'src'},{type:'mathPOP',name:'math'},{type:'nullPOP',name:'out'}],
      params: {'math':{mult0:'-1.0'}}, desc:'Mirror/negate' },
    { name: 'pop_math_stretch', chain: [{type:'spherePOP',name:'src'},{type:'mathPOP',name:'math'},{type:'nullPOP',name:'out'}],
      params: {'math':{mult0:'3.0',postadd0:'-1.5'}}, desc:'Stretch 3x center' },
    // ROW 2: Copy variations
    { name: 'pop_copy_line', chain: [{type:'spherePOP',name:'src'},{type:'copyPOP',name:'copy'},{type:'nullPOP',name:'out'}],
      params: {'copy':{ncy:'10',ty:'0.5'}}, desc:'Line of 10 spheres' },
    { name: 'pop_copy_grid', chain: [{type:'gridPOP',name:'grid'},{type:'copyPOP',name:'copy'},{type:'nullPOP',name:'out'}],
      params: {'copy':{ncy:'5',ty:'1.5',sx:'0.8',sy:'0.8'}}, desc:'5x5 scaled grid' },
    { name: 'pop_copy_spiral', chain: [{type:'spherePOP',name:'src'},{type:'copyPOP',name:'copy'},{type:'nullPOP',name:'out'}],
      params: {'copy':{ncy:'20',ty:'0.3',sx:'0.95',sy:'0.95',rz:'18'}}, desc:'20-copy spiral' },
    { name: 'pop_copy_tower', chain: [{type:'spherePOP',name:'src'},{type:'copyPOP',name:'copy'},{type:'nullPOP',name:'out'}],
      params: {'copy':{ncy:'15',ty:'0.4',sx:'0.9',sy:'0.9',sz:'0.9'}}, desc:'Tapering tower' },
    { name: 'pop_copy_wave', chain: [{type:'spherePOP',name:'src'},{type:'noisePOP',name:'noise'},{type:'copyPOP',name:'copy'},{type:'nullPOP',name:'out'}],
      params: {'noise':{amp0:'0.4'},'copy':{ncy:'8',ty:'0.6'}}, desc:'Noise + copy array' },
    // ROW 3: Limit + Delete
    { name: 'pop_limit_box', chain: [{type:'spherePOP',name:'src'},{type:'copyPOP',name:'copy'},{type:'limitPOP',name:'limit'},{type:'nullPOP',name:'out'}],
      params: {'copy':{ncy:'5',ty:'0.8'},'limit':{mintype0:'"Range"',maxtype0:'"Range"',min0:'-0.5',max0:'0.5'}}, desc:'Points clamped to box' },
    { name: 'pop_limit_floor', chain: [{type:'spherePOP',name:'src'},{type:'noisePOP',name:'noise'},{type:'limitPOP',name:'limit'},{type:'nullPOP',name:'out'}],
      params: {'noise':{amp0:'0.6'},'limit':{mintype0:'"Range"',min0:'-0.3'}}, desc:'Floor at y=-0.3' },
    { name: 'pop_limit_sphere', chain: [{type:'spherePOP',name:'src'},{type:'copyPOP',name:'copy'},{type:'limitPOP',name:'limit'},{type:'nullPOP',name:'out'}],
      params: {'copy':{ncy:'6',ty:'0.5'},'limit':{mintype0:'"Range"',maxtype0:'"Range"',min0:'-0.8',max0:'0.8'}}, desc:'Sphere bounds' },
    // ROW 4: Attribute + Math combos
    { name: 'pop_attr_color', chain: [{type:'spherePOP',name:'src'},{type:'attributePOP',name:'attr'},{type:'mathPOP',name:'math'},{type:'nullPOP',name:'out'}],
      params: {'attr':{attr0name:'"custom"',attr0customname:'"pointsize"',attr0value0:'0.1'},'math':{mult0:'5.0'}}, desc:'Custom point size attr' },
    { name: 'pop_attr_scale', chain: [{type:'gridPOP',name:'grid'},{type:'attributePOP',name:'attr'},{type:'copyPOP',name:'copy'},{type:'nullPOP',name:'out'}],
      params: {'attr':{attr0name:'"custom"',attr0customname:'"psize"',attr0value0:'0.2'},'copy':{ncy:'3',ty:'1.0'}}, desc:'Grid with size attr' },
    // ROW 5: Feedback + Cache
    { name: 'pop_fb_basic', chain: [{type:'spherePOP',name:'src'},{type:'feedbackPOP',name:'fb'},{type:'nullPOP',name:'out'}],
      params: {'fb':{play:'True',preroll:'2.0',inputmul:'2'}}, desc:'Basic feedback trail' },
    { name: 'pop_fb_noise', chain: [{type:'spherePOP',name:'src'},{type:'noisePOP',name:'noise'},{type:'feedbackPOP',name:'fb'},{type:'nullPOP',name:'out'}],
      params: {'noise':{amp0:'0.5'},'fb':{inputmul:'1'}}, desc:'Noise-driven feedback' },
    { name: 'pop_cache_playback', chain: [{type:'spherePOP',name:'src'},{type:'noisePOP',name:'noise'},{type:'cachePOP',name:'cache'},{type:'nullPOP',name:'out'}],
      params: {'noise':{amp0:'0.3'},'cache':{cachesize:'64',active:'True'}}, desc:'Noise cached 64 frames' },
    // ROW 6: Blend combinations
    { name: 'pop_blend_add', chain: [{type:'spherePOP',name:'src'},{type:'copyPOP',name:'copy'},{type:'blendPOP',name:'blend'},{type:'nullPOP',name:'out'}],
      params: {'copy':{ncy:'3',ty:'0.8'},'blend':{blendtype:'"add"',input0weight:'0.5'}}, desc:'Additive blend' },
    { name: 'pop_blend_max', chain: [{type:'spherePOP',name:'src'},{type:'copyPOP',name:'copy'},{type:'blendPOP',name:'blend'},{type:'nullPOP',name:'out'}],
      params: {'copy':{ncy:'4',ty:'0.6'},'blend':{blendtype:'"max"',input0weight:'0.8'}}, desc:'Max blend' },
    // ROW 7: Multi-operator chains
    { name: 'pop_multi_deform', chain: [{type:'spherePOP',name:'src'},{type:'noisePOP',name:'noise'},{type:'mathPOP',name:'math'},{type:'limitPOP',name:'limit'},{type:'nullPOP',name:'out'}],
      params: {'noise':{amp0:'0.5',period:'1.5'},'math':{mult0:'1.5'},'limit':{mintype0:'"Range"',maxtype0:'"Range"',min0:'-1.2',max0:'1.2'}}, desc:'Noise→math→limit chain' },
    { name: 'pop_multi_instancing', chain: [{type:'gridPOP',name:'grid'},{type:'attributePOP',name:'attr'},{type:'copyPOP',name:'copy'},{type:'blendPOP',name:'blend'},{type:'nullPOP',name:'out'}],
      params: {'attr':{attr0customname:'"scale"',attr0value0:'0.2'},'copy':{ncy:'4',ty:'1.0'},'blend':{blendtype:'"add"'}}, desc:'Grid→attr→copy→blend' },
    { name: 'pop_multi_wave', chain: [{type:'gridPOP',name:'grid'},{type:'noisePOP',name:'noise'},{type:'copyPOP',name:'copy'},{type:'limitPOP',name:'limit'},{type:'nullPOP',name:'out'}],
      params: {'noise':{amp0:'0.4',period:'2.0'},'copy':{ncy:'3',ty:'0.8'},'limit':{mintype0:'"Range"',maxtype0:'"Range"',min0:'-1.0',max0:'1.0'}}, desc:'Grid→noise→copy→limit' },
    { name: 'pop_multi_feedback', chain: [{type:'spherePOP',name:'src'},{type:'noisePOP',name:'noise'},{type:'feedbackPOP',name:'fb'},{type:'cachePOP',name:'cache'},{type:'nullPOP',name:'out'}],
      params: {'noise':{amp0:'0.4'},'fb':{play:'True',preroll:'1.0',inputmul:'2'},'cache':{cachesize:'128'}}, desc:'Feedback→cache 128 frames' },
    { name: 'pop_multi_complex', chain: [{type:'gridPOP',name:'grid'},{type:'noisePOP',name:'noise'},{type:'attributePOP',name:'attr'},{type:'mathPOP',name:'math'},{type:'copyPOP',name:'copy'},{type:'blendPOP',name:'blend'},{type:'limitPOP',name:'limit'},{type:'nullPOP',name:'out'}],
      params: {'noise':{amp0:'0.5',period:'1.0'},'attr':{attr0customname:'"s"',attr0value0:'0.3'},'math':{mult0:'2.0'},'copy':{ncy:'3',ty:'1.0'},'blend':{blendtype:'"add"'},'limit':{mintype0:'"Range"',maxtype0:'"Range"',min0:'-2.0',max0:'2.0'}}, desc:'8-op mega chain' },
  ];

  let ok = 0, fail = 0;
  for (let i = 0; i < systems.length; i++) {
    const s = systems[i];
    const row = Math.floor(i / 5);
    const result = await makeSystem(s.name, { chain: s.chain, params: s.params }, row);
    console.log(`[${i+1}/${systems.length}] ${s.name}: ${result.ok ? 'OK' : 'ERR'} - ${s.desc}`);
    if (result.ok) ok++; else fail++;
    if (result.issues > 0) console.log(`       issues: ${result.issues}`);
  }

  console.log(`\n=== RESULTADO: ${ok} OK, ${fail} FAIL de ${systems.length} ===`);
  
  // Final verification
  console.log('\n=== VERIFICACION GLOBAL ===');
  for (const s of systems) {
    const h = await client.healthcheck(P + '/' + s.name, true);
    const e = h.issues?.filter(i => !i.path.includes('_compute') && !i.path.includes('glsl_shader_info'));
    const sysOk = h.ok || (e && e.length === 0);
    console.log('  ' + (sysOk ? 'OK' : 'ISSUES') + ' ' + s.name);
  }
}
test().catch(e => console.log('FATAL:', e.message));
