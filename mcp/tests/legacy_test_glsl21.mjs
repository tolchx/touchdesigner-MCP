import { TDClient } from '../../api/dist/index.js';
const client = new TDClient();

async function test() {
  const base = '/td_tests_container/td_glsl_tests';
  const comp = 'glsl_color';
  const glsl = base + '/' + comp + '/glsl_shader';
  
  // Get the computedat path and read error info
  const r = await client.execute('import json\nt = op("' + glsl + '")\ncd = str(t.par.computedat.eval())\n# Try to find error text anywhere\n# The glslPOP might have an info DAT after compile failure\nprint(json.dumps({"computedat":cd,"children":[c.path for c in t.children]}))');
  console.log('glslPOP info:', r.stdout);
  
  // Read the compute DAT to see what was written
  const cd = '/td_tests_container/td_glsl_tests/glsl_color/glsl_shader_src';
  const readCode = await client.execute('import json\nt = op("' + cd + '")\nprint(json.dumps({"text":t.text}))');
  console.log('current shader text:', JSON.parse(readCode.stdout).text?.substring(0, 200));
  
  // Try with a much simpler shader: no P, no Cd, just a pass-through
  const simple = 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; }';
  const w = await client.execute('import json\nt = op("' + cd + '")\nt.text = """' + simple + '"""\nprint(json.dumps({"len":len(t.text)}))');
  console.log('write simple:', w.success);
  
  const h = await client.healthcheck(base + '/' + comp, true);
  console.log('simple health:', h.ok ? 'OK' : 'ISSUES');
  if (!h.ok && h.issues) {
    for (const i of h.issues) console.log('  ' + i.path + ': ' + (i.errors || '').substring(0,300));
  }
}
test().catch(e => console.log('ERR:', e.message));
