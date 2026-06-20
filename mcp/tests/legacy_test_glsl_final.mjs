import { TDClient } from '../../api/dist/index.js';
const client = new TDClient();

async function test() {
  const base = '/td_tests_container/td_glsl_tests';
  const freshPath = base + '/glsl_basic/fresh_test';
  const computeDat = freshPath + '_compute';
  
  await client.execute('import json\nt = op("' + freshPath + '")\nt.par.outputattrs = "P"\nprint("ok")');
  
  // Now test ALL shaders WITHOUT TDTime (use float(id) instead for variation)
  const shaders = {
    'noise_disp': [
      'float hash(vec3 p) { return sin(p.x*12.9898 + p.y*78.233 + p.z*45.5432) * 43758.5453; }',
      'float n3(vec3 p) { vec3 i = floor(p); vec3 f = fract(p); f = f*f*(3.0-2.0*f); float a = hash(i); float b = hash(i+vec3(1,0,0)); float c = hash(i+vec3(0,1,0)); float d = hash(i+vec3(1,1,0)); float e = hash(i+vec3(0,0,1)); float g = hash(i+vec3(1,0,1)); float h = hash(i+vec3(0,1,1)); float j = hash(i+vec3(1,1,1)); return mix(mix(mix(a,b,f.x),mix(c,d,f.x),f.y),mix(mix(e,g,f.x),mix(h,j,f.x),f.y),f.z); }',
      'void main() {',
      '    const uint id = TDIndex();',
      '    if(id >= TDNumElements()) return;',
      '    float n = n3(P[id] * 2.0 + float(id) * 0.001);',
      '    P[id] += vec3(n) * 0.3;',
      '}'
    ].join('\n'),
    'sine_wave': [
      'void main() {',
      '    const uint id = TDIndex();',
      '    if(id >= TDNumElements()) return;',
      '    float d = length(P[id].xy);',
      '    float w = sin(d * 3.0) * 0.3 * exp(-d * 0.3);',
      '    P[id].z += w;',
      '}'
    ].join('\n'),
    'vortex': [
      'void main() {',
      '    const uint id = TDIndex();',
      '    if(id >= TDNumElements()) return;',
      '    float r = length(P[id].xy);',
      '    float rot = sin(r * 2.0) * 0.3;',
      '    float cx = P[id].x*cos(rot)-P[id].y*sin(rot);',
      '    float cy = P[id].x*sin(rot)+P[id].y*cos(rot);',
      '    P[id] = vec3(cx, cy, P[id].z);',
      '}'
    ].join('\n'),
    'multi_noise': [
      'float hash(vec3 p) { return sin(p.x*12.9898 + p.y*78.233 + p.z*45.5432) * 43758.5453; }',
      'float n3(vec3 p) { vec3 i = floor(p); vec3 f = fract(p); f = f*f*(3.0-2.0*f); float a = hash(i); float b = hash(i+vec3(1,0,0)); float c = hash(i+vec3(0,1,0)); float d = hash(i+vec3(1,1,0)); float e = hash(i+vec3(0,0,1)); float g = hash(i+vec3(1,0,1)); float h = hash(i+vec3(0,1,1)); float j = hash(i+vec3(1,1,1)); return mix(mix(mix(a,b,f.x),mix(c,d,f.x),f.y),mix(mix(e,g,f.x),mix(h,j,f.x),f.y),f.z); }',
      'void main() {',
      '    const uint id = TDIndex();',
      '    if(id >= TDNumElements()) return;',
      '    float n = n3(P[id] * 1.5 + float(id) * 0.001);',
      '    float n2 = n3(P[id] * 3.0 + float(id) * 0.002);',
      '    P[id] += vec3(n-0.5, n2-0.5, (n+n2)*0.5-0.5) * 0.8;',
      '}'
    ].join('\n')
  };
  
  console.log('=== TESTING SHADERS WITHOUT TDTime ===');
  for (const [name, code] of Object.entries(shaders)) {
    await client.execute('import json\nt = op("' + computeDat + '")\nt.text = """' + code + '"""\nprint("ok")');
    const h = await client.healthcheck(freshPath, false);
    console.log('  ' + name + ': ' + (h.ok ? 'OK' : 'ERR'));
    if (!h.ok && h.issues) console.log('    ' + (h.issues[0]?.errors || '').substring(0, 200));
  }
}
test().catch(e => console.log('ERR:', e.message));
