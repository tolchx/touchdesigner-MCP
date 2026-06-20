import { TDClient } from '../../api/dist/index.js';
const client = new TDClient();
const BASE = '/td_tests_container/td_glsl_tests';

async function createGLSLTest(compName, shaderCode) {
  const compPath = BASE + '/' + compName;
  
  // 1. Create source (spherePOP)
  const src = await client.createOperator('spherePOP', 'source', compPath, 0, 0);
  if (!src.success) return { error: 'source create failed' };
  
  // 2. Create glslPOP - fresh, will auto-create compute DAT
  const glsl = await client.createOperator('glslPOP', 'glsl_shader', compPath, 250, 0);
  if (!glsl.success) return { error: 'glslPOP create failed' };
  
  // 3. Wait for TD to initialize auto-DAT
  await new Promise(r => setTimeout(r, 500));
  
  // 4. Find the auto-generated compute DAT path
  const cdR = await client.execute('import json\nt = op("' + glsl.path + '")\nprint(json.dumps({"cd":str(t.par.computedat.eval())}))');
  if (!cdR.success) return { error: 'cant read computedat' };
  const cd = JSON.parse(cdR.stdout).cd;
  if (!cd || !cd.startsWith('/')) return { error: 'invalid computedat: ' + cd };
  
  // 5. Set outputattrs to P
  await client.execute('import json\nt = op("' + glsl.path + '")\nt.par.outputattrs = "P"\nprint("ok")');
  
  // 6. Write shader code to the compute DAT
  const w = await client.execute('import json\nt = op("' + cd + '")\nt.text = """' + shaderCode + '"""\nprint(json.dumps({"len":len(t.text)}))');
  if (!w.success) return { error: 'shader write failed' };
  
  // 7. Connect source to glslPOP
  await client.connectNodes(src.path, glsl.path, 0);
  
  // 8. Create nullPOP for output
  const out = await client.createOperator('nullPOP', 'out', compPath, 500, 0);
  if (out.success) await client.connectNodes(glsl.path, out.path, 0);
  
  // 9. Health check
  const h = await client.healthcheck(compPath, true);
  if (!h.ok && h.issues) {
    const errs = h.issues.filter(i => i.path.includes('glsl_shader'));
    if (errs.length > 0) {
      return { error: errs[0].errors || errs[0].warnings || 'unknown' };
    }
  }
  
  return { ok: true, glslPath: glsl.path, computeDat: cd };
}

