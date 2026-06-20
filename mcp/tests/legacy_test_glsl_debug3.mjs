import { TDClient } from '../../api/dist/index.js';
const client = new TDClient();

async function test() {
  const base = '/td_tests_container/td_glsl_tests';
  const comp = 'glsl_color';
  const glsl = base + '/' + comp + '/glsl_shader';
  const src = base + '/' + comp + '/glsl_shader_src';

  // Check computedat
  const cdR = await client.execute('import json\nt = op("' + glsl + '")\nprint(json.dumps({"cd":str(t.par.computedat.eval())}))');
  const cd = JSON.parse(cdR.stdout).cd;
  console.log('computedat:', cd);

  // Read current shader text
  const readSrc = await client.execute('import json\nt = op("' + src + '")\nprint(json.dumps({"text":t.text,"len":len(t.text)}))');
  const srcData = JSON.parse(readSrc.stdout);
  console.log('current shader (' + srcData.len + ' chars):', srcData.text.substring(0, 300));

  // Check if the src DAT needs to be connected differently
  // In TD, glslPOP reads from computedat but maybe needs specific attribute declarations
  const detail = await client.execute('import json\nt = op("' + glsl + '")\npnames = [p.name for p in t.pars()]\nprint(json.dumps(pnames))');
  const allPars = JSON.parse(detail.stdout);
  console.log('all pars:', allPars.join(', '));

  // Check if there's a 'text' parameter we missed
  const textPars = allPars.filter(n => n.includes('text') || n.includes('src') || n.includes('code') || n.includes('compute'));
  console.log('text-related pars:', textPars);

  // Try writing directly to a child DAT of the glslPOP
  // On fresh creation, TD auto-creates <name>_compute
  const autoChild = glsl + '_compute';
  const checkChild = await client.execute('import json\ntry:\n    t = op("' + autoChild + '")\n    print(json.dumps({"exists":True,"text":t.text[:200]}))\nexcept:\n    print(json.dumps({"exists":False}))');
  console.log('auto child ' + autoChild + ':', checkChild.stdout);

  // Also try the read_default_compute that TD created earlier
  const freshChild = base + '/glsl_basic/read_default_compute';
  const checkFresh = await client.execute('import json\ntry:\n    t = op("' + freshChild + '")\n    print(json.dumps({"exists":True,"text":t.text[:500]}))\nexcept:\n    print(json.dumps({"exists":False}))');
  console.log('fresh child:', checkFresh.stdout);
}
test().catch(e => console.log('ERR:', e.message));
