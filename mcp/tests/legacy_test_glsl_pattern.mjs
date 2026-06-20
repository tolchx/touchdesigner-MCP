import { TDClient } from '../../api/dist/index.js';
const client = new TDClient();
const BASE = '/td_tests_container/td_glsl_tests';

async function testShader(comp, code) {
  const glslP = BASE + '/' + comp + '/glsl_shader';
  const r = await client.execute('import json\nt = op("' + glslP + '")\nprint(json.dumps({"cd":str(t.par.computedat.eval())}))');
  const cd = JSON.parse(r.stdout).cd;
  await client.execute('import json\nt = op("' + cd + '")\nt.text = """' + code + '"""\nprint("ok")');
  await client.connectNodes(BASE + '/' + comp + '/source', glslP, 0);
  await client.connectNodes(glslP, BASE + '/' + comp + '/out', 0);
  const h = await client.healthcheck(BASE + '/' + comp, true);
  const e = h.issues?.filter(i => i.path.includes(comp + '/glsl_shader'));
  return (h.ok && (!e || e.length === 0)) ? 'OK' : 'ERR';
}

async function test() {
  console.log('=== READ-ALL-THEN-WRITE PATTERN ===\n');
  
  // Vortex: read all P at start, operate on temps, assign at end
  const vortex = [
    'void main() {',
    '    const uint id = TDIndex();',
    '    if(id >= TDNumElements()) return;',
    '    float px = P[id].x;',
    '    float py = P[id].y;',
    '    float pz = P[id].z;',
    '    float r = length(P[id].xy);',
    '    float cr = cos(r * 0.5);',
    '    float sr = sin(r * 0.5);',
    '    P[id].x = px * cr - py * sr;',
    '    P[id].y = px * sr + py * cr;',
    '    P[id].z = pz + sin(r * 3.0) * 0.2;',
    '}'
  ].join('\n');
  console.log('vortex (read-all pattern):', await testShader('glsl_vortex', vortex));

  // Twist: same pattern
  const twist = [
    'void main() {',
    '    const uint id = TDIndex();',
    '    if(id >= TDNumElements()) return;',
    '    float px = P[id].x;',
    '    float py = P[id].y;',
    '    float pz = P[id].z;',
    '    float r = length(P[id].xy);',
    '    float a = atan(py, px);',
    '    float cr = cos(a + r * 0.5);',
    '    float sr = sin(a + r * 0.5);',
    '    P[id].x = px * cr - py * sr;',
    '    P[id].y = px * sr + py * cr;',
    '    P[id].z = pz + sin(r * 3.0 + float(id) * 0.01) * 0.2;',
    '}'
  ].join('\n');
  console.log('twist (read-all pattern):', await testShader('glsl_twist', twist));
  
  // Noise with read-all
  const noise = [
    'void main() {',
    '    const uint id = TDIndex();',
    '    if(id >= TDNumElements()) return;',
    '    float px = P[id].x, py = P[id].y, pz = P[id].z;',
    '    float n1 = sin(float(id) * 0.5 + px * 2.0) * 0.3 + 0.3;',
    '    float n2 = cos(float(id) * 0.7 + py * 3.0) * 0.3 + 0.3;',
    '    P[id].x += n1;',
    '    P[id].y += n2;',
    '    P[id].z += (n1 + n2) * 0.2;',
    '}'
  ].join('\n');
  console.log('noise (read-all pattern):', await testShader('glsl_noise', noise));

  // Multi-noise with read-all
  const multinoise = [
    'void main() {',
    '    const uint id = TDIndex();',
    '    if(id >= TDNumElements()) return;',
    '    float px = P[id].x, py = P[id].y, pz = P[id].z;',
    '    float n1 = sin(px * 1.5 + float(id) * 0.01) * 0.5 + 0.5;',
    '    float n2 = cos(py * 2.0 + float(id) * 0.02) * 0.5 + 0.5;',
    '    float n3 = sin(px * 3.0 + py * 2.0 + float(id) * 0.03) * 0.5 + 0.5;',
    '    P[id].x += (n1 - 0.5) * 0.6;',
    '    P[id].y += (n2 - 0.5) * 0.6;',
    '    P[id].z += ((n3 + n1) * 0.5 - 0.5) * 0.6;',
    '}'
  ].join('\n');
  console.log('multinoise (read-all pattern):', await testShader('glsl_multinoise', multinoise));

  // FINAL VERIFICATION
  console.log('\n=== FINAL VERIFICATION - ALL 5 ===');
  for (const name of ['glsl_noise','glsl_wave','glsl_vortex','glsl_multinoise','glsl_twist']) {
    const h = await client.healthcheck(BASE + '/' + name, true);
    const e = h.issues?.filter(i => i.path.includes(name + '/glsl_shader'));
    console.log('  ' + name + ': ' + (h.ok && (!e || e.length === 0) ? 'OK' : 'ISSUE'));
  }
  console.log('\nDONE');
}
test().catch(e => console.log('FATAL:', e.message));
