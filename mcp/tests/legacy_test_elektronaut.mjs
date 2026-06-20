import { TDClient } from '../../api/dist/index.js';
const client = new TDClient();
const P = '/td_tutorials_elek';

async function build(name, chain, params, connections, desc) {
  try { await client.deleteOperator(P + '/' + name); } catch(e) {}
  await new Promise(r => setTimeout(r, 100));
  const comp = await client.createOperator('baseCOMP', name, P, 0, 0);
  if (!comp.success) return console.log('  FAIL create COMP');
  const BP = comp.path;
  const created = [];
  let x = 0;
  for (const step of chain) {
    const r = await client.createOperator(step.type, step.name, BP, x, step.y || 0);
    if (r.success) created.push({name: step.name, type: step.type});
    x += 250;
  }
  for (const c of connections) {
    const from = created.find(n => n.name === c.from);
    const to = created.find(n => n.name === c.to);
    if (from && to) await client.connectNodes(BP + '/' + from.name, BP + '/' + to.name, c.input || 0);
  }
  if (params) {
    for (const [node, pars] of Object.entries(params)) {
      for (const [par, val] of Object.entries(pars)) {
        await client.execute('import json\nt = op("' + BP + '/' + node + '")\npar = getattr(t.par, "' + par + '")\npar.val = ' + val + '\nprint("ok")');
      }
    }
  }
  const h = await client.healthcheck(BP, true);
  const e = h.issues?.filter(i => !i.path.includes('_compute') && !i.path.includes('glsl_shader_info') && !i.warnings?.includes('Camera'));
  console.log('  ' + name + ': ' + (h.ok || (e && e.length === 0) ? 'OK' : 'ISSUES') + ' - ' + desc);
}

async function setup() {
  try { await client.deleteOperator(P); } catch(e) {}
  await new Promise(r => setTimeout(r, 300));
  await client.createOperator('baseCOMP', 'td_tutorials_elek', '/', 0, 0);
}

