import { TDClient } from '../../api/dist/index.js';
const client = new TDClient();

async function test() {
  const freshPath = '/td_tests_container/td_glsl_tests/glsl_basic/fresh_test';
  const computeDat = freshPath + '_compute';
  
  await client.execute('import json\nt = op("' + freshPath + '")\nt.par.outputattrs = "Cd"\nprint("ok")');
  
  const code = [
    'void main() {',
    '    const uint id = TDIndex();',
    '    if(id >= TDNumElements()) return;',
    '    Cd[id] = vec4(1.0, 0.0, 0.0, 1.0);',
    '}'
  ].join('\n');
  
  await client.execute('import json\nt = op("' + computeDat + '")\nt.text = """' + code + '"""\nprint("ok")');
  const h = await client.healthcheck(freshPath, false);
  console.log('Cd only with outputattrs=Cd:', h.ok ? 'OK' : 'ERR');
  if (!h.ok && h.issues) console.log('  ' + (h.issues[0]?.errors || '').substring(0, 300));
  
  // Also try with P AND Cd in outputattrs
  await client.execute('import json\nt = op("' + freshPath + '")\nt.par.outputattrs = "P Cd"\nprint("ok")');
  
  const code2 = [
    'void main() {',
    '    const uint id = TDIndex();',
    '    if(id >= TDNumElements()) return;',
    '    float y = P[id].y;',
    '    P[id].x += sin(y * 2.0) * 0.1;',
    '    float x = P[id].x;',
    '    P[id].y += cos(x * 2.0) * 0.1;',
    '    Cd[id] = vec4(0.5 + 0.5 * sin(P[id].x), 0.2, 0.8, 1.0);',
    '}'
  ].join('\n');
  
  await client.execute('import json\nt = op("' + computeDat + '")\nt.text = """' + code2 + '"""\nprint("ok")');
  const h2 = await client.healthcheck(freshPath, false);
  console.log('P+Cd with outputattrs=P Cd:', h2.ok ? 'OK' : 'ERR');
  if (!h2.ok && h2.issues) console.log('  ' + (h2.issues[0]?.errors || '').substring(0, 300));
}
test().catch(e => console.log('ERR:', e.message));
