import { TDClient } from '../../api/dist/index.js';
const client = new TDClient();

async function test() {
  const freshPath = '/td_tests_container/td_glsl_tests/glsl_basic/fresh_test';
  const computeDat = freshPath + '_compute';
  
  await client.execute('import json\nt = op("' + freshPath + '")\nt.par.outputattrs = "P"\nprint("ok")');

  // Isolate the exact failing pattern
  const tests = [
    { name: 'sin(P[id].x)', code: 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; float n = sin(P[id].x); P[id].x += n * 0.01; }' },
    { name: 'sin(P.x)', code: 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; float n = sin(P[id].x); P[id].x += n * 0.01; }' },
    { name: 'P.x + sin(P.y)', code: 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; float t = P[id].y; P[id].x += sin(t) * 0.01; }' },
    { name: 'extract_y first', code: 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; float y = P[id].y; float n = sin(y * 2.0) * 0.5 + 0.5; P[id] += vec3(n) * 0.2; }' },
  ];
  
  for (const t of tests) {
    await client.execute('import json\nt = op("' + computeDat + '")\nt.text = """' + t.code + '"""\nprint("ok")');
    const h = await client.healthcheck(freshPath, false);
    console.log(t.name + ': ' + (h.ok ? 'OK' : 'ERR'));
    if (!h.ok && h.issues) console.log('  ' + (h.issues[0]?.errors || '').substring(0, 300));
  }
}
test().catch(e => console.log('ERR:', e.message));
