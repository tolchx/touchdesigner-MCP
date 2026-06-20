import { TDClient } from '../../api/dist/index.js';
const client = new TDClient();

async function test() {
  const freshPath = '/td_tests_container/td_glsl_tests/glsl_basic/fresh_test';
  const computeDat = freshPath + '_compute';
  const spherePath = '/td_tests_container/td_glsl_tests/glsl_basic/source';
  
  // Connect source to fresh glslPOP
  await client.connectNodes(spherePath, freshPath, 0);
  
  // Set outputattrs to "P" only (we'll modify position with color based on position)
  await client.execute('import json\nt = op("' + freshPath + '")\nt.par.outputattrs = "P"\nprint("ok")');
  
  // SHADER 1: Basic noise displacement (WORKS with outputattrs=P)
  const shader1 = [
    'void main() {',
    '    const uint id = TDIndex();',
    '    if(id >= TDNumElements()) return;',
    '    float n = snoise(P[id] * 2.0 + TDTime() * 0.3);',
    '    P[id] += vec3(n) * 0.3;',
    '}'
  ].join('\n');
  
  const w1 = await client.execute('import json\nt = op("' + computeDat + '")\nt.text = """' + shader1 + '"""\nprint(json.dumps({"done":True}))');
  const h1 = await client.healthcheck(freshPath, false);
  console.log('1 noise displacement:', h1.ok ? 'OK' : 'ERR');
  
  // SHADER 2: Sine wave on P
  const shader2 = [
    'void main() {',
    '    const uint id = TDIndex();',
    '    if(id >= TDNumElements()) return;',
    '    float d = length(P[id].xy);',
    '    float w = sin(d * 3.0 - TDTime() * 2.0) * 0.5 * exp(-d * 0.3);',
    '    P[id].z += w;',
    '}'
  ].join('\n');
  
  const w2 = await client.execute('import json\nt = op("' + computeDat + '")\nt.text = """' + shader2 + '"""\nprint(json.dumps({"done":True}))');
  const h2 = await client.healthcheck(freshPath, false);
  console.log('2 sine wave:', h2.ok ? 'OK' : 'ERR');
  
  // SHADER 3: Vortex
  const shader3 = [
    'void main() {',
    '    const uint id = TDIndex();',
    '    if(id >= TDNumElements()) return;',
    '    float a = length(P[id].xy)*2.0+TDTime()*0.5;',
    '    float v = sin(a)*0.3;',
    '    float cx = P[id].x*cos(v)-P[id].y*sin(v);',
    '    float cy = P[id].x*sin(v)+P[id].y*cos(v);',
    '    P[id] = vec3(cx, cy, P[id].z);',
    '}'
  ].join('\n');
  
  const w3 = await client.execute('import json\nt = op("' + computeDat + '")\nt.text = """' + shader3 + '"""\nprint(json.dumps({"done":True}))');
  const h3 = await client.healthcheck(freshPath, false);
  console.log('3 vortex:', h3.ok ? 'OK' : 'ERR');
  
  // SHADER 4: Multi-noise combo (custom noise function + P modification)
  const shader4 = [
    'float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }',
    'float n3(vec3 p) { vec3 i = floor(p); vec3 f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(mix(hash(i+vec3(0,0,0)),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z); }',
    'void main() {',
    '    const uint id = TDIndex();',
    '    if(id >= TDNumElements()) return;',
    '    float n = n3(P[id]*1.5+TDTime()*0.2);',
    '    float n2 = n3(P[id]*3.0+TDTime()*0.5);',
    '    P[id] += vec3(n-0.5, n2-0.5, (n+n2)*0.5-0.5)*0.8;',
    '}'
  ].join('\n');
  
  const w4 = await client.execute('import json\nt = op("' + computeDat + '")\nt.text = """' + shader4 + '"""\nprint(json.dumps({"done":True}))');
  const h4 = await client.healthcheck(freshPath, false);
  console.log('4 combo noise:', h4.ok ? 'OK' : 'ERR');
  if (!h4.ok && h4.issues) console.log('  ' + h4.issues[0]?.errors?.substring(0, 300));
}
test().catch(e => console.log('ERR:', e.message));
