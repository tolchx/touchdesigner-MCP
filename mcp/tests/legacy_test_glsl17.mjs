import { TDClient } from '../../api/dist/index.js';
const client = new TDClient();

async function test() {
  // Create a fresh glslPOP and read its auto-generated shader
  const r1 = await client.execute('import json\nparent = op("/td_tests_container/td_glsl_tests/glsl_basic")\nfresh = parent.create(glslPOP, "read_default")\nprint(json.dumps({"path":fresh.path}))');
  const freshPath = JSON.parse(r1.stdout).path;
  
  // Wait a frame for TD to initialize
  await new Promise(r => setTimeout(r, 500));
  
  // Find the auto-generated compute DAT
  const r2 = await client.execute('import json\nt = op("' + freshPath + '")\ncd = str(t.par.computedat.eval())\nprint(json.dumps({"computedat":cd}))');
  const cd = JSON.parse(r2.stdout).computedat;
  console.log('computedat:', cd);
  
  // Read the default compute shader
  if (cd && cd.startsWith('/')) {
    const r3 = await client.execute('import json\nt = op("' + cd + '")\nprint(json.dumps({"text":t.text,"len":len(t.text)}))');
    const shader = JSON.parse(r3.stdout);
    console.log('DEFAULT SHADER (' + shader.len + ' chars):');
    console.log(shader.text);
  } else {
    console.log('computedat not a path:', cd);
    
    // Try finding the child DAT by name pattern
    const r4 = await client.execute('import json\nt = op("' + freshPath + '")\n# Check all children\nprint(json.dumps({"children":[c.path for c in t.children]}))');
    console.log('children:', r4.stdout);
  }
}
test().catch(e => console.log('ERR:', e.message));
