import { TDClient } from '../../api/dist/index.js';
const client = new TDClient();
const BASE = '/td_tests_container/td_glsl_tests';

async function testShader(comp, code) {
  const glslP = BASE + '/' + comp + '/glsl_shader';
  const cdR = await client.execute('import json\nt = op("' + glslP + '")\nprint(json.dumps({"cd":str(t.par.computedat.eval())}))');
  const cd = JSON.parse(cdR.stdout).cd;
  await client.execute('import json\nt = op("' + glslP + '")\nt.par.outputattrs = "P"\nprint("ok")');
  await client.execute('import json\nt = op("' + cd + '")\nt.text = """' + code + '"""\nprint("ok")');
  await client.connectNodes(BASE + '/' + comp + '/source', glslP, 0);
  await client.connectNodes(glslP, BASE + '/' + comp + '/out', 0);
  const h = await client.healthcheck(BASE + '/' + comp, true);
  const e = h.issues?.filter(i => i.path.includes(comp + '/glsl_shader'));
  return (h.ok && (!e || e.length === 0)) ? 'OK' : 'FAIL';
}

async function test() {
  console.log('=== TESTING NOISE WITHOUT USER FUNCTIONS ===\n');
  const comp = 'glsl_noise';

  const tests = [
    { n: 'noise inline sin', c: 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; vec3 pos = TDIn_P(); float n = sin(pos.x*12.9898+pos.y*78.233+pos.z*45.5432)*43758.5453; n = fract(n); P[id] = pos + vec3(n)*0.3; }' },
    { n: 'noise via float(id)', c: 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; vec3 pos = TDIn_P(); float n = sin(float(id)*0.5+pos.x*2.0)*0.3+0.3; P[id] = pos + vec3(n)*0.4; }' },
    { n: 'noise multi-freq inline', c: 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; vec3 pos = TDIn_P(); float n1 = sin(float(id)*0.5+pos.x*2.0)*0.3+0.3; float n2 = cos(float(id)*0.7+pos.y*3.0)*0.3+0.3; P[id] = pos + vec3(n1,n2,(n1+n2)*0.5)*0.4; }' },
  ];

  for (const t of tests) {
    const r = await testShader(comp, t.c);
    console.log(t.n + ': ' + r);
  }

  // For multinoise
  console.log('\n=== multinoise WITHOUT USER FUNCTIONS ===\n');
  const comp2 = 'glsl_multinoise';
  
  const tests2 = [
    { n: 'inline multi-sin', c: 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; vec3 pos = TDIn_P(); float n1 = sin(pos.x*1.5+float(id)*0.01)*0.5+0.5; float n2 = cos(pos.y*2.0+float(id)*0.02)*0.5+0.5; float n3 = sin(pos.x*3.0+pos.y*2.0+float(id)*0.03)*0.5+0.5; P[id] = pos+vec3(n1-0.5,n2-0.5,(n3+n1)*0.5-0.5)*0.6; }' },
  ];

  for (const t of tests2) {
    const r = await testShader(comp2, t.c);
    console.log(t.n + ': ' + r);
  }
}
test().catch(e => console.log('ERR:', e.message));
