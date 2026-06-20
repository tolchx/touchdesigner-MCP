import { TDClient } from '../../api/dist/index.js';
const client = new TDClient();

async function test() {
  const comp = 'glsl_basic';
  const base = '/td_tests_container/td_glsl_tests';
  
  // Check if there's an info DAT inside glslPOP
  const info = await client.execute('import json\nt = op("' + base + '/' + comp + '/glsl_shader")\nprint(json.dumps({"dir":[x for x in dir(t) if "info" in x.lower() or "error" in x.lower() or "log" in x.lower()][:10]}))');
  console.log('info attrs:', info.stdout);
  
  // Try the correct GLSL POP syntax for this build
  // TD 2025+ uses different attribute locations
  // Let's try a minimal test first
  const testShader = [
    '#version 330',
    'void main() { }'
  ].join('\n');
  
  const write = await client.execute('import json\nt = op("' + base + '/' + comp + '/glsl_shader_src")\nt.text = """' + testShader + '"""\nprint(json.dumps({"len":len(t.text)}))');
  console.log('write minimal shader:', write.success);
  
  const health = await client.healthcheck(base + '/' + comp, true);
  console.log('minimal shader health:', health.issues?.length > 0 ? health.issues[0].errors?.substring(0,200) : 'OK');
}
test().catch(e => console.log('ERR:', e.message));
