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
  const comp = 'glsl_noise';
  console.log('=== TESTING P= ASSIGN VS += ===\n');
  
  // Key insight: working shaders use P[id] = pos (direct assign to modified var)
  // Failing shaders use P[id] = pos after modifying pos with +=
  // Maybe in this build, P[id] = pos is a FINAL WRITE that can't be done conditionally
  
  const tests = [
    { n: 'P = pos + vec3(0.01)', c: 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; vec3 pos = TDIn_P(); P[id] = pos + vec3(0.01); }' },
    { n: 'P = pos + vec3(sin(id))', c: 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; vec3 pos = TDIn_P(); P[id] = pos + vec3(sin(float(id)*0.5)*0.1); }' },
    { n: 'P[id] = pos + noise', c: 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; vec3 pos = TDIn_P(); float n = sin(float(id)*0.5+pos.x*2.0)*0.3+0.3; float n2 = cos(float(id)*0.7+pos.y*3.0)*0.3+0.3; P[id] = pos + vec3(n,n2,(n+n2)*0.5)*0.4; }' },
    { n: 'test raw sin + assign', c: 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; vec3 pos = TDIn_P(); P[id] = vec3(pos.x + sin(pos.y)*0.1, pos.y, pos.z); }' },
    { n: 'test raw sin + P=', c: 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; vec3 pos = TDIn_P(); float n = sin(pos.y * 2.0) * 0.1; P[id] = vec3(pos.x + n, pos.y, pos.z); }' },
  ];

  for (const t of tests) {
    const r = await testShader(comp, t.c);
    console.log(t.n + ': ' + r);
  }
}
test().catch(e => console.log('ERR:', e.message));
