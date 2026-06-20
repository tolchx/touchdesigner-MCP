import { TDClient } from '../../api/dist/index.js';
const client = new TDClient();
const BASE = '/td_tests_container/td_glsl_tests';

async function test() {
  // Fix vortex: separate x,y,z assignments instead of vec3()
  const comp = 'glsl_vortex';
  const glslP = BASE + '/' + comp + '/glsl_shader';
  const r = await client.execute('import json\nt = op("' + glslP + '")\nprint(json.dumps({"cd":str(t.par.computedat.eval())}))');
  const cd = JSON.parse(r.stdout).cd;

  const vortexShader = [
    'void main() {',
    '    const uint id = TDIndex();',
    '    if(id >= TDNumElements()) return;',
    '    float r = length(P[id].xy);',
    '    float cr = cos(r * 0.5);',
    '    float sr = sin(r * 0.5);',
    '    float x = P[id].x;',
    '    float y = P[id].y;',
    '    P[id].x = x * cr - y * sr;',
    '    P[id].y = x * sr + y * cr;',
    '    P[id].z += sin(r * 3.0) * 0.2;',
    '}'
  ].join('\n');

  await client.execute('import json\nt = op("' + cd + '")\nt.text = """' + vortexShader + '"""\nprint("ok")');
  await client.connectNodes(BASE + '/' + comp + '/source', glslP, 0);
  await client.connectNodes(glslP, BASE + '/' + comp + '/out', 0);
  const h = await client.healthcheck(BASE + '/' + comp, true);
  console.log('vortex (separate assigns):', h.ok ? 'OK' : 'ERR');
  if (!h.ok && h.issues) console.log('  ' + (h.issues.filter(i => i.path.includes('glsl_shader'))[0]?.errors || '').substring(0, 200));

  // Fix twist: same pattern
  const comp2 = 'glsl_twist';
  const glslP2 = BASE + '/' + comp2 + '/glsl_shader';
  const r2 = await client.execute('import json\nt = op("' + glslP2 + '")\nprint(json.dumps({"cd":str(t.par.computedat.eval())}))');
  const cd2 = JSON.parse(r2.stdout).cd;

  const twistShader = [
    'void main() {',
    '    const uint id = TDIndex();',
    '    if(id >= TDNumElements()) return;',
    '    float r = length(P[id].xy);',
    '    float a = atan(P[id].y, P[id].x);',
    '    float cr = cos(a + r * 0.5);',
    '    float sr = sin(a + r * 0.5);',
    '    float x = P[id].x;',
    '    float y = P[id].y;',
    '    P[id].x = x * cr - y * sr;',
    '    P[id].y = x * sr + y * cr;',
    '    P[id].z += sin(r * 3.0 + float(id) * 0.01) * 0.2;',
    '}'
  ].join('\n');

  await client.execute('import json\nt = op("' + cd2 + '")\nt.text = """' + twistShader + '"""\nprint("ok")');
  await client.connectNodes(BASE + '/' + comp2 + '/source', glslP2, 0);
  await client.connectNodes(glslP2, BASE + '/' + comp2 + '/out', 0);
  const h2 = await client.healthcheck(BASE + '/' + comp2, true);
  console.log('twist (separate assigns):', h2.ok ? 'OK' : 'ERR');
  if (!h2.ok && h2.issues) console.log('  ' + (h2.issues.filter(i => i.path.includes('glsl_shader'))[0]?.errors || '').substring(0, 200));

  // FINAL VERIFICATION - ALL 5 SHADERS
  console.log('\n=== FINAL VERIFICATION - ALL 5 SHADERS ===');
  for (const name of ['glsl_noise','glsl_wave','glsl_vortex','glsl_multinoise','glsl_twist']) {
    const hf = await client.healthcheck(BASE + '/' + name, true);
    const err = hf.issues?.filter(i => i.path.includes(name + '/glsl_shader'));
    console.log('  ' + name + ': ' + (hf.ok && (!err || err.length === 0) ? 'OK' : 'ISSUE'));
  }
  console.log('\nDONE');
}
test().catch(e => console.log('FATAL:', e.message));
