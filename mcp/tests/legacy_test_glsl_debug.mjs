import { TDClient } from '../../api/dist/index.js';
const client = new TDClient();

async function test() {
  const base = '/td_tests_container/td_glsl_tests';
  
  // First, let's find exactly how TD reports GLSL compilation errors
  // by trying a known-bad shader and reading ALL error sources
  
  const comp = 'glsl_color';
  const glsl = base + '/' + comp + '/glsl_shader';
  const src = base + '/' + comp + '/glsl_shader_src';
  
  // 1. Write a simple shader with P access to see exact errors
  const testShader = [
    'void main() {',
    '    const uint id = TDIndex();',
    '    if(id >= TDNumElements()) return;',
    '    P[id] = P[id];', // simplest possible operation
    '}'
  ].join('\n');
  
  const w = await client.execute('import json\nt = op("' + src + '")\nt.text = """' + testShader + '"""\nprint(json.dumps({"len":len(t.text)}))');
  console.log('write test shader:', w.success);
  
  // 2. Read ALL possible error sources
  const checks = [
    // Method 1: .errors()
    'print("METHOD errors:", json.dumps(t.errors(recurse=False)))',
    // Method 2: .cookErrors 
    'print("METHOD cookErrors:", str(t.cookErrors)[:500] if hasattr(t,"cookErrors") else "no_attr")',
    // Method 3: Check children for error DATs
    'print("METHOD children:", json.dumps([c.path for c in t.children]))',
    // Method 4: .par.buildflag
    'print("METHOD buildflag:", str(t.par.buildflag.eval()))',
    // Method 5: op.TDPerformance log
    'print("METHOD perf:", "todo")'
  ];
  
  for (const check of checks) {
    const code = 'import json\nt = op("' + glsl + '")\nt.cook(force=True)\n' + check;
    const r = await client.execute(code);
    if (r.success) {
      console.log(r.stdout);
    }
  }
  
  // 3. Try different shader patterns to find what works
  console.log('\n=== TESTING DIFFERENT SHADER PATTERNS ===');
  
  const patterns = [
    { name: 'empty_main', code: 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; }' },
    { name: 'P_assignment', code: 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; P[id] = TDIn_P(id); }' },
    { name: 'no_id_check', code: 'void main() { const uint id = TDIndex(); P[id] = P[id]; }' },
    { name: 'just_TDIndex', code: 'void main() { uint id = TDIndex(); }' },
    { name: 'no_main_body', code: 'void main() { }' },
  ];
  
  for (const p of patterns) {
    const w2 = await client.execute('import json\nt = op("' + src + '")\nt.text = """' + p.code + '"""\nprint(json.dumps({"len":len(t.text)}))');
    const h = await client.healthcheck(base + '/' + comp, true);
    const status = h.ok ? 'OK' : 'ERR';
    console.log('  ' + p.name + ': ' + status);
    if (!h.ok && h.issues) {
      for (const i of h.issues) {
        if (i.path === glsl) console.log('    -> ' + (i.errors || '').substring(0, 200));
      }
    }
  }
}
test().catch(e => console.log('ERR:', e.message));
