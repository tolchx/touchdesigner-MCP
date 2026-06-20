import { TDClient } from '../../api/dist/index.js';
const client = new TDClient();

async function test() {
  const comp = 'glsl_basic';
  const base = '/td_tests_container/td_glsl_tests';
  
  // 1. Create textDAT outside
  const r1 = await client.createOperator('textDAT', 'glsl_shader_src', base + '/' + comp, 0, -100);
  console.log('create DAT:', r1.success, r1.path);
  
  // 2. Write the simplest possible shader
  const shader = '#version 330\nuniform float uTime;\nlayout(location = 0) in vec3 P;\nlayout(location = 0) out vec3 outP;\nvoid main() { outP = P + vec3(sin(uTime*2.0+P.x)*0.2, cos(uTime*1.3+P.y)*0.2, 0.0); }';
  const code = 'import json\nt = op("' + base + '/' + comp + '/glsl_shader_src")\nt.text = """' + shader + '"""\nprint(json.dumps({"len":len(t.text)}))';
  const r2 = await client.execute(code);
  console.log('write shader:', r2.success);
  
  // 3. Set computedat
  const r3 = await client.execute('import json\nt = op("' + base + '/' + comp + '/glsl_shader")\nt.par.computedat = op("' + base + '/' + comp + '/glsl_shader_src")\nprint(json.dumps({"set":True}))');
  console.log('set computedat:', r3.success);
  
  // 4. Detailed health check
  const h = await client.healthcheck(base + '/' + comp, true);
  console.log('\nHealth issues:');
  if (h.issues) {
    for (const i of h.issues) {
      console.log('  ' + i.path + ':');
      console.log('    errors:', i.errors?.substring(0, 300) || '(none)');
      console.log('    warnings:', i.warnings?.substring(0, 300) || '(none)');
    }
  }
  
  // 5. Try cooking the shader
  const r5 = await client.execute('import json\nt = op("' + base + '/' + comp + '/glsl_shader")\ntry:\n    t.cook(force=True)\n    print(json.dumps({"cooked":True,"errors":str(t.errors(recurse=False))[:200]}))\nexcept Exception as e:\n    print(json.dumps({"error":str(e)}))');
  console.log('cook result:', JSON.stringify(r5));
}
test().catch(e => console.log('ERR:', e.message));
