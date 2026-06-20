import { TDClient } from '../../api/dist/index.js';
const client = new TDClient();

async function test() {
  const glsl = '/td_tests_container/td_glsl_tests/glsl_basic/glsl_shader';
  
  // Set computedat back
  const src = '/td_tests_container/td_glsl_tests/glsl_basic/glsl_shader_src';
  await client.execute('import json\nt = op("' + glsl + '")\nt.par.computedat = op("' + src + '")\nprint("ok")');
  
  // Try to get detailed compile error by reading the shader and checking
  // In TD, glslPOP errors are also accessible through the operator's dat child
  const children = await client.execute('import json\nt = op("' + glsl + '")\nprint(json.dumps({"c":[{"n":c.name,"t":c.OPType} for c in t.children]}))');
  console.log('children:', children.stdout);
  
  // Try a MUCH simpler approach - write the code directly to the default 'glsl1' that TD might auto-create
  // or write via the 'bytecode' DAT pattern
  // First check if there's any text DAT anywhere under this path
  const ls = await client.execute('import json\nimport os\n# Check /sys for glsl info\ntry:\n    path = op("' + glsl + '").path\n    print(json.dumps({"path":path}))\nexcept Exception as e:\n    print(json.dumps({"error":str(e)}))');
  console.log('path check:', ls.stdout);
  
  // Let's try using TD's built-in GLSL Editor approach:
  // Write code using op().text (the internal DAT)
  // Sometimes glslPOP uses 'glsl1' or the operator name + '1'
  const glslName = 'glsl_shader1';
  const tryPath = glsl + '/' + glslName;
  const check1 = await client.execute('import json\ntry:\n    t = op("' + tryPath + '")\n    print(json.dumps({"found":True,"text":t.text[:100]}))\nexcept:\n    print(json.dumps({"found":False}))');
  console.log('try ' + glslName + ':', check1.stdout);
  
  // Another name pattern
  for (const name of ['glsl1', 'glsl_shader1', 'shader1', 'code1', 'text1', 'dat1']) {
    const p = glsl + '/' + name;
    const r = await client.execute('import json\ntry:\n    t = op("' + p + '")\n    print(json.dumps({"name":' + JSON.stringify(name) + ',"found":True,"len":len(t.text)}))\nexcept:\n    pass');
    if (r.success && r.stdout) {
      console.log('found child:', r.stdout);
    }
  }
}
test().catch(e => console.log('ERR:', e.message));
