import { TDClient } from '../../api/dist/index.js';
const client = new TDClient();

async function test() {
  const freshPath = '/td_tests_container/td_glsl_tests/glsl_basic/fresh_test';
  const computeDat = freshPath + '_compute';
  
  // Set outputattrs
  await client.execute('import json\nt = op("' + freshPath + '")\nt.par.outputattrs = "P"\nprint("ok")');
  
  // Test: simple, no external functions
  const shaders = [
    { name: 'sin P.x', code: [
      'void main() {',
      '    const uint id = TDIndex();',
      '    if(id >= TDNumElements()) return;',
      '    P[id].x += sin(P[id].y * 0.5 + TDTime()) * 0.1;',
      '}'
    ].join('\n') },
    { name: 'cos P.y', code: [
      'void main() {',
      '    const uint id = TDIndex();',
      '    if(id >= TDNumElements()) return;',
      '    P[id].y += cos(P[id].x * 0.5 + TDTime()) * 0.1;',
      '}'
    ].join('\n') },
    { name: 'sin+cos both', code: [
      'void main() {',
      '    const uint id = TDIndex();',
      '    if(id >= TDNumElements()) return;',
      '    P[id].x += sin(P[id].y * 0.5 + TDTime()) * 0.1;',
      '    P[id].y += cos(P[id].x * 0.5 + TDTime()) * 0.1;',
      '}'
    ].join('\n') },
    { name: 'length + wave', code: [
      'void main() {',
      '    const uint id = TDIndex();',
      '    if(id >= TDNumElements()) return;',
      '    float d = length(P[id].xy);',
      '    P[id].z += sin(d * 2.0 - TDTime() * 2.0) * 0.2 * exp(-d * 0.5);',
      '}'
    ].join('\n') },
    { name: 'vortex style', code: [
      'void main() {',
      '    const uint id = TDIndex();',
      '    if(id >= TDNumElements()) return;',
      '    float angle = length(P[id].xy) * 1.5 + TDTime() * 0.5;',
      '    float r = length(P[id].xy);',
      '    float rot = sin(angle) * 0.2;',
      '    float cx = P[id].x * cos(rot) - P[id].y * sin(rot);',
      '    float cy = P[id].x * sin(rot) + P[id].y * cos(rot);',
      '    P[id] = vec3(cx, cy, P[id].z + r * 0.2 * sin(TDTime() + r * 2.0));',
      '}'
    ].join('\n') },
    { name: 'custom hash + noise', code: [
      'float h(vec3 p) { return sin(p.x*12.9898 + p.y*78.233 + p.z*45.5432) * 43758.5453; }',
      'void main() {',
      '    const uint id = TDIndex();',
      '    if(id >= TDNumElements()) return;',
      '    P[id].x += h(P[id] + TDTime()) * 0.05;',
      '}'
    ].join('\n') },
  ];
  
  for (const s of shaders) {
    await client.execute('import json\nt = op("' + computeDat + '")\nt.text = """' + s.code + '"""\nprint("ok")');
    const h = await client.healthcheck(freshPath, false);
    console.log(s.name + ': ' + (h.ok ? 'OK' : 'ERR'));
  }
}
test().catch(e => console.log('ERR:', e.message));
