import { TDClient } from '../../api/dist/index.js';
const client = new TDClient();

async function test() {
  const glsl = '/td_tests_container/td_glsl_tests/glsl_basic/glsl_shader';
  
  // Check the 'numthreadsmode' parameter and other mode settings
  const pars = await client.execute('import json\nt = op("' + glsl + '")\npinfo = [{"n":p.name,"v":str(p.val),"l":p.label} for p in t.pars() if p.name in ["numthreadsmode","outputattrs","outputaccess","numelems","initoutputattrs","prevpassoutput"] or "mode" in p.name or "type" in p.name]\nprint(json.dumps(pinfo))');
  console.log('mode pars:', pars.stdout);
  
  // List ALL parameters to understand what glslPOP in this build expects
  const allPars = await client.execute('import json\nt = op("' + glsl + '")\nprint(json.dumps([p.name+"="+str(p.val)[:40] for p in t.pars()]))');
  const parList = JSON.parse(allPars.stdout);
  console.log('ALL pars count:', parList.length);
  console.log('Sample:', parList.slice(0, 10));
  
  // Find the default shader code - maybe looking at an existing glslPOP that works
  // Create a fresh glslPOP WITHOUT computedat, then read its default code
  const freshGlsl = await client.execute('import json\nt = op("' + '/td_tests_container/td_glsl_tests/glsl_basic' + '")\nfresh = t.create(glslPOP, "test_default")\n# Wait for it to initialize\nimport time\ntime.sleep(1)\nprint(json.dumps({"path":fresh.path}))');
  console.log('fresh glslPOP:', freshGlsl.stdout);
  
  if (freshGlsl.success) {
    const freshPath = JSON.parse(freshGlsl.stdout).path;
    // Check its children
    const fc = await client.execute('import json\nt = op("' + freshPath + '")\nchildren = [{"n":c.name,"t":c.OPType,"p":c.path} for c in t.children]\nprint(json.dumps(children))');
    console.log('fresh children:', fc.stdout);
    
    // Check its numelevals
    const fp = await client.execute('import json\nt = op("' + freshPath + '")\nprint(json.dumps({"numelems":str(t.par.numelems.eval())[:50],"outputattrs":t.par.outputattrs.eval()[:100],"attrclass":t.par.attrclass.eval()}))');
    console.log('fresh pars:', fp.stdout);
  }
}
test().catch(e => console.log('ERR:', e.message));
