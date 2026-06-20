import { TDClient } from '../../api/dist/index.js';
const client = new TDClient();

async function test() {
  const freshPath = '/td_tests_container/td_glsl_tests/glsl_basic/fresh_test';
  const computeDat = freshPath + '_compute';
  
  await client.execute('import json\nt = op("' + freshPath + '")\nt.par.outputattrs = "P"\nprint("ok")');
  
  // Test with and without TDTime
  const variants = [
    { name: 'P+=0.01 works (before)', code: 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; P[id] += vec3(0.01); }' },
    { name: 'just sin(TDTime)', code: 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; float x = sin(TDTime()); }' },
    { name: 'P.x += sin(TDTime)', code: 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; P[id].x += sin(TDTime()); }' },
    { name: 'P.x += 0.01 (no func)', code: 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; P[id].x += 0.01; }' },
    { name: 'P.x += sin(1.0)', code: 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; P[id].x += sin(1.0); }' },
    { name: 'P.x += sin(P[id].y)', code: 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; P[id].x += sin(P[id].y); }' },
  ];
  
  for (const v of variants) {
    await client.execute('import json\nt = op("' + computeDat + '")\nt.text = """' + v.code + '"""\nprint("ok")');
    const h = await client.healthcheck(freshPath, false);
    console.log(v.name + ': ' + (h.ok ? 'OK' : 'ERR'));
  }
}
test().catch(e => console.log('ERR:', e.message));
