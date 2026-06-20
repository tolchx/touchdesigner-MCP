import { TDClient } from '../../api/dist/index.js';
const client = new TDClient();
const BASE = '/td_tests_container/td_glsl_tests';

async function test() {
  // Check outputattrs on each glslPOP
  for (const name of ['glsl_noise','glsl_wave','glsl_vortex','glsl_multinoise','glsl_twist']) {
    const glslP = BASE + '/' + name + '/glsl_shader';
    const r = await client.execute('import json\nt = op("' + glslP + '")\nprint(json.dumps({"outputattrs":str(t.par.outputattrs.eval()),"computedat":str(t.par.computedat.eval())}))');
    console.log(name + ': ' + r.stdout);
  }
  
  // Now test: does the same shader work on glsl_wave vs glsl_noise?
  console.log('\n=== SAME SHADER ON ALL COMPS ===');
  const code = 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; vec3 pos = TDIn_P(); pos.z += 0.01; P[id] = pos; }';
  
  for (const name of ['glsl_noise','glsl_wave','glsl_vortex','glsl_multinoise','glsl_twist']) {
    const glslP = BASE + '/' + name + '/glsl_shader';
    const cdR = await client.execute('import json\nt = op("' + glslP + '")\nprint(json.dumps({"cd":str(t.par.computedat.eval())}))');
    const cd = JSON.parse(cdR.stdout).cd;
    if (!cd || !cd.startsWith('/')) { console.log(name + ': NO CD'); continue; }
    await client.execute('import json\nt = op("' + cd + '")\nt.text = """' + code + '"""\nprint("ok")');
    await client.connectNodes(BASE + '/' + name + '/source', glslP, 0);
    await client.connectNodes(glslP, BASE + '/' + name + '/out', 0);
    const h = await client.healthcheck(BASE + '/' + name, true);
    const e = h.issues?.filter(i => i.path.includes(name + '/glsl_shader'));
    console.log('  ' + name + ': ' + (h.ok && (!e || e.length === 0) ? 'OK' : 'FAIL'));
  }
}
test().catch(e => console.log('ERR:', e.message));
