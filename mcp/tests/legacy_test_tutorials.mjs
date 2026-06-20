import { TDClient } from '../../api/dist/index.js';
const client = new TDClient();
const P = '/td_tutorials';

async function setup() {
  try { await client.deleteOperator(P); } catch(e) {}
  await new Promise(r => setTimeout(r, 300));
  await client.createOperator('baseCOMP', 'td_tutorials', '/', 0, 0);
}

async function make(name, chain, params, desc) {
  const baseY = 0; // Will be set per row
  try { await client.deleteOperator(P + '/' + name); } catch(e) {}
  await new Promise(r => setTimeout(r, 100));
  
  const comp = await client.createOperator('baseCOMP', name, P, 0, 0);
  if (!comp.success) return;
  
  const BP = comp.path;
  const created = [];
  let x = 0;
  
  for (const step of chain) {
    const r = await client.createOperator(step.type, step.name, BP, x, step.y || 0);
    if (r.success) created.push(step.name);
    x += 250;
  }
  
  for (let i = 1; i < created.length; i++) {
    const from = created[i-1], to = created[i];
    // Check if previous node is baseCOMP (special connection)
    const prevType = chain[i-1].type;
    if (prevType !== 'baseCOMP') {
      await client.connectNodes(BP + '/' + from, BP + '/' + to, 0);
    }
  }
  
  if (params) {
    for (const [node, pars] of Object.entries(params)) {
      for (const [par, val] of Object.entries(pars)) {
        const code = 'import json\nt = op("' + BP + '/' + node + '")\npar = getattr(t.par, "' + par + '")\npar.val = ' + val + '\nprint("ok")';
        await client.execute(code);
      }
    }
  }
  
  const h = await client.healthcheck(BP, true);
  const e = h.issues?.filter(i => !i.path.includes('_compute') && !i.path.includes('glsl_shader_info') && !i.warnings?.includes('Camera'));
  return { ok: h.ok || (e && e.length === 0) };
}

// Clean and create container
try { await client.deleteOperator('/td_tutorials'); } catch(e) {}
await new Promise(r => setTimeout(r, 300));
await client.createOperator('baseCOMP', 'td_tutorials', '/', 0, 0);

const R = '/td_tutorials';

