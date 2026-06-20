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
  return (h.ok && (!e || e.length === 0)) ? 'OK' : 'ERR: ' + (e?.[0]?.errors || '').substring(0, 200);
}

async function test() {
  console.log('=== TESTING WITH TDIn_P() PATTERN FROM REAL SHADERS ===\n');
  
  // Vortex with TDIn_P()
  const vortex = [
    'void main() {',
    '    const uint id = TDIndex();',
    '    if(id >= TDNumElements()) return;',
    '    vec3 pos = TDIn_P(id);',
    '    float r = length(pos.xy);',
    '    float cr = cos(r * 0.5);',
    '    float sr = sin(r * 0.5);',
    '    float x = pos.x;',
    '    float y = pos.y;',
    '    P[id] = vec3(x * cr - y * sr, x * sr + y * cr, pos.z + sin(r * 3.0) * 0.2);',
    '}'
  ].join('\n');
  console.log('vortex (TDIn_P):', await writeShader('glsl_vortex', vortex));

  const twist = [
    'void main() {',
    '    const uint id = TDIndex();',
    '    if(id >= TDNumElements()) return;',
    '    vec3 pos = TDIn_P(id);',
    '    float r = length(pos.xy);',
    '    float a = atan(pos.y, pos.x);',
    '    float cr = cos(a + r * 0.5);',
    '    float sr = sin(a + r * 0.5);',
    '    float x = pos.x;',
    '    float y = pos.y;',
    '    P[id] = vec3(x * cr - y * sr, x * sr + y * cr, pos.z + sin(r * 3.0 + float(id) * 0.01) * 0.2);',
    '}'
  ].join('\n');
  console.log('twist (TDIn_P):', await writeShader('glsl_twist', twist));

  const noise = [
    'void main() {',
    '    const uint id = TDIndex();',
    '    if(id >= TDNumElements()) return;',
    '    vec3 pos = TDIn_P(id);',
    '    float n = sin(float(id) * 0.5 + pos.x * 2.0) * 0.3 + 0.3;',
    '    float n2 = cos(float(id) * 0.7 + pos.y * 3.0) * 0.3 + 0.3;',
    '    P[id] = pos + vec3(n, n2, (n + n2) * 0.5) * 0.4;',
    '}'
  ].join('\n');
  console.log('noise (TDIn_P):', await writeShader('glsl_noise', noise));

  const multinoise = [
    'void main() {',
    '    const uint id = TDIndex();',
    '    if(id >= TDNumElements()) return;',
    '    vec3 pos = TDIn_P(id);',
    '    float n1 = sin(pos.x * 1.5 + float(id) * 0.01) * 0.5 + 0.5;',
    '    float n2 = cos(pos.y * 2.0 + float(id) * 0.02) * 0.5 + 0.5;',
    '    float n3 = sin(pos.x * 3.0 + pos.y * 2.0 + float(id) * 0.03) * 0.5 + 0.5;',
    '    P[id] = pos + vec3(n1 - 0.5, n2 - 0.5, (n3 + n1) * 0.5 - 0.5) * 0.6;',
    '}'
  ].join('\n');
  console.log('multinoise (TDIn_P):', await writeShader('glsl_multinoise', multinoise));

  console.log('\n=== FINAL VERIFICATION ===');
  for (const name of ['glsl_noise','glsl_wave','glsl_vortex','glsl_multinoise','glsl_twist']) {
    const h = await client.healthcheck(BASE + '/' + name, true);
    const e = h.issues?.filter(i => i.path.includes(name + '/glsl_shader'));
    console.log('  ' + name + ': ' + (h.ok && (!e || e.length === 0) ? 'OK' : 'ISSUE'));
  }
  console.log('\nDONE');
}
test().catch(e => console.log('FATAL:', e.message));