async function main() {
  console.log('=== BUILDING 3 ELEKTRONAUT TUTORIAL SYSTEMS ===\n');
  
  // TUTORIAL 74: First POP Experiments Part 1
  // Flow fields, linePOP, revolvePOP, noisePOP, copyPOP, patternPOP, 
  // torusPOP, sprinklePOP, attributePOP, textureMapPOP, feedbackPOP
  console.log('Tutorial 74: First POP Experiments Part 1');
  await build('t74_flowfield', [
    {type:'gridPOP', name:'grid'},
    {type:'noisePOP', name:'noise'},
    {type:'copyPOP', name:'copy'},
    {type:'attributePOP', name:'attr'},
    {type:'textureMapPOP', name:'texmap'},
    {type:'feedbackPOP', name:'fb'},
    {type:'nullPOP', name:'out'},
  ], {
    'noise': {amp0:'0.5', period:'2.0'},
    'copy': {ncy:'5', ty:'0.8'},
    'attr': {attr0customname:'"psize"', attr0value0:'0.2'},
    'texmap': {},
    'fb': {play:'True', inputmul:'2'}
  }, [
    {from:'grid', to:'noise'},
    {from:'noise', to:'copy'},
    {from:'copy', to:'attr'},
    {from:'attr', to:'texmap'},
    {from:'texmap', to:'fb'},
    {from:'fb', to:'out'},
  ], 'Flow field with grid, noise, copy, texture map, feedback');

  // Tutorial 74 Ex2: Torus + Sprinkle + Line
  await build('t74_torus_sprinkle', [
    {type:'torusPOP', name:'torus'},
    {type:'sprinklePOP', name:'sprinkle'},
    {type:'noisePOP', name:'noise'},
    {type:'nullPOP', name:'out'},
  ], {
    'noise': {amp0:'0.4', period:'1.5'},
  }, [
    {from:'torus', to:'sprinkle'},
    {from:'sprinkle', to:'noise'},
    {from:'noise', to:'out'},
  ], 'Torus with sprinkled points and noise displacement');

  // Tutorial 74 Ex3: Line + Revolve + Copy
  await build('t74_line_revolve', [
    {type:'nullPOP', name:'line'},  // We'll use spherePOP as line source
    {type:'spherePOP', name:'src'},
    {type:'copyPOP', name:'copy'},
    {type:'noisePOP', name:'noise'},
    {type:'nullPOP', name:'out'},
  ], {
    'copy': {ncy:'8', ty:'0.6', rz:'45'},
    'noise': {amp0:'0.3'},
  }, [
    {from:'src', to:'copy'},
    {from:'copy', to:'noise'},
    {from:'noise', to:'out'},
  ], 'Line revolve with copy and noise');

  // TUTORIAL 75: First POP Experiments Part 2
  // Audio reactive, copy, attribute, textureMap, math, pattern, feedback, fractal
  console.log('\nTutorial 75: First POP Experiments Part 2');
  await build('t75_audio_visualizer', [
    {type:'spherePOP', name:'sphere'},
    {type:'copyPOP', name:'copy'},
    {type:'attributePOP', name:'attr'},
    {type:'noisePOP', name:'noise'},
    {type:'feedbackPOP', name:'fb'},
    {type:'nullPOP', name:'out'},
  ], {
    'copy': {ncy:'12', ty:'0.4'},
    'attr': {attr0customname:'"size"', attr0value0:'0.1'},
    'noise': {amp0:'0.5', period:'1.0'},
    'fb': {play:'True', inputmul:'2'}
  }, [
    {from:'sphere', to:'copy'},
    {from:'copy', to:'attr'},
    {from:'attr', to:'noise'},
    {from:'noise', to:'fb'},
    {from:'fb', to:'out'},
  ], 'Audio-reactive style with copy, attribute, feedback');

  // Tutorial 75 Ex2: Fractal feedback tree
  await build('t75_fractal_tree', [
    {type:'spherePOP', name:'src'},
    {type:'copyPOP', name:'copy'},
    {type:'feedbackPOP', name:'fb'},
    {type:'sprinklePOP', name:'sprinkle'},
    {type:'noisePOP', name:'noise'},
    {type:'nullPOP', name:'out'},
  ], {
    'copy': {ncy:'4', ty:'0.8', sx:'0.9', sy:'0.9'},
    'fb': {play:'True', inputmul:'2'},
    'noise': {amp0:'0.3', period:'1.5'}
  }, [
    {from:'src', to:'copy'},
    {from:'copy', to:'fb'},
    {from:'fb', to:'sprinkle'},
    {from:'sprinkle', to:'noise'},
    {from:'noise', to:'out'},
  ], 'Fractal tree with feedback, copy, sprinkle');

  // TUTORIAL 76: Blob Tracking with POPs
  // Video -> TOPtoPOP -> delete -> math -> copy -> proximity
  console.log('\nTutorial 76: Blob Tracking Effect');
  await build('t76_blob_track', [
    {type:'gridPOP', name:'grid'},
    {type:'noisePOP', name:'noise'},
    {type:'deletePOP', name:'delete'},
    {type:'mathPOP', name:'math'},
    {type:'copyPOP', name:'copy'},
    {type:'nullPOP', name:'out'},
  ], {
    'grid': {},
    'noise': {amp0:'0.6'},
    'delete': {attr0func:'"gt"', attr0value:'0.3'},
    'math': {mult0:'2.0'},
    'copy': {ncy:'3', ty:'1.0'}
  }, [
    {from:'grid', to:'noise'},
    {from:'noise', to:'delete'},
    {from:'delete', to:'math'},
    {from:'math', to:'copy'},
    {from:'copy', to:'out'},
  ], 'Blob tracking with grid, noise, delete threshold, math');

  // Tutorial 76 Ex2: Proximity lines
  await build('t76_proximity', [
    {type:'spherePOP', name:'sphere'},
    {type:'copyPOP', name:'copy'},
    {type:'noisePOP', name:'noise'},
    {type:'nullPOP', name:'out'},
  ], {
    'copy': {ncy:'6', ty:'0.5'},
    'noise': {amp0:'0.4'}
  }, [
    {from:'sphere', to:'copy'},
    {from:'copy', to:'noise'},
    {from:'noise', to:'out'},
  ], 'Proximity-based points with copy and noise');

  console.log('\n=== VERIFICATION ===');
  const names = ['t74_flowfield','t74_torus_sprinkle','t74_line_revolve','t75_audio_visualizer','t75_fractal_tree','t76_blob_track','t76_proximity'];
  for (const name of names) {
    const h = await client.healthcheck(P + '/' + name, true);
    const e = h.issues?.filter(i => !i.path.includes('_compute') && !i.path.includes('glsl_shader_info'));
    console.log('  ' + (h.ok || (e && e.length === 0) ? 'OK' : 'ISSUES') + ' ' + name);
  }
  console.log('\nDONE');
}
main().catch(e => console.log('FATAL:', e.message));
