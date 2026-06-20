import { TDClient } from '../../api/dist/index.js';
const client = new TDClient();

async function test() {
  const freshPath = '/td_tests_container/td_glsl_tests/glsl_basic/fresh_test';
  const computeDat = freshPath + '_compute';
  
  // Test Cd alone
  await client.execute('import json\nt = op("' + freshPath + '")\nt.par.outputattrs = "Cd"\nprint("ok")');
  
  const code = [
    'void main() {',
    '    const uint id = TDIndex();',
    '    if(id >= TDNumElements()) return;',
    '    Cd[id] = vec4(1.0, 0.0, 0.0, 1.0);',
    '}'
  ].join('\n');
  
  await client.execute('import json\nt = op("' + computeDat + '")\nt.text = """' + code + '"""\nprint("ok")');
  const h = await client.healthcheck(freshPath, false);
  console.log('Cd only:', h.ok ? 'OK' : 'ERR');
  if (!h.ok && h.issues) console.log('  ' + (h.issues[0]?.errors || '').substring(0, 300));
  
  // Now try P and Cd in separate tests
  await client.execute('import json\nt = op("' + freshPath + '")\nt.par.outputattrs = "P"\nprint("ok")');
  
  const code2 = [
    'void main() {',
    '    const uint id = TDIndex();',
    '    if(id >= TDNumElements()) return;',
    '    P[id].x += sin(P[id].y * 2.0) * 0.1;',
    '    P[id].y += cos(P[id].x * 2.0) * 0.1;',
    '}'
  ].join('\n');
  
  // Test each shader pattern
  const tests = [
    { name: 'P.x += sin(P.y)', code: 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; P[id].x += sin(P[id].y * 2.0) * 0.1; }' },
    { name: 'P.x += cos(P.y)', code: 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; P[id].x += cos(P[id].y * 2.0) * 0.1; }' },
    { name: 'P.x = sin(id)*0.1', code: 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; P[id].x = sin(float(id)) * 0.1; }' },
    { name: 'P = vec3(sin)', code: 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; P[id] = vec3(sin(float(id))*0.1); }' },
    { name: 'P.z = length(P.xy)', code: 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; P[id].z = length(P[id].xy); }' },
  ];
  
  console.log('\n=== DETAILED SIN/COS TESTS ===');
  for (const t of tests) {
    await client.execute('import json\nt = op("' + computeDat + '")\nt.text = """' + t.code + '"""\nprint("ok")');
    const h = await client.healthcheck(freshPath, false);
    console.log('  ' + t.name + ': ' + (h.ok ? 'OK' : 'ERR'));
    if (!h.ok && h.issues) console.log('    ' + (h.issues[0]?.errors || '').substring(0, 200));
  }
}
test().catch(e => console.log('ERR:', e.message));
