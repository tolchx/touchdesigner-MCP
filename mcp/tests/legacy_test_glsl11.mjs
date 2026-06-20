import { TDClient } from '../../api/dist/index.js';
const client = new TDClient();

async function test() {
  const glsl = '/td_tests_container/td_glsl_tests/glsl_basic/glsl_shader';
  
  // Try reading errors directly
  const r = await client.execute('import json\nt = op("' + glsl + '")\nprint(json.dumps({"errors":t.errors(recurse=False),"cookErrors":str(t.cookErrors) if hasattr(t,"cookErrors") else "no"}))');
  console.log('errors:', r.stdout);
  
  // Try a glslPOP without computedat (default shader)
  const r2 = await client.execute('import json\nt = op("' + glsl + '")\nt.par.computedat = None\nprint(json.dumps({"cleared":True}))');
  console.log('clear computedat:', r2.success);
  
  const h = await client.healthcheck('/td_tests_container/td_glsl_tests/glsl_basic', true);
  console.log('default shader health:', h.issues?.length > 0 ? h.issues[0].errors?.substring(0,300) : 'OK');
  
  // Read the 'glsl1' default DAT that TD might create automatically
  const r3 = await client.execute('import json\nt = op("' + glsl + '")\ntry:\n    t2 = op("' + glsl + '/glsl1")\n    print(json.dumps({"found":t2.path,"text":t2.text[:100]}))\nexcept:\n    print(json.dumps({"found":False}))');
  console.log('glsl1 child:', r3.stdout);
}
test().catch(e => console.log('ERR:', e.message));
