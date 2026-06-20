import { TDClient } from '../../api/dist/index.js';
const client = new TDClient();

async function test() {
  const p = '/td_tests_container/td_glsl_tests/glsl_basic/glsl_shader';
  
  // Get par names
  const code = 'import json\nt = op("' + p + '")\nprint(json.dumps([p.name for p in t.pars()]))';
  const r = await client.execute(code);
  if (r.success) {
    const pars = JSON.parse(r.stdout);
    console.log('GLSL POP parameters:', pars);
    
    // Look for text-related
    const relevant = pars.filter(n => n.includes('text') || n.includes('code') || n.includes('glsl') || n.includes('shader') || n.includes('src') || n.includes('source'));
    console.log('Relevant:', relevant);
  } else {
    console.log('FAIL:', r.error?.message);
  }
}
test().catch(e => console.log('ERR:', e.message));