async function test() {
  console.log('=== CREATING 5 GLSL POP TESTS ===\n');
  
  // Shader 1: Noise displacement via float(id)
  const s1 = [
    'void main() {',
    '    const uint id = TDIndex();',
    '    if(id >= TDNumElements()) return;',
    '    float n = sin(float(id) * 0.5 + P[id].x * 2.0) * 0.3 + 0.3;',
    '    float n2 = cos(float(id) * 0.7 + P[id].y * 3.0) * 0.3 + 0.3;',
    '    P[id] += vec3(n, n2, (n + n2) * 0.5) * 0.4;',
    '}'
  ].join('\n');
  const r1 = await createGLSLTest('glsl_noise', s1);
  console.log('1. glsl_noise:', r1.ok ? 'OK' : 'FAIL - ' + (r1.error || '').substring(0, 200));

  // Shader 2: Sine wave (KNOWN WORKING)
  const s2 = [
    'void main() {',
    '    const uint id = TDIndex();',
    '    if(id >= TDNumElements()) return;',
    '    float d = length(P[id].xy);',
    '    float w = sin(d * 3.0) * 0.3 * exp(-d * 0.3);',
    '    P[id].z += w;',
    '}'
  ].join('\n');
  const r2 = await createGLSLTest('glsl_wave', s2);
  console.log('2. glsl_wave:', r2.ok ? 'OK' : 'FAIL - ' + (r2.error || '').substring(0, 200));

  // Shader 3: Vortex rotation
  const s3 = [
    'void main() {',
    '    const uint id = TDIndex();',
    '    if(id >= TDNumElements()) return;',
    '    float r = length(P[id].xy);',
    '    float a = r * 2.0 + float(id) * 0.01;',
    '    float cr = cos(a * 0.2);',
    '    float sr = sin(a * 0.2);',
    '    float cx = P[id].x * cr - P[id].y * sr;',
    '    float cy = P[id].x * sr + P[id].y * cr;',
    '    P[id] = vec3(cx, cy, P[id].z + sin(r * 3.0 + float(id) * 0.02) * 0.2);',
    '}'
  ].join('\n');
  const r3 = await createGLSLTest('glsl_vortex', s3);
  console.log('3. glsl_vortex:', r3.ok ? 'OK' : 'FAIL - ' + (r3.error || '').substring(0, 200));

  // Shader 4: Multi-noise inline (sin + cos combinations)
  const s4 = [
    'void main() {',
    '    const uint id = TDIndex();',
    '    if(id >= TDNumElements()) return;',
    '    float n1 = sin(P[id].x * 1.5 + float(id) * 0.01) * 0.5 + 0.5;',
    '    float n2 = cos(P[id].y * 2.0 + float(id) * 0.02) * 0.5 + 0.5;',
    '    float n3 = sin(P[id].x * 3.0 + P[id].y * 2.0 + float(id) * 0.03) * 0.5 + 0.5;',
    '    P[id] += vec3(n1 - 0.5, n2 - 0.5, (n3 + n1) * 0.5 - 0.5) * 0.6;',
    '}'
  ].join('\n');
  const r4 = await createGLSLTest('glsl_multinoise', s4);
  console.log('4. glsl_multinoise:', r4.ok ? 'OK' : 'FAIL - ' + (r4.error || '').substring(0, 200));

  // Shader 5: Twist + wave complex deformation
  const s5 = [
    'void main() {',
    '    const uint id = TDIndex();',
    '    if(id >= TDNumElements()) return;',
    '    float r = length(P[id].xy);',
    '    float a = atan(P[id].y, P[id].x);',
    '    float twist = a + r * 2.0 + float(id) * 0.005;',
    '    float cr = cos(twist);',
    '    float sr = sin(twist);',
    '    float cx = P[id].x * cr - P[id].y * sr;',
    '    float cy = P[id].x * sr + P[id].y * cr;',
    '    float wave = sin(r * 4.0 + float(id) * 0.01) * 0.3;',
    '    float spiral = sin(r * 2.0 + a * 3.0 + float(id) * 0.02) * 0.2;',
    '    P[id] = vec3(cx + spiral, cy + spiral * 0.5, P[id].z + wave);',
    '}'
  ].join('\n');
  const r5 = await createGLSLTest('glsl_twist', s5);
  console.log('5. glsl_twist:', r5.ok ? 'OK' : 'FAIL - ' + (r5.error || '').substring(0, 200));

  // Summary
  console.log('\n=== VERIFICATION ===');
  const names = ['glsl_noise', 'glsl_wave', 'glsl_vortex', 'glsl_multinoise', 'glsl_twist'];
  for (const name of names) {
    const detail = await client.getNodeDetail(BASE + '/' + name, true);
    if (detail.success && detail.data?.children) {
      const glslChild = detail.data.children.find(c => c.type === 'glslPOP');
      const hasSource = detail.data.children.some(c => c.name === 'source');
      const hasOut = detail.data.children.some(c => c.name === 'out');
      console.log('  ' + name + ': glslPOP=' + (glslChild ? 'yes' : 'NO') + ' source=' + (hasSource ? 'yes' : 'NO') + ' out=' + (hasOut ? 'yes' : 'NO'));
    }
  }
  
  console.log('\nDONE');
}
test().catch(e => console.log('FATAL:', e.message));
