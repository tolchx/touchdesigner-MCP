import { TDClient } from '../../api/dist/index.js';
const client = new TDClient();

async function test() {
  const base = '/td_tests_container/td_glsl_tests/glsl_basic';
  const glsl = base + '/glsl_shader';
  const src = base + '/glsl_shader_src';
  
  // Check what compute/vertex mode parameters exist
  const r1 = await client.execute('import json\nt = op("' + glsl + '")\nmodepars = [p.name for p in t.pars() if "mode" in p.name.lower() or "type" in p.name.lower() or "compute" in p.name.lower() or "vertex" in p.name.lower() or "shader" in p.name.lower()]\nprint(json.dumps(modepars))');
  console.log('mode-related pars:', r1.stdout);
  
  // Check current computedat value
  const r2 = await client.execute('import json\nt = op("' + glsl + '")\nprint(json.dumps({"computedat":str(t.par.computedat.eval()),"numelems":t.par.numelems.eval(),"outputattrs":t.par.outputattrs.eval()}))');
  console.log('current values:', r2.stdout);
  
  // Try with 'main' but using POP-specific variables that TD injects
  // In TD, glslPOP works with 'main' function that accesses P, v, Cd etc.
  // But maybe it needs the 'compute' layout
  const computeShader = [
    '#version 430',
    'layout(local_size_x = 64) in;',
    'void main() { }'
  ].join('\n');
  
  const w1 = await client.execute('import json\nt = op("' + src + '")\nt.text = """' + computeShader + '"""\nprint(json.dumps({"len":len(t.text)}))');
  console.log('write compute shader:', w1.success);
  
  const h1 = await client.healthcheck(base, true);
  console.log('compute shader health:', h1.issues?.length > 0 ? h1.issues[0].errors?.substring(0,200) : 'OK');
}
test().catch(e => console.log('ERR:', e.message));