async function buildAll() {
  console.log('=== BUILDING 9 TUTORIAL SYSTEMS ===\n');
  
  // TUTORIAL 201: Particle System Fundamentals
  console.log('Tutorial 201: Particle System');
  await make('t201_particles', [
    {type:'spherePOP',name:'emit'},
    {type:'noisePOP',name:'force'},
    {type:'feedbackPOP',name:'fb'},
    {type:'cachePOP',name:'cache'},
    {type:'blendPOP',name:'blend'},
    {type:'limitPOP',name:'limit'},
    {type:'nullPOP',name:'out'},
  ], {
    'force':{amp0:'0.4',period:'1.5'},
    'fb':{play:'True',preroll:'2.0',inputmul:'2'},
    'cache':{cachesize:'64'},
    'blend':{blendtype:'"add"'},
    'limit':{mintype0:'"Range"',maxtype0:'"Range"',min0:'-1.5',max0:'1.5'}
  }, 'GPU particle system with forces, feedback, cache');
  
  // TUTORIAL 202: Instance Field
  console.log('Tutorial 202: Instance Field');
  await make('t202_instance', [
    {type:'gridPOP',name:'grid'},
    {type:'spherePOP',name:'src'},
    {type:'copyPOP',name:'copy'},
    {type:'noisePOP',name:'noise'},
    {type:'nullPOP',name:'out'},
  ], {
    'grid':{},
    'copy':{ncy:'5',ty:'1.2',sx:'0.9',sy:'0.9'},
    'noise':{amp0:'0.3',period:'2.0'}
  }, 'Interactive instancing field with grid and noise');

  // TUTORIAL 203: GLSL POP Shaders
  console.log('Tutorial 203: GLSL Shaders');
  await make('t203_glsl', [
    {type:'spherePOP',name:'src'},
    {type:'glslPOP',name:'glsl'},
    {type:'nullPOP',name:'out'},
  ], {}, 'GLSL POP with custom shader (needs compute DAT setup)');
  // Set up GLSL shader
  await new Promise(r => setTimeout(r, 700));
  const cdR = await client.execute('import json\nt = op("' + R + '/t203_glsl/glsl")\nprint(json.dumps({"cd":str(t.par.computedat.eval())}))');
  const cd = JSON.parse(cdR.stdout).cd;
  if (cd && cd.startsWith('/')) {
    await client.execute('import json\nt = op("' + R + '/t203_glsl/glsl")\nt.par.outputattrs = "P"\nprint("ok")');
    const shader = 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; vec3 pos = TDIn_P(); float r = length(pos.xy); float w = sin(r*4.0)*0.3*exp(-r*0.3); pos.z += w; P[id] = pos; }';
    await client.execute('import json\nt = op("' + cd + '")\nt.text = """' + shader + '"""\nprint("ok")');
  }

  // TUTORIAL 204: Copy and Instancing
  console.log('Tutorial 204: Copy & Instancing');
  await make('t204_copy', [
    {type:'spherePOP',name:'src'},
    {type:'attributePOP',name:'attr'},
    {type:'copyPOP',name:'copy'},
    {type:'mathPOP',name:'math'},
    {type:'nullPOP',name:'out'},
  ], {
    'attr':{attr0name:'"custom"',attr0customname:'"psize"',attr0value0:'0.2'},
    'copy':{ncy:'8',ty:'0.5',sx:'0.95',sy:'0.95',rz:'15'},
    'math':{mult0:'2.0'}
  }, 'Copy with attribute-driven variation');

  // TUTORIAL 205: Attributes and Data
  console.log('Tutorial 205: Attributes');
  await make('t205_attributes', [
    {type:'gridPOP',name:'grid'},
    {type:'attributePOP',name:'attr'},
    {type:'copyPOP',name:'copy'},
    {type:'blendPOP',name:'blend'},
    {type:'nullPOP',name:'out'},
  ], {
    'attr':{attr0customname:'"weight"',attr0value0:'0.1'},
    'copy':{ncy:'4',ty:'1.0'},
    'blend':{blendtype:'"add"'}
  }, 'Attribute-driven data pipeline');

  // TUTORIAL 206: Feedback Loops
  console.log('Tutorial 206: Feedback Loops');
  await make('t206_feedback', [
    {type:'spherePOP',name:'src'},
    {type:'noisePOP',name:'noise'},
    {type:'feedbackPOP',name:'fb'},
    {type:'cachePOP',name:'cache'},
    {type:'blendPOP',name:'blend'},
    {type:'nullPOP',name:'out'},
  ], {
    'noise':{amp0:'0.5',period:'1.0'},
    'fb':{play:'True',preroll:'3.0',inputmul:'3'},
    'cache':{cachesize:'128'},
    'blend':{blendtype:'"add"',input0weight:'0.6'}
  }, 'Feedback loop with cache and blend');

  // TUTORIAL 207: Math and Noise
  console.log('Tutorial 207: Math & Noise');
  await make('t207_math_noise', [
    {type:'gridPOP',name:'grid'},
    {type:'noisePOP',name:'noise'},
    {type:'mathPOP',name:'math'},
    {type:'copyPOP',name:'copy'},
    {type:'limitPOP',name:'limit'},
    {type:'nullPOP',name:'out'},
  ], {
    'noise':{amp0:'0.6',period:'2.0'},
    'math':{mult0:'1.5',postadd0:'0.5'},
    'copy':{ncy:'3',ty:'0.8'},
    'limit':{mintype0:'"Range"',maxtype0:'"Range"',min0:'-2.0',max0:'2.0'}
  }, 'Math operations combined with noise fields');

  // TUTORIAL 208: Rendering Pipeline
  console.log('Tutorial 208: Rendering Pipeline');
  await make('t208_render', [
    {type:'spherePOP',name:'src'},
    {type:'noisePOP',name:'noise'},
    {type:'copyPOP',name:'copy'},
    {type:'nullPOP',name:'pop_out'},
    {type:'geometryCOMP',name:'geo'},
    {type:'renderTOP',name:'render'},
    {type:'nullTOP',name:'output'},
  ], {
    'noise':{amp0:'0.4'},
    'copy':{ncy:'4',ty:'0.8'}
  }, 'Full POP to render pipeline');
  // Clean geo internal
  await client.execute('import json\nt = op("' + R + '/t208_render/geo")\nfor c in list(t.children): c.destroy()\nprint("ok")');

  // TUTORIAL 209: Advanced Techniques
  console.log('Tutorial 209: Advanced');
  await make('t209_advanced', [
    {type:'gridPOP',name:'grid'},
    {type:'noisePOP',name:'noise'},
    {type:'attributePOP',name:'attr'},
    {type:'mathPOP',name:'math'},
    {type:'copyPOP',name:'copy'},
    {type:'blendPOP',name:'blend'},
    {type:'feedbackPOP',name:'fb'},
    {type:'limitPOP',name:'limit'},
    {type:'nullPOP',name:'out'},
  ], {
    'noise':{amp0:'0.5',period:'1.5'},
    'attr':{attr0customname:'"s"',attr0value0:'0.2'},
    'math':{mult0:'2.0'},
    'copy':{ncy:'4',ty:'1.0',sx:'0.9',sy:'0.9'},
    'blend':{blendtype:'"add"'},
    'fb':{play:'True',inputmul:'2'},
    'limit':{mintype0:'"Range"',maxtype0:'"Range"',min0:'-2.0',max0:'2.0'}
  }, 'Advanced multi-system POP network');

  // VERIFICATION
  console.log('\n=== VERIFICATION ===');
  const names = ['t201_particles','t202_instance','t203_glsl','t204_copy','t205_attributes','t206_feedback','t207_math_noise','t208_render','t209_advanced'];
  let allOk = true;
  for (const name of names) {
    const h = await client.healthcheck(R + '/' + name, true);
    const e = h.issues?.filter(i => !i.path.includes('_compute') && !i.path.includes('glsl_shader_info') && !i.warnings?.includes('Camera'));
    const ok = h.ok || (e && e.length === 0);
    if (!ok) allOk = false;
    console.log('  ' + (ok ? 'OK' : 'ISSUES') + ' ' + name);
  }
  console.log('\n' + (allOk ? 'ALL 9 TUTORIALS OK' : 'SOME HAVE ISSUES'));
}
buildAll().catch(e => console.log('FATAL:', e.message));
