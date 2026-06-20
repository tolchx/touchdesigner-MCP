import { TDClient } from '../../api/dist/index.js';
const client = new TDClient();
const BASE = '/td_tests_container/td_glsl_tests';

async function test() {
  const comp = 'glsl_vortex';
  const glslP = BASE + '/' + comp + '/glsl_shader';
  const cdR = await client.execute('import json\nt = op("' + glslP + '")\nprint(json.dumps({"cd":str(t.par.computedat.eval())}))');
  const cd = JSON.parse(cdR.stdout).cd;
  
  // Write a simple failing shader
  const code = 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; float r = length(P[id].xy); float cr = cos(r * 0.5); float sr = sin(r * 0.5); float x = P[id].x; float y = P[id].y; float nx = x * cr - y * sr; float ny = x * sr + y * cr; P[id] = vec3(nx, ny, P[id].z); }';
  await client.execute('import json\nt = op("' + cd + '")\nt.text = """' + code + '"""\nprint("ok")');
  await client.execute('t = op("' + glslP + '")\nt.cook(force=True)');
  
  // Read ALL possible error sources
  console.log('=== ERROR DETAILS ===');
  
  // Method 1: errors()
  const e1 = await client.execute('import json\nt = op("' + glslP + '")\nprint(json.dumps({"err":t.errors(recurse=False)}))');
  console.log('errors():', JSON.parse(e1.stdout).err?.substring(0, 500));
  
  // Method 2: op().text of the compute DAT - maybe it has compile output
  const e2 = await client.execute('import json\nt = op("' + cd + '")\nprint(json.dumps({"text":t.text[:500]}))');
  console.log('compute DAT:', JSON.parse(e2.stdout).text?.substring(0, 500));
  
  // Method 3: Check if there are any siblings with error info
  const e3 = await client.execute('import json\nt = op("' + glslP + '")\n# Check all siblings in parent\nparent = t.parent()\nsiblings = [{"n":c.name,"t":c.OPType} for c in parent.children]\nprint(json.dumps(siblings))');
  console.log('siblings:', JSON.parse(e3.stdout));
  
  // Method 4: Try to get TD's Python error output more verbosely
  const e4 = await client.execute('import json,traceback\ntry:\n    t = op("' + glslP + '")\n    t.cook(force=True)\n    print(json.dumps({"ok":True}))\nexcept Exception as e:\n    print(json.dumps({"py_error":str(e)}))');
  console.log('cook result:', JSON.parse(e4.stdout));
  
  // Method 5: Use the glslPOP's internal error DAT if it exists
  const e5 = await client.execute('import json\nt = op("' + glslP + '")\n# Check if there's an error_log or similar child\nall_children = []\ntry: all_children = [{"p":c.path,"n":c.name,"t":c.OPType} for c in t.children]\nexcept: pass\nprint(json.dumps({"children":all_children,"has_error_method":hasattr(t,"errors")}))');
  console.log('glslPOP children:', JSON.parse(e5.stdout));
}
test().catch(e => console.log('ERR:', e.message));
