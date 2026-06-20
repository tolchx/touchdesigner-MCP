import { TDClient } from '../../api/dist/index.js';
const client = new TDClient();

async function test() {
  const base = '/td_tests_container/td_glsl_tests';
  
  // Create a FRESH glslPOP and read its auto-generated compute DAT
  console.log('=== CREATING FRESH GLSL POP ===');
  const createR = await client.execute('import json\nparent = op("' + base + '/glsl_basic")\nfresh = parent.create(glslPOP, "fresh_test")\nprint(json.dumps({"path":fresh.path}))');
  const freshPath = JSON.parse(createR.stdout).path;
  
  // Wait a moment for TD to initialize
  await new Promise(r => setTimeout(r, 300));
  
  // Read the auto-generated child DAT name
  const childR = await client.execute('import json\nt = op("' + freshPath + '")\n# List ALL children, including hidden ones\nchildren = []\ntry: children = [{"n":c.name,"t":c.OPType,"p":c.path} for c in t.children]\nexcept: pass\n# Also check computedat\ncd = str(t.par.computedat.eval())\nprint(json.dumps({"children":children,"computedat":cd}))');
  const data = JSON.parse(childR.stdout);
  console.log('fresh glslPOP:', JSON.stringify(data, null, 2));
  
  // If computedat points to a child DAT, read it
  if (data.computedat && data.computedat.startsWith('/')) {
    const readR = await client.execute('import json\nt = op("' + data.computedat + '")\nprint(json.dumps({"exists":True,"text":t.text,"len":len(t.text)}))');
    const shader = JSON.parse(readR.stdout);
    console.log('\nDEFAULT SHADER (' + shader.len + ' chars):');
    console.log(shader.text);
    
    // Now try modifying it: add P displacement
    const newShader = [
      'void main() {',
      '    const uint id = TDIndex();',
      '    if(id >= TDNumElements()) return;',
      '    P[id] += vec3(snoise(P[id] * 2.0 + TDTime() * 0.3)) * 0.3;',
      '}'
    ].join('\n');
    
    const w = await client.execute('import json\nt = op("' + data.computedat + '")\nt.text = """' + newShader + '"""\nprint(json.dumps({"written":len(t.text)}))');
    console.log('\nwrite custom shader:', w.success);
    
    // Connect source and check
    await client.connectNodes(base + '/glsl_basic/source', freshPath, 0);
    
    const h = await client.healthcheck(freshPath, false);
    console.log('health:', h.ok ? 'OK' : 'ISSUE');
    if (!h.ok && h.issues) {
      for (const i of h.issues) {
        console.log('  ' + i.path + ': ' + (i.errors || i.warnings || '').substring(0, 300));
      }
    }
  }
}
test().catch(e => console.log('ERR:', e.message));
