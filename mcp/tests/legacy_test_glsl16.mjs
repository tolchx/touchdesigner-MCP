import { TDClient } from '../../api/dist/index.js';
const client = new TDClient();

async function test() {
  const base = '/td_tests_container/td_glsl_tests/glsl_basic';
  const sphere = base + '/source';
  const glsl = base + '/test_default';
  
  // Connect spherePOP to glslPOP
  const c1 = await client.connectNodes(sphere, glsl, 0);
  console.log('connect sphere->glsl:', c1.success);
  
  // Health check
  const h = await client.healthcheck(base, true);
  console.log('health:', h.ok ? 'OK' : 'ISSUES');
  if (!h.ok && h.issues) {
    for (const i of h.issues) {
      console.log('  ' + i.path + ': ' + (i.errors || i.warnings || '').substring(0, 200));
    }
  }
  
  // Check if output has data
  const outData = await client.execute('import json\nt = op("' + base + '/out")\ntry:\n    t.cook(force=True)\n    print(json.dumps({"numPoints":t.numPoints,"numPrims":t.numPrims}))\nexcept Exception as e:\n    print(json.dumps({"error":str(e)}))');
  console.log('output data:', outData.stdout);
}
test().catch(e => console.log('ERR:', e.message));
