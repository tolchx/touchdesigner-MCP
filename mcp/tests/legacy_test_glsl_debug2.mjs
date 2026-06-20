import { TDClient } from '../../api/dist/index.js';
const client = new TDClient();

async function test() {
  const base = '/td_tests_container/td_glsl_tests';
  const comp = 'glsl_color';
  const glsl = base + '/' + comp + '/glsl_shader';
  const src = base + '/' + comp + '/glsl_shader_src';

  // 1. Clear textport
  await client.clearTextport();

  // 2. Write minimal shader
  const code = 'void main() { }';
  await client.execute('import json\nt = op("' + src + '")\nt.text = """' + code + '"""\nprint("ok")');

  // 3. Cook to trigger compile
  await client.execute('t = op("' + glsl + '")\nt.cook(force=True)');

  // 4. Read textport
  const log = await client.readTextport(50);
  console.log('TEXTPORT:', JSON.stringify(log, null, 2));

  // 5. Check computedat and key pars
  const cd = await client.execute('import json\nt = op("' + glsl + '")\nprint(json.dumps({"cd":str(t.par.computedat.eval())}))');
  console.log('computedat:', JSON.parse(cd.stdout));

  // 6. Check all pars
  const pars = await client.execute('import json\nt = op("' + glsl + '")\np = {p.name: str(p.val) for p in t.pars()}\nprint(json.dumps(p))');
  const allPars = JSON.parse(pars.stdout);
  console.log('key pars:', JSON.stringify({
    computedat: allPars.computedat,
    outputattrs: allPars.outputattrs,
    outputaccess: allPars.outputaccess,
    numelems: allPars.numelems,
    attrclass: allPars.attrclass,
    numthreadsmode: allPars.numthreadsmode,
    buildflag: allPars.buildflag,
    bypass: allPars.bypass
  }));
}
test().catch(e => console.log('ERR:', e.message));
