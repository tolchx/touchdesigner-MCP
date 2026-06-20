import { TDClient } from '../../api/dist/index.js';
const client = new TDClient();
const BASE = '/td_tests_container/td_glsl_tests';

async function writeShader(comp, code) {
  const glslP = BASE + '/' + comp + '/glsl_shader';
  const r = await client.execute('import json\nt = op("' + glslP + '")\nprint(json.dumps({"cd":str(t.par.computedat.eval())}))');
  const cd = JSON.parse(r.stdout).cd;
  await client.execute('import json\nt = op("' + cd + '")\nt.text = """' + code + '"""\nprint("ok")');
  await client.connectNodes(BASE + '/' + comp + '/source', glslP, 0);
  await client.connectNodes(glslP, BASE + '/' + comp + '/out', 0);
  const h = await client.healthcheck(BASE + '/' + comp, true);
  const e = h.issues?.filter(i => i.path.includes(comp + '/glsl_shader'));
  return (h.ok && (!e || e.length === 0)) ? 'OK' : 'FAIL';
}

async function test() {
  console.log('=== BUILD 2025.32460: 5 SHADERS WITH USER FUNCTIONS ===\n');

  const noise = [
    'float hash(vec3 p) { return sin(p.x*12.9898 + p.y*78.233 + p.z*45.5432) * 43758.5453; }',
    'void main() {',
    '    const uint id = TDIndex(); if(id >= TDNumElements()) return;',
    '    vec3 pos = TDIn_P();',
    '    float n = hash(pos + float(id) * 0.1);',
    '    P[id] = pos + vec3(n) * 0.3;',
    '}'
  ].join('\n');
  console.log('noise (hash func):', await writeShader('glsl_noise', noise));

  const wave = 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; vec3 pos = TDIn_P(); float d = length(pos.xy); float w = sin(d * 3.0) * 0.3 * exp(-d * 0.3); pos.z += w; P[id] = pos; }';
  console.log('wave:', await writeShader('glsl_wave', wave));

  const vortex = [
    'vec2 rotate(vec2 p, float a) { float c = cos(a); float s = sin(a); return vec2(p.x*c - p.y*s, p.x*s + p.y*c); }',
    'void main() {',
    '    const uint id = TDIndex(); if(id >= TDNumElements()) return;',
    '    vec3 pos = TDIn_P();',
    '    float r = length(pos.xy);',
    '    pos.xy = rotate(pos.xy, r * 0.5);',
    '    pos.z += sin(r * 3.0) * 0.2;',
    '    P[id] = pos;',
    '}'
  ].join('\n');
  console.log('vortex (rotate func):', await writeShader('glsl_vortex', vortex));

  const multinoise = [
    'float n2(vec3 p) { return sin(p.x*12.9898)*sin(p.y*78.233)*sin(p.z*45.5432); }',
    'void main() {',
    '    const uint id = TDIndex(); if(id >= TDNumElements()) return;',
    '    vec3 pos = TDIn_P();',
    '    float n1 = n2(pos*1.5 + float(id)*0.01);',
    '    float n2 = n2(pos*3.0 + float(id)*0.02);',
    '    float n3 = n2(pos*2.0 + float(id)*0.03);',
    '    P[id] = pos + vec3(n1-0.5, n2-0.5, (n3+n1)*0.5-0.5)*0.6;',
    '}'
  ].join('\n');
  console.log('multinoise (multi-func):', await writeShader('glsl_multinoise', multinoise));

  const twist = [
    'vec2 rot(vec2 p, float a) { float c=cos(a); float s=sin(a); return vec2(p.x*c-p.y*s, p.x*s+p.y*c); }',
    'void main() {',
    '    const uint id = TDIndex(); if(id >= TDNumElements()) return;',
    '    vec3 pos = TDIn_P();',
    '    float r = length(pos.xy);',
    '    float a = atan(pos.y, pos.x);',
    '    pos.xy = rot(pos.xy, a + r * 0.5);',
    '    pos.z += sin(r * 3.0 + float(id) * 0.01) * 0.2;',
    '    P[id] = pos;',
    '}'
  ].join('\n');
  console.log('twist (rot+atan):', await writeShader('glsl_twist', twist));

  console.log('\n=== VERIFICACION ===');
  for (const name of ['glsl_noise','glsl_wave','glsl_vortex','glsl_multinoise','glsl_twist']) {
    const h = await client.healthcheck(BASE + '/' + name, true);
    const e = h.issues?.filter(i => i.path.includes(name + '/glsl_shader'));
    console.log('  ' + name + ': ' + (h.ok && (!e || e.length === 0) ? 'OK' : 'FAIL'));
  }
  console.log('\nDONE');
}
test().catch(e => console.log('FATAL:', e.message));
