import { TDClient } from '../../api/dist/index.js';
const client = new TDClient();

async function writeShader(compName, shaderCode) {
  const base = '/td_tests_container/td_glsl_tests';
  const glslPath = base + '/' + compName + '/glsl_shader';
  
  // Find the auto-generated compute DAT (named <glslName>_compute)
  const r = await client.execute('import json\nt = op("' + glslPath + '")\nprint(json.dumps({"cd":str(t.par.computedat.eval())}))');
  const cd = JSON.parse(r.stdout).cd;
  
  if (!cd || !cd.startsWith('/')) {
    return { error: 'no computedat found: ' + cd };
  }
  
  const w = await client.execute('import json\nt = op("' + cd + '")\nt.text = """' + shaderCode + '"""\nprint(json.dumps({"len":len(t.text)}))');
  if (!w.success) return { error: 'write failed' };
  
  const h = await client.healthcheck(base + '/' + compName, true);
  if (!h.ok && h.issues) {
    return { error: h.issues.map(i => (i.errors || i.warnings || '')).join('; ').substring(0, 200) };
  }
  return { ok: true };
}

async function test() {
  console.log('=== Writing GLSL shaders using TD POP API ===');
  
  // Shader 1: Noise displacement
  const s1 = [
    'void main() {',
    '    const uint id = TDIndex();',
    '    if(id >= TDNumElements()) return;',
    '    float n = snoise(P[id] * 2.0 + TDTime() * 0.3);',
    '    P[id] += vec3(n) * 0.3;',
    '}'
  ].join('\n');
  const r1 = await writeShader('glsl_basic', s1);
  console.log('1 noise displacement:', r1.ok ? 'OK' : 'FAIL ' + r1.error);

  // Shader 2: Color cycling
  const s2 = [
    'void main() {',
    '    const uint id = TDIndex();',
    '    if(id >= TDNumElements()) return;',
    '    vec3 c = 0.5 + 0.5 * cos(TDTime() * 0.5 + P[id].xyx + vec3(0,2,4));',
    '    Cd[id] = vec4(c, 1.0);',
    '}'
  ].join('\n');
  const r2 = await writeShader('glsl_color', s2);
  console.log('2 color:', r2.ok ? 'OK' : 'FAIL ' + r2.error);

  // Shader 3: Sine wave
  const s3 = [
    'void main() {',
    '    const uint id = TDIndex();',
    '    if(id >= TDNumElements()) return;',
    '    float d = length(P[id].xy);',
    '    float w = sin(d * 3.0 - TDTime() * 2.0) * 0.5 * exp(-d * 0.3);',
    '    P[id].z += w;',
    '    vec3 c = 0.5 + 0.5 * cos(TDTime() * 0.3 + vec3(w*2.0,w,0.0));',
    '    Cd[id] = vec4(c, 1.0);',
    '}'
  ].join('\n');
  const r3 = await writeShader('glsl_wave', s3);
  console.log('3 sine wave:', r3.ok ? 'OK' : 'FAIL ' + r3.error);

  // Shader 4: Vortex
  const s4 = [
    'void main() {',
    '    const uint id = TDIndex();',
    '    if(id >= TDNumElements()) return;',
    '    float a = length(P[id].xy)*2.0+TDTime()*0.5;',
    '    float r = length(P[id].xy);',
    '    float v = sin(a)*0.3;',
    '    float cx = P[id].x*cos(v)-P[id].y*sin(v);',
    '    float cy = P[id].x*sin(v)+P[id].y*cos(v);',
    '    P[id] = vec3(cx, cy, P[id].z + r*0.3*sin(TDTime()+r*3.0));',
    '    Cd[id] = vec4(0.3+0.7*(0.5+0.5*sin(TDTime()+r*5.0)),0.2,0.8,1.0);',
    '}'
  ].join('\n');
  const r4 = await writeShader('glsl_vortex', s4);
  console.log('4 vortex:', r4.ok ? 'OK' : 'FAIL ' + r4.error);

  // Shader 5: Multi-noise combo
  const s5 = [
    'float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }',
    'float n3(vec3 p) { vec3 i = floor(p); vec3 f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(mix(hash(i+vec3(0,0,0)),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z); }',
    'void main() {',
    '    const uint id = TDIndex();',
    '    if(id >= TDNumElements()) return;',
    '    float n = n3(P[id]*1.5+TDTime()*0.2);',
    '    float n2 = n3(P[id]*3.0+TDTime()*0.5);',
    '    P[id] += vec3(n-0.5, n2-0.5, (n+n2)*0.5-0.5)*0.8;',
    '    vec3 col = 0.5+0.5*cos(TDTime()*0.2+vec3(n,n2,n+n2));',
    '    Cd[id] = vec4(mix(Cd[id].rgb,col,0.7), 1.0);',
    '}'
  ].join('\n');
  const r5 = await writeShader('glsl_combo', s5);
  console.log('5 combo:', r5.ok ? 'OK' : 'FAIL ' + r5.error);

  console.log('\n=== Final health ===');
  for (const name of ['glsl_basic','glsl_color','glsl_wave','glsl_vortex','glsl_combo']) {
    const h = await client.healthcheck('/td_tests_container/td_glsl_tests/' + name, true);
    console.log('  ' + (h.ok ? 'OK' : 'FAIL') + ' ' + name);
  }
}
test().catch(e => console.log('ERR:', e.message));
