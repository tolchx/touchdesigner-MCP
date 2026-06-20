import { TDClient } from '../../api/dist/index.js';
const client = new TDClient();

async function test() {
  const freshPath = '/td_tests_container/td_glsl_tests/glsl_basic/fresh_test';
  const computeDat = freshPath + '_compute';
  
  // Check correct parameter names
  const r = await client.execute('import json\nt = op("' + freshPath + '")\npnames = [p.name for p in t.pars() if "ptoutput" in p.name or "outputattr" in p.name or "pointoutput" in p.name]\nprint(json.dumps(pnames))');
  console.log('output attr pars:', r.stdout);
  
  // Try ptoutputattrs
  const r2 = await client.execute('import json\nt = op("' + freshPath + '")\nprint(json.dumps({"ptoutputattrs":str(t.par.ptoutputattrs.eval()),"outputattrs":str(t.par.outputattrs.eval())}))');
  console.log('values:', r2.stdout);
  
  // Set ptoutputattrs to P
  await client.execute('import json\nt = op("' + freshPath + '")\nt.par.ptoutputattrs = "P"\nprint("ok")');
  
  // Now test with sin(TDTime) again
  const code = 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; P[id].x += sin(float(id)) * 0.01; }';
  await client.execute('import json\nt = op("' + computeDat + '")\nt.text = """' + code + '"""\nprint("ok")');
  
  const h = await client.healthcheck(freshPath, false);
  console.log('shader with ptoutputattrs=P:', h.ok ? 'OK' : 'ERR');
}
test().catch(e => console.log('ERR:', e.message));
