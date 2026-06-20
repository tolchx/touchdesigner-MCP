import { TDClient } from '../../api/dist/index.js';
const client = new TDClient();

async function test() {
  const freshPath = '/td_tests_container/td_glsl_tests/glsl_basic/fresh_test';
  const computeDat = freshPath + '_compute';
  
  // Get current outputattrs
  const r = await client.execute('import json\nt = op("' + freshPath + '")\nprint(json.dumps({"outputattrs":t.par.outputattrs.eval(),"outputaccess":t.par.outputaccess.eval(),"initoutputattrs":t.par.initoutputattrs.eval()}))');
  console.log('output settings:', r.stdout);
  
  // Set outputattrs to "P" so we can write position
  const setR = await client.execute('import json\nt = op("' + freshPath + '")\nt.par.outputattrs = "P"\nprint(json.dumps({"set":True}))');
  console.log('set outputattrs=P:', setR.success);
  
  // Now try writing P
  const code = [
    'void main() {',
    '    const uint id = TDIndex();',
    '    if(id >= TDNumElements()) return;',
    '    P[id] += vec3(0.01);',
    '}'
  ].join('\n');
  
  const w = await client.execute('import json\nt = op("' + computeDat + '")\nt.text = """' + code + '"""\nprint(json.dumps({"done":True}))');
  console.log('write shader:', w.success);
  
  const h = await client.healthcheck(freshPath, false);
  console.log('health:', h.ok ? 'OK' : 'ERR');
  if (!h.ok && h.issues) console.log('  ' + h.issues[0]?.errors?.substring(0, 300));
  
  // Now try with outputattrs="P Cd" for position + color
  const setR2 = await client.execute('import json\nt = op("' + freshPath + '")\nt.par.outputattrs = "P Cd"\nprint(json.dumps({"set":True}))');
  console.log('set outputattrs=P Cd:', setR2.success);
  
  // Color shader
  const colorCode = [
    'void main() {',
    '    const uint id = TDIndex();',
    '    if(id >= TDNumElements()) return;',
    '    Cd[id] = vec4(0.5 + 0.5 * cos(TDTime() * 0.5 + P[id].xyx + vec3(0,2,4)), 1.0);',
    '}'
  ].join('\n');
  
  const w2 = await client.execute('import json\nt = op("' + computeDat + '")\nt.text = """' + colorCode + '"""\nprint(json.dumps({"done":True}))');
  const h2 = await client.healthcheck(freshPath, false);
  console.log('color shader health:', h2.ok ? 'OK' : 'ERR');
  if (!h2.ok && h2.issues) console.log('  ' + h2.issues[0]?.errors?.substring(0, 300));
}
test().catch(e => console.log('ERR:', e.message));
