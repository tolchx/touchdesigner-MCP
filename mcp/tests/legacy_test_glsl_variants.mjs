import { TDClient } from '../../api/dist/index.js';
const client = new TDClient();

async function test() {
  const comp = 'glsl_basic';
  const freshPath = '/td_tests_container/td_glsl_tests/' + comp + '/fresh_test';
  const computeDat = freshPath + '_compute';
  
  // Test shaders one by one to find what works
  const variants = [
    { name: 'default (no mods)', code: [
      'void main() {',
      '    const uint id = TDIndex();',
      '    if(id >= TDNumElements()) return;',
      '}'
    ].join('\n') },
    { name: 'P[id] = P[id]', code: [
      'void main() {',
      '    const uint id = TDIndex();',
      '    if(id >= TDNumElements()) return;',
      '    P[id] = P[id];',
      '}'
    ].join('\n') },
    { name: 'P[id] += vec3(0.01)', code: [
      'void main() {',
      '    const uint id = TDIndex();',
      '    if(id >= TDNumElements()) return;',
      '    P[id] += vec3(0.01);',
      '}'
    ].join('\n') },
    { name: 'P[id].x += 0.01', code: [
      'void main() {',
      '    const uint id = TDIndex();',
      '    if(id >= TDNumElements()) return;',
      '    P[id].x += 0.01;',
      '}'
    ].join('\n') },
    { name: 'Cd[id] = vec4(1)', code: [
      'void main() {',
      '    const uint id = TDIndex();',
      '    if(id >= TDNumElements()) return;',
      '    Cd[id] = vec4(1.0);',
      '}'
    ].join('\n') },
    { name: 'v[id] += vec3(0.01)', code: [
      'void main() {',
      '    const uint id = TDIndex();',
      '    if(id >= TDNumElements()) return;',
      '    v[id] += vec3(0.01);',
      '}'
    ].join('\n') },
    { name: 'life[id] = 1.0', code: [
      'void main() {',
      '    const uint id = TDIndex();',
      '    if(id >= TDNumElements()) return;',
      '    life[id] = 1.0;',
      '}'
    ].join('\n') },
    { name: 'snoise test', code: [
      'void main() {',
      '    const uint id = TDIndex();',
      '    if(id >= TDNumElements()) return;',
      '    P[id] += vec3(snoise(P[id] * 1.0) * 0.1);',
      '}'
    ].join('\n') },
  ];
  
  console.log('=== TESTING SHADER VARIATIONS ===');
  for (const v of variants) {
    // Write shader
    const w = await client.execute('import json\nt = op("' + computeDat + '")\nt.text = """' + v.code + '"""\nprint(json.dumps({"done":True}))');
    if (!w.success) { console.log('  ' + v.name + ': WRITE FAIL'); continue; }
    
    // Health check
    const h = await client.healthcheck(freshPath, false);
    const status = h.ok ? 'OK' : 'ERR';
    if (!h.ok && h.issues) {
      const errMsg = h.issues[0]?.errors || '';
      console.log('  ' + v.name + ': ' + status + ' -> ' + errMsg.substring(0, 200));
    } else {
      console.log('  ' + v.name + ': ' + status);
    }
  }
}
test().catch(e => console.log('ERR:', e.message));
