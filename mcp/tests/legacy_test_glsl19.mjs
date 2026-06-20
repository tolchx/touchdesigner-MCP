import { TDClient } from '../../api/dist/index.js';
const client = new TDClient();

async function test() {
  const base = '/td_tests_container/td_glsl_tests/glsl_basic';
  const glsl = base + '/glsl_shader';
  
  // Find the correct compute DAT
  const r = await client.execute('import json\nt = op("' + glsl + '")\nprint(json.dumps({"cd":str(t.par.computedat.eval())[:200]}))');
  const cd = JSON.parse(r.stdout).cd;
  console.log('computedat:', cd);
  
  // Write the EXACT default shader that TD generates
  const defaultShader = [
    'void main() {',
    '\tconst uint id = TDIndex();',
    '\tif(id >= TDNumElements())',
    '\t\treturn;',
    '\t\t',
    '\t//P[id] = TDIn_P(); //same as TDIn_P(0, TDIndex());',
    '}'
  ].join('\n');
  
  const w = await client.execute('import json\nt = op("' + cd + '")\nt.text = """' + defaultShader + '"""\nprint(json.dumps({"len":len(t.text)}))');
  console.log('write default shader:', w.success);
  
  const h = await client.healthcheck(base, true);
  console.log('health after default:', h.ok ? 'OK' : 'ISSUES');
  if (!h.ok && h.issues) {
    for (const i of h.issues) {
      console.log('  ' + i.path + ': ' + (i.errors || '').substring(0, 300));
    }
  }
}
test().catch(e => console.log('ERR:', e.message));
