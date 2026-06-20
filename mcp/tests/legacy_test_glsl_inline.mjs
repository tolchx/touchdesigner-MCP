import { TDClient } from '../../api/dist/index.js';
const client = new TDClient();

async function test() {
  const freshPath = '/td_tests_container/td_glsl_tests/glsl_basic/fresh_test';
  const computeDat = freshPath + '_compute';
  
  await client.execute('import json\nt = op("' + freshPath + '")\nt.par.outputattrs = "P"\nprint("ok")');
  
  // Inline noise (no external functions)
  const shaders = {
    'noise_inline': [
      'void main() {',
      '    const uint id = TDIndex();',
      '    if(id >= TDNumElements()) return;',
      '    vec3 p = P[id] * 2.0 + float(id) * 0.001;',
      '    float n = sin(p.x*12.9898 + p.y*78.233 + p.z*45.5432) * 43758.5453;',
      '    n = fract(n);',
      '    P[id] += vec3(n) * 0.3;',
      '}'
    ].join('\n'),
    'vortex_inline': [
      'void main() {',
      '    const uint id = TDIndex();',
      '    if(id >= TDNumElements()) return;',
      '    float r = length(P[id].xy);',
      '    float a = r * 2.0;',
      '    float ca = cos(a);',
      '    float sa = sin(a);',
      '    float rot = sa * 0.3;',
      '    float cr = cos(rot);',
      '    float sr = sin(rot);',
      '    float cx = P[id].x*cr - P[id].y*sr;',
      '    float cy = P[id].x*sr + P[id].y*cr;',
      '    P[id] = vec3(cx, cy, P[id].z);',
      '}'
    ].join('\n'),
    'multi_noise_inline': [
      'void main() {',
      '    const uint id = TDIndex();',
      '    if(id >= TDNumElements()) return;',
      '    vec3 p1 = P[id] * 1.5 + float(id) * 0.001;',
      '    vec3 p2 = P[id] * 3.0 + float(id) * 0.002;',
      '    float n = sin(p1.x*12.9898 + p1.y*78.233 + p1.z*45.5432) * 43758.5453;',
      '    float n2 = sin(p2.x*12.9898 + p2.y*78.233 + p2.z*45.5432) * 43758.5453;',
      '    n = fract(n); n2 = fract(n2);',
      '    P[id] += vec3(n-0.5, n2-0.5, (n+n2)*0.5-0.5) * 0.8;',
      '}'
    ].join('\n'),
    'color_inline': [
      'void main() {',
      '    const uint id = TDIndex();',
      '    if(id >= TDNumElements()) return;',
      '    vec3 c = 0.5 + 0.5 * cos(P[id].xyx + vec3(0,2,4));',
      '    Cd[id] = vec4(c, 1.0);',
      '}'
    ].join('\n'),
  };
  
  console.log('=== INLINE SHADERS (no external functions) ===');
  for (const [name, code] of Object.entries(shaders)) {
    // Set outputattrs appropriately
    const attrs = name === 'color_inline' ? 'P Cd' : 'P';
    await client.execute('import json\nt = op("' + freshPath + '")\nt.par.outputattrs = "' + attrs + '"\nprint("ok")');
    
    await client.execute('import json\nt = op("' + computeDat + '")\nt.text = """' + code + '"""\nprint("ok")');
    const h = await client.healthcheck(freshPath, false);
    console.log('  ' + name + ' (' + attrs + '): ' + (h.ok ? 'OK' : 'ERR'));
    if (!h.ok && h.issues) console.log('    ' + (h.issues[0]?.errors || '').substring(0, 200));
  }
}
test().catch(e => console.log('ERR:', e.message));
