import { TDClient } from '../../api/dist/index.js';
const client = new TDClient();

async function test() {
  const freshPath = '/td_tests_container/td_glsl_tests/glsl_basic/fresh_test';
  const computeDat = freshPath + '_compute';
  
  await client.execute('import json\nt = op("' + freshPath + '")\nt.par.outputattrs = "P"\nprint("ok")');
  
  const variants = [
    { name: 'uTime via uniform', code: [
      'uniform float uTime;',
      'void main() {',
      '    const uint id = TDIndex();',
      '    if(id >= TDNumElements()) return;',
      '    P[id].x += sin(uTime + P[id].y) * 0.1;',
      '}'
    ].join('\n') },
    { name: 'absTime via uniform', code: [
      'uniform float absTime;',
      'void main() {',
      '    const uint id = TDIndex();',
      '    if(id >= TDNumElements()) return;',
      '    P[id].x += sin(absTime + P[id].y) * 0.1;',
      '}'
    ].join('\n') },
  ];
  
  for (const v of variants) {
    await client.execute('import json\nt = op("' + computeDat + '")\nt.text = """' + v.code + '"""\nprint("ok")');
    const h = await client.healthcheck(freshPath, false);
    console.log(v.name + ': ' + (h.ok ? 'OK' : 'ERR'));
    if (!h.ok && h.issues) console.log('  ' + (h.issues[0]?.errors || '').substring(0, 200));
  }
}
test().catch(e => console.log('ERR:', e.message));
