import { TDClient } from '../../api/dist/index.js';
const client = new TDClient();
const BASE = '/td_tests_container/td_glsl_tests';

async function setupCOMP(name, y) {
  const compPath = BASE + '/' + name;
  await client.createOperator('spherePOP', 'source', compPath, 0, 0);
  await client.createOperator('nullPOP', 'out', compPath, 500, 0);
  const g = await client.createOperator('glslPOP', 'glsl_shader', compPath, 250, 0);
  await new Promise(r => setTimeout(r, 600));
  const r = await client.execute('import json\nt = op("' + compPath + '/glsl_shader")\nprint(json.dumps({"cd":str(t.par.computedat.eval())}))');
  const d = JSON.parse(r.stdout);
  return d.cd;
}

async function writeGLSL(comp, code) {
  const glslP = BASE + '/' + comp + '/glsl_shader';
  const cdR = await client.execute('import json\nt = op("' + glslP + '")\nprint(json.dumps({"cd":str(t.par.computedat.eval())}))');
  const cd = JSON.parse(cdR.stdout).cd;
  await client.execute('import json\nt = op("' + glslP + '")\nt.par.outputattrs = "P"\nprint("ok")');
  if (!cd || !cd.startsWith('/')) return 'NO_CD';
  await client.execute('import json\nt = op("' + cd + '")\nt.text = """' + code + '"""\nprint("ok")');
  await client.connectNodes(BASE + '/' + comp + '/source', glslP, 0);
  await client.connectNodes(glslP, BASE + '/' + comp + '/out', 0);
  const h = await client.healthcheck(BASE + '/' + comp, true);
  const e = h.issues?.filter(i => i.path.includes(comp + '/glsl_shader'));
  return (h.ok && (!e || e.length === 0)) ? 'OK' : 'FAIL';
}

async function test() {
  console.log('=== SETTING UP 5 GLSL TESTS ===\n');
  for (const name of ['glsl_noise','glsl_wave','glsl_vortex','glsl_multinoise','glsl_twist']) {
    const cd = await setupCOMP(name, 0);
    console.log('  ' + name + ': ' + (cd && cd.startsWith('/') ? 'CD=' + cd : 'NO_CD'));
  }

  console.log('\n=== WRITING SHADERS ===\n');

  const s1 = [
    'float hash(vec3 p) { return sin(p.x*12.9898 + p.y*78.233 + p.z*45.5432) * 43758.5453; }',
    'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; vec3 pos = TDIn_P(); float n = hash(pos + float(id) * 0.1); P[id] = pos + vec3(n) * 0.3; }'
  ].join('\n');
  console.log('noise:', await writeGLSL('glsl_noise', s1));

  const s2 = 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; vec3 pos = TDIn_P(); float d = length(pos.xy); pos.z += sin(d * 3.0) * 0.3 * exp(-d * 0.3); P[id] = pos; }';
  console.log('wave:', await writeGLSL('glsl_wave', s2));

  const s3 = [
    'vec2 rot(vec2 p, float a) { float c=cos(a); float s=sin(a); return vec2(p.x*c-p.y*s, p.x*s+p.y*c); }',
    'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; vec3 pos = TDIn_P(); float r = length(pos.xy); pos.xy = rot(pos.xy, r*0.5); pos.z += sin(r*3.0)*0.2; P[id] = pos; }'
  ].join('\n');
  console.log('vortex:', await writeGLSL('glsl_vortex', s3));

  const s4 = [
    'float n2(vec3 p) { return sin(p.x*12.9898)*sin(p.y*78.233)*sin(p.z*45.5432); }',
    'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; vec3 pos = TDIn_P(); float n1=n2(pos*1.5+float(id)*0.01); float n2=n2(pos*3.0+float(id)*0.02); float n3=n2(pos*2.0+float(id)*0.03); P[id] = pos+vec3(n1-0.5,n2-0.5,(n3+n1)*0.5-0.5)*0.6; }'
  ].join('\n');
  console.log('multinoise:', await writeGLSL('glsl_multinoise', s4));

  const s5 = [
    'vec2 rot(vec2 p, float a) { float c=cos(a); float s=sin(a); return vec2(p.x*c-p.y*s, p.x*s+p.y*c); }',
    'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; vec3 pos = TDIn_P(); float r = length(pos.xy); float a = atan(pos.y, pos.x); pos.xy = rot(pos.xy, a+r*0.5); pos.z += sin(r*3.0+float(id)*0.01)*0.2; P[id] = pos; }'
  ].join('\n');
  console.log('twist:', await writeGLSL('glsl_twist', s5));

  console.log('\n=== VERIFICACION ===');
  for (const name of ['glsl_noise','glsl_wave','glsl_vortex','glsl_multinoise','glsl_twist']) {
    const h = await client.healthcheck(BASE + '/' + name, true);
    const e = h.issues?.filter(i => i.path.includes(name + '/glsl_shader'));
    console.log('  ' + name + ': ' + (h.ok && (!e || e.length === 0) ? 'OK' : 'FAIL'));
  }
  console.log('\nDONE');
}
test().catch(e => console.log('FATAL:', e.message));
